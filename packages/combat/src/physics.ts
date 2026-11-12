import { dragonPush } from './dragon';
import { dragonHurtCircles } from './geometry';
import { isInvulnerable } from './hits';
import { isqrt, mulDivTrunc, Q } from './math';
import { emit, pos, type Ctx, type MFighter } from './work';

function applyKnockback(f: MFighter): void {
  if (f.kbLeft <= 0 || f.mode === 'ko') return;
  f.x += mulDivTrunc(f.kbx, f.kbLeft, f.kbTotal);
  f.y += mulDivTrunc(f.kby, f.kbLeft, f.kbTotal);
  f.kbLeft -= 1;
}

/** Dashing fighters with active i-frames pass through each other (cross-ups); bodies otherwise collide. */
function passesThrough(f: MFighter): boolean {
  return f.mode === 'dash' && isInvulnerable(f);
}

function separate(c: Ctx, a: MFighter, b: MFighter): void {
  if (a.mode === 'ko' || b.mode === 'ko' || passesThrough(a) || passesThrough(b)) return;
  const minD = 2 * c.r.body.bodyRadius * Q;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return;
  if (d2 === 0) {
    a.x -= minD / 2;
    b.x += minD / 2;
    return;
  }
  const dist = isqrt(d2);
  const half = Math.ceil((minD - dist) / 2);
  const px = mulDivTrunc(dx, half, dist);
  const py = mulDivTrunc(dy, half, dist);
  a.x -= px;
  a.y -= py;
  b.x += px;
  b.y += py;
}

/** The dragon body is immovable: the challenger is pushed out of its circles. */
function pushOutOfDragon(c: Ctx, f: MFighter): void {
  const d = c.s.dragon;
  if (!d || d.airborne || f.mode === 'ko') return;
  const br = c.r.body.bodyRadius;
  for (const h of dragonHurtCircles(c.r, d)) {
    if (h.head) continue;
    const minD = (h.r + br) * Q;
    const dx = f.x - h.x;
    const dy = f.y - h.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minD * minD) continue;
    if (d2 === 0) {
      f.y += minD;
      continue;
    }
    const dist = isqrt(d2);
    const push = minD - dist;
    f.x += mulDivTrunc(dx, push, dist);
    f.y += mulDivTrunc(dy, push, dist);
  }
}

/** Keeps the fighter in the arena; a knockback into a wall becomes a WallSlam with extra hitstun. */
function clampFighter(c: Ctx, f: MFighter): void {
  const r = c.r.body.bodyRadius * Q;
  const maxX = c.s.arenaW * Q - r;
  const maxY = c.s.arenaH * Q - r;
  const x = Math.min(Math.max(f.x, r), maxX);
  const y = Math.min(Math.max(f.y, r), maxY);
  if (x === f.x && y === f.y) return;
  f.x = x;
  f.y = y;
  if (f.mode !== 'hitstun' || f.kbLeft <= 0 || f.wallSlammed) return;
  const speed = Math.max(Math.abs(f.kbx), Math.abs(f.kby));
  if (mulDivTrunc(speed, f.kbLeft, f.kbTotal) < Q) return;
  f.wallSlammed = true;
  f.kbLeft = 0;
  f.hitstun += c.r.wallSlamStun;
  emit(c, f.side, { type: 'WallSlam', who: f.side, pos: pos(f.x, f.y) });
}

export function physics(c: Ctx): void {
  const s = c.s;
  applyKnockback(s.a);
  if (s.b) applyKnockback(s.b);
  dragonPush(c);
  if (s.b) separate(c, s.a, s.b);
  pushOutOfDragon(c, s.a);
  clampFighter(c, s.a);
  if (s.b) clampFighter(c, s.b);
}
