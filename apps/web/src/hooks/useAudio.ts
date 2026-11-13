import { useEffect, useSyncExternalStore } from 'react';
import { isMuted, playBgm, setMuted, subscribeAudio } from '../services/audio';
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
  useEffect(() => () => playBgm(null), []);
}
