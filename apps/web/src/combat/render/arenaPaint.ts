import type { CombatState, FighterState } from '@dragon-rush/combat';
import { drawHud, type HudInput } from './drawHud';
import { drawArenaFrame, paintFloor } from './floor';
import { breathPips, secondsLeft } from './hudModel';
import { HUD_H, VIEW_H, VIEW_W, type ArenaRect } from './layout';
import { PAL } from './palette';

const FRAME_PAD = 13;

function fighterKey(
  s: CombatState,
  f: FighterState | null,
): readonly (string | number | boolean)[] {
  if (!f) return [];
  const kit = s.rules.jobs[f.job];
  const dash = s.rules.dashes[kit.dash];
  return [
    f.job,
    f.hp,
    f.maxHp,
    f.skillCharges,
    f.skillCharges < kit.skillCharges ? f.skillTimer : 0,
    f.dashCharges,
    f.dashCharges < dash.charges ? f.dashTimer : 0,
    f.lastStandAvailable,
    f.lastStandUsed,
    f.firstStrikePending,
    f.evadeCounter,
    f.raging,
  ];
}

function hudKey(h: HudInput): string {
  const { s, now } = h;
  const left = secondsLeft(s);
  const urgent = left <= 10 && !s.outcome;
  const imminent = s.dragon && breathPips(s).imminent;
  return [
    left,
    s.kind === 'duel' && s.tick >= s.rules.ring.startTick - 180,
    ...fighterKey(s, s.a),
    ...fighterKey(s, s.b),
    h.ghosts.a,
    h.ghosts.b,
    h.ghosts.dragon,
    s.dragon?.hp,
    s.dragon?.maxHp,
    s.dragon?.phase,
    s.dragon?.sinceBreath,
    s.dragon?.softEnraged,
    urgent ? Math.round(28 * (1 + 0.08 * Math.max(0, Math.sin(now / 120)))) : 0,
    s.a.raging || s.b?.raging ? Math.sin(now / 120) : 0,
    imminent ? Math.sin(now / 90) : 0,
    ...h.looks.flatMap((look) => (look ? [look.name, look.color, look.crest] : [])),
  ].join('|');
}

function backdrop(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = PAL.table0;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const gradient = ctx.createRadialGradient(
    VIEW_W / 2,
    VIEW_H / 2,
    120,
    VIEW_W / 2,
    VIEW_H / 2,
    560,
  );
  gradient.addColorStop(0, PAL.table1);
  gradient.addColorStop(1, PAL.table0);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

/** Static gradients and text are rasterized once; live hazards, actors and HUD changes remain live. */
export class ArenaPaintCache {
  private background: HTMLCanvasElement | null = null;
  private plane: HTMLCanvasElement | null = null;
  private hud: HTMLCanvasElement | null = null;
  private scale = 0;
  private hudSignature = '';
  private persistentHudSignature = '';

  constructor(
    private readonly doc: Document,
    private readonly seed: number,
  ) {}

  private prepare(scale: number): void {
    if (scale === this.scale) return;
    this.scale = scale;
    this.background = null;
    this.plane = null;
    this.hud = null;
    this.hudSignature = '';
    this.persistentHudSignature = '';
  }

  private surface(
    w: number,
    h: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ): HTMLCanvasElement | null {
    const canvas = this.doc.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * this.scale));
    canvas.height = Math.max(1, Math.ceil(h * this.scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    draw(ctx);
    return canvas;
  }

  drawBackdrop(ctx: CanvasRenderingContext2D, scale: number): void {
    this.prepare(scale);
    this.background ??= this.surface(VIEW_W, VIEW_H, backdrop);
    if (this.background) ctx.drawImage(this.background, 0, 0, VIEW_W, VIEW_H);
    else backdrop(ctx);
  }

  drawPlane(ctx: CanvasRenderingContext2D, s: CombatState, r: ArenaRect, scale: number): void {
    this.prepare(scale);
    const w = r.w + FRAME_PAD * 2;
    const h = r.h + FRAME_PAD * 2;
    this.plane ??= this.surface(w, h, (paint) => {
      drawArenaFrame(paint, FRAME_PAD, FRAME_PAD, r.w, r.h);
      paint.drawImage(
        paintFloor(this.doc, s.arenaW, s.arenaH, s.kind, this.seed, Math.min(2, scale)),
        FRAME_PAD,
        FRAME_PAD,
        r.w,
        r.h,
      );
    });
    if (this.plane) ctx.drawImage(this.plane, r.x - FRAME_PAD, r.y - FRAME_PAD, w, h);
  }

  drawHud(ctx: CanvasRenderingContext2D, h: HudInput, scale: number): void {
    this.prepare(scale);
    const signature = `${this.doc.fonts?.status}:${hudKey(h)}`;
    if (!this.hud || signature !== this.hudSignature) {
      this.hud ??= this.surface(VIEW_W, HUD_H, () => {});
      const paint = this.hud?.getContext('2d');
      if (paint && this.hud) {
        paint.clearRect(0, 0, VIEW_W, HUD_H);
        drawHud(paint, h);
        this.hudSignature = signature;
      }
    }
    if (this.hud) ctx.drawImage(this.hud, 0, 0, VIEW_W, HUD_H);
    else drawHud(ctx, h);
  }

  drawHudLayer(ctx: CanvasRenderingContext2D, h: HudInput, scale: number): void {
    this.prepare(scale);
    const signature = `${this.doc.fonts?.status}:${hudKey(h)}`;
    if (signature === this.persistentHudSignature) return;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, HUD_H);
    drawHud(ctx, h);
    this.persistentHudSignature = signature;
  }

  invalidateLayers(): void {
    this.persistentHudSignature = '';
  }
}
