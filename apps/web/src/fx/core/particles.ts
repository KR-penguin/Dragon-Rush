import { decayPerTick, easeInCubic, easeOutQuad } from './easing';

/**
 * Pooled particle simulation, struct-of-arrays with a hard live cap. Renderer-agnostic:
 * positions are in whatever space the caller emits in (screen CSS px or arena logical px).
 */
export const PARTICLE_CAP = 500;

export const PARTICLE_SHAPES = [
  'dot',
  'streak',
  'square',
  'coin',
  'star',
  'smoke',
  'ring',
] as const;
export type ParticleShape = (typeof PARTICLE_SHAPES)[number];
const SHAPE_ID: Record<ParticleShape, number> = {
  dot: 0,
  streak: 1,
  square: 2,
  coin: 3,
  star: 4,
  smoke: 5,
  ring: 6,
};

export const MOTION_BALLISTIC = 0;
export const MOTION_FLIGHT = 1;

export interface ParticleSpawn {
  readonly x: number;
  readonly y: number;
  readonly vx?: number;
  readonly vy?: number;
  /** px/s² downward. */
  readonly gravity?: number;
  /** Velocity retention per 60 Hz tick (1 = no drag). */
  readonly drag?: number;
  readonly lifeMs: number;
  /** Hidden and inert until this many ms have passed (staggering). */
  readonly delayMs?: number;
  readonly size: number;
  readonly sizeEnd?: number;
  readonly rot?: number;
  /** rad/s. */
  readonly spin?: number;
  readonly color: string;
  readonly alpha?: number;
  /** Fraction of life spent fading in. */
  readonly fadeIn?: number;
  readonly shape: ParticleShape;
  readonly additive?: boolean;
  /** Streak length per px/s of speed; ring start stroke width. */
  readonly stretch?: number;
}

export interface FlightSpawn {
  readonly from: { readonly x: number; readonly y: number };
  readonly burst: { readonly x: number; readonly y: number };
  readonly control: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly burstMs: number;
  readonly flyMs: number;
  readonly delayMs: number;
  readonly size: number;
  readonly color: string;
  readonly shape: ParticleShape;
  readonly spin?: number;
  /** Arrivals are reported per group (e.g. one coin shower → one HUD counter). */
  readonly group: number;
}

export interface ParticleArrival {
  readonly group: number;
  readonly x: number;
  readonly y: number;
}

/** Read-only SoA views for renderers; only indices < `count` are live. */
export interface ParticleData {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly delay: Float32Array;
  readonly size0: Float32Array;
  readonly size1: Float32Array;
  readonly rot: Float32Array;
  readonly alpha: Float32Array;
  readonly fadeIn: Float32Array;
  readonly stretch: Float32Array;
  readonly shape: Uint8Array;
  readonly additive: Uint8Array;
  readonly motion: Uint8Array;
  readonly color: Uint16Array;
}

export interface ParticlePool {
  readonly capacity: number;
  readonly count: number;
  readonly data: ParticleData;
  colorOf(i: number): string;
  shapeOf(i: number): ParticleShape;
  /** Returns the slot index, or -1 when the pool is full (new particles are dropped). */
  spawn(p: ParticleSpawn): number;
  spawnFlight(f: FlightSpawn): number;
  update(dtMs: number): void;
  drainArrivals(): ParticleArrival[];
  clear(): void;
}

export function createParticlePool(capacity: number = PARTICLE_CAP): ParticlePool {
  const f32 = () => new Float32Array(capacity);
  const d = {
    x: f32(),
    y: f32(),
    vx: f32(),
    vy: f32(),
    gravity: f32(),
    drag: f32(),
    age: f32(),
    life: f32(),
    delay: f32(),
    size0: f32(),
    size1: f32(),
    rot: f32(),
    spin: f32(),
    alpha: f32(),
    fadeIn: f32(),
    stretch: f32(),
    // Flight path: origin, burst point, control point, target, phase lengths.
    ox: f32(),
    oy: f32(),
    bx: f32(),
    by: f32(),
    cx: f32(),
    cy: f32(),
    tx: f32(),
    ty: f32(),
    burstMs: f32(),
    group: new Int32Array(capacity),
    shape: new Uint8Array(capacity),
    additive: new Uint8Array(capacity),
    motion: new Uint8Array(capacity),
    color: new Uint16Array(capacity),
  };
  const arrays = Object.values(d);
  const palette: string[] = [];
  const paletteIndex = new Map<string, number>();
  let count = 0;
  let arrivals: ParticleArrival[] = [];

  const colorId = (c: string): number => {
    let id = paletteIndex.get(c);
    if (id === undefined) {
      id = palette.length;
      palette.push(c);
      paletteIndex.set(c, id);
    }
    return id;
  };

  const kill = (i: number): void => {
    const last = count - 1;
    if (i !== last) for (const a of arrays) a[i] = a[last]!;
    count = last;
  };

  const spawn = (p: ParticleSpawn): number => {
    if (count >= capacity) return -1;
    const i = count++;
    d.x[i] = p.x;
    d.y[i] = p.y;
    d.vx[i] = p.vx ?? 0;
    d.vy[i] = p.vy ?? 0;
    d.gravity[i] = p.gravity ?? 0;
    d.drag[i] = p.drag ?? 1;
    d.age[i] = 0;
    d.life[i] = Math.max(1, p.lifeMs);
    d.delay[i] = p.delayMs ?? 0;
    d.size0[i] = p.size;
    d.size1[i] = p.sizeEnd ?? p.size;
    d.rot[i] = p.rot ?? 0;
    d.spin[i] = p.spin ?? 0;
    d.alpha[i] = p.alpha ?? 1;
    d.fadeIn[i] = p.fadeIn ?? 0;
    d.stretch[i] = p.stretch ?? 0;
    d.shape[i] = SHAPE_ID[p.shape];
    d.additive[i] = p.additive ? 1 : 0;
    d.motion[i] = MOTION_BALLISTIC;
    d.color[i] = colorId(p.color);
    d.group[i] = -1;
    return i;
  };

  return {
    capacity,
    get count() {
      return count;
    },
    data: d,
    colorOf: (i) => palette[d.color[i]!] ?? '#fff',
    shapeOf: (i) => PARTICLE_SHAPES[d.shape[i]!] ?? 'dot',
    spawn,
    spawnFlight(f) {
      const i = spawn({
        x: f.from.x,
        y: f.from.y,
        lifeMs: f.burstMs + f.flyMs,
        delayMs: f.delayMs,
        size: f.size,
        color: f.color,
        shape: f.shape,
        spin: f.spin ?? 0,
      });
      if (i < 0) return i;
      d.motion[i] = MOTION_FLIGHT;
      d.ox[i] = f.from.x;
      d.oy[i] = f.from.y;
      d.bx[i] = f.burst.x;
      d.by[i] = f.burst.y;
      d.cx[i] = f.control.x;
      d.cy[i] = f.control.y;
      d.tx[i] = f.to.x;
      d.ty[i] = f.to.y;
      d.burstMs[i] = f.burstMs;
      d.group[i] = f.group;
      return i;
    },
    update(dtMs) {
      if (dtMs <= 0) return;
      const dt = dtMs / 1000;
      let i = 0;
      while (i < count) {
        const age = (d.age[i] = d.age[i]! + dtMs);
        const local = age - d.delay[i]!;
        if (local < 0) {
          i++;
          continue;
        }
        if (d.motion[i] === MOTION_FLIGHT) {
          const burst = d.burstMs[i]!;
          const fly = d.life[i]! - burst;
          if (local < burst) {
            const e = easeOutQuad(local / burst);
            d.x[i] = d.ox[i]! + (d.bx[i]! - d.ox[i]!) * e;
            d.y[i] = d.oy[i]! + (d.by[i]! - d.oy[i]!) * e;
          } else {
            const t = (local - burst) / Math.max(1, fly);
            if (t >= 1) {
              arrivals.push({ group: d.group[i]!, x: d.tx[i]!, y: d.ty[i]! });
              kill(i);
              continue;
            }
            const e = easeInCubic(t);
            const u = 1 - e;
            d.x[i] = u * u * d.bx[i]! + 2 * u * e * d.cx[i]! + e * e * d.tx[i]!;
            d.y[i] = u * u * d.by[i]! + 2 * u * e * d.cy[i]! + e * e * d.ty[i]!;
          }
          d.rot[i] = d.rot[i]! + d.spin[i]! * dt;
          i++;
          continue;
        }
        if (local >= d.life[i]!) {
          kill(i);
          continue;
        }
        const damp = d.drag[i]! === 1 ? 1 : decayPerTick(d.drag[i]!, dtMs);
        d.vy[i] = (d.vy[i]! + d.gravity[i]! * dt) * damp;
        d.vx[i] = d.vx[i]! * damp;
        d.x[i] = d.x[i]! + d.vx[i]! * dt;
        d.y[i] = d.y[i]! + d.vy[i]! * dt;
        d.rot[i] = d.rot[i]! + d.spin[i]! * dt;
        i++;
      }
    },
    drainArrivals() {
      const out = arrivals;
      arrivals = [];
      return out;
    },
    clear() {
      count = 0;
      arrivals = [];
    },
  };
}

/** Life progress 0..1 of a live particle (0 while still delayed). */
export function particleProgress(data: ParticleData, i: number): number {
  const local = data.age[i]! - data.delay[i]!;
  return local <= 0 ? 0 : Math.min(1, local / data.life[i]!);
}
