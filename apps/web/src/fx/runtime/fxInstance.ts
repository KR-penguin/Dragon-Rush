import { duckMusic, onSoundPlayed, playSound } from '../../services/audio';
import { SOUND_SPEC } from '../audio/soundCatalog';
import type { ClockLike } from '../core/camera';
import { createFxClock } from '../core/time';
import {
  fxSettings,
  resolveFxPolicy,
  systemPrefersReducedMotion,
  type FxPolicy,
} from '../settings/fxSettings';
import { ArenaFx } from './arenaFx';
import { FxRuntime } from './fxRuntime';

/** Global presentation clock: board animations and the arena renderer can read it for hit-stop. */
export const fxTime = createFxClock(() => performance.now());

let systemReduced = systemPrefersReducedMotion();
let policyCache: FxPolicy | null = null;

try {
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    systemReduced = e.matches;
    policyCache = null;
  });
} catch {
  // Older engines: the in-game toggle still works.
}
fxSettings.subscribe(() => {
  policyCache = null;
});

/** Effective effect policy (settings + accessibility), cached until a setting changes. */
export const fxPolicy = (): FxPolicy =>
  (policyCache ??= resolveFxPolicy(fxSettings.getState(), systemReduced));

/** The screen overlay runtime. Mount `<FxLayer/>` once to give it a surface. */
export const fx = new FxRuntime({
  clock: fxTime,
  policy: fxPolicy,
  audio: { play: playSound, duck: () => duckMusic(), onPlayed: onSoundPlayed },
  captionFor: (name) => SOUND_SPEC[name].caption,
});

/** Effects for a Canvas combat arena (logical px); screen flashes and audio go through `fx`. */
export function createArenaFx(
  options: { readonly seed?: number; readonly clock?: ClockLike } = {},
): ArenaFx {
  return new ArenaFx({
    clock: options.clock ?? fxTime,
    policy: fxPolicy,
    screen: fx,
    seed: options.seed,
  });
}
