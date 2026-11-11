import type {
  CombatantRef,
  GameEvent,
  GameOutcome,
  JobId,
  PublicGameState,
  SeatId,
} from '@hero-dice/engine';
import { DRAGON_NAME, OUTCOME_LABEL } from './labels';

export interface EliminationRecord {
  readonly round: number;
  readonly by: CombatantRef;
}

export type Eliminations = ReadonlyMap<SeatId, EliminationRecord>;

/** Adds PlayerEliminated events to the record; returns the same map when nothing changed. */
export function collectEliminations(
  prev: Eliminations,
  events: readonly GameEvent[],
): Eliminations {
  let next: Map<SeatId, EliminationRecord> | null = null;
  for (const e of events) {
    if (e.type !== 'PlayerEliminated') continue;
    next ??= new Map(prev);
    next.set(e.seat, { round: e.round, by: e.by });
  }
  return next ?? prev;
}

export interface ResultRow {
  readonly seat: SeatId;
  readonly name: string;
  readonly job: JobId;
  readonly winner: boolean;
  readonly alive: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly coins: number;
  readonly status: string;
}

type NameOf = (seat: SeatId) => string;

function statusText(
  alive: boolean,
  winner: boolean,
  record: EliminationRecord | undefined,
  nameOf: NameOf,
): string {
  if (winner) return '승리';
  if (alive) return '생존';
  if (!record) return '탈락';
  const by = record.by === 'dragon' ? `${DRAGON_NAME}에게 패배` : `${nameOf(record.by)}에게 패배`;
  return `${record.round}라운드 탈락 · ${by}`;
}

/** Final standings: winner, then survivors, then the eliminated (latest first). */
export function resultRows(
  state: PublicGameState,
  nameOf: NameOf,
  eliminations: Eliminations,
): ResultRow[] {
  const winnerSeat = state.outcome?.winner ?? null;
  const rank = (seat: SeatId, alive: boolean): number => {
    if (seat === winnerSeat) return Number.MAX_SAFE_INTEGER;
    if (alive) return Number.MAX_SAFE_INTEGER - 1;
    return eliminations.get(seat)?.round ?? 0;
  };
  return [...state.players]
    .sort((x, y) => rank(y.seat, y.alive) - rank(x.seat, x.alive) || x.seat - y.seat)
    .map((p) => {
      const winner = p.seat === winnerSeat;
      return {
        seat: p.seat,
        name: nameOf(p.seat),
        job: p.job,
        winner,
        alive: p.alive,
        hp: p.hp,
        maxHp: p.maxHp,
        atk: p.atk,
        def: p.def,
        coins: p.coins,
        status: statusText(p.alive, winner, eliminations.get(p.seat), nameOf),
      };
    });
}

export function outcomeHeadline(
  outcome: GameOutcome,
  nameOf: NameOf,
): { title: string; kind: string } {
  const kind = OUTCOME_LABEL[outcome.kind];
  if (outcome.winner === null) return { title: '무승부', kind };
  return { title: `${nameOf(outcome.winner)} 승리!`, kind };
}
