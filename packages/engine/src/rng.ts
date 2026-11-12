import type { RngState } from './types';

const TWO_POW_32 = 0x1_0000_0000;

export function createRng(seed: number): RngState {
  if (!Number.isSafeInteger(seed) || seed < 0)
    throw new RangeError('seed must be a safe non-negative integer');
  const lo = seed >>> 0;
  const hi = Math.floor(seed / TWO_POW_32) >>> 0;
  let state: RngState = { a: 0x9e3779b9 ^ lo, b: 0x243f6a88 ^ hi, c: 0xb7e15162 ^ lo, d: 1 };
  for (let i = 0; i < 16; i++) state = nextU32(state)[1];
  return state;
}

export function nextU32(s: RngState): [number, RngState] {
  let { a, b, c, d } = s;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  t = (t + d) | 0;
  c = (c + t) | 0;
  return [t >>> 0, { a, b, c, d }];
}

export function nextFloat(s: RngState): [number, RngState] {
  const [u, next] = nextU32(s);
  return [u / TWO_POW_32, next];
}

export function rollDie(s: RngState, sides: number): [number, RngState] {
  const [f, next] = nextFloat(s);
  return [1 + Math.floor(f * sides), next];
}

export function shuffle<T>(s: RngState, xs: readonly T[]): [T[], RngState] {
  const out = [...xs];
  let rng = s;
  for (let i = out.length - 1; i > 0; i--) {
    const [r, next] = rollDie(rng, i + 1);
    rng = next;
    const j = r - 1;
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return [out, rng];
}
