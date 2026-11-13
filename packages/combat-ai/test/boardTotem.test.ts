import { applyAction, applyCombatResult, createGame, withRules } from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import { boardCombatSetup } from '../src/board';

describe('Prince Totem board-to-combat setup', () => {
  it('passes boosted full HP into a dragon fight and restores the board maximum afterward', () => {
    const rules = withRules({ startingItems: { princeTotem: 2 } });
    const initial = createGame({ seats: [{ job: 'mage' }, { job: 'ninja' }] }, rules, 73);
    initial.players[0]!.hp = 1;
    const originalMaxHp = initial.players[0]!.maxHp;
    const fighting = applyAction(initial, { type: 'CHALLENGE_DRAGON' }).state;
    const setup = boardCombatSetup(fighting);
    expect(setup.a).toMatchObject({
      hp: originalMaxHp + rules.princeTotemMaxHpBonus,
      maxHp: originalMaxHp + rules.princeTotemMaxHpBonus,
    });
    expect(fighting.players[0]!.items.princeTotem).toBe(1);
    const finished = applyCombatResult(fighting, {
      winner: 'a',
      hpA: setup.a.hp,
      hpB: null,
    }).state;
    expect(finished.players[0]).toMatchObject({ hp: originalMaxHp, maxHp: originalMaxHp });
    expect(initial.players[0]).toMatchObject({ hp: 1, maxHp: originalMaxHp });
    expect(initial.players[0]!.items.princeTotem).toBe(2);
  });

  it("passes each duelist's own boosted HP into the shared real-time setup", () => {
    const rules = withRules({ startingItems: { princeTotem: 1 } });
    const initial = createGame({ seats: [{ job: 'swordsman' }, { job: 'archer' }] }, rules, 29);
    const originals = initial.players.map((p) => p.maxHp);
    initial.players[0]!.hp = 2;
    initial.players[1]!.hp = 3;
    initial.pvp = { arriver: 0, candidates: [1], target: 1, stage: 'defender' };
    initial.pending = { actor: 1, phase: 'SHIELD_DECISION' };
    const fighting = applyAction(initial, { type: 'SHIELD_DECISION', use: false }).state;
    const setup = boardCombatSetup(fighting);
    expect(setup.a.hp).toBe(originals[0]! + rules.princeTotemMaxHpBonus);
    expect(setup.a.maxHp).toBe(setup.a.hp);
    expect(setup.b?.hp).toBe(originals[1]! + rules.princeTotemMaxHpBonus);
    expect(setup.b?.maxHp).toBe(setup.b?.hp);
    expect(fighting.players.map((p) => p.items.princeTotem)).toEqual([0, 0]);
  });
});
