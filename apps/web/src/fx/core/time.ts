/**
 * Presentation clock with hit-stop and slow-motion. Animation code reads `now()` (scaled ms)
 * or `scaledDelta(realDt)` instead of the wall clock, so a freeze holds every effect in place.
 * It never touches gameplay timing: the sim keeps its own hitstop in ticks.
 */
export interface FxClock {
  /** Scaled presentation time in ms; stops during a freeze, slows during slow-mo. */
  now(): number;
  realNow(): number;
  /** Current time scale (0 frozen, 1 normal). */
  scale(): number;
  /** Scaled length of the last `realDtMs` of wall time. */
  scaledDelta(realDtMs: number): number;
  /** Hit-stop: hold time for `ms`. Overlapping freezes extend instead of stacking. */
  freeze(ms: number): void;
  /** Runs at `factor` for `ms`, then ramps back to 1 over `rampMs`. */
  slowMo(factor: number, ms: number, rampMs?: number): void;
  /** KO "boss stop": freeze, then slow-mo, then a ramp back. */
  bossStop(stop: BossStop): void;
  isFrozen(): boolean;
  freezeRemainingMs(): number;
  reset(): void;
}

export interface BossStop {
  readonly freezeMs: number;
  readonly slowFactor: number;
  readonly slowMs: number;
  readonly rampMs: number;
}

/** Normal KO: 350 ms freeze, 0.3× for 700 ms, 200 ms ramp back. */
export const KO_STOP: BossStop = { freezeMs: 350, slowFactor: 0.3, slowMs: 700, rampMs: 200 };
/** Dragon death: 500 ms freeze and 1.2 s slow-mo. */
export const DRAGON_DEATH_STOP: BossStop = {
  freezeMs: 500,
  slowFactor: 0.3,
  slowMs: 1200,
  rampMs: 200,
};

export const MAX_FREEZE_MS = 600;
const HISTORY_MS = 2000;

interface Segment {
  readonly from: number;
  until: number;
  readonly rateFrom: number;
  readonly rateTo: number;
}

const rateIn = (s: Segment, t: number): number =>
  s.until <= s.from
    ? s.rateTo
    : s.rateFrom + ((s.rateTo - s.rateFrom) * (t - s.from)) / (s.until - s.from);

export function createFxClock(realNow: () => number): FxClock {
  let segments: Segment[] = [];
  let realBase = realNow();
  let fxBase = 0;

  const rateAt = (t: number): number => {
    let r = 1;
    for (const s of segments) if (t >= s.from && t < s.until) r = Math.min(r, rateIn(s, t));
    return Math.max(0, r);
  };

  /** Exact for linear rates; Simpson keeps the min-of-segments kinks negligible. */
  const integrate = (a: number, b: number): number => {
    if (b <= a) return 0;
    const cuts = [a, b];
    for (const s of segments) {
      if (s.from > a && s.from < b) cuts.push(s.from);
      if (s.until > a && s.until < b) cuts.push(s.until);
    }
    cuts.sort((x, y) => x - y);
    let acc = 0;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const p = cuts[i]!;
      const q = cuts[i + 1]!;
      if (q <= p) continue;
      const eps = Math.min(1e-6, (q - p) / 4);
      acc += ((q - p) * (rateAt(p) + 4 * rateAt((p + q) / 2) + rateAt(q - eps))) / 6;
    }
    return acc;
  };

  const sync = (): number => {
    const r = realNow();
    if (r > realBase) {
      fxBase += integrate(realBase, r);
      realBase = r;
      segments = segments.filter((s) => s.until > r - HISTORY_MS);
    }
    return r;
  };

  const activeFreeze = (r: number): Segment | undefined =>
    segments.find((s) => s.rateFrom === 0 && s.rateTo === 0 && r >= s.from && r < s.until);

  const freeze = (ms: number): void => {
    const r = sync();
    const len = Math.min(MAX_FREEZE_MS, Math.max(0, ms));
    if (len === 0) return;
    const cur = activeFreeze(r);
    if (cur) cur.until = Math.max(cur.until, r + len);
    else segments.push({ from: r, until: r + len, rateFrom: 0, rateTo: 0 });
  };

  const slowAfter = (start: number, factor: number, ms: number, rampMs: number): void => {
    const f = Math.min(1, Math.max(0.01, factor));
    segments.push({ from: start, until: start + ms, rateFrom: f, rateTo: f });
    if (rampMs > 0)
      segments.push({ from: start + ms, until: start + ms + rampMs, rateFrom: f, rateTo: 1 });
  };

  return {
    now() {
      sync();
      return fxBase;
    },
    realNow,
    scale: () => rateAt(realNow()),
    scaledDelta(realDtMs) {
      const r = realNow();
      return integrate(r - Math.max(0, realDtMs), r);
    },
    freeze,
    slowMo(factor, ms, rampMs = 200) {
      const r = sync();
      slowAfter(r, factor, Math.max(0, ms), Math.max(0, rampMs));
    },
    bossStop(stop) {
      const r = sync();
      freeze(stop.freezeMs);
      const start = r + Math.min(MAX_FREEZE_MS, Math.max(0, stop.freezeMs));
      slowAfter(start, stop.slowFactor, stop.slowMs, stop.rampMs);
    },
    isFrozen: () => rateAt(realNow()) === 0,
    freezeRemainingMs() {
      const r = realNow();
      let end = r;
      for (const s of segments)
        if (s.rateFrom === 0 && s.rateTo === 0 && r >= s.from && r < s.until)
          end = Math.max(end, s.until);
      return end - r;
    },
    reset() {
      sync();
      segments = [];
    },
  };
}
