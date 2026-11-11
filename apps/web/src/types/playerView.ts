import { PASSIVES, type PlayerState, type PublicGameState, type SeatId } from '@dragon-rush/engine';
import { botLabel, seatColor } from './labels';

export type BadgeKind =
  | 'eliminated'
  | 'resting'
  | 'indomitable'
  | 'ninjaCooldown'
  | 'rage'
  | 'disconnected'
  | 'botControlled';

export interface PlayerBadge {
  readonly kind: BadgeKind;
  readonly label: string;
}

export const playerOf = (state: Pick<PublicGameState, 'players'>, seat: SeatId): PlayerState => {
  const p = state.players.find((x) => x.seat === seat);
  if (!p) throw new RangeError(`no player at seat ${seat}`);
  return p;
};

/** Status badges read from public state; passive conditions come from the engine's passive hooks. */
export function playerBadges(state: PublicGameState, p: PlayerState): PlayerBadge[] {
  if (!p.alive) return [{ kind: 'eliminated', label: '탈락' }];
  const hooks = PASSIVES[p.job];
  const out: PlayerBadge[] = [];
  if (p.skipNextTurn || (state.current === p.seat && state.turn.resting)) {
    out.push({ kind: 'resting', label: '쉬는 중' });
  }
  if (hooks.indomitable && !p.passive.indomitableUsed)
    out.push({ kind: 'indomitable', label: '불굴 사용 가능' });
  if (hooks.moveAdjust && p.passive.ninjaCooldown > 0) {
    out.push({ kind: 'ninjaCooldown', label: `닌자 쿨다운 ${p.passive.ninjaCooldown}` });
  }
  if (hooks.effectiveAtk?.(state.rules, p.atk, p.hp, p.maxHp).rage)
    out.push({ kind: 'rage', label: '광폭화' });
  return out;
}

/** Structural view of a GameUpdate seat entry. */
export interface SeatLike {
  readonly seat: SeatId;
  readonly name: string;
  readonly kind: 'human' | 'bot' | 'model';
  readonly botName?: string;
  readonly connected: boolean;
  readonly controlledBy: 'human' | 'bot';
}

/** Connection badges for seats whose human is away (online play). */
export function seatBadges(info: SeatLike): PlayerBadge[] {
  const out: PlayerBadge[] = [];
  if (!info.connected) out.push({ kind: 'disconnected', label: '연결 끊김' });
  if (info.kind === 'human' && info.controlledBy === 'bot')
    out.push({ kind: 'botControlled', label: '봇 대리' });
  return out;
}

export const seatName = (seats: readonly SeatLike[], seat: SeatId): string =>
  seats.find((s) => s.seat === seat)?.name ?? `P${seat + 1}`;

export function seatKindLabel(info: SeatLike | undefined): string {
  if (!info) return '';
  if (info.kind === 'human') return '사람';
  if (info.kind === 'model') return '모델';
  return `봇 · ${botLabel(info.botName)}`;
}

export interface PlayerCard {
  readonly seat: SeatId;
  readonly name: string;
  readonly color: string;
  readonly kindLabel: string;
  readonly player: PlayerState;
  readonly badges: readonly PlayerBadge[];
  readonly isTurn: boolean;
  readonly isActor: boolean;
}

export function playerCards(
  state: PublicGameState,
  seats: readonly SeatLike[],
  actor: SeatId | null,
): PlayerCard[] {
  return state.players.map((p) => {
    const info = seats.find((s) => s.seat === p.seat);
    return {
      seat: p.seat,
      name: seatName(seats, p.seat),
      color: seatColor(p.seat),
      kindLabel: seatKindLabel(info),
      player: p,
      badges: [...playerBadges(state, p), ...(info && p.alive ? seatBadges(info) : [])],
      isTurn: p.alive && state.current === p.seat && !state.outcome,
      isActor: p.alive && actor === p.seat,
    };
  });
}
