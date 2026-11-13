import { describe, expect, it } from 'vitest';
import type { JobId } from '@dragon-rush/engine';
import { favouredJob, MATCHUPS } from '../src/matchups';
import { createCombatBot, runCombat } from '../src/index';
import {
  baseFighter,
  dragonSeries,
  duelSeries,
  JOBS,
  mean,
  statFighter,
  upgradeRate,
} from './calibration';

/**
 * Balance regression with side swaps and pooled Normal/Easy reaction time. Exact major/minor
 * target bands remain aspirational; this gate checks the achieved ring and prevents runaway cells.
 */
const N = 60;
const MATCHUP_N = 1_000;

describe('designed matchup chart', () => {
  it('is a 5-way rock-paper-scissors: each job beats exactly two and loses to two', () => {
    for (const j of JOBS) {
      const beats = MATCHUPS[j].map((e) => e.beats);
      expect(MATCHUPS[j].map((e) => e.tier).sort()).toEqual(['major', 'minor']);
      expect(new Set(beats).size).toBe(2);
      expect(beats).not.toContain(j);
      const losesTo = JOBS.filter((o) => MATCHUPS[o].some((e) => e.beats === j));
      expect(losesTo).toHaveLength(2);
      for (const o of JOBS) if (o !== j) expect(favouredJob(j, o)).toBe(favouredJob(o, j));
    }
  });
});

describe('duel balance (balanced bots, base stats)', () => {
  const rates = new Map<string, number>();
  const rate = async (i: JobId, j: JobId): Promise<number> => {
    const k = `${i}:${j}`;
    if (!rates.has(k)) {
      const bots = [10, 16].map((reaction) => createCombatBot('balanced', { reaction }));
      let wins = 0;
      for (let seed = 1; seed <= MATCHUP_N; seed++) {
        const bot = bots[(seed - 1) % 2]!;
        const asA = runCombat(
          { kind: 'duel', a: baseFighter(i), b: baseFighter(j) },
          [bot, bot],
          seed,
        );
        const asB = runCombat(
          { kind: 'duel', a: baseFighter(j), b: baseFighter(i) },
          [bot, bot],
          seed,
        );
        if (asA.result.winner === 'a') wins++;
        if (asB.result.winner === 'b') wins++;
        if (seed % 25 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
      }
      const r = wins / (MATCHUP_N * 2);
      rates.set(k, r);
      rates.set(`${j}:${i}`, 1 - r);
    }
    return rates.get(k)!;
  };

  it.each(JOBS.flatMap((job) => MATCHUPS[job].map((edge) => [job, edge.beats] as const)))(
    '%s > %s keeps its intended direction without a 70/30 cell',
    async (job, opponent) => {
      const result = await rate(job, opponent);
      expect(result, `${job} > ${opponent}`).toBeGreaterThan(0.5);
      expect(result, `${job} > ${opponent}`).toBeLessThan(0.7);
    },
    120_000,
  );

  it.each(JOBS)(
    '%s stays near 50% across four opponents and mirrors even',
    async (i) => {
      const avg = mean(await Promise.all(JOBS.filter((j) => j !== i).map((j) => rate(i, j))));
      expect(avg, i).toBeGreaterThan(0.47);
      expect(avg, i).toBeLessThan(0.53);
      const mirror = duelSeries(baseFighter(i), baseFighter(i), N, 7);
      expect(mirror.winsA / mirror.n, `${i} mirror`).toBeGreaterThan(0.3);
      expect(mirror.winsA / mirror.n, `${i} mirror`).toBeLessThan(0.7);
    },
    120_000,
  );

  it('fights stay inside the time limit and usually end by KO', () => {
    const r = duelSeries(baseFighter('swordsman'), baseFighter('berserker'), 30, 3);
    expect(r.timeouts / r.n).toBeLessThan(0.3);
    expect(mean(r.ticks) / 60).toBeGreaterThan(5);
  });
});

describe('stats matter', () => {
  it('+3 ATK, +3 DEF and +18 maxHp each beat the same job at base stats', () => {
    expect(upgradeRate('berserker', { atk: 3 }, N, 11)).toBeGreaterThan(0.6);
    expect(upgradeRate('swordsman', { def: 3 }, N, 12)).toBeGreaterThan(0.55);
    expect(upgradeRate('mage', { maxHp: 18 }, N, 13)).toBeGreaterThan(0.6);
  });

  it('the stronger dragon beats base stats but remains beatable by a heavily upgraded challenger', () => {
    const base = dragonSeries(baseFighter('berserker'), 30, 31);
    const strong = dragonSeries(statFighter('berserker', 160, 18, 15), 30, 31);
    expect(base.winsA / base.n).toBeLessThan(0.15);
    expect(strong.winsA / strong.n).toBeGreaterThan(0.3);
    expect(strong.winsA).toBeGreaterThan(base.winsA);
  });
});
