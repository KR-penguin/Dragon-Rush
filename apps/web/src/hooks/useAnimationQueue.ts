import { useEffect } from 'react';
import type { GameStore } from '../store/gameStore';

/** Plays queued GameEvents one by one, then snaps the board to the authoritative state. */
export function useAnimationQueue(store: GameStore): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const ms = store.getState().advance();
      if (ms === null) {
        running = false;
        return;
      }
      timer = setTimeout(() => {
        if (store.getState().queue.length === 0) {
          store.getState().snap();
          running = false;
        } else tick();
      }, ms);
    };
    const pump = () => {
      if (running || !alive) return;
      const s = store.getState();
      if (s.queue.length === 0) {
        // A remount (e.g. StrictMode) cleared the timer that would have finished this event.
        if (s.current !== null) s.snap();
        return;
      }
      running = true;
      // Start outside the store's listener loop: a nested set there would hand later listeners
      // the new `current` with the old `prev`, so they would see the first event of a batch twice.
      queueMicrotask(tick);
    };
    const unsubscribe = store.subscribe(pump);
    pump();
    return () => {
      alive = false;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [store]);
}
