import {
  cloneCombatState,
  createCombatBot,
  NO_INPUT,
  type CombatPolicy,
  type CombatState,
  type FighterInput,
  type Side,
} from '@dragon-rush/combat';
import {
  CACT_BUTTON_DIM,
  CACT_FLAT_DIM,
  CACT_MOVE_DIM,
  fromFighterInput,
  fromFlat,
  NO_ACTION,
  toFighterInput,
  type CombatAction,
} from '../codec/actions';
import { combatActionMask, flatMask, isActionable, type CombatActionMask } from '../mask';
import { encodeCombatObservation } from '../obs/encode';
import { COBS_DIM } from '../obs/layout';
import { StateHistory } from '../runtime/history';
import {
  COMBAT_DIFFICULTY,
  type CombatDifficulty,
  type CombatModelMeta,
  type CombatPolicyModel,
} from './types';

export interface CombatSelectOptions {
  readonly mode: 'sample' | 'argmax';
  readonly temperature: number;
}

/** Index of a masked choice from raw outputs; null when the outputs are unusable (NaN, nothing allowed). */
function pick(
  raw: ArrayLike<number>,
  from: number,
  len: number,
  mask: Uint8Array,
  probs: boolean,
  o: CombatSelectOptions,
  random: () => number,
): number | null {
  const logits = new Float64Array(len).fill(Number.NEGATIVE_INFINITY);
  let best = -1;
  for (let i = 0; i < len; i++) {
    const v = raw[from + i]!;
    if (Number.isNaN(v)) return null;
    if (!mask[i]) continue;
    const l = probs ? Math.log(Math.max(v, 1e-12)) : v;
    logits[i] = l;
    if (Number.isFinite(l) && (best < 0 || l > logits[best]!)) best = i;
  }
  if (best < 0) return null;
  if (o.mode === 'argmax') return best;
  const t = o.temperature > 0 ? o.temperature : 1;
  const max = logits[best]!;
  let total = 0;
  const w = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    w[i] = Number.isFinite(logits[i]!) ? Math.exp((logits[i]! - max) / t) : 0;
    total += w[i]!;
  }
  let r = random() * total;
  for (let i = 0; i < len; i++) {
    r -= w[i]!;
    if (r < 0 && w[i]! > 0) return i;
  }
  return best;
}

/**
 * Masked action selection from one forward pass: per-branch for a 9 + 4 head, over 36 for a flat head
 * (docs/combat-ai-spec.md §9, §11). Returns null when the output cannot be used.
 */
export function selectCombatAction(
  out: Float32Array,
  mask: CombatActionMask,
  meta: Pick<CombatModelMeta, 'head' | 'output'>,
  opts: CombatSelectOptions,
  random: () => number,
): CombatAction | null {
  const probs = meta.output === 'probs';
  if (meta.head === 'flat') {
    if (out.length !== CACT_FLAT_DIM) return null;
    const i = pick(out, 0, CACT_FLAT_DIM, flatMask(mask), probs, opts, random);
    return i === null ? null : fromFlat(i);
  }
  if (out.length !== CACT_MOVE_DIM + CACT_BUTTON_DIM) return null;
  const move = pick(out, 0, CACT_MOVE_DIM, mask.move, probs, opts, random);
  const button = pick(out, CACT_MOVE_DIM, CACT_BUTTON_DIM, mask.button, probs, opts, random);
  return move === null || button === null ? null : { move, button };
}

export interface CombatModelPolicyOptions {
  readonly difficulty?: CombatDifficulty;
  /** Overrides the difficulty's temperature. */
  readonly temperature?: number;
  /** Default 'sample'. */
  readonly mode?: 'sample' | 'argmax';
  /** Overrides the difficulty's reaction delay (ticks). */
  readonly delay?: number;
  /** Live ticks per decision; must match training (default 4). */
  readonly actionRepeat?: number;
  /** Used for a decision whose model output is unusable (default: scripted balanced bot). */
  readonly fallback?: CombatPolicy;
  readonly onFallback?: (reason: string) => void;
}

/**
 * In-game combat model seat: delayed observation -> forward -> branch masks -> temperature sampling ->
 * [move, button] held for `actionRepeat` live ticks (docs/combat-ai-spec.md §11). Same windowing, hold and
 * "no input while not actionable" rules as the combat env, so training and play match. Stateful: one per fight.
 */
export function createCombatModelPolicy(
  model: CombatPolicyModel,
  opts: CombatModelPolicyOptions = {},
): CombatPolicy {
  if (model.meta.obsDim !== COBS_DIM)
    throw new RangeError(`combat model obsDim ${model.meta.obsDim} != ${COBS_DIM}`);
  const preset = COMBAT_DIFFICULTY[opts.difficulty ?? 'normal'];
  const delay = Math.max(0, Math.floor(opts.delay ?? preset.delay));
  const select: CombatSelectOptions = {
    mode: opts.mode ?? 'sample',
    temperature: opts.temperature ?? preset.temperature,
  };
  const repeat = Math.max(1, Math.floor(opts.actionRepeat ?? 4));
  const fallback = opts.fallback ?? createCombatBot('balanced');
  let history: StateHistory | null = null;
  let lastTick = -1;
  let live = 0;
  let input: FighterInput = NO_INPUT;
  let prev: CombatAction = NO_ACTION;

  const decideWindow = (state: CombatState, side: Side, random: () => number): void => {
    if (!isActionable(state, side, repeat)) {
      input = NO_INPUT;
      prev = NO_ACTION;
      return;
    }
    const obs = encodeCombatObservation(history!.delayed(delay), side, {
      delay,
      prevMove: prev.move,
      prevButton: prev.button,
    });
    const action = selectCombatAction(
      model.forward(obs),
      combatActionMask(state, side),
      model.meta,
      select,
      random,
    );
    if (action === null) {
      opts.onFallback?.('invalid combat model output');
      input = fallback.decide(state, side, random);
      prev = fromFighterInput(input);
      return;
    }
    input = toFighterInput(action, input).input;
    prev = action;
  };

  return {
    id: `combat-model:${model.meta.id}`,
    decide(state, side, random) {
      const snapshot = cloneCombatState(state);
      if (history === null || state.tick <= lastTick) {
        history = new StateHistory(delay + 1, snapshot);
        live = 0;
        input = NO_INPUT;
        prev = NO_ACTION;
      } else history.push(snapshot);
      lastTick = state.tick;
      if (state.hitstop > 0 || state.outcome) return input;
      if (live % repeat === 0) decideWindow(state, side, random);
      live += 1;
      return input;
    },
  };
}
