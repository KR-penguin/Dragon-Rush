import { createGame, DEFAULT_RULES, toPublicState } from '@dragon-rush/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CornerCard } from '../src/components/hud/CornerCard';
import { cornerOf } from '../src/types/hudLayout';
import { playerCards } from '../src/types/playerView';

vi.mock('../src/hooks/useAssetUrl', () => ({ useAssetUrl: () => null }));

describe('corner card ninja cooldown', () => {
  it('keeps the full badge in its own row for every corner and cooldown count', () => {
    const initial = toPublicState(
      createGame({ seats: Array.from({ length: 4 }, () => ({ job: 'ninja' })) }, DEFAULT_RULES, 42),
    );
    const state = {
      ...initial,
      players: initial.players.map((player, index) => ({
        ...player,
        passive: { ...player.passive, ninjaCooldown: (index % 2) + 1 },
      })),
    };
    const seats = state.players.map((player) => ({
      seat: player.seat,
      name: `P${player.seat + 1}`,
      kind: 'bot' as const,
      botName: 'heuristic',
      connected: true,
      controlledBy: 'bot' as const,
    }));

    for (const [index, card] of playerCards(state, seats, null).entries()) {
      const corner = cornerOf(index, 4);
      const html = renderToStaticMarkup(
        <CornerCard
          card={card}
          corner={corner}
          thinking={false}
          countdown={null}
          reduced={true}
          onPick={index === 1 ? () => undefined : null}
        />,
      );

      expect(html).toContain(`corner-${corner}`);
      expect(html).toContain(`보정 ${(index % 2) + 1}턴`);
      expect(html).toMatch(/<div class="cc-sub">[\s\S]*?<\/div><div class="cc-badges">/);
    }
  });
});
