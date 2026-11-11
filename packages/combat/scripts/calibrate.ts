/**
 * Bot-vs-bot calibration report for DEFAULT_COMBAT_RULES.
 *   pnpm --filter @dragon-rush/combat calibrate [matrix|stats|length|dragon|bench|all] [--n 200] [--style balanced]
 */
import { DEFAULT_RULES } from '@dragon-rush/engine';
import {
  baseFighter,
  boughtFighter,
  dragonSeries,
  duelSeries,
  JOBS,
  mean,
  pairRate,
  quantile,
  statFighter,
  upgradeRate,
} from '../test/calibration';
import { createCombat, createCombatBot, runCombat, stepCombat, NO_INPUT, type BotStyle, type FighterInput } from '../src/index';

const args = process.argv.slice(2);
const section = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) ?? 'all';
const flag = (name: string, def: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? def) : def;
};
const N = Number(flag('n', '200'));
const style = flag('style', 'balanced') as BotStyle;
const pct = (x: number): string => `${(100 * x).toFixed(0)}%`.padStart(5);
const sec = (t: number): string => (t / 60).toFixed(1);

function matrix(): void {
  console.log(`\n## Job matrix (row win rate vs column, both sides, n=${N} per cell, ${style})`);
  console.log('           ' + JOBS.map((j) => j.slice(0, 9).padStart(10)).join(''));
  for (const i of JOBS) {
    const row: string[] = [];
    for (const j of JOBS) {
      if (i === j) {
        const m = duelSeries(baseFighter(i), baseFighter(i), N, 1, style);
        row.push(`${pct(m.winsA / m.n)}(a)`.padStart(10));
      } else row.push(pct(pairRate(i, j, N, 1, style)).padStart(10));
    }
    console.log(i.padEnd(11) + row.join(''));
  }
}

function stats(): void {
  console.log(`\n## Stats matter (upgraded vs same job at base, both sides, n=${N})`);
  console.log('job        +3 ATK  +3 DEF  +18 HP');
  for (const j of JOBS) {
    const a = upgradeRate(j, { atk: 3 }, N, 11);
    const d = upgradeRate(j, { def: 3 }, N, 12);
    const h = upgradeRate(j, { maxHp: 18 }, N, 13);
    console.log(`${j.padEnd(10)} ${pct(a)}   ${pct(d)}   ${pct(h)}`);
  }
}

function length(): void {
  console.log(`\n## Duel length (s), all job pairs, n=${N} per pair`);
  const all: number[] = [];
  let timeouts = 0;
  let total = 0;
  for (const i of JOBS)
    for (const j of JOBS) {
      const r = duelSeries(baseFighter(i), baseFighter(j), Math.max(4, Math.floor(N / 5)), 21, style);
      all.push(...r.ticks);
      timeouts += r.timeouts;
      total += r.n;
    }
  console.log(
    `mean ${sec(mean(all))}  p10 ${sec(quantile(all, 0.1))}  median ${sec(quantile(all, 0.5))}  p90 ${sec(quantile(all, 0.9))}  timeouts ${pct(timeouts / total)}`,
  );
}

function dragon(): void {
  console.log(`\n## Dragon (115/10/6) win rate and length, n=${N}, ${style}`);
  console.log('job        base           A9/D8/HP70     70 coins       80 coins       90 coins');
  for (const j of JOBS) {
    const cells: string[] = [];
    const setups = [baseFighter(j), statFighter(j, 70, 9, 8), boughtFighter(j, 70), boughtFighter(j, 80), boughtFighter(j, 90)];
    for (const f of setups) {
      const r = dragonSeries(f, N, 31, style);
      cells.push(`${pct(r.winsA / r.n)} ${sec(mean(r.ticks)).padStart(5)}s`.padEnd(15));
    }
    console.log(j.padEnd(10) + ' ' + cells.join(''));
  }
  const b = boughtFighter('swordsman', 80);
  console.log(`(80 coins swordsman = HP ${b.maxHp} ATK ${b.atk} DEF ${b.def})`);
}

function bench(): void {
  console.log('\n## Timing');
  const bot = createCombatBot('balanced');
  let ticks = 0;
  const t0 = performance.now();
  let fights = 0;
  for (const i of JOBS)
    for (const j of JOBS)
      for (let s = 0; s < 20; s++) {
        ticks += runCombat({ kind: 'duel', a: baseFighter(i), b: baseFighter(j) }, [bot, bot], 900 + s).ticks;
        fights += 1;
      }
  const t1 = performance.now();
  console.log(
    `runCombat duel (bots, in place): ${((t1 - t0) / fights).toFixed(2)} ms/fight, ${(((t1 - t0) * 1000) / ticks).toFixed(2)} µs/tick, ${(ticks / fights / 60).toFixed(1)} s avg`,
  );
  let dt = 0;
  let dticks = 0;
  for (const j of JOBS)
    for (let s = 0; s < 10; s++) {
      const d0 = performance.now();
      dticks += runCombat(
        { kind: 'dragonFight', a: boughtFighter(j, 80), b: null, dragon: { ...DEFAULT_RULES.dragon } },
        [bot],
        500 + s,
      ).ticks;
      dt += performance.now() - d0;
    }
  console.log(`runCombat dragon: ${(dt / 50).toFixed(2)} ms/fight, ${((dt * 1000) / dticks).toFixed(2)} µs/tick`);
  // copy-on-write stepCombat with scripted inputs (rollback re-simulation cost)
  let st = createCombat({ kind: 'duel', a: baseFighter('archer'), b: baseFighter('berserker') }, 3);
  const inputs: [FighterInput, FighterInput][] = [];
  for (let t = 0; t < 600; t++) {
    inputs.push([
      { move: ((t >> 4) % 9) as FighterInput['move'], attack: (t & 15) < 8, skill: t % 97 === 0, dash: t % 131 === 0 },
      { move: ((t >> 5) % 9) as FighterInput['move'], attack: (t & 7) < 2, skill: t % 113 === 0, dash: t % 89 === 0 },
    ]);
  }
  const s0 = performance.now();
  let steps = 0;
  for (let rep = 0; rep < 20; rep++) {
    st = createCombat({ kind: 'duel', a: baseFighter('archer'), b: baseFighter('berserker') }, 3 + rep);
    for (const inp of inputs) {
      if (st.outcome) break;
      st = stepCombat(st, inp).state;
      steps += 1;
    }
  }
  const s1 = performance.now();
  console.log(`stepCombat (copy-on-write, scripted inputs): ${(((s1 - s0) * 1000) / steps).toFixed(2)} µs/tick`);
  void NO_INPUT;
}

const sections: Record<string, () => void> = { matrix, stats, length, dragon, bench };
if (section === 'all') for (const f of Object.values(sections)) f();
else sections[section]?.();
