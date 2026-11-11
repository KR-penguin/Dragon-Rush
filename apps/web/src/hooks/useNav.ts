import { useStore } from 'zustand';
import { navStore, type NavState, type Route } from '../store/navStore';

export function useRoute(): Route {
  return useStore(navStore, (s) => s.route);
}

/** Navigation actions; stable across renders. */
export function useNavActions(): Pick<NavState, 'go' | 'openGame' | 'restartGame'> {
  const { go, openGame, restartGame } = navStore.getState();
  return { go, openGame, restartGame };
}
