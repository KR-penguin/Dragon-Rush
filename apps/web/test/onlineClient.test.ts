import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type ServerHandle } from '../../server/src/app';
import type { GameUpdate } from '../src/services/gameClient';
import { OnlineSession } from '../src/services/onlineSession';

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
  it('runs a lobby and a full game through the GameClient port', async () => {
    const alice = await OnlineSession.connect(server.url);
    const bob = await OnlineSession.connect(server.url);
    const created = await alice.createRoom('Alice');
    if (!created.ok) throw new Error(created.error.code);
    expect((await bob.joinRoom(created.data.roomCode, 'Bob')).ok).toBe(true);
    await alice.configureSeat({ seat: 2, kind: 'bot', botName: 'heuristic:rush' });
    await alice.configure(5);
    await alice.selectJob('mage');
    await bob.selectJob('ninja');
    await bob.setReady(true);

    const clients = [alice.createGameClient(), bob.createGameClient()];
    const latest: (GameUpdate | null)[] = [null, null];
    clients.forEach((client, i) => {
      client.subscribe((u) => {
        latest[i] = u;
        if (u.legalActions.length && u.pending) {
          const action = u.legalActions.find((a) => a.type !== 'CHALLENGE_DRAGON') ?? u.legalActions[0]!;
          void client.submit(action, u.version);
        }
      });
    });
    expect((await alice.start()).ok).toBe(true);
    await until(() => latest[0]?.publicState.outcome != null && latest[1]?.publicState.outcome != null);
    expect(latest[0]!.seats).toHaveLength(3);
    expect(latest[0]!.controllableSeats).toHaveLength(1);
    expect(alice.room?.status).toBe('finished');
    for (const c of clients) c.dispose();
    alice.disconnect();
    bob.disconnect();
  });
});
