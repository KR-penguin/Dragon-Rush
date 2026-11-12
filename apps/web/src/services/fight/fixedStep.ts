import { COMBAT_TICK_HZ, Q, type CombatEvent } from '@dragon-rush/combat';

export interface FixedStepOptions {
  readonly stepMs: number;
  /** Longer frames (tab switch, debugger) are clamped so the sim never fast-forwards seconds. */
  readonly maxFrameMs: number;
  /** Per-frame step cap at speed 1 (spiral-of-death guard); the backlog beyond it is dropped. */
  readonly maxSteps: number;
}

/** combat-design §1: 60 Hz, frame time clamped to 0.25 s, at most 5 steps per frame. */
export const SIM_STEP: FixedStepOptions = {
  stepMs: 1000 / COMBAT_TICK_HZ,
  maxFrameMs: 250,
  maxSteps: 5,
};

export interface FixedStepResult {
  readonly steps: number;
  /** Leftover time as a fraction of a step: interpolate prev → curr by it. */
  readonly alpha: number;
}

const EPS = 1e-6;

/** Fixed-timestep accumulator ("Fix Your Timestep"): real frame time in, whole sim steps out. */
export function createFixedStep(options: FixedStepOptions = SIM_STEP) {
  let acc = 0;
  return {
    /** `speed` > 1 plays faster (highlight replays) and raises the step cap with it. */
    advance(frameMs: number, speed = 1): FixedStepResult {
      const clamped = Math.min(
        Math.max(0, Number.isFinite(frameMs) ? frameMs : 0),
        options.maxFrameMs,
      );
      acc += clamped * Math.max(0, speed);
      const due = Math.floor((acc + EPS) / options.stepMs);
      const cap = options.maxSteps * Math.max(1, Math.ceil(speed));
      const steps = Math.min(due, cap);
      acc -= steps * options.stepMs;
      if (due > cap) acc -= (due - cap) * options.stepMs;
      acc = Math.max(0, acc);
      return { steps, alpha: Math.min(1, acc / options.stepMs) };
    },
    reset(): void {
      acc = 0;
    },
    pending(): number {
      return acc;
    },
  };
}

export type FixedStep = ReturnType<typeof createFixedStep>;

/** Lets each sim event through once, by its rollback-stable id (`${tick}:${type}:${key}`). */
export function createEventDeduper(capacity = 1024) {
  const seen = new Set<string>();
  const order: string[] = [];
  return {
    filter(events: readonly CombatEvent[]): CombatEvent[] {
      const out: CombatEvent[] = [];
      for (const e of events) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        order.push(e.id);
        if (order.length > capacity) seen.delete(order.shift()!);
        out.push(e);
      }
      return out;
    },
    reset(): void {
      seen.clear();
      order.length = 0;
    },
  };
}

/** Linear interpolation of a Q8 coordinate into logical px. */
export const lerpQ8 = (prev: number, curr: number, alpha: number): number =>
  (prev + (curr - prev) * alpha) / Q;
