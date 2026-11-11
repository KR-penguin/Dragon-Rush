import { applyAction, getLegalActions, toPublicState } from '@hero-dice/engine';
import { describe, expect, it } from 'vitest';
import { encodeObservation, OBS_VERSION } from '../src/index';
import { newGame } from './helpers';

const fnv = (obs: Float32Array): string => {
  const bytes = new Uint8Array(obs.buffer);
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
};

/** Fixed seeds + fixed action script → per-step obs hashes. Any layout change must bump OBS_VERSION. */
describe(`${OBS_VERSION} golden vectors`, () => {
  it.each([2, 3, 4])('matches the recorded hashes for %i players', (n) => {
    let s = newGame(n, 1000 + n, 40);
    const hashes: string[] = [];
    for (let i = 0; i < 60 && s.pending; i++) {
      hashes.push(fnv(encodeObservation(toPublicState(s), s.pending.actor)));
      const legal = getLegalActions(s);
      s = applyAction(s, legal.find((a) => a.type !== 'CHALLENGE_DRAGON') ?? legal[0]!).state;
    }
    expect({ version: OBS_VERSION, hashes }).toMatchSnapshot();
  });
});
