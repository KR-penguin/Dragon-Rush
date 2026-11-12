import { describe, expect, it } from 'vitest';
import { createGame, DEFAULT_RULES, getLegalActions, toPublicState } from '@dragon-rush/engine';
import {
  emptyOutcomeModel,
  outcomeFeatures,
  parseOutcomeModel,
  predictOutcome,
} from '../src/outcome';
import {
  createHeuristicBot,
  createPolicyRandom,
  dragonProfile,
  profileOf,
  winProbability,
} from '../src';

const setup = {
  kind: 'duel' as const,
  a: { job: 'swordsman' as const, hp: 22, maxHp: 30, atk: 8, def: 5, indomitableAvailable: true },
  b: { job: 'mage' as const, hp: 15, maxHp: 20, atk: 9, def: 3, indomitableAvailable: false },
};
const damage = { sNum: 8, sDen: 5, k: 10, min: 1, dragonDamageTakenScale: 0.17, mageDefDivisor: 2 };

describe('outcome_v1 contract', () => {
  it('validates dimensions, versions, finite weights, and metadata', () => {
    const model = emptyOutcomeModel('fixture', DEFAULT_RULES.version, 'combat-fixture', damage);
    expect(parseOutcomeModel(model)).toEqual(model);
    expect(() => parseOutcomeModel({ ...model, version: 'outcome_v2' })).toThrow();
    expect(() => parseOutcomeModel({ ...model, win: [...model.win, 0] })).toThrow();
    expect(() => parseOutcomeModel({ ...model, win: [NaN, ...model.win.slice(1)] })).toThrow();
    expect(() => parseOutcomeModel({ ...model, id: '' })).toThrow();
    expect(() =>
      parseOutcomeModel({
        ...model,
        calibration: [
          { raw: 0.5, observed: 0.2 },
          { raw: 0.4, observed: 0.8 },
        ],
      }),
    ).toThrow();
  });

  it('encodes board profiles and returns normalized probabilities', () => {
    const model = emptyOutcomeModel('fixture', DEFAULT_RULES.version, 'combat-fixture', damage);
    const features = outcomeFeatures(setup, damage);
    expect(features.every(Number.isFinite)).toBe(true);
    const prediction = predictOutcome(model, setup);
    expect(prediction.winA).toBe(0.5);
    expect(prediction.hpBins).toHaveLength(10);
    expect(prediction.hpBins.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(prediction.indomitableUsedA).toBe(0.5);
    expect(prediction.indomitableUsedB).toBe(0);
  });

  it('feeds the outcome prediction into board estimates and the heuristic bot', () => {
    const model = emptyOutcomeModel('fixture', DEFAULT_RULES.version, 'combat-fixture', damage);
    model.win[0] = 8;
    const created = createGame(
      { seats: [{ job: 'swordsman' }, { job: 'mage' }] },
      DEFAULT_RULES,
      42,
    );
    const state = { ...created, players: created.players.map((p) => ({ ...p, coins: 0 })) };
    const view = toPublicState(state);
    const a = profileOf(state.players[0]!, DEFAULT_RULES);
    const chance = winProbability(DEFAULT_RULES, a, dragonProfile(DEFAULT_RULES), 4, model);
    expect(chance).toBeGreaterThan(0.99);
    expect(
      createHeuristicBot('rush', model).decide({
        view,
        seat: state.pending!.actor,
        legal: getLegalActions(state),
        random: createPolicyRandom(1),
      }),
    ).toEqual({ type: 'CHALLENGE_DRAGON' });
  });
});
