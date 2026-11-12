import { createCombat } from '@dragon-rush/combat';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TouchControls } from '../src/components/combat/TouchControls';
import { readTouchCooldowns, touchControlSide } from '../src/hooks/useTouchCooldowns';
import { TouchTracker } from '../src/services/fight/touchInput';
import type { FightSide } from '../src/services/gameClient';

const duel = createCombat(
  {
    kind: 'duel',
    a: { job: 'ninja', hp: 40, maxHp: 40, atk: 5, def: 5, indomitableAvailable: false },
    b: { job: 'swordsman', hp: 50, maxHp: 50, atk: 5, def: 5, indomitableAvailable: false },
  },
  7,
);

describe('mobile touch cooldowns', () => {
  it('selects only the fighter controlled by the touch pad', () => {
    const sides: [FightSide, FightSide] = [
      { side: 'a', seat: 0, control: 'bot' },
      { side: 'b', seat: 1, control: 'keyboard-solo' },
    ];
    expect(touchControlSide(sides)).toBe('b');
    expect(touchControlSide([{ ...sides[0], control: 'keyboard-p1' }, sides[1]])).toBe('a');
    expect(touchControlSide([{ ...sides[0], control: 'remote' }, sides[1]])).toBe('b');
    expect(
      touchControlSide([
        { ...sides[0], control: 'bot' },
        { ...sides[1], control: 'bot' },
      ]),
    ).toBeNull();
  });

  it('shows the next charge with one of two charges still available', () => {
    const state = {
      ...duel,
      a: { ...duel.a, skillCharges: 1, skillTimer: 125, dashCharges: 1, dashTimer: 37 },
    };
    expect(readTouchCooldowns(state, 'a')).toEqual({
      skill: { charges: 1, maxCharges: 2, tenths: 21 },
      dash: { charges: 1, maxCharges: 2, tenths: 7 },
    });
    const html = renderToStaticMarkup(
      <TouchControls
        tracker={new TouchTracker()}
        onPause={vi.fn()}
        cooldowns={readTouchCooldowns(state, 'a')}
      />,
    );
    expect(html).toContain('aria-label="스킬, 1/2회, 다음 충전 2.1초"');
    expect(html).toContain('aria-label="대시, 1/2회, 다음 충전 0.7초"');
    expect(html).toContain('>2.1초<');
    expect(html).toContain('>0.7초<');
  });

  it('shows one-charge cooldowns, full charges, and the selected b fighter', () => {
    const state = {
      ...duel,
      a: { ...duel.a, skillCharges: 0, skillTimer: 125 },
      b: { ...duel.b!, skillCharges: 0, skillTimer: 120, dashCharges: 0, dashTimer: 37 },
    };
    expect(readTouchCooldowns(state, 'b')).toEqual({
      skill: { charges: 0, maxCharges: 1, tenths: 20 },
      dash: { charges: 0, maxCharges: 1, tenths: 7 },
    });
    expect(readTouchCooldowns(duel, 'a')).toEqual({
      skill: { charges: 2, maxCharges: 2, tenths: 0 },
      dash: { charges: 2, maxCharges: 2, tenths: 0 },
    });
    const fullHtml = renderToStaticMarkup(
      <TouchControls
        tracker={new TouchTracker()}
        onPause={vi.fn()}
        cooldowns={readTouchCooldowns(duel, 'a')}
      />,
    );
    expect(fullHtml).not.toContain('다음 충전');
    const zeroHtml = renderToStaticMarkup(
      <TouchControls
        tracker={new TouchTracker()}
        onPause={vi.fn()}
        cooldowns={readTouchCooldowns(
          { ...duel, a: { ...duel.a, skillCharges: 0, skillTimer: 0 } },
          'a',
        )}
      />,
    );
    expect(zeroHtml).toContain('다음 충전 0.0초');
  });

  it('reads the local fighter in a dragon fight without a b fighter', () => {
    const dragon = createCombat(
      {
        kind: 'dragonFight',
        a: { job: 'mage', hp: 40, maxHp: 40, atk: 5, def: 5, indomitableAvailable: false },
        b: null,
        dragon: { hp: 100, atk: 5, def: 5 },
      },
      7,
    );
    expect(readTouchCooldowns(dragon, 'a')?.skill.maxCharges).toBe(1);
    expect(readTouchCooldowns(dragon, 'b')).toBeNull();
  });
});
