import { actionKey, getLegalActions } from '@hero-dice/engine';
import { describe, expect, it } from 'vitest';
import { ACTION_DIM, ACTION_NAMES, decodeAction, encodeAction, legalIndices, maskFromLegal } from '../src/index';
import { view, walk } from './helpers';

describe('act_v1 codec', () => {
  it('has 47 named actions', () => {
    expect(ACTION_DIM).toBe(47);
    expect(ACTION_NAMES).toHaveLength(47);
    expect(new Set(ACTION_NAMES).size).toBe(47);
    expect(ACTION_NAMES[9]).toBe('TELEPORT_T00');
    expect(ACTION_NAMES[46]).toBe('TRAIN_MAXHP');
  });

  it('maps legal actions one-to-one with the mask and round-trips', () => {
    for (const n of [2, 3, 4]) {
      for (let seed = 1; seed <= 15; seed++) {
        for (const s of walk(n, seed)) {
          if (!s.pending) continue;
          const v = view(s);
          const seat = s.pending.actor;
          const legal = getLegalActions(s);
          const mask = maskFromLegal(v, seat, legal);
          expect(mask.reduce((a, b) => a + b, 0)).toBe(legal.length);
          expect(legal.length).toBeGreaterThanOrEqual(2);
          for (const a of legal) {
            const i = encodeAction(v, seat, a);
            expect(actionKey(decodeAction(v, seat, i))).toBe(actionKey(a));
          }
          expect(legalIndices(v, seat, legal)).toEqual([...mask.keys()].filter((i) => mask[i]));
        }
      }
    }
  });
});
