import {
  applyAction,
  createGame,
  DEFAULT_RULES,
  type ItemId,
  withRules,
} from '@dragon-rush/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { describeEvent, eventIcon } from '../src/animation/eventTimeline';
import { EventCards } from '../src/components/hud/EventCards';
import { eventCardFor } from '../src/types/eventCards';

vi.mock('../src/components/icons/GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('../src/components/board/BoardTile', () => ({
  EffectChips: () => <span />,
}));

const merchantTile = DEFAULT_RULES.board.findIndex((tile) => tile.id === 'WANDERING_MERCHANT');
const labels: Record<ItemId, string> = {
  teleport: '텔레포트',
  shield: '방어막',
  thief: '도둑',
};

describe('random item event presentation', () => {
  it('uses the grant in a seeded merchant event sequence', () => {
    const rules = withRules({ startingItems: { teleport: 1 } });
    const state = createGame({ seats: [{ job: 'swordsman' }, { job: 'archer' }] }, rules, 1);
    const { events } = applyAction(state, { type: 'USE_TELEPORT', tile: merchantTile });
    const index = events.findIndex((event) => event.type === 'TileResolved');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(eventCardFor(events[index]!, rules, events.slice(index + 1))?.reward).toBe('도둑 획득');
  });

  it.each(['teleport', 'shield', 'thief'] as const)(
    'shows the granted %s item on the merchant card and event line',
    (item) => {
      const grant = {
        type: 'EffectApplied' as const,
        seat: 0,
        effect: 'randomItem' as const,
        item,
        delta: 1,
        after: 1,
      };
      const face = eventCardFor(
        { type: 'TileResolved', seat: 0, tile: merchantTile, tileId: 'WANDERING_MERCHANT' },
        DEFAULT_RULES,
        [grant],
      )!;
      expect(face.reward).toBe(`${labels[item]} 획득`);
      expect(face.chips).toContainEqual({
        icon: item,
        amount: null,
        label: labels[item],
        tone: 'good',
      });
      expect(
        describeEvent(
          grant,
          () => '검사',
          () => 'WANDERING_MERCHANT',
        ),
      ).toBe(`검사 ${labels[item]} 획득`);
      expect(eventIcon(grant)).toBe(item);
      const html = renderToStaticMarkup(
        <EventCards
          cards={[{ key: 1, face, revealed: true, lifeMs: 3330, born: 0, speed: 1 }]}
          flyers={[]}
          reduced={true}
        />,
      );
      expect(html).toContain(`${labels[item]} 획득`);
    },
  );

  it('shows the actual item on a lost bag card without reading later unrelated grants', () => {
    const drawn = { type: 'MysteryCardDrawn' as const, seat: 0, cardId: 'LOST_BAG' };
    const grant = {
      type: 'EffectApplied' as const,
      seat: 0,
      effect: 'randomItem' as const,
      item: 'thief' as const,
      delta: 1,
      after: 1,
    };
    expect(eventCardFor(drawn, DEFAULT_RULES, [grant])?.reward).toBe('도둑 획득');
    expect(
      eventCardFor(drawn, DEFAULT_RULES, [{ type: 'TurnEnded', seat: 0 }, grant])?.reward,
    ).toBeUndefined();
    expect(eventCardFor(drawn, DEFAULT_RULES, [{ ...grant, seat: 1 }])?.reward).toBeUndefined();
  });

  it('keeps unspecified grants generic instead of guessing a shield', () => {
    const grant = {
      type: 'EffectApplied' as const,
      seat: 0,
      effect: 'randomItem' as const,
      delta: 1,
      after: 1,
    };
    expect(
      describeEvent(
        grant,
        () => '검사',
        () => 'WANDERING_MERCHANT',
      ),
    ).toBe('검사 아이템 획득');
    expect(eventIcon(grant)).toBe('bag');
    expect(
      eventCardFor(
        { type: 'TileResolved', seat: 0, tile: merchantTile, tileId: 'WANDERING_MERCHANT' },
        DEFAULT_RULES,
        [grant],
      )?.reward,
    ).toBeUndefined();
  });
});
