import type { FloatingTextKind } from '../core/floatingText';
import type { BurstPresetName, RingPresetName } from '../core/particlePresets';
import type { BossStop } from '../core/time';
import type { SoundName } from '../audio/soundCatalog';
import type { FlashTone, FxAnchor, FxCue, FxPoint, PunchKind, VignetteTone } from '../types';

export interface BurstOptions {
  readonly amount?: number;
  readonly angle?: number;
  readonly spread?: number;
}

/** Everything a cue can ask for. The screen runtime and the arena FX each implement it. */
export interface FxSink {
  shake(trauma: number): void;
  speedLines(strength: number): void;
  hitStop(ms: number): void;
  slowMo(factor: number, ms: number, rampMs?: number): void;
  bossStop(stop: BossStop): void;
  burst(preset: BurstPresetName, at: FxPoint, opts?: BurstOptions): void;
  ring(preset: RingPresetName, at: FxPoint, color: string): void;
  coins(from: FxPoint, to: FxPoint, coins: number): void;
  text(
    kind: FloatingTextKind,
    at: FxPoint,
    opts: { readonly value?: number; readonly text?: string; readonly target?: string },
  ): void;
  flash(tone: FlashTone, alpha: number, ms?: number): void;
  vignette(tone: VignetteTone, strength: number, ms?: number): void;
  punch(at: FxPoint, kind: PunchKind): void;
  sound(name: SoundName, opts?: { readonly volume?: number; readonly semitones?: number }): void;
  duck(): void;
  caption(text: string): void;
}

/** Runs one cue now (delays are the caller's job). Unresolvable anchors skip the visual. */
export function runCue(cue: FxCue, sink: FxSink, resolve: (a: FxAnchor) => FxPoint | null): void {
  switch (cue.type) {
    case 'shake':
      return sink.shake(cue.trauma);
    case 'speedLines':
      return sink.speedLines(cue.strength);
    case 'hitStop':
      return sink.hitStop(cue.ms);
    case 'slowMo':
      return sink.slowMo(cue.factor, cue.ms, cue.rampMs);
    case 'bossStop':
      return sink.bossStop(cue);
    case 'burst': {
      const p = resolve(cue.at);
      if (p)
        sink.burst(cue.preset, p, { amount: cue.amount, angle: cue.angle, spread: cue.spread });
      return;
    }
    case 'ring': {
      const p = resolve(cue.at);
      if (p) sink.ring(cue.preset, p, cue.color);
      return;
    }
    case 'coins': {
      const from = resolve(cue.from);
      const to = resolve(cue.to);
      if (from && to) sink.coins(from, to, cue.coins);
      else sink.sound('coin');
      return;
    }
    case 'text': {
      const p = resolve(cue.at);
      if (p) sink.text(cue.kind, p, { value: cue.value, text: cue.text, target: cue.target });
      return;
    }
    case 'flash':
      return sink.flash(cue.tone, cue.alpha, cue.ms);
    case 'vignette':
      return sink.vignette(cue.tone, cue.strength, cue.ms);
    case 'punch': {
      const p = resolve(cue.at);
      if (p) sink.punch(p, cue.kind);
      return;
    }
    case 'sound':
      return sink.sound(cue.name, { volume: cue.volume, semitones: cue.semitones });
    case 'duck':
      return sink.duck();
    case 'caption':
      return sink.caption(cue.text);
  }
}

/** Cues that only change what is drawn (skipped while the tab is hidden). */
export const isVisualCue = (cue: FxCue): boolean =>
  cue.type !== 'sound' && cue.type !== 'duck' && cue.type !== 'caption';
