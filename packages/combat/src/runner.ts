import { createRng, nextFloat } from '@dragon-rush/engine';
import { combatResult } from './result';
import { DEFAULT_COMBAT_RULES, type CombatRules } from './rules';
import { advanceInPlace, createCombat } from './step';
import {
  NO_INPUT,
  type CombatEvent,
  type CombatResult,
  type CombatSetup,
  type CombatState,
  type FighterInput,
  type Side,
} from './types';
import { cloneWorking } from './work';

/** Strategy shared by scripted bots and learned models; `random` is the policy's own seeded stream. */
export interface CombatPolicy {
  readonly id: string;
  decide(state: CombatState, side: Side, random: () => number): FighterInput;
}

export interface RunCombatOptions {
  /** Keep every event (golden logs, replays); off by default for speed. */
  readonly recordEvents?: boolean;
  /** Policies decide every N ticks and their input is held in between (RL-style action repeat). Default 1. */
  readonly decisionInterval?: number;
}

export interface RunCombatOutput {
  readonly result: CombatResult;
  readonly ticks: number;
  readonly events?: CombatEvent[];
}

/** Independent per-seat policy stream so bot randomness never touches the sim RNG. */
export function policyRandom(seed: number, salt: number): () => number {
  let rng = createRng(((seed % 0x100000000) ^ Math.imul(salt, 0x9e3779b9)) >>> 0);
  return () => {
    const [f, next] = nextFloat(rng);
    rng = next;
    return f;
  };
}

/** Headless fight to the end (KO or time limit) for sims, envs and auto-resolve. */
export function runCombat(
  setup: CombatSetup,
  policies: readonly [CombatPolicy, CombatPolicy?],
  seed: number,
  rules: CombatRules = DEFAULT_COMBAT_RULES,
  options: RunCombatOptions = {},
): RunCombatOutput {
  const s = cloneWorking(createCombat(setup, seed, rules));
  const record = options.recordEvents === true;
  const every = Math.max(1, Math.floor(options.decisionInterval ?? 1));
  const randomA = policyRandom(seed, 1);
  const randomB = policyRandom(seed, 2);
  const [pa, pb] = policies;
  const events: CombatEvent[] = [];
  const inputs: [FighterInput, FighterInput?] = [NO_INPUT, NO_INPUT];
  let n = 0;
  while (s.outcome === null) {
    if (n % every === 0) {
      inputs[0] = pa.decide(s, 'a', randomA);
      inputs[1] = s.b && pb ? pb.decide(s, 'b', randomB) : NO_INPUT;
    }
    advanceInPlace(s, inputs, events);
    if (!record) events.length = 0;
    n += 1;
  }
  const result = combatResult(s);
  if (!result) throw new Error('fight ended without a result');
  return record ? { result, ticks: s.tick, events } : { result, ticks: s.tick };
}
