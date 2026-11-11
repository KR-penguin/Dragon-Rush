import { describe, expect, it } from 'vitest';
import { deriveSeed, runBatch, summarize } from '../src/index';

describe('sim runner', () => {
  it('plays a batch and summarizes metrics', () => {
    const records = runBatch({ games: 20, players: 4, bots: 'heuristic', baseSeed: 1 });
    expect(records).toHaveLength(20);
    const m = summarize(records);
    expect(m.avgRounds).toBeGreaterThan(5);
    expect(m.dragonEndShare + m.drawShare).toBeLessThanOrEqual(1);
    expect(Object.values(m.jobWinRate).filter((x) => x !== null).length).toBeGreaterThan(0);
  });

  it('is reproducible', () => {
    const a = runBatch({ games: 5, players: 3, bots: 'heuristic,random', baseSeed: 9 });
    const b = runBatch({ games: 5, players: 3, bots: 'heuristic,random', baseSeed: 9 });
    expect(a).toEqual(b);
  });

  it('derives distinct 53-bit seeds', () => {
    const seeds = new Set([0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => deriveSeed(42, i, j))));
    expect(seeds.size).toBe(9);
    for (const s of seeds) expect(Number.isSafeInteger(s)).toBe(true);
  });
});
