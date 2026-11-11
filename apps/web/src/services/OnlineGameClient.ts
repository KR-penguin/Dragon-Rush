import type { Action } from '@dragon-rush/engine';
import { C2S, S2C, type GameSnapshotMsg, type GameUpdateMsg, type SeatStatusMsg } from '@dragon-rush/protocol';
import type { GameClient, GameUpdate, SeatInfo, SubmitResult } from './gameClient';
import type { OnlineSession } from './onlineSession';

export function toGameUpdate(msg: GameUpdateMsg | GameSnapshotMsg, snapshot: boolean, overrides: Map<number, SeatStatusMsg>): GameUpdate {
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
    pending: msg.pending,
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
  private last: GameUpdate | null = null;
  private overrides = new Map<number, SeatStatusMsg>();
  private readonly offs: (() => void)[] = [];

  constructor(private readonly session: OnlineSession) {
    const socket = session.socket;
    const onUpdate = (msg: GameUpdateMsg) => {
      if (this.last && msg.version > this.last.version + 1) {
        this.requestSnapshot();
        return;
      }
      this.overrides.clear();
      this.push(toGameUpdate(msg, false, this.overrides));
    };
    const onSnapshot = (msg: GameSnapshotMsg) => {
      this.overrides.clear();
      this.push(toGameUpdate(msg, true, this.overrides));
    };
    const onStatus = (msg: SeatStatusMsg) => {
      this.overrides.set(msg.seat, msg);
    };
    socket.on(S2C.gameUpdate, onUpdate);
    socket.on(S2C.gameSnapshot, onSnapshot);
    socket.on(S2C.seatStatus, onStatus);
    this.offs.push(
      () => socket.off(S2C.gameUpdate, onUpdate),
      () => socket.off(S2C.gameSnapshot, onSnapshot),
      () => socket.off(S2C.seatStatus, onStatus),
    );
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
  }
}
