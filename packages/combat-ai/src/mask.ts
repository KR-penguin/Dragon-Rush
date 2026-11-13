import {
  Q,
  moveTotal,
  type CombatRules,
  type CombatState,
  type DashId,
  type FighterState,
  type MoveId,
  type MoveSpec,
  type Side,
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

const divRound = (a: number, b: number): number => Math.floor((2 * a + b) / (2 * b));
const mulDivTrunc = (v: number, num: number, den: number): number => {
  const p = v * num;
  return p >= 0 ? Math.floor(p / den) : -Math.floor(-p / den);
};
const approach = (v: number, target: number, step: number): number =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

/**
 * Hitstun the fighter will still sit through, including a wall slam its own knockback is about to cause
 * (sim physics: brake, knockback step, arena clamp; a fast enough knockback into a wall adds wallSlamStun).
 * Pushes from the other body, the dragon or the ring are not replayed.
 */
export function hitstunLeft(s: CombatState, f: FighterState): number {
  const r = s.rules;
  const h = f.hitstun;
  if (f.mode !== 'hitstun' || f.kbLeft <= 0 || f.kbTotal <= 0 || f.wallSlammed) return h;
  const rad = r.body.bodyRadius * Q;
  const maxX = s.arenaW * Q - rad;
  const maxY = s.arenaH * Q - rad;
  const dec = Math.max(1, divRound(divRound(r.jobs[f.job].speed * Q, r.tickHz), r.stopTicks));
  const kbSpeed = Math.max(Math.abs(f.kbx), Math.abs(f.kby));
  let { x, y, vx, vy, kbLeft } = f;
  // tick k: updateFighter counts hitstun down (free once it reads 0), then physics may slam
  for (let k = 1; k <= h && kbLeft > 0; k++) {
    vx = approach(vx, 0, dec);
    vy = approach(vy, 0, dec);
    x += vx + mulDivTrunc(f.kbx, kbLeft, f.kbTotal);
    y += vy + mulDivTrunc(f.kby, kbLeft, f.kbTotal);
    kbLeft -= 1;
    const out = x < rad || x > maxX || y < rad || y > maxY;
    if (!out) continue;
    if (kbLeft > 0 && mulDivTrunc(kbSpeed, kbLeft, f.kbTotal) >= Q) return h + r.wallSlamStun;
    x = Math.min(Math.max(x, rad), maxX);
    y = Math.min(Math.max(y, rad), maxY);
  }
  return h;
}

/**
 * Earliest live tick (1 = the next one) on which the fighter's state machine is free to act on a buffered
 * press, assuming nothing hits it in between. Mirrors updateFighter: hitstun counts down to 0 (plus a
 * predicted wall slam), moves and dashes end when moveTick reaches their length.
 */
export function freeAt(s: CombatState, f: FighterState): number {
  const r = s.rules;
  switch (f.mode) {
    case 'idle':
    case 'move':
      return 1;
    case 'hitstun':
      return hitstunLeft(s, f) + 1;
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

/** A press during a string hit (melee attack with a follow-up) is queued without expiry until the chain. */
function chainQueue(s: CombatState, f: FighterState): number | null {
  const r = s.rules;
  if (f.mode !== 'attack' || f.move === null) return null;
  const spec = r.moves[f.move as MoveId];
  if (spec.type !== 'melee' || spec.next === null) return null;
  return Math.min(freeAt(s, f), Math.max(1, spec.chainFrom - f.moveTick));
}

function attackAt(s: CombatState, f: FighterState): number {
  const r = s.rules;
  const free = freeAt(s, f);
  if (f.mode === 'attack' || f.mode === 'skill') {
    const spec = r.moves[f.move as MoveId];
    // still holding attack keeps the bow drawn: a meaningful choice
    if (spec.type === 'draw' && !f.drawReleased) return 1;
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

function dashAt(s: CombatState, f: FighterState): number {
  const r = s.rules;
  const charge = chargeAt(f.dashCharges, f.dashTimer);
  if (f.mode === 'attack' && f.move !== null) {
    const spec = r.moves[f.move as MoveId];
    if (spec.type === 'draw') {
      // a draw drops into a dash as soon as a charge is ready, until the (released) arrow flies
      const release = Math.max(1, spec.quickAt - f.moveTick);
      return charge <= release ? charge : Math.max(charge, drawFreeAt(r, f, spec));
    }
  }
  return Math.max(freeAt(s, f), charge);
}

/**
 * Live ticks until a press of `button` registered on the next tick starts its action, or Infinity when the
 * press would expire first, ignoring hits that may still land. The press edge happens on the window's first
 * tick and stays buffered for `rules.inputBuffer` live ticks (one fewer when pressed on a hitstop tick);
 * an attack pressed during a string hit stays queued until the chain window.
 */
export function buttonReadyIn(state: CombatState, side: Side, button: number): number {
  const f = fighterOf(state, side);
  if (!f || f.mode === 'ko' || state.outcome) return NEVER;
  const r = state.rules;
  const horizon = r.inputBuffer - (state.hitstop > 0 ? 1 : 0);
  const buffered = (t: number): number => (t <= horizon ? t : NEVER);
  switch (button) {
    case BUTTON_ATTACK:
      return chainQueue(state, f) ?? buffered(attackAt(state, f));
    case BUTTON_SKILL:
      return buffered(Math.max(freeAt(state, f), chargeAt(f.skillCharges, f.skillTimer)));
    case BUTTON_DASH:
      return buffered(dashAt(state, f));
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
 * a button is masked when its press would expire before it can start its action (cooldown, charges, a move
 * or hitstun that outlasts the input buffer). None is always allowed.
 */
export function combatActionMask(state: CombatState, side: Side): CombatActionMask {
  const f = fighterOf(state, side);
  if (!f || f.mode === 'ko' || state.outcome) return inactiveMask();
  const move = new Uint8Array(CACT_MOVE_DIM).fill(1);
  const button = new Uint8Array(CACT_BUTTON_DIM);
  button[0] = 1;
  for (const b of [BUTTON_ATTACK, BUTTON_SKILL, BUTTON_DASH])
    button[b] = Number.isFinite(buttonReadyIn(state, side, b)) ? 1 : 0;
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
  return hitstunLeft(state, f) + 1 <= Math.max(state.rules.inputBuffer, actionRepeat);
}
