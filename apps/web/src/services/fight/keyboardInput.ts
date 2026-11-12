import type { FighterInput } from '@dragon-rush/combat';
import { inputFromKeys, layoutCodes, type KeyLayout } from '../../types/combatControls';
import type { FightInputSource } from './types';

/** The parts of a KeyboardEvent the tracker reads (easy to fake in tests). */
export interface KeyLike {
  readonly code: string;
  readonly repeat?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  preventDefault?(): void;
}

interface Listenable {
  addEventListener(type: string, listener: (e: Event) => void): void;
  removeEventListener(type: string, listener: (e: Event) => void): void;
}

/**
 * Key levels by `KeyboardEvent.code`, shared by every keyboard source on the screen (hot-seat).
 * Each keydown bumps a press counter so a tap shorter than one sim tick still registers.
 */
export class KeyTracker {
  private readonly down = new Set<string>();
  private readonly presses = new Map<string, number>();
  private readonly listeners = new Set<() => void>();

  /** Codes whose browser default is suppressed while tracking (Space scroll, arrows, Firefox `/`). */
  constructor(private readonly gameKeys: ReadonlySet<string> = new Set()) {}

  keyDown(e: KeyLike): void {
    if (this.gameKeys.has(e.code) && !e.ctrlKey && !e.altKey && !e.metaKey) e.preventDefault?.();
    if (e.repeat || this.down.has(e.code)) return;
    this.down.add(e.code);
    this.presses.set(e.code, (this.presses.get(e.code) ?? 0) + 1);
    this.notify();
  }

  keyUp(e: KeyLike): void {
    if (this.down.delete(e.code)) this.notify();
  }

  /** Window blur / tab hidden: the matching keyups may never arrive. */
  releaseAll(): void {
    if (this.down.size === 0) return;
    this.down.clear();
    this.notify();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  pressCount(code: string): number {
    return this.presses.get(code) ?? 0;
  }

  /** For the keyboard test view. */
  pressed(): ReadonlySet<string> {
    return this.down;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Binds keydown/keyup on `win`, releasing everything on blur and when the document hides. */
  attach(win: Listenable, doc?: Listenable & { readonly hidden?: boolean }): () => void {
    const onDown = (e: Event) => this.keyDown(e as unknown as KeyLike);
    const onUp = (e: Event) => this.keyUp(e as unknown as KeyLike);
    const onBlur = () => this.releaseAll();
    const onVisibility = () => {
      if (doc?.hidden) this.releaseAll();
    };
    win.addEventListener('keydown', onDown);
    win.addEventListener('keyup', onUp);
    win.addEventListener('blur', onBlur);
    doc?.addEventListener('visibilitychange', onVisibility);
    return () => {
      win.removeEventListener('keydown', onDown);
      win.removeEventListener('keyup', onUp);
      win.removeEventListener('blur', onBlur);
      doc?.removeEventListener('visibilitychange', onVisibility);
      this.releaseAll();
    };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}

/** Every code the given layouts use (feed it to the tracker for preventDefault). */
export const gameKeysOf = (layouts: readonly KeyLayout[]): Set<string> =>
  new Set(layouts.flatMap(layoutCodes));

/**
 * Samples one layout once per tick. A key counts as held if it is down now or was pressed since
 * this source's previous sample, so press-and-release within one frame becomes a one-tick press.
 */
export function createKeyboardSource(
  tracker: KeyTracker,
  layout: KeyLayout,
): FightInputSource & {
  peek(): FighterInput;
} {
  const codes = layoutCodes(layout);
  // Presses made before this source existed (menus, keyboard test) are not taps.
  const seen = new Map<string, number>(codes.map((c) => [c, tracker.pressCount(c)]));
  return {
    sample() {
      const input = inputFromKeys(layout, (code) => {
        const count = tracker.pressCount(code);
        const tapped = count !== (seen.get(code) ?? 0);
        return tracker.isDown(code) || tapped;
      });
      for (const code of codes) seen.set(code, tracker.pressCount(code));
      return input;
    },
    peek() {
      return inputFromKeys(layout, (code) => tracker.isDown(code));
    },
  };
}
