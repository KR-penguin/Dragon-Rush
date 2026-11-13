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
  actVersion: 'act_v4',
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

  it('includes an owned prince totem in the estimated combat profile', () => {
    const state = newGame(2, 17);
    const player = state.players[0]!;
    player.hp = 1;
    player.items.princeTotem = 2;
    const estimated = profileOf(player, state.rules);
    expect(estimated.maxHp).toBe(player.maxHp + state.rules.princeTotemMaxHpBonus);
    expect(estimated.hp).toBe(estimated.maxHp);
    expect(player.hp).toBe(1);
    expect(player.items.princeTotem).toBe(2);
  });

  it('continues planning when the turn shop purchase allowance is exhausted', () => {
    const state = newGame(2, 17);
    const player = state.players[0]!;
    player.coins = 100;
    player.items = { teleport: 1, shield: 1, princeTotem: 0 };
    state.pending = { actor: 0, phase: 'POST_MOVE' };
    state.turn.canBuy = true;
    state.turn.itemsBought = 3;
    const legal = getLegalActions(state);
    expect(legal.some((action) => action.type === 'BUY_ITEM')).toBe(false);
    const action = createHeuristicBot().decide({
      view: toPublicState(state),
      seat: 0,
      legal,
      random: () => 0.5,
    });
    expect(action.type).toBe('UPGRADE');
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

  it.each(['PRE_ROLL', 'POST_MOVE'] as const)(
    'continues upgrading while an owned prince totem waits for combat in %s',
    (phase) => {
      const bot = createHeuristicBot('growth');
      let state = newGame(2, 42);
      state.players[0]!.items.princeTotem = 2;
      state.players[0]!.coins = 50;
      state.players[1]!.coins = 100;
      state.pending = { actor: 0, phase };
      const decide = () =>
        bot.decide({
          view: toPublicState(state),
          seat: 0,
          legal: getLegalActions(state),
          random: () => 0.5,
        });

      const first = decide();
      expect(first.type).toBe('UPGRADE');
      state = applyAction(state, first).state;
      expect(state.players[0]!.items.princeTotem).toBe(2);
      expect(decide().type).toBe('UPGRADE');
    },
  );

  it('buys a missing prince totem before buying another teleport', () => {
    let state = newGame(2, 42);
    state.players[0]!.coins = 100;
    state.players[0]!.items = { teleport: 0, shield: 1, princeTotem: 0 };
    state.pending = { actor: 0, phase: 'POST_MOVE' };
    state.turn.canBuy = true;
    const bot = createHeuristicBot('growth');
    const decide = () =>
      bot.decide({
        view: toPublicState(state),
        seat: 0,
        legal: getLegalActions(state),
        random: () => 0.5,
      });
    const purchase = decide();
    expect(purchase).toEqual({ type: 'BUY_ITEM', item: 'princeTotem' });
    state = applyAction(state, purchase).state;
    expect(state.players[0]!.items.princeTotem).toBe(1);
    expect(state.turn.itemsBought).toBe(1);
    expect(decide()).toEqual({ type: 'BUY_ITEM', item: 'teleport' });
  });

  it('considers a healing teleport when paid upgrades are exhausted', () => {
    const state = newGame(2, 42);
    state.turn.paidUpgradesUsed = state.rules.maxPaidUpgradesPerTurn;
    state.players[0]!.coins = 50;
    state.players[0]!.hp = 1;
    state.players[0]!.position = 23;
    state.players[0]!.items.teleport = 1;
    state.players[1]!.coins = 0;
    state.players[1]!.position = 3;

    const action = createHeuristicBot('growth').decide({
      view: toPublicState(state),
      seat: 0,
      legal: getLegalActions(state),
      random: () => 0.5,
    });
    expect(action).toEqual({ type: 'USE_TELEPORT', tile: 12 });
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
    ).toThrow(/obs_v1.*obs_v5/);
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
