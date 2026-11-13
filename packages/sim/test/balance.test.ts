import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from '@dragon-rush/engine';
import { runBatch, summarize } from '../src/index';

describe('balance regression (small, seeded)', () => {
  it('keeps 4-player heuristic games near the measured rush-14/combat-9 baseline', () => {
    expect(DEFAULT_RULES.version).toBe('rush-14');
    const m = summarize(
      runBatch({
        games: 120,
        players: 4,
        bots: 'heuristic',
        // Match the CLI's --seed 2026 --players 4 namespace.
        baseSeed: 2026 * 1000 + 4,
        combat: 'sim',
      }),
    );
    // Rush-14/combat-9 1,000-game baseline: 18.133 rounds, 28.7% dragon endings.
    // Keep broad guards for the shorter fixed sample around the measured full batch.
    expect(Math.abs(m.avgRounds - 18.133)).toBeLessThan(3);
    expect(Math.abs(m.dragonEndShare - 0.287)).toBeLessThan(0.1);
    expect(m.earlyEliminationShare).toBeGreaterThan(0.2);
    expect(m.earlyEliminationShare).toBeLessThan(0.45);
    expect(m.drawShare).toBeLessThan(0.02);
    for (const rate of Object.values(m.jobWinRate)) {
      if (rate !== null) expect(rate).toBeGreaterThan(0.1);
    }
  }, 120_000);
});
