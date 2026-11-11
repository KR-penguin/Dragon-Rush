import {
  applyAction,
  createGame,
  DEFAULT_RULES,
  getLegalActions,
  JOB_IDS,
  toPublicState,
  withRules,
  type CombatMode,
  type GameState,
  type JobId,
} from '@dragon-rush/engine';

/** Dice mode keeps fights inside applyAction, so walks only visit board decisions (same states as before COMBAT existed). */
export function newGame(
  n: number,
  seed: number,
  maxRounds: number | null = 30,
  mode: CombatMode = 'dice',
): GameState {
  const jobs = [...JOB_IDS].slice(0, n) as JobId[];
  const rules = withRules({ maxRounds, combat: { ...DEFAULT_RULES.combat, mode } }, DEFAULT_RULES);
  return createGame({ seats: jobs.map((job) => ({ job })) }, rules, seed);
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
