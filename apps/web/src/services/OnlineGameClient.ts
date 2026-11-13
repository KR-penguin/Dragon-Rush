import type { Action } from '@dragon-rush/engine';
import {
  C2S,
  FIGHT_C2S,
  FIGHT_S2C,
  FightGoSchema,
  FightReplaySchema,
  FightStartSchema,
  S2C,
  type GameSnapshotMsg,
  type GameUpdateMsg,
  type SeatStatusMsg,
  type SeatTakeoverMsg,
} from '@dragon-rush/protocol';
import { NETCODE_VERSION, combatBuildId, checkFightStart } from '@dragon-rush/netcode';
import type {
  GameClient,
  GameNotice,
  GameUpdate,
  PendingFight,
  SeatInfo,
  SubmitResult,
} from './gameClient';
import type { KeyTracker } from './fight/keyboardInput';
import type { FightSession } from './fight/types';
import { OnlineFightSession } from './fight/OnlineFightSession';
import type { OnlineSession } from './onlineSession';
import { OnlinePresentationQueue } from './onlinePresentation';

export function toGameUpdate(
  msg: GameUpdateMsg | GameSnapshotMsg,
  snapshot: boolean,
  overrides: Map<number, SeatStatusMsg>,
): GameUpdate {
  const seats: SeatInfo[] = msg.seats.map((s) => {
    const o = overrides.get(s.seat);
    return {
      seat: s.seat,
      name: s.name,
      kind: s.kind,
      ...(s.botName ? { botName: s.botName } : {}),
      connected: o?.connected ?? s.connected,
      controlledBy: o?.controlledBy ?? s.controlledBy,
    };
  });
  return {
    version: msg.version,
    publicState: msg.publicState,
    events: 'events' in msg && !snapshot ? msg.events : [],
    pending: msg.pending?.phase === 'COMBAT' ? { ...msg.pending, timeLeftMs: null } : msg.pending,
    controllableSeats: msg.yourSeat === null ? [] : [msg.yourSeat],
    legalActions: msg.legalActions ?? [],
    seats,
    snapshot,
  };
}

/** Adapts server game messages to the GameClient port used by the Game page. */
export class OnlineGameClient implements GameClient {
  readonly mode = 'online' as const;
  private listeners = new Set<(u: GameUpdate) => void>();
  private noticeListeners = new Set<(notice: GameNotice) => void>();
  private announcedTakeovers = new Set<number>();
  private last: GameUpdate | null = null;
  private overrides = new Map<number, SeatStatusMsg>();
  private readonly offs: (() => void)[] = [];
  private receivedVersion: number | null = null;
  private readonly presentation = new OnlinePresentationQueue((update) => this.push(update));

  constructor(private readonly session: OnlineSession) {
    const socket = session.socket;
    const onUpdate = (msg: GameUpdateMsg) => {
      if (this.receivedVersion !== null) {
        if (msg.version <= this.receivedVersion) return;
        if (msg.version > this.receivedVersion + 1) {
          this.requestSnapshot();
          return;
        }
      }
      this.receivedVersion = msg.version;
      this.overrides.clear();
      this.presentation.receive(toGameUpdate(msg, false, this.overrides));
    };
    const onSnapshot = (msg: GameSnapshotMsg) => {
      if (this.receivedVersion !== null && msg.version < this.receivedVersion) return;
      this.receivedVersion = msg.version;
      this.overrides.clear();
      this.presentation.receive(toGameUpdate(msg, true, this.overrides));
    };
    const onStatus = (msg: SeatStatusMsg) => {
      this.overrides.set(msg.seat, msg);
      if (msg.connected && msg.controlledBy === 'human') this.announcedTakeovers.delete(msg.seat);
    };
    const onTakeover = (msg: SeatTakeoverMsg) => {
      if (this.last?.controllableSeats.includes(msg.seat) || this.announcedTakeovers.has(msg.seat))
        return;
      this.announcedTakeovers.add(msg.seat);
      for (const listener of this.noticeListeners)
        listener({ type: 'botTakeover', seat: msg.seat, name: msg.name });
    };
    socket.on(S2C.gameUpdate, onUpdate);
    socket.on(S2C.gameSnapshot, onSnapshot);
    socket.on(S2C.seatStatus, onStatus);
    socket.on(S2C.seatTakeover, onTakeover);
    const onFightStart = (raw: unknown) => {
      const parsed = FightStartSchema.safeParse(raw);
      if (!parsed.success) return;
      const msg = parsed.data;
      const mismatch = checkFightStart(msg, combatBuildId(NETCODE_VERSION));
      if (mismatch) {
        socket.emit(FIGHT_C2S.away, { fightId: msg.fightId, reason: 'mismatch' });
        return;
      }
      this.presentation.start(msg);
    };
    const onFightGo = (raw: unknown) => {
      const parsed = FightGoSchema.safeParse(raw);
      if (parsed.success) this.presentation.go(parsed.data);
    };
    socket.on(FIGHT_S2C.start, onFightStart);
    socket.on(FIGHT_S2C.go, onFightGo);
    const onReplay = (raw: unknown) => {
      const parsed = FightReplaySchema.safeParse(raw);
      if (!parsed.success) return;
      this.presentation.replay(parsed.data);
    };
    socket.on(FIGHT_S2C.replay, onReplay);
    this.offs.push(
      () => socket.off(S2C.gameUpdate, onUpdate),
      () => socket.off(S2C.gameSnapshot, onSnapshot),
      () => socket.off(S2C.seatStatus, onStatus),
      () => socket.off(S2C.seatTakeover, onTakeover),
      () => socket.off(FIGHT_S2C.start, onFightStart),
      () => socket.off(FIGHT_S2C.go, onFightGo),
      () => socket.off(FIGHT_S2C.replay, onReplay),
    );
  }

  createFightSession(fight: PendingFight, tracker: KeyTracker): FightSession {
    if (!fight.online) throw new Error('online fight metadata missing');
    const go = this.presentation.metadata(fight.id)?.go ?? fight.online.go;
    return new OnlineFightSession(
      { ...fight, online: { ...fight.online, go } },
      this.session,
      tracker,
    );
  }

  async reportFight(fightId: number): Promise<SubmitResult> {
    return this.presentation.complete(fightId) ? { ok: true } : { ok: false, code: 'NO_FIGHT' };
  }

  private push(u: GameUpdate): void {
    this.last = u;
    for (const l of this.listeners) l(u);
  }

  subscribe(onUpdate: (u: GameUpdate) => void): () => void {
    this.listeners.add(onUpdate);
    if (this.last) onUpdate({ ...this.last, snapshot: true, events: [], presentationOnly: false });
    else this.requestSnapshot();
    return () => this.listeners.delete(onUpdate);
  }

  subscribeNotices(onNotice: (notice: GameNotice) => void): () => void {
    this.noticeListeners.add(onNotice);
    return () => this.noticeListeners.delete(onNotice);
  }

  async submit(action: Action, stateVersion: number): Promise<SubmitResult> {
    const r = await this.session.call(C2S.gameAction, { action, stateVersion });
    return r.ok ? { ok: true } : { ok: false, code: r.error.code, message: r.error.message };
  }

  requestSnapshot(): void {
    // Disconnecting may cancel an acknowledgement after the game client has been disposed.
    void this.session.call(C2S.gameRequestSnapshot).catch(() => undefined);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.listeners.clear();
    this.noticeListeners.clear();
  }
}
