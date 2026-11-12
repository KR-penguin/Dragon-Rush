import { performance } from 'node:perf_hooks';
import {
  createCombatBot,
  hashCombatRules,
  COMBAT_PACK_VERSION,
  DEFAULT_COMBAT_RULES,
  policyRandom,
  type CombatPolicy,
  type CombatState,
} from '@dragon-rush/combat';
import { isActionable } from '@dragon-rush/combat-ai';
import {
  decodeFightAck,
  decodeFightInput,
  decodeFightPing,
  encodeFightConfirm,
  encodeFightPong,
  encodeFightRelay,
  FIGHT_S2C,
  type FightStartMsg,
  type FightRequestSync,
  type FightSyncReason,
  packQuality,
  type SeatQuality,
} from '@dragon-rush/protocol';
import {
  FightAuthority,
  NETCODE_VERSION,
  READY_TIMEOUT_MS,
  INTRO_MS,
  GO_LEAD_MS,
  TICK_MS,
  CONFIRM_EVERY,
  MAX_STEPS_PER_WAKE,
  BACKLOG_DISCONNECT,
  SPECTATOR_BACKLOG_PAUSE,
  combatBuildId,
  inputToMask,
} from '@dragon-rush/netcode';
import type { Server } from 'socket.io';
import type { Room } from '../rooms/Room';
import type { SessionStore } from '../session/SessionStore';
import type { GameSession } from '../game/GameSession';

export interface FightLaunch {
  id: number;
  seed: number;
  setup: FightStartMsg['setup'];
  request: { a: number; b: number | null };
}

/** Socket.IO shell around the deterministic authority. One instance belongs to one board fight. */
export class FightRoom {
  readonly authority: FightAuthority;
  readonly players: readonly (string | null)[];
  readonly startedAt = performance.now();
  epochMs: number | null = null;
  private ready = new Set<string>();
  private lastConfirm = 0;
  private readonly ack = new Map<string, number>();
  private readonly sent = new Map<string, number>();
  private readonly paused = new Set<string>();
  private readonly syncRequestedAt = new Map<string, number>();
  private readonly desyncs = new Map<string, number>();
  private ended = false;
  private readonly bot: readonly CombatPolicy[];
  private readonly random: () => number;
  private readonly botMaskHeld: [number, number] = [0, 0];
  private readonly botLive: [number, number] = [0, 0];
  private readonly goTimeout: ReturnType<typeof setTimeout>;

  constructor(
    private readonly io: Server,
    private readonly room: Room,
    private readonly sessions: SessionStore,
    private readonly game: GameSession,
    private readonly launch: FightLaunch,
  ) {
    const seats = game.seatInfos();
    // seatInfos is public; map engine seats to authenticated player IDs through the room lobby.
    this.players = [launch.request.a, launch.request.b].map((engineSeat) => {
      if (engineSeat === null) return null;
      const info = seats.find((s) => s.seat === engineSeat);
      return info ? (room.seats[info.lobbySeat]?.playerId ?? null) : null;
    });
    this.random = policyRandom(launch.seed, 7);
    this.bot = [createCombatBot('balanced'), createCombatBot('balanced')];
    const controllers = [0, 1].map((i) => {
      const engineSeat = i === 0 ? launch.request.a : launch.request.b;
      return engineSeat === null
        ? 'bot'
        : (seats.find((s) => s.seat === engineSeat)?.controlledBy ?? 'bot');
    }) as ('human' | 'bot')[];
    this.authority = new FightAuthority({
      fightId: launch.id,
      setup: launch.setup,
      seed: launch.seed,
      rules: this.rules,
      controllers,
      botMask: (state, seat) => this.botMask(state, seat),
    });
    for (const pid of room.members) this.sendStart(pid);
    this.goTimeout = setTimeout(() => this.go(), READY_TIMEOUT_MS);
    if (controllers.every((controller) => controller === 'bot'))
      setImmediate(() => this.runHeadless());
  }

  private runHeadless(): void {
    if (this.ended) return;
    clearTimeout(this.goTimeout);
    let wall = 0;
    while (!this.authority.result && wall < this.rules.timeLimit[this.launch.setup.kind] + 1) {
      wall += 120;
      this.authority.advanceTo(wall, wall * TICK_MS);
      this.authority.drain();
    }
    const result = this.authority.result;
    if (!result) throw new Error('headless combat did not finish');
    const inputs: number[] = [];
    for (const row of this.authority.log) {
      const n = inputs.length;
      if (n >= 3 && inputs[n - 2] === row.a && inputs[n - 1] === row.b && inputs[n - 3]! < 65535)
        inputs[n - 3]! += 1;
      else inputs.push(1, row.a, row.b);
    }
    for (const pid of this.room.members) {
      this.emit(pid, FIGHT_S2C.replay, {
        fightId: this.launch.id,
        seed: this.launch.seed,
        setup: this.launch.setup,
        rules: this.rules,
        inputs,
        endTick: this.authority.tick,
        outcome: result,
        finalHash: this.authority.hash,
      });
      this.emit(pid, FIGHT_S2C.end, {
        fightId: this.launch.id,
        endTick: this.authority.tick,
        outcome: result,
        finalHash: this.authority.hash,
      });
    }
    this.ended = true;
    this.game.submitCombatResult(this.launch.id, result);
  }

  private get rules() {
    // The server's effective combat rules are locked for the entire fight.
    return DEFAULT_COMBAT_RULES;
  }

  private botMask(state: CombatState, seat: 0 | 1): number {
    if (state.hitstop === 0) {
      if (this.botLive[seat] % 4 === 0) {
        this.botMaskHeld[seat] = isActionable(state, seat === 0 ? 'a' : 'b', 4)
          ? inputToMask(this.bot[seat]!.decide(state, seat === 0 ? 'a' : 'b', this.random))
          : 0;
      }
      this.botLive[seat] += 1;
    }
    return this.botMaskHeld[seat];
  }

  private emit(pid: string, event: string, payload: unknown): void {
    const id = this.sessions.player(pid)?.socketId;
    if (id) this.io.to(id).emit(event, payload);
  }

  roleOf(pid: string): 0 | 1 | null {
    const i = this.players.indexOf(pid);
    return i === 0 || i === 1 ? i : null;
  }

  sendStart(pid: string): void {
    const seat = this.roleOf(pid);
    const info = this.game.seatInfos();
    const seats = [this.launch.request.a, this.launch.request.b]
      .filter((s): s is number => s !== null)
      .map((s) => {
        const item = info.find((x) => x.seat === s)!;
        return {
          engineSeat: s,
          playerId: this.players[s === this.launch.request.a ? 0 : 1] ?? null,
          name: item.name,
          controller: item.controlledBy,
        };
      });
    const msg: FightStartMsg = {
      fightId: this.launch.id,
      kind: this.launch.setup.kind,
      seed: this.launch.seed,
      setup: this.launch.setup,
      rules: this.rules,
      rulesHash: hashCombatRules(this.rules),
      packVersion: COMBAT_PACK_VERSION,
      combatBuildId: combatBuildId(NETCODE_VERSION),
      seats,
      you: seat === null ? { role: 'spectator' } : { role: 'fighter', seat },
      prerollTicks: 90,
      maxTicks: this.rules.timeLimit[this.launch.setup.kind],
      pveHoldTicks: 15,
      pvpHoldTicks: 6,
    };
    this.emit(pid, FIGHT_S2C.start, msg);
    if (this.epochMs !== null) {
      this.emit(pid, FIGHT_S2C.go, { fightId: this.launch.id, epochServerMs: this.epochMs });
      this.emit(pid, FIGHT_S2C.sync, this.authority.sync('join', seat));
    }
  }

  readyFrom(pid: string): void {
    if (this.roleOf(pid) === null || this.epochMs !== null) return;
    this.ready.add(pid);
    if (this.players.filter((p): p is string => p !== null).every((p) => this.ready.has(p)))
      this.go();
  }

  private go(): void {
    if (this.epochMs !== null || this.ended) return;
    clearTimeout(this.goTimeout);
    this.epochMs = Math.max(this.startedAt + INTRO_MS, performance.now() + GO_LEAD_MS);
    for (const pid of this.room.members)
      this.emit(pid, FIGHT_S2C.go, { fightId: this.launch.id, epochServerMs: this.epochMs });
  }

  input(pid: string, raw: unknown): void {
    const p = decodeFightInput(raw);
    const seat = this.roleOf(pid);
    if (!p || seat === null || p.fightId !== this.launch.id || this.epochMs === null || this.ended)
      return;
    const now = performance.now();
    const wall = Math.max(0, Math.floor((now - this.epochMs) / TICK_MS));
    this.authority.accept(seat, p, wall, now - this.epochMs);
    this.ack.set(
      pid,
      Math.max(this.ack.get(pid) ?? 0, Math.min(p.ackConfirmTick, this.sent.get(pid) ?? 0)),
    );
    if (this.authority.streams[seat].controller === 'bot') this.authority.requestBack(seat);
    this.flushRelays();
  }

  ping(pid: string, raw: unknown): void {
    const p = decodeFightPing(raw);
    if (!p) return;
    const recv = performance.now();
    this.emit(
      pid,
      FIGHT_S2C.pong,
      encodeFightPong({ ...p, serverRecvMs: recv, serverSendMs: performance.now() }),
    );
  }

  ackFrom(pid: string, raw: unknown): void {
    const p = decodeFightAck(raw);
    if (p?.fightId === this.launch.id)
      this.ack.set(
        pid,
        Math.max(this.ack.get(pid) ?? 0, Math.min(p.tick, this.sent.get(pid) ?? 0)),
      );
  }

  away(pid: string): void {
    const seat = this.roleOf(pid);
    if (seat !== null) this.authority.takeOver(seat);
  }

  back(pid: string): void {
    const seat = this.roleOf(pid);
    if (seat !== null) this.authority.requestBack(seat);
  }

  sync(pid: string, reason: FightSyncReason): void {
    this.emit(pid, FIGHT_S2C.sync, this.authority.sync(reason, this.roleOf(pid)));
    this.ack.set(pid, this.authority.tick);
  }

  requestSync(pid: string, reason: FightRequestSync['reason']): void {
    const now = performance.now();
    if (now - (this.syncRequestedAt.get(pid) ?? Number.NEGATIVE_INFINITY) < 500) return;
    this.syncRequestedAt.set(pid, now);
    if (reason === 'desync') this.desyncs.set(pid, (this.desyncs.get(pid) ?? 0) + 1);
    this.sync(pid, reason);
  }

  private flushRelays(): void {
    const out = this.authority.drain();
    for (const r of out.relays) {
      const pid = this.players[r.recipient];
      if (pid) this.emit(pid, FIGHT_S2C.relay, encodeFightRelay(r.packet));
    }
    for (const c of out.controls)
      for (const pid of this.room.members) this.emit(pid, FIGHT_S2C.control, c);
  }

  advance(now = performance.now()): void {
    if (this.epochMs === null || now < this.epochMs || this.ended) return;
    let wall = Math.floor((now - this.epochMs) / TICK_MS);
    if (wall - this.authority.tick > MAX_STEPS_PER_WAKE) {
      this.epochMs = now - (this.authority.tick + 1) * TICK_MS;
      wall = this.authority.tick + 1;
      for (const pid of this.room.members)
        this.emit(pid, FIGHT_S2C.retime, {
          fightId: this.launch.id,
          epochServerMs: this.epochMs,
          atTick: this.authority.tick,
        });
    }
    this.authority.advanceTo(wall, now - this.epochMs, MAX_STEPS_PER_WAKE);
    this.flushRelays();
    if (this.authority.tick - this.lastConfirm >= CONFIRM_EVERY || this.authority.result) {
      for (
        let firstTick = this.lastConfirm + 1;
        firstTick <= this.authority.tick;
        firstTick += 32
      ) {
        const lastTick = Math.min(this.authority.tick, firstTick + 31);
        for (const pid of this.room.members) {
          const backlog = (this.sent.get(pid) ?? 0) - (this.ack.get(pid) ?? 0);
          if (this.roleOf(pid) === null && backlog > SPECTATOR_BACKLOG_PAUSE) {
            this.paused.add(pid);
            continue;
          }
          if (this.paused.has(pid)) {
            this.sync(pid, 'backlog');
            this.paused.delete(pid);
            continue;
          }
          if (backlog > BACKLOG_DISCONNECT) {
            this.io.sockets.sockets
              .get(this.sessions.player(pid)?.socketId ?? '')
              ?.disconnect(true);
            continue;
          }
          const packet = this.authority.confirm(firstTick, this.roleOf(pid));
          const quality = ([0, 1] as const).map((seat): SeatQuality => {
            const stream = this.authority.streams[seat];
            if (stream.controller === 'bot') return 0;
            const age = now - this.epochMs! - stream.lastPacketMs;
            return age >= 750 ? 2 : age >= 250 ? 1 : 0;
          });
          this.emit(
            pid,
            FIGHT_S2C.confirm,
            encodeFightConfirm({
              ...packet,
              quality: packQuality(quality[0]!, quality[1]!),
              ticks: packet.ticks.slice(0, lastTick - firstTick + 1),
            }),
          );
          this.sent.set(pid, lastTick);
          if (lastTick % 30 === 0 && (this.desyncs.get(pid) ?? 0) >= 3) this.sync(pid, 'degraded');
        }
      }
      this.lastConfirm = this.authority.tick;
    }
    const result = this.authority.result;
    if (result) {
      this.ended = true;
      for (const pid of this.paused) this.sync(pid, 'backlog');
      for (const pid of this.room.members)
        this.emit(pid, FIGHT_S2C.end, {
          fightId: this.launch.id,
          endTick: this.authority.tick,
          outcome: result,
          finalHash: this.authority.hash,
        });
      this.game.submitCombatResult(this.launch.id, result);
    }
  }

  get isEnded(): boolean {
    return this.ended;
  }
  dispose(): void {
    clearTimeout(this.goTimeout);
  }
}
