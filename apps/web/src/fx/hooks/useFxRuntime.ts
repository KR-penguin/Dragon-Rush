import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { getAudioSettings, playSound, subscribeAudio } from '../../services/audio';
import { installButtonJuice } from '../runtime/buttonJuice';
import { fx, fxPolicy } from '../runtime/fxInstance';
import { fxSettings } from '../settings/fxSettings';

/** Refs for the overlay DOM; binds them to the global FX runtime while mounted. */
export function useFxSurface() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const texts = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const vignette = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!canvas.current || !texts.current || !flash.current || !vignette.current) return;
    document.documentElement.classList.add('fx-on');
    const detach = fx.attach({
      canvas: canvas.current,
      texts: texts.current,
      flash: flash.current,
      vignette: vignette.current,
      caption: caption.current,
    });
    return () => {
      detach();
      document.documentElement.classList.remove('fx-on');
    };
  }, []);
  return { canvas, texts, flash, vignette, caption };
}

/** Ref callback that registers an element as a camera-shake target (the HUD must not use it). */
export function useShakeTarget<T extends HTMLElement>(): (el: T | null) => void {
  const release = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    release.current?.();
    release.current = el ? fx.addShakeTarget(el) : null;
  }, []);
}

/** Press/release juice and a click sound on every button while mounted. */
export function useButtonJuice(): void {
  useEffect(
    () =>
      installButtonJuice(document, {
        reduceMotion: () => fxPolicy().reduceMotion || !fxPolicy().punch,
        onPress: (semitones) => {
          if (fxPolicy().sound) playSound('ui_click', { semitones });
        },
      }),
    [],
  );
}

export function useFxSettings() {
  return useStore(fxSettings);
}

export function useAudioSettings() {
  return useSyncExternalStore(subscribeAudio, getAudioSettings, getAudioSettings);
}
