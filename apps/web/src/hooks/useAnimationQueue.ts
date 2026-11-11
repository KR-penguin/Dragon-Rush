import { useEffect } from 'react';
import type { GameStore } from '../store/gameStore';

/** Plays queued GameEvents one by one, then snaps the board to the authoritative state. */
export function useAnimationQueue(store: GameStore): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    const tick = () => {
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
      if (running || store.getState().queue.length === 0) return;
      running = true;
      tick();
    };
    const unsubscribe = store.subscribe(pump);
    pump();
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [store]);
}
