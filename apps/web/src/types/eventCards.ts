import type { GameEvent, RulesConfig, SeatId, TileDef } from '@dragon-rush/engine';
import { cardIconName, TILE_ICON_NAME, type IconName } from './icons';
import { cardFlavor, cardLabel, TILE_FLAVOR, TILE_LABEL } from './labels';
import { effectChips, tileCategory, type EffectChip, type TileCategory } from './tileView';

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
  readonly tone: TileCategory | 'mystery';
}

/** Card for an event as it is shown, or null. A cave card is face down until its mystery card. */
export function eventCardFor(
  e: GameEvent,
  rules: Pick<RulesConfig, 'board' | 'mysteryDeck'>,
): EventCardFace | null {
  switch (e.type) {
    case 'TileResolved': {
      const def = rules.board[e.tile];
      if (!def || !showsEventCard(def)) return null;
      const cave = def.effects.some((x) => x.kind === 'mystery');
      return {
        kind: cave ? 'cave' : 'tile',
        seat: e.seat,
        tile: e.tile,
        title: TILE_LABEL[def.id],
        icon: TILE_ICON_NAME[def.id],
        flavor: TILE_FLAVOR[def.id],
        chips: cave ? [] : effectChips(def.effects),
        tone: tileCategory(def, e.tile),
      };
    }
    case 'MysteryCardDrawn': {
      const def = rules.mysteryDeck.find((c) => c.id === e.cardId);
      return {
        kind: 'mystery',
        seat: e.seat,
        tile: null,
        title: cardLabel(e.cardId),
        icon: cardIconName(e.cardId),
        flavor: cardFlavor(e.cardId),
        chips: def ? effectChips(def.effects) : [],
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
