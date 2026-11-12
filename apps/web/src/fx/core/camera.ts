import { clamp, clamp01 } from './easing';
import { perlin1 } from './noise';

/** Anything that tells time in ms. Inject a fake in tests, `fxTime` in the app. */
export interface ClockLike {
  now(): number;
}

export interface CameraRigOptions {
  /** Offset at trauma 1 (CSS px for the board, logical px for the arena). */
  readonly maxOffset: number;
  readonly maxRollDeg: number;
  /** Linear trauma decay per second. */
  readonly decayPerSecond?: number;
  /** Noise lattice frequency; high enough to read as shake, low enough to stay smooth. */
  readonly frequencyHz?: number;
  readonly seed?: number;
  /** Output cap while a hostile telegraph fills, so hazards stay readable. */
  readonly telegraphCap?: number;
  /** Kick retention per 60 Hz tick. */
  readonly kickFriction?: number;
  readonly zoomRampMs?: number;
  /** Zoom punch retention per 60 Hz tick after the ramp. */
  readonly zoomDecay?: number;
  readonly maxZoomPunch?: number;
}

/** Board: 20 px at 1080p (scale by viewport height / 1080) and 1° roll on `.world-shake`. */
export const BOARD_CAMERA: CameraRigOptions = { maxOffset: 20, maxRollDeg: 1 };
/** Arena: 16 logical px and 2° roll. */
export const ARENA_CAMERA: CameraRigOptions = { maxOffset: 16, maxRollDeg: 2 };

const DEFAULTS = {
  decayPerSecond: 1.5,
  frequencyHz: 20,
  seed: 0x5eed,
  telegraphCap: 4,
  kickFriction: 0.85,
  zoomRampMs: 40,
  zoomDecay: 0.9,
  maxZoomPunch: 0.06,
} as const;

// Separate noise channels for x, y and roll so they never move in lockstep.
const CHANNEL_X = 0;
const CHANNEL_Y = 100;
const CHANNEL_ROLL = 200;

export interface CameraSample {
  readonly dx: number;
  readonly dy: number;
  /** Roll in radians. */
  readonly rot: number;
  /** 1 = no zoom punch. */
  readonly zoom: number;
  readonly trauma: number;
}

export interface CameraSampleOptions {
  /** Shake slider × reduced-motion gate (0 disables shake, kick and zoom punch). */
  readonly scale?: number;
  /** Multiplies offsets, e.g. viewport height / 1080 on the board. */
  readonly unit?: number;
  /** A hostile telegraph is filling: cap output and drop roll. */
  readonly telegraph?: boolean;
}

export interface CameraRig {
  addTrauma(amount: number): void;
  /** Continuous trauma (e.g. breath active: +0.6/s up to a soft cap of 0.5). */
  sustainTrauma(perSecond: number, dtMs: number, softCap: number): void;
  trauma(): number;
  /** Recoil: pushes the camera `px` opposite the attack direction, then friction pulls it back. */
  kick(dirX: number, dirY: number, px?: number): void;
  zoomPunch(amount?: number): void;
  sample(options?: CameraSampleOptions): CameraSample;
  isIdle(): boolean;
  reset(): void;
}

export const ZERO_CAMERA: CameraSample = { dx: 0, dy: 0, rot: 0, zoom: 1, trauma: 0 };

/**
 * Eiserloh-style trauma camera. Every channel is an analytic function of the injected clock,
 * so the output at a given time does not depend on how many frames were drawn before it.
 */
export function createCameraRig(options: CameraRigOptions, clock: ClockLike): CameraRig {
  const o = { ...DEFAULTS, ...options };
  let traumaBase = 0;
  let traumaAt = 0;
  let kickX = 0;
  let kickY = 0;
  let kickAt = 0;
  let zoomFrom = 0;
  let zoomPeak = 0;
  let zoomAt = -Infinity;

  const traumaAtTime = (t: number): number =>
    Math.max(0, traumaBase - (o.decayPerSecond * Math.max(0, t - traumaAt)) / 1000);
  const kickFactor = (t: number): number =>
    o.kickFriction ** ((Math.max(0, t - kickAt) * 60) / 1000);
  const zoomAtTime = (t: number): number => {
    const age = t - zoomAt;
    if (!(age >= 0)) return 0;
    if (age < o.zoomRampMs) return zoomFrom + (zoomPeak - zoomFrom) * (age / o.zoomRampMs);
    return zoomPeak * o.zoomDecay ** (((age - o.zoomRampMs) * 60) / 1000);
  };

  return {
    addTrauma(amount) {
      const t = clock.now();
      traumaBase = clamp01(traumaAtTime(t) + Math.max(0, amount));
      traumaAt = t;
    },
    sustainTrauma(perSecond, dtMs, softCap) {
      const t = clock.now();
      const cur = traumaAtTime(t);
      if (cur >= softCap) return;
      // Net rise: the sustained source also outpaces the normal decay while it lasts.
      const rise = ((perSecond + o.decayPerSecond) * Math.max(0, dtMs)) / 1000;
      traumaBase = Math.min(softCap, cur + rise);
      traumaAt = t;
    },
    trauma: () => traumaAtTime(clock.now()),
    kick(dirX, dirY, px = 6) {
      const t = clock.now();
      const len = Math.hypot(dirX, dirY);
      if (len === 0) return;
      const f = kickFactor(t);
      kickX = kickX * f - (dirX / len) * px;
      kickY = kickY * f - (dirY / len) * px;
      kickAt = t;
    },
    zoomPunch(amount = o.maxZoomPunch) {
      const t = clock.now();
      zoomFrom = zoomAtTime(t);
      zoomPeak = clamp(Math.max(amount, zoomFrom), 0, o.maxZoomPunch);
      zoomAt = t;
    },
    sample(opts = {}) {
      const t = clock.now();
      const scale = Math.max(0, opts.scale ?? 1);
      const unit = opts.unit ?? 1;
      const trauma = traumaAtTime(t);
      const shake = trauma * trauma * scale;
      const x = (t / 1000) * o.frequencyHz;
      let dx = 0;
      let dy = 0;
      let rot = 0;
      if (shake > 0) {
        dx = o.maxOffset * unit * shake * perlin1(x + CHANNEL_X, o.seed);
        dy = o.maxOffset * unit * shake * perlin1(x + CHANNEL_Y, o.seed);
        rot = ((o.maxRollDeg * Math.PI) / 180) * shake * perlin1(x + CHANNEL_ROLL, o.seed);
      }
      const k = kickFactor(t) * Math.min(1, scale);
      dx += kickX * k * unit;
      dy += kickY * k * unit;
      if (opts.telegraph) {
        const cap = o.telegraphCap * unit;
        const len = Math.hypot(dx, dy);
        if (len > cap) {
          dx = (dx / len) * cap;
          dy = (dy / len) * cap;
        }
        rot = 0;
      }
      const zoom = 1 + zoomAtTime(t) * Math.min(1, scale);
      return { dx, dy, rot, zoom, trauma };
    },
    isIdle() {
      const t = clock.now();
      return (
        traumaAtTime(t) === 0 &&
        Math.hypot(kickX, kickY) * kickFactor(t) < 0.05 &&
        zoomAtTime(t) < 0.0005
      );
    },
    reset() {
      traumaBase = 0;
      kickX = 0;
      kickY = 0;
      zoomPeak = 0;
      zoomFrom = 0;
      zoomAt = -Infinity;
    },
  };
}
