import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runBatch, summarize } from '../src/index';

describe('balance regression (small, seeded)', () => {
  it('keeps 4-player heuristic games inside the design ranges', () => {
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
    expect(m.avgRounds).toBeGreaterThan(8);
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
