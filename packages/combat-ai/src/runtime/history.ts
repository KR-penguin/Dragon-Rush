import type { CombatState } from '@dragon-rush/combat';

/**
 * Ring buffer of the last `capacity` per-tick states, used for the reaction delay: a seat observes the state
 * `delay` ticks ago (hitstop ticks included, they are real time). Starts filled with the first state.
 * States must be immutable snapshots (stepCombat results or clones).
 */
export class StateHistory {
  private readonly buf: CombatState[];
  private head = 0;

  constructor(
    readonly capacity: number,
    first: CombatState,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1)
      throw new RangeError('history capacity must be >= 1');
    this.buf = Array.from({ length: capacity }, () => first);
  }

  reset(first: CombatState): void {
    this.buf.fill(first);
    this.head = 0;
  }

  push(state: CombatState): void {
    this.head = (this.head + 1) % this.capacity;
    this.buf[this.head] = state;
  }

  latest(): CombatState {
    return this.buf[this.head]!;
  }

  /** The state `delay` ticks before the latest one (clamped to the oldest kept). */
  delayed(delay: number): CombatState {
    const d = Math.min(Math.max(0, Math.floor(delay)), this.capacity - 1);
    return this.buf[(this.head - d + this.capacity) % this.capacity]!;
  }
}
