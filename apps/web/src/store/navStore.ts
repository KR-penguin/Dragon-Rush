import { createStore } from 'zustand/vanilla';
import type { GameClient } from '../services/gameClient';
import { createGameStore, type GameStore } from './gameStore';

export type MenuPage = 'home' | 'localSetup' | 'online';

/** One running game on screen. The nav store owns its lifetime and disposes the client on exit. */
export interface GameSession {
  readonly id: number;
  readonly store: GameStore;
  /** Builds a fresh client for "다시 하기"; null when the backend cannot restart (e.g. online). */
  readonly restart: (() => GameClient) | null;
  /** Where "처음으로" leads. */
  readonly exitTo: MenuPage;
}

export type Route =
  { readonly page: MenuPage } | { readonly page: 'game'; readonly session: GameSession };

export interface OpenGameOptions {
  readonly restart?: () => GameClient;
  readonly exitTo?: MenuPage;
}

export interface NavState {
  route: Route;
  go(page: MenuPage): void;
  /** Shows the Game page for any GameClient (local or online). */
  openGame(client: GameClient, options?: OpenGameOptions): void;
  restartGame(): void;
}

export const createNavStore = () => {
  let nextSessionId = 1;
  return createStore<NavState>()((set, get) => {
    const closeSession = () => {
      const route = get().route;
      if (route.page === 'game') route.session.store.getState().detach();
    };
    return {
      route: { page: 'home' },

      go(page) {
        closeSession();
        set({ route: { page } });
      },

      openGame(client, options = {}) {
        closeSession();
        const store = createGameStore();
        store.getState().attach(client);
        const session: GameSession = {
          id: nextSessionId++,
          store,
          restart: options.restart ?? null,
          exitTo: options.exitTo ?? 'home',
        };
        set({ route: { page: 'game', session } });
      },

      restartGame() {
        const route = get().route;
        if (route.page !== 'game' || !route.session.restart) return;
        const { restart, exitTo, store } = route.session;
        const speed = store.getState().speed;
        get().openGame(restart(), { restart, exitTo });
        const next = get().route;
        if (next.page === 'game') next.session.store.getState().setSpeed(speed);
      },
    };
  });
};

export type NavStore = ReturnType<typeof createNavStore>;

export const navStore: NavStore = createNavStore();
