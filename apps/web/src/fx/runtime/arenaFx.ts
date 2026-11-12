import {
  ARENA_CAMERA,
  ZERO_CAMERA,
  createCameraRig,
  type CameraRig,
  type CameraSample,
  type ClockLike,
} from '../core/camera';
import {
  createFloatingTextBook,
  type FloatingTextBook,
  type FloatingTextKind,
} from '../core/floatingText';
import { PARTICLE_CAP, createParticlePool, type ParticlePool } from '../core/particles';
import {
  BURST_PRESETS,
  RING_PRESETS,
  emitBurst,
  emitCoinFlight,
  emitRing,
  presetUnit,
  type BurstPresetName,
  type RingPresetName,
} from '../core/particlePresets';
import { createFxRng, hashSeed } from '../core/rng';
import type { BossStop } from '../core/time';
import type { SoundName } from '../audio/soundCatalog';
import { arenaHitCues, type ArenaHitKind } from '../recipes';
import { drawFloatingTexts } from '../render/drawFloatingText';
import { drawParticles } from '../render/drawParticles';
import type { FxPolicy } from '../settings/fxSettings';
import type { FlashTone, FxAnchor, FxCue, FxPoint, PunchKind, VignetteTone } from '../types';
import { runCue, type BurstOptions, type FxSink } from './cueRunner';

/** Screen-level effects the arena forwards to the global overlay (flash, vignette, audio). */
export type ScreenSink = Pick<FxSink, 'flash' | 'vignette' | 'sound' | 'duck' | 'caption'> &
  Partial<Pick<FxSink, 'hitStop' | 'slowMo' | 'bossStop'>>;

export interface ArenaFxOptions {
  /** Presentation clock (ms) for texts and camera; typically `fxTime`. */
  readonly clock: ClockLike;
  readonly policy: () => FxPolicy;
  readonly screen?: ScreenSink;
  /** Fight seed: FX randomness never touches the sim RNG. */
  readonly seed?: number;
}

export interface ArenaHit {
  /** Logical px. */
  readonly x: number;
  readonly y: number;
  readonly damage: number;
  readonly kind: ArenaHitKind;
  /** Attack direction (sparks follow it, the camera kicks against it). */
  readonly dirX?: number;
  readonly dirY?: number;
  /** Fighter id: numbers on one target within 150 ms merge. */
  readonly target?: string;
  readonly evaded?: boolean;
  readonly breath?: boolean;
  /** The local player was hit. */
  readonly mine?: boolean;
  /** Plays the impact sound through the screen sink (default true). */
  readonly sound?: boolean;
}

/**
 * Effects for the Canvas combat arena, in logical px (960×540). The arena calls `update(dt)` from
 * its render loop and `draw(ctx)` inside its camera transform built from `cameraTransform()`.
 */
export class ArenaFx implements FxSink {
  readonly camera: CameraRig;
  readonly particles: ParticlePool;
  readonly texts: FloatingTextBook;
  private readonly clock: ClockLike;
  private readonly policy: () => FxPolicy;
  private readonly screen: ScreenSink | undefined;
  private readonly rng;
  private telegraph = false;

  constructor(o: ArenaFxOptions) {
    this.clock = o.clock;
    this.policy = o.policy;
    this.screen = o.screen;
    this.rng = createFxRng(hashSeed(o.seed ?? 1));
    this.camera = createCameraRig(ARENA_CAMERA, o.clock);
    this.particles = createParticlePool(PARTICLE_CAP);
    this.texts = createFloatingTextBook(() => this.clock.now());
  }

  reseed(seed: number): void {
    this.rng.reseed(hashSeed(seed));
  }

  /** While a hostile telegraph fills: shake capped at 4 px, no roll. */
  setTelegraph(active: boolean): void {
    this.telegraph = active;
  }

  /** Camera offset/roll/zoom to apply to the arena view (logical px, radians). */
  cameraTransform(): CameraSample {
    const scale = this.policy().shakeScale;
    return scale > 0 ? this.camera.sample({ scale, telegraph: this.telegraph }) : ZERO_CAMERA;
  }

  /** Recoil: 6 px opposite the attack direction, friction 0.85 per tick. */
  kick(dirX: number, dirY: number, px = 6): void {
    if (this.policy().shakeScale > 0) this.camera.kick(dirX, dirY, px);
  }

  /** ≤ 1.06 zoom, 40 ms ramp then ×0.9 per tick (KO, Last Stand, phase change). */
  zoomPunch(amount = 0.06): void {
    if (this.policy().shakeScale > 0) this.camera.zoomPunch(amount);
  }

  /** Continuous trauma, e.g. breath active: `sustain(0.6, dt, 0.5)`. */
  sustain(perSecond: number, dtMs: number, softCap: number): void {
    if (this.policy().shakeScale > 0) this.camera.sustainTrauma(perSecond, dtMs, softCap);
  }

  hit(h: ArenaHit): void {
    const angle =
      h.dirX !== undefined && h.dirY !== undefined ? Math.atan2(h.dirY, h.dirX) : undefined;
    const cues = arenaHitCues({
      at: { kind: 'point', x: h.x, y: h.y },
      damage: h.damage,
      kind: h.kind,
      angle,
      target: h.target,
      evaded: h.evaded,
      breath: h.breath,
      mine: h.mine,
    });
    if (h.sound ?? true) {
      const name: SoundName = h.evaded
        ? 'swing'
        : h.kind === 'parry'
          ? 'parry'
          : h.breath
            ? 'dragon_breath'
            : 'attack_hit';
      cues.unshift({ type: 'sound', name });
      if (h.kind === 'heavy' && !h.evaded) cues.push({ type: 'sound', name: 'crit', volume: 0.7 });
    }
    if (
      (h.kind === 'heavy' || h.kind === 'hostile') &&
      h.dirX !== undefined &&
      h.dirY !== undefined
    ) {
      this.kick(h.dirX, h.dirY);
    }
    this.play(cues);
  }

  /** Runs cues immediately; `point` anchors are logical px. */
  play(cues: readonly FxCue[], resolve?: (a: FxAnchor) => FxPoint | null): void {
    const r = (a: FxAnchor): FxPoint | null =>
      a.kind === 'point' ? { x: a.x, y: a.y } : (resolve?.(a) ?? null);
    for (const cue of cues) runCue(cue, this, r);
  }

  update(dtMs: number): void {
    this.particles.update(dtMs);
    this.particles.drainArrivals();
  }

  /** Draws particles and numbers in logical space (call inside the camera transform). */
  draw(ctx: CanvasRenderingContext2D): void {
    drawParticles(ctx, this.particles);
    drawFloatingTexts(ctx, this.texts.live(), this.clock.now(), this.policy().textInPlace);
  }

  clear(): void {
    this.particles.clear();
    this.texts.clear();
    this.camera.reset();
  }

  // --- FxSink -------------------------------------------------------------------------------

  shake(trauma: number): void {
    if (this.policy().shakeScale > 0) this.camera.addTrauma(trauma);
  }

  /** The sim owns arena hit-stop; presentation freezes only if a screen clock is wired. */
  hitStop(ms: number): void {
    this.screen?.hitStop?.(ms);
  }

  slowMo(factor: number, ms: number, rampMs?: number): void {
    this.screen?.slowMo?.(factor, ms, rampMs);
  }

  bossStop(stop: BossStop): void {
    this.screen?.bossStop?.(stop);
  }

  burst(preset: BurstPresetName, at: FxPoint, opts: BurstOptions = {}): void {
    const p = this.policy();
    if (p.particleScale <= 0) return;
    const def = BURST_PRESETS[preset];
    emitBurst(this.particles, def, at.x, at.y, this.rng, {
      amount: (opts.amount ?? 1) * p.particleScale,
      unit: presetUnit(def.space, 'arena'),
      angle: opts.angle,
      spread: opts.spread,
    });
  }

  ring(preset: RingPresetName, at: FxPoint, color: string): void {
    if (this.policy().particleScale <= 0) return;
    const def = RING_PRESETS[preset];
    emitRing(this.particles, def, at.x, at.y, color, presetUnit(def.space, 'arena'));
  }

  coins(from: FxPoint, to: FxPoint, coins: number): void {
    emitCoinFlight(this.particles, this.rng, { from, to, coins, group: 0, unit: 0.5 });
  }

  text(
    kind: FloatingTextKind,
    at: FxPoint,
    opts: { readonly value?: number; readonly text?: string; readonly target?: string } = {},
  ): void {
    if (!this.policy().text) return;
    this.texts.add({
      kind,
      x: at.x,
      y: at.y + (at.textDy ?? 0),
      value: opts.value,
      text: opts.text,
      target: opts.target,
    });
  }

  flash(tone: FlashTone, alpha: number, ms?: number): void {
    this.screen?.flash(tone, alpha, ms);
  }

  vignette(tone: VignetteTone, strength: number, ms?: number): void {
    this.screen?.vignette(tone, strength, ms);
  }

  punch(_at: FxPoint, _kind: PunchKind): void {
    // Sprites squash in the arena renderer; there is no DOM element to punch.
  }

  sound(name: SoundName, opts?: { readonly volume?: number; readonly semitones?: number }): void {
    this.screen?.sound(name, opts);
  }

  duck(): void {
    this.screen?.duck();
  }

  caption(text: string): void {
    this.screen?.caption(text);
  }
}
