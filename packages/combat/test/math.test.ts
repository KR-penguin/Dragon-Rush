import { describe, expect, it } from 'vitest';
import { angleDiff, atan2i, bamToMove, cosQ14, isqrt, MOVE_BAM, mulQ14, sinQ14 } from '../src/math';
import { computeDamage } from '../src/damage';
import { DEFAULT_COMBAT_RULES } from '../src/rules';

describe('integer math', () => {
  it('sin/cos table matches the real functions within rounding and is exactly symmetric', () => {
    for (let a = 0; a < 256; a++) {
      expect(Math.abs(sinQ14(a) - Math.sin((2 * Math.PI * a) / 256) * 16384)).toBeLessThanOrEqual(
        0.5,
      );
      expect(sinQ14(a) + sinQ14(a + 128)).toBe(0);
      expect(cosQ14(a)).toBe(sinQ14(a + 64));
    }
  });

  it('atan2i is within one BAM step of atan2 over the whole circle', () => {
    for (let a = 0; a < 256; a++) {
      for (const r of [1, 37, 256, 9000, 200_000]) {
        const x = Math.round(Math.cos((2 * Math.PI * a) / 256) * r);
        const y = Math.round(Math.sin((2 * Math.PI * a) / 256) * r);
        if (x === 0 && y === 0) continue;
        const exact = (Math.atan2(y, x) * 128) / Math.PI;
        expect(angleDiff(atan2i(y, x), Math.round((exact + 256) % 256) & 255)).toBeLessThanOrEqual(
          r < 10 ? 8 : 1,
        );
      }
    }
  });

  it('isqrt is the exact floor square root', () => {
    for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 99_999, 2 ** 31, 52_428_800_000, 1e15]) {
      const s = isqrt(n);
      expect(s * s).toBeLessThanOrEqual(n);
      expect((s + 1) * (s + 1)).toBeGreaterThan(n);
    }
  });

  it('isqrt stays exact across integer bit boundaries and seeded 53-bit inputs', () => {
    const values = [Number.MAX_SAFE_INTEGER];
    for (let bit = 1; bit <= 52; bit++) values.push(2 ** bit - 1, 2 ** bit, 2 ** bit + 1);
    let seed = 42;
    for (let i = 0; i < 1000; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      values.push(Math.floor((seed / 0x100000000) * Number.MAX_SAFE_INTEGER));
    }
    for (const n of values) {
      const root = BigInt(isqrt(n));
      expect(root * root <= BigInt(n), String(n)).toBe(true);
      expect((root + 1n) * (root + 1n) > BigInt(n), String(n)).toBe(true);
    }
  });

  it('mulQ14 rounds symmetrically so mirrored motion stays mirrored', () => {
    for (const v of [1, 7, 811, 4096])
      for (let a = 0; a < 256; a++) expect(mulQ14(-v, cosQ14(a)) + mulQ14(v, cosQ14(a))).toBe(0);
  });

  it('maps move inputs to BAM and back', () => {
    for (let m = 1; m <= 8; m++) expect(bamToMove(MOVE_BAM[m]!)).toBe(m);
    expect(MOVE_BAM[3]).toBe(0); // east
    expect(MOVE_BAM[5]).toBe(64); // south (y grows downward)
  });
});

describe('damage formula (S 8/5, K 10, round half up)', () => {
  const r = DEFAULT_COMBAT_RULES;
  it('matches the sheet sanity table at P 1.0', () => {
    expect(computeDamage(r, 100, 5, 1, 6, 1)).toBe(5); // swordsman 5 -> archer DEF 6
    expect(computeDamage(r, 120, 10, 1, 5, 1)).toBe(13); // dragon claw P 1.2 -> DEF 5
    expect(computeDamage(r, 40, 10, 1, 5, 0)).toBe(6); // breath tick ignores DEF
    expect(computeDamage(r, 180, 5 * 13, 10, 5, 1)).toBe(12); // raged berserker axe
  });

  it('never goes below the minimum and pierce halves DEF', () => {
    expect(computeDamage(r, 1, 1, 1, 99, 1)).toBe(1);
    expect(computeDamage(r, 90, 4, 1, 5, 2)).toBeGreaterThan(computeDamage(r, 90, 4, 1, 5, 1));
  });
});
