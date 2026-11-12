import { Q, type CombatState, type FighterState } from '@dragon-rush/combat';

/** Render-only correction smoothing; never fed back into the sim or hitboxes. */
export const SNAP_PX = 48;
const ZERO_PX = 0.25;
const K_REMOTE_NEAR = 0.9;
const K_REMOTE_FAR = 0.8;
const K_OWN = 0.75;
const K_ACTIVE_HIT = 0.6;
const NEAR_PX = 6;

interface Offset {
  dx: number;
  dy: number;
}

interface Pose {
  readonly x: number;
  readonly y: number;
  readonly cat: string;
  readonly hit: boolean;
}

const fighterCat = (f: FighterState): string =>
  f.mode === 'dash' || f.mode === 'ko' ? `${f.mode}:${f.move ?? ''}` : f.kbLeft > 0 ? 'kb' : 'base';

/** Entity key -> position in px for everything that can be corrected. */
export function posesOf(s: CombatState): Map<string, Pose> {
  const m = new Map<string, Pose>();
  const fighter = (key: string, f: FighterState) =>
    m.set(key, { x: f.x / Q, y: f.y / Q, cat: fighterCat(f), hit: f.phase === 'active' });
  fighter('a', s.a);
  if (s.b) fighter('b', s.b);
  if (s.dragon) m.set('dragon', { x: s.dragon.x / Q, y: s.dragon.y / Q, cat: s.dragon.stage, hit: s.dragon.stage === 'active' });
  for (const p of s.projectiles) m.set(`p${p.id}`, { x: p.x / Q, y: p.y / Q, cat: 'p', hit: false });
  return m;
}

/**
 * offset += pre - post on every re-simulation, snapping on big jumps or category changes, then decaying
 * per frame (frame-rate independent). Own fighter decays faster; an entity in an active hit frame fastest
 * so contact looks connected.
 */
export class VisualSmoother {
  private readonly offsets = new Map<string, Offset>();
  snaps = 0;

  constructor(private readonly ownKey: 'a' | 'b' | null) {}

  correct(pre: Map<string, Pose>, post: Map<string, Pose>): void {
    for (const [key, p] of post) {
      const q = pre.get(key);
      if (!q) continue;
      const o = this.offsets.get(key) ?? { dx: 0, dy: 0 };
      if (q.cat !== p.cat) {
        if (o.dx !== 0 || o.dy !== 0 || q.x !== p.x || q.y !== p.y) this.snaps += 1;
        this.offsets.delete(key);
        continue;
      }
      o.dx += q.x - p.x;
      o.dy += q.y - p.y;
      if (Math.hypot(o.dx, o.dy) > SNAP_PX) {
        this.snaps += 1;
        this.offsets.delete(key);
        continue;
      }
      if (o.dx !== 0 || o.dy !== 0) this.offsets.set(key, o);
    }
    for (const key of this.offsets.keys()) if (!post.has(key)) this.offsets.delete(key);
  }

  decay(dtMs: number, now: Map<string, Pose>): void {
    const frames = (dtMs * 60) / 1000;
    for (const [key, o] of this.offsets) {
      const mag = Math.hypot(o.dx, o.dy);
      const k = now.get(key)?.hit
        ? K_ACTIVE_HIT
        : key === this.ownKey
          ? K_OWN
          : mag <= NEAR_PX
            ? K_REMOTE_NEAR
            : K_REMOTE_FAR;
      const f = Math.pow(k, frames);
      o.dx *= f;
      o.dy *= f;
      if (Math.hypot(o.dx, o.dy) < ZERO_PX) this.offsets.delete(key);
    }
  }

  snapAll(): void {
    this.offsets.clear();
  }

  /** Largest current offset (px), for stats and tests. */
  maxOffset(): number {
    let m = 0;
    for (const o of this.offsets.values()) m = Math.max(m, Math.hypot(o.dx, o.dy));
    return m;
  }

  offsetOf(key: string): { dx: number; dy: number } {
    const o = this.offsets.get(key);
    return o ? { dx: o.dx, dy: o.dy } : { dx: 0, dy: 0 };
  }

  /** A render copy of `s` with the offsets applied (Q8 positions may become fractional: render only). */
  apply(s: CombatState): CombatState {
    if (this.offsets.size === 0) return s;
    const shift = <T extends { x: number; y: number }>(key: string, e: T): T => {
      const o = this.offsets.get(key);
      return o ? { ...e, x: e.x + o.dx * Q, y: e.y + o.dy * Q } : e;
    };
    return {
      ...s,
      a: shift('a', s.a),
      b: s.b ? shift('b', s.b) : null,
      dragon: s.dragon ? shift('dragon', s.dragon) : null,
      projectiles: s.projectiles.map((p) => shift(`p${p.id}`, p)),
    };
  }
}
