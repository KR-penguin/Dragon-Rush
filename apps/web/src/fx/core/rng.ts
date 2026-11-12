/**
 * FX randomness. Kept apart from the engine/sim RNG on purpose: presentation must never
 * consume or perturb gameplay random draws.
 */
export interface FxRng {
  /** Uniform float in [0, 1). */
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  reseed(seed: number): void;
}

/** Mixes any integer (event id, fight seed, version) into a non-zero 32-bit seed. */
export function hashSeed(...parts: readonly number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p | 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 13;
  }
  return h >>> 0 || 0x9e3779b9;
}

/** xorshift32: tiny, fast, good enough for particles and sound variation. */
export function createFxRng(seed = 0x9e3779b9): FxRng {
  let s = seed >>> 0 || 0x9e3779b9;
  const next = (): number => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x1_0000_0000;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length) % items.length]!,
    reseed(seed) {
      s = seed >>> 0 || 0x9e3779b9;
    },
  };
}
