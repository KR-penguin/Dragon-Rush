import { easeOutQuad, lerp } from '../core/easing';
import { MOTION_FLIGHT, type ParticlePool } from '../core/particles';

/**
 * Canvas 2D renderer for a particle pool. Draws in the context's current transform, so the
 * screen overlay passes a DPR transform and the arena passes its camera transform.
 */
const softSprites = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
const SPRITE = 64;

function softSprite(color: string): HTMLCanvasElement | OffscreenCanvas | null {
  let s = softSprites.get(color);
  if (s) return s;
  const canvas: HTMLCanvasElement | OffscreenCanvas | null =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(SPRITE, SPRITE)
      : typeof document !== 'undefined'
        ? Object.assign(document.createElement('canvas'), { width: SPRITE, height: SPRITE })
        : null;
  const g = canvas?.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!canvas || !g) return null;
  const grad = g.createRadialGradient(
    SPRITE / 2,
    SPRITE / 2,
    0,
    SPRITE / 2,
    SPRITE / 2,
    SPRITE / 2,
  );
  grad.addColorStop(0, color);
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.globalAlpha = 1;
  g.fillRect(0, 0, SPRITE, SPRITE);
  s = canvas;
  softSprites.set(color, s);
  return s;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const w = r * 0.28;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + w, y - w);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + w, y + w);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - w, y + w);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - w, y - w);
  ctx.closePath();
  ctx.fill();
}

export function drawParticles(ctx: CanvasRenderingContext2D, pool: ParticlePool): void {
  const d = pool.data;
  const n = pool.count;
  // Normal blend first, additive glow on top.
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'lighter';
    for (let i = 0; i < n; i++) {
      if (d.additive[i] !== pass) continue;
      const local = d.age[i]! - d.delay[i]!;
      if (local < 0) continue;
      const t = Math.min(1, local / d.life[i]!);
      const x = d.x[i]!;
      const y = d.y[i]!;
      const color = pool.colorOf(i);
      const shape = pool.shapeOf(i);
      const flight = d.motion[i] === MOTION_FLIGHT;
      let alpha = d.alpha[i]!;
      const fadeIn = d.fadeIn[i]!;
      if (fadeIn > 0 && t < fadeIn) alpha *= t / fadeIn;
      if (!flight) alpha *= shape === 'ring' ? 1 - t : 1 - t * t;
      if (alpha <= 0.003) continue;
      const size = flight
        ? d.size0[i]!
        : lerp(d.size0[i]!, d.size1[i]!, shape === 'ring' ? easeOutQuad(t) : t);
      ctx.globalAlpha = Math.min(1, alpha);
      switch (shape) {
        case 'dot':
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.3, size), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'streak': {
          const k = d.stretch[i]!;
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(0.5, size);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x - d.vx[i]! * k, y - d.vy[i]! * k);
          ctx.lineTo(x, y);
          ctx.stroke();
          break;
        }
        case 'square': {
          const rot = d.rot[i]!;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rot);
          // Flutter: the paper turns edge-on as it spins.
          ctx.scale(1, Math.cos(rot * 1.7));
          ctx.fillStyle = color;
          ctx.fillRect(-size / 2, -size * 0.3, size, size * 0.6);
          ctx.restore();
          break;
        }
        case 'coin': {
          const w = Math.max(0.15, Math.abs(Math.cos(d.rot[i]!))) * size;
          ctx.fillStyle = color;
          ctx.strokeStyle = '#8A6424';
          ctx.lineWidth = Math.max(0.8, size * 0.18);
          ctx.beginPath();
          ctx.ellipse(x, y, w, size, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'star':
          ctx.fillStyle = color;
          star(ctx, x, y, Math.max(0.5, size));
          break;
        case 'smoke': {
          const sprite = softSprite(color);
          const r = Math.max(1, size);
          if (sprite) ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
          break;
        }
        case 'ring':
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(0.5, lerp(d.stretch[i]!, 1, t));
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.1, size), 0, Math.PI * 2);
          ctx.stroke();
          break;
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
