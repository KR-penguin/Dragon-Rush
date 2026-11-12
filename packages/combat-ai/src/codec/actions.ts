import { NO_INPUT, type FighterInput, type MoveDir } from '@dragon-rush/combat';

export const CACT_VERSION = 'cact_v1';
/** MultiDiscrete [move, button]. */
export const CACT_NVEC: readonly [9, 4] = Object.freeze([9, 4]) as readonly [9, 4];
export const CACT_MOVE_DIM = 9;
export const CACT_BUTTON_DIM = 4;
/** Flat Discrete: index = move * 4 + button. */
export const CACT_FLAT_DIM = 36;

/** Screen space (y grows downward), clockwise from north; identical to the sim's MoveDir. */
export const CACT_MOVE_NAMES = ['none', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export const CACT_BUTTON_NAMES = ['none', 'attack', 'skill', 'dash'] as const;
export const CACT_V1_NAMES = Object.freeze({ move: CACT_MOVE_NAMES, button: CACT_BUTTON_NAMES });
/** Flat names, e.g. "NE+attack" at index 2 * 4 + 1. */
export const CACT_NAMES: readonly string[] = Object.freeze(
  CACT_MOVE_NAMES.flatMap((m) => CACT_BUTTON_NAMES.map((b) => `${m}+${b}`)),
);

export const BUTTON_NONE = 0;
export const BUTTON_ATTACK = 1;
export const BUTTON_SKILL = 2;
export const BUTTON_DASH = 3;

export interface CombatAction {
  /** 0 = none, 1..8 = N, NE, E, SE, S, SW, W, NW. */
  readonly move: number;
  /** 0 = none, 1 = attack, 2 = skill, 3 = dash. */
  readonly button: number;
}

export const NO_ACTION: CombatAction = Object.freeze({ move: 0, button: 0 });

export class CombatActionError extends RangeError {
  override readonly name = 'CombatActionError';
}

export function isCombatAction(a: CombatAction): boolean {
  return (
    Number.isInteger(a.move) &&
    a.move >= 0 &&
    a.move < CACT_MOVE_DIM &&
    Number.isInteger(a.button) &&
    a.button >= 0 &&
    a.button < CACT_BUTTON_DIM
  );
}

export function toFlat(a: CombatAction): number {
  if (!isCombatAction(a))
    throw new CombatActionError(`invalid combat action [${a.move}, ${a.button}]`);
  return a.move * CACT_BUTTON_DIM + a.button;
}

export function fromFlat(index: number): CombatAction {
  if (!Number.isInteger(index) || index < 0 || index >= CACT_FLAT_DIM)
    throw new CombatActionError(`invalid flat combat action ${index}`);
  return { move: Math.floor(index / CACT_BUTTON_DIM), button: index % CACT_BUTTON_DIM };
}

/** Per-episode mirror augmentation: x flips east/west, y flips north/south. */
export interface Mirror {
  readonly x: boolean;
  readonly y: boolean;
}

export const NO_MIRROR: Mirror = Object.freeze({ x: false, y: false });

const MIRROR_X: readonly number[] = [0, 1, 8, 7, 6, 5, 4, 3, 2];
const MIRROR_Y: readonly number[] = [0, 5, 4, 3, 2, 1, 8, 7, 6];

/** Reflects a move direction. An involution, so the same call maps policy -> world and world -> policy. */
export function mirrorMove(move: number, mirror: Mirror): number {
  let m = move;
  if (mirror.x) m = MIRROR_X[m] ?? m;
  if (mirror.y) m = MIRROR_Y[m] ?? m;
  return m;
}

export function mirrorAction(a: CombatAction, mirror: Mirror): CombatAction {
  return mirror.x || mirror.y ? { move: mirrorMove(a.move, mirror), button: a.button } : a;
}

/** Sim input for one decision window plus the button that gets a rising edge on its first tick. */
export interface WindowInput {
  readonly input: FighterInput;
  /** 1..3 when the chosen button is pressed this window; 0 when it is none or still held from the last one. */
  readonly press: number;
}

function heldButton(input: FighterInput): number {
  if (input.attack) return BUTTON_ATTACK;
  if (input.skill) return BUTTON_SKILL;
  if (input.dash) return BUTTON_DASH;
  return BUTTON_NONE;
}

/**
 * Maps a (world-frame) action to the input held for the whole action-repeat window: the move as a level and
 * the button as a level (docs/combat-ai-spec.md §3). Choosing the same button as the previous window keeps it
 * held (no new press, e.g. an archer draw); a new press needs a `none` window in between.
 */
export function toFighterInput(
  action: CombatAction,
  prevInput: FighterInput = NO_INPUT,
): WindowInput {
  if (!isCombatAction(action))
    throw new CombatActionError(`invalid combat action [${action.move}, ${action.button}]`);
  const b = action.button;
  const input: FighterInput = {
    move: action.move as MoveDir,
    attack: b === BUTTON_ATTACK,
    skill: b === BUTTON_SKILL,
    dash: b === BUTTON_DASH,
  };
  const wasHeld =
    (b === BUTTON_ATTACK && prevInput.attack) ||
    (b === BUTTON_SKILL && prevInput.skill) ||
    (b === BUTTON_DASH && prevInput.dash);
  return { input, press: b !== BUTTON_NONE && !wasHeld ? b : BUTTON_NONE };
}

/** Inverse view of a held input as a cact_v1 action (first held button wins). */
export function fromFighterInput(input: FighterInput): CombatAction {
  return { move: input.move, button: heldButton(input) };
}
