import { NO_INPUT, type FighterInput } from '@dragon-rush/combat';
import { inputFromPad, mergeInputs, type PadSnapshot } from '../../types/combatControls';
import type { FightInputSource } from './types';

/** Minimal Gamepad API surface (navigator.getGamepads), injectable for tests. */
export interface PadLike {
  readonly index: number;
  readonly connected: boolean;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean }[];
}
export type GetPads = () => readonly (PadLike | null)[];

export const browserPads: GetPads = () => {
  try {
    return globalThis.navigator?.getGamepads?.() ?? [];
  } catch {
    return [];
  }
};

const snapshot = (pad: PadLike): PadSnapshot => ({
  axes: pad.axes,
  pressed: pad.buttons.map((b) => b.pressed),
});

/** One connected pad by order of connection (P1 = first, P2 = second), or `'any'` merges all. */
export function readPad(getPads: GetPads, slot: number | 'any'): FighterInput {
  const pads = getPads().filter((p): p is PadLike => p !== null && p.connected);
  if (slot === 'any') return mergeInputs(pads.map((p) => inputFromPad(snapshot(p))));
  const pad = pads[slot];
  return pad ? inputFromPad(snapshot(pad)) : NO_INPUT;
}

/** Keyboard and pad for the same player: directions from whichever moves, buttons OR-ed. */
export function combineSources(sources: readonly FightInputSource[]): FightInputSource {
  return {
    sample: (state, side) => mergeInputs(sources.map((s) => s.sample(state, side))),
    dispose: () => sources.forEach((s) => s.dispose?.()),
  };
}

export function createGamepadSource(
  slot: number | 'any',
  getPads: GetPads = browserPads,
): FightInputSource {
  return { sample: () => readPad(getPads, slot) };
}
