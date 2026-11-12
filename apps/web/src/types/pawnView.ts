import type { GameEvent, Phase, PublicGameState, SeatId } from '@dragon-rush/engine';
import type { CombatView } from './combatView';
import { seatColor, seatCrest, type CrestShape } from './labels';

/** The die settles 600 ms into its 700 ms roll; the number pops then. */
const DICE_LAND_MS = 600;

/** Mirrors `components/board/Pawn` props; built here so the rules for each flag stay testable. */
export interface PawnViewModel {
  readonly seat: SeatId;
  readonly tile: number;
  readonly color: string;
  readonly crest: CrestShape;
  readonly job: PublicGameState['players'][number]['job'];
  readonly name: string;
  readonly active: boolean;
  readonly out: boolean;
  readonly motion:
    | { readonly kind: 'hop'; readonly ms: number; readonly final: boolean }
    | { readonly kind: 'blink'; readonly ms: number }
    | null;
  readonly count: number | null;
  /** Delay before the number pops (the rolled value waits for the die to land). */
  readonly countDelayMs: number;
}

export interface StepState {
  readonly seat: SeatId;
  readonly tile: number;
  readonly hop: number;
  readonly steps: number;
  readonly ms: number;
}

export interface PawnInputs {
  readonly display: PublicGameState;
  readonly current: GameEvent | null;
  readonly stepped: StepState | null;
  /** The pending decision (for the number held over a ninja deciding ±1). */
  readonly pending: { readonly actor: SeatId; readonly phase: Phase } | null;
  /** A fight is on screen: eliminated pawns keep standing until it closes. */
  readonly combat: CombatView | null;
  readonly speed: number;
  readonly nameOf: (seat: SeatId) => string;
}

/** Number floating over a pawn: the roll, then a countdown per hop that bursts at 0. */
export function pawnCount(
  seat: SeatId,
  i: Omit<PawnInputs, 'combat' | 'speed' | 'nameOf'>,
): number | null {
  if (i.stepped?.seat === seat) return i.stepped.steps - i.stepped.hop;
  const e = i.current;
  if (e?.type === 'DiceRolled' && e.seat === seat) return e.value;
  if (e?.type === 'MoveAdjusted' && e.seat === seat) return e.steps;
  if (!e && i.pending?.phase === 'MOVE_ADJUST' && i.pending.actor === seat)
    return i.display.turn.dice;
  return null;
}

export function buildPawns(i: PawnInputs): PawnViewModel[] {
  const { display, current, stepped } = i;
  return display.players
    .filter((p) => p.alive || i.combat === null || !combatIncludes(i.combat, p.seat))
    .map((p): PawnViewModel => {
      const hopping = stepped?.seat === p.seat;
      const teleporting =
        current?.type === 'Moved' && current.via === 'teleport' && current.seat === p.seat;
      return {
        seat: p.seat,
        tile: hopping ? stepped.tile : p.position,
        color: seatColor(p.seat),
        crest: seatCrest(p.seat),
        job: p.job,
        name: i.nameOf(p.seat),
        active: p.alive && p.seat === display.current && !display.outcome,
        out: !p.alive,
        motion: hopping
          ? { kind: 'hop', ms: stepped.ms, final: stepped.hop === stepped.steps }
          : teleporting
            ? { kind: 'blink', ms: 300 / i.speed }
            : null,
        count: p.alive ? pawnCount(p.seat, i) : null,
        countDelayMs: current?.type === 'DiceRolled' ? DICE_LAND_MS / i.speed : 0,
      };
    })
    .concat(standingLosers(i));
}

const combatIncludes = (c: CombatView, seat: SeatId) => c.a.ref === seat || c.b.ref === seat;

/** A player knocked out in the fight on screen stays standing until the fight closes, then topples. */
function standingLosers(i: PawnInputs): PawnViewModel[] {
  if (!i.combat) return [];
  return i.display.players
    .filter((p) => !p.alive && combatIncludes(i.combat!, p.seat))
    .map((p) => ({
      seat: p.seat,
      tile: p.position,
      color: seatColor(p.seat),
      crest: seatCrest(p.seat),
      job: p.job,
      name: i.nameOf(p.seat),
      active: false,
      out: false,
      motion: null,
      count: null,
      countDelayMs: 0,
    }));
}
