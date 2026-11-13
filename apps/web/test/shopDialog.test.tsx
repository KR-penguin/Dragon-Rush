import {
  applyAction,
  createGame,
  getLegalActions,
  ITEM_IDS,
  toPublicState,
  withRules,
  type GameState,
} from '@dragon-rush/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ShopDialog } from '../src/components/dialogs/ShopDialog';
import { shopRows } from '../src/types/decisionView';

vi.mock('../src/hooks/useAssetUrl', () => ({ useAssetUrl: () => null }));

const renderShop = (state: GameState): string => {
  const view = toPublicState(state);
  const buys = getLegalActions(view).flatMap((action) =>
    action.type === 'BUY_ITEM' ? [action.item] : [],
  );
  return renderToStaticMarkup(
    <ShopDialog
      rows={shopRows(view, view.current, buys)}
      coins={view.players[view.current]!.coins}
      purchasesUsed={view.turn.itemsBought}
      purchaseLimit={view.rules.maxItemsBoughtPerTurn}
      locked={false}
      onBuy={() => undefined}
      onClose={() => undefined}
    />,
  );
};

const arriveAtShop = (): GameState => {
  const rules = withRules({
    startingCoins: 100,
    startingItems: { teleport: 1 },
    boardVariation: null,
  });
  const state = createGame({ seats: [{ job: 'swordsman' }, { job: 'archer' }] }, rules, 42);
  return applyAction(state, { type: 'USE_TELEPORT', tile: 6 }).state;
};

describe('shop purchase presentation', () => {
  it('shows the prince totem and its rule-driven bonus and price', () => {
    const state = arriveAtShop();
    const html = renderShop({
      ...state,
      rules: { ...state.rules, princeTotemMaxHpBonus: 23 },
    });
    expect(html).toContain('왕자의 토템 구매, 코인 15');
    expect(html).toContain('전투 시작 시 1개 자동 소모. 이번 전투 최대 체력 +23, 체력 완전 회복');
    expect(html).toContain('종료 시 원래 최대 체력으로 복귀');
    expect(html).not.toContain('도둑');
    expect(html).toContain('한 턴 최대 3개 · 이번 턴 0/3개 구매 · 남은 구매 3개');
  });

  it('keeps the exhausted shop visible with every purchase disabled', () => {
    let state = arriveAtShop();
    for (const item of ITEM_IDS) state = applyAction(state, { type: 'BUY_ITEM', item }).state;
    const html = renderShop(state);
    expect(html).toContain('한 턴 최대 3개 · 이번 턴 3/3개 구매 · 남은 구매 0개');
    expect(html.match(/class="ware-card parchment is-chained" disabled=""/g)).toHaveLength(3);
  });
});
