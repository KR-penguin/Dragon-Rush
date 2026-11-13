import { describe, expect, it } from 'vitest';
import { getLegalActions, IllegalActionError, withRules } from '../src/index';
import { act, deepFreeze, DICE_RULES, newGame, patch } from './helpers';

function shopVisit(rules = DICE_RULES) {
  const state = patch(newGame(['swordsman', 'archer'], 42, rules), (draft) => {
    draft.players[0]!.coins = 100;
  });
  return act(deepFreeze(state), { type: 'ROLL_DICE' }).state;
}

describe('shop purchases per turn', () => {
  it('allows three total purchases and rejects the fourth without mutating the input', () => {
    let state = shopVisit();
    for (const item of ['teleport', 'shield', 'princeTotem'] as const) {
      state = act(deepFreeze(state), { type: 'BUY_ITEM', item }).state;
    }
    expect(state.turn.itemsBought).toBe(3);
    expect(getLegalActions(state).some((action) => action.type === 'BUY_ITEM')).toBe(false);
    expect(() => act(deepFreeze(state), { type: 'BUY_ITEM', item: 'shield' })).toThrow(
      IllegalActionError,
    );
    expect(state.players[0]!.coins).toBe(55);
  });

  it('keeps the total when a shop state changes position during the same turn', () => {
    let state = act(shopVisit(), { type: 'BUY_ITEM', item: 'shield' }).state;
    state = act(state, { type: 'BUY_ITEM', item: 'teleport' }).state;
    state = patch(state, (draft) => {
      draft.players[0]!.position = 18;
    });
    expect(state.turn.itemsBought).toBe(2);
    expect(getLegalActions(state)).toContainEqual({ type: 'BUY_ITEM', item: 'shield' });
    state = act(state, { type: 'BUY_ITEM', item: 'shield' }).state;
    state = patch(state, (draft) => {
      draft.players[0]!.position = 6;
    });
    expect(state.turn.canBuy).toBe(true);
    expect(state.turn.itemsBought).toBe(3);
    expect(getLegalActions(state).some((action) => action.type === 'BUY_ITEM')).toBe(false);
  });

  it('resets the purchase total when a new own turn starts', () => {
    let state = shopVisit();
    for (let count = 0; count < 3; count++) {
      state = act(state, { type: 'BUY_ITEM', item: 'shield' }).state;
    }
    state = act(state, { type: 'END_TURN' }).state;
    expect(state.turn.itemsBought).toBe(0);
    state = patch(state, (draft) => {
      draft.turn.resting = true;
    });
    state = act(state, { type: 'END_TURN' }).state;
    expect(state.current).toBe(0);
    expect(state.turn.itemsBought).toBe(0);
    state = patch(state, (draft) => {
      draft.players[0]!.position = 18;
      draft.turn.canBuy = true;
      draft.pending = { actor: 0, phase: 'POST_MOVE' };
    });
    expect(getLegalActions(state)).toContainEqual({ type: 'BUY_ITEM', item: 'shield' });
  });

  it('uses the configured purchase limit', () => {
    const rules = withRules({ maxItemsBoughtPerTurn: 1 }, DICE_RULES);
    let state = shopVisit(rules);
    state = act(state, { type: 'BUY_ITEM', item: 'shield' }).state;
    expect(getLegalActions(state).some((action) => action.type === 'BUY_ITEM')).toBe(false);
  });
});
