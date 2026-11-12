import { NO_INPUT, type FighterInput } from '@dragon-rush/combat';
import { dirFromAxes } from '../../types/combatControls';

export type TouchAction = 'up' | 'down' | 'left' | 'right' | 'attack' | 'skill' | 'dash';

interface ActivePointer {
  readonly action: TouchAction;
  pending: boolean;
}

/** Pointer ownership and one-tick taps for the local human fighter. */
export class TouchTracker {
  private readonly active = new Map<number, ActivePointer>();
  private readonly pending = new Map<TouchAction, number>();

  press(pointerId: number, action: TouchAction): boolean {
    if (this.active.has(pointerId)) return false;
    this.active.set(pointerId, { action, pending: true });
    this.pending.set(action, (this.pending.get(action) ?? 0) + 1);
    return true;
  }

  release(pointerId: number): void {
    this.active.delete(pointerId);
  }

  cancel(pointerId: number): void {
    const pointer = this.active.get(pointerId);
    if (!pointer) return;
    this.active.delete(pointerId);
    if (pointer.pending)
      this.pending.set(pointer.action, (this.pending.get(pointer.action) ?? 1) - 1);
  }

  releaseAll(): void {
    this.active.clear();
    this.pending.clear();
  }

  sample(): FighterInput {
    const held = new Set([...this.active.values()].map((pointer) => pointer.action));
    const on = (action: TouchAction) => held.has(action) || (this.pending.get(action) ?? 0) > 0;
    const input: FighterInput = {
      move: dirFromAxes(on('up'), on('down'), on('left'), on('right')),
      attack: on('attack'),
      skill: on('skill'),
      dash: on('dash'),
    };
    this.pending.clear();
    for (const pointer of this.active.values()) pointer.pending = false;
    return input.move || input.attack || input.skill || input.dash ? input : NO_INPUT;
  }
}
