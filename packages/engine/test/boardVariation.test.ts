import { describe, expect, it } from 'vitest';
import { applyAction, createGame, DEFAULT_RULES, withRules } from '../src/index';
import { cloneState } from '../src/state';

const setup = { seats: [{ job: 'mage' as const }, { job: 'mage' as const }] };
const ids = (seed: number) => createGame(setup, DEFAULT_RULES, seed).rules.board.map((tile) => tile.id);

describe('seeded board variation', () => {
  it('keeps landmarks while replacing four old tiles with two good and two bad new events', () => {
    const board = createGame(setup, DEFAULT_RULES, 42).rules.board;
    expect(board).toHaveLength(24);
    for (const index of [0, 6, 12, 18]) expect(board[index]).toEqual(DEFAULT_RULES.board[index]);
    const variation = DEFAULT_RULES.boardVariation!;
    expect(board.filter((tile) => variation.good.some((option) => option.id === tile.id))).toHaveLength(2);
    expect(board.filter((tile) => variation.bad.some((option) => option.id === tile.id))).toHaveLength(2);
    expect(DEFAULT_RULES.board.map((tile) => tile.id)).not.toEqual(board.map((tile) => tile.id));
  });

  it('is reproducible for a seed and gives different layouts across games', () => {
    expect(ids(42)).toEqual(ids(42));
    expect(new Set(Array.from({ length: 12 }, (_, seed) => ids(seed).join(','))).size).toBe(12);
  });

  it('keeps pure healing events beyond the opening roulette range', () => {
    for (let seed = 0; seed < 50; seed++) {
      const board = createGame(setup, DEFAULT_RULES, seed).rules.board;
      expect(board.slice(1, DEFAULT_RULES.movement.rollSides + 1).map((tile) => tile.id))
        .not.toContain('HERB');
      expect(board.slice(1, DEFAULT_RULES.movement.rollSides + 1).map((tile) => tile.id))
        .not.toContain('MOONWELL');
    }
  });

  it('treats an explicitly supplied board as fixed unless variation is also supplied', () => {
    const board = DEFAULT_RULES.board.map((tile) => ({ ...tile }));
    const rules = withRules({ board });
    expect(rules.boardVariation).toBeNull();
    expect(createGame(setup, rules, 5).rules.board).toEqual(board);
  });

  it('resolves the event on the generated tile instead of the template tile', () => {
    const state = cloneState(createGame(setup, DEFAULT_RULES, 42));
    const pool = [...DEFAULT_RULES.boardVariation!.good, ...DEFAULT_RULES.boardVariation!.bad];
    const index = state.rules.board.findIndex((tile) => pool.some((entry) => entry.id === tile.id));
    state.players[0]!.items.teleport = 1;
    const result = applyAction(state, { type: 'USE_TELEPORT', tile: index });
    expect(result.events).toContainEqual({
      type: 'TileResolved',
      seat: 0,
      tile: index,
      tileId: state.rules.board[index]!.id,
    });
    expect(result.state.rules.board).toEqual(state.rules.board);
  });
});
