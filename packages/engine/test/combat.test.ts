import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, resolveCombat, type Fighter } from '../src/index';
import { scripted } from './helpers';

const R = DEFAULT_RULES;
const fighter = (ref: number | 'dragon', job: Fighter['job'], hp: number, atk: number, def: number, extra: Partial<Fighter> = {}): Fighter => ({
  ref,
  job,
  hp,
  maxHp: hp,
  atk,
  def,
  indomitableAvailable: job === 'swordsman',
  ...extra,
});
const hits = (events: ReturnType<typeof resolveCombat>['events']) =>
  events.filter((e) => e.type === 'CombatHit').map((e) => (e.type === 'CombatHit' ? e.damage : 0));

describe('resolveCombat', () => {
  it('reproduces the game-design §9 example opening (archer strikes first, mage pierces)', () => {
    const mage = fighter(0, 'mage', 38, 4, 5);
    const archer = fighter(1, 'archer', 39, 6, 6);
    const dice = [4, 3, 1, 6, ...Array.from({ length: 400 }, () => 6)];
    const result = resolveCombat(R, mage, archer, { kind: 'duel', defaultFirst: 'a', capTieWinner: 'a' }, scripted(dice));
    expect(hits(result.events).slice(0, 4)).toEqual([8, 4, 2, 7]);
    const started = result.events[0];
    expect(started).toMatchObject({ type: 'CombatStarted', first: 1 });
  });

  it('applies dragon breath on every third dragon attack (def treated as 0)', () => {
    const p = fighter(0, 'berserker', 200, 1, 9);
    const dragon = fighter('dragon', null, 115, 10, 6);
    const result = resolveCombat(
      R,
      { ...p, maxHp: 200 },
      dragon,
      { kind: 'dragonFight', defaultFirst: 'a', capTieWinner: 'b', capLoser: 'a' },
      scripted(Array.from({ length: 400 }, () => 1)),
    );
    const dragonHits = result.events.filter((e) => e.type === 'CombatHit' && e.attacker === 'dragon');
    expect(dragonHits.slice(0, 3).map((e) => (e.type === 'CombatHit' ? [e.damage, e.breath] : []))).toEqual([
      [2, false],
      [2, false],
      [11, true],
    ]);
  });

  it('swordsman indomitable survives a lethal hit once', () => {
    const sw = fighter(0, 'swordsman', 5, 5, 0);
    const foe = fighter(1, 'berserker', 100, 20, 0);
    const result = resolveCombat(
      R,
      foe,
      sw,
      { kind: 'duel', defaultFirst: 'a', capTieWinner: 'a' },
      scripted(Array.from({ length: 10 }, () => 1)),
    );
    expect(result.events.some((e) => e.type === 'PassiveTriggered' && e.passive === 'indomitable')).toBe(true);
    expect(result.winner).toBe('a');
    expect(result.b.indomitableAvailable).toBe(false);
  });

  it('ninja evades on a d8 roll of 1 without consuming indomitable logic', () => {
    const ninja = fighter(0, 'ninja', 30, 4, 5);
    const foe = fighter(1, 'berserker', 49, 5, 5);
    const result = resolveCombat(
      R,
      foe,
      ninja,
      { kind: 'duel', defaultFirst: 'a', capTieWinner: 'a' },
      scripted([6, 1, ...Array.from({ length: 400 }, () => 6)]),
    );
    const first = result.events.find((e) => e.type === 'CombatHit');
    expect(first).toMatchObject({ damage: 0, evaded: true });
  });

  it('berserker rage multiplies atk by 1.3 when hp is at most half', () => {
    const bz = fighter(0, 'berserker', 20, 10, 0, { maxHp: 40 });
    const foe = fighter(1, 'mage', 300, 0, 0);
    const result = resolveCombat(R, bz, foe, { kind: 'duel', defaultFirst: 'a', capTieWinner: 'a' }, scripted(Array.from({ length: 200 }, () => 1)));
    expect(result.events.find((e) => e.type === 'CombatHit')).toMatchObject({ damage: 14, rage: true });
  });

  it('decides capped duels by hp ratio and capped dragon fights against the challenger', () => {
    const rules = { ...R, combat: { ...R.combat, maxExchanges: 1 } };
    const a = fighter(0, 'mage', 100, 0, 50);
    const b = fighter(1, 'berserker', 100, 0, 50, { hp: 90 });
    const duel = resolveCombat(rules, a, b, { kind: 'duel', defaultFirst: 'a', capTieWinner: 'b' }, scripted([1, 1]));
    expect(duel.capReached).toBe(true);
    expect(duel.winner).toBe('a');
    const fight = resolveCombat(rules, a, fighter('dragon', null, 115, 0, 50), { kind: 'dragonFight', defaultFirst: 'a', capTieWinner: 'b', capLoser: 'a' }, scripted([1, 1]));
    expect(fight.winner).toBe('b');
  });
});
