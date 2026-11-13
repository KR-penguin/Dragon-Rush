import { describe, expect, it } from 'vitest';
import { applyCombatResult, resolveCombatWithDice, withRules, type GameState } from '../src/index';
import { act, deepFreeze, eventsOf, EXTERNAL_RULES, newGame, patch } from './helpers';

function duelConfirmation(rules = EXTERNAL_RULES) {
  const before = patch(newGame(['mage', 'archer', 'ninja'], 8, rules), (draft) => {
    draft.players[0]!.items.teleport = 1;
    draft.players[1]!.position = 9;
    draft.players[2]!.position = 12;
    for (const player of draft.players) {
      player.items.princeTotem = 2;
      player.hp = 7;
    }
  });
  const landed = act(deepFreeze(before), { type: 'USE_TELEPORT', tile: 9 }).state;
  return act(deepFreeze(landed), { type: 'CHOOSE_PVP_TARGET', target: 1 }).state;
}

const withoutRules = (state: GameState) => ({ ...state, rules: null });

describe('prince totem', () => {
  it('consumes exactly one per duel participant and fills the increased maximum before combat', () => {
    const before = duelConfirmation();
    const { state, events } = act(deepFreeze(before), { type: 'SHIELD_DECISION', use: false });
    expect(state.pending?.phase).toBe('COMBAT');
    for (const seat of [0, 1]) {
      const player = state.players[seat]!;
      expect(player.maxHp).toBe(before.players[seat]!.maxHp + 15);
      expect(player.hp).toBe(player.maxHp);
      expect(player.items.princeTotem).toBe(1);
      expect(eventsOf(events, 'ItemUsed')).toContainEqual({
        type: 'ItemUsed',
        seat,
        item: 'princeTotem',
      });
      expect(eventsOf(events, 'EffectApplied')).toContainEqual({
        type: 'EffectApplied',
        seat,
        effect: 'maxHp',
        delta: 15,
        after: player.maxHp,
      });
      expect(eventsOf(events, 'EffectApplied')).toContainEqual({
        type: 'EffectApplied',
        seat,
        effect: 'hp',
        delta: player.maxHp - 7,
        after: player.hp,
      });
    }
    expect(state.players[2]).toEqual(before.players[2]);
    expect(events.at(-1)?.type).toBe('CombatStarted');
    expect(before.players[0]!.items.princeTotem).toBe(2);
    expect(before.players[0]!.hp).toBe(7);
  });

  it('triggers for the dragon challenger and leaves everyone else alone', () => {
    const before = patch(newGame(['mage', 'archer', 'ninja'], 8, EXTERNAL_RULES), (draft) => {
      for (const player of draft.players) {
        player.items.princeTotem = 2;
        player.hp = 1;
      }
    });
    const { state, events } = act(deepFreeze(before), { type: 'CHALLENGE_DRAGON' });
    expect(state.players[0]).toMatchObject({
      maxHp: before.players[0]!.maxHp + 15,
      hp: before.players[0]!.maxHp + 15,
      items: { princeTotem: 1 },
    });
    expect(state.players.slice(1)).toEqual(before.players.slice(1));
    expect(eventsOf(events, 'ItemUsed')).toHaveLength(1);
  });

  it('does not consume totems or heal either participant when a shield cancels the duel', () => {
    const before = patch(duelConfirmation(), (draft) => {
      draft.players[1]!.items.shield = 1;
    });
    const { state, events } = act(deepFreeze(before), { type: 'SHIELD_DECISION', use: true });
    for (const seat of [0, 1]) {
      expect(state.players[seat]!.items.princeTotem).toBe(2);
      expect(state.players[seat]!.maxHp).toBe(before.players[seat]!.maxHp);
    }
    expect(state.players[1]!.hp).toBe(7);
    expect(eventsOf(events, 'ItemUsed').map((event) => event.item)).toEqual(['shield']);
    expect(eventsOf(events, 'CombatStarted')).toEqual([]);
  });

  it('restores the original maximum after combat and consumes another stack only on the next fight', () => {
    const before = patch(newGame(['mage', 'archer', 'ninja'], 8, EXTERNAL_RULES), (draft) => {
      draft.players[0]!.items.princeTotem = 2;
      draft.players[0]!.items.teleport = 1;
      draft.players[1]!.position = 9;
      draft.players[2]!.position = 12;
    });
    let state = act(before, { type: 'USE_TELEPORT', tile: 9 }).state;
    state = act(state, { type: 'CHOOSE_PVP_TARGET', target: 1 }).state;
    state = act(state, { type: 'SHIELD_DECISION', use: false }).state;
    state = applyCombatResult(deepFreeze(state), { winner: 'a', hpA: 3, hpB: 0 }).state;
    expect(state.players[0]!.maxHp).toBe(before.players[0]!.maxHp);
    expect(state.players[0]!.hp).toBe(before.players[0]!.maxHp);
    expect(state.players[0]!.items.princeTotem).toBe(1);
    state = act(state, { type: 'END_TURN' }).state;
    state = patch(state, (draft) => {
      draft.turn.resting = true;
    });
    state = act(state, { type: 'END_TURN' }).state;
    expect(state.current).toBe(0);
    state = act(deepFreeze(state), { type: 'CHALLENGE_DRAGON' }).state;
    expect(state.players[0]!.maxHp).toBe(before.players[0]!.maxHp + 15);
    expect(state.players[0]!.hp).toBe(state.players[0]!.maxHp);
    expect(state.players[0]!.items.princeTotem).toBe(0);
  });

  it.each(['a', 'b'] as const)(
    'restores both duel participants after winner %s is resolved',
    (winner) => {
      const before = duelConfirmation();
      const started = act(deepFreeze(before), { type: 'SHIELD_DECISION', use: false }).state;
      const { state, events } = applyCombatResult(deepFreeze(started), {
        winner,
        hpA: winner === 'a' ? 3 : 0,
        hpB: winner === 'b' ? 3 : 0,
      });
      for (const seat of [0, 1]) {
        expect(state.players[seat]!.maxHp).toBe(before.players[seat]!.maxHp);
        expect(eventsOf(events, 'EffectApplied')).toContainEqual({
          type: 'EffectApplied',
          seat,
          effect: 'maxHp',
          delta: -15,
          after: before.players[seat]!.maxHp,
        });
      }
      expect(state.players[winner === 'a' ? 0 : 1]!.hp).toBe(
        before.players[winner === 'a' ? 0 : 1]!.maxHp,
      );
    },
  );

  it.each([
    ['a', true],
    ['a', false],
    ['b', false],
  ] as const)('restores the dragon challenger after winner %s, high hp %s', (winner, highHp) => {
    const before = patch(newGame(['mage', 'archer', 'ninja'], 8, EXTERNAL_RULES), (draft) => {
      draft.players[0]!.items.princeTotem = 1;
    });
    const started = act(deepFreeze(before), { type: 'CHALLENGE_DRAGON' }).state;
    const { state, events } = applyCombatResult(deepFreeze(started), {
      winner,
      hpA: winner === 'b' ? 0 : highHp ? started.players[0]!.maxHp : 3,
      hpB: null,
    });
    expect(state.players[0]!.maxHp).toBe(before.players[0]!.maxHp);
    expect(state.players[0]!.hp).toBe(winner === 'b' ? 0 : highHp ? before.players[0]!.maxHp : 3);
    expect(eventsOf(events, 'EffectApplied')).toContainEqual({
      type: 'EffectApplied',
      seat: 0,
      effect: 'hp',
      delta: highHp ? -15 : 0,
      after: winner === 'b' ? 0 : highHp ? before.players[0]!.maxHp : 3,
    });
  });

  it('uses the rules-configured bonus and leaves a player without a totem unchanged', () => {
    const rules = withRules({ princeTotemMaxHpBonus: 23 }, EXTERNAL_RULES);
    const before = patch(duelConfirmation(rules), (draft) => {
      draft.players[1]!.items.princeTotem = 0;
    });
    const { state } = act(deepFreeze(before), { type: 'SHIELD_DECISION', use: false });
    expect(state.players[0]!.maxHp).toBe(before.players[0]!.maxHp + 23);
    expect(state.players[0]!.hp).toBe(state.players[0]!.maxHp);
    expect(state.players[1]).toEqual(before.players[1]);
  });

  it('applies the same single activation in direct dice and external dice fallback modes', () => {
    const before = duelConfirmation();
    const diceBefore = {
      ...before,
      rules: withRules({ combat: { ...before.rules.combat, mode: 'dice' } }, before.rules),
    };
    const dice = act(deepFreeze(diceBefore), { type: 'SHIELD_DECISION', use: false });
    const pending = act(deepFreeze(before), { type: 'SHIELD_DECISION', use: false });
    const resolved = resolveCombatWithDice(deepFreeze(pending.state));
    expect([...pending.events, ...resolved.events]).toEqual(dice.events);
    expect(withoutRules(resolved.state)).toEqual(withoutRules(dice.state));
    expect(eventsOf(resolved.events, 'ItemUsed')).toEqual([]);
    expect(eventsOf(pending.events, 'ItemUsed')).toHaveLength(2);
  });
});
