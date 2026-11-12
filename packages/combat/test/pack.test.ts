import { describe, expect, it } from 'vitest';
import {
  cloneCombatState,
  createCombat,
  DEFAULT_COMBAT_RULES,
  deserializeCombatState,
  hashCombatRules,
  hashCombatState,
  serializeCombatState,
} from '../src/index';
import { dragonFight, duel, play, randomInputs } from './helpers';

const duelReplay = () =>
  play(
    createCombat(duel('swordsman', 'ninja'), 2026),
    randomInputs(11, 2700),
    randomInputs(12, 2700),
  );
const dragonReplay = () =>
  play(createCombat(dragonFight('archer'), 2026), randomInputs(13, 4500), [], 4500);

describe('snapshot / restore', () => {
  it('serialize -> deserialize round-trips every state of a duel and a dragon fight', () => {
    for (const p of [duelReplay(), dragonReplay()]) {
      for (let i = 0; i < p.states.length; i += 13) {
        const s = p.states[i]!;
        const data = serializeCombatState(s);
        expect(data.every((v) => Number.isInteger(v))).toBe(true);
        const back = deserializeCombatState(
          JSON.parse(JSON.stringify(data)) as number[],
          DEFAULT_COMBAT_RULES,
        );
        expect(back).toEqual(s);
        expect(hashCombatState(back)).toBe(hashCombatState(s));
      }
    }
  });

  it('the hash sees every change, and a clone is equal but independent', () => {
    const s = duelReplay().states[400]!;
    const c = cloneCombatState(s);
    expect(c).toEqual(s);
    expect(c.a).not.toBe(s.a);
    expect(hashCombatState({ ...s, a: { ...s.a, x: s.a.x + 1 } })).not.toBe(hashCombatState(s));
    expect(hashCombatState({ ...s, rng: { ...s.rng, d: s.rng.d + 1 } })).not.toBe(
      hashCombatState(s),
    );
  });

  it('rejects truncated or foreign snapshots', () => {
    const data = serializeCombatState(createCombat(duel('mage', 'archer'), 1));
    expect(() => deserializeCombatState(data.slice(0, -3))).toThrow(RangeError);
    expect(() => deserializeCombatState([99, ...data.slice(1)])).toThrow(RangeError);
  });
});

describe('golden replays', () => {
  // Any change to the sim or DEFAULT_COMBAT_RULES moves these hashes: update the snapshot only for intended changes.
  it('duel: FNV-1a state hash every 60 ticks and the result', () => {
    const p = duelReplay();
    expect({
      hashes: p.states.filter((s) => s.tick % 60 === 0).map(hashCombatState),
      final: hashCombatState(p.final),
      outcome: p.final.outcome,
      events: p.events.length,
    }).toMatchSnapshot();
  });

  it('dragon fight: FNV-1a state hash every 60 ticks and the result', () => {
    const p = dragonReplay();
    expect({
      hashes: p.states.filter((s) => s.tick % 60 === 0).map(hashCombatState),
      final: hashCombatState(p.final),
      outcome: p.final.outcome,
      events: p.events.length,
    }).toMatchSnapshot();
  });

  it('rules hash identifies DEFAULT_COMBAT_RULES', () => {
    expect({
      version: DEFAULT_COMBAT_RULES.version,
      hash: hashCombatRules(DEFAULT_COMBAT_RULES),
    }).toMatchSnapshot();
  });
});
