import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, getLegalActions, IllegalActionError, withRules } from '../src/index';
import { act, deepFreeze, DICE_RULES, eventsOf, newGame, patch } from './helpers';

function ready(rules = DICE_RULES) {
  return patch(newGame(['swordsman', 'archer'], 42, rules), (state) => {
    state.players[0]!.coins = 100;
    state.players[0]!.items.teleport = 2;
    state.players[1]!.position = 12;
  });
}

describe('teleport main action', () => {
  it('costs 24 coins and has a configured one-use turn limit', () => {
    expect(DEFAULT_RULES.version).toBe('rush-13');
    expect(DEFAULT_RULES.items.teleport).toEqual({ price: 24, perTurnLimit: 1 });
  });

  it.each([6, 18])('allows shop destination %i before movement', (tile) => {
    const state = deepFreeze(ready());
    expect(getLegalActions(state)).toContainEqual({ type: 'USE_TELEPORT', tile });
    const moved = act(state, { type: 'USE_TELEPORT', tile });
    expect(moved.state.players[0]!.position).toBe(tile);
    expect(moved.state.players[0]!.items.teleport).toBe(1);
    expect(moved.state.turn.teleportsUsed).toBe(1);
    expect(moved.state.turn.canBuy).toBe(true);
    expect(moved.state.pending?.phase).toBe('POST_MOVE');
    expect(state.players[0]!.items.teleport).toBe(2);
  });

  it('allows destinations with relocated shop effects and IDs', () => {
    const rules = withRules(
      {
        board: DEFAULT_RULES.board.map((tile, index) => {
          if (index === 3) return { ...tile, effects: [{ kind: 'shop' as const }] };
          if (index === 6) return { ...DEFAULT_RULES.board[1]! };
          if (index === 18) return { ...tile, effects: [] };
          return tile;
        }),
      },
      DICE_RULES,
    );
    const state = deepFreeze(ready(rules));
    const legal = getLegalActions(state);
    expect(legal).toContainEqual({ type: 'USE_TELEPORT', tile: 3 });
    expect(legal).toContainEqual({ type: 'USE_TELEPORT', tile: 18 });
    expect(legal).toContainEqual({ type: 'USE_TELEPORT', tile: 6 });
    expect(act(state, { type: 'USE_TELEPORT', tile: 3 }).state.turn.canBuy).toBe(true);
  });

  it('cannot teleport after rolling even when items remain', () => {
    const rolled = act(deepFreeze(ready()), { type: 'ROLL_DICE' }).state;
    expect(rolled.current).toBe(0);
    expect(rolled.turn.rolled).toBe(true);
    expect(getLegalActions(rolled).some((action) => action.type === 'USE_TELEPORT')).toBe(false);
    expect(() => act(deepFreeze(rolled), { type: 'USE_TELEPORT', tile: 3 })).toThrow(
      IllegalActionError,
    );
  });

  it('consumes the movement action and cannot roll or teleport again that turn', () => {
    const moved = act(deepFreeze(ready()), { type: 'USE_TELEPORT', tile: 3 });
    expect(moved.state.current).toBe(0);
    expect(moved.state.pending?.phase).toBe('POST_MOVE');
    expect(moved.state.turn.teleportsUsed).toBe(1);
    expect(moved.state.players[0]!.items.teleport).toBe(1);
    expect(eventsOf(moved.events, 'DiceRolled')).toEqual([]);
    for (const action of [{ type: 'ROLL_DICE' }, { type: 'USE_TELEPORT', tile: 9 }] as const) {
      expect(getLegalActions(moved.state)).not.toContainEqual(action);
      expect(() => act(deepFreeze(moved.state), action)).toThrow(IllegalActionError);
    }
  });

  it('does not offer teleport in a rolled PRE_ROLL state', () => {
    const state = patch(ready(), (draft) => {
      draft.turn.rolled = true;
    });
    expect(getLegalActions(state).some((action) => action.type === 'USE_TELEPORT')).toBe(false);
  });

  it('resets teleport availability on the next own turn', () => {
    let state = act(ready(), { type: 'USE_TELEPORT', tile: 3 }).state;
    state = act(state, { type: 'END_TURN' }).state;
    state = patch(state, (draft) => {
      draft.turn.resting = true;
    });
    state = act(state, { type: 'END_TURN' }).state;
    expect(state.current).toBe(0);
    expect(state.turn.teleportsUsed).toBe(0);
    expect(getLegalActions(state)).toContainEqual({ type: 'USE_TELEPORT', tile: 9 });
  });

  it('keeps the configured price and zero-use limit authoritative', () => {
    const rules = withRules(
      { items: { ...DEFAULT_RULES.items, teleport: { price: 31, perTurnLimit: 0 } } },
      DICE_RULES,
    );
    const before = patch(ready(rules), (state) => {
      state.players[0]!.coins = 31;
      state.turn.canBuy = true;
      state.pending = { actor: 0, phase: 'POST_MOVE' };
    });
    const bought = act(deepFreeze(before), { type: 'BUY_ITEM', item: 'teleport' });
    expect(eventsOf(bought.events, 'ItemBought')[0]).toMatchObject({ price: 31, coinsAfter: 0 });
    expect(getLegalActions(ready(rules)).some((action) => action.type === 'USE_TELEPORT')).toBe(
      false,
    );
  });
});
