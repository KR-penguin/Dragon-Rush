import { useEffect, useSyncExternalStore } from 'react';
import { sfxForEvent } from '../animation/eventSfx';
import { isMuted, playBgm, playSfx, setMuted, subscribeAudio } from '../services/audio';
import type { GameStore } from '../store/gameStore';
import type { BgmName } from '../types/assetPaths';

export function useMuted(): { muted: boolean; toggle: () => void } {
  const muted = useSyncExternalStore(subscribeAudio, isMuted, isMuted);
  return { muted, toggle: () => setMuted(!isMuted()) };
}

/** Plays a background track while the calling screen is shown; `undefined` leaves the music to another screen. */
export function useBgm(name: BgmName | null | undefined): void {
  useEffect(() => {
    if (name !== undefined) playBgm(name);
  }, [name]);
}

/** Voices each event as the animation queue shows it. */
export function useEventSfx(store: GameStore): void {
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (!s.current || s.current === prev.current) return;
        const name = sfxForEvent(s.current, s.latest?.controllableSeats ?? []);
        if (name) playSfx(name);
      }),
    [store],
  );
}

export { playSfx };
