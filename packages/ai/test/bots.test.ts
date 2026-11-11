import { actionKey, applyAction, getLegalActions, toPublicState, type GameState } from '@hero-dice/engine';
import { describe, expect, it } from 'vitest';
import {
  ACTION_DIM,
  createHeuristicBot,
  createModelPolicy,
  createPolicyRandom,
  createRandomBot,
  HEURISTIC_STYLES,
  OBS_DIM,
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

const meta = (id: string) => ({ id, obsVersion: 'obs_v1', actVersion: 'act_v1', output: 'logits' as const, obsDim: OBS_DIM, actionDim: ACTION_DIM });

describe('built-in bots', () => {
  it('heuristic bots of every style finish games with legal actions', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const policies = [0, 1, 2, 3].map((i) => createHeuristicBot(HEURISTIC_STYLES[(i + seed) % 3]!));
      const end = playOut(newGame(4, seed, 100), policies, seed);
      expect(end.outcome).not.toBeNull();
    }
  });

  it('random bots finish games', () => {
    const end = playOut(newGame(3, 9, 40), [createRandomBot(), createRandomBot({ uniform: true }), createRandomBot()], 9);
    expect(end.outcome).not.toBeNull();
  });

  it('model policy masks illegal actions and picks the best legal index', () => {
    const scores = new Float32Array(ACTION_DIM);
    scores[2] = 5;
    scores[1] = 100;
    const policy = createModelPolicy({ meta: meta('dummy'), forward: () => scores });
    const s = newGame(2, 1);
    const action = policy.decide({ view: toPublicState(s), seat: 0, legal: getLegalActions(s), random: () => 0.5 });
    expect(action).toEqual({ type: 'CHALLENGE_DRAGON' });
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
