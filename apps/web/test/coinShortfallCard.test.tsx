import { DEFAULT_RULES } from '@dragon-rush/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EventCards } from '../src/components/hud/EventCards';
import { eventCardFor } from '../src/types/eventCards';

vi.mock('../src/components/icons/GameIcon', () => ({
  GameIcon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('../src/components/board/BoardTile', () => ({
  EffectChips: () => <span />,
}));

describe('coin shortfall event card', () => {
  it('shows why actual HP was lost on the visible card', () => {
    const tile = DEFAULT_RULES.board.findIndex((t) => t.id === 'BANDIT');
    const face = eventCardFor(
      { type: 'TileResolved', seat: 0, tile, tileId: 'BANDIT' },
      DEFAULT_RULES,
      [
        { type: 'EffectApplied', seat: 0, effect: 'coins', delta: 0, after: 0 },
        {
          type: 'EffectApplied',
          seat: 0,
          effect: 'hp',
          delta: -5,
          after: 8,
          cause: 'coinShortfall',
        },
      ],
    );
    expect(face).not.toBeNull();
    const html = renderToStaticMarkup(
      <EventCards
        cards={[{ key: 1, face: face!, revealed: true, lifeMs: 3330, born: 0, speed: 1 }]}
        flyers={[]}
        reduced={true}
      />,
    );
    expect(html).toContain('코인이 부족해 HP 5를 대신 잃었습니다');
  });
});
