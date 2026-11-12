import type {
  EffectSpec,
  GameEvent,
  ItemId,
  RulesConfig,
  SeatId,
  TileDef,
} from '@dragon-rush/engine';
import { cardIconName, ITEM_ICON_NAME, TILE_ICON_NAME, type IconName } from './icons';
import { coinShortfallMessage } from './eventNotices';
import { cardFlavor, cardLabel, ITEM_LABEL, TILE_FLAVOR, TILE_LABEL } from './labels';
import {
  effectChip,
  effectChips,
  tileCategory,
  type EffectChip,
  type TileCategory,
} from './tileView';

/** Tiles that open their own prop (shop stall, training anvil) or do nothing skip the card. */
export function showsEventCard(def: TileDef): boolean {
  return (
    def.effects.length > 0 && !def.effects.some((e) => e.kind === 'shop' || e.kind === 'training')
  );
}

export type EventCardKind = 'tile' | 'cave' | 'mystery' | 'start';

/** Face of the event card that rises from a tile (decision sheet §1.8). */
export interface EventCardFace {
  readonly kind: EventCardKind;
  readonly seat: SeatId;
  /** Tile the card rises from. */
  readonly tile: number | null;
  readonly title: string;
  readonly icon: IconName;
  readonly flavor: string;
  readonly chips: readonly EffectChip[];
  /** Explains a penalty based on the applied result, not the tile's listed effect. */
  readonly notice?: string;
  /** Names an awarded item from the applied event. */
  readonly reward?: string;
  readonly tone: TileCategory | 'mystery';
}

function coinShortfallNotice(seat: SeatId, following: readonly GameEvent[]): string | undefined {
  for (const event of following) {
    if (event.type !== 'EffectApplied' || event.seat !== seat) break;
    if (event.effect === 'hp' && event.cause === 'coinShortfall' && event.delta < 0) {
      return coinShortfallMessage(Math.abs(event.delta));
    }
  }
  return undefined;
}

function grantedItem(seat: SeatId, following: readonly GameEvent[]): ItemId | undefined {
  for (const event of following) {
    if (event.type !== 'EffectApplied' || event.seat !== seat) break;
    if (event.effect === 'randomItem') return event.item;
  }
  return undefined;
}

function resolvedChips(effects: readonly EffectSpec[], item: ItemId | undefined): EffectChip[] {
  return effects.map((effect) =>
    effect.kind === 'randomItem' && item
      ? { icon: ITEM_ICON_NAME[item], amount: null, label: ITEM_LABEL[item], tone: 'good' }
      : effectChip(effect),
  );
}

/** Card for an event as it is shown, or null. A cave card is face down until its mystery card. */
export function eventCardFor(
  e: GameEvent,
  rules: Pick<RulesConfig, 'board' | 'mysteryDeck'>,
  following: readonly GameEvent[] = [],
): EventCardFace | null {
  switch (e.type) {
    case 'TileResolved': {
      const def = rules.board[e.tile];
      if (!def || !showsEventCard(def)) return null;
      const cave = def.effects.some((x) => x.kind === 'mystery');
      const item = def.effects.some((x) => x.kind === 'randomItem')
        ? grantedItem(e.seat, following)
        : undefined;
      return {
        kind: cave ? 'cave' : 'tile',
        seat: e.seat,
        tile: e.tile,
        title: TILE_LABEL[def.id],
        icon: TILE_ICON_NAME[def.id],
        flavor: TILE_FLAVOR[def.id],
        chips: cave ? [] : resolvedChips(def.effects, item),
        notice: cave ? undefined : coinShortfallNotice(e.seat, following),
        reward: item ? `${ITEM_LABEL[item]} 획득` : undefined,
        tone: tileCategory(def, e.tile),
      };
    }
    case 'MysteryCardDrawn': {
      const def = rules.mysteryDeck.find((c) => c.id === e.cardId);
      const item = def?.effects.some((x) => x.kind === 'randomItem')
        ? grantedItem(e.seat, following)
        : undefined;
      return {
        kind: 'mystery',
        seat: e.seat,
        tile: null,
        title: cardLabel(e.cardId),
        icon: cardIconName(e.cardId),
        flavor: cardFlavor(e.cardId),
        chips: def ? resolvedChips(def.effects, item) : [],
        notice: coinShortfallNotice(e.seat, following),
        reward: item ? `${ITEM_LABEL[item]} 획득` : undefined,
        tone: 'mystery',
      };
    }
    case 'StartBonus':
      return {
        kind: 'start',
        seat: e.seat,
        tile: 0,
        title: '출발 보너스',
        icon: 'start',
        flavor: TILE_FLAVOR.START,
        chips: effectChips([
          { kind: 'coins', amount: e.coins },
          { kind: 'hp', amount: e.hp },
        ]).filter((c) => c.amount !== 0),
        tone: 'landmark',
      };
    default:
      return null;
  }
}

/** Count-up length for a changed counter (300 ms for small changes, 500 ms otherwise). */
export const countUpMs = (delta: number): number => (Math.abs(delta) <= 10 ? 300 : 500);
