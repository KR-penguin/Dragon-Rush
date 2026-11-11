import { angleDiff, atan2i, cosQ14, divRound, isqrt, Q, sinQ14, TRIG_ONE } from './math';
import type { CombatRules } from './rules';
import type { DragonState, Shape } from './types';

/** Circle vs circle; positions Q8, radii px. Squared distances only. */
export function circleHit(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const rr = (ar + br) * Q;
  return dx * dx + dy * dy <= rr * rr;
}

/**
 * Arc (sector) of radius `reach` px and half-angle `half` BAM around `dir`, against a target circle.
 * The angular test widens by the target's apparent half-size so large hurtboxes are not missed at the edges.
 */
export function arcHit(
  ox: number,
  oy: number,
  reach: number,
  dir: number,
  half: number,
  tx: number,
  ty: number,
  tr: number,
): boolean {
  const dx = tx - ox;
  const dy = ty - oy;
  const d2 = dx * dx + dy * dy;
  const rr = (reach + tr) * Q;
  if (d2 > rr * rr) return false;
  if (half >= 128) return true;
  const tq = tr * Q;
  if (d2 <= tq * tq) return true;
  const diff = angleDiff(atan2i(dy, dx), dir);
  if (diff <= half) return true;
  // apparent half-size of the target in BAM ~ tr / dist * 256 / (2*pi) ~ tr * 41 / dist
  const tol = divRound(tq * 41, isqrt(d2));
  return diff <= half + tol;
}

/** Line (oriented rectangle) from (ox, oy) along `dir`, `length` px long and 2*halfWidth px wide. */
export function lineHit(
  ox: number,
  oy: number,
  dir: number,
  length: number,
  halfWidth: number,
  tx: number,
  ty: number,
  tr: number,
): boolean {
  const dx = tx - ox;
  const dy = ty - oy;
  const c = cosQ14(dir);
  const s = sinQ14(dir);
  const along = (dx * c + dy * s) / TRIG_ONE;
  const across = Math.abs(dy * c - dx * s) / TRIG_ONE;
  const tq = tr * Q;
  return along >= -tq && along <= (length + tr) * Q && across <= (halfWidth + tr) * Q;
}

export function shapeHit(sh: Shape, tx: number, ty: number, tr: number): boolean {
  switch (sh.kind) {
    case 'circle':
      return circleHit(sh.x, sh.y, sh.r, tx, ty, tr);
    case 'arc':
      return arcHit(sh.x, sh.y, sh.r, sh.dir, sh.half, tx, ty, tr);
    case 'line':
      return lineHit(sh.x, sh.y, sh.dir, sh.length, sh.halfWidth, tx, ty, tr);
  }
}

/** A point `dist` px from (x, y) along `angle`, Q8. */
export function offsetX(x: number, angle: number, dist: number): number {
  return x + Math.round((dist * Q * cosQ14(angle)) / TRIG_ONE);
}

export function offsetY(y: number, angle: number, dist: number): number {
  return y + Math.round((dist * Q * sinQ14(angle)) / TRIG_ONE);
}

export interface HurtCircle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly head: boolean;
}

/** Dragon hurtboxes: head first (weak point), then the body circles. Empty while airborne. */
export function dragonHurtCircles(r: CombatRules, d: DragonState): HurtCircle[] {
  if (d.airborne) return [];
  const R = r.dragon;
  const out: HurtCircle[] = [
    { x: offsetX(d.x, d.facing, R.head.forward), y: offsetY(d.y, d.facing, R.head.forward), r: R.head.r, head: true },
  ];
  for (const b of R.body) out.push({ x: d.x + b.dx * Q, y: d.y + b.dy * Q, r: b.r, head: false });
  return out;
}

/** Horizontal half-extent of the dragon body (px), used to keep it inside the arena. */
export function dragonHalfWidth(r: CombatRules): number {
  let w = 0;
  for (const b of r.dragon.body) w = Math.max(w, Math.abs(b.dx) + b.r);
  return w;
}

export function dragonHalfHeight(r: CombatRules): number {
  let h = 0;
  for (const b of r.dragon.body) h = Math.max(h, Math.abs(b.dy) + b.r);
  return h;
}
