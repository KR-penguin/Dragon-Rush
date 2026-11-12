import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer, type ServerHandle } from '../../server/src/app';
import { fetchModels } from '../src/services/modelCatalog';
import { OnlineSession } from '../src/services/onlineSession';
import type { GameStore } from '../src/store/gameStore';
import { createNavStore, type NavStore } from '../src/store/navStore';
import { createOnlineLobbyStore, type OnlineLobbyStore } from '../src/store/onlineLobbyStore';
import { buildRoomView, errorText } from '../src/types/onlineLobby';

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

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    read: (k: string) => map.get(k) ?? null,
    write: (k: string, v: string) => void map.set(k, v),
  };
};

interface Player {
  lobby: OnlineLobbyStore;
  nav: NavStore;
  sessions: OnlineSession[];
}

/** One browser tab: its own nav store and lobby store, talking to the test server. */
function player(nickname: string): Player {
  const nav = createNavStore();
  const sessions: OnlineSession[] = [];
  const lobby = createOnlineLobbyStore({
    nav,
    connect: async () => {
      const s = await OnlineSession.connect(server.url);
      sessions.push(s);
      return s;
    },
    fetchModels: () => fetchModels(server.url),
    storage: memoryStorage(),
  });
  lobby.getState().setNickname(nickname);
  return { lobby, nav, sessions };
}

/** Whenever the opened Game page has a decision for this player, submits the first non-dragon action. */
function autoplay(nav: NavStore): () => void {
  let watched: GameStore | null = null;
  let offGame: (() => void) | null = null;
  const watch = (store: GameStore) => {
    offGame?.();
    watched = store;
    let submitted = -1;
    const act = () => {
      const latest = store.getState().latest;
      if (!latest?.pending || latest.legalActions.length === 0 || latest.version === submitted)
        return;
      submitted = latest.version;
      const action =
        latest.legalActions.find((a) => a.type !== 'CHALLENGE_DRAGON') ?? latest.legalActions[0]!;
      void store.getState().submit(action);
    };
    offGame = store.subscribe(act);
    act();
  };
  const onRoute = () => {
    const route = nav.getState().route;
    if (route.page === 'game' && route.session.store !== watched) watch(route.session.store);
  };
  const offNav = nav.subscribe(onRoute);
  onRoute();
  return () => {
    offNav();
    offGame?.();
  };
}

const gameOver = (p: Player) => {
  const route = p.nav.getState().route;
  return (
    route.page === 'game' && route.session.store.getState().latest?.publicState.outcome != null
  );
};

describe('online lobby store against a real server', () => {
  it('creates, joins, configures, starts, plays and returns to the finished room', async () => {
    expect(await fetchModels(server.url)).toEqual([]);
    const alice = player('Alice');
    const bob = player('Bob');
    await alice.lobby.getState().connect();
    await bob.lobby.getState().connect();
    expect(alice.lobby.getState().connection).toBe('connected');

    const a = alice.lobby.getState();
    const b = bob.lobby.getState();
    expect(await a.createRoom()).toBe(true);
    const code = alice.lobby.getState().room!.roomCode;

    b.setJoinCode(code === 'ZZZZZZ' ? 'YYYYYY' : 'zzzzzz');
    expect(await b.joinRoom()).toBe(false);
    expect(bob.lobby.getState().errorCode).toBe('ROOM_NOT_FOUND');
    expect(bob.lobby.getState().error).toBe(errorText('ROOM_NOT_FOUND'));
    b.setJoinCode(code.toLowerCase());
    expect(await b.joinRoom()).toBe(true);
    expect(bob.lobby.getState().error).toBeNull();
    await until(() => alice.lobby.getState().room?.seats[1]?.nickname === 'Bob');

    expect(await a.configureSeat(2, 'bot:heuristic:rush')).toBe(true);
    expect(await b.configureSeat(3, 'bot:heuristic')).toBe(false);
    expect(bob.lobby.getState().errorCode).toBe('NOT_HOST');
    expect(await a.setMaxRounds(3)).toBe(true);
    // This test exercises lobby navigation and board completion. Real-time online PvP has
    // its own integration test; settle incidental collisions immediately in this one.
    expect((await alice.sessions[0]!.configure(3, true)).ok).toBe(true);
    await until(() => alice.lobby.getState().room?.options.quickCombat === true);
    expect(await a.selectJob('mage')).toBe(true);
    expect(await b.selectJob('mage')).toBe(true);
    expect(bob.lobby.getState().error).toBeNull();
    expect(await a.selectJob('archer', 2)).toBe(true);
    await until(() => alice.lobby.getState().room?.seats[1]?.job === 'mage');

    const blocked = buildRoomView(alice.lobby.getState().room!, alice.lobby.getState().playerId!);
    expect(blocked.start.reasons).toEqual(['Bob님이 아직 준비하지 않았습니다.']);
    expect(blocked.seats[2]).toMatchObject({ kind: 'bot', job: 'archer', title: '봇 · 용 러시형' });
    expect(await a.start()).toBe(false);
    expect(alice.lobby.getState().errorCode).toBe('NOT_READY');

    expect(await b.setReady(true)).toBe(true);
    await until(() => alice.lobby.getState().room?.seats[1]?.ready === true);
    expect(
      buildRoomView(alice.lobby.getState().room!, alice.lobby.getState().playerId!).start.canStart,
    ).toBe(true);

    const stops = [autoplay(alice.nav), autoplay(bob.nav)];
    expect(await a.start()).toBe(true);
    // Both tabs open the Game page on their own when the room starts playing.
    await until(
      () => alice.nav.getState().route.page === 'game' && bob.nav.getState().route.page === 'game',
    );
    const route = alice.nav.getState().route;
    if (route.page !== 'game') throw new Error('game not open');
    expect(route.session.exitTo).toBe('online');
    expect(route.session.restart).toBeNull();
    expect(route.session.store.getState().client?.mode).toBe('online');
    await until(() => route.session.store.getState().latest !== null);
    expect(
      route.session.store.getState().latest?.publicState.players.filter((p) => p.job === 'mage'),
    ).toHaveLength(2);

    await until(() => gameOver(alice) && gameOver(bob), 60_000);
    const latest = route.session.store.getState().latest!;
    expect(latest.seats).toHaveLength(3);
    expect(latest.controllableSeats).toHaveLength(1);
    expect(latest.publicState.rules.maxRounds).toBe(3);
    await until(() => alice.lobby.getState().room?.status === 'finished');

    // "로비로" from the result screen shows the finished room instead of reopening the game.
    alice.nav.getState().go('online');
    expect(alice.nav.getState().route.page).toBe('online');
    expect(
      buildRoomView(alice.lobby.getState().room!, alice.lobby.getState().playerId!).status,
    ).toBe('finished');
    // "결과 보기" opens a fresh client that recovers the final state from a snapshot.
    a.openGame();
    expect(alice.nav.getState().route.page).toBe('game');
    await until(() => gameOver(alice));

    for (const stop of stops) stop();
    alice.nav.getState().go('online');
    expect(await b.rematch()).toBe(false);
    expect(bob.lobby.getState().errorCode).toBe('NOT_HOST');
    expect(await a.rematch()).toBe(true);
    await until(() => bob.lobby.getState().room?.status === 'lobby');
    expect(bob.nav.getState().route.page).toBe('online');
    expect(alice.lobby.getState().room).toMatchObject({ roomCode: code, status: 'lobby' });
    expect(bob.lobby.getState().room?.seats[1]?.ready).toBe(false);
    expect(await a.start()).toBe(false);
    expect(alice.lobby.getState().errorCode).toBe('NOT_READY');
    expect(await b.setReady(true)).toBe(true);
    expect(await a.start()).toBe(true);
    await until(
      () => alice.nav.getState().route.page === 'game' && bob.nav.getState().route.page === 'game',
    );
    const rematchRoute = alice.nav.getState().route;
    if (rematchRoute.page !== 'game') throw new Error('rematch game not open');
    await until(() => rematchRoute.session.store.getState().latest !== null);
    expect(rematchRoute.session.store.getState().latest!.version).toBeLessThan(latest.version);
    expect(rematchRoute.session.store.getState().latest?.publicState.outcome).toBeNull();
    expect(rematchRoute.session.store.getState().latest?.fight).toBeNull();
    alice.nav.getState().go('online');
    bob.nav.getState().go('online');
    expect(await a.leaveRoom()).toBe(true);
    expect(alice.lobby.getState().room).toBeNull();
    a.disconnect();
    b.disconnect();
    expect(alice.lobby.getState().connection).toBe('idle');
  }, 75_000);

  it('keeps the session and seat when the socket reconnects on its own', async () => {
    const carol = player('Carol');
    const seen: string[] = [];
    carol.lobby.subscribe((s) => {
      if (seen.at(-1) !== s.connection) seen.push(s.connection);
    });
    await carol.lobby.getState().connect();
    expect(await carol.lobby.getState().createRoom()).toBe(true);
    const code = carol.lobby.getState().room!.roomCode;
    const playerId = carol.lobby.getState().playerId;

    carol.sessions[0]!.socket.io.engine.close();
    await until(
      () => seen.includes('reconnecting') && carol.lobby.getState().connection === 'connected',
    );
    await until(() => carol.lobby.getState().room?.seats[0]?.connected === true);
    expect(carol.lobby.getState().room?.roomCode).toBe(code);
    expect(carol.lobby.getState().room?.seats[0]?.playerId).toBe(playerId);
    expect(carol.lobby.getState().room?.hostId).toBe(playerId);

    await carol.lobby.getState().leaveRoom();
    carol.lobby.getState().disconnect();
  });

  it('resumes the previous room when the page connects again with the stored token', async () => {
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => void stored.set(k, v),
      removeItem: (k: string) => void stored.delete(k),
    });
    try {
      const first = player('Dave');
      await first.lobby.getState().connect();
      expect(await first.lobby.getState().createRoom()).toBe(true);
      const code = first.lobby.getState().room!.roomCode;
      first.lobby.getState().disconnect();

      const again = player('Dave');
      await again.lobby.getState().connect();
      await until(() => again.lobby.getState().room !== null);
      expect(again.lobby.getState().room?.roomCode).toBe(code);
      expect(again.lobby.getState().resumeCode).toBeNull();
      expect(again.lobby.getState().playerId).toBe(again.lobby.getState().room?.hostId);

      await again.lobby.getState().leaveRoom();
      again.lobby.getState().disconnect();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
