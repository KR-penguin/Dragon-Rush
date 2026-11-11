import type { CombatantRef, SeatId } from '@dragon-rush/engine';
import type { FloatingTextKind } from './core/floatingText';
import type { BurstPresetName, RingPresetName } from './core/particlePresets';
import type { SoundName } from './audio/soundCatalog';

/** Screen point in CSS px (viewport coordinates). `el` lets one-shots punch the element there. */
export interface FxPoint {
  readonly x: number;
  readonly y: number;
  readonly el?: Element;
  /** Where floating texts start relative to the point (negative = above a pawn's head). */
  readonly textDy?: number;
}

export type HudSlot = 'panel' | 'coins' | 'hp' | 'stats';
export type ScreenSpot = 'center' | 'bottomLeft' | 'bottomRight' | 'top';

/**
 * Symbolic place an effect is anchored to. The board renderer injects a resolver that turns
 * anchors into screen points, so effects survive a board redesign unchanged.
 */
export type FxAnchor =
  | { readonly kind: 'point'; readonly x: number; readonly y: number }
  | { readonly kind: 'screen'; readonly at: ScreenSpot }
  | { readonly kind: 'seat'; readonly seat: SeatId }
  | { readonly kind: 'tile'; readonly tile: number }
  | { readonly kind: 'hud'; readonly seat: SeatId; readonly slot: HudSlot }
  | { readonly kind: 'combatant'; readonly ref: CombatantRef; readonly side: 'a' | 'b' | null }
  | { readonly kind: 'board' }
  | { readonly kind: 'dice' };

/** Returns null when the anchor is not on screen; the cue is then skipped. */
export type FxResolver = (anchor: FxAnchor) => FxPoint | null;

export type FlashTone = 'white' | 'gold' | 'warm';
export type VignetteTone = 'red' | 'dark' | 'gold' | 'moon';
export type PunchKind = 'pop' | 'glow' | 'wobble' | 'press' | 'darken';

interface CueTiming {
  /** Real-time delay before the cue runs (already divided by the animation speed). */
  readonly delayMs?: number;
}

export type FxCue = CueTiming &
  (
    | { readonly type: 'shake'; readonly trauma: number }
    | { readonly type: 'hitStop'; readonly ms: number }
    | {
        readonly type: 'slowMo';
        readonly factor: number;
        readonly ms: number;
        readonly rampMs?: number;
      }
    | {
        readonly type: 'bossStop';
        readonly freezeMs: number;
        readonly slowFactor: number;
        readonly slowMs: number;
        readonly rampMs: number;
      }
    | {
        readonly type: 'burst';
        readonly preset: BurstPresetName;
        readonly at: FxAnchor;
        readonly amount?: number;
        readonly angle?: number;
        /** Overrides the preset cone width (radians), e.g. a full ring when the direction is unknown. */
        readonly spread?: number;
      }
    | {
        readonly type: 'ring';
        readonly preset: RingPresetName;
        readonly at: FxAnchor;
        readonly color: string;
      }
    | {
        readonly type: 'coins';
        readonly from: FxAnchor;
        readonly to: FxAnchor;
        readonly coins: number;
      }
    | {
        readonly type: 'text';
        readonly kind: FloatingTextKind;
        readonly at: FxAnchor;
        readonly value?: number;
        readonly text?: string;
        readonly target?: string;
      }
    | {
        readonly type: 'flash';
        readonly tone: FlashTone;
        readonly alpha: number;
        readonly ms?: number;
      }
    | {
        readonly type: 'vignette';
        readonly tone: VignetteTone;
        readonly strength: number;
        readonly ms?: number;
      }
    | { readonly type: 'punch'; readonly at: FxAnchor; readonly kind: PunchKind }
    | {
        readonly type: 'sound';
        readonly name: SoundName;
        readonly volume?: number;
        readonly semitones?: number;
      }
    | { readonly type: 'duck' }
    | { readonly type: 'caption'; readonly text: string }
  );

export type FxCueType = FxCue['type'];
