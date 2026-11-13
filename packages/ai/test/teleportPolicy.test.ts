import { applyAction, getLegalActions, toPublicState } from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import {
  ACTION_DIM,
  ACT_VERSION,
  createHeuristicBot,
  createModelPolicy,
  encodeAction,
  maskFromLegal,
  OBS_DIM,
  OBS_VERSION,
} from '../src/index';
import { newGame } from './helpers';

describe('single-movement teleport policy contract', () => {
  it('versions the changed legal mask without changing action indices', () => {
    expect(ACT_VERSION).toBe('act_v5');
    expect(ACTION_DIM).toBe(44);
    const state = newGame(2, 42);
    const view = toPublicState(state);
    expect(encodeAction(view, 0, { type: 'USE_TELEPORT', tile: 6 })).toBe(15);
    expect(encodeAction(view, 0, { type: 'USE_TELEPORT', tile: 18 })).toBe(27);
    expect(() =>
      createModelPolicy({
        meta: {
          id: 'old-teleport-mask',
          obsVersion: OBS_VERSION,
          actVersion: 'act_v4',
          output: 'logits',
          obsDim: OBS_DIM,
          actionDim: ACTION_DIM,
        },
        forward: () => new Float32Array(ACTION_DIM),
      }),
    ).toThrow(/act_v4.*act_v5/);
  });

  it('allows shop destinations before movement and masks every additional movement afterward', () => {
    const state = newGame(2, 42);
    state.players[0]!.items.teleport = 2;
    state.players[1]!.position = 20;
    const view = toPublicState(state);
    const mask = maskFromLegal(view, 0, getLegalActions(state));
    for (const tile of [6, 18]) {
      expect(mask[encodeAction(view, 0, { type: 'USE_TELEPORT', tile })]).toBe(1);
    }
    const moved = applyAction(state, { type: 'USE_TELEPORT', tile: 1 }).state;
    const movedView = toPublicState(moved);
    const movedMask = maskFromLegal(movedView, 0, getLegalActions(moved));
    expect(movedMask[0]).toBe(0);
    expect([...movedMask.slice(9, 33)]).toEqual(new Array(24).fill(0));
  });

  it('honors the supplied legal destinations when prioritizing a shop', () => {
    const state = newGame(2, 42);
    state.turn.paidUpgradesUsed = state.rules.maxPaidUpgradesPerTurn;
    const player = state.players[0]!;
    player.position = 7;
    player.coins = 50;
    player.items = { teleport: 1, shield: 1, princeTotem: 0 };
    state.players[1]!.position = 3;
    const board = state.rules.board.map((tile, index) => ({
      ...tile,
      effects:
        index === 6 || index === 18
          ? [{ kind: 'shop' as const }]
          : index === 1
            ? [{ kind: 'coins' as const, amount: 20 }]
            : [],
    }));
    const view = { ...toPublicState(state), rules: { ...state.rules, board } };
    const action = createHeuristicBot('growth').decide({
      view,
      seat: 0,
      legal: getLegalActions(view).filter(
        (candidate) => candidate.type !== 'USE_TELEPORT' || candidate.tile === 1,
      ),
      random: () => 0.5,
    });
    expect(action).toEqual({ type: 'USE_TELEPORT', tile: 1 });
  });
});
