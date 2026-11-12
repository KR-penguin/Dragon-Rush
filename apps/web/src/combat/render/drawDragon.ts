import { Q, type CombatRules, type DragonState, type ProjectileState } from '@dragon-rush/combat';
import { bamToRad } from './layout';
import { DRAGON_LOOK, FONT_UI, PAL } from './palette';

export interface DragonPose {
  readonly x: number;
  readonly y: number;
  readonly d: DragonState;
  readonly flash: number;
  readonly now: number;
  /** KO presentation 0..1. */
  readonly fall: number;
  readonly image: HTMLImageElement | null;
  readonly softFlash: boolean;
}

export function headPos(
  d: DragonState,
  x: number,
  y: number,
  rules: CombatRules,
): { x: number; y: number } {
  const f = bamToRad(d.facing);
  return {
    x: x + Math.cos(f) * rules.dragon.head.forward,
    y: y + Math.sin(f) * rules.dragon.head.forward,
  };
}

/** Dive: while airborne only the shadow is on the floor (art-direction: untargetable). */
export function drawDragonShadow(ctx: CanvasRenderingContext2D, p: DragonPose): void {
  const { d } = p;
  ctx.save();
  if (d.airborne) {
    const tx = d.telegraph ? d.telegraph.x / Q : d.tx / Q;
    const ty = d.telegraph ? d.telegraph.y / Q : d.ty / Q;
    const k = Math.min(1, d.stageTick / Math.max(1, d.stageLen));
    ctx.fillStyle = `rgba(0, 0, 0, ${0.25 + 0.35 * k})`;
    ctx.beginPath();
    ctx.ellipse(tx, ty, 60 + 40 * k, 22 + 14 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 26, 104, 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Dragon cutout or procedural fallback, with state cues in either path. */
export function drawDragon(ctx: CanvasRenderingContext2D, p: DragonPose, rules: CombatRules): void {
  const { d, now } = p;
  if (d.airborne) return;
  const { x, y } = p;
  const head = headPos(d, x, y, rules);
  ctx.save();
  ctx.globalAlpha = 1 - 0.5 * p.fall;
  if (p.image) {
    const image = p.image;
    const scale = Math.min(192 / image.naturalWidth, 144 / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bamToRad(d.facing) - Math.PI / 2);
    if (d.maneuver === 'charge' && d.stage === 'active') ctx.scale(0.9, 1.05);
    if (d.stage === 'roar') ctx.scale(1.03 + 0.02 * Math.sin(now / 100), 1.03);
    if (d.stage === 'stunned') ctx.filter = 'grayscale(0.65)';
    ctx.drawImage(image, -w / 2, -h * 0.55, w, h);
    if (p.flash > 0) {
      ctx.globalAlpha = p.flash * (p.softFlash ? 0.5 : 0.85);
      ctx.filter = p.softFlash ? 'sepia(1) saturate(3)' : 'brightness(0) invert(1)';
      ctx.drawImage(image, -w / 2, -h * 0.55, w, h);
    }
    ctx.restore();
  } else {
    const flap = Math.sin(now / 260) * (d.stage === 'roar' ? 16 : 7);
    // wings
    ctx.fillStyle = DRAGON_LOOK.wing;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1.5;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * 26, y - 22);
      ctx.lineTo(x + s * 118, y - 78 - flap);
      ctx.lineTo(x + s * 104, y - 30 - flap * 0.5);
      ctx.lineTo(x + s * 120, y - 4);
      ctx.lineTo(x + s * 44, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.moveTo(x + s * 30, y - 18);
      ctx.lineTo(x + s * 104, y - 30 - flap * 0.5);
      ctx.stroke();
      ctx.strokeStyle = PAL.outline;
    }
    // tail (away from the head)
    const back = bamToRad(d.facing) + Math.PI;
    ctx.strokeStyle = DRAGON_LOOK.body;
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(back) * 60 + Math.sin(now / 500) * 18,
      y + Math.sin(back) * 60,
      x + Math.cos(back) * 96 + Math.sin(now / 400) * 26,
      y + Math.sin(back) * 80,
    );
    ctx.stroke();
    // body
    const g = ctx.createLinearGradient(x, y - 44, x, y + 44);
    g.addColorStop(0, DRAGON_LOOK.scale);
    g.addColorStop(1, DRAGON_LOOK.body);
    ctx.fillStyle = g;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, 74, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = DRAGON_LOOK.belly;
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 40, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    // neck + head
    ctx.strokeStyle = DRAGON_LOOK.body;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.moveTo(x, y + 6);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.fillStyle = DRAGON_LOOK.scale;
    ctx.strokeStyle = PAL.outline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(head.x, head.y, 26, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // horns and eyes
    ctx.fillStyle = '#E8DCC4';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(head.x + s * 10, head.y - 16);
      ctx.lineTo(head.x + s * 22, head.y - 34);
      ctx.lineTo(head.x + s * 16, head.y - 14);
      ctx.closePath();
      ctx.fill();
    }
    const eye = d.stage === 'stunned' ? '#777' : DRAGON_LOOK.eye;
    ctx.fillStyle = eye;
    ctx.beginPath();
    ctx.ellipse(head.x - 9, head.y - 4, 4, 2.5, 0.3, 0, Math.PI * 2);
    ctx.ellipse(head.x + 9, head.y - 4, 4, 2.5, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.flash > 0 && !p.image) {
    ctx.globalAlpha = (p.softFlash ? 0.3 : 0.6) * p.flash;
    ctx.fillStyle = p.softFlash ? DRAGON_LOOK.eye : '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x, y, 74, 44, 0, 0, Math.PI * 2);
    ctx.ellipse(head.x, head.y, 26, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    if (p.softFlash) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
    }
  }
  ctx.restore();

  const charging =
    d.maneuver === 'breath' && d.stage === 'telegraph' ? d.stageTick / Math.max(1, d.stageLen) : 0;
  if (charging > 0 || (d.maneuver === 'breath' && d.stage === 'active')) {
    const k = d.stage === 'active' ? 1 : charging;
    ctx.save();
    const glow = ctx.createRadialGradient(head.x, head.y, 2, head.x, head.y, 34);
    glow.addColorStop(0, `rgba(255, 178, 91, ${0.85 * k})`);
    glow.addColorStop(1, 'rgba(255, 122, 61, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(head.x, head.y, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // weak point and stun marks
  if (d.headLowered > 0 && p.fall === 0) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 110);
    ctx.save();
    ctx.strokeStyle = PAL.goldHi;
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(head.x, head.y, rules.dragon.head.r + 4 + pulse * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `700 10px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = PAL.outline;
    ctx.strokeText('약점', head.x, head.y + rules.dragon.head.r + 16);
    ctx.fillStyle = PAL.goldHi;
    ctx.fillText('약점', head.x, head.y + rules.dragon.head.r + 16);
    ctx.restore();
  }
  if (d.stage === 'stunned') {
    ctx.save();
    ctx.fillStyle = PAL.goldHi;
    for (let i = 0; i < 3; i++) {
      const a = now / 300 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(head.x + Math.cos(a) * 22, head.y - 30 + Math.sin(a) * 6, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Arrows (gold when charged), arcane bolts, kunai; parried projectiles turn moon blue. */
export function drawProjectile(
  ctx: CanvasRenderingContext2D,
  pr: ProjectileState,
  x: number,
  y: number,
  now: number,
): void {
  const a = bamToRad(pr.angle);
  ctx.save();
  ctx.translate(x, y - 14);
  ctx.rotate(a);
  const tint = pr.reflected ? PAL.moon : null;
  switch (pr.kind) {
    case 'bolt': {
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 12);
      g.addColorStop(0, tint ?? '#F2E6FF');
      g.addColorStop(0.4, tint ?? '#B38CFF');
      g.addColorStop(1, 'rgba(120, 80, 220, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = tint ?? '#9FD8FF';
      ctx.beginPath();
      ctx.ellipse(-12, 0, 10, 3 + Math.sin(now / 40), 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'kunai':
      ctx.fillStyle = tint ?? '#C9D3DF';
      ctx.strokeStyle = PAL.outline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(0, -3);
      ctx.lineTo(-6, 0);
      ctx.lineTo(0, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    default: {
      const full = pr.kind === 'fullShot';
      ctx.strokeStyle = tint ?? (full ? PAL.goldHi : PAL.bone);
      ctx.lineWidth = full ? 2.5 : 1.8;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(4, -3.5);
      ctx.lineTo(4, 3.5);
      ctx.closePath();
      ctx.fill();
      if (full) {
        ctx.globalAlpha = 0.35;
        ctx.fillRect(-30, -1, 16, 2);
      }
    }
  }
  ctx.restore();
}
