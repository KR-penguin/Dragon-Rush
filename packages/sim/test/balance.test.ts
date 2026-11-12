import { describe, expect, it } from 'vitest';
import { runBatch, summarize } from '../src/index';

describe('balance regression (small, seeded)', () => {
  it('keeps 4-player heuristic games inside the design ranges', () => {
    const m = summarize(runBatch({ games: 120, players: 4, bots: 'heuristic', baseSeed: 2026 }));
    expect(m.avgRounds).toBeGreaterThan(8);
    expect(m.avgRounds).toBeLessThan(13);
    expect(m.dragonEndShare).toBeGreaterThan(0.6);
    expect(m.dragonEndShare).toBeLessThan(0.97);
    expect(m.earlyEliminationShare).toBeLessThan(0.05);
    expect(m.drawShare).toBeLessThan(0.02);
    for (const rate of Object.values(m.jobWinRate)) {
      if (rate !== null) expect(rate).toBeGreaterThan(0.1);
    }
  }, 120_000);
});
