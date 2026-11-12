import type { CombatState, FighterState } from '@dragon-rush/combat';
import { KIT_LABEL } from '../../types/combatLabels';
import { drawCrest, type FighterLookInput } from './drawFighter';
import {
  breathPips,
  dashCooldown,
  passivePip,
  secondsLeft,
  skillCooldown,
  type CooldownView,
  type PassivePip,
} from './hudModel';
import { HUD_H, VIEW_W } from './layout';
import { FONT_IMPACT, FONT_UI, PAL } from './palette';

export interface HudInput {
  readonly s: CombatState;
  readonly looks: readonly [FighterLookInput, FighterLookInput | null];
  /** Ghost levels (hp units) per bar: a, b, dragon. */
  readonly ghosts: { readonly a: number; readonly b: number; readonly dragon: number };
  readonly now: number;
}

const BAR_W = 300;
const BAR_H = 12;

/** HUD band (56 logical px): never shaken; HP with ghost drain, timer, cooldowns, passive pips. */
export function drawHud(ctx: CanvasRenderingContext2D, h: HudInput): void {
  const { s } = h;
  const g = ctx.createLinearGradient(0, 0, 0, HUD_H);
  g.addColorStop(0, PAL.panel2);
  g.addColorStop(1, PAL.panel);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, HUD_H);
  ctx.fillStyle = PAL.goldDeep;
  ctx.fillRect(0, HUD_H - 2, VIEW_W, 2);

  fighterBlock(ctx, s, s.a, h.looks[0], h.ghosts.a, 'left', h.now);
  if (s.b && h.looks[1]) fighterBlock(ctx, s, s.b, h.looks[1], h.ghosts.b, 'right', h.now);
  if (s.dragon) bossBlock(ctx, s, h.ghosts.dragon, h.now);
  timer(ctx, s, h.now);
}

function timer(ctx: CanvasRenderingContext2D, s: CombatState, now: number): void {
  const left = secondsLeft(s);
  const urgent = left <= 10 && !s.outcome;
  const enraged = s.dragon?.softEnraged === true;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const pulse = urgent ? 1 + 0.08 * Math.max(0, Math.sin(now / 120)) : 1;
  ctx.font = `${Math.round(28 * pulse)}px ${FONT_IMPACT}`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.outline;
  ctx.strokeText(String(left), VIEW_W / 2, 24);
  ctx.fillStyle = urgent || enraged ? PAL.emberHot : PAL.goldHi;
  ctx.fillText(String(left), VIEW_W / 2, 24);
  ctx.font = `500 10px ${FONT_UI}`;
  ctx.fillStyle = PAL.boneDim;
  const ring = s.kind === 'duel' && s.tick >= s.rules.ring.startTick - 180;
  ctx.fillText(enraged ? '용의 분노' : ring ? '불의 고리' : '남은 시간', VIEW_W / 2, 46);
  ctx.restore();
}

function hpColor(f: FighterState): string {
  return f.hp * 4 <= f.maxHp ? PAL.hpLow : PAL.hp;
}

function fighterBlock(
  ctx: CanvasRenderingContext2D,
  s: CombatState,
  f: FighterState,
  look: FighterLookInput,
  ghost: number,
  side: 'left' | 'right',
  now: number,
): void {
  const right = side === 'right';
  const x0 = right ? VIEW_W - 16 - BAR_W : 16;
  ctx.save();
  // name row
  const crestX = right ? VIEW_W - 22 : 22;
  drawCrest(ctx, look.crest, crestX, 13, 4.5, look.color);
  ctx.font = `700 12px ${FONT_UI}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = right ? 'right' : 'left';
  ctx.fillStyle = PAL.bone;
  ctx.fillText(`${look.name} · ${KIT_LABEL[f.job].passive}`, right ? crestX - 12 : crestX + 12, 13);
  // HP bar (fills from the outside edge inward, fighting-game style)
  const frac = (v: number) => Math.max(0, Math.min(1, v / Math.max(1, f.maxHp)));
  const by = 22;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(x0, by, BAR_W, BAR_H);
  const gw = BAR_W * frac(ghost);
  const hw = BAR_W * frac(f.hp);
  ctx.fillStyle = 'rgba(255, 246, 224, 0.85)';
  ctx.fillRect(right ? x0 + BAR_W - gw : x0, by, gw, BAR_H);
  ctx.fillStyle = hpColor(f);
  ctx.fillRect(right ? x0 + BAR_W - hw : x0, by, hw, BAR_H);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(right ? x0 + BAR_W - hw : x0, by, hw, 3);
  ctx.strokeStyle = look.color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 - 0.5, by - 0.5, BAR_W + 1, BAR_H + 1);
  ctx.font = `11px ${FONT_IMPACT}`;
  ctx.textAlign = right ? 'left' : 'right';
  ctx.fillStyle = PAL.bone;
  ctx.fillText(
    `${Math.max(0, f.hp)} / ${f.maxHp}`,
    right ? x0 + 4 : x0 + BAR_W - 4,
    by + BAR_H / 2 + 1,
  );
  // cooldowns and passive
  const iy = 45;
  const ix = (i: number) => (right ? VIEW_W - 26 - i * 24 : 26 + i * 24);
  cooldownIcon(ctx, ix(0), iy, KIT_LABEL[f.job].skill.slice(0, 1), skillCooldown(s, f));
  cooldownIcon(ctx, ix(1), iy, KIT_LABEL[f.job].dash.slice(0, 1), dashCooldown(s, f));
  passive(ctx, passivePip(s, f), right ? ix(2) + 8 : ix(2) - 8, iy, right, now);
  ctx.restore();
}

function cooldownIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  glyph: string,
  cd: CooldownView,
): void {
  const r = 9;
  const ready = cd.charges > 0;
  ctx.save();
  ctx.fillStyle = PAL.panel;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (cd.remaining > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd.remaining);
    ctx.closePath();
    ctx.fill();
  }
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ready ? PAL.goldHi : PAL.panelLine;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = `700 9px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ready ? PAL.bone : PAL.boneDim;
  ctx.fillText(glyph, x, y + 0.5);
  if (cd.maxCharges > 1) {
    ctx.font = `8px ${FONT_IMPACT}`;
    ctx.fillStyle = PAL.goldHi;
    ctx.fillText(String(cd.charges), x + 8, y - 7);
  }
  ctx.restore();
}

function passive(
  ctx: CanvasRenderingContext2D,
  pip: PassivePip,
  x: number,
  y: number,
  right: boolean,
  now: number,
): void {
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = right ? 'right' : 'left';
  ctx.font = `700 10px ${FONT_UI}`;
  switch (pip.kind) {
    case 'lastStand': {
      const color = pip.state === 'ready' ? PAL.goldHi : '#5A4A3A';
      drawCrest(ctx, 'shield', x + (right ? -5 : 5), y, 5, color);
      ctx.fillStyle = color;
      ctx.fillText(pip.state === 'ready' ? '불굴' : '불굴 사용', x + (right ? -14 : 14), y);
      break;
    }
    case 'firstStrike':
      ctx.fillStyle = pip.ready ? PAL.goldHi : PAL.boneDim;
      ctx.fillText(pip.ready ? '➹ 선제 준비' : '➹ 선제', x, y);
      break;
    case 'evade':
      for (let i = 0; i < pip.every; i++) {
        const cx = x + (right ? -1 : 1) * (4 + i * 8);
        ctx.fillStyle = i < pip.count ? PAL.moon : i === pip.every - 1 ? '#3F4A5A' : '#2E2A38';
        ctx.beginPath();
        ctx.arc(cx, y, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = PAL.boneDim;
      ctx.fillText('회피', x + (right ? -1 : 1) * (8 + pip.every * 8), y);
      break;
    case 'rage': {
      const on = pip.on;
      ctx.fillStyle = on ? `rgba(255, 90, 60, ${0.75 + 0.25 * Math.sin(now / 120)})` : PAL.boneDim;
      ctx.fillText(on ? '광폭!' : '광폭 (HP ≤ 50%)', x, y);
      break;
    }
    case 'pierce':
      ctx.fillStyle = '#B38CFF';
      ctx.fillText('관통 (방어 ½)', x, y);
      break;
  }
  ctx.restore();
}

function bossBlock(
  ctx: CanvasRenderingContext2D,
  s: CombatState,
  ghost: number,
  now: number,
): void {
  const d = s.dragon!;
  const w = 360;
  const x0 = VIEW_W - 16 - w;
  const by = 22;
  ctx.save();
  ctx.font = `700 12px ${FONT_UI}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PAL.bone;
  ctx.fillText(`용 · ${d.phase}페이즈`, VIEW_W - 16, 13);
  ctx.fillStyle = '#1A0C0A';
  ctx.fillRect(x0, by, w, 14);
  const frac = (v: number) => Math.max(0, Math.min(1, v / Math.max(1, d.maxHp)));
  ctx.fillStyle = 'rgba(255, 246, 224, 0.8)';
  ctx.fillRect(x0, by, w * frac(ghost), 14);
  const lg = ctx.createLinearGradient(0, by, 0, by + 14);
  lg.addColorStop(0, PAL.bossHi);
  lg.addColorStop(1, PAL.boss);
  ctx.fillStyle = lg;
  ctx.fillRect(x0, by, w * frac(d.hp), 14);
  ctx.strokeStyle = PAL.gold;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 - 0.5, by - 0.5, w + 1, 15);
  // phase notches
  for (const pct of [s.rules.dragon.phase2Pct, s.rules.dragon.phase3Pct]) {
    const nx = x0 + (w * pct) / 100;
    ctx.fillStyle = PAL.goldHi;
    ctx.fillRect(nx - 1, by - 3, 2, 20);
  }
  ctx.font = `11px ${FONT_IMPACT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = PAL.bone;
  ctx.fillText(`${Math.max(0, d.hp)} / ${d.maxHp}`, x0 + 4, by + 8);
  // breath runes
  const pips = breathPips(s);
  for (let i = 0; i < pips.total; i++) {
    const cx = x0 + 10 + i * 18;
    const last = i === pips.total - 1;
    const lit = i < pips.filled || (last && pips.imminent);
    ctx.fillStyle = lit ? (last ? PAL.emberHot : PAL.ember) : '#3A2420';
    if (last && pips.imminent) ctx.globalAlpha = 0.65 + 0.35 * Math.sin(now / 90);
    ctx.beginPath();
    ctx.moveTo(cx, 38);
    ctx.lineTo(cx + 6, 45);
    ctx.lineTo(cx, 52);
    ctx.lineTo(cx - 6, 45);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.font = `500 10px ${FONT_UI}`;
  ctx.fillStyle = pips.imminent ? PAL.emberHot : PAL.boneDim;
  const left = pips.total - 1 - pips.filled;
  ctx.fillText(
    pips.imminent ? '다음 공격: 브레스!' : `브레스까지 ${left}`,
    x0 + 10 + pips.total * 18,
    45,
  );
  ctx.restore();
}
