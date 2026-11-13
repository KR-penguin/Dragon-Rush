import { Server } from 'socket.io';
import { afterEach, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { RoomManager } from '../src/rooms/RoomManager';
import { SessionStore } from '../src/session/SessionStore';
import { registerGateway } from '../src/socket/gateway';

afterEach(() => vi.useRealTimers());

it('clears stale room membership before expiring a session and preserves the reconnect grace', () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const sessions = new SessionStore();
  const rooms = new RoomManager();
  const disconnected = sessions.resolve(undefined);
  const room = rooms.create(disconnected.playerId, 'Alice');
  disconnected.roomCode = room.code;
  const connected = sessions.resolve(undefined);
  sessions.attach(connected, 'live-socket');
  const gateway = registerGateway(new Server(), {
    config: { ...loadConfig({}), roomTtlMs: 1000, reconnectGraceMs: 120000 },
    sessions,
    rooms,
    models: { get: () => null, list: () => [] },
    log: () => {},
  });
  try {
    vi.advanceTimersByTime(60000);
    expect(rooms.get(room.code)).toBeNull();
    expect(disconnected.roomCode).toBeNull();
    expect(sessions.player(disconnected.playerId)).toBe(disconnected);
    vi.advanceTimersByTime(60000);
    expect(sessions.player(disconnected.playerId)).toBeNull();
    expect(sessions.player(connected.playerId)).toBe(connected);
  } finally {
    gateway.dispose();
  }
});
