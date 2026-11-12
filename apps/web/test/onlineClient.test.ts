import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { S2C } from '@dragon-rush/protocol';
import { startServer, type ServerHandle } from '../../server/src/app';
import type { GameUpdate } from '../src/services/gameClient';
import { OnlineSession } from '../src/services/onlineSession';
import { createGameStore } from '../src/store/gameStore';

let server: ServerHandle;

beforeAll(async () => {
  server = await startServer(
    {
      port: 0,
      host: '127.0.0.1',
      turnTimeoutMs: 5000,
      reconnectGraceMs: 2000,
      botActionDelayMs: 0,
      maxConsecutiveTimeouts: 3,
      modelsDir: 'none',
      webDistDir: null,
      roomTtlMs: 60_000,
      messagesPerSecond: 1000,
    },
    { quiet: true },
  );
});

afterAll(async () => {
  await server.close();
});

async function until(cond: () => boolean, ms = 20_000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('OnlineGameClient against a real server', () => {
  it('shows a named bot takeover in the game store once, even after a snapshot', async () => {
    const alice = await OnlineSession.connect(server.url);
    const bob = await OnlineSession.connect(server.url);
    const created = await alice.createRoom('Alice');
    if (!created.ok) throw new Error(created.error.code);
    expect((await bob.joinRoom(created.data.roomCode, 'Bob')).ok).toBe(true);
    await alice.configure(null, true);
    await alice.selectJob('mage');
    await bob.selectJob('ninja');
    await bob.setReady(true);

    const store = createGameStore();
    store.getState().attach(alice.createGameClient());
    expect((await alice.start()).ok).toBe(true);
    await until(() => store.getState().latest?.seats.length === 2);
    const bobSeat = store.getState().latest!.seats.find((seat) => seat.name === 'Bob')!.seat;

    bob.disconnect();
    await until(() => store.getState().notices[0]?.seat === bobSeat);
    expect(store.getState().notices[0]?.text).toBe('Bob님이 나갔습니다. 봇이 대신 플레이합니다.');
    expect(store.getState().log.filter((entry) => entry.text.includes('봇이 대신'))).toHaveLength(
      1,
    );

    const snapshot = new Promise<void>((resolve) =>
      alice.socket.once(S2C.gameSnapshot, () => resolve()),
    );
    store.getState().client?.requestSnapshot();
    await snapshot;
    expect(store.getState().log.filter((entry) => entry.text.includes('봇이 대신'))).toHaveLength(
      1,
    );
    store.getState().detach();
    alice.disconnect();
  });

  it('runs a lobby and a full game through the GameClient port', async () => {
    const alice = await OnlineSession.connect(server.url);
    const bob = await OnlineSession.connect(server.url);
    const created = await alice.createRoom('Alice');
    if (!created.ok) throw new Error(created.error.code);
    expect((await bob.joinRoom(created.data.roomCode, 'Bob')).ok).toBe(true);
    await alice.configureSeat({ seat: 2, kind: 'bot', botName: 'heuristic:rush' });
    await alice.configure(5, true);
    await alice.selectJob('mage');
    await bob.selectJob('ninja');
    await bob.setReady(true);

    const clients = [alice.createGameClient(), bob.createGameClient()];
    const latest: (GameUpdate | null)[] = [null, null];
    clients.forEach((client, i) => {
      client.subscribe((u) => {
        latest[i] = u;
        if (u.legalActions.length && u.pending) {
          const action =
            u.legalActions.find((a) => a.type !== 'CHALLENGE_DRAGON') ?? u.legalActions[0]!;
          void client.submit(action, u.version);
        }
      });
    });
    expect((await alice.start()).ok).toBe(true);
    await until(
      () => latest[0]?.publicState.outcome != null && latest[1]?.publicState.outcome != null,
    );
    expect(latest[0]!.seats).toHaveLength(3);
    expect(latest[0]!.controllableSeats).toHaveLength(1);
    expect(alice.room?.status).toBe('finished');
    for (const c of clients) c.dispose();
    alice.disconnect();
    bob.disconnect();
  });
});
