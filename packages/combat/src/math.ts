/**
 * Integer math for the combat sim. Transcendental Math functions are not bit-exact across JS engines
 * (ECMA-262 lets them be implementation-approximated), so the sim only uses + - * / and exact helpers:
 * positions in Q8 (1 px = 256), angles as 256-step BAM (0 = +x/east, 64 = +y/south because y grows down),
 * sin/cos from a hard-coded Q14 table and atan2 from an octant reduction plus a 33-entry table.
 */

/** Q8 fixed point: 1 logical px = 256 units. */
export const Q = 256;
/** Q14 trig scale: 1.0 = 16384. */
export const TRIG_ONE = 16384;

// round(sin(2*pi*i/256) * 16384), i = 0..255
const SIN_Q14: readonly number[] = [
  0, 402, 804, 1205, 1606, 2006, 2404, 2801, 3196, 3590, 3981, 4370, 4756, 5139, 5520, 5897, 6270,
  6639, 7005, 7366, 7723, 8076, 8423, 8765, 9102, 9434, 9760, 10080, 10394, 10702, 11003, 11297,
  11585, 11866, 12140, 12406, 12665, 12916, 13160, 13395, 13623, 13842, 14053, 14256, 14449, 14635,
  14811, 14978, 15137, 15286, 15426, 15557, 15679, 15791, 15893, 15986, 16069, 16143, 16207, 16261,
  16305, 16340, 16364, 16379, 16384, 16379, 16364, 16340, 16305, 16261, 16207, 16143, 16069, 15986,
  15893, 15791, 15679, 15557, 15426, 15286, 15137, 14978, 14811, 14635, 14449, 14256, 14053, 13842,
  13623, 13395, 13160, 12916, 12665, 12406, 12140, 11866, 11585, 11297, 11003, 10702, 10394, 10080,
  9760, 9434, 9102, 8765, 8423, 8076, 7723, 7366, 7005, 6639, 6270, 5897, 5520, 5139, 4756, 4370,
  3981, 3590, 3196, 2801, 2404, 2006, 1606, 1205, 804, 402, 0, -402, -804, -1205, -1606, -2006,
  -2404, -2801, -3196, -3590, -3981, -4370, -4756, -5139, -5520, -5897, -6270, -6639, -7005, -7366,
  -7723, -8076, -8423, -8765, -9102, -9434, -9760, -10080, -10394, -10702, -11003, -11297, -11585,
  -11866, -12140, -12406, -12665, -12916, -13160, -13395, -13623, -13842, -14053, -14256, -14449,
  -14635, -14811, -14978, -15137, -15286, -15426, -15557, -15679, -15791, -15893, -15986, -16069,
  -16143, -16207, -16261, -16305, -16340, -16364, -16379, -16384, -16379, -16364, -16340, -16305,
  -16261, -16207, -16143, -16069, -15986, -15893, -15791, -15679, -15557, -15426, -15286, -15137,
  -14978, -14811, -14635, -14449, -14256, -14053, -13842, -13623, -13395, -13160, -12916, -12665,
  -12406, -12140, -11866, -11585, -11297, -11003, -10702, -10394, -10080, -9760, -9434, -9102,
  -8765, -8423, -8076, -7723, -7366, -7005, -6639, -6270, -5897, -5520, -5139, -4756, -4370, -3981,
  -3590, -3196, -2801, -2404, -2006, -1606, -1205, -804, -402,
];

// round(atan(i/32) * 128 / pi), i = 0..32: the first octant in BAM units
const ATAN_BAM: readonly number[] = [
  0, 1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 25, 26, 27,
  28, 29, 29, 30, 31, 31, 32,
];

export function sinQ14(angle: number): number {
  return SIN_Q14[angle & 255]!;
}

export function cosQ14(angle: number): number {
  return SIN_Q14[(angle + 64) & 255]!;
}

/** Exact floor(a / b) for 0 <= a < 2^52 and b > 0 (the quotient's rounding error is below 1/b there). */
export function idiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Round-half-up division for non-negative integers: floor((2a + b) / 2b). */
export function divRound(a: number, b: number): number {
  return Math.floor((2 * a + b) / (2 * b));
}

/** Symmetric (half away from zero) rounding of v * t / 2^14, so mirrored motion stays mirrored. */
export function mulQ14(v: number, t: number): number {
  const p = v * t;
  if (p >= 0) return Math.floor((p + 8192) / TRIG_ONE);
  const q = Math.floor((8192 - p) / TRIG_ONE);
  return q === 0 ? 0 : -q;
}

/** Symmetric truncation of v * num / den (den > 0). */
export function mulDivTrunc(v: number, num: number, den: number): number {
  const p = v * num;
  if (p >= 0) return Math.floor(p / den);
  const q = Math.floor(-p / den);
  return q === 0 ? 0 : -q;
}

/** Integer atan2 in BAM (0..255). (0, 0) maps to 0. */
export function atan2i(dy: number, dx: number): number {
  if (dx === 0 && dy === 0) return 0;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  let a = ay <= ax ? ATAN_BAM[divRound(ay * 32, ax)]! : 64 - ATAN_BAM[divRound(ax * 32, ay)]!;
  if (dx < 0) a = 128 - a;
  if (dy < 0) a = 256 - a;
  return a & 255;
}

/** Absolute angular distance between two BAM angles (0..128). */
export function angleDiff(a: number, b: number): number {
  const d = (a - b) & 255;
  return d > 128 ? 256 - d : d;
}

/** Signed shortest turn from a to b in BAM (-128..127). */
export function angleDelta(from: number, to: number): number {
  const d = (to - from) & 255;
  return d >= 128 ? d - 256 : d;
}

/** Integer square root (floor) for 0 <= n < 2^53, Newton iteration from a power-of-two upper bound. */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = 1;
  let m = n;
  while (m >= 4) {
    m = Math.floor(m / 4);
    x *= 2;
  }
  x *= 2;
  for (;;) {
    const y = Math.floor((x + Math.floor(n / x)) / 2);
    if (y >= x) return x;
    x = y;
  }
}

/** Move input 1..8 (N, NE, E, SE, S, SW, W, NW) to BAM; index 0 is unused. */
export const MOVE_BAM: readonly number[] = [0, 192, 224, 0, 32, 64, 96, 128, 160];

/** Nearest of the 8 move directions (1..8) for a BAM angle. */
export function bamToMove(angle: number): number {
  // E (0) = move 3; each move step is 32 BAM clockwise (south-ward)
  const step = ((angle + 16) & 255) >> 5; // 0 = E, 1 = SE, 2 = S, ... 7 = NE
  return ((step + 2) % 8) + 1;
}

/** px/s to Q8 per tick, rounded. */
export function speedPerTick(pxPerSecond: number, tickHz: number): number {
  return divRound(Math.round(pxPerSecond * Q), tickHz);
}
