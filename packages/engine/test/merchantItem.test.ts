import { applyAction, createGame, DEFAULT_RULES, type ItemId, withRules } from '../src/index';
import { cloneState } from '../src/state';
import { deepFreeze, eventsOf } from './helpers';
import { describe, expect, it } from 'vitest';

const setup = { seats: [{ job: 'swordsman' as const }, { job: 'archer' as const }] };

function visit(seed: number, tile: number, rules = DEFAULT_RULES) {
  const state = cloneState(createGame(setup, rules, seed));
  state.players[0]!.items.teleport = 1;
  deepFreeze(state);
  return applyAction(state, { type: 'USE_TELEPORT', tile });
}

describe('random item events', () => {
  it.each([
    [1, 'thief'],
    [2, 'shield'],
    [7, 'teleport'],
  ] as const)('merchant seed %i grants %s and reports the inventory result', (seed, expected) => {
    const first = visit(seed, 21);
    const repeated = visit(seed, 21);
    expect(repeated).toEqual(first);
    expect(first.events).toContainEqual({
      type: 'TileResolved',
      seat: 0,
      tile: 21,
      tileId: 'WANDERING_MERCHANT',
    });
    const grant = eventsOf(first.events, 'EffectApplied').find((e) => e.effect === 'randomItem');
    expect(grant).toEqual({
      type: 'EffectApplied',
      seat: 0,
      effect: 'randomItem',
      item: expected,
      delta: 1,
      after: first.state.players[0]!.items[expected],
    });
    const afterTeleport = { teleport: 0, shield: 0, thief: 0 };
    afterTeleport[expected] += 1;
    expect(first.state.players[0]!.items).toEqual(afterTeleport);
  });

  it('uses the same three-item grant for the lost bag mystery card', () => {
    const bag = DEFAULT_RULES.mysteryDeck.find((card) => card.id === 'LOST_BAG')!;
    const rules = withRules({ mysteryDeck: [bag] });
    const seen = new Set<ItemId>();
    for (const seed of [1, 2, 7, 8, 9, 10]) {
      const result = visit(seed, 17, rules);
      expect(result.events).toContainEqual({
        type: 'MysteryCardDrawn',
        seat: 0,
        cardId: 'LOST_BAG',
      });
      const grant = eventsOf(result.events, 'EffectApplied').find((e) => e.effect === 'randomItem');
      if (!grant?.item) throw new Error('lost bag did not report the granted item');
      seen.add(grant.item);
      expect(result.state.players[0]!.items[grant.item]).toBe(grant.after);
    }
    expect(seen).toEqual(new Set<ItemId>(['teleport', 'shield', 'thief']));
  });
});
