import {
  actionKey,
  applyAction,
  getLegalActions,
  toPublicState,
  type GameState,
} from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import {
  ACTION_DIM,
  createHeuristicBot,
  createModelPolicy,
  createPolicyRandom,
  createRandomBot,
  dragonProfile,
  HEURISTIC_STYLES,
  OBS_DIM,
  OBS_VERSION,
  profileOf,
  winProbability,
  type Policy,
} from '../src/index';
import { newGame } from './helpers';

function playOut(s0: GameState, policies: Policy[], seed: number): GameState {
  let s = s0;
  const random = createPolicyRandom(seed);
  for (let i = 0; i < 20_000 && s.pending; i++) {
    const legal = getLegalActions(s);
    const seat = s.pending.actor;
    const action = policies[seat]!.decide({ view: toPublicState(s), seat, legal, random });
    expect(legal.map(actionKey)).toContain(actionKey(action));
    s = applyAction(s, action).state;
  }
  return s;
}

const meta = (id: string) => ({
  id,
  obsVersion: OBS_VERSION,
  actVersion: 'act_v1',
  output: 'logits' as const,
  obsDim: OBS_DIM,
  actionDim: ACTION_DIM,
});

describe('built-in bots', () => {
  it('uses seeded dice simulations for internal win estimates', () => {
    const state = newGame(2, 17);
    const first = profileOf(state.players[0]!, state.rules);
    const opponent = profileOf(state.players[1]!, state.rules);
    const duel = winProbability(state.rules, first, opponent, 192);
    const dragon = winProbability(state.rules, first, dragonProfile(state.rules), 320);

    expect(duel).toBeGreaterThanOrEqual(0);
    expect(duel).toBeLessThanOrEqual(1);
    expect(duel * 192).toBeCloseTo(Math.round(duel * 192), 10);
    expect(dragon * 320).toBeCloseTo(Math.round(dragon * 320), 10);
    expect(winProbability(state.rules, first, opponent, 192)).toBe(duel);
  });

  it('heuristic bots of every style finish games with legal actions', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const policies = [0, 1, 2, 3].map((i) =>
        createHeuristicBot(HEURISTIC_STYLES[(i + seed) % 3]!),
      );
      const end = playOut(newGame(4, seed, 100), policies, seed);
      expect(end.outcome).not.toBeNull();
    }
  });

  it('random bots finish games', () => {
    const end = playOut(
      newGame(3, 9, 40),
      [createRandomBot(), createRandomBot({ uniform: true }), createRandomBot()],
      9,
    );
    expect(end.outcome).not.toBeNull();
  });

  it('model policy masks illegal actions and picks the best legal index', () => {
    const scores = new Float32Array(ACTION_DIM);
    scores[2] = 5;
    scores[1] = 100;
    const policy = createModelPolicy({ meta: meta('dummy'), forward: () => scores });
    const s = newGame(2, 1);
    const action = policy.decide({
      view: toPublicState(s),
      seat: 0,
      legal: getLegalActions(s),
      random: () => 0.5,
    });
    expect(action).toEqual({ type: 'CHALLENGE_DRAGON' });
  });

  it('rejects a model with an older observation contract', () => {
    const scores = new Float32Array(ACTION_DIM);
    expect(() =>
      createModelPolicy({
        meta: { ...meta('legacy'), obsVersion: 'obs_v1' },
        forward: () => scores,
      }),
    ).toThrow(/obs_v1.*obs_v2/);
  });

  it('evaluates all ten movement outcomes before using a teleport', () => {
    const s = newGame(2, 1);
    const original = toPublicState(s);
    const board = original.rules.board.map((tile, index) => ({
      ...tile,
      effects: index === 10 ? [{ kind: 'coins' as const, amount: 6 }] : [],
    }));
    const players = original.players.map((player, index) =>
      index === 0
        ? { ...player, coins: 0, items: { ...player.items, teleport: 1 } }
        : { ...player, position: 0 },
    );
    const action = createHeuristicBot('growth').decide({
      view: { ...original, rules: { ...original.rules, board }, players },
      seat: 0,
      legal: [{ type: 'ROLL_DICE' }, { type: 'USE_TELEPORT', tile: 10 }],
      random: () => 0.5,
    });
    expect(action).toEqual({ type: 'ROLL_DICE' });
  });

  it('values the START bonus on a clockwise teleport route', () => {
    const s = newGame(2, 1);
    const original = toPublicState(s);
    const board = original.rules.board.map((tile, index) => ({
      ...tile,
      effects: index === 1 ? [{ kind: 'coins' as const, amount: 10 }] : [],
    }));
    const players = original.players.map((player) => ({
      ...player,
      position: 23,
      coins: 0,
      items: { ...player.items, teleport: player.seat === 0 ? 1 : 0 },
    }));
    const action = createHeuristicBot('growth').decide({
      view: { ...original, rules: { ...original.rules, board }, players },
      seat: 0,
      legal: [{ type: 'ROLL_DICE' }, { type: 'USE_TELEPORT', tile: 1 }],
      random: () => 0.5,
    });
    expect(action).toEqual({ type: 'USE_TELEPORT', tile: 1 });
  });

  it('model policy falls back to the heuristic bot on NaN output', () => {
    let reason = '';
    const policy = createModelPolicy(
      { meta: meta('nan'), forward: () => new Float32Array(ACTION_DIM).fill(Number.NaN) },
      { onFallback: (r) => (reason = r) },
    );
    const s = newGame(2, 1);
    const legal = getLegalActions(s);
    const action = policy.decide({ view: toPublicState(s), seat: 0, legal, random: () => 0.5 });
    expect(legal.map(actionKey)).toContain(actionKey(action));
    expect(reason).not.toBe('');
  });
});
