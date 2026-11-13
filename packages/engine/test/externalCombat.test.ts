import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  applyAction,
  applyCombatResult,
  getLegalActions,
  IllegalActionError,
  InvalidCombatResultError,
  isLegalAction,
  resolveCombatWithDice,
  toPublicState,
  type CombatResult,
  type GameState,
  type JobId,
} from '../src/index';
import { cloneState } from '../src/state';
import { act, deepFreeze, DICE_RULES, eventsOf, EXTERNAL_RULES, newGame, patch } from './helpers';

/** Assigns jobs (and their base stats) by seat so tests do not depend on the seed's seat shuffle. */
const withJobs = (d: GameState, jobs: JobId[]): void => {
  jobs.forEach((job, seat) => {
    const def = d.rules.jobs[job];
    Object.assign(d.players[seat]!, { job, hp: def.hp, maxHp: def.hp, atk: def.atk, def: def.def });
  });
};

/** Seat 0 teleports onto seat 1 (alone on `tile`) in round 4 with no shields, so a duel starts. */
function duelLanding(
  jobs: JobId[],
  opts: { tile?: number; rules?: GameState['rules']; edit?: (d: GameState) => void } = {},
) {
  const tile = opts.tile ?? 9;
  const before = patch(newGame(jobs, 8, opts.rules ?? EXTERNAL_RULES), (d) => {
    withJobs(d, jobs);
    d.round = 4;
    d.players[0]!.items.teleport = 1;
    for (const p of d.players) p.items.shield = 0;
    d.players[1]!.position = tile;
    opts.edit?.(d);
  });
  return { before, ...act(before, { type: 'USE_TELEPORT', tile }) };
}

function duelScenario(
  jobs: JobId[],
  opts: { tile?: number; rules?: GameState['rules']; edit?: (d: GameState) => void } = {},
) {
  const landing = duelLanding(jobs, opts);
  const confirmed = act(landing.state, { type: 'CHOOSE_PVP_TARGET', target: 1 });
  const accepted =
    confirmed.state.pending?.phase === 'SHIELD_DECISION' &&
    confirmed.state.pending.actor === 1 &&
    confirmed.state.players[1]!.items.shield === 0
      ? act(confirmed.state, { type: 'SHIELD_DECISION', use: false })
      : null;
  return {
    before: landing.before,
    state: accepted?.state ?? confirmed.state,
    events: [...landing.events, ...confirmed.events, ...(accepted?.events ?? [])],
  };
}

const dragonScenario = (jobs: JobId[], rules = EXTERNAL_RULES) =>
  act(
    patch(newGame(jobs, 5, rules), (d) => withJobs(d, jobs)),
    { type: 'CHALLENGE_DRAGON' },
  );

const withoutRules = (s: GameState) => ({ ...s, rules: null });

describe('external combat: request', () => {
  it('keeps the one-target confirmation pending until submitted', () => {
    const { state, events } = duelLanding(['mage', 'archer', 'swordsman']);
    expect(state.pending).toEqual({ actor: 0, phase: 'CHOOSE_PVP_TARGET' });
    expect(state.combat).toBeNull();
    expect(getLegalActions(state)).toEqual([{ type: 'CHOOSE_PVP_TARGET', target: 1 }]);
    expect(eventsOf(events, 'CombatStarted')).toHaveLength(0);
  });
  it('stops at COMBAT after shield decisions with no board decisions and no dice consumed', () => {
    const { before, state, events } = duelScenario(['mage', 'archer', 'swordsman']);
    expect(events.at(-1)).toEqual({ type: 'CombatStarted', kind: 'duel', a: 0, b: 1, first: 1 });
    expect(eventsOf(events, 'CombatHit')).toHaveLength(0);
    expect(state.combat).toEqual({ kind: 'duel', a: 0, b: 1 });
    expect(state.pending).toEqual({ actor: 0, phase: 'COMBAT' });
    expect(state.pvp).toBeNull();
    expect(state.rng).toEqual(before.rng);
    expect(getLegalActions(state)).toEqual([]);
    expect(toPublicState(state).combat).toEqual({ kind: 'duel', a: 0, b: 1 });
  });

  it('copies the pending request on clone (copy-on-write)', () => {
    const { state } = duelScenario(['mage', 'archer', 'swordsman']);
    const copy = cloneState(state);
    expect(copy.combat).toEqual(state.combat);
    expect(copy.combat).not.toBe(state.combat);
  });

  it('lets the arriver strike first when no archer is involved', () => {
    const { events } = duelScenario(['mage', 'ninja', 'archer']);
    expect(events.at(-1)).toMatchObject({ type: 'CombatStarted', first: 0 });
  });

  it('asks for shields before requesting the fight', () => {
    const r1 = duelScenario(['mage', 'ninja', 'archer'], {
      edit: (d) => void (d.players[1]!.items.shield = 1),
    });
    expect(r1.state.pending).toEqual({ actor: 1, phase: 'SHIELD_DECISION' });
    expect(r1.state.combat).toBeNull();
    const r2 = act(r1.state, { type: 'SHIELD_DECISION', use: false });
    expect(r2.state.pending).toEqual({ actor: 0, phase: 'COMBAT' });
    expect(r2.events).toEqual([{ type: 'CombatStarted', kind: 'duel', a: 0, b: 1, first: 0 }]);
  });

  it('requests a dragon fight with the challenger striking first', () => {
    const { state, events } = dragonScenario(['archer', 'mage', 'ninja']);
    expect(events).toEqual([
      { type: 'CombatStarted', kind: 'dragonFight', a: 0, b: 'dragon', first: 0 },
    ]);
    expect(state.combat).toEqual({ kind: 'dragonFight', a: 0, b: null });
    expect(state.pending).toEqual({ actor: 0, phase: 'COMBAT' });
  });

  it('rejects every board action while the fight is pending', () => {
    const { state } = duelScenario(['mage', 'ninja', 'archer']);
    for (const action of [
      { type: 'END_TURN' },
      { type: 'ROLL_DICE' },
      { type: 'UPGRADE', stat: 'atk' },
    ] as const) {
      expect(isLegalAction(state, action)).toBe(false);
      expect(() => applyAction(state, action)).toThrow(IllegalActionError);
    }
  });
});

describe('external combat: applyCombatResult for duels', () => {
  const loaded = (d: GameState) => {
    d.players[0]!.coins = 9;
    d.players[1]!.coins = 13;
    d.players[1]!.items.teleport = 2;
  };

  it('arriver wins: defender eliminated, loot taken, then the tile resolves', () => {
    const { state } = duelScenario(['mage', 'berserker', 'swordsman'], { edit: loaded });
    const r = applyCombatResult(deepFreeze(state), { winner: 'a', hpA: 7, hpB: -3 });
    expect(r.events.slice(0, 4)).toEqual([
      { type: 'CombatEnded', kind: 'duel', winner: 0, loser: 1, capReached: false },
      {
        type: 'LootTransferred',
        from: 1,
        to: 0,
        coins: 6,
        items: { teleport: 2, shield: 0, princeTotem: 0 },
      },
      { type: 'PlayerEliminated', seat: 1, by: 0, round: 4 },
      { type: 'EffectApplied', seat: 0, effect: 'coins', delta: 30, after: 45 },
    ]);
    expect(r.events.slice(4, 6)).toEqual([
      { type: 'EffectApplied', seat: 0, effect: 'hp', delta: 33, after: 40 },
      { type: 'TileResolved', seat: 0, tile: 9, tileId: 'HERB' },
    ]);
    expect(r.state.players[0]).toMatchObject({
      hp: 40,
      coins: 9 + 6 + 30,
      items: { teleport: 2, shield: 0, princeTotem: 0 },
    });
    expect(r.state.players[1]).toMatchObject({ alive: false, hp: 0, coins: 0 });
    expect(r.state.combat).toBeNull();
    expect(r.state.pending).toEqual({ actor: 0, phase: 'POST_MOVE' });
    expect(state.combat).toEqual({ kind: 'duel', a: 0, b: 1 });
  });

  it('defender wins: arriver eliminated, defender loots, and the turn ends without a tile event', () => {
    const { state } = duelScenario(['mage', 'berserker', 'swordsman'], { edit: loaded });
    const r = applyCombatResult(state, { winner: 'b', hpA: 0, hpB: 12 });
    expect(r.events.slice(0, 3)).toEqual([
      { type: 'CombatEnded', kind: 'duel', winner: 1, loser: 0, capReached: false },
      {
        type: 'LootTransferred',
        from: 0,
        to: 1,
        coins: 4,
        items: { teleport: 0, shield: 0, princeTotem: 0 },
      },
      { type: 'PlayerEliminated', seat: 0, by: 1, round: 4 },
    ]);
    expect(eventsOf(r.events, 'TileResolved')).toHaveLength(0);
    expect(eventsOf(r.events, 'TurnEnded')).toEqual([{ type: 'TurnEnded', seat: 0 }]);
    expect(eventsOf(r.events, 'EffectApplied')).toEqual([
      { type: 'EffectApplied', seat: 1, effect: 'coins', delta: 30, after: 47 },
      { type: 'EffectApplied', seat: 1, effect: 'hp', delta: 35, after: 47 },
    ]);
    expect(r.state.players[1]).toMatchObject({ hp: 47, coins: 13 + 4 + 30 });
    expect(r.state.current).toBe(1);
    expect(r.state.pending).toEqual({ actor: 1, phase: 'PRE_ROLL' });
  });

  it('enters TRAINING_CHOICE when the arriver wins on the training tile', () => {
    const { state } = duelScenario(['mage', 'berserker', 'swordsman'], { tile: 5 });
    const r = applyCombatResult(state, { winner: 'a', hpA: 20, hpB: -1 });
    expect(r.state.pending).toEqual({ actor: 0, phase: 'TRAINING_CHOICE' });
  });

  it('ends the game when the winner is the last survivor', () => {
    const { state } = duelScenario(['mage', 'berserker']);
    const r = applyCombatResult(state, { winner: 'b', hpA: -5, hpB: 30 });
    expect(r.events.at(-1)).toEqual({
      type: 'GameEnded',
      outcome: { kind: 'lastSurvivor', winner: 1 },
    });
    expect(r.state.outcome).toEqual({ kind: 'lastSurvivor', winner: 1 });
    expect(r.state.pending).toBeNull();
    expect(r.state.combat).toBeNull();
  });

  it('keeps POST_MOVE when the PvP bonus makes upgrades available', () => {
    const { state } = duelScenario(['mage', 'berserker', 'swordsman'], {
      tile: 4,
      edit: (d) => {
        d.players[0]!.coins = 0;
        d.players[1]!.coins = 1;
      },
    });
    const r = applyCombatResult(state, { winner: 'a', hpA: 10, hpB: 0 });
    expect(eventsOf(r.events, 'TurnEnded')).toHaveLength(0);
    expect(r.state.pending).toEqual({ actor: 0, phase: 'POST_MOVE' });
    expect(getLegalActions(r.state)).toContainEqual({ type: 'UPGRADE', stat: 'atk' });
  });

  it('resolves the shop after an arriving duel winner before offering purchases', () => {
    const landing = duelLanding(['mage', 'berserker', 'swordsman'], {
      tile: 6,
      edit: (d) => {
        d.players[0]!.coins = 0;
        d.players[1]!.coins = 0;
      },
    });
    expect(landing.state.pending?.phase).toBe('CHOOSE_PVP_TARGET');
    expect(eventsOf(landing.events, 'TileResolved')).toHaveLength(0);
    const confirmed = act(landing.state, { type: 'CHOOSE_PVP_TARGET', target: 1 });
    expect(confirmed.state.pending).toEqual({ actor: 1, phase: 'SHIELD_DECISION' });
    const accepted = act(confirmed.state, { type: 'SHIELD_DECISION', use: false });
    expect(accepted.state.pending?.phase).toBe('COMBAT');
    const settled = applyCombatResult(accepted.state, { winner: 'a', hpA: 1, hpB: 0 });
    expect(eventsOf(settled.events, 'TileResolved')).toEqual([
      { type: 'TileResolved', seat: 0, tile: 6, tileId: 'SHOP' },
    ]);
    expect(settled.state.turn.canBuy).toBe(true);
    expect(settled.state.pending).toEqual({ actor: 0, phase: 'POST_MOVE' });
    expect(getLegalActions(settled.state)).toContainEqual({ type: 'BUY_ITEM', item: 'shield' });
  });

  it('marks capReached when the fight timed out', () => {
    const { state } = duelScenario(['mage', 'berserker', 'swordsman']);
    const r = applyCombatResult(state, { winner: 'a', hpA: 20, hpB: 15, timedOut: true });
    expect(r.events[0]).toEqual({
      type: 'CombatEnded',
      kind: 'duel',
      winner: 0,
      loser: 1,
      capReached: true,
    });
  });
});

describe('external combat: indomitable write-back', () => {
  it('records the swordsman passive as used only when the result says so', () => {
    const { state } = duelScenario(['mage', 'swordsman', 'archer']);
    const used = applyCombatResult(state, { winner: 'b', hpA: -2, hpB: 1, indomitableUsedB: true });
    expect(used.state.players[1]!.passive.indomitableUsed).toBe(true);
    const unused = applyCombatResult(state, { winner: 'b', hpA: -2, hpB: 1 });
    expect(unused.state.players[1]!.passive.indomitableUsed).toBe(false);
  });

  it('ignores the flag for jobs without the passive', () => {
    const { state } = duelScenario(['mage', 'swordsman', 'archer']);
    const r = applyCombatResult(state, { winner: 'a', hpA: 3, hpB: -1, indomitableUsedA: true });
    expect(r.state.players[0]!.passive.indomitableUsed).toBe(false);
  });

  it('writes the challenger flag back after a dragon fight', () => {
    const { state } = dragonScenario(['swordsman', 'mage', 'ninja']);
    const r = applyCombatResult(state, { winner: 'a', hpA: 1, hpB: null, indomitableUsedA: true });
    expect(r.state.players[0]).toMatchObject({ hp: 1, passive: { indomitableUsed: true } });
  });
});

describe('external combat: dragon results', () => {
  it('a win ends the game for the challenger', () => {
    const { state } = dragonScenario(['archer', 'mage', 'ninja']);
    const r = applyCombatResult(state, { winner: 'a', hpA: 3, hpB: null });
    expect(r.events).toEqual([
      { type: 'CombatEnded', kind: 'dragonFight', winner: 0, loser: 'dragon', capReached: false },
      { type: 'GameEnded', outcome: { kind: 'dragon', winner: 0 } },
    ]);
    expect(r.state.players[0]!.hp).toBe(3);
    expect(r.state.players[0]!.coins).toBe(10);
    expect(eventsOf(r.events, 'EffectApplied')).toHaveLength(0);
    expect(r.state.pending).toBeNull();
    expect(r.state.combat).toBeNull();
  });

  it('a loss eliminates the challenger, destroys their assets and passes the turn', () => {
    const { state } = dragonScenario(['archer', 'mage', 'ninja']);
    const r = applyCombatResult(
      patch(state, (d) => void (d.players[0]!.coins = 30)),
      { winner: 'b', hpA: -4, hpB: null },
    );
    expect(r.events.slice(0, 2)).toEqual([
      { type: 'CombatEnded', kind: 'dragonFight', winner: 'dragon', loser: 0, capReached: false },
      { type: 'PlayerEliminated', seat: 0, by: 'dragon', round: 1 },
    ]);
    expect(eventsOf(r.events, 'LootTransferred')).toHaveLength(0);
    expect(r.state.players[0]).toMatchObject({ alive: false, coins: 0 });
    expect(r.state.pending).toEqual({ actor: 1, phase: 'PRE_ROLL' });
  });

  it('a loss with two players left crowns the other player', () => {
    const { state } = dragonScenario(['archer', 'mage']);
    const r = applyCombatResult(state, { winner: 'b', hpA: 0, hpB: null });
    expect(r.state.outcome).toEqual({ kind: 'lastSurvivor', winner: 1 });
  });
});

describe('external combat: validation', () => {
  const duel = () => duelScenario(['mage', 'berserker', 'swordsman']).state;
  const dragon = () => dragonScenario(['archer', 'mage', 'ninja']).state; // archer maxHp 39

  it.each<[string, () => GameState, unknown]>([
    ['an unknown winner side', duel, { winner: 'c', hpA: 5, hpB: 0 }],
    ['a winner below 1 hp', duel, { winner: 'a', hpA: 0, hpB: -1 }],
    ['a winner above maxHp', duel, { winner: 'b', hpA: 0, hpB: 50 }],
    ['a loser above maxHp', duel, { winner: 'a', hpA: 5, hpB: 50 }],
    ['a non-integer hp', duel, { winner: 'a', hpA: 5.5, hpB: 0 }],
    ['a NaN hp', duel, { winner: 'b', hpA: 0, hpB: Number.NaN }],
    ['a missing defender hp in a duel', duel, { winner: 'a', hpA: 5, hpB: null }],
    ['a defender hp in a dragon fight', dragon, { winner: 'a', hpA: 5, hpB: 10 }],
    ['a dragon-fight loser above maxHp', dragon, { winner: 'b', hpA: 40, hpB: null }],
  ])('rejects %s', (_, state, result) => {
    expect(() => applyCombatResult(state(), result as CombatResult)).toThrow(
      InvalidCombatResultError,
    );
  });

  it('accepts boundary hp values', () => {
    expect(() =>
      applyCombatResult(duel(), {
        winner: 'a',
        hpA: DEFAULT_RULES.jobs.mage.hp,
        hpB: DEFAULT_RULES.jobs.berserker.hp,
      }),
    ).not.toThrow();
    expect(() => applyCombatResult(duel(), { winner: 'b', hpA: -100, hpB: 1 })).not.toThrow();
  });

  it('rejects results and dice resolution when no fight is pending', () => {
    const idle = newGame(['mage', 'berserker'], 3, EXTERNAL_RULES);
    expect(() => applyCombatResult(idle, { winner: 'a', hpA: 5, hpB: 0 })).toThrow(
      InvalidCombatResultError,
    );
    expect(() => resolveCombatWithDice(idle)).toThrow(InvalidCombatResultError);
  });
});

describe('external combat: dice equivalence', () => {
  const jobs: JobId[] = ['swordsman', 'archer', 'mage'];

  it('resolveCombatWithDice reproduces the dice-mode duel exactly (events, state, rng)', () => {
    const edit = (d: GameState) => void (d.players[1]!.coins = 11);
    const dice = duelScenario(jobs, { rules: DICE_RULES, edit });
    const ext = duelScenario(jobs, { rules: EXTERNAL_RULES, edit });
    const settled = resolveCombatWithDice(deepFreeze(ext.state));
    expect(eventsOf(dice.events, 'CombatHit').length).toBeGreaterThan(0);
    expect([...ext.events, ...settled.events]).toEqual(dice.events);
    expect(withoutRules(settled.state)).toEqual(withoutRules(dice.state));
  });

  it('resolveCombatWithDice reproduces the dice-mode dragon fight exactly', () => {
    const dice = dragonScenario(jobs, DICE_RULES);
    const ext = dragonScenario(jobs, EXTERNAL_RULES);
    const settled = resolveCombatWithDice(ext.state);
    expect([...ext.events, ...settled.events]).toEqual(dice.events);
    expect(withoutRules(settled.state)).toEqual(withoutRules(dice.state));
  });
});
