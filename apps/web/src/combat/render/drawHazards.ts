import {
  Q,
  type CombatState,
  type DragonState,
  type Shape,
  type ZoneState,
} from '@dragon-rush/combat';
import { bamToRad } from './layout';
import { PAL } from './palette';

/** Shapes from state are Q8; `px` converts to arena px (sizes are already px). */
export function shapePx(sh: Shape): Shape {
  return { ...sh, x: sh.x / Q, y: sh.y / Q };
}

/** Traces a hazard shape; `grow` (0..1) shrinks it toward its origin for the filling telegraph. */
export function traceShape(ctx: CanvasRenderingContext2D, sh: Shape, grow = 1): void {
  const g = Math.max(0, Math.min(1, grow));
  ctx.beginPath();
  switch (sh.kind) {
    case 'circle':
      ctx.arc(sh.x, sh.y, Math.max(0.01, sh.r * g), 0, Math.PI * 2);
      return;
    case 'arc': {
      const dir = bamToRad(sh.dir);
      const half = bamToRad(sh.half);
      if (sh.half >= 128) {
        ctx.arc(sh.x, sh.y, Math.max(0.01, sh.r * g), 0, Math.PI * 2);
        return;
      }
      ctx.moveTo(sh.x, sh.y);
      ctx.arc(sh.x, sh.y, Math.max(0.01, sh.r * g), dir - half, dir + half);
      ctx.closePath();
      return;
    }
    case 'line': {
      const a = bamToRad(sh.dir);
      const len = sh.length * g;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      const nx = -cy * sh.halfWidth;
      const ny = cx * sh.halfWidth;
      ctx.moveTo(sh.x + nx, sh.y + ny);
      ctx.lineTo(sh.x + nx + cx * len, sh.y + ny + cy * len);
      ctx.lineTo(sh.x - nx + cx * len, sh.y - ny + cy * len);
      ctx.lineTo(sh.x - nx, sh.y - ny);
      ctx.closePath();
      return;
    }
  }
}

/** Diagonal hatch tile: damage telegraphs are always hatched (art-direction §2 `--hazard-*`). */
export function createHatch(doc: Document, color: string, gap = 8): CanvasPattern | null {
  const c = doc.createElement('canvas');
  c.width = gap;
  c.height = gap;
  const g = c.getContext('2d');
  if (!g) return null;
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-1, gap + 1);
  g.lineTo(gap + 1, -1);
  g.moveTo(-1, 1);
  g.lineTo(1, -1);
  g.moveTo(gap - 1, gap + 1);
  g.lineTo(gap + 1, gap - 1);
  g.stroke();
  return g.createPattern(c, 'repeat');
}

export interface HazardPaint {
  readonly hatch: CanvasPattern | null;
  readonly moonHatch: CanvasPattern | null;
}

/**
 * A filling telegraph: faint full footprint + outline, and the hatched ember fill growing from the
 * source (α .35 → .60). `moon` = push-only hazard (no damage).
 */
export function drawTelegraph(
  ctx: CanvasRenderingContext2D,
  sh: Shape,
  progress: number,
  paint: HazardPaint,
  moon = false,
): void {
  const p = Math.max(0, Math.min(1, progress));
  const fill = moon ? PAL.moon : PAL.hazardFill;
  const edge = moon ? PAL.moon : PAL.hazardEdge;
  ctx.save();
  traceShape(ctx, sh, 1);
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1.5;
  ctx.setLineDash(moon ? [6, 5] : []);
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.setLineDash([]);
  traceShape(ctx, sh, p);
  ctx.globalAlpha = 0.35 + 0.25 * p;
  ctx.fillStyle = fill;
  ctx.fill();
  const hatch = moon ? paint.moonHatch : paint.hatch;
  if (hatch) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = hatch;
    ctx.fill();
  }
  ctx.restore();
}

/** Duel fire ring: everything outside the circle burns (hatched), with a glowing edge. */
export function drawFireRing(
  ctx: CanvasRenderingContext2D,
  s: CombatState,
  paint: HazardPaint,
  flicker: number,
): void {
  const r = s.ringRadius;
  if (s.kind !== 'duel' || r <= 0) return;
  const cx = s.arenaW / 2;
  const cy = s.arenaH / 2;
  if (r * r >= cx * cx + cy * cy) {
    // Not yet inside the arena: show the coming ring faintly once it starts closing.
    if (s.tick < s.rules.ring.startTick - 180) return;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = PAL.emberHot;
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.min(r, cx + cy), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, s.arenaW, s.arenaH);
  ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
  ctx.globalAlpha = 0.24 + 0.06 * flicker;
  ctx.fillStyle = PAL.ember;
  ctx.fill('evenodd');
  if (paint.hatch) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = paint.hatch;
    ctx.fill('evenodd');
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 10;
  ctx.strokeStyle = PAL.emberHot;
  ctx.stroke();
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 2;
  ctx.strokeStyle = PAL.emberGlow;
  ctx.stroke();
  ctx.restore();
}

/** Zones: arming → telegraph; meteor/fireball active → blast; burning floor → flickering patch. */
export function drawZone(
  ctx: CanvasRenderingContext2D,
  z: ZoneState,
  paint: HazardPaint,
  now: number,
): void {
  const x = z.x / Q;
  const y = z.y / Q;
  const circle: Shape = { kind: 'circle', x, y, r: z.radius };
  if (z.arm > 0) {
    drawTelegraph(ctx, circle, z.age / Math.max(1, z.age + z.arm), paint);
    if (z.kind === 'meteor') drawRune(ctx, x, y, z.radius, now);
    return;
  }
  ctx.save();
  if (z.kind === 'burningFloor') {
    const f = 0.5 + 0.5 * Math.sin(now / 90 + x);
    traceShape(ctx, circle);
    ctx.globalAlpha = 0.22 + 0.1 * f;
    ctx.fillStyle = PAL.ember;
    ctx.fill();
    if (paint.hatch) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = paint.hatch;
      ctx.fill();
    }
  } else {
    const g = ctx.createRadialGradient(x, y, 0, x, y, z.radius);
    g.addColorStop(0, 'rgba(255, 246, 224, 0.95)');
    g.addColorStop(0.45, 'rgba(255, 178, 91, 0.8)');
    g.addColorStop(1, 'rgba(200, 64, 42, 0)');
    ctx.fillStyle = g;
    traceShape(ctx, circle);
    ctx.fill();
  }
  ctx.restore();
}

/** Mage meteor rune: rotating arcane ring over the hatched mark. */
function drawRune(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  now: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(now / 600);
  ctx.strokeStyle = '#B38CFF';
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
    ctx.lineTo(Math.cos(a + 1.05) * r * 0.82, Math.sin(a + 1.05) * r * 0.82);
    ctx.stroke();
  }
  ctx.restore();
}

/** Dragon telegraphs (ember hatched; Wing Gust is the moon-blue push) and the live breath cone. */
export function drawDragonHazards(
  ctx: CanvasRenderingContext2D,
  d: DragonState,
  s: CombatState,
  paint: HazardPaint,
  now: number,
): void {
  if (d.telegraph && d.stage === 'telegraph') {
    const progress = d.stageTick / Math.max(1, d.stageLen);
    drawTelegraph(ctx, shapePx(d.telegraph), progress, paint, d.maneuver === 'gust');
  }
  if (d.stage === 'active' && d.maneuver === 'breath') {
    const R = s.rules.dragon;
    const f = bamToRad(d.facing);
    const hx = d.x / Q + Math.cos(f) * R.head.forward;
    const hy = d.y / Q + Math.sin(f) * R.head.forward;
    const dir = bamToRad(d.aim);
    const half = bamToRad(R.breath.half);
    const flick = 0.85 + 0.15 * Math.sin(now / 37);
    const g = ctx.createRadialGradient(hx, hy, 4, hx, hy, R.breath.reach);
    g.addColorStop(0, 'rgba(255, 246, 224, 0.95)');
    g.addColorStop(0.25, 'rgba(255, 178, 91, 0.85)');
    g.addColorStop(0.7, 'rgba(255, 122, 61, 0.55)');
    g.addColorStop(1, 'rgba(200, 64, 42, 0)');
    ctx.save();
    ctx.globalAlpha = flick;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.arc(hx, hy, R.breath.reach * flick, dir - half, dir + half);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if (d.stage === 'active' && d.maneuver === 'gust') {
    const R = s.rules.dragon.gust;
    ctx.save();
    ctx.strokeStyle = PAL.moon;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const k = (((now / 600 + i / 3) % 1) + 1) % 1;
      ctx.globalAlpha = 0.5 * (1 - k);
      ctx.beginPath();
      ctx.arc(d.x / Q, d.y / Q, 40 + k * (R.reach - 40), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
