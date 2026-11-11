import type { Action, GameEvent, Phase, PublicGameState, SeatId } from '@hero-dice/engine';

export type SeatKind = 'human' | 'bot' | 'model';

export interface SeatInfo {
  readonly seat: SeatId;
  readonly name: string;
  readonly kind: SeatKind;
  readonly botName?: string;
  readonly connected: boolean;
  /** Who is currently deciding for this seat (a disconnected human is played by a bot). */
  readonly controlledBy: 'human' | 'bot';
}

export interface PendingInfo {
  readonly actor: SeatId;
  readonly phase: Phase;
  readonly timeLeftMs: number | null;
}

export interface GameUpdate {
  readonly version: number;
  readonly publicState: PublicGameState;
  readonly events: readonly GameEvent[];
  readonly pending: PendingInfo | null;
  /** Seats this client may act for: all human seats in hot-seat, my seat online. */
  readonly controllableSeats: readonly SeatId[];
  /** Legal actions for pending.actor, only when that seat is controllable here. */
  readonly legalActions: readonly Action[];
  readonly seats: readonly SeatInfo[];
  /** True for full-state snapshots (start, reconnect, gap recovery): clients snap without animating. */
  readonly snapshot: boolean;
}

export type SubmitResult = { ok: true } | { ok: false; code: string; message?: string };

/** Port between the UI and a game backend (local engine or online server). */
export interface GameClient {
  readonly mode: 'local' | 'online';
  subscribe(onUpdate: (u: GameUpdate) => void): () => void;
  submit(action: Action, stateVersion: number): Promise<SubmitResult>;
  requestSnapshot(): void;
  dispose(): void;
}
