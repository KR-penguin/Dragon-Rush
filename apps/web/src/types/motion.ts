/** Pawn hops and the CSS-3D die (decision sheet §1.6-1.7). Times are at 1x speed. */

export const HOP_FIRST_MS = 160;
export const HOP_DECAY = 0.9;
export const HOP_MIN_MS = 120;
/** `Moved` (dice) budget per step; the hops fit inside it and the rest is the landing beat. */
export const MOVE_STEP_BUDGET_MS = 160;

/** Per-step hop lengths: 160 ms, then each later step x0.9, never below 120 ms. */
export function hopSchedule(steps: number): number[] {
  const out: number[] = [];
  let ms = HOP_FIRST_MS;
  for (let i = 0; i < steps; i++) {
    out.push(Math.round(ms));
    ms = Math.max(HOP_MIN_MS, ms * HOP_DECAY);
  }
  return out;
}

/**
 * Length of a dice move event. Kept at the 160 ms-per-step budget (game pace and the FX hop-tick
 * timing derive from it); the shortening hops finish early and leave a landing beat.
 */
export const diceMoveMs = (steps: number): number => MOVE_STEP_BUDGET_MS * Math.max(1, steps);

/** Height the inner node rises to (plane px) and the squash on each landing. */
export const HOP_HEIGHT = 30;

/** Lift of the plane-parallel hop node: up to 30 px at 45 %, back down by 85 %. */
export const HOP_LIFT_KEYFRAMES: Keyframe[] = [
  { transform: 'translateZ(0px)', offset: 0, easing: 'ease-out' },
  { transform: `translateZ(${HOP_HEIGHT}px)`, offset: 0.45, easing: 'ease-in' },
  { transform: 'translateZ(0px)', offset: 0.85 },
  { transform: 'translateZ(0px)', offset: 1 },
];

/** Squash and stretch of the standee: (1.08, 0.92) per step, (1.18, 0.84) on the final landing. */
export function squashKeyframes(final: boolean): Keyframe[] {
  const [sx, sy] = final ? [1.18, 0.84] : [1.08, 0.92];
  return [
    { transform: 'scale(1, 1)', offset: 0 },
    { transform: 'scale(0.94, 1.07)', offset: 0.2 },
    { transform: 'scale(1, 1)', offset: 0.45 },
    { transform: 'scale(1, 1)', offset: 0.85 },
    { transform: `scale(${sx}, ${sy})`, offset: 0.92 },
    { transform: 'scale(1, 1)', offset: 1 },
  ];
}

export const SHADOW_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1)', opacity: 0.55, offset: 0 },
  { transform: 'scale(0.7)', opacity: 0.3, offset: 0.45 },
  { transform: 'scale(1)', opacity: 0.55, offset: 0.85 },
  { transform: 'scale(1)', opacity: 0.55, offset: 1 },
];

/* ---- Die ---- */

export type DieFace = 1 | 2 | 3 | 4 | 5 | 6;
export const DIE_FACES: readonly DieFace[] = [1, 2, 3, 4, 5, 6];
export const DIE_SIZE = 56;

/** Rotation that places each face on the cube (then translateZ(half size)). */
export const FACE_PLACEMENT: Record<DieFace, { readonly x: number; readonly y: number }> = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  3: { x: 0, y: 90 },
  4: { x: 0, y: -90 },
  5: { x: 90, y: 0 },
  2: { x: -90, y: 0 },
};

/** `half` is the cube's half size as a CSS length (px, or a calc() on a CSS variable). */
export const faceTransform = (face: DieFace, half = `${DIE_SIZE / 2}px`): string => {
  const r = FACE_PLACEMENT[face];
  return `rotateX(${r.x}deg) rotateY(${r.y}deg) translateZ(${half})`;
};

/** Cube rotation (applied as `rotateX(x) rotateY(y)`) that turns `face` toward the viewer. */
export const REST_ROTATION: Record<DieFace, { readonly x: number; readonly y: number }> = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: -90, y: 0 },
  2: { x: 90, y: 0 },
};

export const isDieFace = (n: number | null): n is DieFace =>
  n !== null && Number.isInteger(n) && n >= 1 && n <= 6;

/** Landing rotation for the engine's value, plus two full turns on X and one on Y for the tumble. */
export function diceLandingRotation(value: DieFace): { x: number; y: number } {
  const r = REST_ROTATION[value];
  return { x: r.x + 720, y: r.y + 360 };
}

export const cubeTransform = (r: { x: number; y: number }): string =>
  `rotateX(${r.x}deg) rotateY(${r.y}deg)`;

export const DICE_ROLL_MS = 700;
const LIFT_END = 80 / DICE_ROLL_MS;
const LAND = 600 / DICE_ROLL_MS;

/** Spin of the cube: still while lifting, tumble with a 4 degree overshoot, then settle. */
export function diceSpinKeyframes(value: DieFace): Keyframe[] {
  const end = diceLandingRotation(value);
  return [
    { transform: cubeTransform({ x: 0, y: 0 }), offset: 0 },
    { transform: cubeTransform({ x: 0, y: 0 }), offset: LIFT_END, easing: 'cubic-bezier(.15,.6,.25,1)' },
    { transform: cubeTransform({ x: end.x + 4, y: end.y - 4 }), offset: LAND, easing: 'ease-out' },
    { transform: cubeTransform(end), offset: 1 },
  ];
}

/**
 * Path of the die toward the tray centre from an offset (sx, sy): lift, an arc and two bounces.
 * Local humans throw from the tray's left; bots and remote players from their corner card.
 */
export function diceThrowKeyframes(sx: number, sy: number): Keyframe[] {
  const at = (f: number, lift: number, scale = 1) =>
    `translate3d(${Math.round(sx * f)}px, ${Math.round(sy * f - lift)}px, 0px) scale(${scale})`;
  return [
    { transform: at(1, 0, 0.9), offset: 0 },
    { transform: at(0.95, 22), offset: LIFT_END, easing: 'ease-out' },
    { transform: at(0.5, 40), offset: 0.42, easing: 'ease-in' },
    { transform: at(0.16, 0), offset: 0.62, easing: 'ease-out' },
    { transform: at(0.06, 14), offset: 0.74, easing: 'ease-in' },
    { transform: at(0, 0), offset: LAND },
    { transform: at(0, 0), offset: 1 },
  ];
}

/** Default throw for the local player: a 160 px path from the left of the tray. */
export const LOCAL_THROW = { x: -150, y: 8 } as const;

/** Clamps a throw vector so a die thrown from a far card still lands inside the budget. */
export function clampThrow(v: { x: number; y: number }, max = 520): { x: number; y: number } {
  const len = Math.hypot(v.x, v.y);
  if (len <= max || len === 0) return v;
  return { x: (v.x / len) * max, y: (v.y / len) * max };
}
