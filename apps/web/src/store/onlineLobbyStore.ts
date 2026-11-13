import type { JobId } from '@dragon-rush/engine';
import {
  S2C,
  type Ack,
  type ModelInfo,
  type RoomStateMsg,
  type SessionWelcomeMsg,
} from '@dragon-rush/protocol';
import { createStore } from 'zustand/vanilla';
import { fetchModels } from '../services/modelCatalog';
import type { OnlineGameClient } from '../services/OnlineGameClient';
import { OnlineSession } from '../services/onlineSession';
import { readStorage, writeStorage } from '../services/storage';
import {
  connectErrorCode,
  errorText,
  NICKNAME_MAX,
  nicknameError,
  normalizeRoomCode,
  parseSeatChoice,
  roomCodeError,
  type ConnectionStatus,
  type LobbyErrorCode,
  type SeatChoice,
} from '../types/onlineLobby';
import { navStore, type NavStore } from './navStore';

const NICKNAME_KEY = 'dragonRush.nickname';

export interface OnlineLobbyState {
  connection: ConnectionStatus;
  playerId: string | null;
  room: RoomStateMsg | null;
  /** Room the server is putting this session back into (reconnect), until its state arrives. */
  resumeCode: string | null;
  models: ModelInfo[];
  nickname: string;
  joinCode: string;
  /** Lobby commands still waiting for their ack. */
  pending: number;
  error: string | null;
  errorCode: LobbyErrorCode | null;

  setNickname(value: string): void;
  setJoinCode(value: string): void;
  clearError(): void;
  connect(): Promise<void>;
  disconnect(): void;
  createRoom(): Promise<boolean>;
  joinRoom(): Promise<boolean>;
  leaveRoom(): Promise<boolean>;
  setMaxRounds(maxRounds: number | null): Promise<boolean>;
  configureSeat(seat: number, choice: SeatChoice): Promise<boolean>;
  selectJob(job: JobId | null, seat?: number): Promise<boolean>;
  setReady(ready: boolean): Promise<boolean>;
  start(): Promise<boolean>;
  rematch(): Promise<boolean>;
  /** Shows the room's game (running or finished) on the Game page again. */
  openGame(): void;
}

export interface OnlineLobbyDeps {
  readonly nav: NavStore;
  readonly connect: () => Promise<OnlineSession>;
  readonly fetchModels: () => Promise<ModelInfo[]>;
  readonly storage: {
    read(key: string): string | null;
    write(key: string, value: string): void;
  };
}

/**
 * Owns the online session for the lobby screens: connection, room state, lobby commands,
 * and handing a pre-created OnlineGameClient to the nav store when the game starts.
 */
export const createOnlineLobbyStore = (deps: OnlineLobbyDeps) => {
  let session: OnlineSession | null = null;
  let connecting: Promise<void> | null = null;
  // Bumped on every connect/disconnect so a late connect result for an abandoned attempt is dropped.
  let generation = 0;
  let detach: (() => void)[] = [];
  // Created as soon as we sit in a lobby so the first game update after start is buffered.
  let pendingClient: OnlineGameClient | null = null;
  let lastRoom: { code: string; status: RoomStateMsg['status'] } | null = null;

  return createStore<OnlineLobbyState>()((set, get) => {
    const fail = (code: LobbyErrorCode) => set({ error: errorText(code), errorCode: code });

    const dropPendingClient = () => {
      pendingClient?.dispose();
      pendingClient = null;
    };

    const showGame = () => {
      if (!session) return;
      const client = pendingClient ?? session.createGameClient();
      pendingClient = null;
      deps.nav.getState().openGame(client, { exitTo: 'online' });
    };

    const handleRoom = (room: RoomStateMsg | null) => {
      const prev = lastRoom;
      lastRoom = room ? { code: room.roomCode, status: room.status } : null;
      if (!room) {
        set({ room: null });
        dropPendingClient();
        return;
      }
      set({ room, resumeCode: null });
      if (room.status === 'lobby') {
        if (prev?.code === room.roomCode && prev.status === 'finished') {
          if (deps.nav.getState().route.page === 'game') deps.nav.getState().go('online');
        }
        if (!pendingClient && session) pendingClient = session.createGameClient();
        return;
      }
      // Open the game once per start (or on resuming into a running game), not on every
      // room update: after leaving the Game page the player stays here until they choose.
      const started =
        room.status === 'playing' && (prev?.code !== room.roomCode || prev.status !== 'playing');
      if (started) showGame();
    };

    const attach = (s: OnlineSession) => {
      session = s;
      const socket = s.socket;
      const onDisconnect = (reason: string) => {
        if (reason === 'io client disconnect') return;
        if (reason === 'io server disconnect') {
          // The server only kicks a socket when the same session connects elsewhere; no auto-reconnect follows.
          get().disconnect();
          set({ connection: 'offline' });
          fail('SESSION_REPLACED');
          return;
        }
        set({ connection: 'reconnecting' });
      };
      const onConnect = () => set({ connection: 'connected' });
      const onWelcome = (welcome: SessionWelcomeMsg) => {
        // A later welcome means we reconnected; without resume the room is gone (lobby grace expired).
        if (!welcome.resume && get().room) handleRoom(null);
      };
      socket.on('disconnect', onDisconnect);
      socket.on('connect', onConnect);
      socket.on(S2C.sessionWelcome, onWelcome);
      detach = [
        () => socket.off('disconnect', onDisconnect),
        () => socket.off('connect', onConnect),
        () => socket.off(S2C.sessionWelcome, onWelcome),
      ];
      set({
        connection: 'connected',
        playerId: s.playerId,
        resumeCode: s.welcome.resume?.roomCode ?? null,
      });
      detach.push(s.onRoom(handleRoom));
      deps.fetchModels().then(
        (models) => set({ models }),
        () => set({ models: [] }),
      );
    };

    const command = async (op: (s: OnlineSession) => Promise<Ack<unknown>>): Promise<boolean> => {
      const s = session;
      if (!s) {
        fail('DISCONNECTED');
        return false;
      }
      set((st) => ({ pending: st.pending + 1, error: null, errorCode: null }));
      try {
        const r = await op(s);
        if (!r.ok) fail(r.error.code);
        return r.ok;
      } catch {
        fail('TIMEOUT');
        return false;
      } finally {
        set((st) => ({ pending: Math.max(0, st.pending - 1) }));
      }
    };

    const validNickname = (): string | null => {
      const nickname = get().nickname.trim();
      const invalid = nicknameError(nickname);
      if (invalid) {
        set({ error: invalid, errorCode: null });
        return null;
      }
      deps.storage.write(NICKNAME_KEY, nickname);
      return nickname;
    };

    return {
      connection: 'idle',
      playerId: null,
      room: null,
      resumeCode: null,
      models: [],
      nickname: (deps.storage.read(NICKNAME_KEY) ?? '').slice(0, NICKNAME_MAX),
      joinCode: '',
      pending: 0,
      error: null,
      errorCode: null,

      setNickname(value) {
        const nickname = value.slice(0, NICKNAME_MAX);
        set({ nickname });
        deps.storage.write(NICKNAME_KEY, nickname);
      },

      setJoinCode(value) {
        set({ joinCode: normalizeRoomCode(value) });
      },

      clearError() {
        set({ error: null, errorCode: null });
      },

      connect() {
        if (session) return Promise.resolve();
        if (connecting) return connecting;
        const gen = ++generation;
        set({ connection: 'connecting', error: null, errorCode: null });
        connecting = deps
          .connect()
          .then(
            (s) => {
              if (gen !== generation) s.disconnect();
              else attach(s);
            },
            (e: unknown) => {
              if (gen !== generation) return;
              set({ connection: 'offline' });
              fail(connectErrorCode(e));
            },
          )
          .finally(() => {
            if (gen === generation) connecting = null;
          });
        return connecting;
      },

      disconnect() {
        generation++;
        connecting = null;
        dropPendingClient();
        for (const off of detach) off();
        detach = [];
        session?.disconnect();
        session = null;
        lastRoom = null;
        set({ connection: 'idle', playerId: null, room: null, resumeCode: null, pending: 0 });
      },

      async createRoom() {
        const nickname = validNickname();
        return nickname !== null && command((s) => s.createRoom(nickname));
      },

      async joinRoom() {
        const code = normalizeRoomCode(get().joinCode);
        const invalid = roomCodeError(code);
        if (invalid) {
          set({ error: invalid, errorCode: null });
          return false;
        }
        const nickname = validNickname();
        return nickname !== null && command((s) => s.joinRoom(code, nickname));
      },

      leaveRoom() {
        return command((s) => s.leaveRoom());
      },

      setMaxRounds(maxRounds) {
        return command((s) => s.configure(maxRounds));
      },

      async configureSeat(seat, choice) {
        const payload = parseSeatChoice(seat, choice);
        return payload !== null && command((s) => s.configureSeat(payload));
      },

      selectJob(job, seat) {
        return command((s) => s.selectJob(job, seat));
      },

      setReady(ready) {
        return command((s) => s.setReady(ready));
      },

      start() {
        return command((s) => s.start());
      },

      rematch() {
        return command((s) => s.rematch());
      },

      openGame() {
        const room = get().room;
        if (room && room.status !== 'lobby') showGame();
      },
    };
  });
};

export type OnlineLobbyStore = ReturnType<typeof createOnlineLobbyStore>;

export const onlineLobbyStore: OnlineLobbyStore = createOnlineLobbyStore({
  nav: navStore,
  connect: () => OnlineSession.connect(),
  fetchModels: () => fetchModels(),
  storage: { read: readStorage, write: writeStorage },
});
