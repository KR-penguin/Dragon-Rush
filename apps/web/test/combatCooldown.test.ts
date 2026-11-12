import { createCombat } from '@dragon-rush/combat';
import { describe, expect, it } from 'vitest';
import { dashCooldown, skillCooldown } from '../src/combat/render/hudModel';

const state = createCombat(
  {
    kind: 'duel',
    a: { job: 'ninja', hp: 40, maxHp: 40, atk: 5, def: 5, indomitableAvailable: false },
    b: { job: 'swordsman', hp: 50, maxHp: 50, atk: 5, def: 5, indomitableAvailable: false },
  },
  7,
);

describe('combat cooldown HUD', () => {
  it('shows the next charge countdown in seconds, including when one charge is available', () => {
    const fighter = { ...state.a, skillCharges: 1, skillTimer: 125, dashCharges: 0, dashTimer: 37 };
    expect(skillCooldown(state, fighter)).toMatchObject({ charges: 1, maxCharges: 2, seconds: 2.1 });
    expect(dashCooldown(state, fighter)).toMatchObject({ charges: 0, maxCharges: 2, seconds: 0.7 });
    expect(skillCooldown(state, state.a).seconds).toBe(0);
  });
});
