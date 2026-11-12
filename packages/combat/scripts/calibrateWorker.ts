import { parentPort, workerData } from 'node:worker_threads';
import {
  createCombatBot,
  DEFAULT_COMBAT_RULES,
  runCombat,
  type BotStyle,
  type CombatRules,
  type CombatSetup,
} from '../src/index';

export interface Task {
  readonly key: string;
  readonly setup: CombatSetup;
  readonly seed0: number;
  readonly n: number;
  readonly styleA: BotStyle;
  readonly styleB: BotStyle;
  readonly reaction?: 5 | 10 | 16 | 'pooled';
}

export interface TaskResult {
  readonly key: string;
  readonly winsA: number;
  readonly ticks: number[];
  readonly timeouts: number;
  readonly ms: number;
}

type Json = Record<string, unknown>;

/** Every move id (and its hit object) owned by a job: the attack string, draw shots, skill, counter, dash contact. */
function jobHits(rules: Json, job: string): Json[] {
  const kit = (rules.jobs as Json)[job] as Json;
  const moves = rules.moves as Json;
  const out: Json[] = [];
  const seen = new Set<string>();
  const visit = (id: unknown): void => {
    if (typeof id !== 'string' || seen.has(id)) return;
    seen.add(id);
    const m = moves[id] as Json | undefined;
    if (!m) return;
    if (m.hit) out.push(m.hit as Json);
    if (m.projectile) out.push((m.projectile as Json).hit as Json);
    visit(m.next);
    visit(m.quick);
    visit(m.full);
    visit(m.counter);
  };
  visit(kit.attack);
  visit(kit.skill);
  const dash = (rules.dashes as Json)[kit.dash as string] as Json;
  if (dash.contact) out.push(dash.contact as Json);
  return out;
}

/**
 * Applies `a.b.c=value` overrides to a JSON copy of the rules (calibration sweeps only).
 * `jobpower.<job>=<x>` scales every hit power of that job's kit (rounded to integer percent).
 */
export function patchRules(base: CombatRules, sets: readonly string[]): CombatRules {
  const rules = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  for (const s of sets) {
    const eq = s.indexOf('=');
    if (s.startsWith('jobpower.')) {
      const x = Number(s.slice(eq + 1));
      for (const h of jobHits(rules, s.slice('jobpower.'.length, eq)))
        h.power = Math.round((h.power as number) * x);
      continue;
    }
    const path = s.slice(0, eq).split('.');
    const value = JSON.parse(s.slice(eq + 1)) as unknown;
    let o = rules;
    for (const k of path.slice(0, -1)) o = o[k] as Record<string, unknown>;
    o[path[path.length - 1]!] = value;
  }
  return rules as unknown as CombatRules;
}

if (parentPort) {
  const { tasks, sets } = workerData as { tasks: Task[]; sets: string[] };
  const rules = sets.length > 0 ? patchRules(DEFAULT_COMBAT_RULES, sets) : DEFAULT_COMBAT_RULES;
  const out: TaskResult[] = [];
  for (const t of tasks) {
    const bots = [5, 10, 16].map(
      (reaction) =>
        [createCombatBot(t.styleA, { reaction }), createCombatBot(t.styleB, { reaction })] as const,
    );
    let winsA = 0;
    let timeouts = 0;
    const ticks: number[] = [];
    const t0 = performance.now();
    for (let i = 0; i < t.n; i++) {
      const reaction = t.reaction === 'pooled' ? (i % 2 === 0 ? 10 : 16) : (t.reaction ?? 10);
      const policies = bots[reaction === 5 ? 0 : reaction === 10 ? 1 : 2]!;
      const r = runCombat(t.setup, policies, t.seed0 + i, rules);
      if (r.result.winner === 'a') winsA += 1;
      if (r.result.timedOut) timeouts += 1;
      ticks.push(r.ticks);
    }
    out.push({ key: t.key, winsA, ticks, timeouts, ms: performance.now() - t0 });
  }
  parentPort.postMessage(out);
}
