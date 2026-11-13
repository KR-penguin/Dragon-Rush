import type { Action, Phase, PublicGameState, SeatId } from '@dragon-rush/engine';
import { assertNever } from './assertNever';

/** The parts of a GameUpdate that decide whether this screen may act. */
export interface DecisionSource {
  readonly pending: { readonly actor: SeatId; readonly phase: Phase } | null;
  readonly controllableSeats: readonly SeatId[];
  readonly legalActions: readonly Action[];
  readonly publicState: PublicGameState;
}

export function canAct(update: DecisionSource | null, animating: boolean): boolean {
  if (!update || animating || update.publicState.outcome) return false;
  const pending = update.pending;
  return (
    !!pending && update.controllableSeats.includes(pending.actor) && update.legalActions.length > 0
  );
}

/** A landing decision may be shown once the pawn reaches the authoritative tile. */
export function landingDecisionReached(
  update: DecisionSource | null,
  display: PublicGameState | null,
): boolean {
  const pending = update?.pending;
  if (!pending || !display) return false;
  const landingPhase =
    (pending.phase === 'POST_MOVE' && update.publicState.turn.canBuy) ||
    pending.phase === 'CHOOSE_PVP_TARGET' ||
    pending.phase === 'SHIELD_DECISION';
  if (!landingPhase || display.current !== update.publicState.current) return false;
  const landingSeat =
    pending.phase === 'SHIELD_DECISION'
      ? (update.publicState.pvp?.arriver ?? pending.actor)
      : pending.actor;
  return (
    display.players[landingSeat]?.position === update.publicState.players[landingSeat]?.position
  );
}

/** Hot-seat hand-off: several local humans share the screen and a different one must decide now. */
export function needsHandoff(
  controllable: readonly SeatId[],
  actor: SeatId | null,
  lastAcknowledged: SeatId | null,
): boolean {
  return (
    controllable.length > 1 &&
    actor !== null &&
    controllable.includes(actor) &&
    actor !== lastAcknowledged
  );
}

/** Identifies one shop visit: a new turn or a teleport makes a new visit. */
export const shopVisitKey = (state: PublicGameState): string =>
  `${state.round}:${state.current}:${state.turn.teleportsUsed}:${state.players[state.current]?.position ?? -1}`;

export type UserRequest = 'dragon' | 'shop' | 'teleport';

export type DialogKind =
  'handoff' | 'moveAdjust' | 'pvpTarget' | 'shield' | 'training' | 'shop' | 'dragon';

export interface DialogInputs {
  readonly canAct: boolean;
  readonly phase: Phase | null;
  readonly handoffNeeded: boolean;
  readonly shopAvailable: boolean;
  readonly shopDismissed: boolean;
  readonly request: UserRequest | null;
}

/** Which dialog (at most one) the decision UI shows right now. */
export function activeDialog(i: DialogInputs): DialogKind | null {
  if (!i.canAct || i.phase === null) return null;
  if (i.handoffNeeded) return 'handoff';
  switch (i.phase) {
    case 'MOVE_ADJUST':
      return 'moveAdjust';
    case 'CHOOSE_PVP_TARGET':
      return 'pvpTarget';
    case 'SHIELD_DECISION':
      return 'shield';
    case 'TRAINING_CHOICE':
      return 'training';
    case 'PRE_ROLL':
    case 'POST_MOVE':
      if (i.request === 'teleport') return null;
      if (i.request === 'shop') return i.shopAvailable ? 'shop' : null;
      if (i.request) return i.request;
      return i.phase === 'POST_MOVE' && i.shopAvailable && !i.shopDismissed ? 'shop' : null;
    case 'COMBAT':
      // The fight session owns combat input and settlement.
      return null;
    default:
      return assertNever(i.phase);
  }
}
