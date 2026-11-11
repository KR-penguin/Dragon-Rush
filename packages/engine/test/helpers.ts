import {
  applyAction,
  createGame,
  DEFAULT_RULES,
  getLegalActions,
  type Action,
  type GameEvent,
  type GameState,
  type JobId,
  type PlayerState,
  type RulesConfig,
  withRules,
} from '../src/index';
import { cloneState } from '../src/state';

/** Board flow tests assert dice-resolved fights inside applyAction (pre-external behaviour). */
export const DICE_RULES: RulesConfig = withRules({ combat: { ...DEFAULT_RULES.combat, mode: 'dice' } });
export const EXTERNAL_RULES: RulesConfig = withRules({ combat: { ...DEFAULT_RULES.combat, mode: 'external' } });

export function newGame(jobs: JobId[], seed = 1, rules: RulesConfig = DICE_RULES): GameState {
  return createGame({ seats: jobs.map((job) => ({ job })) }, rules, seed);
}

/** Returns a copy of the state with test-only edits applied (scenario setup). */
export function patch(state: GameState, edit: (s: GameState) => void): GameState {
  const next = cloneState(state);
  edit(next);
  return next;
}

export function setPlayer(state: GameState, seat: number, fields: Partial<PlayerState>): GameState {
  return patch(state, (s) => {
    Object.assign(s.players[seat]!, fields);
  });
}

export function act(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  return applyAction(state, action);
}

export function seatOfJob(state: GameState, job: JobId): number {
  const p = state.players.find((x) => x.job === job);
  if (!p) throw new Error(`job ${job} not in game`);
  return p.seat;
}

export const eventsOf = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

export const legalKeys = (state: GameState): string[] =>
  getLegalActions(state).map((a) => JSON.stringify(a));

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

/** Scripted dice source for pure combat tests. */
export function scripted(values: number[]): (sides: number) => number {
  let i = 0;
  return (sides) => {
    const v = values[i++];
    if (v === undefined) throw new Error('scripted dice exhausted');
    if (v < 1 || v > sides) throw new Error(`scripted value ${v} out of range for d${sides}`);
    return v;
  };
}
