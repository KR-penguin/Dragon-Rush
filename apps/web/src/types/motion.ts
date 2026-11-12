/** Pawn hops and the ten-sector roulette. Times are at 1x speed. */

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

/** A forward teleport remains legible even across most of the 24-tile ring. */
export function teleportHopSchedule(steps: number): number[] {
  return Array.from({ length: steps }, (_, i) => Math.max(45, Math.round(75 * 0.96 ** i)));
}

export const teleportMoveMs = (steps: number): number =>
  teleportHopSchedule(steps).reduce((total, ms) => total + ms, 80);

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

/* ---- Roulette ---- */

export const ROULETTE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const ROULETTE_ROLL_MS = 700;
export const ROULETTE_LAND_MS = 600;
const SECTOR_DEGREES = 360 / ROULETTE_VALUES.length;

export const isRouletteValue = (value: number | null): value is number =>
  value !== null && Number.isInteger(value) && value >= 1 && value <= 10;

/** Sector 1 is centred at twelve o'clock beneath the fixed pointer. */
export const rouletteRestAngle = (value: number): number => -(value - 1) * SECTOR_DEGREES;

/** Full clockwise turns plus the shortest forward distance to the authoritative result. */
export function rouletteSpinKeyframes(from: number, value: number): Keyframe[] {
  const rest = rouletteRestAngle(value);
  const forward = (((rest - from) % 360) + 360) % 360;
  const end = from + 1080 + forward;
  return [
    { transform: `rotate(${from}deg)`, offset: 0, easing: 'cubic-bezier(.18,.65,.25,1)' },
    { transform: `rotate(${end + 5}deg)`, offset: ROULETTE_LAND_MS / ROULETTE_ROLL_MS },
    { transform: `rotate(${end}deg)`, offset: 1 },
  ];
}

const point = (angle: number, radius: number): string => {
  const rad = (angle * Math.PI) / 180;
  return `${(50 + Math.cos(rad) * radius).toFixed(3)} ${(50 + Math.sin(rad) * radius).toFixed(3)}`;
};

export const rouletteSectorPath = (index: number): string => {
  const start = -90 + index * SECTOR_DEGREES - SECTOR_DEGREES / 2;
  return `M 50 50 L ${point(start, 48)} A 48 48 0 0 1 ${point(start + SECTOR_DEGREES, 48)} Z`;
};

export const rouletteLabelPosition = (index: number): { x: number; y: number } => {
  const rad = ((-90 + index * SECTOR_DEGREES) * Math.PI) / 180;
  return { x: 50 + Math.cos(rad) * 34, y: 50 + Math.sin(rad) * 34 };
};
