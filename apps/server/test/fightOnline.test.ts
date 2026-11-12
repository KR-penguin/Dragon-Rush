import {
  C2S,
  FIGHT_C2S,
  FIGHT_S2C,
  FightStartSchema,
  PROTOCOL_VERSION,
  S2C,
  decodeFightConfirm,
  encodeFightInput,
  type FightStartMsg,
  type GameUpdateMsg,
} from '@dragon-rush/protocol';
import { io, type Socket } from 'socket.io-client';
import { afterEach, expect, it } from 'vitest';
import { startServer, type ServerHandle } from '../src/app';

let server: ServerHandle | null = null;
const clients: Socket[] = [];
const config = {
  port: 0,
  host: '127.0.0.1',
  turnTimeoutMs: 5000,
  reconnectGraceMs: 2000,
  botActionDelayMs: 0,
  maxConsecutiveTimeouts: 3,
  modelsDir: 'nonexistent-models-dir',
  webDistDir: null,
  roomTtlMs: 60000,
  messagesPerSecond: 1000,
};
const event = <T>(socket: Socket, name: string, ms = 8000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, receive);
      reject(new Error(`timeout: ${name}`));
    }, ms);
    const receive = (value: T) => {
      clearTimeout(timer);
      resolve(value);
    };
    socket.once(name, receive);
  });
const call = (socket: Socket, name: string, payload: unknown = {}) =>
  socket.timeout(5000).emitWithAck(name, payload) as Promise<{
    ok: boolean;
    data?: { roomCode?: string };
  }>;
const connect = async (): Promise<Socket> => {
  const socket = io(server!.url, {
    transports: ['websocket'],
    auth: { protocolVersion: PROTOCOL_VERSION },
    forceNew: true,
    reconnection: false,
  });
  clients.push(socket);
  await event(socket, S2C.sessionWelcome);
  return socket;
};

afterEach(async () => {
  for (const socket of clients.splice(0)) socket.disconnect();
  await server?.close();
  server = null;
});

it('starts a server-authoritative dragon fight and confirms inputs to a fighter and spectator', async () => {
  server = await startServer(config, { quiet: true });
  const a = await connect();
  const b = await connect();
  const created = await call(a, C2S.roomCreate, { nickname: 'Alice' });
  expect(created.ok).toBe(true);
  const code = created.data?.roomCode;
  expect(code).toBeTruthy();
  expect((await call(b, C2S.roomJoin, { roomCode: code, nickname: 'Bob' })).ok).toBe(true);
  expect((await call(a, C2S.roomSelectJob, { job: 'swordsman' })).ok).toBe(true);
  expect((await call(b, C2S.roomSelectJob, { job: 'archer' })).ok).toBe(true);
  expect((await call(b, C2S.roomSetReady, { ready: true })).ok).toBe(true);
  const updateA = event<GameUpdateMsg>(a, S2C.gameUpdate);
  const updateB = event<GameUpdateMsg>(b, S2C.gameUpdate);
  expect((await call(a, C2S.roomStart)).ok).toBe(true);
  const [ua, ub] = await Promise.all([updateA, updateB]);
  const actor = ua.legalActions?.some((action) => action.type === 'CHALLENGE_DRAGON') ? a : b;
  const state = actor === a ? ua : ub;
  const startA = event<FightStartMsg>(a, FIGHT_S2C.start);
  const startB = event<FightStartMsg>(b, FIGHT_S2C.start);
  expect(
    (
      await call(actor, C2S.gameAction, {
        action: { type: 'CHALLENGE_DRAGON' },
        stateVersion: state.version,
      })
    ).ok,
  ).toBe(true);
  const [fa, fb] = await Promise.all([startA, startB]);
  expect(FightStartSchema.safeParse(fa).success).toBe(true);
  expect(FightStartSchema.safeParse(fb).success).toBe(true);
  expect(fa.fightId).toBe(fb.fightId);
  expect(fa.rulesHash).toBe(fb.rulesHash);
  const fighter = fa.you.role === 'fighter' ? a : b;
  const spectator = fighter === a ? b : a;
  expect((fighter === a ? fa : fb).you.role).toBe('fighter');
  expect((spectator === a ? fa : fb).you.role).toBe('spectator');
  const go = event<{ epochServerMs: number }>(fighter, FIGHT_S2C.go);
  fighter.emit(FIGHT_C2S.ready, { fightId: fa.fightId, inputDelay: 0, rttMs: 10, jitterMs: 0 });
  await go;
  const confirmFighter = event<unknown>(fighter, FIGHT_S2C.confirm);
  const confirmSpectator = event<unknown>(spectator, FIGHT_S2C.confirm);
  for (let tick = 1; tick <= 16; tick++)
    fighter.emit(
      FIGHT_C2S.input,
      encodeFightInput({ fightId: fa.fightId, newestTick: tick, ackConfirmTick: 0, masks: [0] }),
    );
  const [cf, cs] = await Promise.all([confirmFighter, confirmSpectator]);
  expect(decodeFightConfirm(cf)?.fightId).toBe(fa.fightId);
  expect(decodeFightConfirm(cs)?.ticks.length).toBeGreaterThan(0);
});
