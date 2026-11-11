import {
  applyAction,
  createGame,
  DEFAULT_RULES,
  getLegalActions,
  JOB_IDS,
  toPublicState,
  withRules,
  type GameState,
  type JobId,
} from '@hero-dice/engine';

export function newGame(n: number, seed: number, maxRounds: number | null = 30): GameState {
  const jobs = [...JOB_IDS].slice(0, n) as JobId[];
  return createGame({ seats: jobs.map((job) => ({ job })) }, withRules({ maxRounds }, DEFAULT_RULES), seed);
}

/** Visits states reached by a pseudo-random legal walk. */
export function* walk(n: number, seed: number, steps = 400): Generator<GameState> {
  let s = newGame(n, seed);
  let x = (seed * 2654435761) >>> 0;
  for (let i = 0; i < steps && s.pending; i++) {
    yield s;
    const legal = getLegalActions(s);
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    s = applyAction(s, legal[x % legal.length]!).state;
  }
  yield s;
}

export const view = (s: GameState) => toPublicState(s);
