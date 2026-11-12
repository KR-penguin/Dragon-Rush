import { createCombat, type Side } from '@dragon-rush/combat';
import { describe, expect, it } from 'vitest';
import {
  COBS_DIM,
  COBS_V1_LAYOUT,
  COBS_V1_ONE_HOTS,
  encodeCombatObservation,
  mirrorCombatObservation,
  mirrorMove,
  type Mirror,
} from '../src/index';
import { allSetups, dragonFight, duel, playFight } from './helpers';

const field = (obs: Float32Array, name: string): number[] => {
  const f = COBS_V1_LAYOUT.find((x) => x.name === name)!;
  return Array.from(obs.slice(f.offset, f.offset + f.length));
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const MIRRORS: Mirror[] = [
  { x: true, y: false },
  { x: false, y: true },
  { x: true, y: true },
];

describe('encodeCombatObservation', () => {
  it('starts a duel ego-centric and axis-aligned', () => {
    const s = createCombat(duel('swordsman', 'archer'), 1);
    const a = encodeCombatObservation(s, 'a');
    const b = encodeCombatObservation(s, 'b');
    expect(a).toHaveLength(COBS_DIM);
    expect(field(a, 'self.job')).toEqual([1, 0, 0, 0, 0]);
    expect(field(a, 'opp.type')).toEqual([0, 1, 0, 0, 0, 0]);
    expect(field(a, 'self.stats')[0]).toBe(1);
    expect(field(a, 'self.pos')[0]).toBeCloseTo(-0.6, 5);
    expect(field(b, 'self.pos')[0]).toBeCloseTo(0.6, 5);
    expect(field(a, 'opp.rel')[0]).toBeCloseTo(0.6, 5);
    expect(field(b, 'opp.rel')[0]).toBeCloseTo(-0.6, 5);
    expect(field(a, 'self.facing')).toEqual([0, 1]);
    expect(field(b, 'self.facing')[1]).toBe(-1);
    expect(sum(field(a, 'dragon.phase'))).toBe(0);
    expect(field(a, 'g.match')).toEqual([1, 0, 1, 0]);
    expect(field(a, 'g.prevMove')[0]).toBe(1);
    // archer starts nocked (First Strike pending)
    expect(field(b, 'self.flags')[4]).toBe(1);
    expect(field(a, 'opp.flags')[5]).toBe(1);
  });

  it('puts the dragon in the opponent and dragon blocks', () => {
    const s = createCombat(dragonFight('mage'), 2);
    const o = encodeCombatObservation(s, 'a', { delay: 9, prevMove: 3, prevButton: 2 });
    expect(field(o, 'opp.type')).toEqual([0, 0, 0, 0, 0, 1]);
    expect(field(o, 'dragon.phase')).toEqual([1, 0, 0]);
    expect(field(o, 'opp.rel')[1]).toBeLessThan(0);
    expect(field(o, 'g.match')[1]).toBe(1);
    expect(field(o, 'g.match')[2]).toBe(0);
    expect(field(o, 'g.match')[3]).toBeCloseTo(0.5, 6);
    expect(field(o, 'g.prevMove')[3]).toBe(1);
    expect(field(o, 'g.prevButton')[2]).toBe(1);
    expect(() => encodeCombatObservation(s, 'b')).toThrow(RangeError);
  });

  it('stays in [-1, 2] with valid one-hots across scripted fights of every matchup', () => {
    let checked = 0;
    let threats = 0;
    let dragonAims = 0;
    for (const [i, setup] of allSetups().entries()) {
      const frames = playFight(setup, 100 + i, i % 2 ? 'aggressive' : 'balanced');
      for (let t = 0; t < frames.length; t += 5) {
        const s = frames[t]!.state;
        const sides: Side[] = s.b ? ['a', 'b'] : ['a'];
        for (const side of sides) {
          const o = encodeCombatObservation(s, side, {
            delay: t % 19,
            prevMove: t % 9,
            prevButton: t % 4,
          });
          for (let k = 0; k < COBS_DIM; k++) {
            const v = o[k]!;
            if (!(Number.isFinite(v) && v >= -1 && v <= 2))
              throw new Error(`obs[${k}] = ${v} at tick ${s.tick} (${side})`);
          }
          for (const name of COBS_V1_ONE_HOTS) expect([0, 1]).toContain(sum(field(o, name)));
          expect(sum(field(o, 'self.job'))).toBe(1);
          if (field(o, 'threat0')[0] === 1) threats++;
          if (field(o, 'dragon.telegraphAim').some((x) => x !== 0)) dragonAims++;
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
    expect(threats).toBeGreaterThan(100);
    expect(dragonAims).toBeGreaterThan(10);
  });

  it('mirror augmentation is an involution and matches encoding with the mirror flag', () => {
    const frames = playFight(duel('ninja', 'mage'), 7);
    for (let t = 0; t < frames.length; t += 37) {
      const s = frames[t]!.state;
      const ctx = { delay: 6, prevMove: 2, prevButton: 1 };
      const plain = encodeCombatObservation(s, 'a', ctx);
      for (const mirror of MIRRORS) {
        const m = encodeCombatObservation(s, 'a', { ...ctx, mirror });
        expect(Array.from(m)).toEqual(Array.from(mirrorCombatObservation(plain, mirror)));
        expect(Array.from(mirrorCombatObservation(m, mirror))).toEqual(Array.from(plain));
        expect(field(m, 'g.prevMove')[mirrorMove(2, mirror)]).toBe(1);
      }
    }
  });

  it('x mirror swaps the duel sides spatially at tick 0', () => {
    const s = createCombat(duel('berserker', 'berserker'), 3);
    const aMirrored = encodeCombatObservation(s, 'a', {
      delay: 0,
      prevMove: 0,
      prevButton: 0,
      mirror: { x: true, y: false },
    });
    const b = encodeCombatObservation(s, 'b');
    expect(Array.from(aMirrored)).toEqual(Array.from(b));
  });

  // Rule-value changes can alter this vector without changing the cobs_v1 layout.
  it('matches the golden tick-0 vectors (bump COBS_VERSION when this changes on purpose)', () => {
    const round = (o: Float32Array) => Array.from(o, (x) => Math.round(x * 1e5) / 1e5);
    expect(
      round(encodeCombatObservation(createCombat(duel('swordsman', 'ninja'), 5), 'b')),
    ).toMatchSnapshot();
    expect(
      round(
        encodeCombatObservation(createCombat(dragonFight('archer'), 5), 'a', {
          delay: 18,
          prevMove: 8,
          prevButton: 3,
        }),
      ),
    ).toMatchSnapshot();
  });
});
