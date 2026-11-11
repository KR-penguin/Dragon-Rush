import { useStore } from 'zustand';
import { isAnimating, type GameStore } from '../store/gameStore';

/** Subscribes to the slices of the game store the Game page renders. */
export function useGameView(store: GameStore) {
  const latest = useStore(store, (s) => s.latest);
  const display = useStore(store, (s) => s.display);
  const current = useStore(store, (s) => s.current);
  const animating = useStore(store, isAnimating);
  const log = useStore(store, (s) => s.log);
  const speed = useStore(store, (s) => s.speed);
  const lastError = useStore(store, (s) => s.lastError);
  return { latest, display, current, animating, log, speed, lastError };
}

export type GameView = ReturnType<typeof useGameView>;
