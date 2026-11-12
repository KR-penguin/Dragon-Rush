import type { CombatResult } from '@dragon-rush/combat';
import type { JobId, SeatId } from '@dragon-rush/engine';
import type { FightControl, PendingFight, SeatInfo } from '../services/gameClient';
import { KEY_LAYOUTS, type KeyLayout } from './combatControls';
import { DRAGON_NAME, JOB_LABEL, seatColor } from './labels';

export type Crest = 'shield' | 'diamond' | 'leaf' | 'star';
const CRESTS: readonly Crest[] = ['shield', 'diamond', 'leaf', 'star'];

/** One side of the fight as the VS splash, HUD and result card show it. */
export interface FighterCard {
  readonly side: 'a' | 'b';
  readonly seat: SeatId | null;
  readonly name: string;
  readonly job: JobId | null;
  readonly color: string;
  readonly crest: Crest;
  readonly control: FightControl;
  readonly hp: number;
  readonly maxHp: number;
}

export const DRAGON_COLOR = '#C8402A';

export function fightCards(
  fight: PendingFight,
  seats: readonly SeatInfo[],
): [FighterCard, FighterCard] {
  const card = (i: 0 | 1): FighterCard => {
    const side = fight.sides[i];
    const setup = i === 0 ? fight.setup.a : fight.setup.b;
    if (side.seat === null || !setup) {
      const hp = fight.setup.dragon?.hp ?? 1;
      return {
        side: side.side,
        seat: null,
        name: DRAGON_NAME,
        job: null,
        color: DRAGON_COLOR,
        crest: 'star',
        control: side.control,
        hp,
        maxHp: hp,
      };
    }
    const seat = side.seat;
    return {
      side: side.side,
      seat,
      name: seats.find((s) => s.seat === seat)?.name ?? `P${seat + 1}`,
      job: setup.job,
      color: seatColor(seat),
      crest: CRESTS[seat % CRESTS.length]!,
      control: side.control,
      hp: setup.hp,
      maxHp: setup.maxHp,
    };
  };
  return [card(0), card(1)];
}

/** Key layout a side plays with on this screen (null for bots and the dragon). */
export function layoutOf(control: FightControl): KeyLayout | null {
  switch (control) {
    case 'keyboard-p1':
      return KEY_LAYOUTS.p1;
    case 'keyboard-p2':
      return KEY_LAYOUTS.p2;
    case 'keyboard-solo':
      return KEY_LAYOUTS.solo;
    default:
      return null;
  }
}

export const isLocalControl = (c: FightControl): boolean => layoutOf(c) !== null;

export const subtitleOf = (c: FighterCard): string =>
  c.job ? `${JOB_LABEL[c.job]}${c.control === 'bot' ? ' · 봇' : ''}` : '보스';

export interface ResultView {
  readonly headline: string;
  readonly winner: FighterCard;
  readonly loser: FighterCard;
  readonly lines: readonly string[];
  /** The local player (or anyone, in hot-seat) won. */
  readonly good: boolean;
}

export function resultView(
  cards: readonly [FighterCard, FighterCard],
  result: CombatResult,
): ResultView {
  const winner = result.winner === 'a' ? cards[0] : cards[1];
  const loser = result.winner === 'a' ? cards[1] : cards[0];
  const locals = cards.filter((c) => isLocalControl(c.control));
  const good =
    locals.length === 0 || locals.length === 2 || locals.some((c) => c.side === winner.side);
  const dragonFight = cards[1].seat === null;
  const headline = dragonFight
    ? result.winner === 'a'
      ? '용을 쓰러뜨렸다!'
      : '용에게 패배'
    : `${winner.name} 승리!`;
  const lines: string[] = [];
  if (result.timedOut)
    lines.push(dragonFight ? '시간 초과 — 도전 실패' : '시간 종료 — 남은 HP 비율로 판정');
  const hpOf = (side: 'a' | 'b') => (side === 'a' ? result.hpA : (result.hpB ?? 0));
  if (winner.seat !== null)
    lines.push(`${winner.name} 남은 HP ${hpOf(winner.side)} / ${winner.maxHp}`);
  if (result.indomitableUsedA || result.indomitableUsedB) lines.push('불굴 발동!');
  if (dragonFight && result.winner === 'a') lines.push(`${winner.name}의 게임 승리`);
  else lines.push(`${dragonFight ? cards[0].name : loser.name} 탈락`);
  return { headline, winner, loser, lines, good };
}
