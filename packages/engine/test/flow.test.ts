import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  getLegalActions,
  withRules,
  type Action,
  type GameState,
} from '../src/index';
import { act, eventsOf, newGame, patch, seatOfJob, setPlayer } from './helpers';

const firstLegal = (s: GameState): Action => getLegalActions(s)[0]!;

/** Seat 0 gets a teleport so tests can move deterministically. */
const withTeleport = (s: GameState, seat = 0) =>
  patch(s, (d) => {
    d.players[seat]!.items.teleport = 1;
  });

const atRound = (s: GameState, round: number) =>
  patch(s, (d) => {
    d.round = round;
  });

describe('game setup', () => {
  it('creates the starting state from game-design §3', () => {
    const s = newGame(['swordsman', 'archer', 'mage', 'ninja'], 3);
    expect(s.players).toHaveLength(4);
    expect(new Set(s.players.map((p) => p.job)).size).toBe(4);
    for (const p of s.players) {
      expect(p.position).toBe(0);
      expect(p.coins).toBe(p.job === 'archer' ? 16 : 10);
      expect(p.items).toEqual({ teleport: 0, shield: 0, princeTotem: 0 });
      expect(p.hp).toBe(p.maxHp);
    }
    expect(s.round).toBe(1);
    expect(s.pending).toEqual({ actor: 0, phase: 'PRE_ROLL' });
    expect([...s.seatOrigin].sort()).toEqual([0, 1, 2, 3]);
  });

  it('is deterministic per seed and shuffles seat order', () => {
    const a = newGame(['swordsman', 'archer', 'mage', 'ninja'], 99);
    const b = newGame(['swordsman', 'archer', 'mage', 'ninja'], 99);
    expect(a).toEqual(b);
    const orders = new Set(
      Array.from({ length: 20 }, (_, i) =>
        newGame(['swordsman', 'archer', 'mage', 'ninja'], i).seatOrigin.join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('allows duplicate jobs while rejecting bad player counts', () => {
    expect(newGame(['mage', 'mage']).players.map((p) => p.job)).toEqual(['mage', 'mage']);
    expect(() => newGame(['mage'])).toThrow();
  });
});

describe('movement and tiles', () => {
  it('spins a 1-to-10 movement roulette independently of the combat die', () => {
    const values = Array.from({ length: 100 }, (_, seed) => {
      const { events } = act(newGame(['swordsman', 'archer'], seed), { type: 'ROLL_DICE' });
      return eventsOf(events, 'DiceRolled')[0]!.value;
    });
    expect(new Set(values)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(DEFAULT_RULES.combat.dieSides).toBe(6);
  });

  it('pays the start bonus when dice movement passes tile 0', () => {
    let s = newGame(['swordsman', 'archer'], 5);
    s = setPlayer(s, 0, { position: 23 });
    const { events } = act(s, { type: 'ROLL_DICE' });
    expect(eventsOf(events, 'StartBonus')).toHaveLength(1);
  });

  it('teleport walks clockwise, awards the crossed START bonus, and resolves only its destination', () => {
    let s = withTeleport(newGame(['swordsman', 'archer'], 5));
    s = setPlayer(s, 0, { position: 20, hp: 20 });
    const { state, events } = act(s, { type: 'USE_TELEPORT', tile: 3 });
    expect(eventsOf(events, 'Moved')).toEqual([
      { type: 'Moved', seat: 0, from: 20, to: 3, steps: 7, via: 'teleport' },
    ]);
    expect(eventsOf(events, 'StartBonus')).toHaveLength(1);
    expect(eventsOf(events, 'TileResolved')).toEqual([
      { type: 'TileResolved', seat: 0, tile: 3, tileId: 'TREASURE' },
    ]);
    expect(state.players[0]!.position).toBe(3);
    expect(state.players[0]!.coins).toBe(s.players[0]!.coins + 35 + 12);
    expect(state.players[0]!.hp).toBe(26);
    expect(state.players[0]!.items.teleport).toBe(0);
  });

  it('teleport to START earns its bonus while a route that stays before START does not', () => {
    const noCross = withTeleport(
      setPlayer(newGame(['swordsman', 'archer'], 5), 0, { position: 2 }),
    );
    const a = act(noCross, { type: 'USE_TELEPORT', tile: 9 });
    expect(eventsOf(a.events, 'StartBonus')).toHaveLength(0);
    expect(eventsOf(a.events, 'Moved')[0]).toMatchObject({ steps: 7, via: 'teleport' });

    const crossing = withTeleport(
      setPlayer(newGame(['swordsman', 'archer'], 5), 0, { position: 23 }),
    );
    const b = act(crossing, { type: 'USE_TELEPORT', tile: 0 });
    expect(eventsOf(b.events, 'StartBonus')).toHaveLength(1);
    expect(eventsOf(b.events, 'Moved')[0]).toMatchObject({ steps: 1, via: 'teleport' });
    expect(b.state.players[0]!.coins).toBe(crossing.players[0]!.coins + 35);
  });

  it('moves the herb heal to tile 9', () => {
    const s = withTeleport(setPlayer(newGame(['swordsman', 'archer'], 5), 0, { hp: 2 }));
    const { state, events } = act(s, { type: 'USE_TELEPORT', tile: 9 });
    expect(eventsOf(events, 'TileResolved')).toEqual([
      { type: 'TileResolved', seat: 0, tile: 9, tileId: 'HERB' },
    ]);
    expect(state.players[0]!.hp).toBe(10);
    expect(state.players[0]!.coins).toBe(s.players[0]!.coins);
  });

  it('event damage never drops hp below 1 and coins below 0', () => {
    let s = withTeleport(newGame(['swordsman', 'archer'], 5));
    s = setPlayer(s, 0, { hp: 2, coins: 1 });
    const trap = act(s, { type: 'USE_TELEPORT', tile: 8 }).state;
    expect(trap.players[0]!.hp).toBe(1);
    const s2 = withTeleport(setPlayer(newGame(['swordsman', 'archer'], 5), 0, { coins: 1 }));
    expect(act(s2, { type: 'USE_TELEPORT', tile: 4 }).state.players[0]!.coins).toBe(0);
  });

  it('converts unpaid coin loss into event HP damage', () => {
    const s = withTeleport(setPlayer(newGame(['swordsman', 'archer'], 5), 0, { coins: 2, hp: 20 }));
    const { state, events } = act(s, { type: 'USE_TELEPORT', tile: 4 });
    expect(state.players[0]).toMatchObject({ coins: 0, hp: 18 });
    expect(eventsOf(events, 'EffectApplied')).toContainEqual({
      type: 'EffectApplied',
      seat: 0,
      effect: 'coins',
      delta: -2,
      after: 0,
    });
    expect(eventsOf(events, 'EffectApplied')).toContainEqual({
      type: 'EffectApplied',
      seat: 0,
      effect: 'hp',
      delta: -2,
      after: 18,
      cause: 'coinShortfall',
    });
  });

  it('penalizes a zero-coin mystery loss without killing by event damage', () => {
    const rules = withRules({
      mysteryDeck: [
        { id: 'NO_COINS', name: '빈 주머니', effects: [{ kind: 'coins', amount: -6 }] },
      ],
    });
    const s = withTeleport(
      setPlayer(newGame(['swordsman', 'archer'], 5, rules), 0, { coins: 0, hp: 3 }),
    );
    const { state, events } = act(s, { type: 'USE_TELEPORT', tile: 17 });
    expect(state.players[0]).toMatchObject({ coins: 0, hp: 1 });
    expect(eventsOf(events, 'EffectApplied')).toContainEqual({
      type: 'EffectApplied',
      seat: 0,
      effect: 'hp',
      delta: -2,
      after: 1,
      cause: 'coinShortfall',
    });
  });

  it('training tile asks for a stat and raises it with its level', () => {
    const s = withTeleport(newGame(['swordsman', 'archer'], 5));
    const r1 = act(s, { type: 'USE_TELEPORT', tile: 5 });
    expect(r1.state.pending).toEqual({ actor: 0, phase: 'TRAINING_CHOICE' });
    const r2 = act(r1.state, { type: 'CHOOSE_TRAINING_STAT', stat: 'def' });
    expect(r2.state.players[0]!.def).toBe(s.players[0]!.def + 1);
    expect(r2.state.players[0]!.upgradeLevels.def).toBe(1);
  });

  it('shop arrival enables purchases in POST_MOVE', () => {
    let s = withTeleport(newGame(['swordsman', 'archer'], 5));
    s = setPlayer(s, 0, { coins: 20 });
    const r1 = act(s, { type: 'USE_TELEPORT', tile: 6 });
    expect(r1.state.turn.canBuy).toBe(true);
    const r2 = act(r1.state, { type: 'BUY_ITEM', item: 'princeTotem' });
    expect(r2.state.players[0]!.items.princeTotem).toBe(1);
    expect(r2.state.players[0]!.coins).toBe(5);
  });

  it('waits at an unaffordable shop so the visit can be shown', () => {
    const s = setPlayer(withTeleport(newGame(['swordsman', 'archer'], 5)), 0, { coins: 0 });
    const landing = act(s, { type: 'USE_TELEPORT', tile: 6 });
    expect(eventsOf(landing.events, 'TileResolved')).toEqual([
      { type: 'TileResolved', seat: 0, tile: 6, tileId: 'SHOP' },
    ]);
    expect(landing.state.turn.canBuy).toBe(true);
    expect(landing.state.pending).toEqual({ actor: 0, phase: 'POST_MOVE' });
    expect(getLegalActions(landing.state)).toEqual([{ type: 'END_TURN' }]);
    expect(act(landing.state, { type: 'END_TURN' }).state.current).toBe(1);
  });

  it('upgrade cost escalates with level', () => {
    let s = setPlayer(newGame(['swordsman', 'archer'], 5), 0, { coins: 100 });
    const atk0 = s.players[0]!.atk;
    s = act(s, { type: 'UPGRADE', stat: 'atk' }).state;
    s = act(s, { type: 'UPGRADE', stat: 'atk' }).state;
    expect(s.players[0]!.atk).toBe(atk0 + 2);
    expect(s.players[0]!.coins).toBe(100 - 3 - 4);
    const hp = act(s, { type: 'UPGRADE', stat: 'maxHp' }).state.players[0]!;
    expect(hp.maxHp - hp.hp).toBe(0);
  });

  it('limits paid upgrades to three across PRE_ROLL and POST_MOVE, then resets next turn', () => {
    const rules = withRules({
      board: DEFAULT_RULES.board.map((tile) => ({ ...tile, safe: true })),
    });
    let s = setPlayer(withTeleport(newGame(['swordsman', 'archer'], 5, rules)), 0, {
      coins: 100,
    });
    s = act(s, { type: 'UPGRADE', stat: 'atk' }).state;
    s = act(s, { type: 'UPGRADE', stat: 'def' }).state;
    expect(s.turn.paidUpgradesUsed).toBe(2);
    s = act(s, { type: 'USE_TELEPORT', tile: 6 }).state;
    expect(s.pending?.phase).toBe('POST_MOVE');
    s = act(s, { type: 'UPGRADE', stat: 'maxHp' }).state;
    expect(s.turn.paidUpgradesUsed).toBe(3);
    expect(getLegalActions(s).some((a) => a.type === 'UPGRADE')).toBe(false);
    expect(() => act(s, { type: 'UPGRADE', stat: 'atk' })).toThrow(/illegal action/);
    s = act(s, { type: 'END_TURN' }).state;
    s = act(s, { type: 'ROLL_DICE' }).state;
    s = act(s, { type: 'END_TURN' }).state;
    expect(s.current).toBe(0);
    expect(s.turn.paidUpgradesUsed).toBe(0);
    expect(getLegalActions(s).some((a) => a.type === 'UPGRADE')).toBe(true);
  });

  it('does not count free training against the paid upgrade limit', () => {
    let s = setPlayer(withTeleport(newGame(['swordsman', 'archer'], 5)), 0, {
      coins: 100,
      items: { teleport: 2, shield: 0, princeTotem: 0 },
    });
    for (const stat of ['atk', 'def', 'maxHp'] as const) {
      s = act(s, { type: 'UPGRADE', stat }).state;
    }
    const trained = act(s, { type: 'USE_TELEPORT', tile: 5 }).state;
    expect(trained.pending?.phase).toBe('TRAINING_CHOICE');
    s = act(trained, { type: 'CHOOSE_TRAINING_STAT', stat: 'def' }).state;
    expect(s.players[0]!.upgradeLevels.def).toBe(2);
    expect(s.turn.paidUpgradesUsed).toBe(3);
    expect(getLegalActions(s).some((a) => a.type === 'UPGRADE')).toBe(false);
  });

  it('applies the blacksmith DEF bonus immediately on landing', () => {
    const before = withTeleport(newGame(['swordsman', 'archer'], 5));
    const defBefore = before.players[0]!.def;
    const landing = act(before, { type: 'USE_TELEPORT', tile: 11 });
    expect(landing.state.pending?.phase).toBe('POST_MOVE');
    expect(landing.state.players[0]!.def).toBe(defBefore + 1);
    expect(eventsOf(landing.events, 'EffectApplied')).toContainEqual({
      type: 'EffectApplied',
      seat: 0,
      effect: 'stat',
      stat: 'def',
      delta: 1,
      after: defBefore + 1,
    });
    expect(landing.state.players[0]!.upgradeLevels.def).toBe(0);
  });

  it('ninja move choice is available every other own turn, including after choosing zero', () => {
    const rules = withRules({
      board: DEFAULT_RULES.board.map((tile) => ({ ...tile, safe: true, effects: [] })),
    });
    let s = newGame(['ninja', 'mage'], 11, rules);
    const ninja = seatOfJob(s, 'ninja');
    s = patch(s, (d) => {
      d.current = ninja;
      d.pending = { actor: ninja, phase: 'PRE_ROLL' };
    });
    const nextNinjaTurn = (state: GameState): GameState => {
      let next = act(state, firstLegal(state)).state;
      while (next.pending?.phase !== 'PRE_ROLL' || next.current !== ninja) {
        next = act(next, firstLegal(next)).state;
      }
      return next;
    };

    s = act(s, { type: 'ROLL_DICE' }).state;
    expect(s.pending?.phase).toBe('MOVE_ADJUST');
    s = act(s, { type: 'ADJUST_MOVE', delta: 1 }).state;
    expect(s.players[ninja]!.passive.ninjaCooldown).toBe(2);

    s = nextNinjaTurn(s);
    expect(s.players[ninja]!.passive.ninjaCooldown).toBe(1);
    s = act(s, { type: 'ROLL_DICE' }).state;
    expect(s.pending?.phase).not.toBe('MOVE_ADJUST');

    s = nextNinjaTurn(s);
    expect(s.players[ninja]!.passive.ninjaCooldown).toBe(0);
    s = act(s, { type: 'ROLL_DICE' }).state;
    expect(s.pending?.phase).toBe('MOVE_ADJUST');
    s = act(s, { type: 'ADJUST_MOVE', delta: 0 }).state;
    expect(s.players[ninja]!.passive.ninjaCooldown).toBe(2);

    s = nextNinjaTurn(s);
    expect(s.players[ninja]!.passive.ninjaCooldown).toBe(1);
    s = act(s, { type: 'ROLL_DICE' }).state;
    expect(s.pending?.phase).not.toBe('MOVE_ADJUST');

    s = nextNinjaTurn(s);
    s = act(s, { type: 'ROLL_DICE' }).state;
    expect(s.pending?.phase).toBe('MOVE_ADJUST');
  });

  it('counts a resting ninja turn toward the move-adjust cooldown', () => {
    const rules = withRules({
      board: DEFAULT_RULES.board.map((tile) => ({ ...tile, safe: true, effects: [] })),
    });
    let s = newGame(['ninja', 'mage'], 11, rules);
    const ninja = seatOfJob(s, 'ninja');
    s = patch(s, (d) => {
      d.current = ninja;
      d.pending = { actor: ninja, phase: 'PRE_ROLL' };
    });
    s = act(s, { type: 'ROLL_DICE' }).state;
    s = act(s, { type: 'ADJUST_MOVE', delta: 1 }).state;
    s = patch(s, (d) => {
      d.players[ninja]!.skipNextTurn = true;
    });
    while (s.pending?.phase !== 'PRE_ROLL' || !s.turn.resting || s.current !== ninja) {
      s = act(s, firstLegal(s)).state;
    }
    expect(s.players[ninja]!.passive.ninjaCooldown).toBe(1);
    expect(getLegalActions(s)).not.toContainEqual({ type: 'ROLL_DICE' });
    s = act(s, { type: 'END_TURN' }).state;
    while (s.pending?.phase !== 'PRE_ROLL' || s.current !== ninja) {
      s = act(s, firstLegal(s)).state;
    }
    expect(s.players[ninja]!.passive.ninjaCooldown).toBe(0);
    expect(act(s, { type: 'ROLL_DICE' }).state.pending?.phase).toBe('MOVE_ADJUST');
  });
});

describe('pvp', () => {
  const duelSetup = (shield0: number, shield1: number, round = 4) => {
    let s = withTeleport(atRound(newGame(['swordsman', 'archer'], 8), round));
    s = setPlayer(s, 1, { position: 9 });
    s = patch(s, (d) => {
      d.players[0]!.items.shield = shield0;
      d.players[1]!.items.shield = shield1;
    });
    return s;
  };

  it('starts a duel when two players meet in round two without shields', () => {
    const { events, state } = act(duelSetup(0, 0, 2), { type: 'USE_TELEPORT', tile: 9 });
    expect(eventsOf(events, 'CombatStarted')).toHaveLength(0);
    expect(eventsOf(events, 'PvpTriggered')).toHaveLength(1);
    expect(state.pending).toEqual({ actor: 0, phase: 'CHOOSE_PVP_TARGET' });
    expect(state.players.every((p) => p.alive)).toBe(true);
  });

  it('starts a duel when two players meet on START without shields', () => {
    const s = patch(withTeleport(duelSetup(0, 0)), (d) => {
      d.players[0]!.position = 5;
      d.players[1]!.position = 0;
    });
    const { state, events } = act(s, { type: 'USE_TELEPORT', tile: 0 });
    expect(eventsOf(events, 'PvpTriggered')).toHaveLength(1);
    expect(state.pending).toEqual({ actor: 0, phase: 'CHOOSE_PVP_TARGET' });
  });

  it('waits for confirmation even when there is exactly one PvP target', () => {
    const landing = act(duelSetup(0, 0, 3), { type: 'USE_TELEPORT', tile: 9 });
    expect(landing.state.pending).toEqual({ actor: 0, phase: 'CHOOSE_PVP_TARGET' });
    expect(landing.state.pvp).toEqual({
      arriver: 0,
      candidates: [1],
      target: null,
      stage: null,
    });
    expect(getLegalActions(landing.state)).toEqual([{ type: 'CHOOSE_PVP_TARGET', target: 1 }]);
    expect(eventsOf(landing.events, 'CombatStarted')).toHaveLength(0);
    const confirmed = act(landing.state, { type: 'CHOOSE_PVP_TARGET', target: 1 });
    expect(eventsOf(confirmed.events, 'PvpTargetChosen')).toEqual([
      { type: 'PvpTargetChosen', arriver: 0, target: 1 },
    ]);
    expect(confirmed.state.pending).toEqual({ actor: 1, phase: 'SHIELD_DECISION' });
    expect(getLegalActions(confirmed.state)).toEqual([{ type: 'SHIELD_DECISION', use: false }]);
    expect(eventsOf(confirmed.events, 'CombatStarted')).toHaveLength(0);
    const started = act(confirmed.state, { type: 'SHIELD_DECISION', use: false });
    expect(eventsOf(started.events, 'CombatStarted')).toHaveLength(1);
  });

  it('asks the arriver first, then the defender, for shields', () => {
    const landing = act(duelSetup(1, 1), { type: 'USE_TELEPORT', tile: 9 });
    const r1 = act(landing.state, { type: 'CHOOSE_PVP_TARGET', target: 1 });
    expect(r1.state.pending).toEqual({ actor: 0, phase: 'SHIELD_DECISION' });
    const r2 = act(r1.state, { type: 'SHIELD_DECISION', use: false });
    expect(r2.state.pending).toEqual({ actor: 1, phase: 'SHIELD_DECISION' });
    const r3 = act(r2.state, { type: 'SHIELD_DECISION', use: true });
    expect(eventsOf(r3.events, 'ShieldUsed')).toEqual([
      { type: 'ShieldUsed', seat: 1, against: 0 },
    ]);
    expect(r3.state.players[1]!.items.shield).toBe(0);
    expect(r3.state.players.every((p) => p.alive)).toBe(true);
    expect(r3.state.players[0]!.hp).toBe(r3.state.players[0]!.maxHp);
  });

  it('resolves a dice duel with loot, bonus coins, and full HP for the winner', () => {
    let s = duelSetup(0, 0);
    s = patch(s, (d) => {
      d.players[1]!.coins = 13;
      d.players[1]!.items.teleport = 2;
      d.players[0]!.coins = 9;
    });
    const landing = act(s, { type: 'USE_TELEPORT', tile: 9 });
    const confirmed = act(landing.state, { type: 'CHOOSE_PVP_TARGET', target: 1 });
    const { state, events } = act(confirmed.state, { type: 'SHIELD_DECISION', use: false });
    const eliminated = eventsOf(events, 'PlayerEliminated');
    expect(eliminated).toHaveLength(1);
    expect(state.outcome?.kind).toBe('lastSurvivor');
    const loot = eventsOf(events, 'LootTransferred')[0]!;
    const loserCoins = loot.from === 1 ? 13 : 9;
    expect(loot.coins).toBe(Math.floor(loserCoins / 2));
    const winner = state.players[loot.to]!;
    expect(winner.hp).toBe(winner.maxHp);
    expect(eventsOf(events, 'EffectApplied')).toContainEqual({
      type: 'EffectApplied',
      seat: loot.to,
      effect: 'coins',
      delta: 30,
      after: winner.coins,
    });
    expect(state.pending).toBeNull();
  });

  it('lets the arriver choose among coexisting players', () => {
    let s = withTeleport(atRound(newGame(['swordsman', 'archer', 'mage'], 8), 4));
    s = patch(s, (d) => {
      d.players[1]!.position = 9;
      d.players[2]!.position = 9;
      for (const p of d.players) p.items.shield = 0;
    });
    const r = act(s, { type: 'USE_TELEPORT', tile: 9 });
    expect(r.state.pending).toEqual({ actor: 0, phase: 'CHOOSE_PVP_TARGET' });
    expect(getLegalActions(r.state)).toEqual([
      { type: 'CHOOSE_PVP_TARGET', target: 1 },
      { type: 'CHOOSE_PVP_TARGET', target: 2 },
    ]);
    const after = act(r.state, { type: 'CHOOSE_PVP_TARGET', target: 2 });
    expect(after.state.pending).toEqual({ actor: 2, phase: 'SHIELD_DECISION' });
    const resolved = act(after.state, { type: 'SHIELD_DECISION', use: false });
    expect(eventsOf(resolved.events, 'PlayerEliminated')).toHaveLength(1);
  });
});

describe('items', () => {
  it('teleport cannot target the current tile', () => {
    const s = withTeleport(newGame(['swordsman', 'archer'], 5));
    const tiles = getLegalActions(s).filter((a) => a.type === 'USE_TELEPORT');
    expect(tiles).toHaveLength(23);
  });
});

describe('rest turn', () => {
  it('blocks only movement and consumes the flag at turn end', () => {
    let s = withTeleport(newGame(['swordsman', 'archer'], 5));
    s = patch(s, (d) => {
      d.players[0]!.skipNextTurn = true;
      d.turn.resting = true;
    });
    const types = getLegalActions(s).map((a) => a.type);
    expect(types).toContain('END_TURN');
    expect(types).toContain('CHALLENGE_DRAGON');
    expect(types).toContain('UPGRADE');
    expect(types).not.toContain('ROLL_DICE');
    expect(types).not.toContain('USE_TELEPORT');
    const r = act(s, { type: 'END_TURN' });
    expect(eventsOf(r.events, 'TurnSkipped')).toHaveLength(1);
    expect(r.state.players[0]!.skipNextTurn).toBe(false);
    expect(r.state.current).toBe(1);
  });
});

describe('dragon and game end', () => {
  it('a strong challenger slays the dragon and wins', () => {
    const s = setPlayer(newGame(['swordsman', 'archer'], 5), 0, {
      atk: 60,
      def: 60,
      hp: 500,
      maxHp: 500,
    });
    const r = act(s, { type: 'CHALLENGE_DRAGON' });
    expect(r.state.outcome).toEqual({ kind: 'dragon', winner: 0 });
    expect(r.state.pending).toBeNull();
  });

  it('a failed challenge eliminates the challenger and destroys their assets', () => {
    let s = newGame(['swordsman', 'archer', 'mage'], 5);
    s = setPlayer(s, 0, { coins: 30 });
    const r = act(s, { type: 'CHALLENGE_DRAGON' });
    expect(r.state.players[0]!.alive).toBe(false);
    expect(r.state.players[0]!.coins).toBe(0);
    expect(eventsOf(r.events, 'LootTransferred')).toHaveLength(0);
    expect(r.state.current).toBe(1);
    expect(r.state.outcome).toBeNull();
  });

  it('the last remaining player wins when the other fails against the dragon', () => {
    const r = act(newGame(['mage', 'archer'], 5), { type: 'CHALLENGE_DRAGON' });
    expect(r.state.outcome).toEqual({ kind: 'lastSurvivor', winner: 1 });
  });

  it('ends in a draw after maxRounds', () => {
    let s = newGame(['swordsman', 'archer'], 5, withRules({ maxRounds: 1 }));
    for (let i = 0; i < 50 && s.pending; i++) s = act(s, firstLegal(s)).state;
    expect(s.outcome).toEqual({ kind: 'draw', winner: null });
  });
});
