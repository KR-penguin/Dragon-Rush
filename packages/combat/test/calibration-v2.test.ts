import { describe, expect, it } from 'vitest';
import { createCombat, stepCombat } from '../src/index';
import { baseFighter, duel, idle, input } from './helpers';

describe('v2 combat mechanics', () => {
  it('holds a meteor after the cast and places its mark on release', () => {
    let state = createCombat(duel(baseFighter('mage'), baseFighter('berserker')), 7);
    for (let tick = 0; tick < 20; tick++) {
      state = stepCombat(state, [input(3, 's'), idle]).state;
    }
    expect(state.a.move).toBe('meteor');
    expect(state.zones).toHaveLength(0);
    state = stepCombat(state, [idle, idle]).state;
    expect(state.zones.filter((zone) => zone.kind === 'meteor')).toHaveLength(1);
  });

  it('leads a moving target on the archer full shot', () => {
    const base = createCombat(duel(baseFighter('archer'), baseFighter('berserker')), 9);
    const moving = { ...base, b: { ...base.b!, y: base.b!.y + 48 * 256, vy: 800 } };
    const still = { ...base, b: { ...base.b!, y: base.b!.y + 48 * 256 } };
    const shot = (state: typeof base) =>
      stepCombat(state, [input(3, 'a'), idle]).state.projectiles[0]!;
    expect(shot(moving).angle).not.toBe(shot(still).angle);
  });
});
