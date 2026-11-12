import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runBatch, summarize } from '../src/index';

describe('balance regression (small, seeded)', () => {
  it('keeps 4-player heuristic games near the measured rush-7 baseline', () => {
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
    // Rush-7 4,000-game baseline: 4.24 rounds, 50.2% dragon endings, 37.3% early eliminations.
    expect(m.avgRounds).toBeGreaterThan(3.5);
    expect(m.avgRounds).toBeLessThan(5.5);
    expect(m.dragonEndShare).toBeGreaterThan(0.35);
    expect(m.dragonEndShare).toBeLessThan(0.65);
    expect(m.earlyEliminationShare).toBeGreaterThan(0.25);
    expect(m.earlyEliminationShare).toBeLessThan(0.5);
    expect(m.drawShare).toBeLessThan(0.02);
    for (const rate of Object.values(m.jobWinRate)) {
      if (rate !== null) expect(rate).toBeGreaterThan(0.1);
    }
  }, 120_000);
});
