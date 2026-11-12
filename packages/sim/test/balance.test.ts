import { describe, expect, it } from 'vitest';
import { runBatch, summarize } from '../src/index';

describe('balance regression (small, seeded)', () => {
  it('keeps 4-player heuristic games near the measured rush-8/combat-4 baseline', () => {
    const m = summarize(
      runBatch({
        games: 120,
        players: 4,
        bots: 'heuristic',
        baseSeed: 2026,
        combat: 'sim',
      }),
    );
    // Rush-8/combat-4 1,000-game real combat baseline: ~20.4 rounds, ~14% dragon endings.
    expect(m.avgRounds).toBeGreaterThan(17);
    expect(m.avgRounds).toBeLessThan(25);
    expect(m.dragonEndShare).toBeGreaterThan(0.05);
    expect(m.dragonEndShare).toBeLessThan(0.25);
    expect(m.earlyEliminationShare).toBeGreaterThan(0.2);
    expect(m.earlyEliminationShare).toBeLessThan(0.45);
    expect(m.drawShare).toBeLessThan(0.02);
    for (const rate of Object.values(m.jobWinRate)) {
      if (rate !== null) expect(rate).toBeGreaterThan(0.1);
    }
  }, 120_000);
});
