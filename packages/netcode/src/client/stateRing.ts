import type { CombatEvent, CombatState } from '@dragon-rush/combat';
import { STATE_RING } from '../constants';

export interface TickSlot {
  tick: number;
  /** State produced by `tick` (immutable: stepCombat returns fresh objects). */
  state: CombatState;
  /** Masks the step used for seat 0 / seat 1. */
  used0: number;
  used1: number;
  events: readonly CombatEvent[];
}

const MASK = STATE_RING - 1;

/** 128 state slots indexed by tick & 127; `slot.tick` guards against wrap-around. */
export class StateRing {
  private readonly slots: (TickSlot | null)[] = new Array<TickSlot | null>(STATE_RING).fill(null);

  set(
    tick: number,
    state: CombatState,
    used0: number,
    used1: number,
    events: readonly CombatEvent[],
  ): TickSlot {
    const i = tick & MASK;
    const slot = this.slots[i];
    if (slot) {
      slot.tick = tick;
      slot.state = state;
      slot.used0 = used0;
      slot.used1 = used1;
      slot.events = events;
      return slot;
    }
    const fresh: TickSlot = { tick, state, used0, used1, events };
    this.slots[i] = fresh;
    return fresh;
  }

  get(tick: number): TickSlot | null {
    const s = this.slots[tick & MASK];
    return s && s.tick === tick ? s : null;
  }

  /** Throws when a slot that must be retained is gone (a logic error, never a network condition). */
  must(tick: number): TickSlot {
    const s = this.get(tick);
    if (!s) throw new Error(`state ring lost tick ${tick}`);
    return s;
  }

  clear(): void {
    this.slots.fill(null);
  }
}
