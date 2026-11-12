import { describe, expect, it } from 'vitest';
import { hopTimings } from '../src/fx/timing';
import { hopSchedule } from '../src/types/motion';

describe('hop FX timing', () => {
  it('starts each hop tick when the pawn starts that visible hop', () => {
    const e = { type: 'Moved', seat: 0, from: 22, to: 4, steps: 6, via: 'dice' } as const;
    for (const speed of [1, 2, 4]) {
      const hops = hopTimings(e, speed, 24);
      const schedule = hopSchedule(6).map((ms) => ms / speed);
      let start = 0;
      hops.forEach((h, i) => {
        expect(h.startMs).toBe(Math.round(start));
        expect(h.landMs).toBeGreaterThan(h.startMs);
        expect(h.landMs).toBeLessThanOrEqual(Math.round(start + schedule[i]!));
        start += schedule[i]!;
      });
      expect(hops.map((h) => h.tile)).toEqual([23, 0, 1, 2, 3, 4]);
    }
  });
});
