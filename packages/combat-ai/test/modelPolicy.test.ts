import { createCombatBot, policyRandom, runCombat } from '@dragon-rush/combat';
import {
  applyAction,
  createGame,
  DEFAULT_RULES,
  getLegalActions,
  withRules,
} from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import {
  boardCombatSetup,
  COBS_DIM,
  createCombatBotByName,
  COMBAT_BOT_NAMES,
  createCombatModelPolicy,
  getCombatWeightAdapter,
  inactiveMask,
  selectCombatAction,
  StateHistory,
  type CombatPolicyModel,
} from '../src/index';
import { dragonFight, duel } from './helpers';

function fakeModel(
  head: 'multi' | 'flat',
  f: (obs: Float32Array) => Float32Array,
): CombatPolicyModel {
  return {
    meta: {
      id: 'fake',
      cobsVersion: 'cobs_v1',
      cactVersion: 'cact_v1',
      head,
      output: 'logits',
      obsDim: COBS_DIM,
    },
    forward: f,
  };
}

describe('selectCombatAction', () => {
  const open = { move: new Uint8Array(9).fill(1), button: new Uint8Array([1, 1, 0, 1]) };
  const argmax = { mode: 'argmax' as const, temperature: 1 };

  it('takes the per-branch argmax over allowed entries', () => {
    const out = Float32Array.from([0, 0, 0, 5, 0, 0, 0, 0, 0, /* buttons */ 0, 1, 9, 2]);
    expect(
      selectCombatAction(out, open, { head: 'multi', output: 'logits' }, argmax, Math.random),
    ).toEqual({ move: 3, button: 3 });
  });

  it('handles flat heads, probabilities and unusable outputs', () => {
    const flat = new Float32Array(36);
    flat[4 * 4 + 2] = 10; // masked (skill)
    flat[7 * 4 + 1] = 5;
    expect(
      selectCombatAction(flat, open, { head: 'flat', output: 'logits' }, argmax, Math.random),
    ).toEqual({ move: 7, button: 1 });
    const probs = Float32Array.from([
      0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.2, 0.7, 0.1, 0.1, 0.1,
    ]);
    expect(
      selectCombatAction(probs, open, { head: 'multi', output: 'probs' }, argmax, Math.random),
    ).toEqual({ move: 8, button: 0 });
    expect(
      selectCombatAction(
        new Float32Array(12),
        open,
        { head: 'multi', output: 'logits' },
        argmax,
        Math.random,
      ),
    ).toBeNull();
    const nan = new Float32Array(13).fill(Number.NaN);
    expect(
      selectCombatAction(nan, open, { head: 'multi', output: 'logits' }, argmax, Math.random),
    ).toBeNull();
    const sampled = selectCombatAction(
      new Float32Array(13),
      inactiveMask(),
      { head: 'multi', output: 'logits' },
      { mode: 'sample', temperature: 1 },
      policyRandom(1, 1),
    );
    expect(sampled).toEqual({ move: 0, button: 0 });
  });
});

describe('createCombatModelPolicy', () => {
  it('plays a full fight through runCombat, deciding every 4 live ticks', () => {
    let calls = 0;
    const model = fakeModel('multi', (obs) => {
      calls++;
      expect(obs).toHaveLength(COBS_DIM);
      const out = new Float32Array(13);
      out[3] = 2; // east
      out[9 + 1] = 1; // attack
      return out;
    });
    const policy = createCombatModelPolicy(model, { difficulty: 'hard', mode: 'argmax' });
    const r = runCombat(duel('swordsman', 'mage'), [policy, createCombatBot('balanced')], 21);
    expect(r.result.winner === 'a' || r.result.winner === 'b').toBe(true);
    expect(calls).toBeGreaterThan(10);
    expect(calls).toBeLessThanOrEqual(Math.ceil(r.ticks / 4) + 1);
  });

  it('falls back to the scripted bot on a broken model and reports it', () => {
    const reasons: string[] = [];
    const policy = createCombatModelPolicy(
      fakeModel('flat', () => new Float32Array(5)),
      { onFallback: (r) => reasons.push(r) },
    );
    const r = runCombat(dragonFight('berserker'), [policy], 5);
    expect(r.ticks).toBeGreaterThan(0);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('rejects models with the wrong observation size', () => {
    const bad: CombatPolicyModel = {
      ...fakeModel('multi', () => new Float32Array(13)),
      meta: { ...fakeModel('multi', () => new Float32Array(13)).meta, obsDim: 159 },
    };
    expect(() => createCombatModelPolicy(bad)).toThrow(RangeError);
  });

  it('has no user weight adapter until the format arrives', () => {
    expect(getCombatWeightAdapter()).toBeNull();
  });
});

describe('scripted bots and helpers', () => {
  it('creates every named bot and plays a fight with it', () => {
    for (const name of COMBAT_BOT_NAMES) {
      const random = policyRandom(3, 9);
      const r = runCombat(
        duel('ninja', 'archer'),
        [createCombatBotByName(name, random), createCombatBotByName(name, random)],
        8,
      );
      expect(r.result.hpA).toBeGreaterThanOrEqual(0);
    }
    expect(() => createCombatBotByName('scripted:nope', Math.random)).toThrow(RangeError);
  });

  it('keeps a ring of delayed states', () => {
    const h = new StateHistory(3, 'first' as never);
    h.push('one' as never);
    h.push('two' as never);
    expect(h.delayed(0)).toBe('two');
    expect(h.delayed(1)).toBe('one');
    expect(h.delayed(2)).toBe('first');
    expect(h.delayed(9)).toBe('first');
    h.push('three' as never);
    expect(h.delayed(2)).toBe('one');
  });

  it('builds a combat setup from a board fight waiting in COMBAT', () => {
    const rules = withRules({
      pvpGraceRounds: 0,
      combat: { ...DEFAULT_RULES.combat, mode: 'external' },
    });
    let s = createGame({ seats: [{ job: 'swordsman' }, { job: 'mage' }] }, rules, 3);
    for (let i = 0; i < 5000 && s.pending && s.pending.phase !== 'COMBAT'; i++) {
      const legal = getLegalActions(s);
      const dragon = legal.find((a) => a.type === 'CHALLENGE_DRAGON');
      const roll = legal.find((a) => a.type === 'ROLL_DICE');
      s = applyAction(s, dragon && i > 30 ? dragon : (roll ?? legal[0]!)).state;
    }
    expect(s.pending?.phase).toBe('COMBAT');
    const setup = boardCombatSetup(s);
    const req = s.combat!;
    const a = s.players[req.a]!;
    expect(setup.a).toMatchObject({ job: a.job, hp: a.hp, maxHp: a.maxHp, atk: a.atk, def: a.def });
    if (req.kind === 'dragonFight')
      expect(setup.dragon).toEqual({
        hp: rules.dragon.hp,
        atk: rules.dragon.atk,
        def: rules.dragon.def,
      });
    else expect(setup.b?.job).toBe(s.players[req.b!]!.job);
  });
});
