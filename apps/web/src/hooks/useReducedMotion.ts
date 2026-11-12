import { useEffect } from 'react';
import { useStore } from 'zustand';
import { fxSettings } from '../fx';
import { useMediaQuery } from './useMediaQuery';

/**
 * Reduced motion and ambient animation, shared with the FX toolkit's settings (one source of truth):
 * the OS `prefers-reduced-motion` unless the player chose otherwise in game.
 */
export function useReducedMotion(): { reduced: boolean; ambient: boolean; toggle: () => void } {
  const system = useMediaQuery('(prefers-reduced-motion: reduce)');
  const choice = useStore(fxSettings, (s) => s.reduceMotion);
  const ambient = useStore(fxSettings, (s) => s.animateBackground);
  const reduced = choice ?? system;
  return {
    reduced,
    ambient,
    toggle: () => fxSettings.getState().update({ reduceMotion: !reduced }),
  };
}

/** Mirrors the motion settings onto <html> so CSS can switch loops and tilt off on every screen. */
export function useMotionAttributes(): void {
  const { reduced, ambient } = useReducedMotion();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = reduced ? 'reduced' : 'full';
    root.dataset.ambient = ambient && !reduced ? 'on' : 'off';
  }, [reduced, ambient]);
}
