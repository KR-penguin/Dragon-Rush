import { applyAction, getLegalActions } from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import {
  encodeObservation,
  maskFromLegal,
  OBS_DIM,
  OBS_V3_LAYOUT,
  OBS_V4_LAYOUT,
  OBS_VERSION,
} from '../src/index';
import { newGame, view, walk } from './helpers';

const field = (name: string) => {
  const f = OBS_V4_LAYOUT.find((x) => x.name === name);
  if (!f) throw new Error(`no field ${name}`);
  return f;
};

describe('obs_v4', () => {
  it('keeps the 258 legacy fields and appends 24 ten-scalar tile blocks', () => {
    expect(OBS_VERSION).toBe('obs_v4');
    expect(OBS_DIM).toBe(498);
    let offset = 0;
    for (const f of OBS_V4_LAYOUT) {
      expect(f.offset).toBe(offset);
      offset += f.length;
    }
    expect(offset).toBe(498);
    expect(OBS_V4_LAYOUT.slice(0, OBS_V3_LAYOUT.length)).toEqual(OBS_V3_LAYOUT);
    expect(OBS_V3_LAYOUT.at(-1)).toEqual({
      name: 'g.paidUpgradesRemaining',
      offset: 257,
      length: 1,
    });
    expect(field('tile00.coins').offset).toBe(258);
    expect(field('tile00.mystery').offset).toBe(267);
    expect(field('tile23.coins').offset).toBe(488);
    expect(field('tile23.mystery').offset).toBe(497);
    expect(field('opp1.present').offset).toBe(51);
    expect(field('opp2.present').offset).toBe(105);
    expect(field('opp3.present').offset).toBe(159);
    expect(field('g.round').offset).toBe(213);
    expect(field('g.dice')).toEqual({ name: 'g.dice', offset: 232, length: 10 });
    expect(field('g.canBuy').offset).toBe(242);
    expect(field('g.itemPrice').offset).toBe(254);
    expect(field('g.paidUpgradesRemaining').offset).toBe(257);
  });

  it('keeps values in [0, 2] with valid one-hots on reachable states', () => {
    const oneHots = OBS_V3_LAYOUT.filter((f) =>
      /(job|pos|phase|turnPlayer|dice|numPlayers|pvpOpponent)$/.test(f.name),
    );
    for (const n of [2, 4]) {
      for (const s of walk(n, 7)) {
        if (!s.pending) continue;
        const obs = encodeObservation(view(s), s.pending.actor);
        expect(obs).toHaveLength(498);
        for (const v of obs.slice(0, 258)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(2);
        }
        for (const v of obs.slice(258)) {
          expect(v).toBeGreaterThanOrEqual(-2);
          expect(v).toBeLessThanOrEqual(2);
        }
        for (const f of oneHots) {
          const sum = obs.slice(f.offset, f.offset + f.length).reduce((a, b) => a + b, 0);
          expect([0, 1]).toContain(sum);
        }
      }
    }
  });

  it('derives tile values from effects, including stacked signed amounts and flags', () => {
    const initial = view(newGame(2, 1));
    const board = initial.rules.board.map((tile) => ({ ...tile }));
    board[7] = {
      ...board[7]!,
      effects: [
        { kind: 'coins', amount: 6 },
        { kind: 'coins', amount: -10 },
        { kind: 'hp', amount: -5 },
        { kind: 'stat', stat: 'atk', amount: 2 },
        { kind: 'stat', stat: 'def', amount: -1 },
        { kind: 'maxHp', amount: 5 },
        { kind: 'skipTurn' },
        { kind: 'randomItem' },
        { kind: 'training' },
        { kind: 'shop' },
        { kind: 'mystery' },
      ],
    };
    const obs = encodeObservation({ ...initial, rules: { ...initial.rules, board } }, 0);
    const expected = [-4 / 20, -5 / 20, 2 / 5, -1 / 5, 5 / 10, 1, 1, 1, 1, 1];
    for (const [index, value] of expected.entries()) expect(obs[328 + index]).toBeCloseTo(value);
  });

  it('distinguishes boards even when tile IDs and all other public state match', () => {
    const initial = view(newGame(2, 1));
    const originalEffects = initial.rules.board[1]!.effects;
    const originalCoins = originalEffects.reduce(
      (sum, effect) => sum + (effect.kind === 'coins' ? effect.amount : 0),
      0,
    );
    const changedCoins = originalCoins === 0 ? 20 : 0;
    const changed = initial.rules.board.map((tile, index) =>
      index === 1 ? { ...tile, effects: [{ kind: 'coins' as const, amount: changedCoins }] } : tile,
    );
    const original = encodeObservation(initial, 0);
    const alternate = encodeObservation(
      { ...initial, rules: { ...initial.rules, board: changed } },
      0,
    );
    expect([...original.slice(0, 258)]).toEqual([...alternate.slice(0, 258)]);
    expect(original[field('tile01.coins').offset]).toBeCloseTo(
      Math.min(2, Math.max(-2, originalCoins / 20)),
    );
    expect(alternate[field('tile01.coins').offset]).toBe(changedCoins / 20);
    expect(original).not.toEqual(alternate);
  });

  it('encodes distinct seeded game boards in the appended map segment', () => {
    const first = encodeObservation(view(newGame(2, 1)), 0);
    const second = encodeObservation(view(newGame(2, 2)), 0);
    expect([...first.slice(258)]).not.toEqual([...second.slice(258)]);
  });

  it('shows the cooldown consumed by a zero ninja adjustment', () => {
    const state = newGame(2, 42);
    state.players[state.current]!.job = 'ninja';
    const rolled = applyAction(state, { type: 'ROLL_DICE' }).state;
    expect(rolled.pending?.phase).toBe('MOVE_ADJUST');
    const adjusted = applyAction(rolled, { type: 'ADJUST_MOVE', delta: 0 }).state;
    expect(adjusted.players[state.current]!.passive.ninjaCooldown).toBe(2);
    expect(
      encodeObservation(view(adjusted), state.current)[field('self.ninjaCooldown').offset],
    ).toBe(1);
  });

  it('encodes every movement roll and clears the dice field before rolling', () => {
    const initial = view(newGame(2, 1));
    const dice = field('g.dice');
    expect([
      ...encodeObservation(initial, 0).slice(dice.offset, dice.offset + dice.length),
    ]).toEqual(Array(10).fill(0));
    for (let roll = 1; roll <= 10; roll++) {
      const observation = encodeObservation(
        { ...initial, turn: { ...initial.turn, dice: roll } },
        0,
      );
      expect([...observation.slice(dice.offset, dice.offset + dice.length)]).toEqual(
        Array.from({ length: 10 }, (_, i) => Number(i === roll - 1)),
      );
    }
  });

  it('marks opponents ten steps away as reachable but eleven steps away as not reachable', () => {
    const initial = view(newGame(2, 1));
    const me = { ...initial.players[0]!, position: 0 };
    const opp = initial.players[1]!;
    const at = (position: number) =>
      encodeObservation({ ...initial, players: [me, { ...opp, position }] }, 0);
    expect(at(10)[field('opp1.iCanReach').offset]).toBe(1);
    expect(at(11)[field('opp1.iCanReach').offset]).toBe(0);
    expect(at(14)[field('opp1.canReachMe').offset]).toBe(1);
    expect(at(13)[field('opp1.canReachMe').offset]).toBe(0);
  });

  it('uses configured movement sides for reachability within the ten-slot contract', () => {
    const initial = view(newGame(2, 1));
    const players = [
      { ...initial.players[0]!, position: 0 },
      { ...initial.players[1]!, position: 8 },
    ];
    const withSides = (rollSides: number) => ({
      ...initial,
      players,
      rules: { ...initial.rules, movement: { rollSides } },
    });
    expect(encodeObservation(withSides(6), 0)[field('opp1.iCanReach').offset]).toBe(0);
    expect(encodeObservation(withSides(10), 0)[field('opp1.iCanReach').offset]).toBe(1);
    expect(() => encodeObservation(withSides(11), 0)).toThrow(/at most 10/);
  });

  it('encodes a pending COMBAT (not a board decision) as an all-zero phase one-hot', () => {
    const s = applyAction(newGame(2, 1, 30, 'external'), { type: 'CHALLENGE_DRAGON' }).state;
    expect(s.pending?.phase).toBe('COMBAT');
    const f = field('g.phase');
    const obs = encodeObservation(view(s), s.pending!.actor);
    expect([...obs.slice(f.offset, f.offset + f.length)]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('encodes the starting position from seat 0', () => {
    const s = newGame(2, 1);
    const obs = encodeObservation(view(s), 0);
    expect(obs[field('self.pos').offset]).toBe(1);
    expect(obs[field('self.coins').offset]).toBeCloseTo(10 / 50);
    expect(obs[field('opp1.present').offset]).toBe(1);
    expect(obs[field('opp2.present').offset]).toBe(0);
    expect(obs[field('g.phase').offset]).toBe(1);
    expect(obs[field('g.turnPlayer').offset]).toBe(1);
    expect(obs[field('g.numPlayers').offset]).toBe(1);
    expect(obs[field('g.graceLeft').offset]).toBe(0);
    expect(obs[field('g.pvpEnabled').offset]).toBe(1);
  });

  it('exposes remaining paid upgrades and masks them after three purchases', () => {
    let state = newGame(2, 1);
    const offset = field('g.paidUpgradesRemaining').offset;
    expect(encodeObservation(view(state), 0)[offset]).toBe(1);
    for (const [index, stat] of (['atk', 'def', 'maxHp'] as const).entries()) {
      state = applyAction(state, { type: 'UPGRADE', stat }).state;
      expect(encodeObservation(view(state), 0)[offset]).toBeCloseTo((2 - index) / 3);
    }
    expect(getLegalActions(state).some((action) => action.type === 'UPGRADE')).toBe(false);
    expect([...maskFromLegal(view(state), 0, getLegalActions(state)).slice(3, 6)]).toEqual([
      0, 0, 0,
    ]);
  });
});
