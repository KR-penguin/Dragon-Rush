import type { ParticlePool, ParticleShape } from './particles';
import type { FxRng } from './rng';

/**
 * Preset numbers are written in the units of the spec they come from:
 * `arena` presets in combat logical px (960×540 canvas), `board` presets in CSS px at 1080p.
 * Emitters convert with a per-surface unit (see `presetUnit`).
 */
export type PresetSpace = 'arena' | 'board';

type Range = readonly [number, number];

export interface BurstPreset {
  readonly space: PresetSpace;
  readonly count: Range;
  /** px/s. */
  readonly speed: Range;
  /** Cone centre in radians (0 = right, −π/2 = up). */
  readonly angle: number;
  /** Full cone width in radians. */
  readonly spread: number;
  readonly gravity: number;
  /** Velocity retention per 60 Hz tick. */
  readonly drag: number;
  readonly lifeMs: Range;
  readonly size: Range;
  /** End size as a multiple of the start size. */
  readonly sizeEnd: number;
  readonly colors: readonly string[];
  readonly shape: ParticleShape;
  readonly additive?: boolean;
  readonly spin?: Range;
  /** Random spawn radius. */
  readonly jitter?: number;
  readonly stretch?: number;
  readonly fadeIn?: number;
  readonly alpha?: number;
}

const DEG = Math.PI / 180;
const UP = -Math.PI / 2;
const FULL = Math.PI * 2;
const SPARK_COLORS = ['#FFF6E0', '#FFD27A', '#FFB25B', '#FFFFFF'] as const;
const GOLD = ['#F6D47A', '#FFF4C9', '#D9A441'] as const;

const spark = (count: number, colors: readonly string[] = SPARK_COLORS): BurstPreset => ({
  space: 'arena',
  count: [count, count],
  speed: [200, 500],
  angle: 0,
  spread: 70 * DEG,
  gravity: 0,
  drag: 0.9,
  lifeMs: [120, 250],
  size: [1, 1.6],
  sizeEnd: 0.6,
  colors,
  shape: 'streak',
  additive: true,
  stretch: 0.04,
});

export const BURST_PRESETS = {
  /** Hit sparks: light 8, heavy 20, parry 14 (blue-white); ±35° cone, 200–500 px/s, 120–250 ms. */
  sparkLight: spark(8),
  sparkHeavy: spark(20),
  sparkParry: spark(14, ['#EAF4FF', '#8FB3D9', '#FFFFFF']),
  /** Small puff under a hopping pawn. */
  dust: {
    space: 'board',
    count: [3, 4],
    speed: [20, 60],
    angle: UP,
    spread: Math.PI,
    gravity: -20,
    drag: 0.9,
    lifeMs: [280, 420],
    size: [5, 9],
    sizeEnd: 2,
    colors: ['#D8C29A', '#B8A68C', '#EAD9B5'],
    shape: 'smoke',
    alpha: 0.5,
  },
  /** Final landing / dice settle. */
  landDust: {
    space: 'board',
    count: [8, 8],
    speed: [40, 110],
    angle: UP,
    spread: Math.PI * 1.1,
    gravity: -10,
    drag: 0.88,
    lifeMs: [350, 550],
    size: [6, 11],
    sizeEnd: 2.2,
    colors: ['#D8C29A', '#B8A68C', '#EAD9B5'],
    shape: 'smoke',
    alpha: 0.55,
  },
  /** Bad tile: 8 dark smoke puffs. */
  smokeDark: {
    space: 'board',
    count: [8, 8],
    speed: [20, 70],
    angle: UP,
    spread: FULL,
    gravity: -40,
    drag: 0.92,
    lifeMs: [600, 900],
    size: [10, 16],
    sizeEnd: 2.2,
    colors: ['#2B1D14', '#3B2618', '#1A1210'],
    shape: 'smoke',
    alpha: 0.6,
    jitter: 8,
  },
  /** Elimination / KO. */
  smokeKo: {
    space: 'board',
    count: [20, 24],
    speed: [30, 140],
    angle: UP,
    spread: FULL,
    gravity: -50,
    drag: 0.93,
    lifeMs: [900, 1400],
    size: [14, 24],
    sizeEnd: 2.4,
    colors: ['#3C3741', '#5A5460', '#28242C'],
    shape: 'smoke',
    alpha: 0.6,
    jitter: 14,
  },
  /** Good tile: 12 gold sparkles. */
  goldSparkle: {
    space: 'board',
    count: [12, 12],
    speed: [50, 160],
    angle: UP,
    spread: FULL,
    gravity: -40,
    drag: 0.92,
    lifeMs: [450, 750],
    size: [3, 5],
    sizeEnd: 0.3,
    colors: GOLD,
    shape: 'star',
    additive: true,
    jitter: 10,
  },
  heal: {
    space: 'board',
    count: [14, 14],
    speed: [15, 60],
    angle: UP,
    spread: 1.4,
    gravity: -90,
    drag: 0.95,
    lifeMs: [600, 1000],
    size: [3, 5],
    sizeEnd: 0.2,
    colors: ['#7DFF9B', '#C9FFD4', '#5EE08A'],
    shape: 'star',
    additive: true,
    jitter: 16,
  },
  magic: {
    space: 'board',
    count: [20, 20],
    speed: [100, 280],
    angle: 0,
    spread: FULL,
    gravity: 0,
    drag: 0.88,
    lifeMs: [400, 700],
    size: [3, 5],
    sizeEnd: 0.2,
    colors: ['#B38CFF', '#8FB3D9', '#FFFFFF', '#E1B3FF'],
    shape: 'star',
    additive: true,
  },
  shield: {
    space: 'board',
    count: [18, 18],
    speed: [80, 220],
    angle: 0,
    spread: FULL,
    gravity: 0,
    drag: 0.88,
    lifeMs: [450, 750],
    size: [3, 5],
    sizeEnd: 0.3,
    colors: ['#8FB3D9', '#D7F1FF', '#FFFFFF'],
    shape: 'star',
    additive: true,
  },
  embers: {
    space: 'board',
    count: [18, 18],
    speed: [60, 200],
    angle: UP,
    spread: 1.4,
    gravity: -240,
    drag: 0.94,
    lifeMs: [500, 1000],
    size: [2, 4],
    sizeEnd: 0.2,
    colors: ['#FFB25B', '#FF7A3D', '#C8402A', '#FFDF6B'],
    shape: 'dot',
    additive: true,
    jitter: 16,
  },
  /**
   * Victory: two corner cannons of 70–80 each (120–200 total). Fast launch, light drag: the
   * pieces reach mid-screen, then drift down at a ~460 px/s terminal speed.
   */
  confetti: {
    space: 'board',
    count: [70, 80],
    speed: [1500, 2200],
    angle: UP,
    spread: 0.6,
    gravity: 700,
    drag: 0.975,
    lifeMs: [2400, 3400],
    size: [7, 11],
    sizeEnd: 1,
    colors: ['#D9443A', '#2F78D6', '#23935A', '#F0B429', '#F6D47A', '#EAD9B5'],
    shape: 'square',
    spin: [4, 12],
  },
  /** Coins dropping out of a purse (coin loss). */
  coinDrop: {
    space: 'board',
    count: [5, 5],
    speed: [80, 220],
    angle: UP,
    spread: 1.6,
    gravity: 1300,
    drag: 0.98,
    lifeMs: [600, 800],
    size: [6, 8],
    sizeEnd: 1,
    colors: ['#F6D47A', '#D9A441'],
    shape: 'coin',
    spin: [6, 12],
  },
} as const satisfies Record<string, BurstPreset>;

export type BurstPresetName = keyof typeof BURST_PRESETS;

export interface RingPreset {
  readonly space: PresetSpace;
  readonly lifeMs: number;
  readonly r0: number;
  readonly r1: number;
  readonly alpha: number;
  readonly stroke: number;
}

/** Impact rings: α 0.5→0, QuadOut radius, stroke 6→1. */
export const RING_PRESETS = {
  light: { space: 'arena', lifeMs: 200, r0: 4, r1: 28, alpha: 0.5, stroke: 6 },
  heavy: { space: 'arena', lifeMs: 350, r0: 8, r1: 64, alpha: 0.5, stroke: 6 },
  dive: { space: 'arena', lifeMs: 500, r0: 0, r1: 120, alpha: 0.5, stroke: 6 },
} as const satisfies Record<string, RingPreset>;

export type RingPresetName = keyof typeof RING_PRESETS;

/**
 * Units per preset px on a surface. The screen overlay is in CSS px scaled by viewport height;
 * one arena logical px is two CSS px at 1080p (960×540 canvas fitted to 1920×1080).
 */
export function presetUnit(
  space: PresetSpace,
  surface: 'screen' | 'arena',
  viewportScale = 1,
): number {
  if (surface === 'arena') return space === 'arena' ? 1 : 0.5;
  return (space === 'arena' ? 2 : 1) * viewportScale;
}

export interface EmitOptions {
  /** Count multiplier (settings, reduced motion, strength). */
  readonly amount?: number;
  /** Space conversion (see `presetUnit`). */
  readonly unit?: number;
  /** Overrides the preset cone centre (radians). */
  readonly angle?: number;
  /** Overrides the preset cone width (radians). */
  readonly spread?: number;
  readonly colors?: readonly string[];
}

/** Emits a burst; returns how many particles were actually spawned (the pool may be full). */
export function emitBurst(
  pool: ParticlePool,
  preset: BurstPreset,
  x: number,
  y: number,
  rng: FxRng,
  o: EmitOptions = {},
): number {
  const unit = o.unit ?? 1;
  const n = Math.round(rng.int(preset.count[0], preset.count[1]) * (o.amount ?? 1));
  const colors = o.colors ?? preset.colors;
  const centre = o.angle ?? preset.angle;
  let spawned = 0;
  for (let k = 0; k < n; k++) {
    const a = centre + (rng.next() - 0.5) * (o.spread ?? preset.spread);
    const speed = rng.range(preset.speed[0], preset.speed[1]) * unit;
    const size = rng.range(preset.size[0], preset.size[1]) * unit;
    const jr = (preset.jitter ?? 0) * unit * Math.sqrt(rng.next());
    const ja = rng.next() * Math.PI * 2;
    const spin = preset.spin
      ? rng.range(preset.spin[0], preset.spin[1]) * (rng.next() < 0.5 ? -1 : 1)
      : 0;
    const i = pool.spawn({
      x: x + Math.cos(ja) * jr,
      y: y + Math.sin(ja) * jr,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      gravity: preset.gravity * unit,
      drag: preset.drag,
      lifeMs: rng.range(preset.lifeMs[0], preset.lifeMs[1]),
      size,
      sizeEnd: size * preset.sizeEnd,
      rot: rng.next() * Math.PI * 2,
      spin,
      color: rng.pick(colors),
      alpha: preset.alpha ?? 1,
      fadeIn: preset.fadeIn ?? 0,
      shape: preset.shape,
      additive: preset.additive ?? false,
      stretch: preset.stretch ?? 0,
    });
    if (i < 0) break;
    spawned++;
  }
  return spawned;
}

export function emitRing(
  pool: ParticlePool,
  preset: RingPreset,
  x: number,
  y: number,
  color: string,
  unit = 1,
): boolean {
  return (
    pool.spawn({
      x,
      y,
      lifeMs: preset.lifeMs,
      size: preset.r0 * unit,
      sizeEnd: preset.r1 * unit,
      color,
      alpha: preset.alpha,
      shape: 'ring',
      stretch: preset.stroke * unit,
    }) >= 0
  );
}

/** Coin fly-to-HUD: one coin per coin (max 10), burst 20–40 px in 120 ms, Bézier 450 ms, 35 ms stagger. */
export const COIN_FLIGHT = {
  maxCoins: 10,
  burst: [20, 40],
  burstMs: 120,
  flyMs: 450,
  staggerMs: 35,
  size: 7,
} as const;

export function emitCoinFlight(
  pool: ParticlePool,
  rng: FxRng,
  o: {
    readonly from: { readonly x: number; readonly y: number };
    readonly to: { readonly x: number; readonly y: number };
    readonly coins: number;
    readonly group: number;
    readonly unit?: number;
    readonly delayMs?: number;
  },
): number {
  const unit = o.unit ?? 1;
  const n = Math.max(0, Math.min(COIN_FLIGHT.maxCoins, Math.round(o.coins)));
  let spawned = 0;
  for (let k = 0; k < n; k++) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.range(COIN_FLIGHT.burst[0], COIN_FLIGHT.burst[1]) * unit;
    const burst = { x: o.from.x + Math.cos(a) * r, y: o.from.y + Math.sin(a) * r };
    // Control point above the midpoint, so coins arc up and over toward the HUD.
    const lift = (60 + rng.next() * 60) * unit;
    const control = {
      x: (burst.x + o.to.x) / 2 + (rng.next() - 0.5) * 80 * unit,
      y: Math.min(burst.y, o.to.y) - lift,
    };
    const i = pool.spawnFlight({
      from: o.from,
      burst,
      control,
      to: o.to,
      burstMs: COIN_FLIGHT.burstMs,
      flyMs: COIN_FLIGHT.flyMs,
      delayMs: (o.delayMs ?? 0) + k * COIN_FLIGHT.staggerMs,
      size: COIN_FLIGHT.size * unit,
      color: '#F6D47A',
      shape: 'coin',
      spin: rng.range(6, 12),
      group: o.group,
    });
    if (i < 0) break;
    spawned++;
  }
  return spawned;
}
