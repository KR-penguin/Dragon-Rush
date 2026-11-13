import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import type { OnlineSession } from '../src/services/onlineSession';
import { createOnlineLobbyStore } from '../src/store/onlineLobbyStore';
import { createNavStore } from '../src/store/navStore';

it('reconnects after the server replaces this tab with another session connection', async () => {
  const socket = new EventEmitter();
  const disconnect = vi.fn();
  const session = {
    socket,
    playerId: 'a',
    welcome: { resume: null },
    disconnect,
    onRoom: (listener: (room: null) => void) => {
      listener(null);
      return () => {};
    },
  } as unknown as OnlineSession;
  const connect = vi.fn().mockResolvedValue(session);
  const store = createOnlineLobbyStore({
    nav: createNavStore(),
    connect,
    fetchModels: async () => [],
    storage: { read: () => null, write: () => {} },
  });
  await store.getState().connect();
  socket.emit('disconnect', 'io server disconnect');
  expect(store.getState().connection).toBe('offline');
  expect(store.getState().errorCode).toBe('SESSION_REPLACED');
  await store.getState().connect();
  expect(connect).toHaveBeenCalledTimes(2);
  expect(store.getState().connection).toBe('connected');
  store.getState().disconnect();
});
