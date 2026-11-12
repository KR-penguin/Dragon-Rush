import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runBatch, summarize } from '../src/index';

describe('balance regression (small, seeded)', () => {
  it('keeps 4-player heuristic games near the measured rush-2 baseline', () => {
    const outcomeModelPath = fileURLToPath(
      new URL('../../ai/src/outcome/model.json', import.meta.url),
    );
    const m = summarize(
      runBatch({
        games: 120,
        players: 4,
        bots: 'heuristic',
        baseSeed: 2026,
        combat: 'sim',
        outcomeModelPath,
      }),
    );
    // The 8,000-game median is 8 rounds; the 9–11 round design target remains open.
    expect(m.avgRounds).toBeGreaterThan(7);
    expect(m.avgRounds).toBeLessThan(13);
    expect(m.dragonEndShare).toBeGreaterThan(0.4);
    expect(m.dragonEndShare).toBeLessThan(0.75);
    expect(m.earlyEliminationShare).toBeLessThan(0.05);
    expect(m.drawShare).toBeLessThan(0.02);
    for (const rate of Object.values(m.jobWinRate)) {
      if (rate !== null) expect(rate).toBeGreaterThan(0.1);
    }
  }, 120_000);
});
