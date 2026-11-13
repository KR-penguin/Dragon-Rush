import {
  Q,
  type CombatantId,
  type CombatState,
  type FighterState,
  type ProjectileState,
  type Side,
} from '@dragon-rush/combat';
import type { ArenaFx } from '../../fx/runtime/arenaFx';
import type { CameraSample } from '../../fx/core/camera';
import type { JobId } from '@dragon-rush/engine';
import type { FightFrame } from '../../services/fight/types';
import { drawDragon, drawDragonShadow, drawProjectile } from './drawDragon';
import type { DragonAttackArt } from './combatImages';
import {
  drawFighterBody,
  drawFootRing,
  drawParry,
  drawSwing,
  type FighterLookInput,
  type FighterPose,
} from './drawFighter';
import {
  createHatch,
  drawDragonHazards,
  drawFireRing,
  drawZone,
  type HazardPaint,
} from './drawHazards';
import { ArenaPaintCache } from './arenaPaint';
import type { HudInput } from './drawHud';
import { ghostAt, trackGhost, type Ghost } from './hudModel';
import { arenaRect, bamToRad, lerp, VIEW_H, VIEW_W, type ArenaRect } from './layout';
import { JOB_LOOK } from './palette';

export interface ArenaLooks {
  readonly a: FighterLookInput;
  readonly b: FighterLookInput | null;
  readonly fighterImage: (job: JobId) => HTMLImageElement | null;
  readonly dragonImage: () => HTMLImageElement | null;
  readonly dragonAttackImage: (name: DragonAttackArt) => HTMLImageElement | null;
}

export interface RenderEnv {
  /** Logical → device px. */
  readonly scale: number;
  /** Presentation time (fxTime: freezes and slows with the boss stop). */
  readonly now: number;
  readonly dtMs: number;
  readonly fx: ArenaFx;
  /** Photosensitive mode: sprite flashes become tint + outline. */
  readonly softFlash: boolean;
  /** Browser surfaces retain static pixels instead of copying them into the actor canvas each frame. */
  readonly layers?: {
    readonly background: CanvasRenderingContext2D;
    readonly hud: CanvasRenderingContext2D;
  };
}

const FLASH_MS = 100;
const FALL_MS = 450;
const AFTERIMAGE_EVERY_MS = 35;
const AFTERIMAGE_LIFE_MS = 150;
const TICK_MS = 1000 / 60;

interface Flinch {
  readonly dir: number;
  readonly until: number;
  readonly total: number;
}

interface Afterimage {
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly color: string;
}

/**
 * Canvas arena renderer: floor, hazards under the actors, y-sorted fighters/dragon/projectiles
 * interpolated by alpha, effects inside the shaken camera, HUD outside it. Holds only
 * presentation state (ghost bars, flashes, afterimages); the sim state comes in every frame.
 */
export class ArenaRenderer {
  readonly rect: ArenaRect;
  private readonly layers: ArenaPaintCache;
  private readonly paint: HazardPaint;
  private ghosts: Record<'a' | 'b' | 'dragon', Ghost | null> = { a: null, b: null, dragon: null };
  private readonly flashUntil = new Map<CombatantId, number>();
  private readonly lastFlash = new Map<CombatantId, number>();
  private readonly flinches = new Map<CombatantId, Flinch>();
  private readonly koAt = new Map<CombatantId, number>();
  private readonly flip = new Map<Side, 1 | -1>([
    ['a', 1],
    ['b', -1],
  ]);
  private readonly afterimages = new Map<Side, Afterimage[]>();
  private backgroundStamp = '';

  constructor(
    doc: Document,
    private readonly looks: ArenaLooks,
    initial: CombatState,
    seed: number,
  ) {
    this.layers = new ArenaPaintCache(doc, seed);
    this.rect = arenaRect(initial.arenaW, initial.arenaH);
    this.paint = {
      hatch: createHatch(doc, 'rgba(255, 178, 91, 0.9)'),
      moonHatch: createHatch(doc, 'rgba(143, 179, 217, 0.9)'),
    };
  }

  /** Arena px → logical canvas px (for FX anchors). */
  toView(x: number, y: number): { x: number; y: number } {
    return { x: this.rect.x + x, y: this.rect.y + y };
  }

  flinch(who: CombatantId, dir: number, ticks: number, now: number): void {
    const last = this.lastFlash.get(who) ?? -Infinity;
    // A sprite flashes at most once per 100 ms (FlashGovernor rule for small areas).
    if (now - last >= FLASH_MS) {
      this.flashUntil.set(who, now + FLASH_MS);
      this.lastFlash.set(who, now);
    }
    const total = Math.max(1, ticks) * TICK_MS;
    this.flinches.set(who, { dir, until: now + total, total });
  }

  knockOut(who: CombatantId, now: number): void {
    if (!this.koAt.has(who)) this.koAt.set(who, now);
  }

  render(ctx: CanvasRenderingContext2D, frame: FightFrame, env: RenderEnv): void {
    const { curr } = frame;
    const { now, fx } = env;
    this.trackBars(curr, now);
    fx.setTelegraph(hostileTelegraph(curr));
    if (curr.dragon?.stage === 'active' && curr.dragon.maneuver === 'breath')
      fx.sustain(0.6, env.dtMs, 0.5);

    ctx.setTransform(env.scale, 0, 0, env.scale, 0, 0);
    if (env.layers) ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    else this.layers.drawBackdrop(ctx, env.scale);

    const cam = fx.cameraTransform();
    const r = this.rect;
    if (env.layers) {
      const stamp = `${env.scale}:${cam.dx}:${cam.dy}:${cam.rot}:${cam.zoom}`;
      if (stamp !== this.backgroundStamp) {
        const background = env.layers.background;
        background.setTransform(env.scale, 0, 0, env.scale, 0, 0);
        this.layers.drawBackdrop(background, env.scale);
        background.save();
        this.applyCamera(background, cam);
        this.layers.drawPlane(background, curr, r, env.scale);
        background.restore();
        this.backgroundStamp = stamp;
      }
    }
    ctx.save();
    this.applyCamera(ctx, cam);

    if (!env.layers) this.layers.drawPlane(ctx, curr, r, env.scale);

    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, r.w, r.h);
    ctx.clip();
    drawFireRing(ctx, curr, this.paint, 0.5 + 0.5 * Math.sin(now / 160));
    for (const z of curr.zones) drawZone(ctx, z, this.paint, now, this.looks.dragonAttackImage);
    if (curr.dragon)
      drawDragonHazards(ctx, curr.dragon, curr, this.paint, now, this.looks.dragonAttackImage);
    ctx.restore();
    this.drawActors(ctx, frame, env);
    ctx.restore();

    fx.update(env.dtMs);
    fx.draw(ctx);
    ctx.restore();

    const hud: HudInput = {
      s: curr,
      looks: [this.looks.a, this.looks.b],
      ghosts: {
        a: this.ghostLevel('a', curr.a.hp, now),
        b: this.ghostLevel('b', curr.b?.hp ?? 0, now),
        dragon: this.ghostLevel('dragon', curr.dragon?.hp ?? 0, now),
      },
      now,
    };
    if (env.layers) this.layers.drawHudLayer(env.layers.hud, hud, env.scale);
    else this.layers.drawHud(ctx, hud, env.scale);
  }

  invalidateLayers(): void {
    this.backgroundStamp = '';
    this.layers.invalidateLayers();
  }

  private applyCamera(ctx: CanvasRenderingContext2D, cam: CameraSample): void {
    const cx = this.rect.x + this.rect.w / 2;
    const cy = this.rect.y + this.rect.h / 2;
    ctx.translate(cx + cam.dx, cy + cam.dy);
    ctx.rotate(cam.rot);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cx, -cy);
  }

  private trackBars(s: CombatState, now: number): void {
    this.ghosts = {
      a: trackGhost(this.ghosts.a, Math.max(0, s.a.hp), now),
      b: trackGhost(this.ghosts.b, Math.max(0, s.b?.hp ?? 0), now),
      dragon: trackGhost(this.ghosts.dragon, Math.max(0, s.dragon?.hp ?? 0), now),
    };
  }

  private ghostLevel(key: 'a' | 'b' | 'dragon', hp: number, now: number): number {
    const g = this.ghosts[key];
    return g ? ghostAt(g, now) : hp;
  }

  private drawActors(ctx: CanvasRenderingContext2D, frame: FightFrame, env: RenderEnv): void {
    const { prev, curr, alpha } = frame;
    const rules = curr.rules;
    const items: { y: number; draw: () => void }[] = [];
    const poses: FighterPose[] = [];
    for (const side of ['a', 'b'] as const) {
      const f = side === 'a' ? curr.a : curr.b;
      const pf = side === 'a' ? prev.a : prev.b;
      const look = side === 'a' ? this.looks.a : this.looks.b;
      if (!f || !look) continue;
      const pose = this.pose(side, f, pf ?? f, look, alpha, env);
      poses.push(pose);
      this.trackAfterimage(side, pose, env.now);
    }
    // ground layer first: rings and afterimages stay readable under every body
    for (const side of ['a', 'b'] as const) this.drawAfterimages(ctx, side, env.now);
    for (const p of poses) drawFootRing(ctx, p);

    for (const p of poses) {
      items.push({
        y: p.y,
        draw: () => {
          if (p.alpha > 0.05) {
            drawFighterBody(ctx, p, rules);
            drawParry(ctx, p.x, p.y, p.f, rules);
          }
          drawSwing(ctx, p.x, p.y, p.f, rules, env.now);
        },
      });
    }
    const d = curr.dragon;
    if (d) {
      const pd = prev.dragon ?? d;
      const x = lerp(pd.x, d.x, alpha) / Q;
      const y = lerp(pd.y, d.y, alpha) / Q;
      const pose = {
        x,
        y,
        d,
        flash: this.flashAmount('dragon', env.now),
        now: env.now,
        fall: this.fall('dragon', env.now),
        image: this.looks.dragonImage(),
        softFlash: env.softFlash,
      };
      drawDragonShadow(ctx, pose);
      items.push({ y: y + 30, draw: () => drawDragon(ctx, pose, rules) });
    }
    const before = new Map<number, ProjectileState>(prev.projectiles.map((p) => [p.id, p]));
    for (const pr of curr.projectiles) {
      const pp = before.get(pr.id) ?? pr;
      const x = lerp(pp.x, pr.x, alpha) / Q;
      const y = lerp(pp.y, pr.y, alpha) / Q;
      items.push({ y, draw: () => drawProjectile(ctx, pr, x, y, env.now) });
    }
    items.sort((p, q) => p.y - q.y);
    for (const it of items) it.draw();
  }

  private pose(
    side: Side,
    f: FighterState,
    pf: FighterState,
    look: FighterLookInput,
    alpha: number,
    env: RenderEnv,
  ): FighterPose {
    const x = lerp(pf.x, f.x, alpha) / Q;
    const y = lerp(pf.y, f.y, alpha) / Q;
    const c = Math.cos(bamToRad(f.facing));
    if (Math.abs(c) > 0.2) this.flip.set(side, c > 0 ? 1 : -1);
    const fl = this.flinches.get(side);
    let shakeX = 0;
    let shakeY = 0;
    if (fl && env.now < fl.until) {
      const k = (fl.until - env.now) / fl.total;
      const a = bamToRad(fl.dir);
      const wobble = Math.sin(env.now / 16) >= 0 ? 1 : -1;
      shakeX = Math.cos(a) * 3 * k * wobble;
      shakeY = Math.sin(a) * 3 * k * wobble;
    }
    const iframes = f.iframes > 0 && f.iframeDelay === 0;
    return {
      x,
      y,
      f,
      look,
      image: this.looks.fighterImage(f.job),
      flip: this.flip.get(side) ?? 1,
      flash: this.flashAmount(side, env.now),
      shakeX,
      shakeY,
      fall: this.fall(side, env.now),
      alpha: f.invisible
        ? 0
        : iframes && f.mode !== 'dash'
          ? 0.55 + 0.25 * Math.sin(env.now / 30)
          : 1,
      now: env.now,
      softFlash: env.softFlash,
    };
  }

  private flashAmount(who: CombatantId, now: number): number {
    const until = this.flashUntil.get(who) ?? 0;
    return now < until ? (until - now) / FLASH_MS : 0;
  }

  private fall(who: CombatantId, now: number): number {
    const at = this.koAt.get(who);
    return at === undefined ? 0 : Math.min(1, (now - at) / FALL_MS);
  }

  private trackAfterimage(side: Side, p: FighterPose, now: number): void {
    const list = this.afterimages.get(side) ?? [];
    const live = list.filter((a) => now - a.t < AFTERIMAGE_LIFE_MS);
    const dashing = p.f.mode === 'dash' || p.f.invisible;
    const last = live.at(-1);
    if (dashing && (!last || now - last.t >= AFTERIMAGE_EVERY_MS)) {
      live.push({ x: p.x, y: p.y, t: now, color: JOB_LOOK[p.f.job].trail });
      if (live.length > 4) live.shift();
    }
    this.afterimages.set(side, live);
  }

  private drawAfterimages(ctx: CanvasRenderingContext2D, side: Side, now: number): void {
    for (const a of this.afterimages.get(side) ?? []) {
      const k = 1 - (now - a.t) / AFTERIMAGE_LIFE_MS;
      if (k <= 0) continue;
      ctx.save();
      ctx.globalAlpha = 0.5 * k;
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 54);
      ctx.lineTo(a.x + 9, a.y - 30);
      ctx.lineTo(a.x + 3, a.y - 10);
      ctx.lineTo(a.x - 8, a.y - 26);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}

/** Any hazard still filling: cap camera shake so telegraphs stay readable (art-direction §11.3). */
export function hostileTelegraph(s: CombatState): boolean {
  return s.zones.some((z) => z.arm > 0) || s.dragon?.stage === 'telegraph';
}
