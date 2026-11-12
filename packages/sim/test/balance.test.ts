import { describe, expect, it } from 'vitest';
import { runBatch, summarize } from '../src/index';

describe('balance regression (small, seeded)', () => {
  it('keeps 4-player heuristic games near the measured rush-9/combat-5 baseline', () => {
    const m = summarize(
      runBatch({
        games: 120,
        players: 4,
        bots: 'heuristic',
        baseSeed: 2026,
        combat: 'sim',
      }),
    );
    // Rush-9/combat-5 1,000-game baseline: 15.909 rounds, 21.1% dragon endings.
    // The shorter game is a measurable balance shift from rush-8's 20.386 rounds.
    expect(m.avgRounds).toBeGreaterThan(12);
    expect(m.avgRounds).toBeLessThan(19);
    expect(m.dragonEndShare).toBeGreaterThan(0.1);
    expect(m.dragonEndShare).toBeLessThan(0.35);
    expect(m.earlyEliminationShare).toBeGreaterThan(0.2);
    expect(m.earlyEliminationShare).toBeLessThan(0.45);
    expect(m.drawShare).toBeLessThan(0.02);
    for (const rate of Object.values(m.jobWinRate)) {
      if (rate !== null) expect(rate).toBeGreaterThan(0.1);
    }
  }, 120_000);
});
