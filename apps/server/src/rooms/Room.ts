import { JOB_IDS, type JobId } from '@dragon-rush/engine';
import type {
  LobbySeat,
  RoomConfigureSeat,
  RoomOptions,
  RoomStateMsg,
  RoomStatus,
} from '@dragon-rush/protocol';
import { ProtocolError } from '../errors';
import type { GameSession } from '../game/GameSession';

const emptySeat = (seat: number, kind: LobbySeat['kind']): LobbySeat => ({
  seat,
  kind,
  playerId: null,
  nickname: null,
  job: null,
  ready: false,
  connected: false,
  botName: null,
  modelId: null,
});

/** Lobby state for one room: host, 4 seats, options, and the running game when started. */
export class Room {
  status: RoomStatus = 'lobby';
  options: RoomOptions = { maxRounds: null, quickCombat: false };
  readonly seats: LobbySeat[];
  readonly members = new Set<string>();
  game: GameSession | null = null;
  lastActivity: number;

  constructor(
    readonly code: string,
    public hostId: string,
    hostNickname: string,
    now: number,
  ) {
    this.seats = [
      emptySeat(0, 'human'),
      emptySeat(1, 'human'),
      emptySeat(2, 'empty'),
      emptySeat(3, 'empty'),
    ];
    this.occupy(this.seats[0]!, hostId, hostNickname);
    this.members.add(hostId);
    this.lastActivity = now;
  }

  private occupy(seat: LobbySeat, playerId: string, nickname: string): void {
    Object.assign(seat, {
      kind: 'human',
      playerId,
      nickname,
      ready: false,
      connected: true,
      botName: null,
      modelId: null,
    });
  }

  toState(): RoomStateMsg {
    return {
      roomCode: this.code,
      hostId: this.hostId,
      status: this.status,
      options: { ...this.options },
      seats: this.seats.map((s) => ({ ...s })),
    };
  }

  seatOf(playerId: string): LobbySeat | null {
    return this.seats.find((s) => s.playerId === playerId) ?? null;
  }

  private assertLobby(): void {
    if (this.status !== 'lobby') throw new ProtocolError('ROOM_IN_PROGRESS');
  }

  private assertHost(playerId: string): void {
    if (playerId !== this.hostId) throw new ProtocolError('NOT_HOST');
  }

  join(playerId: string, nickname: string): LobbySeat {
    const existing = this.seatOf(playerId);
    if (existing) {
      existing.connected = true;
      existing.nickname = nickname;
      return existing;
    }
    this.assertLobby();
    const open = this.seats.find((s) => s.kind === 'human' && s.playerId === null);
    if (!open) throw new ProtocolError('ROOM_FULL');
    this.occupy(open, playerId, nickname);
    this.members.add(playerId);
    return open;
  }

  /** Removes a player from the lobby. Returns true when the room became empty of humans. */
  leave(playerId: string): boolean {
    this.members.delete(playerId);
    const seat = this.seatOf(playerId);
    if (seat && this.status === 'lobby') Object.assign(seat, emptySeat(seat.seat, 'human'));
    if (this.hostId === playerId) {
      const next = this.seats.find((s) => s.playerId !== null && s.playerId !== playerId);
      if (next?.playerId) this.hostId = next.playerId;
    }
    return !this.seats.some((s) => s.playerId !== null && this.members.has(s.playerId));
  }

  setConnected(playerId: string, connected: boolean): void {
    const seat = this.seatOf(playerId);
    if (seat) seat.connected = connected;
  }

  configure(playerId: string, maxRounds: number | null, quickCombat?: boolean): void {
    this.assertLobby();
    this.assertHost(playerId);
    this.options.maxRounds = maxRounds;
    if (quickCombat !== undefined) this.options.quickCombat = quickCombat;
  }

  configureSeat(
    playerId: string,
    p: RoomConfigureSeat,
    modelExists: (id: string) => boolean,
  ): void {
    this.assertLobby();
    this.assertHost(playerId);
    const seat = this.seats[p.seat]!;
    if (seat.playerId !== null) throw new ProtocolError('SEAT_OCCUPIED');
    if (p.kind === 'model' && (!p.modelId || !modelExists(p.modelId)))
      throw new ProtocolError('MODEL_NOT_FOUND');
    Object.assign(seat, emptySeat(seat.seat, p.kind), {
      botName: p.kind === 'bot' ? (p.botName ?? 'heuristic') : null,
      modelId: p.kind === 'model' ? (p.modelId ?? null) : null,
      ready: p.kind === 'bot' || p.kind === 'model',
      connected: p.kind === 'bot' || p.kind === 'model',
    });
  }

  selectJob(playerId: string, job: JobId | null, seatIndex?: number): void {
    this.assertLobby();
    let seat: LobbySeat | null;
    if (seatIndex !== undefined && seatIndex !== this.seatOf(playerId)?.seat) {
      this.assertHost(playerId);
      seat = this.seats[seatIndex] ?? null;
      if (!seat || (seat.kind !== 'bot' && seat.kind !== 'model'))
        throw new ProtocolError('SEAT_OCCUPIED');
    } else seat = this.seatOf(playerId);
    if (!seat) throw new ProtocolError('NOT_IN_ROOM');
    if (job && this.seats.some((s) => s !== seat && s.job === job && s.kind !== 'empty'))
      throw new ProtocolError('JOB_TAKEN');
    seat.job = job;
  }

  setReady(playerId: string, ready: boolean): void {
    this.assertLobby();
    const seat = this.seatOf(playerId);
    if (!seat) throw new ProtocolError('NOT_IN_ROOM');
    seat.ready = ready;
  }

  /** Validates start conditions and fills missing AI jobs. Returns the seats that will play. */
  prepareStart(playerId: string, pick: () => number): LobbySeat[] {
    this.assertLobby();
    this.assertHost(playerId);
    const active = this.seats.filter(
      (s) => s.kind === 'bot' || s.kind === 'model' || (s.kind === 'human' && s.playerId !== null),
    );
    if (active.length < 2) throw new ProtocolError('NOT_READY', 'need at least 2 seats');
    for (const s of active) {
      if (s.kind === 'human' && s.playerId !== this.hostId && !s.ready)
        throw new ProtocolError('NOT_READY', `${s.nickname} is not ready`);
      if (s.kind === 'human' && !s.job)
        throw new ProtocolError('NOT_READY', `${s.nickname} has no job`);
    }
    for (const s of active) {
      if (s.job) continue;
      const free = JOB_IDS.filter((j) => !active.some((o) => o.job === j));
      s.job = free[Math.floor(pick() * free.length)]!;
    }
    return active;
  }
}
