import { createRng, DEFAULT_RULES, nextFloat, type JobId } from '@dragon-rush/engine';
import {
  createCombat,
  stepCombat,
  type CombatEvent,
  type CombatSetup,
  type CombatState,
  type FighterInput,
  type FighterSetup,
  type MoveDir,
} from '../src/index';
import { baseFighter } from './calibration';

export { baseFighter };

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

export const duel = (a: JobId | FighterSetup, b: JobId | FighterSetup): CombatSetup => ({
  kind: 'duel',
  a: typeof a === 'string' ? baseFighter(a) : a,
  b: typeof b === 'string' ? baseFighter(b) : b,
});

export const dragonFight = (a: JobId | FighterSetup): CombatSetup => ({
  kind: 'dragonFight',
  a: typeof a === 'string' ? baseFighter(a) : a,
  b: null,
  dragon: {
    hp: DEFAULT_RULES.dragon.hp,
    atk: DEFAULT_RULES.dragon.atk,
    def: DEFAULT_RULES.dragon.def,
  },
});

export const idle: FighterInput = { move: 0, attack: false, skill: false, dash: false };
export const input = (move: number, buttons = ''): FighterInput => ({
  move: move as MoveDir,
  attack: buttons.includes('a'),
  skill: buttons.includes('s'),
  dash: buttons.includes('d'),
});

/** Seeded random inputs (levels change every few ticks, like a mashing player). */
export function randomInputs(seed: number, ticks: number): FighterInput[] {
  let rng = createRng(seed);
  const r = (): number => {
    const [f, next] = nextFloat(rng);
    rng = next;
    return f;
  };
  const out: FighterInput[] = [];
  let cur = idle;
  for (let t = 0; t < ticks; t++) {
    if (t % 4 === 0) {
      cur = {
        move: Math.floor(r() * 9) as MoveDir,
        attack: r() < 0.35,
        skill: r() < 0.08,
        dash: r() < 0.08,
      };
    }
    out.push(cur);
  }
  return out;
}

export interface Played {
  readonly states: CombatState[];
  readonly events: CombatEvent[];
  readonly final: CombatState;
}

/** Steps a scripted fight (inputs per tick, idle after the script ends) until it is over or `maxTicks`. */
export function play(
  start: CombatState,
  a: readonly FighterInput[],
  b: readonly FighterInput[] = [],
  maxTicks = 10_000,
): Played {
  const states: CombatState[] = [start];
  const events: CombatEvent[] = [];
  let s = start;
  for (let t = 0; t < maxTicks && !s.outcome; t++) {
    const out = stepCombat(s, [a[t] ?? idle, b[t] ?? idle]);
    s = out.state;
    states.push(s);
    events.push(...out.events);
  }
  return { states, events, final: s };
}

export function newDuel(a: JobId | FighterSetup, b: JobId | FighterSetup, seed = 1): CombatState {
  return createCombat(duel(a, b), seed);
}

export const eventsOf = <T extends CombatEvent['type']>(events: readonly CombatEvent[], type: T) =>
  events.filter((e): e is Extract<CombatEvent, { type: T }> => e.type === type);
