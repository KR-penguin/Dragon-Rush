import type { GameEvent, PublicGameState, SeatId, TileId } from '@dragon-rush/engine';
import type { IconName } from '../types/icons';
import { ITEM_ICON_NAME, STAT_ICON_NAME, TILE_ICON_NAME } from '../types/icons';
import { ITEM_LABEL, JOB_LABEL, STAT_LABEL, TILE_LABEL, cardLabel } from '../types/labels';
import { ROULETTE_ROLL_MS, diceMoveMs, teleportMoveMs } from '../types/motion';
import { coinShortfallMessage } from '../types/eventNotices';

export type NameOf = (seat: SeatId) => string;

export const EVENT_CARD_RISE_MS = 200;
export const EVENT_CARD_FLIP_MS = 180;
export const EVENT_CARD_HOLD_MS = 2700;
export const EVENT_CARD_FADE_MS = 250;
export const EVENT_CARD_MS =
  EVENT_CARD_RISE_MS + EVENT_CARD_FLIP_MS + EVENT_CARD_HOLD_MS + EVENT_CARD_FADE_MS;

/** Base durations (ms) at 1x speed; the server timer does not wait for animations. */
const DURATION: Partial<Record<GameEvent['type'], number>> = {
  DiceRolled: ROULETTE_ROLL_MS,
  Moved: 450,
  EffectApplied: 250,
  CombatStarted: 650,
  CombatHit: 260,
  CombatEnded: 700,
  PlayerEliminated: 900,
  ShieldUsed: 600,
  CoinsStolen: 500,
  StatUpgraded: 200,
  ItemBought: 200,
  GameEnded: 400,
};

export function eventDuration(e: GameEvent): number {
  // 160 ms per step; the hops shorten inside it (160 ms, x0.9, min 120 ms) and leave a landing beat.
  if (e.type === 'Moved') return e.via === 'dice' ? diceMoveMs(e.steps) : teleportMoveMs(e.steps);
  if (e.type === 'StartBonus' || e.type === 'MysteryCardDrawn') return EVENT_CARD_MS;
  if (e.type === 'TileResolved') {
    if (e.tileId === 'MYSTERY') return 600;
    return e.tileId === 'START' || e.tileId === 'SHOP' || e.tileId === 'TRAINING'
      ? 250
      : EVENT_CARD_MS;
  }
  return DURATION[e.type] ?? 0;
}

const who = (name: NameOf, ref: SeatId | 'dragon') => (ref === 'dragon' ? '용' : name(ref));

/** Korean log line for an event, or null when it is not worth logging. */
export function describeEvent(
  e: GameEvent,
  name: NameOf,
  tileIdAt: (tile: number) => TileId,
): string | null {
  switch (e.type) {
    case 'RoundStarted':
      return `— ${e.round}라운드 —`;
    case 'TurnStarted':
      return `${name(e.seat)}의 턴${e.resting ? ' (쉬는 턴: 이동 불가)' : ''}`;
    case 'TurnSkipped':
      return `${name(e.seat)}의 쉬는 턴이 끝났습니다`;
    case 'DiceRolled':
      return `${name(e.seat)} 룰렛 ${e.value}칸`;
    case 'MoveAdjusted':
      return e.delta === 0
        ? null
        : `${name(e.seat)} 그림자 걸음 ${e.delta > 0 ? '+1' : '−1'} → ${e.steps}칸`;
    case 'Moved':
      return e.via === 'teleport'
        ? `${name(e.seat)} 텔레포트로 시계 방향 ${e.steps}칸 이동 → ${TILE_LABEL[tileIdAt(e.to)]}`
        : `${name(e.seat)} ${e.steps}칸 이동`;
    case 'StartBonus':
      return `${name(e.seat)} 출발 보너스 코인 +${e.coins}, HP +${e.hp}`;
    case 'TileResolved':
      return `${name(e.seat)} → ${TILE_LABEL[e.tileId]}`;
    case 'MysteryCardDrawn':
      return `${name(e.seat)} 동굴 카드: ${cardLabel(e.cardId)}`;
    case 'EffectApplied':
      return describeEffect(e, name);
    case 'StatUpgraded':
      return `${name(e.seat)} ${STAT_LABEL[e.stat]} 강화${e.free ? ' (무료)' : ` (-${e.cost}코인)`} → ${e.valueAfter}`;
    case 'ItemBought':
      return `${name(e.seat)} ${ITEM_LABEL[e.item]} 구매 (-${e.price}코인)`;
    case 'ItemUsed':
      return e.item === 'teleport' ? null : `${name(e.seat)} ${ITEM_LABEL[e.item]} 사용`;
    case 'CoinsStolen':
      return `${name(e.to)}이(가) ${name(e.from)}의 코인 ${e.amount}개를 훔쳤습니다`;
    case 'PvpTriggered':
      return `${name(e.arriver)}이(가) ${e.candidates.map(name).join(', ')}와(과) 같은 칸에 멈췄습니다`;
    case 'PvpTargetChosen':
      return `${name(e.arriver)} → ${name(e.target)} 결투 상대 선택`;
    case 'ShieldUsed':
      return `${name(e.seat)} 방어막! 전투가 취소되었습니다`;
    case 'CombatStarted':
      return e.kind === 'dragonFight'
        ? `${who(name, e.a)}의 용 도전!`
        : `${who(name, e.a)} vs ${who(name, e.b)} 결투`;
    case 'CombatHit':
      return null;
    case 'PassiveTriggered':
      return e.passive === 'indomitable' ? `${name(e.seat)} 불굴 발동! HP 1로 버팁니다` : null;
    case 'CombatEnded':
      return `${who(name, e.winner)} 승리${e.capReached ? ' (교환 상한)' : ''}`;
    case 'PlayerEliminated':
      return `${name(e.seat)} 탈락 (${e.by === 'dragon' ? '용에게 패배' : `${name(e.by)}에게 패배`})`;
    case 'LootTransferred':
      return `${name(e.to)}이(가) 코인 ${e.coins}개와 아이템을 획득`;
    case 'TurnEnded':
      return null;
    case 'GameEnded':
      if (e.outcome.kind === 'draw') return '무승부로 게임이 끝났습니다';
      return `${name(e.outcome.winner!)} 승리! (${e.outcome.kind === 'dragon' ? '용 처치' : '최후 생존'})`;
  }
}

function describeEffect(
  e: Extract<GameEvent, { type: 'EffectApplied' }>,
  name: NameOf,
): string | null {
  const n = name(e.seat);
  switch (e.effect) {
    case 'coins':
      return e.delta === 0 ? null : `${n} 코인 ${e.delta > 0 ? '+' : ''}${e.delta}`;
    case 'hp':
      return e.delta === 0
        ? null
        : e.cause === 'coinShortfall'
          ? `${n}: ${coinShortfallMessage(Math.abs(e.delta))}`
          : `${n} HP ${e.delta > 0 ? '+' : ''}${e.delta}`;
    case 'stat':
      return `${n} ${STAT_LABEL[e.stat ?? 'atk']} +${e.delta}`;
    case 'maxHp':
      return `${n} 최대 HP +${e.delta}`;
    case 'skipTurn':
      return `${n} 다음 턴에 쉽니다`;
    case 'randomItem':
      return `${n} ${ITEM_LABEL[e.item ?? 'shield']} 획득`;
    default:
      return null;
  }
}

/** The seat an event is mainly about (for seat-coloured toasts), or null. */
export function eventSeat(e: GameEvent): SeatId | null {
  switch (e.type) {
    case 'CoinsStolen':
    case 'LootTransferred':
      return e.to;
    case 'PvpTriggered':
    case 'PvpTargetChosen':
      return e.arriver;
    case 'CombatStarted':
      return typeof e.a === 'number' ? e.a : null;
    case 'CombatEnded':
      return typeof e.winner === 'number' ? e.winner : null;
    case 'GameEnded':
      return e.outcome.winner;
    case 'RoundStarted':
    case 'CombatHit':
      return null;
    default:
      return e.seat;
  }
}

/** Icon for a toast or chronicle line about this event. */
export function eventIcon(e: GameEvent): IconName {
  switch (e.type) {
    case 'DiceRolled':
      return 'roulette';
    case 'MoveAdjusted':
      return 'footsteps';
    case 'Moved':
      return e.via === 'teleport' ? 'teleport' : 'footsteps';
    case 'StartBonus':
      return 'start';
    case 'TileResolved':
      return TILE_ICON_NAME[e.tileId];
    case 'MysteryCardDrawn':
      return 'cave';
    case 'EffectApplied':
      if (e.effect === 'coins') return 'coins';
      if (e.effect === 'hp') return 'hp';
      if (e.effect === 'stat') return STAT_ICON_NAME[e.stat ?? 'atk'];
      if (e.effect === 'maxHp') return 'maxHp';
      if (e.effect === 'skipTurn') return 'sleep';
      if (e.effect === 'randomItem') return ITEM_ICON_NAME[e.item ?? 'shield'];
      return 'scroll';
    case 'StatUpgraded':
      return 'anvil';
    case 'ItemBought':
      return 'shop';
    case 'ItemUsed':
      return ITEM_ICON_NAME[e.item];
    case 'CoinsStolen':
      return 'thief';
    case 'PvpTriggered':
    case 'PvpTargetChosen':
    case 'CombatHit':
      return 'duel';
    case 'CombatStarted':
      return e.kind === 'dragonFight' ? 'dragon' : 'duel';
    case 'ShieldUsed':
      return 'shield';
    case 'PassiveTriggered':
      return 'indomitable';
    case 'CombatEnded':
      return 'crown';
    case 'PlayerEliminated':
      return 'skull';
    case 'LootTransferred':
      return 'coins';
    case 'GameEnded':
      return 'trophy';
    case 'RoundStarted':
    case 'TurnStarted':
    case 'TurnSkipped':
    case 'TurnEnded':
      return 'endTurn';
  }
}

/** Applies an event's result values to the display state so animations show intermediate values. */
export function applyEventToDisplay(display: PublicGameState, e: GameEvent): PublicGameState {
  const patchPlayer = (seat: SeatId, patch: Partial<PublicGameState['players'][number]>) => ({
    ...display,
    players: display.players.map((p) => (p.seat === seat ? { ...p, ...patch } : p)),
  });
  switch (e.type) {
    case 'Moved':
      return patchPlayer(e.seat, { position: e.to });
    case 'StartBonus':
      return patchPlayer(e.seat, { coins: e.coinsAfter, hp: e.hpAfter });
    case 'EffectApplied':
      if (e.effect === 'coins') return patchPlayer(e.seat, { coins: e.after });
      if (e.effect === 'hp') return patchPlayer(e.seat, { hp: e.after });
      return display;
    case 'StatUpgraded':
      return patchPlayer(e.seat, { coins: e.coinsAfter });
    case 'ItemBought':
      return patchPlayer(e.seat, { coins: e.coinsAfter });
    case 'CombatHit':
      return typeof e.defender === 'number'
        ? patchPlayer(e.defender, { hp: Math.max(0, e.hpAfter) })
        : display;
    case 'PlayerEliminated':
      return patchPlayer(e.seat, { alive: false, hp: 0 });
    case 'DiceRolled':
      return { ...display, turn: { ...display.turn, dice: e.value } };
    default:
      return display;
  }
}

export { JOB_LABEL };
