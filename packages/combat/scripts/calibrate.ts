/**
 * Bot-vs-bot calibration report for DEFAULT_COMBAT_RULES (worker threads).
 *   pnpm --filter @dragon-rush/combat calibrate [matrix,stats,dragon,bench | all] [--n 200] [--style balanced]
 *        [--set damage.dragonDamageTakenScale=0.8 ...]   (rule overrides for sweeps)
 */
import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { DEFAULT_RULES, type JobId } from '@dragon-rush/engine';
import { baseFighter, boughtFighter, JOBS, mean, quantile, statFighter } from '../test/calibration';
import {
  createCombat,
  createCombatBot,
  DEFAULT_COMBAT_RULES,
  runCombat,
  stepCombat,
  type BotStyle,
  type CombatSetup,
  type FighterInput,
  type FighterSetup,
} from '../src/index';
import type { Task, TaskResult } from './calibrateWorker';

const args = process.argv.slice(2);
const flag = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? def) : def;
};
const sets: string[] = [];
args.forEach((a, i) => {
  if (a === '--set' && args[i + 1]) sets.push(args[i + 1]!);
});
const positional = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const sections = new Set((positional[0] ?? 'all').split(','));
const want = (s: string): boolean => sections.has('all') || sections.has(s);
const N = Number(flag('n', '200'));
const style = flag('style', 'balanced') as BotStyle;
const reaction = flag('reaction', 'pooled') as Task['reaction'];
const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;
const wilson = (wins: number, n: number): string => {
  const z2 = 3.841459;
  const p = wins / n;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (1.96 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return `${(100 * p).toFixed(1)}% [${(100 * (centre - half)).toFixed(1)}, ${(100 * (centre + half)).toFixed(1)}]`;
};
const sec = (t: number): string => (t / 60).toFixed(1);
const dragonStats = {
  hp: DEFAULT_RULES.dragon.hp,
  atk: DEFAULT_RULES.dragon.atk,
  def: DEFAULT_RULES.dragon.def,
};

const duel = (a: FighterSetup, b: FighterSetup): CombatSetup => ({ kind: 'duel', a, b });
const vsDragon = (a: FighterSetup): CombatSetup => ({
  kind: 'dragonFight',
  a,
  b: null,
  dragon: dragonStats,
});

const tasks: Task[] = [];
const add = (key: string, setup: CombatSetup, n: number, seed0: number): void => {
  tasks.push({ key, setup, n, seed0, styleA: style, styleB: style, reaction });
};

const UPGRADES: readonly [string, Partial<Pick<FighterSetup, 'atk' | 'def' | 'maxHp'>>][] = [
  ['+3 ATK', { atk: 3 }],
  ['+3 DEF', { def: 3 }],
  ['+18 HP', { maxHp: 18 }],
];
const DRAGON_BUILDS: readonly [string, (j: JobId) => FighterSetup][] = [
  ['base', (j) => baseFighter(j)],
  ['A9/D8/HP70', (j) => statFighter(j, 70, 9, 8)],
  ['A10/D9/HP72', (j) => statFighter(j, 72, 10, 9)],
  ['A11/D10/HP80', (j) => statFighter(j, 80, 11, 10)],
  ['60 coins', (j) => boughtFighter(j, 60)],
  ['80 coins', (j) => boughtFighter(j, 80)],
];

if (want('matrix')) {
  for (const i of JOBS)
    for (const j of JOBS) add(`p:${i}:${j}`, duel(baseFighter(i), baseFighter(j)), N, 1);
}
if (want('stats')) {
  for (const j of JOBS)
    for (const [name, up] of UPGRADES) {
      add(`u:${j}:${name}:A`, duel(baseFighter(j, up), baseFighter(j)), N / 2, 11);
      add(`u:${j}:${name}:B`, duel(baseFighter(j), baseFighter(j, up)), N / 2, 211);
    }
}
if (want('dragon')) {
  for (const j of JOBS)
    for (const [name, f] of DRAGON_BUILDS) add(`d:${j}:${name}`, vsDragon(f(j)), N, 31);
}

async function runTasks(): Promise<Map<string, TaskResult>> {
  const workers = Math.max(1, Math.min(cpus().length - 2, tasks.length));
  const buckets: Task[][] = Array.from({ length: workers }, () => []);
  tasks.forEach((t, i) => buckets[i % workers]!.push(t));
  const url = new URL('./calibrateWorker.ts', import.meta.url);
  const results = await Promise.all(
    buckets.map(
      (b) =>
        new Promise<TaskResult[]>((resolve, reject) => {
          const w = new Worker(url, {
            workerData: { tasks: b, sets },
            execArgv: ['--import', 'tsx'],
          });
          w.once('message', (m: TaskResult[]) => resolve(m));
          w.once('error', reject);
        }),
    ),
  );
  return new Map(results.flat().map((r) => [r.key, r]));
}

function bench(): void {
  console.log('\n## Timing (single thread)');
  const bot = createCombatBot('balanced');
  let ticks = 0;
  let fights = 0;
  const t0 = performance.now();
  for (const i of JOBS)
    for (const j of JOBS)
      for (let s = 0; s < 20; s++) {
        ticks += runCombat(duel(baseFighter(i), baseFighter(j)), [bot, bot], 900 + s).ticks;
        fights += 1;
      }
  const t1 = performance.now();
  console.log(
    `runCombat duel, 2 bots: ${((t1 - t0) / fights).toFixed(2)} ms/fight, ${(((t1 - t0) * 1000) / ticks).toFixed(2)} µs/tick (avg fight ${sec(ticks / fights)} s)`,
  );
  let dt = 0;
  let dticks = 0;
  for (const j of JOBS)
    for (let s = 0; s < 20; s++) {
      const d0 = performance.now();
      dticks += runCombat(vsDragon(statFighter(j, 70, 9, 8)), [bot], 500 + s).ticks;
      dt += performance.now() - d0;
    }
  console.log(
    `runCombat dragon, 1 bot: ${(dt / 100).toFixed(2)} ms/fight, ${((dt * 1000) / dticks).toFixed(2)} µs/tick (avg fight ${sec(dticks / 100)} s)`,
  );
  const inputs: [FighterInput, FighterInput][] = [];
  for (let t = 0; t < 900; t++) {
    inputs.push([
      {
        move: ((t >> 4) % 9) as FighterInput['move'],
        attack: (t & 15) < 8,
        skill: t % 97 === 0,
        dash: t % 131 === 0,
      },
      {
        move: ((t >> 5) % 9) as FighterInput['move'],
        attack: (t & 7) < 2,
        skill: t % 113 === 0,
        dash: t % 89 === 0,
      },
    ]);
  }
  let steps = 0;
  const s0 = performance.now();
  for (let rep = 0; rep < 40; rep++) {
    let st = createCombat(duel(baseFighter('archer'), baseFighter('berserker')), 3 + rep);
    for (const inp of inputs) {
      if (st.outcome) break;
      st = stepCombat(st, inp).state;
      steps += 1;
    }
  }
  const s1 = performance.now();
  console.log(
    `stepCombat (copy-on-write, scripted inputs, incl. clone): ${(((s1 - s0) * 1000) / steps).toFixed(2)} µs/tick`,
  );
}

async function main(): Promise<void> {
  if (sets.length) console.log(`overrides: ${sets.join(' ')}`);
  console.log(
    `rules ${DEFAULT_COMBAT_RULES.version}, bots ${style}, reaction ${reaction}, n=${N} per orientation`,
  );
  const t0 = performance.now();
  const r = tasks.length ? await runTasks() : new Map<string, TaskResult>();
  const W = (k: string): TaskResult => {
    const x = r.get(k);
    if (!x) throw new Error(`missing ${k}`);
    return x;
  };
  if (want('matrix')) {
    console.log(
      `\n## Duel matrix: row job's win rate vs column job (both sides averaged; diagonal = side a in the mirror)`,
    );
    console.log('| | ' + JOBS.join(' | ') + ' |');
    console.log('|---|' + JOBS.map(() => '---').join('|') + '|');
    const all: number[] = [];
    let timeouts = 0;
    let fights = 0;
    for (const i of JOBS) {
      const cells = JOBS.map((j) => {
        const ij = W(`p:${i}:${j}`);
        all.push(...ij.ticks);
        timeouts += ij.timeouts;
        fights += ij.ticks.length;
        if (i === j) return `${wilson(ij.winsA, ij.ticks.length)} (a)`;
        const ji = W(`p:${j}:${i}`);
        return wilson(ij.winsA + (ji.ticks.length - ji.winsA), ij.ticks.length + ji.ticks.length);
      });
      console.log(`| ${i} | ${cells.join(' | ')} |`);
    }
    console.log(
      `\nDuel length (s): mean ${sec(mean(all))}, p10 ${sec(quantile(all, 0.1))}, median ${sec(quantile(all, 0.5))}, p90 ${sec(quantile(all, 0.9))}; timeouts ${pct(timeouts / fights)}`,
    );
  }
  if (want('stats')) {
    console.log('\n## Upgraded fighter vs the same job at base stats (both sides)');
    console.log('| job | ' + UPGRADES.map((u) => u[0]).join(' | ') + ' |');
    console.log('|---|---|---|---|');
    for (const j of JOBS) {
      const cells = UPGRADES.map(([name]) => {
        const a = W(`u:${j}:${name}:A`);
        const b = W(`u:${j}:${name}:B`);
        return pct((a.winsA + (b.ticks.length - b.winsA)) / (a.ticks.length + b.ticks.length));
      });
      console.log(`| ${j} | ${cells.join(' | ')} |`);
    }
  }
  if (want('dragon')) {
    console.log(
      `\n## Dragon ${dragonStats.hp}/${dragonStats.atk}/${dragonStats.def}: challenger win rate (mean fight s, timeouts)`,
    );
    console.log('| job | ' + DRAGON_BUILDS.map((b) => b[0]).join(' | ') + ' |');
    console.log('|---|' + DRAGON_BUILDS.map(() => '---').join('|') + '|');
    for (const j of JOBS) {
      const cells = DRAGON_BUILDS.map(([name]) => {
        const x = W(`d:${j}:${name}`);
        return `${pct(x.winsA / x.ticks.length)} (${sec(mean(x.ticks))}s, to ${pct(x.timeouts / x.ticks.length)})`;
      });
      console.log(`| ${j} | ${cells.join(' | ')} |`);
    }
    const b = boughtFighter('swordsman', 80);
    console.log(`(80 coins on a swordsman = HP ${b.maxHp} / ATK ${b.atk} / DEF ${b.def})`);
  }
  if (tasks.length)
    console.log(`\n(${tasks.length} series in ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  if (want('bench')) bench();
}

void main();
