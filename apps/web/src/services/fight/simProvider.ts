import {
  NO_INPUT,
  combatResult,
  createCombat,
  stepCombat,
  type CombatEvent,
  type CombatResult,
  type CombatRules,
  type CombatSetup,
  type CombatState,
  type FighterInput,
} from '@dragon-rush/combat';
import { packInput, unpackInput } from '../../types/combatControls';
import type { FightReplay } from '../gameClient';
import type { FightInputSource, FightStateProvider } from './types';

/** Side b is null in a dragon fight (the dragon is scripted inside the sim). */
export type FightSources = readonly [FightInputSource, FightInputSource | null];

/**
 * The local timeline: the deterministic sim stepped with local input sources. Records the inputs
 * of every tick, so any fight can be replayed exactly from (setup, seed, inputs).
 */
export class LocalSimProvider implements FightStateProvider {
  prev: CombatState;
  curr: CombatState;
  private readonly log: number[] = [];

  constructor(
    setup: CombatSetup,
    seed: number,
    private readonly sources: FightSources,
    rules?: CombatRules,
  ) {
    this.curr = createCombat(setup, seed, rules);
    this.prev = this.curr;
  }

  step(): readonly CombatEvent[] {
    if (this.curr.outcome) return [];
    const s = this.curr;
    const a = this.sources[0].sample(s, 'a');
    const b = s.b && this.sources[1] ? this.sources[1].sample(s, 'b') : NO_INPUT;
    this.log.push(packInput(a), packInput(b));
    const r = stepCombat(s, [a, b]);
    this.prev = s;
    this.curr = r.state;
    return r.events;
  }

  result(): CombatResult | null {
    return combatResult(this.curr);
  }

  /** Interleaved packed inputs [a0, b0, a1, b1, ...]. */
  inputs(): Uint8Array {
    return Uint8Array.from(this.log);
  }

  dispose(): void {
    for (const s of this.sources) s?.dispose?.();
  }
}

/** Replays recorded inputs; `fromTick` can fast-forward headlessly for partial playback. */
export class ReplayProvider implements FightStateProvider {
  prev: CombatState;
  curr: CombatState;
  private tick = 0;

  constructor(
    setup: CombatSetup,
    seed: number,
    private readonly inputs: Uint8Array,
    fromTick = 0,
    rules?: CombatRules,
  ) {
    this.curr = createCombat(setup, seed, rules);
    while (this.tick < fromTick && !this.curr.outcome) this.advance();
    this.prev = this.curr;
  }

  private advance(): readonly CombatEvent[] {
    const i = this.tick * 2;
    const a: FighterInput = i < this.inputs.length ? unpackInput(this.inputs[i]!) : NO_INPUT;
    const b: FighterInput =
      i + 1 < this.inputs.length ? unpackInput(this.inputs[i + 1]!) : NO_INPUT;
    const r = stepCombat(this.curr, [a, b]);
    this.prev = this.curr;
    this.curr = r.state;
    this.tick += 1;
    return r.events;
  }

  step(): readonly CombatEvent[] {
    return this.curr.outcome ? [] : this.advance();
  }

  result(): CombatResult | null {
    return combatResult(this.curr);
  }
}

/** Upper bound for a headless fight; the sim always ends by its own time limit well before. */
const MAX_HEADLESS_TICKS = 20_000;

/** Runs a whole fight at once (bot-only fights) and keeps its inputs for playback. */
export function simulateFight(
  setup: CombatSetup,
  seed: number,
  sources: FightSources,
  rules?: CombatRules,
): FightReplay {
  const p = new LocalSimProvider(setup, seed, sources, rules);
  for (let i = 0; i < MAX_HEADLESS_TICKS && !p.curr.outcome; i++) p.step();
  const result = p.result();
  if (!result) throw new Error('headless fight did not finish');
  return { result, ticks: p.curr.tick, inputs: p.inputs() };
}
