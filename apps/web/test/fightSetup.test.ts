import {
  DEFAULT_RULES,
  createGame,
  toPublicState,
  type PublicGameState,
} from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import { buildFightSetup, fightSides, isBotOnlyFight } from '../src/services/fight/fightSetup';

function stateWith(edit: (s: PublicGameState) => PublicGameState): PublicGameState {
  const s = toPublicState(
    createGame(
      { seats: [{ job: 'swordsman' }, { job: 'archer' }, { job: 'ninja' }] },
      DEFAULT_RULES,
      7,
    ),
  );
  return edit(s);
}

describe('fight setup from board stats', () => {
  it('copies job, hp, maxHp, atk and def 1:1 and flags Last Stand only for an unused swordsman', () => {
    const s = stateWith((x) => ({
      ...x,
      players: x.players.map((p) => (p.job === 'swordsman' ? { ...p, hp: 17, atk: 9 } : p)),
    }));
    const sword = s.players.find((p) => p.job === 'swordsman')!;
    const archer = s.players.find((p) => p.job === 'archer')!;
    const setup = buildFightSetup(s, { kind: 'duel', a: sword.seat, b: archer.seat });
    expect(setup.kind).toBe('duel');
    expect(setup.a).toEqual({
      job: 'swordsman',
      hp: 17,
      maxHp: sword.maxHp,
      atk: 9,
      def: sword.def,
      indomitableAvailable: true,
    });
    expect(setup.b).toEqual({
      job: 'archer',
      hp: archer.hp,
      maxHp: archer.maxHp,
      atk: archer.atk,
      def: archer.def,
      indomitableAvailable: false,
    });
  });

  it('drops Last Stand once the board passive was used', () => {
    const s = stateWith((x) => ({
      ...x,
      players: x.players.map((p) =>
        p.job === 'swordsman' ? { ...p, passive: { ...p.passive, indomitableUsed: true } } : p,
      ),
    }));
    const sword = s.players.find((p) => p.job === 'swordsman')!;
    const ninja = s.players.find((p) => p.job === 'ninja')!;
    expect(
      buildFightSetup(s, { kind: 'duel', a: ninja.seat, b: sword.seat }).b?.indomitableAvailable,
    ).toBe(false);
  });

  it('builds a dragon fight from the board rules', () => {
    const s = stateWith((x) => x);
    const setup = buildFightSetup(s, { kind: 'dragonFight', a: 0, b: null });
    expect(setup.kind).toBe('dragonFight');
    expect(setup.b).toBeNull();
    expect(setup.dragon).toEqual({
      hp: DEFAULT_RULES.dragon.hp,
      atk: DEFAULT_RULES.dragon.atk,
      def: DEFAULT_RULES.dragon.def,
    });
  });
});

describe('fight controls', () => {
  const humans =
    (...seats: number[]) =>
    (seat: number) =>
      seats.includes(seat);

  it('hot-seat: arriver = P1 keys (left), defender = P2 keys', () => {
    expect(fightSides({ kind: 'duel', a: 2, b: 0 }, humans(0, 2))).toEqual([
      { side: 'a', seat: 2, control: 'keyboard-p1' },
      { side: 'b', seat: 0, control: 'keyboard-p2' },
    ]);
  });

  it('one human against a bot or the dragon uses the solo keys', () => {
    expect(fightSides({ kind: 'duel', a: 0, b: 1 }, humans(0)).map((s) => s.control)).toEqual([
      'keyboard-solo',
      'bot',
    ]);
    expect(fightSides({ kind: 'duel', a: 1, b: 0 }, humans(0)).map((s) => s.control)).toEqual([
      'bot',
      'keyboard-solo',
    ]);
    expect(fightSides({ kind: 'dragonFight', a: 0, b: null }, humans(0))).toEqual([
      { side: 'a', seat: 0, control: 'keyboard-solo' },
      { side: 'b', seat: null, control: 'dragon' },
    ]);
  });

  it('bot-only fights are recognised', () => {
    expect(isBotOnlyFight(fightSides({ kind: 'duel', a: 1, b: 2 }, humans(0)))).toBe(true);
    expect(isBotOnlyFight(fightSides({ kind: 'dragonFight', a: 1, b: null }, humans(0)))).toBe(
      true,
    );
    expect(isBotOnlyFight(fightSides({ kind: 'dragonFight', a: 0, b: null }, humans(0)))).toBe(
      false,
    );
  });
});
