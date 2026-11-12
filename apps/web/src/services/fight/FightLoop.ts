import type { CombatEvent, CombatResult } from '@dragon-rush/combat';
import {
  SIM_STEP,
  createEventDeduper,
  createFixedStep,
  type FixedStep,
  type FixedStepOptions,
} from './fixedStep';
import type {
  FightFrame,
  FightInfo,
  FightSession,
  FightStateProvider,
  FrameListener,
} from './types';

/** Browser hooks the loop needs; tests inject fakes. */
export interface LoopHost {
  now(): number;
  requestFrame(cb: (t: number) => void): number;
  cancelFrame(id: number): void;
  /** Tab visibility; the loop pauses while hidden and resumes without catch-up. */
  isHidden?(): boolean;
  onVisibilityChange?(cb: () => void): () => void;
}

export const browserHost = (): LoopHost => ({
  now: () => performance.now(),
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (id) => cancelAnimationFrame(id),
  isHidden: () => document.hidden,
  onVisibilityChange: (cb) => {
    document.addEventListener('visibilitychange', cb);
    return () => document.removeEventListener('visibilitychange', cb);
  },
});

export interface FightLoopOptions {
  /** Playback speed (bot-only replays run at 4×). */
  readonly speed?: number;
  readonly step?: FixedStepOptions;
}

/**
 * Drives any FightStateProvider from requestAnimationFrame: fixed 60 Hz steps through an
 * accumulator, `{prev, curr, alpha}` for interpolation, each event once, the result once.
 */
export class FightLoop implements FightSession {
  private readonly stepper: FixedStep;
  private readonly dedupe = createEventDeduper();
  private readonly frameListeners = new Set<FrameListener>();
  private readonly endListeners = new Set<(r: CombatResult) => void>();
  private started = false;
  private manualPause = false;
  private hidden = false;
  private ended = false;
  private disposed = false;
  private rafId: number | null = null;
  private last: number | null = null;
  private alpha = 0;
  private readonly unsubVisibility: (() => void) | null;

  constructor(
    readonly info: FightInfo,
    private readonly provider: FightStateProvider,
    private readonly host: LoopHost,
    private readonly options: FightLoopOptions = {},
  ) {
    this.stepper = createFixedStep(options.step ?? SIM_STEP);
    this.hidden = host.isHidden?.() ?? false;
    this.unsubVisibility =
      host.onVisibilityChange?.(() => {
        this.hidden = host.isHidden?.() ?? false;
        // Resume from "now": hidden time is neither simulated nor caught up.
        this.last = null;
      }) ?? null;
    this.schedule();
  }

  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.last = null;
    this.stepper.reset();
  }

  isStarted(): boolean {
    return this.started;
  }

  frame(): FightFrame {
    const done = this.provider.curr.outcome !== null;
    return { prev: this.provider.prev, curr: this.provider.curr, alpha: done ? 1 : this.alpha };
  }

  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  onEnd(listener: (r: CombatResult) => void): () => void {
    this.endListeners.add(listener);
    return () => this.endListeners.delete(listener);
  }

  result(): CombatResult | null {
    return this.provider.result();
  }

  setPaused(paused: boolean): void {
    this.manualPause = paused;
    this.last = null;
  }

  isPaused(): boolean {
    return this.manualPause || this.hidden;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId !== null) this.host.cancelFrame(this.rafId);
    this.rafId = null;
    this.unsubVisibility?.();
    this.provider.dispose?.();
    this.frameListeners.clear();
    this.endListeners.clear();
  }

  /** One animation frame: advance the sim by the elapsed real time, then notify. Public for tests. */
  tick(t: number): void {
    if (this.disposed) return;
    const dt = this.last === null ? 0 : t - this.last;
    this.last = t;
    const events: CombatEvent[] = [];
    if (this.started && !this.isPaused() && !this.ended) {
      const { steps, alpha } = this.stepper.advance(dt, this.options.speed ?? 1);
      for (let i = 0; i < steps && this.provider.curr.outcome === null; i++) {
        events.push(...this.dedupe.filter(this.provider.step()));
      }
      this.alpha = alpha;
    }
    const frame = this.frame();
    for (const l of this.frameListeners) l(frame, events, dt);
    const result = this.provider.result();
    if (result && !this.ended) {
      this.ended = true;
      for (const l of this.endListeners) l(result);
    }
  }

  private schedule(): void {
    if (this.disposed) return;
    this.rafId = this.host.requestFrame((t) => {
      this.rafId = null;
      this.tick(t);
      this.schedule();
    });
  }
}
