import { dragonHurtCircles, shapeHit } from '../geometry';
import { angleDelta, angleDiff, atan2i, cosQ14, isqrt, MOVE_BAM, mulQ14, Q, sinQ14 } from '../math';
import type { CombatState, FighterState, Shape } from '../types';

/** What a bot aims at: the opponent fighter, or the dragon's nearest hurt circle (head first while lowered). */
export interface Target {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly fighter: FighterState | null;
}

export function targetOf(s: CombatState, me: FighterState): Target | null {
  const d = s.dragon;
  if (d) {
    if (d.hp <= 0) return null;
    const circles = dragonHurtCircles(s.rules, d);
    if (circles.length === 0) return { x: d.tx || d.x, y: d.ty || d.y, r: 0, fighter: null };
    let best = circles[0]!;
    let bestD = Number.POSITIVE_INFINITY;
    for (const c of circles) {
      const dx = c.x - me.x;
      const dy = c.y - me.y;
      // prefer the lowered head: it is a x1.5 weak point
      const d2 = (dx * dx + dy * dy) * (c.head && d.headLowered > 0 ? 0.25 : 1);
      if (d2 < bestD) {
        bestD = d2;
        best = c;
      }
    }
    return { x: best.x, y: best.y, r: best.r, fighter: null };
  }
  const o = me.side === 'a' ? s.b : s.a;
  if (!o || o.mode === 'ko') return null;
  return { x: o.x, y: o.y, r: s.rules.body.hurtRadius, fighter: o };
}

/** Distance in px between two Q8 points. */
export function distPx(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return isqrt(dx * dx + dy * dy) / Q;
}

export interface Escape {
  /** Escape direction (BAM). */
  readonly angle: number;
  /** px still to travel to be safe. */
  readonly needed: number;
}

function insideArena(s: CombatState, x: number, y: number, pad: number): boolean {
  const p = pad * Q;
  return x >= p && y >= p && x <= s.arenaW * Q - p && y <= s.arenaH * Q - p;
}

function landing(x: number, y: number, angle: number, px: number): [number, number] {
  return [
    x + mulQ14(Math.round(px * Q), cosQ14(angle)),
    y + mulQ14(Math.round(px * Q), sinQ14(angle)),
  ];
}

/** Cheapest way out of a hazard shape that does not run into a wall; null when not inside it. */
export function escapeShape(
  s: CombatState,
  sh: Shape,
  me: FighterState,
  pad: number,
): Escape | null {
  const hurt = s.rules.body.hurtRadius + pad;
  if (!shapeHit(sh, me.x, me.y, hurt)) return null;
  const body = s.rules.body.bodyRadius;
  const cands: Escape[] = [];
  const dist = distPx(sh.x, sh.y, me.x, me.y);
  const away = dist > 0 ? atan2i(me.y - sh.y, me.x - sh.x) : 64;
  if (sh.kind === 'circle') cands.push({ angle: away, needed: sh.r + hurt - dist });
  else if (sh.kind === 'arc') {
    cands.push({ angle: away, needed: sh.r + hurt - dist });
    if (sh.half < 128) {
      const delta = angleDelta(sh.dir, away);
      const remaining = sh.half - Math.abs(delta);
      // arc length to the nearer edge ~ dist * remaining * 2*pi/256
      const lateral = dist * Math.max(0, remaining) * 0.0245 + hurt;
      const side = delta >= 0 ? 64 : -64;
      cands.push({ angle: (away + side) & 255, needed: lateral });
      cands.push({ angle: (away - side) & 255, needed: lateral + 2 * dist * sh.half * 0.0245 });
    }
  } else {
    const c = cosQ14(sh.dir);
    const sn = sinQ14(sh.dir);
    const across = ((me.y - sh.y) * c - (me.x - sh.x) * sn) / (16384 * Q);
    const side = across >= 0 ? 64 : -64;
    cands.push({ angle: (sh.dir + side) & 255, needed: sh.halfWidth + hurt - Math.abs(across) });
    cands.push({ angle: (sh.dir - side) & 255, needed: sh.halfWidth + hurt + Math.abs(across) });
  }
  let best: Escape | null = null;
  for (const e of cands) {
    const [x, y] = landing(me.x, me.y, e.angle, Math.max(e.needed, 0) + 4);
    if (!insideArena(s, x, y, body)) continue;
    if (!best || e.needed < best.needed) best = e;
  }
  return best ?? cands[0] ?? null;
}

/** Nearest move direction (1..8) to a BAM angle. */
export function moveToward(angle: number): number {
  const step = ((angle + 16) & 255) >> 5;
  return ((step + 2) % 8) + 1;
}

/** Best of the 8 directions to put distance between me and (tx, ty) without hugging walls or leaving the ring. */
export function bestAway(s: CombatState, me: FighterState, tx: number, ty: number): number {
  let bestK = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  const pad = s.rules.body.bodyRadius + 40;
  const ring = s.kind === 'duel' ? (s.ringRadius - 30) * Q : 0;
  const cx = (s.arenaW / 2) * Q;
  const cy = (s.arenaH / 2) * Q;
  for (let k = 1; k <= 8; k++) {
    const [x, y] = landing(me.x, me.y, MOVE_BAM[k]!, 56);
    let score = distPx(x, y, tx, ty);
    if (!insideArena(s, x, y, pad)) score -= 200;
    if (ring > 0) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > ring * ring) score -= 300;
    }
    if (score > bestScore) {
      bestScore = score;
      bestK = k;
    }
  }
  return bestK;
}

/** True when the shape-facing attacker `o` is pointing its arc at (x, y). */
export function aimedAt(o: FighterState, x: number, y: number, half: number): boolean {
  return half >= 128 || angleDiff(atan2i(y - o.y, x - o.x), o.aim) <= half + 16;
}
