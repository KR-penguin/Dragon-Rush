/** Deterministic 1D gradient (Perlin) noise for smooth camera shake. Pure. */

function hashInt(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i, 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Gradient in [-1, 1] at an integer lattice point. */
const gradient = (seed: number, i: number): number => (hashInt(seed, i) / 0xffffffff) * 2 - 1;

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * 1D Perlin noise in [-1, 1] (normalised by 2, the 1D extreme). Zero at lattice points,
 * C2-continuous, identical for the same (seed, x) on every frame rate.
 */
export function perlin1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = gradient(seed, i) * f;
  const b = gradient(seed, i + 1) * (f - 1);
  return Math.max(-1, Math.min(1, 2 * (a + (b - a) * fade(f))));
}
