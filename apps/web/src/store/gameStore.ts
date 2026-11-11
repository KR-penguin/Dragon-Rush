import type { Action, GameEvent, PublicGameState, SeatId } from '@dragon-rush/engine';
import { createStore } from 'zustand/vanilla';
import { applyEventToDisplay, describeEvent, eventDuration } from '../animation/eventTimeline';
import type { GameClient, GameUpdate, SubmitResult } from '../services/gameClient';

export interface LogEntry {
  readonly id: number;
  readonly text: string;
}

export type AnimationSpeed = 1 | 2 | 4;

export interface GameStoreState {
  client: GameClient | null;
  /** Latest authoritative update from the client. */
  latest: GameUpdate | null;
  /** What the board shows; lags behind `latest` while events animate. */
  display: PublicGameState | null;
  queue: GameEvent[];
  current: GameEvent | null;
  log: LogEntry[];
  speed: AnimationSpeed;
  lastError: string | null;
  attach(client: GameClient): void;
  detach(): void;
  receive(update: GameUpdate): void;
  /** Pops the next queued event into `current` and returns how long to show it (ms). */
  advance(): number | null;
  snap(): void;
  setSpeed(speed: AnimationSpeed): void;
  submit(action: Action): Promise<SubmitResult>;
}

const MAX_LOG = 300;

export const createGameStore = () => {
  let unsubscribe: (() => void) | null = null;
  let logId = 0;
  return createStore<GameStoreState>()((set, get) => ({
    client: null,
    latest: null,
    display: null,
    queue: [],
    current: null,
    log: [],
    speed: 1,
    lastError: null,

    attach(client) {
      get().detach();
      set({ client, latest: null, display: null, queue: [], current: null, log: [], lastError: null });
      unsubscribe = client.subscribe((u) => get().receive(u));
    },

    detach() {
      unsubscribe?.();
      unsubscribe = null;
      get().client?.dispose();
      set({ client: null });
    },

    receive(update) {
      const prev = get().latest;
      if (prev && update.version <= prev.version && !update.snapshot) return;
      if (update.snapshot || !get().display) {
        set({ latest: update, display: update.publicState, queue: [], current: null });
        if (!update.snapshot && update.events.length) set({ queue: [...update.events], display: get().display });
        return;
      }
      set({ latest: update, queue: [...get().queue, ...update.events] });
    },

    advance() {
      const { queue, display, latest } = get();
      const [next, ...rest] = queue;
      if (!next || !display || !latest) {
        get().snap();
        return null;
      }
      const names = (seat: SeatId) => latest.seats.find((s) => s.seat === seat)?.name ?? `P${seat + 1}`;
      const text = describeEvent(next, names, (i) => display.rules.board[i]!.id);
      const log = text ? [...get().log, { id: ++logId, text }].slice(-MAX_LOG) : get().log;
      set({ queue: rest, current: next, display: applyEventToDisplay(display, next), log });
      return eventDuration(next) / get().speed;
    },

    snap() {
      const latest = get().latest;
      set({ queue: [], current: null, display: latest ? latest.publicState : null });
    },

    setSpeed(speed) {
      set({ speed });
    },

    async submit(action) {
      const { client, latest } = get();
      if (!client || !latest) return { ok: false, code: 'NO_GAME' };
      const r = await client.submit(action, latest.version);
      if (!r.ok) {
        set({ lastError: r.code });
        if (r.code === 'STALE_VERSION') client.requestSnapshot();
      } else set({ lastError: null });
      return r;
    },
  }));
};

export type GameStore = ReturnType<typeof createGameStore>;

/** True while board animations are still catching up with the authoritative state. */
export const isAnimating = (s: GameStoreState): boolean => s.queue.length > 0 || s.current !== null;
