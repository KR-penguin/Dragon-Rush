import { actionKey, applyAction, getLegalActions } from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import {
  ACTION_DIM,
  ACT_VERSION,
  ACTION_NAMES,
  createHeuristicBot,
  decodeAction,
  encodeAction,
  legalIndices,
  maskFromLegal,
} from '../src/index';
import { newGame, view, walk } from './helpers';

describe('act_v4 codec', () => {
  it('has 44 named actions without thief targets', () => {
    expect(ACT_VERSION).toBe('act_v4');
    expect(ACTION_DIM).toBe(44);
    expect(ACTION_NAMES).toHaveLength(44);
    expect(new Set(ACTION_NAMES).size).toBe(44);
    expect(ACTION_NAMES[8]).toBe('BUY_PRINCE_TOTEM');
    expect(ACTION_NAMES.some((name) => name.includes('THIEF'))).toBe(false);
    expect(ACTION_NAMES[9]).toBe('TELEPORT_T00');
    expect(ACTION_NAMES[43]).toBe('TRAIN_MAXHP');
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
          if (s.pending.phase === 'CHOOSE_PVP_TARGET' && s.pvp?.candidates.length === 1)
            expect(legal).toEqual([{ type: 'CHOOSE_PVP_TARGET', target: s.pvp.candidates[0] }]);
          else if (
            s.pending.phase === 'SHIELD_DECISION' &&
            s.players[s.pending.actor]?.items.shield === 0
          )
            expect(legal).toEqual([{ type: 'SHIELD_DECISION', use: false }]);
          else if (s.pending.phase === 'POST_MOVE' && s.turn.canBuy && legal.length === 1)
            expect(legal).toEqual([{ type: 'END_TURN' }]);
          else expect(legal.length).toBeGreaterThanOrEqual(2);
          for (const a of legal) {
            const i = encodeAction(v, seat, a);
            expect(actionKey(decodeAction(v, seat, i))).toBe(actionKey(a));
          }
          expect(legalIndices(v, seat, legal)).toEqual([...mask.keys()].filter((i) => mask[i]));
        }
      }
    }
  });

  it('keeps the one-target confirmation legal for the codec and heuristic bot', () => {
    const s = newGame(2, 8);
    s.round = 3;
    s.players[0]!.items.teleport = 1;
    s.players[1]!.position = 9;
    const landing = applyAction(s, { type: 'USE_TELEPORT', tile: 9 }).state;
    const v = view(landing);
    const legal = getLegalActions(landing);
    expect(legal).toEqual([{ type: 'CHOOSE_PVP_TARGET', target: 1 }]);
    const index = encodeAction(v, 0, legal[0]!);
    expect(decodeAction(v, 0, index)).toEqual(legal[0]);
    expect(legalIndices(v, 0, legal)).toEqual([index]);
    expect(maskFromLegal(v, 0, legal)[index]).toBe(1);
    expect(createHeuristicBot().decide({ view: v, seat: 0, legal, random: () => 0.5 })).toEqual(
      legal[0],
    );
  });
});
