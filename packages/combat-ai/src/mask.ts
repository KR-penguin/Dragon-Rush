import type {
  CombatRules,
  CombatState,
  DashId,
  FighterState,
  MoveId,
  MoveSpec,
  Side,
} from '@dragon-rush/combat';
import {
  BUTTON_ATTACK,
  BUTTON_DASH,
  BUTTON_SKILL,
  CACT_BUTTON_DIM,
  CACT_FLAT_DIM,
  CACT_MOVE_DIM,
} from './codec/actions';

export interface CombatActionMask {
  /** 9 entries, 1 = allowed. */
  readonly move: Uint8Array;
  /** 4 entries [none, attack, skill, dash], 1 = allowed. */
  readonly button: Uint8Array;
}

const NEVER = Number.POSITIVE_INFINITY;

export function fighterOf(state: CombatState, side: Side): FighterState | null {
  return side === 'a' ? state.a : state.b;
}

/** Total ticks of a move started at moveTick 0 (draws last until released). */
export function moveTotal(spec: MoveSpec): number {
  switch (spec.type) {
    case 'melee':
    case 'parry':
      return spec.startup + spec.active + spec.recovery;
    case 'shot':
    case 'rune':
      return spec.startup + 1 + spec.recovery;
    case 'draw':
      return NEVER;
  }
}

/** Live tick (1 = the next one) on which an archer releasing now would be free again. */
function drawFreeAt(
  r: CombatRules,
  f: FighterState,
  spec: Extract<MoveSpec, { type: 'draw' }>,
): number {
  const release = Math.max(1, spec.quickAt - f.moveTick);
  const shot = f.moveTick + release >= spec.fullAt ? spec.full : spec.quick;
  return release + moveTotal(r.moves[shot]);
}

/**
 * Earliest live tick (1 = the next one) on which the fighter's state machine is free to act on a buffered
 * press, assuming nothing hits it in between. Mirrors updateFighter: hitstun counts down to 0, moves and
 * dashes end when moveTick reaches their length.
 */
export function freeAt(r: CombatRules, f: FighterState): number {
  switch (f.mode) {
    case 'idle':
    case 'move':
      return 1;
    case 'hitstun':
      return f.hitstun + 1;
    case 'attack':
    case 'skill': {
      const spec = r.moves[f.move as MoveId];
      if (spec.type === 'draw') return drawFreeAt(r, f, spec);
      return Math.max(1, moveTotal(spec) - f.moveTick);
    }
    case 'dash':
      return Math.max(1, r.dashes[f.move as DashId].ticks - f.moveTick);
    case 'ko':
      return NEVER;
  }
}

function attackAt(r: CombatRules, f: FighterState): number {
  const free = freeAt(r, f);
  if (f.mode === 'attack' || f.mode === 'skill') {
    const spec = r.moves[f.move as MoveId];
    // still holding attack keeps the bow drawn: a meaningful choice
    if (spec.type === 'draw' && !f.drawReleased) return 1;
    if (spec.type === 'melee' && spec.next !== null)
      return Math.min(free, Math.max(1, spec.chainFrom - f.moveTick));
  } else if (f.mode === 'dash') {
    const d = r.dashes[f.move as DashId];
    if (d.cancelFrom > 0) {
      const k = Math.max(1, d.cancelFrom - 1 - f.moveTick);
      if (f.moveTick + k < d.ticks) return Math.min(free, k);
    }
  }
  return free;
}

function chargeAt(charges: number, timer: number): number {
  return charges > 0 ? 1 : Math.max(1, timer);
}

/**
 * Live ticks until a press of `button` registered on the next tick would be consumed (Infinity = never),
 * ignoring hits that may still land. The press edge happens on the window's first tick and stays buffered
 * for `rules.inputBuffer` live ticks.
 */
export function buttonReadyIn(state: CombatState, side: Side, button: number): number {
  const f = fighterOf(state, side);
  if (!f || f.mode === 'ko' || state.outcome) return NEVER;
  const r = state.rules;
  switch (button) {
    case BUTTON_ATTACK:
      return attackAt(r, f);
    case BUTTON_SKILL:
      return Math.max(freeAt(r, f), chargeAt(f.skillCharges, f.skillTimer));
    case BUTTON_DASH:
      return Math.max(freeAt(r, f), chargeAt(f.dashCharges, f.dashTimer));
    default:
      return 1;
  }
}

/** Inactive slot (the second seat of a dragon fight) or a finished fight: only [none, none]. */
export function inactiveMask(): CombatActionMask {
  const move = new Uint8Array(CACT_MOVE_DIM);
  const button = new Uint8Array(CACT_BUTTON_DIM);
  move[0] = 1;
  button[0] = 1;
  return { move, button };
}

/**
 * cact_v1 mask (docs/combat-ai-spec.md §6) from the current (not delayed) state. Moves are always allowed;
 * a button is masked when its press could not be consumed within the input buffer (cooldown, charges, a
 * move or hitstun that outlasts it). None is always allowed.
 */
export function combatActionMask(state: CombatState, side: Side): CombatActionMask {
  const f = fighterOf(state, side);
  if (!f || f.mode === 'ko' || state.outcome) return inactiveMask();
  const move = new Uint8Array(CACT_MOVE_DIM).fill(1);
  const button = new Uint8Array(CACT_BUTTON_DIM);
  button[0] = 1;
  // a press made on a frozen (hitstop) tick loses one live tick of buffer; envs only decide on live ticks
  const horizon = state.rules.inputBuffer - (state.hitstop > 0 ? 1 : 0);
  for (const b of [BUTTON_ATTACK, BUTTON_SKILL, BUTTON_DASH])
    button[b] = buttonReadyIn(state, side, b) <= horizon ? 1 : 0;
  return { move, button };
}

/** Flat mask: mask[m * 4 + b] = move[m] && button[b]. */
export function flatMask(mask: CombatActionMask): Uint8Array {
  const out = new Uint8Array(CACT_FLAT_DIM);
  for (let m = 0; m < CACT_MOVE_DIM; m++) {
    for (let b = 0; b < CACT_BUTTON_DIM; b++)
      out[m * CACT_BUTTON_DIM + b] = mask.move[m]! & mask.button[b]!;
  }
  return out;
}

export function isMasked(mask: CombatActionMask, move: number, button: number): boolean {
  return mask.move[move] === 1 && mask.button[button] === 1;
}

/**
 * False when nothing chosen for the coming window can affect the fight: KO, or hitstun that outlasts both the
 * window and the press buffer. The env then applies no input and the trainer may skip the step.
 */
export function isActionable(state: CombatState, side: Side, actionRepeat: number): boolean {
  const f = fighterOf(state, side);
  if (!f || f.mode === 'ko' || state.outcome) return false;
  if (f.mode !== 'hitstun') return true;
  return f.hitstun + 1 <= Math.max(state.rules.inputBuffer, actionRepeat);
}
