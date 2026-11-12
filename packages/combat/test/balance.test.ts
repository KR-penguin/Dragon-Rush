import { describe, expect, it } from 'vitest';
import type { JobId } from '@dragon-rush/engine';
import { favouredJob, MATCHUPS } from '../src/matchups';
import {
  baseFighter,
  dragonSeries,
  duelSeries,
  JOBS,
  mean,
  pairRate,
  statFighter,
  upgradeRate,
} from './calibration';

/**
 * Coarse balance regression with balanced bots (small samples: wide tolerances). The full report with
 * large samples is `pnpm --filter @dragon-rush/combat calibrate`.
 */
const N = 60;

describe('designed matchup chart', () => {
  it('is a 5-way rock-paper-scissors: each job beats exactly two and loses to two', () => {
    for (const j of JOBS) {
      const beats = MATCHUPS[j].map((e) => e.beats);
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
  const rate = (i: JobId, j: JobId): number => {
    const k = `${i}:${j}`;
    if (!rates.has(k)) {
      const r = pairRate(i, j, N, 1);
      rates.set(k, r);
      rates.set(`${j}:${i}`, 1 - r);
    }
    return rates.get(k)!;
  };

  it('keeps every job near 50% across its four opponents and mirrors even', () => {
    for (const i of JOBS) {
      const avg = mean(JOBS.filter((j) => j !== i).map((j) => rate(i, j)));
      expect(avg, i).toBeGreaterThan(0.38);
      expect(avg, i).toBeLessThan(0.62);
      const mirror = duelSeries(baseFighter(i), baseFighter(i), N, 7);
      expect(mirror.winsA / mirror.n, `${i} mirror`).toBeGreaterThan(0.3);
      expect(mirror.winsA / mirror.n, `${i} mirror`).toBeLessThan(0.7);
    }
  });

  it('no designed favourite collapses (soft-counter chart, tolerance 15 points below even)', () => {
    for (const i of JOBS)
      for (const e of MATCHUPS[i])
        expect(rate(i, e.beats), `${i} > ${e.beats}`).toBeGreaterThan(0.35);
  });

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

  it('the dragon beats base stats and loses more often to upgraded challengers', () => {
    const base = dragonSeries(baseFighter('berserker'), 30, 31);
    const strong = dragonSeries(statFighter('berserker', 80, 11, 10), 30, 31);
    expect(base.winsA / base.n).toBeLessThan(0.15);
    expect(strong.winsA / strong.n).toBeGreaterThan(0.45);
  });
});
