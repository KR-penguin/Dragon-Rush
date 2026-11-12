import {
  BOARD_CAMERA,
  ZERO_CAMERA,
  createCameraRig,
  type CameraRig,
  type CameraSample,
} from '../core/camera';
import { createFlashGovernor, pulseEnvelope, type FlashGovernor } from '../core/flash';
import { createFloatingTextBook, type FloatingTextKind } from '../core/floatingText';
import { PARTICLE_CAP, createParticlePool, type ParticlePool } from '../core/particles';
import {
  BURST_PRESETS,
  RING_PRESETS,
  emitBurst,
  emitCoinFlight,
  emitRing,
  presetUnit,
  type BurstPresetName,
  type PresetSpace,
  type RingPresetName,
} from '../core/particlePresets';
import { createFxRng, hashSeed } from '../core/rng';
import { createSpeedLineBurst } from '../core/speedLines';
import type { BossStop, FxClock } from '../core/time';
import { createRisingSequence, type SoundName } from '../audio/soundCatalog';
import { hitCues, hitStrength, type HitRecipe } from '../recipes';
import { drawParticles } from '../render/drawParticles';
import { drawSpeedLines } from '../render/drawSpeedLines';
import type { FxPolicy } from '../settings/fxSettings';
import type {
  FlashTone,
  FxAnchor,
  FxCue,
  FxPoint,
  FxResolver,
  PunchKind,
  ScreenSpot,
  VignetteTone,
} from '../types';
import { isVisualCue, runCue, type BurstOptions, type FxSink } from './cueRunner';
import { punchElement } from './punch';
import { createTextLayer } from './textLayer';

export interface FxAudioPort {
  play(name: SoundName, opts?: { readonly volume?: number; readonly semitones?: number }): void;
  duck(): void;
  /** Notifies about every sound that starts (captions). */
  onPlayed?(listener: (name: SoundName) => void): () => void;
}

/** DOM nodes of the overlay (see FxLayer). */
export interface FxSurface {
  readonly canvas: HTMLCanvasElement;
  readonly texts: HTMLElement;
  readonly flash: HTMLElement;
  readonly vignette: HTMLElement;
  readonly caption?: HTMLElement | null;
}

export interface FxRuntimeOptions {
  readonly clock: FxClock;
  readonly audio: FxAudioPort;
  readonly policy: () => FxPolicy;
  /** Caption text for a sound when captions are on. */
  readonly captionFor?: (name: SoundName) => string | undefined;
}

/** Arena/combat-renderer hit, in screen CSS px. */
export interface ScreenHit {
  readonly x: number;
  readonly y: number;
  readonly damage: number;
  /** 0..1; derived from damage and `maxHp` when omitted. */
  readonly strength?: number;
  readonly maxHp?: number;
  readonly heavy?: boolean;
  readonly hostile?: boolean;
  readonly evaded?: boolean;
  readonly parried?: boolean;
  readonly breath?: boolean;
  readonly angle?: number;
  readonly target?: string;
  readonly mine?: boolean;
  /** Play the default impact sound (default true). */
  readonly sound?: boolean;
}

const FLASH_COLOR: Record<FlashTone, string> = {
  white: '#FFFFFF',
  gold: '#F6D47A',
  warm: '#FFE2C4',
};
const VIGNETTE_COLOR: Record<VignetteTone, string> = {
  red: 'rgba(200, 40, 30, 0.85)',
  dark: 'rgba(0, 0, 0, 0.9)',
  gold: 'rgba(217, 164, 65, 0.7)',
  moon: 'rgba(143, 179, 217, 0.7)',
};
const MAX_DT_MS = 50;
const CAPTION_MS = 2200;

interface FlightGroup {
  readonly el: Element | undefined;
  readonly seq: ReturnType<typeof createRisingSequence>;
  remaining: number;
}

/**
 * The screen-space effects shell: one rAF loop outside React that owns the trauma camera for
 * `.world-shake` targets, the particle pool, floating texts and the flash/vignette overlay.
 * Idle when nothing is animating; paused while the tab is hidden.
 */
export class FxRuntime implements FxSink {
  readonly clock: FxClock;
  readonly particles: ParticlePool = createParticlePool(PARTICLE_CAP);
  readonly camera: CameraRig;
  private readonly audio: FxAudioPort;
  private readonly policy: () => FxPolicy;
  private readonly captionFor: (name: SoundName) => string | undefined;
  private readonly texts;
  private readonly flashes: FlashGovernor;
  private readonly rng = createFxRng();
  private readonly speedLineBurst = createSpeedLineBurst(() => this.clock.realNow());
  private surface: FxSurface | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private textLayer: ReturnType<typeof createTextLayer> | null = null;
  private readonly shakeTargets = new Set<HTMLElement>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly flights = new Map<number, FlightGroup>();
  private nextFlight = 1;
  private vignetteState: { color: string; strength: number; start: number; ms: number } | null =
    null;
  private captionUntil = 0;
  private raf = 0;
  private lastFx = 0;
  private viewportScale = 1;
  private dpr = 1;
  private telegraph = false;
  private hitStopOn = false;
  private canvasDirty = false;
  private shakeApplied = false;
  private detachers: (() => void)[] = [];

  constructor(o: FxRuntimeOptions) {
    this.clock = o.clock;
    this.audio = o.audio;
    this.policy = o.policy;
    this.captionFor = o.captionFor ?? (() => undefined);
    this.camera = createCameraRig(BOARD_CAMERA, o.clock);
    this.texts = createFloatingTextBook(() => this.clock.now());
    this.flashes = createFlashGovernor(
      () => this.clock.realNow(),
      () => !this.policy().flash,
    );
  }

  // --- Lifecycle ----------------------------------------------------------------------------

  /** Binds the overlay DOM; returns a detach function. Only one surface is active at a time. */
  attach(surface: FxSurface): () => void {
    this.detach();
    this.surface = surface;
    this.ctx2d = surface.canvas.getContext('2d');
    this.textLayer = createTextLayer(surface.texts);
    const onResize = () => this.resize();
    const onVisibility = () => {
      if (document.hidden) this.clearVisuals();
      else this.ensureLoop();
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    const offPlayed = this.audio.onPlayed?.((name) => {
      const text = this.captionFor(name);
      if (text) this.caption(text);
    });
    this.detachers = [
      () => window.removeEventListener('resize', onResize),
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => offPlayed?.(),
    ];
    this.resize();
    return () => {
      if (this.surface === surface) this.detach();
    };
  }

  detach(): void {
    for (const d of this.detachers) d();
    this.detachers = [];
    this.cancelPending();
    this.clearVisuals();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.surface = null;
    this.ctx2d = null;
    this.textLayer = null;
  }

  /** Registers a `.world-shake` element; the HUD should never be registered. */
  addShakeTarget(el: HTMLElement): () => void {
    this.shakeTargets.add(el);
    return () => {
      this.shakeTargets.delete(el);
      el.style.transform = '';
    };
  }

  /** While a hostile telegraph fills, shake output is capped at 4 px with no roll. */
  setTelegraph(active: boolean): void {
    this.telegraph = active;
  }

  /** Current board camera offset (for canvas cameras that follow the board shake). */
  cameraOffset(): CameraSample {
    const p = this.policy();
    return p.shakeScale > 0
      ? this.camera.sample({
          scale: p.shakeScale,
          unit: this.viewportScale,
          telegraph: this.telegraph,
        })
      : ZERO_CAMERA;
  }

  /** Viewport-height scale (1 at 1080p) and the unit for a preset space on this surface. */
  unitFor(space: PresetSpace): number {
    return presetUnit(space, 'screen', this.viewportScale);
  }

  // --- Cue playback -------------------------------------------------------------------------

  /** Plays cues; anchors resolve when each cue runs, so delayed cues follow moving targets. */
  play(cues: readonly FxCue[], resolver?: FxResolver, seed?: number): void {
    if (seed !== undefined) this.rng.reseed(hashSeed(seed));
    const resolve = (a: FxAnchor) => this.resolveAnchor(a, resolver);
    for (const cue of cues) {
      const delay = cue.delayMs ?? 0;
      if (delay <= 0) this.runOne(cue, resolve);
      else {
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          this.runOne(cue, resolve);
        }, delay);
        this.timers.add(timer);
      }
    }
  }

  cancelPending(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private runOne(cue: FxCue, resolve: (a: FxAnchor) => FxPoint | null): void {
    if (isVisualCue(cue) && (!this.surface || (typeof document !== 'undefined' && document.hidden)))
      return;
    runCue(cue, this, resolve);
  }

  private resolveAnchor(a: FxAnchor, resolver?: FxResolver): FxPoint | null {
    if (a.kind === 'point') return { x: a.x, y: a.y };
    if (a.kind === 'screen') return this.screenSpot(a.at);
    return resolver?.(a) ?? null;
  }

  private screenSpot(at: ScreenSpot): FxPoint {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const h = typeof window !== 'undefined' ? window.innerHeight : 1080;
    switch (at) {
      case 'center':
        return { x: w / 2, y: h / 2 };
      case 'top':
        return { x: w / 2, y: 0 };
      case 'bottomLeft':
        return { x: w * 0.08, y: h };
      case 'bottomRight':
        return { x: w * 0.92, y: h };
    }
  }

  // --- FxSink primitives (screen CSS px) ----------------------------------------------------

  shake(trauma: number): void {
    if (this.policy().shakeScale <= 0) return;
    this.camera.addTrauma(trauma);
    this.ensureLoop();
  }

  speedLines(strength: number): void {
    const p = this.policy();
    if (p.reduceMotion || p.particleScale <= 0) return;
    this.speedLineBurst.trigger(strength);
    this.ensureLoop();
  }

  hitStop(ms: number): void {
    const scale = this.policy().hitStopScale;
    if (scale <= 0 || ms <= 0) return;
    this.clock.freeze(ms * scale);
    this.ensureLoop();
  }

  slowMo(factor: number, ms: number, rampMs?: number): void {
    if (!this.policy().slowMo) return;
    this.clock.slowMo(factor, ms, rampMs);
    this.ensureLoop();
  }

  bossStop(stop: BossStop): void {
    const p = this.policy();
    const freezeMs = stop.freezeMs * p.hitStopScale;
    if (p.slowMo) this.clock.bossStop({ ...stop, freezeMs });
    else if (freezeMs > 0) this.clock.freeze(freezeMs);
    this.ensureLoop();
  }

  burst(preset: BurstPresetName, at: FxPoint, opts: BurstOptions = {}): void {
    const p = this.policy();
    if (p.particleScale <= 0) return;
    const def = BURST_PRESETS[preset];
    emitBurst(this.particles, def, at.x, at.y, this.rng, {
      amount: (opts.amount ?? 1) * p.particleScale,
      unit: this.unitFor(def.space),
      angle: opts.angle,
      spread: opts.spread,
    });
    this.ensureLoop();
  }

  ring(preset: RingPresetName, at: FxPoint, color: string): void {
    if (this.policy().particleScale <= 0) return;
    const def = RING_PRESETS[preset];
    emitRing(this.particles, def, at.x, at.y, color, this.unitFor(def.space));
    this.ensureLoop();
  }

  coins(from: FxPoint, to: FxPoint, coins: number): void {
    const p = this.policy();
    const spawned =
      p.particleScale > 0
        ? emitCoinFlight(this.particles, this.rng, {
            from,
            to,
            coins,
            group: this.nextFlight,
            unit: this.viewportScale,
          })
        : 0;
    if (spawned === 0) {
      this.sound('coin');
      return;
    }
    this.flights.set(this.nextFlight++, {
      el: to.el,
      seq: createRisingSequence(),
      remaining: spawned,
    });
    this.ensureLoop();
  }

  text(
    kind: FloatingTextKind,
    at: FxPoint,
    opts: { readonly value?: number; readonly text?: string; readonly target?: string } = {},
  ): void {
    if (!this.policy().text) return;
    let y = at.y + (at.textDy ?? 0);
    // Keep separate texts at one spot from overlapping (merging handles same-target numbers).
    const now = this.clock.now();
    for (const it of this.texts.live()) {
      if (it.target === (opts.target ?? null) && opts.target !== undefined) continue;
      if (now - it.born < 250 && Math.abs(it.x - at.x) < 30 && Math.abs(it.y - y) < 18)
        y -= 22 * this.viewportScale;
    }
    this.texts.add({ kind, x: at.x, y, value: opts.value, text: opts.text, target: opts.target });
    this.ensureLoop();
  }

  flash(tone: FlashTone | string, alpha: number, ms?: number): void {
    const color = tone in FLASH_COLOR ? FLASH_COLOR[tone as FlashTone] : tone;
    if (this.flashes.request({ color, alpha, durationMs: ms })) this.ensureLoop();
  }

  vignette(tone: VignetteTone, strength: number, ms = 600): void {
    if (!this.policy().vignette) return;
    this.vignetteState = {
      color: VIGNETTE_COLOR[tone],
      strength: Math.min(1, strength),
      start: this.clock.realNow(),
      ms,
    };
    this.ensureLoop();
  }

  punch(at: FxPoint, kind: PunchKind): void {
    if (!at.el || !this.policy().punch) return;
    punchElement(at.el, kind);
  }

  sound(name: SoundName, opts?: { readonly volume?: number; readonly semitones?: number }): void {
    if (!this.policy().sound) return;
    this.audio.play(name, opts);
  }

  duck(): void {
    if (this.policy().sound) this.audio.duck();
  }

  caption(text: string): void {
    const el = this.surface?.caption;
    if (!el || !this.policy().captions) return;
    el.textContent = text;
    this.captionUntil = this.clock.realNow() + CAPTION_MS;
    this.ensureLoop();
  }

  // --- High-level API for renderers that work in screen space -------------------------------

  /** Impact at a screen point: hit-stop, trauma, sparks, ring, number, flash and sound. */
  hit(h: ScreenHit): void {
    const strength = h.strength ?? hitStrength(h.damage, h.maxHp ?? 40);
    const recipe: HitRecipe = {
      at: { kind: 'point', x: h.x, y: h.y },
      damage: h.damage,
      strength,
      heavy: h.heavy,
      hostile: h.hostile,
      evaded: h.evaded,
      parried: h.parried,
      breath: h.breath,
      angle: h.angle,
      target: h.target,
      mine: h.mine,
    };
    const cues = hitCues(recipe);
    if (h.sound ?? true) {
      const name: SoundName = h.parried
        ? 'parry'
        : h.evaded || h.damage <= 0
          ? 'swing'
          : h.breath
            ? 'dragon_breath'
            : 'attack_hit';
      cues.unshift({ type: 'sound', name });
      if (!h.evaded && !h.parried && h.damage > 0 && (h.heavy || strength >= 0.75))
        cues.push({ type: 'sound', name: 'crit' });
    }
    this.play(cues);
  }

  // --- Frame loop ---------------------------------------------------------------------------

  private resize(): void {
    const s = this.surface;
    if (!s || typeof window === 'undefined') return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.viewportScale = Math.min(1.6, Math.max(0.6, window.innerHeight / 1080));
    const w = window.innerWidth;
    const h = window.innerHeight;
    s.canvas.width = Math.round(w * this.dpr);
    s.canvas.height = Math.round(h * this.dpr);
    s.canvas.style.width = `${w}px`;
    s.canvas.style.height = `${h}px`;
    this.canvasDirty = true;
    this.ensureLoop();
  }

  private ensureLoop(): void {
    if (this.raf || !this.surface || typeof requestAnimationFrame === 'undefined') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.lastFx = this.clock.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (): void => {
    this.raf = 0;
    const s = this.surface;
    if (!s) return;
    const policy = this.policy();
    const now = this.clock.now();
    const dt = Math.min(MAX_DT_MS, Math.max(0, now - this.lastFx));
    this.lastFx = now;
    const realNow = this.clock.realNow();

    this.particles.update(dt);
    this.handleArrivals(policy);

    const ctx = this.ctx2d;
    const lines =
      !policy.reduceMotion && policy.particleScale > 0 ? this.speedLineBurst.sample() : null;
    if (ctx && (this.particles.count > 0 || lines || this.canvasDirty)) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (lines)
        drawSpeedLines(
          ctx,
          s.canvas.width / this.dpr,
          s.canvas.height / this.dpr,
          lines,
          '#F6D47A',
        );
      drawParticles(ctx, this.particles);
      this.canvasDirty = this.particles.count > 0 || lines !== null;
    }

    const items = this.texts.live();
    this.textLayer?.render(items, now, policy.textInPlace, (space) => this.unitFor(space));

    const cam = this.cameraOffset();
    const shaking = cam.dx !== 0 || cam.dy !== 0 || cam.rot !== 0 || cam.zoom !== 1;
    if (shaking || this.shakeApplied) {
      const transform = shaking
        ? `translate3d(${cam.dx.toFixed(2)}px, ${cam.dy.toFixed(2)}px, 0) rotate(${cam.rot.toFixed(5)}rad)${cam.zoom !== 1 ? ` scale(${cam.zoom.toFixed(4)})` : ''}`
        : '';
      for (const el of this.shakeTargets) el.style.transform = transform;
      this.shakeApplied = shaking;
    }

    const flash = this.flashes.sample();
    s.flash.style.opacity = flash.alpha > 0 ? flash.alpha.toFixed(3) : '0';
    if (flash.alpha > 0) s.flash.style.backgroundColor = flash.color;

    let vignetteOn = false;
    if (this.vignetteState) {
      const v = this.vignetteState;
      const env = pulseEnvelope(realNow - v.start, 80, v.ms);
      if (env <= 0 && realNow - v.start > 80) this.vignetteState = null;
      else vignetteOn = true;
      s.vignette.style.setProperty('--fx-vignette', v.color);
      s.vignette.style.opacity = (v.strength * Math.max(0, env)).toFixed(3);
    } else s.vignette.style.opacity = '0';

    if (s.caption) s.caption.classList.toggle('is-on', realNow < this.captionUntil);

    const frozen = this.clock.isFrozen();
    if (frozen !== this.hitStopOn) {
      this.hitStopOn = frozen;
      document.documentElement.classList.toggle('fx-hitstop', frozen);
    }

    const active =
      this.particles.count > 0 ||
      lines !== null ||
      items.length > 0 ||
      shaking ||
      !this.camera.isIdle() ||
      flash.alpha > 0 ||
      vignetteOn ||
      realNow < this.captionUntil ||
      frozen ||
      this.clock.scale() < 1;
    if (active) this.raf = requestAnimationFrame(this.frame);
  };

  private handleArrivals(policy: FxPolicy): void {
    for (const a of this.particles.drainArrivals()) {
      const g = this.flights.get(a.group);
      if (!g) continue;
      this.sound('clink', { semitones: g.seq.next() });
      if (g.el && policy.punch) punchElement(g.el, 'pop');
      if (policy.particleScale > 0) {
        emitBurst(this.particles, BURST_PRESETS.goldSparkle, a.x, a.y, this.rng, {
          amount: 0.25,
          unit: this.unitFor('board'),
        });
      }
      g.remaining -= 1;
      if (g.remaining <= 0) this.flights.delete(a.group);
    }
  }

  private clearVisuals(): void {
    this.particles.clear();
    this.texts.clear();
    this.textLayer?.clear();
    this.flights.clear();
    this.vignetteState = null;
    this.camera.reset();
    this.speedLineBurst.reset();
    for (const el of this.shakeTargets) el.style.transform = '';
    this.shakeApplied = false;
    const s = this.surface;
    if (s) {
      s.flash.style.opacity = '0';
      s.vignette.style.opacity = '0';
      this.ctx2d?.clearRect(0, 0, s.canvas.width, s.canvas.height);
    }
    if (this.hitStopOn && typeof document !== 'undefined') {
      document.documentElement.classList.remove('fx-hitstop');
      this.hitStopOn = false;
    }
  }
}
