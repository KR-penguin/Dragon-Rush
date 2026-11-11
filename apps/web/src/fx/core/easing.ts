/** Easing curves (t in 0..1) and a tiny tween helper. Pure, no DOM. */
export type Easing = (t: number) => number;

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (t: number): number => clamp(t, 0, 1);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number =>
  a === b ? 0 : (v - a) / (b - a);

export const linear: Easing = (t) => t;
export const easeInQuad: Easing = (t) => t * t;
export const easeOutQuad: Easing = (t) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad: Easing = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeInCubic: Easing = (t) => t * t * t;
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic: Easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutQuart: Easing = (t) => 1 - (1 - t) ** 4;
export const easeOutExpo: Easing = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** Overshoots past 1 before settling; `s` controls the overshoot (1.70158 ≈ 10%). */
export const backOut =
  (s = 1.70158): Easing =>
  (t) => {
    const u = t - 1;
    return 1 + (s + 1) * u * u * u + s * u * u;
  };
export const backIn =
  (s = 1.70158): Easing =>
  (t) =>
    (s + 1) * t * t * t - s * t * t;
export const easeOutBack: Easing = backOut();
export const easeInBack: Easing = backIn();

const ELASTIC_C4 = (2 * Math.PI) / 3;
export const easeOutElastic: Easing = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1;

export const easeOutBounce: Easing = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

/** Value of a tween `elapsed` ms after it started (before the delay it holds `from`). */
export function sampleTween(
  from: number,
  to: number,
  elapsedMs: number,
  durationMs: number,
  ease: Easing = easeOutCubic,
  delayMs = 0,
): number {
  if (durationMs <= 0) return elapsedMs >= delayMs ? to : from;
  return lerp(from, to, ease(clamp01((elapsedMs - delayMs) / durationMs)));
}

export interface TweenOptions {
  readonly from: number;
  readonly to: number;
  readonly durationMs: number;
  readonly ease?: Easing;
  readonly delayMs?: number;
  readonly onUpdate?: (value: number) => void;
  readonly onComplete?: () => void;
}

export interface Tween {
  readonly value: number;
  readonly done: boolean;
  /** Advances by `dtMs` (caller-supplied, so hit-stop/slow-mo apply) and returns the value. */
  step(dtMs: number): number;
}

export function createTween(o: TweenOptions): Tween {
  let elapsed = 0;
  let value = o.from;
  let done = false;
  const total = (o.delayMs ?? 0) + o.durationMs;
  return {
    get value() {
      return value;
    },
    get done() {
      return done;
    },
    step(dtMs) {
      if (done) return value;
      elapsed += Math.max(0, dtMs);
      value = sampleTween(o.from, o.to, elapsed, o.durationMs, o.ease, o.delayMs);
      o.onUpdate?.(value);
      if (elapsed >= total) {
        done = true;
        o.onComplete?.();
      }
      return value;
    },
  };
}

/** Steps a set of tweens together and drops finished ones. */
export function createTweenGroup() {
  const tweens = new Set<Tween>();
  return {
    add(o: TweenOptions): Tween {
      const t = createTween(o);
      tweens.add(t);
      return t;
    },
    step(dtMs: number): void {
      for (const t of tweens) {
        t.step(dtMs);
        if (t.done) tweens.delete(t);
      }
    },
    get size(): number {
      return tweens.size;
    },
    clear(): void {
      tweens.clear();
    },
  };
}

/** Frame-rate independent exponential decay: `k` is the per-60 Hz-tick retention (0.85 = keep 85%). */
export const decayPerTick = (k: number, dtMs: number): number => k ** ((dtMs * 60) / 1000);

export const dbToGain = (db: number): number => 10 ** (db / 20);
export const semitonesToRate = (semitones: number): number => 2 ** (semitones / 12);
export const centsToRate = (cents: number): number => 2 ** (cents / 1200);
