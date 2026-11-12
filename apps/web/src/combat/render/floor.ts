import type { CombatKind } from '@dragon-rush/combat';
import { createFxRng } from '../../fx/core/rng';
import { PAL } from './palette';

const TILE = 32;

/**
 * Procedural arena floor (art-direction §10): mid-dark, low-saturation flagstones, no red/orange
 * inside the play area so telegraphs always read. Painted once per fight into an offscreen canvas.
 */
export function paintFloor(
  doc: Document,
  w: number,
  h: number,
  kind: CombatKind,
  seed: number,
  pixelScale: number,
): HTMLCanvasElement {
  const c = doc.createElement('canvas');
  c.width = Math.max(1, Math.round(w * pixelScale));
  c.height = Math.max(1, Math.round(h * pixelScale));
  const g = c.getContext('2d');
  if (!g) return c;
  g.scale(pixelScale, pixelScale);
  const rng = createFxRng(seed >>> 0 || 1);
  const base = kind === 'dragonFight' ? [52, 47, 46] : [55, 54, 50];
  for (let ty = 0; ty < h; ty += TILE) {
    for (let tx = 0; tx < w; tx += TILE) {
      const v = Math.round((rng.next() - 0.5) * 10);
      const [r, gg, b] = base.map((x) => x + v) as [number, number, number];
      g.fillStyle = `rgb(${r}, ${gg}, ${b})`;
      g.fillRect(tx, ty, TILE, TILE);
      // worn speckles
      for (let i = 0; i < 6; i++) {
        g.fillStyle = rng.next() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.04)';
        g.fillRect(
          tx + rng.next() * TILE,
          ty + rng.next() * TILE,
          1 + rng.next() * 2,
          1 + rng.next() * 2,
        );
      }
      if (rng.next() < 0.08) {
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = 1;
        g.beginPath();
        const sx = tx + rng.next() * TILE;
        const sy = ty + rng.next() * TILE;
        g.moveTo(sx, sy);
        g.lineTo(sx + (rng.next() - 0.5) * 20, sy + (rng.next() - 0.5) * 20);
        g.stroke();
      }
    }
  }
  // grout
  g.strokeStyle = 'rgba(20, 16, 14, 0.55)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= w; x += TILE) {
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, h);
  }
  for (let y = 0; y <= h; y += TILE) {
    g.moveTo(0, y + 0.5);
    g.lineTo(w, y + 0.5);
  }
  g.stroke();
  // inner shade toward the walls
  const v = g.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.65,
  );
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  if (kind === 'dragonFight') {
    // the lair: scorched basalt near the dragon's perch (top centre), kept dark, not orange
    const s = g.createRadialGradient(w / 2, 70, 10, w / 2, 70, 220);
    s.addColorStop(0, 'rgba(10, 6, 6, 0.55)');
    s.addColorStop(1, 'rgba(10, 6, 6, 0)');
    g.fillStyle = s;
    g.fillRect(0, 0, w, h);
  }
  return c;
}

/** Walls around the arena: walnut rim with a gold bead (the board's table material). */
export function drawArenaFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.fillStyle = PAL.woodDark;
  ctx.fillRect(x - 12, y - 12, w + 24, 12);
  ctx.fillRect(x - 12, y + h, w + 24, 12);
  ctx.fillRect(x - 12, y, 12, h);
  ctx.fillRect(x + w, y, 12, h);
  ctx.strokeStyle = PAL.goldDeep;
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 12.5, y - 12.5, w + 25, h + 25);
  ctx.restore();
}
