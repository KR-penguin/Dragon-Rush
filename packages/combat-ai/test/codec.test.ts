import { createCombat, MOVE_BAM, NO_INPUT, stepCombat } from '@dragon-rush/combat';
import { describe, expect, it } from 'vitest';
import {
  CACT_FLAT_DIM,
  CombatActionError,
  fromFighterInput,
  fromFlat,
  mirrorAction,
  mirrorMove,
  toFighterInput,
  toFlat,
  type Mirror,
} from '../src/index';
import { duel } from './helpers';

const MIRRORS: Mirror[] = [
  { x: true, y: false },
  { x: false, y: true },
  { x: true, y: true },
];

describe('cact_v1 codec', () => {
  it('round-trips flat <-> multi for all 36 actions', () => {
    for (let i = 0; i < CACT_FLAT_DIM; i++) {
      const a = fromFlat(i);
      expect(toFlat(a)).toBe(i);
      expect(a.move * 4 + a.button).toBe(i);
    }
    expect(() => fromFlat(36)).toThrow(CombatActionError);
    expect(() => fromFlat(-1)).toThrow(CombatActionError);
    expect(() => toFlat({ move: 9, button: 0 })).toThrow(CombatActionError);
    expect(() => toFlat({ move: 1.5, button: 0 })).toThrow(CombatActionError);
  });

  it('maps moves to the sim directions and buttons to levels', () => {
    const { input } = toFighterInput({ move: 3, button: 1 });
    expect(input).toEqual({ move: 3, attack: true, skill: false, dash: false });
    expect(MOVE_BAM[3]).toBe(0); // E = BAM 0
    expect(toFighterInput({ move: 0, button: 3 }).input).toEqual({
      move: 0,
      attack: false,
      skill: false,
      dash: true,
    });
    expect(fromFighterInput({ move: 6, attack: false, skill: true, dash: false })).toEqual({
      move: 6,
      button: 2,
    });
  });

  it('presses only when the button changes; repeating a button holds it', () => {
    const first = toFighterInput({ move: 0, button: 1 }, NO_INPUT);
    expect(first.press).toBe(1);
    expect(toFighterInput({ move: 5, button: 1 }, first.input).press).toBe(0);
    expect(toFighterInput({ move: 5, button: 2 }, first.input).press).toBe(2);
    expect(toFighterInput({ move: 5, button: 0 }, first.input).press).toBe(0);
  });

  it('a held window is one press in the sim; a none window re-arms the button', () => {
    let s = createCombat(duel('archer', 'swordsman'), 3);
    const hold = toFighterInput({ move: 0, button: 1 }).input;
    let draws = 0;
    for (let t = 0; t < 40; t++) {
      const r = stepCombat(s, [hold, NO_INPUT]);
      draws += r.events.filter((e) => e.type === 'AttackStart' && e.who === 'a').length;
      s = r.state;
    }
    // First Strike fires the nocked arrow on the first press; holding never presses again
    expect(draws).toBe(1);
  });

  it('mirrors moves as an involution that matches reflected BAM angles', () => {
    for (const m of MIRRORS) {
      for (let move = 0; move < 9; move++) {
        expect(mirrorMove(mirrorMove(move, m), m)).toBe(move);
        if (move === 0) continue;
        const bam = MOVE_BAM[move]!;
        let want = bam;
        if (m.x) want = (128 - want) & 255;
        if (m.y) want = (256 - want) & 255;
        expect(MOVE_BAM[mirrorMove(move, m)]).toBe(want);
      }
      expect(mirrorAction({ move: 2, button: 3 }, m).button).toBe(3);
    }
    expect(mirrorMove(0, { x: true, y: true })).toBe(0);
  });
});
