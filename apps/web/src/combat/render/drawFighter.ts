import type { FighterState, MeleeMoveSpec, CombatRules } from '@dragon-rush/combat';
import type { JobId } from '@dragon-rush/engine';
import { bamToRad } from './layout';
import { FONT_UI, JOB_LOOK, PAL, type CrestShape } from './palette';

export interface FighterLookInput {
  readonly name: string;
  readonly color: string;
  readonly crest: CrestShape;
}

/** Everything one fighter draw needs (already interpolated, presentation state resolved). */
export interface FighterPose {
  readonly x: number;
  readonly y: number;
  readonly f: FighterState;
  readonly look: FighterLookInput;
  /** +1 faces right, -1 faces left (overhead 3/4 sprite mirrored, art-direction §10). */
  readonly flip: 1 | -1;
  /** White hit flash strength 0..1. */
  readonly flash: number;
  /** Hit shake offset along the knockback axis (px). */
  readonly shakeX: number;
  readonly shakeY: number;
  /** KO fall progress 0..1 (presentation clock). */
  readonly fall: number;
  /** Afterimage / transparency multiplier. */
  readonly alpha: number;
  readonly now: number;
  /** Photosensitive mode: tint + outline instead of a white flash. */
  readonly softFlash: boolean;
}

export function drawCrest(
  ctx: CanvasRenderingContext2D,
  shape: CrestShape,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.beginPath();
  switch (shape) {
    case 'shield':
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y - r);
      ctx.lineTo(x + r, y);
      ctx.quadraticCurveTo(x + r, y + r * 0.8, x, y + r * 1.25);
      ctx.quadraticCurveTo(x - r, y + r * 0.8, x - r, y);
      break;
    case 'diamond':
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r * 1.25);
      ctx.lineTo(x - r, y);
      break;
    case 'leaf':
      ctx.moveTo(x, y - r * 1.25);
      ctx.quadraticCurveTo(x + r * 1.3, y, x, y + r * 1.25);
      ctx.quadraticCurveTo(x - r * 1.3, y, x, y - r * 1.25);
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r * 1.25 : r * 0.55;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      break;
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = PAL.outline;
  ctx.stroke();
}

/** Ground layer: shadow, seat foot ring, facing tick. Drawn before every body for readability. */
export function drawFootRing(ctx: CanvasRenderingContext2D, p: FighterPose): void {
  const { x, y, f, look } = p;
  ctx.save();
  ctx.globalAlpha = p.alpha * (f.mode === 'ko' ? 0.4 : 1);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = look.color;
  ctx.beginPath();
  ctx.ellipse(x, y, 14, 6, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (f.mode !== 'ko') {
    const a = bamToRad(f.facing);
    const tx = x + Math.cos(a) * 18;
    const ty = y + Math.sin(a) * 8;
    ctx.fillStyle = look.color;
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(a) * 5, ty + Math.sin(a) * 2.5);
    ctx.lineTo(tx + Math.cos(a + 2.2) * 4, ty + Math.sin(a + 2.2) * 2);
    ctx.lineTo(tx + Math.cos(a - 2.2) * 4, ty + Math.sin(a - 2.2) * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Anticipation/stretch per art-direction §11.2 (startup squash, dash stretch, hit squash). */
function squash(f: FighterState): [number, number] {
  switch (f.mode) {
    case 'attack':
    case 'skill':
      return f.phase === 'startup' ? [1.12, 0.9] : f.phase === 'active' ? [0.94, 1.08] : [1, 1];
    case 'dash':
      return [0.86, 1.16];
    case 'hitstun':
      return [1.18, 0.86];
    default:
      return [1, 1];
  }
}

const HEAD: Readonly<Record<JobId, (ctx: CanvasRenderingContext2D, trim: string) => void>> = {
  swordsman: (ctx, trim) => {
    ctx.fillStyle = '#8E99A8';
    ctx.beginPath();
    ctx.arc(0, -37, 7.5, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(-1, -46, 2, 5);
  },
  archer: (ctx) => {
    ctx.fillStyle = '#3F5A31';
    ctx.beginPath();
    ctx.moveTo(-8, -34);
    ctx.quadraticCurveTo(0, -50, 9, -36);
    ctx.lineTo(4, -38);
    ctx.closePath();
    ctx.fill();
  },
  mage: (ctx, trim) => {
    ctx.fillStyle = '#3B2F63';
    ctx.beginPath();
    ctx.moveTo(-10, -38);
    ctx.lineTo(10, -38);
    ctx.lineTo(3, -58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = trim;
    ctx.fillRect(-9, -39.5, 18, 2);
  },
  ninja: (ctx, trim) => {
    ctx.fillStyle = '#1E1B26';
    ctx.fillRect(-7.5, -38, 15, 4);
    ctx.fillStyle = trim;
    ctx.fillRect(-9, -41, 3, 9);
  },
  berserker: (ctx) => {
    ctx.fillStyle = '#E8DCC4';
    ctx.beginPath();
    ctx.moveTo(-6, -41);
    ctx.quadraticCurveTo(-13, -46, -11, -53);
    ctx.lineTo(-4, -43);
    ctx.moveTo(6, -41);
    ctx.quadraticCurveTo(13, -46, 11, -53);
    ctx.lineTo(4, -43);
    ctx.fill();
  },
};

/** Weapon along the aim (full 8-way), from the hand. */
function drawWeapon(
  ctx: CanvasRenderingContext2D,
  job: JobId,
  aim: number,
  f: FighterState,
  rules: CombatRules,
  now: number,
): void {
  const a = bamToRad(aim);
  const hx = Math.cos(a) * 9;
  const hy = -20 + Math.sin(a) * 5;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(a);
  ctx.lineCap = 'round';
  switch (job) {
    case 'swordsman':
      ctx.strokeStyle = '#DDE6F0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(22, 0);
      ctx.stroke();
      ctx.strokeStyle = PAL.gold;
      ctx.beginPath();
      ctx.moveTo(2, -4);
      ctx.lineTo(2, 4);
      ctx.stroke();
      break;
    case 'archer': {
      const drawSpec = rules.moves.draw;
      const full = drawSpec.type === 'draw' ? drawSpec.fullAt : 36;
      const pull = f.move === 'draw' ? Math.min(1, f.drawTicks / full) : 0;
      ctx.strokeStyle = '#8A5A32';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(4, 0, 12, -1.2, 1.2);
      ctx.stroke();
      const sx = 4 + Math.cos(1.2) * 12;
      ctx.strokeStyle = PAL.bone;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, -Math.sin(1.2) * 12);
      ctx.lineTo(sx - 9 * pull, 0);
      ctx.lineTo(sx, Math.sin(1.2) * 12);
      ctx.stroke();
      if (pull > 0 || f.nocked) {
        const ready = pull >= 1 || f.nocked;
        ctx.strokeStyle = ready ? PAL.goldHi : PAL.bone;
        ctx.lineWidth = ready ? 2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(sx - 9 * pull, 0);
        ctx.lineTo(sx + 12, 0);
        ctx.stroke();
        if (ready) {
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 60);
          ctx.fillStyle = PAL.goldHi;
          ctx.beginPath();
          ctx.arc(sx + 12, 0, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'mage':
      ctx.strokeStyle = '#6B4A2C';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-4, 0);
      ctx.lineTo(18, 0);
      ctx.stroke();
      ctx.fillStyle = '#B38CFF';
      ctx.beginPath();
      ctx.arc(19, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'ninja':
      ctx.strokeStyle = '#C9D3DF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(13, 0);
      ctx.stroke();
      break;
    case 'berserker':
      ctx.strokeStyle = '#6B4A2C';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(20, 0);
      ctx.stroke();
      ctx.fillStyle = '#B8BEC6';
      ctx.beginPath();
      ctx.moveTo(14, -1);
      ctx.quadraticCurveTo(22, -12, 26, -6);
      ctx.lineTo(24, 6);
      ctx.quadraticCurveTo(20, 10, 14, 2);
      ctx.closePath();
      ctx.fill();
      break;
  }
  ctx.restore();
}

/** The standee: legs, torso, head and job hat, weapon, rage aura, parry shield, name + crest. */
export function drawFighterBody(
  ctx: CanvasRenderingContext2D,
  p: FighterPose,
  rules: CombatRules,
): void {
  const { f, look } = p;
  const job = JOB_LOOK[f.job];
  const [sx, sy] = squash(f);
  ctx.save();
  ctx.translate(p.x + p.shakeX, p.y + p.shakeY);
  ctx.globalAlpha = p.alpha;
  if (f.raging && f.mode !== 'ko') {
    const pulse = 0.5 + 0.5 * Math.sin(p.now / 140);
    const g = ctx.createRadialGradient(0, -20, 4, 0, -20, 30);
    g.addColorStop(0, `rgba(255, 90, 60, ${0.35 + 0.2 * pulse})`);
    g.addColorStop(1, 'rgba(255, 90, 60, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -20, 26, 32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.fall > 0) ctx.rotate((p.flip > 0 ? -1 : 1) * (Math.PI / 2) * p.fall);
  ctx.scale(sx * p.flip, sy);
  // legs
  ctx.fillStyle = '#2B1D14';
  const step = f.mode === 'move' ? Math.sin(p.now / 70) * 2.5 : 0;
  ctx.fillRect(-6, -9 + step * 0.3, 4, 9 - step * 0.3);
  ctx.fillRect(2, -9 - step * 0.3, 4, 9 + step * 0.3);
  // torso
  ctx.fillStyle = f.mode === 'ko' ? '#4A4440' : job.body;
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 1;
  roundRect(ctx, -9, -31, 18, 23, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = job.trim;
  ctx.fillRect(-9, -15, 18, 2.5);
  // head
  ctx.fillStyle = '#E9C9A1';
  ctx.beginPath();
  ctx.arc(0, -37, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PAL.ink;
  ctx.fillRect(2.5, -38.5, 2, 2);
  HEAD[f.job](ctx, job.trim);
  ctx.restore();

  if (f.mode !== 'ko') {
    ctx.save();
    ctx.translate(p.x + p.shakeX, p.y + p.shakeY);
    ctx.globalAlpha = p.alpha;
    drawWeapon(
      ctx,
      f.job,
      f.mode === 'attack' || f.mode === 'skill' ? f.aim : f.facing,
      f,
      rules,
      p.now,
    );
    ctx.restore();
  }

  if (p.flash > 0) {
    ctx.save();
    ctx.translate(p.x + p.shakeX, p.y + p.shakeY);
    ctx.globalAlpha = p.flash * (p.softFlash ? 0.5 : 0.85) * p.alpha;
    ctx.fillStyle = p.softFlash ? look.color : '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(0, -24, 12, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.softFlash) {
      ctx.globalAlpha = p.alpha;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
    }
    ctx.restore();
  }

  // overhead crest + name tag
  if (p.alpha > 0.3) {
    ctx.save();
    ctx.globalAlpha = f.mode === 'ko' ? 0.5 : 1;
    drawCrest(ctx, look.crest, p.x, p.y - 64, 4.5, look.color);
    ctx.font = `700 9px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = PAL.outline;
    ctx.strokeText(look.name, p.x, p.y - 75);
    ctx.fillStyle = PAL.bone;
    ctx.fillText(look.name, p.x, p.y - 75);
    ctx.restore();
  }
}

/** Melee swing: a tapered arc over the move's reach while active, fading for ~8 ticks after. */
export function drawSwing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  f: FighterState,
  rules: CombatRules,
  now: number,
): void {
  if ((f.mode !== 'attack' && f.mode !== 'skill') || f.move === null) return;
  const spec = rules.moves[f.move as keyof typeof rules.moves] as MeleeMoveSpec | undefined;
  if (!spec || spec.type !== 'melee') return;
  const sinceActive = f.moveTick - spec.startup;
  const fadeTicks = 8;
  if (sinceActive < 0 || sinceActive > spec.active + fadeTicks) return;
  const fade = sinceActive <= spec.active ? 1 : 1 - (sinceActive - spec.active) / fadeTicks;
  const color = JOB_LOOK[f.job].trail;
  const reach = spec.reach + 4;
  const cy = y - 10;
  ctx.save();
  ctx.globalAlpha = 0.85 * fade;
  ctx.fillStyle = color;
  if (spec.half >= 128) {
    const spin = now / 50;
    for (let i = 0; i < 3; i++) {
      const a0 = spin + (i * Math.PI * 2) / 3;
      taperArc(ctx, x, cy, reach, a0, a0 + 1.4, 7);
    }
  } else {
    const a = bamToRad(f.aim);
    const half = bamToRad(spec.half);
    const sweep = Math.min(1, (sinceActive + 1) / Math.max(1, spec.active));
    taperArc(
      ctx,
      x,
      cy,
      reach,
      a - half,
      a - half + 2 * half * sweep,
      spec.hit.power >= 150 ? 9 : 6,
    );
  }
  ctx.restore();
}

/** Crescent from a0 to a1 whose thickness grows toward a1 (the blade's leading edge). */
function taperArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  a0: number,
  a1: number,
  w: number,
): void {
  const n = 12;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.6);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    const t = (w * i) / n;
    ctx.lineTo(x + Math.cos(a) * (r - t), y + Math.sin(a) * (r - t) * 0.6);
  }
  ctx.closePath();
  ctx.fill();
}

/** Swordsman parry window: a moon-blue half shield in front. */
export function drawParry(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  f: FighterState,
  rules: CombatRules,
): void {
  if (f.move !== 'parry') return;
  const spec = rules.moves.parry;
  if (spec.type !== 'parry') return;
  const live = f.moveTick >= spec.startup && f.moveTick < spec.startup + spec.active;
  if (!live) return;
  const a = bamToRad(f.aim);
  const half = bamToRad(spec.half);
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = PAL.moon;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y - 14, 24, 16, 0, a - half, a + half);
  ctx.stroke();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
