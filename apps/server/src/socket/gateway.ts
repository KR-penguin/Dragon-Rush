import { randomInt } from 'node:crypto';
import { DEFAULT_RULES, withRules, type GameEvent } from '@dragon-rush/engine';
import { createModelPolicy, createPolicyByName } from '@dragon-rush/ai';
import {
  C2S,
  FIGHT_C2S,
  FightAwaySchema,
  FightBackSchema,
  FightReadySchema,
  FightRequestSyncSchema,
  FightStatsSchema,
  decodeFightAck,
  decodeFightInput,
  decodeFightPing,
  fail,
  GameActionSchema,
  GameRequestSnapshotSchema,
  HandshakeAuthSchema,
  ok,
  PROTOCOL_VERSION,
  RoomConfigureSchema,
  RoomConfigureSeatSchema,
  RoomCreateSchema,
  RoomJoinSchema,
  RoomLeaveSchema,
  RoomSelectJobSchema,
  RoomSetReadySchema,
  RoomStartSchema,
  RoomRematchSchema,
  S2C,
  type Ack,
} from '@dragon-rush/protocol';
import type { Server, Socket } from 'socket.io';
import type { ZodType } from 'zod';
import type { ModelRegistry } from '../ai/modelRegistry';
import type { ServerConfig } from '../config';
import { ProtocolError } from '../errors';
import { FightRoom } from '../fight/FightRoom';
import { GameSession, type SessionSeatSetup } from '../game/GameSession';
import type { Room } from '../rooms/Room';
import type { RoomManager } from '../rooms/RoomManager';
import type { Session, SessionStore } from '../session/SessionStore';
import { createRateLimiter } from './rateLimit';

export interface GatewayDeps {
  config: ServerConfig;
  sessions: SessionStore;
  rooms: RoomManager;
  models: ModelRegistry;
  log: (msg: string) => void;
}

const channel = (room: Room) => `room:${room.code}`;
const random = () => randomInt(0, 2 ** 31) / 2 ** 31;
const BOT_LABEL: Record<string, string> = {
  heuristic: '봇',
  'heuristic:aggro': '공격형 봇',
  'heuristic:growth': '성장형 봇',
  'heuristic:rush': '용 러시 봇',
  random: '무작위 봇',
};

/** Wires Socket.IO events to rooms, sessions and authoritative game sessions. */
export function registerGateway(io: Server, deps: GatewayDeps): { dispose(): void } {
  const { config, sessions, rooms, models, log } = deps;
  const lobbyGrace = new Map<string, ReturnType<typeof setTimeout>>();
  const fights = new Map<string, FightRoom>();
  let scheduler: ReturnType<typeof setTimeout> | null = null;
  let planned = performance.now();
  const schedule = () => {
    if (fights.size === 0) {
      scheduler = null;
      return;
    }
    const delay = planned - performance.now();
    scheduler = setTimeout(wake, Math.max(0, delay - 1));
  };
  const stepAll = () => {
    const now = performance.now();
    for (const [code, fight] of fights) {
      fight.advance(now);
      if (fight.isEnded) {
        fight.dispose();
        fights.delete(code);
      }
    }
    planned = now + 1000 / 60;
    schedule();
  };
  const wake = () => {
    const late = performance.now() - planned > 1000 / 30;
    if (late) setImmediate(stepAll);
    else stepAll();
  };

  const emitTo = (playerId: string, event: string, payload: unknown) => {
    const socketId = sessions.player(playerId)?.socketId;
    if (socketId) io.to(socketId).emit(event, payload);
  };
  const broadcastRoom = (room: Room) => {
    room.lastActivity = Date.now();
    io.to(channel(room)).emit(S2C.roomState, room.toState());
  };

  const startGame = (room: Room, hostId: string) => {
    const active = room.prepareStart(hostId, random);
    const seats: SessionSeatSetup[] = active.map((s) => {
      const base = { lobbySeat: s.seat, playerId: s.playerId, job: s.job! };
      if (s.kind === 'human')
        return { ...base, kind: 'human', name: s.nickname ?? `P${s.seat + 1}` };
      if (s.kind === 'model') {
        const model = models.get(s.modelId ?? '');
        if (!model) throw new ProtocolError('MODEL_NOT_FOUND');
        return {
          ...base,
          kind: 'model',
          name: `모델 ${s.modelId}`,
          policy: createModelPolicy(model, { onFallback: (r) => log(`model ${s.modelId}: ${r}`) }),
        };
      }
      const botName = s.botName ?? 'heuristic';
      return {
        ...base,
        kind: 'bot',
        name: BOT_LABEL[botName] ?? '봇',
        botName,
        policy: createPolicyByName(botName, random),
      };
    });
    const game = new GameSession(
      {
        seats,
        rules: withRules(
          {
            maxRounds: room.options.maxRounds,
            combat: {
              ...DEFAULT_RULES.combat,
              mode: room.options.quickCombat ? 'dice' : 'external',
            },
          },
          DEFAULT_RULES,
        ),
        quickCombat: room.options.quickCombat,
        seed: randomInt(0, 2 ** 47),
        turnTimeoutMs: config.turnTimeoutMs,
        reconnectGraceMs: config.reconnectGraceMs,
        botActionDelayMs: config.botActionDelayMs,
        maxConsecutiveTimeouts: config.maxConsecutiveTimeouts,
      },
      {
        update: (events: GameEvent[]) => {
          room.lastActivity = Date.now();
          for (const pid of room.members) emitTo(pid, S2C.gameUpdate, game.updateFor(pid, events));
        },
        seatStatus: (msg) => io.to(channel(room)).emit(S2C.seatStatus, msg),
        seatTakeover: (msg) => io.to(channel(room)).emit(S2C.seatTakeover, msg),
        ended: () => {
          room.status = 'finished';
          broadcastRoom(room);
        },
        fightStarted: (fight) => {
          const live = new FightRoom(io, room, sessions, game, {
            ...fight,
            request: fight.request,
          });
          fights.set(room.code, live);
          if (!scheduler) {
            planned = performance.now();
            schedule();
          }
        },
      },
    );
    room.game = game;
    room.status = 'playing';
    broadcastRoom(room);
    for (const pid of room.members)
      emitTo(pid, S2C.gameUpdate, game.updateFor(pid, game.initialEvents));
    game.start();
  };

  const leaveRoom = (session: Session, socket: Socket | null) => {
    const room = session.roomCode ? rooms.get(session.roomCode) : null;
    session.roomCode = null;
    if (!room) return;
    socket?.leave(channel(room));
    if (room.game && !room.game.isOver) room.game.disconnect(session.playerId);
    const empty = room.leave(session.playerId);
    if (empty && room.status !== 'playing') rooms.delete(room.code);
    else broadcastRoom(room);
  };

  io.use((socket, next) => {
    const auth = HandshakeAuthSchema.safeParse(socket.handshake.auth ?? {});
    if (!auth.success) return next(new Error('INVALID_PAYLOAD'));
    if (auth.data.protocolVersion !== PROTOCOL_VERSION) return next(new Error('PROTOCOL_MISMATCH'));
    socket.data.sessionToken = auth.data.sessionToken;
    next();
  });

  io.on('connection', (socket) => {
    const session = sessions.resolve(socket.data.sessionToken as string | undefined);
    const previous = sessions.attach(session, socket.id);
    if (previous) io.sockets.sockets.get(previous)?.disconnect(true);
    const limiter = createRateLimiter(config.messagesPerSecond);
    const currentRoom = () => (session.roomCode ? rooms.get(session.roomCode) : null);

    let room = currentRoom();
    if (session.roomCode && !room) session.roomCode = null;
    socket.emit(S2C.sessionWelcome, {
      sessionToken: session.token,
      playerId: session.playerId,
      resume: room ? { roomCode: room.code } : null,
    });
    if (room) {
      const grace = lobbyGrace.get(session.playerId);
      if (grace) clearTimeout(grace);
      lobbyGrace.delete(session.playerId);
      socket.join(channel(room));
      room.setConnected(session.playerId, true);
      room.game?.reconnect(session.playerId);
      broadcastRoom(room);
      if (room.game) socket.emit(S2C.gameSnapshot, room.game.snapshotFor(session.playerId));
      fights.get(room.code)?.sendStart(session.playerId);
    }

    const on = <T>(event: string, schema: ZodType<T>, handler: (data: T) => unknown) => {
      socket.on(event, (payload: unknown, ack?: (res: Ack<unknown>) => void) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!limiter()) return reply(fail('RATE_LIMITED'));
        const parsed = schema.safeParse(payload ?? {});
        if (!parsed.success) return reply(fail('INVALID_PAYLOAD', parsed.error.message));
        try {
          currentRoom()?.game?.humanActivity(session.playerId);
          reply(ok(handler(parsed.data) ?? {}));
        } catch (e) {
          if (e instanceof ProtocolError) reply(fail(e.code, e.message));
          else {
            log(`handler ${event} failed: ${(e as Error).stack ?? e}`);
            reply(fail('INTERNAL'));
          }
        }
      });
    };

    const requireRoom = (): Room => {
      const r = currentRoom();
      if (!r) throw new ProtocolError('NOT_IN_ROOM');
      return r;
    };

    on(C2S.roomCreate, RoomCreateSchema, ({ nickname }) => {
      leaveRoom(session, socket);
      const r = rooms.create(session.playerId, nickname);
      session.nickname = nickname;
      session.roomCode = r.code;
      socket.join(channel(r));
      broadcastRoom(r);
      return { roomCode: r.code, seat: 0 };
    });

    on(C2S.roomJoin, RoomJoinSchema, ({ roomCode, nickname }) => {
      const r = rooms.get(roomCode);
      if (!r) throw new ProtocolError('ROOM_NOT_FOUND');
      if (session.roomCode && session.roomCode !== r.code) leaveRoom(session, socket);
      const seat = r.join(session.playerId, nickname);
      session.nickname = nickname;
      session.roomCode = r.code;
      socket.join(channel(r));
      broadcastRoom(r);
      if (r.game) {
        r.game.reconnect(session.playerId);
        socket.emit(S2C.gameSnapshot, r.game.snapshotFor(session.playerId));
        fights.get(r.code)?.sendStart(session.playerId);
      }
      return { roomCode: r.code, seat: seat.seat };
    });

    on(C2S.roomLeave, RoomLeaveSchema, () => {
      leaveRoom(session, socket);
    });

    on(C2S.roomConfigure, RoomConfigureSchema, ({ maxRounds, quickCombat }) => {
      const r = requireRoom();
      r.configure(session.playerId, maxRounds, quickCombat);
      broadcastRoom(r);
    });

    on(C2S.roomConfigureSeat, RoomConfigureSeatSchema, (p) => {
      const r = requireRoom();
      r.configureSeat(session.playerId, p, (id) => models.get(id) !== null);
      broadcastRoom(r);
    });

    on(C2S.roomSelectJob, RoomSelectJobSchema, ({ job, seat }) => {
      const r = requireRoom();
      r.selectJob(session.playerId, job, seat);
      broadcastRoom(r);
    });

    on(C2S.roomSetReady, RoomSetReadySchema, ({ ready }) => {
      const r = requireRoom();
      r.setReady(session.playerId, ready);
      broadcastRoom(r);
    });

    on(C2S.roomStart, RoomStartSchema, () => {
      startGame(requireRoom(), session.playerId);
    });

    on(C2S.roomRematch, RoomRematchSchema, () => {
      const r = requireRoom();
      r.rematch(session.playerId);
      const fight = fights.get(r.code);
      if (fight) {
        fight.dispose();
        fights.delete(r.code);
      }
      broadcastRoom(r);
    });

    on(C2S.gameAction, GameActionSchema, ({ action, stateVersion }) => {
      const game = requireRoom().game;
      if (!game) throw new ProtocolError('NOT_YOUR_TURN', 'game not started');
      const seat = game.seatOf(session.playerId);
      if (seat === null) throw new ProtocolError('NOT_YOUR_TURN');
      return { version: game.submit(seat, action, stateVersion, 'human') };
    });

    on(C2S.gameRequestSnapshot, GameRequestSnapshotSchema, () => {
      const game = requireRoom().game;
      if (game) socket.emit(S2C.gameSnapshot, game.snapshotFor(session.playerId));
    });

    const fight = () => {
      const r = currentRoom();
      return r ? fights.get(r.code) : undefined;
    };
    const inputLimit = createRateLimiter(120, Date.now, 60);
    const pingLimit = createRateLimiter(20);
    const ackLimit = createRateLimiter(10);
    const otherLimit = createRateLimiter(10);
    socket.on(FIGHT_C2S.input, (raw: unknown) => {
      if (inputLimit() && decodeFightInput(raw)) fight()?.input(session.playerId, raw);
    });
    socket.on(FIGHT_C2S.ping, (raw: unknown) => {
      if (pingLimit() && decodeFightPing(raw)) fight()?.ping(session.playerId, raw);
    });
    socket.on(FIGHT_C2S.ack, (raw: unknown) => {
      if (ackLimit() && decodeFightAck(raw)) fight()?.ackFrom(session.playerId, raw);
    });
    socket.on(FIGHT_C2S.ready, (raw: unknown) => {
      const p = FightReadySchema.safeParse(raw);
      if (otherLimit() && p.success && fight()?.authority.fightId === p.data.fightId)
        fight()?.readyFrom(session.playerId);
    });
    socket.on(FIGHT_C2S.away, (raw: unknown) => {
      const p = FightAwaySchema.safeParse(raw);
      if (otherLimit() && p.success && fight()?.authority.fightId === p.data.fightId)
        fight()?.away(session.playerId);
    });
    socket.on(FIGHT_C2S.back, (raw: unknown) => {
      const p = FightBackSchema.safeParse(raw);
      if (otherLimit() && p.success && fight()?.authority.fightId === p.data.fightId)
        fight()?.back(session.playerId);
    });
    socket.on(FIGHT_C2S.requestSync, (raw: unknown) => {
      const p = FightRequestSyncSchema.safeParse(raw);
      if (otherLimit() && p.success && fight()?.authority.fightId === p.data.fightId)
        fight()?.requestSync(session.playerId, p.data.reason);
    });
    socket.on(FIGHT_C2S.stats, (raw: unknown) => {
      if (otherLimit()) FightStatsSchema.safeParse(raw);
    });

    socket.on('disconnect', () => {
      const s = sessions.detach(socket.id);
      if (!s || s.socketId) return;
      room = currentRoom();
      if (!room) return;
      room.setConnected(s.playerId, false);
      fights.get(room.code)?.away(s.playerId);
      if (room.game && !room.game.isOver) room.game.disconnect(s.playerId);
      else if (room.status !== 'playing') {
        const r = room;
        lobbyGrace.set(
          s.playerId,
          setTimeout(() => {
            lobbyGrace.delete(s.playerId);
            if (s.socketId) return;
            leaveRoom(s, null);
            if (r.members.size === 0) rooms.delete(r.code);
          }, config.reconnectGraceMs),
        );
      }
      broadcastRoom(room);
    });
  });

  const sweeper = setInterval(() => {
    rooms.sweep(config.roomTtlMs, (r) =>
      [...r.members].some((pid) => sessions.player(pid)?.socketId),
    );
  }, 60_000);
  sweeper.unref();

  return {
    dispose() {
      clearInterval(sweeper);
      if (scheduler) clearTimeout(scheduler);
      for (const fight of fights.values()) fight.dispose();
      for (const t of lobbyGrace.values()) clearTimeout(t);
    },
  };
}
