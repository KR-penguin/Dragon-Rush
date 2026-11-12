import type { FighterInput } from '@dragon-rush/combat';
import { inputFromKeys, layoutCodes, type KeyLayout } from '../../types/combatControls';
import type { FightInputSource } from './types';
import { TouchTracker } from './touchInput';

/** The parts of a KeyboardEvent the tracker reads (easy to fake in tests). */
export interface KeyLike {
  readonly code: string;
  readonly repeat?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  preventDefault?(): void;
}

interface PointerLike {
  readonly pointerId: number;
  readonly button: number;
  readonly clientX?: number;
  readonly clientY?: number;
  preventDefault?(): void;
}

interface Listenable {
  addEventListener(type: string, listener: (e: Event) => void): void;
  removeEventListener(type: string, listener: (e: Event) => void): void;
}

interface PointerTarget extends Listenable {
  getBoundingClientRect(): Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;
}

/**
 * Key levels by `KeyboardEvent.code`, shared by every keyboard source on the screen (hot-seat).
 * Each keydown bumps a press counter so a tap shorter than one sim tick still registers.
 */
export class KeyTracker {
  readonly touch = new TouchTracker();
  private readonly down = new Set<string>();
  private readonly presses = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private pointerId: number | null = null;
  private pointerPresses = 0;
  private discardedPointerPresses = 0;

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
    this.cancelPointer();
    this.touch.releaseAll();
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

  pointerDown(id: number): boolean {
    if (this.pointerId !== null) return false;
    this.pointerId = id;
    this.pointerPresses++;
    return true;
  }

  pointerUp(id: number): void {
    if (this.pointerId === id) this.pointerId = null;
  }

  /** Discard unsampled presses when the pointer leaves or the fight loses focus. */
  cancelPointer(): void {
    this.pointerId = null;
    this.discardedPointerPresses = this.pointerPresses;
  }

  pointerPressCount(): number {
    return this.pointerPresses;
  }

  pointerActiveSince(seen: number): boolean {
    return (
      this.pointerId !== null || this.pointerPresses > Math.max(seen, this.discardedPointerPresses)
    );
  }

  pointerHeld(): boolean {
    return this.pointerId !== null;
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

  /** Bind the arena canvas only while a local fighter can act. */
  attachPointer(target: PointerTarget): () => void {
    const onDown = (event: Event) => {
      const pointer = event as unknown as PointerLike;
      if (pointer.button === 0 && this.pointerDown(pointer.pointerId)) pointer.preventDefault?.();
    };
    const onUp = (event: Event) => this.pointerUp((event as unknown as PointerLike).pointerId);
    const onLeave = (event: Event) => {
      if (this.pointerId === (event as unknown as PointerLike).pointerId) this.cancelPointer();
    };
    const onMove = (event: Event) => {
      const pointer = event as unknown as PointerLike;
      if (this.pointerId !== pointer.pointerId) return;
      const rect = target.getBoundingClientRect();
      if (
        pointer.clientX !== undefined &&
        pointer.clientY !== undefined &&
        (pointer.clientX < rect.left ||
          pointer.clientX >= rect.right ||
          pointer.clientY < rect.top ||
          pointer.clientY >= rect.bottom)
      )
        this.cancelPointer();
    };
    const onCancel = (event: Event) => {
      if (this.pointerId === (event as unknown as PointerLike).pointerId) this.cancelPointer();
    };
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointerleave', onLeave);
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointercancel', onCancel);
    return () => {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointerleave', onLeave);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointercancel', onCancel);
      this.cancelPointer();
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
  let seenPointer = tracker.pointerPressCount();
  const usePointer = layout.id !== 'p2';
  return {
    sample() {
      const input = inputFromKeys(layout, (code) => {
        const count = tracker.pressCount(code);
        const tapped = count !== (seen.get(code) ?? 0);
        return tracker.isDown(code) || tapped;
      });
      for (const code of codes) seen.set(code, tracker.pressCount(code));
      const pointerAttack = usePointer && tracker.pointerActiveSince(seenPointer);
      seenPointer = tracker.pointerPressCount();
      if (!usePointer) return input;
      const touch = tracker.touch.sample();
      return {
        move: input.move || touch.move,
        attack: input.attack || pointerAttack || touch.attack,
        skill: input.skill || touch.skill,
        dash: input.dash || touch.dash,
      };
    },
    peek() {
      const input = inputFromKeys(layout, (code) => tracker.isDown(code));
      return usePointer && tracker.pointerHeld() ? { ...input, attack: true } : input;
    },
  };
}
