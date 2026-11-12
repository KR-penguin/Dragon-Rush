import { DEFAULT_RULES, JOB_IDS, type JobId } from '@dragon-rush/engine';
import { createCombatBot, type BotStyle } from '../src/bots/combatBot';
import { DEFAULT_COMBAT_RULES, type CombatRules } from '../src/rules';
import { runCombat } from '../src/runner';
import type { CombatSetup, FighterSetup } from '../src/types';

/** Shared calibration helpers (used by the balance test and scripts/calibrate.ts). */

export const JOBS: readonly JobId[] = JOB_IDS;

export function baseFighter(
  job: JobId,
  extra: Partial<Pick<FighterSetup, 'atk' | 'def' | 'maxHp'>> = {},
): FighterSetup {
  const j = DEFAULT_RULES.jobs[job];
  const maxHp = j.hp + (extra.maxHp ?? 0);
  return {
    job,
    hp: maxHp,
    maxHp,
    atk: j.atk + (extra.atk ?? 0),
    def: j.def + (extra.def ?? 0),
    indomitableAvailable: true,
  };
}

/** Spends `coins` on board upgrades round-robin atk -> def -> maxHp with the §7 escalating costs. */
export function boughtFighter(job: JobId, coins: number): FighterSetup {
  const up = DEFAULT_RULES.upgrades;
  const lvl = { atk: 0, def: 0, maxHp: 0 };
  let left = coins;
  const order = ['atk', 'def', 'maxHp'] as const;
  for (let i = 0, stuck = 0; stuck < 3; i++) {
    const stat = order[i % 3]!;
    const cost = up[stat].baseCost + lvl[stat] * up[stat].costStep;
    if (cost > left) {
      stuck += 1;
      continue;
    }
    stuck = 0;
    left -= cost;
    lvl[stat] += 1;
  }
  return baseFighter(job, { atk: lvl.atk, def: lvl.def, maxHp: lvl.maxHp * up.maxHp.amount });
}

export function statFighter(job: JobId, hp: number, atk: number, def: number): FighterSetup {
  return { job, hp, maxHp: hp, atk, def, indomitableAvailable: true };
}

export interface DuelStats {
  readonly n: number;
  readonly winsA: number;
  readonly ticks: number[];
  readonly timeouts: number;
}

export function duelSeries(
  a: FighterSetup,
  b: FighterSetup,
  n: number,
  seed0: number,
  style: BotStyle = 'balanced',
  rules: CombatRules = DEFAULT_COMBAT_RULES,
  styleB: BotStyle = style,
): DuelStats {
  const pa = createCombatBot(style);
  const pb = createCombatBot(styleB);
  let winsA = 0;
  let timeouts = 0;
  const ticks: number[] = [];
  for (let i = 0; i < n; i++) {
    const setup: CombatSetup = { kind: 'duel', a, b };
    const out = runCombat(setup, [pa, pb], seed0 + i, rules);
    if (out.result.winner === 'a') winsA += 1;
    if (out.result.timedOut) timeouts += 1;
    ticks.push(out.ticks);
  }
  return { n, winsA, ticks, timeouts };
}

export function dragonSeries(
  a: FighterSetup,
  n: number,
  seed0: number,
  style: BotStyle = 'balanced',
  rules: CombatRules = DEFAULT_COMBAT_RULES,
): DuelStats {
  const pa = createCombatBot(style);
  const d = DEFAULT_RULES.dragon;
  let winsA = 0;
  let timeouts = 0;
  const ticks: number[] = [];
  for (let i = 0; i < n; i++) {
    const out = runCombat(
      { kind: 'dragonFight', a, b: null, dragon: { hp: d.hp, atk: d.atk, def: d.def } },
      [pa],
      seed0 + i,
      rules,
    );
    if (out.result.winner === 'a') winsA += 1;
    if (out.result.timedOut) timeouts += 1;
    ticks.push(out.ticks);
  }
  return { n, winsA, ticks, timeouts };
}

/** Win rate of job i against job j with both side assignments (removes the arriver-side bias). */
export function pairRate(
  i: JobId,
  j: JobId,
  n: number,
  seed0: number,
  style: BotStyle = 'balanced',
  rules?: CombatRules,
): number {
  const half = Math.max(1, Math.floor(n / 2));
  const asA = duelSeries(baseFighter(i), baseFighter(j), half, seed0, style, rules);
  const asB = duelSeries(baseFighter(j), baseFighter(i), half, seed0 + 100_000, style, rules);
  return (asA.winsA + (asB.n - asB.winsA)) / (asA.n + asB.n);
}

/** Win rate of an upgraded fighter against the base version of the same job, both sides. */
export function upgradeRate(
  job: JobId,
  extra: Partial<Pick<FighterSetup, 'atk' | 'def' | 'maxHp'>>,
  n: number,
  seed0: number,
  rules?: CombatRules,
): number {
  const half = Math.max(1, Math.floor(n / 2));
  const asA = duelSeries(baseFighter(job, extra), baseFighter(job), half, seed0, 'balanced', rules);
  const asB = duelSeries(
    baseFighter(job),
    baseFighter(job, extra),
    half,
    seed0 + 100_000,
    'balanced',
    rules,
  );
  return (asA.winsA + (asB.n - asB.winsA)) / (asA.n + asB.n);
}

export function quantile(xs: readonly number[], q: number): number {
  const s = [...xs].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
}

export function mean(xs: readonly number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
