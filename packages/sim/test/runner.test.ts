import { describe, expect, it } from 'vitest';
import { deriveSeed, runBatch, StatDistSchema, statDistFromRecords, summarize } from '../src/index';

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

  it('settles fights with the real-time sim when asked, reproducibly', () => {
    const run = () => runBatch({ games: 6, players: 4, bots: 'heuristic', baseSeed: 3, combat: 'sim', logFights: true });
    const a = run();
    expect(a).toEqual(run());
    const fights = a.flatMap((r) => r.fights ?? []);
    expect(fights.length).toBeGreaterThan(0);
    expect(fights.every((f) => f.ticks !== null && f.ticks > 0)).toBe(true);
    expect(a.reduce((n, r) => n + r.combatTicks, 0)).toBe(fights.reduce((n, f) => n + f.ticks!, 0));
    for (const r of a) expect(r.outcome === 'dragon' || r.outcome === 'lastSurvivor' || r.outcome === 'draw').toBe(true);
    const dice = runBatch({ games: 6, players: 4, bots: 'heuristic', baseSeed: 3, logFights: true });
    expect(dice.flatMap((r) => r.fights ?? []).every((f) => f.ticks === null)).toBe(true);
    const dist = statDistFromRecords(dice, 'dice');
    expect(dist.version).toBe('stat_dist_v1');
    expect(StatDistSchema.safeParse(dist).success).toBe(true);
  });

  it('derives distinct 53-bit seeds', () => {
    const seeds = new Set([0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => deriveSeed(42, i, j))));
    expect(seeds.size).toBe(9);
    for (const s of seeds) expect(Number.isSafeInteger(s)).toBe(true);
  });
});
