import { describe, expect, it } from 'vitest';
import { createRng, rollDie, nextU32 } from '../src/rng';

describe('sfc32 rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(nextU32(a)[0]).toBe(nextU32(b)[0]);
  });

  it('differs for different seeds, including above 2^32', () => {
    expect(nextU32(createRng(1))[0]).not.toBe(nextU32(createRng(2))[0]);
    expect(nextU32(createRng(2 ** 40))[0]).not.toBe(nextU32(createRng(0))[0]);
  });

  it('rolls dice uniformly within range', () => {
    let rng = createRng(7);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 60_000; i++) {
      const [v, next] = rollDie(rng, 6);
      rng = next;
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      counts[v - 1]! += 1;
    }
    for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(500);
  });

  it('rejects invalid seeds', () => {
    expect(() => createRng(-1)).toThrow();
    expect(() => createRng(1.5)).toThrow();
  });
});
