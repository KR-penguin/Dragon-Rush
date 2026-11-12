import { describe, expect, it } from 'vitest';
import { runBatch, summarize } from '../src/index';

describe('balance regression (small, seeded)', () => {
  it('keeps 4-player heuristic games near the measured rush-7 baseline', () => {
    const m = summarize(
      runBatch({
        games: 120,
        players: 4,
        bots: 'heuristic',
        baseSeed: 2026,
        combat: 'sim',
      }),
    );
    // Rush-7/combat-3 4,000-game real combat baseline: ~6.5 rounds, ~55% dragon endings.
    expect(m.avgRounds).toBeGreaterThan(5);
    expect(m.avgRounds).toBeLessThan(8);
    expect(m.dragonEndShare).toBeGreaterThan(0.35);
    expect(m.dragonEndShare).toBeLessThan(0.65);
    expect(m.earlyEliminationShare).toBeGreaterThan(0.2);
    expect(m.earlyEliminationShare).toBeLessThan(0.45);
    expect(m.drawShare).toBeLessThan(0.02);
    for (const rate of Object.values(m.jobWinRate)) {
      if (rate !== null) expect(rate).toBeGreaterThan(0.1);
    }
  }, 120_000);
});
