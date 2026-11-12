import type { Action } from '@dragon-rush/engine';
import {
  C2S,
  FIGHT_C2S,
  FIGHT_S2C,
  FightGoSchema,
  FightReplaySchema,
  FightStartSchema,
  S2C,
  type FightGoMsg,
  type FightStartMsg,
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
  private fightStart: FightStartMsg | null = null;
  private fightGo: FightGoMsg | null = null;
  private awaitingFightStart: GameUpdate | null = null;
  private deferredBoard: GameUpdate | null = null;
  private presentationDone = false;
  private replay: PendingFight['replay'] = null;

  constructor(private readonly session: OnlineSession) {
    const socket = session.socket;
    const onUpdate = (msg: GameUpdateMsg) => {
      if (this.last && msg.version > this.last.version + 1) {
        this.requestSnapshot();
        return;
      }
      this.overrides.clear();
      const next = toGameUpdate(msg, false, this.overrides);
      if (next.pending?.phase === 'COMBAT' && !this.fightStart) {
        this.awaitingFightStart = next;
        return;
      }
      this.awaitingFightStart = null;
      if (this.last?.fight && !this.presentationDone && next.pending?.phase !== 'COMBAT')
        this.deferredBoard = next;
      else this.push(this.withFight(next));
    };
    const onSnapshot = (msg: GameSnapshotMsg) => {
      this.overrides.clear();
      const next = toGameUpdate(msg, true, this.overrides);
      if (next.pending?.phase === 'COMBAT' && !this.fightStart) {
        this.awaitingFightStart = next;
        return;
      }
      this.awaitingFightStart = null;
      if (this.last?.fight && !this.presentationDone && next.pending?.phase !== 'COMBAT')
        this.deferredBoard = next;
      else this.push(this.withFight(next));
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
      this.fightStart = msg;
      this.fightGo = null;
      this.presentationDone = false;
      this.replay = null;
      if (this.awaitingFightStart) {
        const next = this.awaitingFightStart;
        this.awaitingFightStart = null;
        this.push(this.withFight(next));
      } else if (this.last?.pending?.phase === 'COMBAT') {
        this.push({ ...this.withFight(this.last), snapshot: true, events: [] });
      }
    };
    const onFightGo = (raw: unknown) => {
      const parsed = FightGoSchema.safeParse(raw);
      if (!parsed.success) return;
      const msg = parsed.data;
      if (msg.fightId !== this.fightStart?.fightId) return;
      this.fightGo = msg;
    };
    socket.on(FIGHT_S2C.start, onFightStart);
    socket.on(FIGHT_S2C.go, onFightGo);
    const onReplay = (raw: unknown) => {
      const parsed = FightReplaySchema.safeParse(raw);
      if (!parsed.success) return;
      const msg = parsed.data;
      if (msg.fightId !== this.fightStart?.fightId) return;
      const bytes: number[] = [];
      for (let i = 0; i + 2 < msg.inputs.length; i += 3) {
        const count = msg.inputs[i]!;
        for (let k = 0; k < count; k++) bytes.push(msg.inputs[i + 1]!, msg.inputs[i + 2]!);
      }
      this.replay = { result: msg.outcome, ticks: msg.endTick, inputs: Uint8Array.from(bytes) };
      if (this.last) this.push(this.withFight(this.last));
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

  private withFight(update: GameUpdate): GameUpdate {
    const req = update.publicState.combat;
    const start = this.fightStart;
    if (update.pending?.phase !== 'COMBAT' || !req || !start) {
      if (update.pending?.phase !== 'COMBAT' && this.last?.pending?.phase === 'COMBAT') {
        this.fightStart = null;
        this.fightGo = null;
        this.replay = null;
      }
      return { ...update, fight: null };
    }
    const sideFor = (seat: 0 | 1): PendingFight['sides'][number] => ({
      side: seat === 0 ? ('a' as const) : ('b' as const),
      seat: seat === 0 ? req.a : req.b,
      control:
        req.b === null && seat === 1
          ? ('dragon' as const)
          : start.you.role === 'fighter' && start.you.seat === seat
            ? ('keyboard-solo' as const)
            : ('remote' as const),
    });
    const sides: PendingFight['sides'] = [sideFor(0), sideFor(1)];
    return {
      ...update,
      fight: {
        id: start.fightId,
        request: req,
        setup: start.setup,
        seed: start.seed,
        sides,
        botLevel: 'normal',
        replay: this.replay,
        online: { start, go: this.fightGo },
      },
    };
  }

  createFightSession(fight: PendingFight, tracker: KeyTracker): FightSession {
    if (!fight.online) throw new Error('online fight metadata missing');
    return new OnlineFightSession(
      { ...fight, online: { ...fight.online, go: this.fightGo } },
      this.session,
      tracker,
    );
  }

  async reportFight(): Promise<SubmitResult> {
    this.presentationDone = true;
    if (this.deferredBoard) {
      const next = this.deferredBoard;
      this.deferredBoard = null;
      this.push(this.withFight(next));
    }
    return { ok: true };
  }

  private push(u: GameUpdate): void {
    this.last = u;
    for (const l of this.listeners) l(u);
  }

  subscribe(onUpdate: (u: GameUpdate) => void): () => void {
    this.listeners.add(onUpdate);
    if (this.last) onUpdate({ ...this.last, snapshot: true, events: [] });
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
    void this.session.call(C2S.gameRequestSnapshot);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.listeners.clear();
    this.noticeListeners.clear();
  }
}
