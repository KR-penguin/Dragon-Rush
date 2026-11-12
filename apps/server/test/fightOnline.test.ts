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
  server = await startServer({ ...config, turnTimeoutMs: 1000 }, { quiet: true });
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
  const combatUpdate = event<GameUpdateMsg>(actor, S2C.gameUpdate);
  const received: string[] = [];
  actor.on(S2C.gameUpdate, () => received.push(S2C.gameUpdate));
  actor.on(FIGHT_S2C.start, () => received.push(FIGHT_S2C.start));
  expect(
    (
      await call(actor, C2S.gameAction, {
        action: { type: 'CHALLENGE_DRAGON' },
        stateVersion: state.version,
      })
    ).ok,
  ).toBe(true);
  const [fa, fb] = await Promise.all([startA, startB]);
  const combat = await combatUpdate;
  expect(received.slice(0, 2)).toEqual([S2C.gameUpdate, FIGHT_S2C.start]);
  expect(combat.pending?.phase).toBe('COMBAT');
  expect(combat.pending?.timeLeftMs).toBeNull();
  expect(FightStartSchema.safeParse(fa).success).toBe(true);
  expect(FightStartSchema.safeParse(fb).success).toBe(true);
  expect(fa.fightId).toBe(fb.fightId);
  expect(fa.rulesHash).toBe(fb.rulesHash);
  const fighter = fa.you.role === 'fighter' ? a : b;
  const spectator = fighter === a ? b : a;
  expect((fighter === a ? fa : fb).you.role).toBe('fighter');
  expect((spectator === a ? fa : fb).you.role).toBe('spectator');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  expect(server.rooms.get(code!)?.game?.publicState.pending?.phase).toBe('COMBAT');
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

it('relays a duel input only after the other fighter commits, with a third seat spectating', async () => {
  server = await startServer(config, { quiet: true });
  const a = await connect();
  const b = await connect();
  const c = await connect();
  const created = await call(a, C2S.roomCreate, { nickname: 'Alice' });
  const code = created.data?.roomCode;
  expect(code).toBeTruthy();
  await call(a, C2S.roomConfigureSeat, { seat: 2, kind: 'human' });
  await call(b, C2S.roomJoin, { roomCode: code, nickname: 'Bob' });
  await call(c, C2S.roomJoin, { roomCode: code, nickname: 'Carol' });
  await call(a, C2S.roomSelectJob, { job: 'swordsman' });
  await call(b, C2S.roomSelectJob, { job: 'archer' });
  await call(c, C2S.roomSelectJob, { job: 'mage' });
  await call(b, C2S.roomSetReady, { ready: true });
  await call(c, C2S.roomSetReady, { ready: true });
  const starts = [
    event<FightStartMsg>(a, FIGHT_S2C.start),
    event<FightStartMsg>(b, FIGHT_S2C.start),
    event<FightStartMsg>(c, FIGHT_S2C.start),
  ];
  expect((await call(a, C2S.roomStart)).ok).toBe(true);
  const room = server.rooms.get(code!);
  const game = room?.game;
  expect(game).not.toBeNull();
  for (let i = 0; i < 1000 && game?.publicState.pending?.phase !== 'COMBAT' && !game?.isOver; i++) {
    const pending = game?.publicState.pending;
    if (!pending || !game || !room) break;
    const info = game.seatInfos().find((seat) => seat.seat === pending.actor)!;
    const pid = room.seats[info.lobbySeat]?.playerId;
    if (!pid) throw new Error('missing fighter player');
    const legal = game.snapshotFor(pid).legalActions ?? [];
    const action =
      legal.find((candidate) => candidate.type === 'SHIELD_DECISION' && candidate.use === false) ??
      legal.find((candidate) => candidate.type !== 'CHALLENGE_DRAGON') ??
      legal[0];
    if (!action) throw new Error('no board action');
    game.submit(pending.actor, action, game.version, 'human');
  }
  expect(game?.publicState.pending?.phase).toBe('COMBAT');
  const messages = await Promise.all(starts);
  expect(messages.every((message) => FightStartSchema.safeParse(message).success)).toBe(true);
  const sockets = [a, b, c];
  const fighters = sockets.filter((_, index) => messages[index]?.you.role === 'fighter');
  const spectator = sockets.find((_, index) => messages[index]?.you.role === 'spectator');
  expect(fighters).toHaveLength(2);
  expect(spectator).toBeDefined();
  const go = event(fighters[0]!, FIGHT_S2C.go);
  for (const socket of fighters)
    socket.emit(FIGHT_C2S.ready, {
      fightId: messages[0]!.fightId,
      inputDelay: 1,
      rttMs: 20,
      jitterMs: 0,
    });
  await go;
  let relays = 0;
  fighters[0]!.on(FIGHT_S2C.relay, () => {
    relays += 1;
  });
  fighters[1]!.emit(
    FIGHT_C2S.input,
    encodeFightInput({
      fightId: messages[0]!.fightId,
      newestTick: 1,
      ackConfirmTick: 0,
      masks: [0x13],
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(relays).toBe(0);
  const relay = event(fighters[0]!, FIGHT_S2C.relay);
  fighters[0]!.emit(
    FIGHT_C2S.input,
    encodeFightInput({
      fightId: messages[0]!.fightId,
      newestTick: 1,
      ackConfirmTick: 0,
      masks: [0],
    }),
  );
  await relay;
  expect(relays).toBeGreaterThan(0);
});
