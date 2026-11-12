import type { Action } from '@dragon-rush/engine';
import {
  C2S,
  PROTOCOL_VERSION,
  S2C,
  type Ack,
  type GameUpdateMsg,
  type RoomStateMsg,
  type SeatStatusMsg,
  type SeatTakeoverMsg,
  type SessionWelcomeMsg,
} from '@dragon-rush/protocol';
import { io as connectClient, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type ServerHandle } from '../src/app';
import type { ServerConfig } from '../src/config';

const baseConfig = (over: Partial<ServerConfig> = {}): ServerConfig => ({
  port: 0,
  host: '127.0.0.1',
  turnTimeoutMs: 5_000,
  reconnectGraceMs: 2_000,
  botActionDelayMs: 0,
  maxConsecutiveTimeouts: 3,
  modelsDir: 'nonexistent-models-dir',
  webDistDir: null,
  roomTtlMs: 60_000,
  messagesPerSecond: 1000,
  ...over,
});

interface Client {
  socket: Socket;
  welcome: SessionWelcomeMsg;
  updates: GameUpdateMsg[];
  rooms: RoomStateMsg[];
  statuses: SeatStatusMsg[];
  takeovers: SeatTakeoverMsg[];
}

let server: ServerHandle;
const clients: Socket[] = [];

async function connect(token?: string, protocolVersion = PROTOCOL_VERSION): Promise<Client> {
  const socket = connectClient(server.url, {
    transports: ['websocket'],
    auth: { protocolVersion, ...(token ? { sessionToken: token } : {}) },
    reconnection: false,
    forceNew: true,
  });
  clients.push(socket);
  const c: Client = {
    socket,
    welcome: undefined as unknown as SessionWelcomeMsg,
    updates: [],
    rooms: [],
    statuses: [],
    takeovers: [],
  };
  socket.on(S2C.gameUpdate, (u: GameUpdateMsg) => c.updates.push(u));
  socket.on(S2C.gameSnapshot, (u: GameUpdateMsg) => c.updates.push({ ...u, events: [] }));
  socket.on(S2C.roomState, (r: RoomStateMsg) => c.rooms.push(r));
  socket.on(S2C.seatStatus, (s: SeatStatusMsg) => c.statuses.push(s));
  socket.on(S2C.seatTakeover, (s: SeatTakeoverMsg) => c.takeovers.push(s));
  c.welcome = await new Promise<SessionWelcomeMsg>((resolve, reject) => {
    socket.once(S2C.sessionWelcome, resolve);
    socket.once('connect_error', reject);
  });
  return c;
}

const call = <T = unknown>(c: Client, event: string, payload: unknown = {}) =>
  c.socket.timeout(5000).emitWithAck(event, payload) as Promise<Ack<T>>;

async function until(cond: () => boolean, ms = 15_000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}

const latest = (c: Client) => c.updates.at(-1)!;

/** Plays the first non-dragon legal action whenever this client must decide. */
function autoplay(c: Client): void {
  c.socket.on(S2C.gameUpdate, (u: GameUpdateMsg) => {
    if (!u.legalActions?.length) return;
    const action: Action =
      u.legalActions.find((a) => a.type !== 'CHALLENGE_DRAGON') ?? u.legalActions[0]!;
    void call(c, C2S.gameAction, { action, stateVersion: u.version });
  });
}

async function lobbyWithTwoHumans(extraBots = 0, maxRounds: number | null = 4) {
  const a = await connect();
  const b = await connect();
  const created = await call<{ roomCode: string }>(a, C2S.roomCreate, { nickname: 'Alice' });
  if (!created.ok) throw new Error('create failed');
  const code = created.data.roomCode;
  expect((await call(b, C2S.roomJoin, { roomCode: code, nickname: 'Bob' })).ok).toBe(true);
  for (let i = 0; i < extraBots; i++) {
    expect(
      (
        await call(a, C2S.roomConfigureSeat, {
          seat: 2 + i,
          kind: 'bot',
          botName: 'heuristic:growth',
        })
      ).ok,
    ).toBe(true);
  }
  expect((await call(a, C2S.roomConfigure, { maxRounds, quickCombat: true })).ok).toBe(true);
  expect((await call(a, C2S.roomSelectJob, { job: 'swordsman' })).ok).toBe(true);
  expect((await call(b, C2S.roomSelectJob, { job: 'archer' })).ok).toBe(true);
  expect((await call(b, C2S.roomSetReady, { ready: true })).ok).toBe(true);
  return { a, b, code };
}

beforeEach(async () => {
  server = await startServer(baseConfig(), { quiet: true });
});

afterEach(async () => {
  for (const s of clients.splice(0)) s.disconnect();
  await server.close();
});

describe('online multiplayer', () => {
  it('serves health and an empty model list', async () => {
    expect(await (await fetch(`${server.url}/health`)).json()).toEqual({ ok: true });
    expect(await (await fetch(`${server.url}/api/models`)).json()).toEqual({ models: [] });
  });

  it('refuses clients with another protocol version', async () => {
    await expect(connect(undefined, PROTOCOL_VERSION + 1)).rejects.toThrow('PROTOCOL_MISMATCH');
  });

  it('plays a full game with two humans and two bots', async () => {
    const { a, b } = await lobbyWithTwoHumans(2, 4);
    autoplay(a);
    autoplay(b);
    expect((await call(a, C2S.roomStart)).ok).toBe(true);
    await until(() => a.rooms.at(-1)?.status === 'finished', 30_000);
    expect(latest(a).publicState.outcome).not.toBeNull();
    expect(latest(a).seats).toHaveLength(4);
    expect(latest(a).yourSeat).not.toBe(latest(b).yourSeat);
  });

  it('enforces lobby rules', async () => {
    const { a, b, code } = await lobbyWithTwoHumans();
    expect(await call(b, C2S.roomStart)).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } });
    expect(await call(b, C2S.roomSelectJob, { job: 'swordsman' })).toMatchObject({
      ok: false,
      error: { code: 'JOB_TAKEN' },
    });
    expect(await call(a, C2S.roomJoin, { roomCode: 'ZZZZZZ', nickname: 'x' })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
    expect(await call(a, C2S.roomSelectJob, { job: 'wizard' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_PAYLOAD' },
    });
    const c = await connect();
    expect(await call(c, C2S.roomJoin, { roomCode: code, nickname: 'Carol' })).toMatchObject({
      ok: false,
      error: { code: 'ROOM_FULL' },
    });
  });

  it('rejects stale versions and actions from the wrong seat', async () => {
    const { a, b } = await lobbyWithTwoHumans();
    await call(a, C2S.roomStart);
    await until(() => a.updates.length > 0 && b.updates.length > 0);
    const actorClient = latest(a).legalActions ? a : b;
    const other = actorClient === a ? b : a;
    const u = latest(actorClient);
    expect(
      await call(other, C2S.gameAction, { action: { type: 'ROLL_DICE' }, stateVersion: u.version }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
    const action = u.legalActions!.find((x) => x.type === 'UPGRADE') ?? { type: 'ROLL_DICE' };
    expect((await call(actorClient, C2S.gameAction, { action, stateVersion: u.version })).ok).toBe(
      true,
    );
    expect(
      await call(actorClient, C2S.gameAction, { action, stateVersion: u.version }),
    ).toMatchObject({ ok: false, error: { code: 'STALE_VERSION' } });
  });

  it('applies default actions on timeout and hands the seat to a bot after three timeouts', async () => {
    await server.close();
    server = await startServer(baseConfig({ turnTimeoutMs: 120 }), { quiet: true });
    const { a, b } = await lobbyWithTwoHumans();
    await call(a, C2S.roomStart);
    await until(() => a.statuses.some((s) => s.controlledBy === 'bot'));
    const proxied = a.statuses.find((s) => s.controlledBy === 'bot')!.seat;
    expect(a.takeovers).toEqual([]);
    const owner = latest(a).yourSeat === proxied ? a : b;
    expect((await call(owner, C2S.gameRequestSnapshot)).ok).toBe(true);
    await until(() => a.statuses.some((s) => s.seat === proxied && s.controlledBy === 'human'));
  });

  it('announces a disconnected human bot takeover once per transition, not on snapshots or grace expiry', async () => {
    const { a, b } = await lobbyWithTwoHumans();
    await call(a, C2S.roomStart);
    await until(() => a.updates.length > 0 && b.updates.length > 0);
    const seat = latest(b).yourSeat;
    const token = b.welcome.sessionToken;

    b.socket.disconnect();
    await until(() => a.takeovers.length === 1);
    expect(a.takeovers).toEqual([{ seat, name: 'Bob' }]);
    expect(a.statuses.at(-1)).toMatchObject({ seat, connected: false, controlledBy: 'bot' });

    await call(a, C2S.gameRequestSnapshot);
    const resumed = await connect(token);
    await until(() => resumed.updates.length > 0 && a.statuses.at(-1)?.connected === true);
    expect(a.takeovers).toHaveLength(1);

    resumed.socket.disconnect();
    await until(() => a.takeovers.length === 2);
    expect(a.takeovers[1]).toEqual({ seat, name: 'Bob' });
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    expect(a.takeovers).toHaveLength(2);
  });

  it('announces an explicit game leave to the remaining player only once', async () => {
    const { a, b } = await lobbyWithTwoHumans();
    await call(a, C2S.roomStart);
    await until(() => a.updates.length > 0 && b.updates.length > 0);
    const seat = latest(b).yourSeat;

    expect((await call(b, C2S.roomLeave)).ok).toBe(true);
    await until(() => a.takeovers.length === 1);
    expect(a.takeovers).toEqual([{ seat, name: 'Bob' }]);
    expect(b.takeovers).toEqual([]);

    b.socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(a.takeovers).toHaveLength(1);
  });

  it('lets a disconnected player resume with the same session token', async () => {
    const { a, b } = await lobbyWithTwoHumans();
    await call(a, C2S.roomStart);
    await until(() => b.updates.length > 0);
    const token = b.welcome.sessionToken;
    const seat = latest(b).yourSeat;
    b.socket.disconnect();
    await until(() => a.statuses.some((s) => s.seat === seat && !s.connected));
    const b2 = await connect(token);
    expect(b2.welcome.resume).not.toBeNull();
    await until(() => b2.updates.length > 0);
    expect(latest(b2).yourSeat).toBe(seat);
    await until(() => a.statuses.some((s) => s.seat === seat && s.connected));
  });
});
