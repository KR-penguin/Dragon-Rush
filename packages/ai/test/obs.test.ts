import { applyAction } from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import { encodeObservation, OBS_DIM, OBS_V1_LAYOUT } from '../src/index';
import { newGame, view, walk } from './helpers';

const field = (name: string) => {
  const f = OBS_V1_LAYOUT.find((x) => x.name === name);
  if (!f) throw new Error(`no field ${name}`);
  return f;
};

describe('obs_v1', () => {
  it('has a contiguous layout totalling 253', () => {
    expect(OBS_DIM).toBe(253);
    let offset = 0;
    for (const f of OBS_V1_LAYOUT) {
      expect(f.offset).toBe(offset);
      offset += f.length;
    }
    expect(offset).toBe(253);
    expect(field('opp1.present').offset).toBe(51);
    expect(field('opp2.present').offset).toBe(105);
    expect(field('opp3.present').offset).toBe(159);
    expect(field('g.round').offset).toBe(213);
    expect(field('g.itemPrice').offset).toBe(250);
  });

  it('keeps values in [0, 2] with valid one-hots on reachable states', () => {
    const oneHots = OBS_V1_LAYOUT.filter((f) => /(job|pos|phase|turnPlayer|dice|numPlayers|pvpOpponent)$/.test(f.name));
    for (const n of [2, 4]) {
      for (const s of walk(n, 7)) {
        if (!s.pending) continue;
        const obs = encodeObservation(view(s), s.pending.actor);
        expect(obs).toHaveLength(253);
        for (const v of obs) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(2);
        }
        for (const f of oneHots) {
          const sum = obs.slice(f.offset, f.offset + f.length).reduce((a, b) => a + b, 0);
          expect([0, 1]).toContain(sum);
        }
      }
    }
  });

  it('encodes a pending COMBAT (not a board decision) as an all-zero phase one-hot', () => {
    const s = applyAction(newGame(2, 1, 30, 'external'), { type: 'CHALLENGE_DRAGON' }).state;
    expect(s.pending?.phase).toBe('COMBAT');
    const f = field('g.phase');
    const obs = encodeObservation(view(s), s.pending!.actor);
    expect([...obs.slice(f.offset, f.offset + f.length)]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('encodes the starting position from seat 0', () => {
    const s = newGame(2, 1);
    const obs = encodeObservation(view(s), 0);
    expect(obs[field('self.pos').offset]).toBe(1);
    expect(obs[field('self.coins').offset]).toBeCloseTo(10 / 50);
    expect(obs[field('opp1.present').offset]).toBe(1);
    expect(obs[field('opp2.present').offset]).toBe(0);
    expect(obs[field('g.phase').offset]).toBe(1);
    expect(obs[field('g.turnPlayer').offset]).toBe(1);
    expect(obs[field('g.numPlayers').offset]).toBe(1);
    expect(obs[field('g.graceLeft').offset]).toBeCloseTo(2 / 3);
  });
});
