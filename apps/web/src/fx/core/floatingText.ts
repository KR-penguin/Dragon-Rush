import { clamp01, easeInOutQuad, easeOutCubic, easeOutQuad, lerp } from './easing';
import type { PresetSpace } from './particlePresets';

export const FLOATING_TEXT_KINDS = [
  'damage',
  'heavy',
  'heal',
  'evade',
  'parry',
  'lastStand',
  'coin',
  'gain',
  'loss',
  'callout',
  'ko',
] as const;
export type FloatingTextKind = (typeof FLOATING_TEXT_KINDS)[number];

export interface TextKindSpec {
  readonly space: PresetSpace;
  readonly fontPx: number;
  readonly color: string;
  readonly lifeMs: number;
  /** Upward travel over `riseMs` after the hold. */
  readonly rise: number;
  readonly riseMs: number;
  /** Sideways travel (evade slides instead of rising). */
  readonly slide: number;
  /** Time at full size before rising and fading. */
  readonly holdMs: number;
  /** Fraction of life spent fading out at the end. */
  readonly fadeFrac: number;
  readonly mergeable: boolean;
}

/**
 * Arena kinds follow the combat spec in logical px (normal 12, heavy 16, 불굴! 24; rise 20 px over
 * 700 ms; fade over the last 30%). Board kinds follow the board spec in CSS px at 1080p
 * (+green / −red rises 24 px over 600 ms).
 */
export const TEXT_KINDS: Record<FloatingTextKind, TextKindSpec> = {
  damage: arena(12, '#F6EBD3', 700, 20, { mergeable: true }),
  heavy: arena(16, '#FF7A3D', 700, 20, { mergeable: true }),
  heal: arena(12, '#6BE38A', 1000, 20, { riseMs: 1000, mergeable: true }),
  evade: arena(12, '#B8A68C', 700, 4, { slide: 20 }),
  parry: arena(14, '#8FB3D9', 700, 16),
  lastStand: arena(24, '#F6D47A', 1400, 12, { holdMs: 900, riseMs: 500 }),
  coin: board(24, '#F6D47A', 600, 24, true),
  gain: board(24, '#6BE38A', 600, 24, true),
  loss: board(24, '#FF5A4A', 600, 24, true),
  callout: board(28, '#F1E6D2', 900, 18, false),
  ko: { ...board(52, '#FF7A3D', 1100, 10, false), holdMs: 300 },
};

function arena(
  fontPx: number,
  color: string,
  lifeMs: number,
  rise: number,
  extra: Partial<TextKindSpec> = {},
): TextKindSpec {
  return {
    space: 'arena',
    fontPx,
    color,
    lifeMs,
    rise,
    riseMs: 700,
    slide: 0,
    holdMs: 0,
    fadeFrac: 0.3,
    mergeable: false,
    ...extra,
  };
}

function board(
  fontPx: number,
  color: string,
  lifeMs: number,
  rise: number,
  mergeable: boolean,
): TextKindSpec {
  return {
    space: 'board',
    fontPx,
    color,
    lifeMs,
    rise,
    riseMs: lifeMs,
    slide: 0,
    holdMs: 0,
    fadeFrac: 0.3,
    mergeable,
  };
}

export const POP_MS = 150;

/** Pop curve 0.4 → 1.25 → 1 over 150 ms. */
export function popScale(ageMs: number): number {
  const t = clamp01(ageMs / POP_MS);
  if (t < 0.6) return lerp(0.4, 1.25, easeOutQuad(t / 0.6));
  return lerp(1.25, 1, easeInOutQuad((t - 0.6) / 0.4));
}

export interface TextFrame {
  readonly dx: number;
  readonly dy: number;
  readonly scale: number;
  readonly alpha: number;
}

/**
 * Pose of a floating text `ageMs` after it spawned (`popAgeMs` restarts the pop when merged).
 * Reduced motion: no pop, rise or slide; the number fades in place.
 */
export function textFrame(
  spec: TextKindSpec,
  ageMs: number,
  popAgeMs: number = ageMs,
  reduceMotion = false,
): TextFrame {
  const life = Math.max(1, spec.lifeMs);
  const t = clamp01(ageMs / life);
  const fadeStart = 1 - spec.fadeFrac;
  let alpha = t < fadeStart ? 1 : clamp01((1 - t) / Math.max(1e-6, spec.fadeFrac));
  if (reduceMotion) {
    alpha *= clamp01(ageMs / 80);
    return { dx: 0, dy: 0, scale: 1, alpha };
  }
  const move = easeOutCubic(clamp01((ageMs - spec.holdMs) / Math.max(1, spec.riseMs)));
  return { dx: spec.slide * move, dy: -spec.rise * move, scale: popScale(popAgeMs), alpha };
}

export function formatTextValue(kind: FloatingTextKind, value: number): string {
  switch (kind) {
    case 'heal':
    case 'gain':
    case 'coin':
      return `+${value}`;
    case 'loss':
      return `−${Math.abs(value)}`;
    default:
      return String(value);
  }
}

export interface FloatingTextItem {
  readonly id: number;
  readonly kind: FloatingTextKind;
  text: string;
  value: number | null;
  readonly x: number;
  readonly y: number;
  readonly born: number;
  popAt: number;
  readonly target: string | null;
}

export interface AddTextRequest {
  readonly kind: FloatingTextKind;
  readonly x: number;
  readonly y: number;
  /** Numeric texts can merge; the label is derived from the value. */
  readonly value?: number;
  readonly text?: string;
  /** Merge and per-target caps key on this (seat, fighter id …). */
  readonly target?: string;
}

export interface AddTextResult {
  readonly item: FloatingTextItem;
  readonly merged: boolean;
  readonly evicted: readonly FloatingTextItem[];
}

export const TEXT_MERGE_WINDOW_MS = 150;
export const TEXT_MAX_PER_TARGET = 6;
export const TEXT_MAX_TOTAL = 40;

/**
 * Bookkeeping for floating numbers: hits on one target within 150 ms merge into one number,
 * at most 6 live numbers per target (oldest evicted). Time is injected.
 */
export function createFloatingTextBook(now: () => number) {
  let items: FloatingTextItem[] = [];
  let nextId = 1;

  const prune = (t: number): void => {
    items = items.filter((it) => t - it.born < TEXT_KINDS[it.kind].lifeMs);
  };

  return {
    add(req: AddTextRequest): AddTextResult {
      const t = now();
      prune(t);
      const spec = TEXT_KINDS[req.kind];
      const target = req.target ?? null;
      if (spec.mergeable && target !== null && req.value !== undefined) {
        for (let k = items.length - 1; k >= 0; k--) {
          const it = items[k]!;
          if (it.target !== target || it.kind !== req.kind || it.value === null) continue;
          if (t - it.born > TEXT_MERGE_WINDOW_MS) break;
          it.value += req.value;
          it.text = formatTextValue(req.kind, it.value);
          it.popAt = t;
          return { item: it, merged: true, evicted: [] };
        }
      }
      const evicted: FloatingTextItem[] = [];
      if (target !== null) {
        const mine = items.filter((it) => it.target === target);
        while (mine.length >= TEXT_MAX_PER_TARGET) evicted.push(mine.shift()!);
      }
      items = items.filter((it) => !evicted.includes(it));
      while (items.length >= TEXT_MAX_TOTAL) evicted.push(items.shift()!);
      const value = req.value ?? null;
      const item: FloatingTextItem = {
        id: nextId++,
        kind: req.kind,
        text: req.text ?? (value !== null ? formatTextValue(req.kind, value) : ''),
        value,
        x: req.x,
        y: req.y,
        born: t,
        popAt: t,
        target,
      };
      items.push(item);
      return { item, merged: false, evicted };
    },
    /** Live items after dropping expired ones. */
    live(): readonly FloatingTextItem[] {
      prune(now());
      return items;
    },
    clear(): void {
      items = [];
    },
  };
}

export type FloatingTextBook = ReturnType<typeof createFloatingTextBook>;
