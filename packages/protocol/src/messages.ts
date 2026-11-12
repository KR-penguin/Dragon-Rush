import type { Action, GameEvent, JobId, Phase, PublicGameState, SeatId } from '@dragon-rush/engine';

export type LobbySeatKind = 'human' | 'bot' | 'model' | 'empty';
export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface LobbySeat {
  /** Lobby seat index (0..3). The engine seat (turn order) is assigned at game start. */
  seat: number;
  kind: LobbySeatKind;
  playerId: string | null;
  nickname: string | null;
  job: JobId | null;
  ready: boolean;
  connected: boolean;
  botName: string | null;
  modelId: string | null;
}

export interface RoomOptions {
  maxRounds: number | null;
  /** 빠른 전투: fights auto-resolve with dice instead of real-time combat. */
  quickCombat?: boolean;
}

export interface RoomStateMsg {
  roomCode: string;
  hostId: string;
  status: RoomStatus;
  options: RoomOptions;
  seats: LobbySeat[];
}

export interface SessionWelcomeMsg {
  sessionToken: string;
  playerId: string;
  resume: { roomCode: string } | null;
}

export interface OnlineSeatInfo {
  /** Engine seat (turn order). */
  seat: SeatId;
  lobbySeat: number;
  name: string;
  kind: 'human' | 'bot' | 'model';
  botName?: string;
  connected: boolean;
  controlledBy: 'human' | 'bot';
}

export interface PendingMsg {
  actor: SeatId;
  phase: Phase;
  timeLeftMs: number | null;
}

export interface GameUpdateMsg {
  version: number;
  publicState: PublicGameState;
  events: GameEvent[];
  pending: PendingMsg | null;
  seats: OnlineSeatInfo[];
  /** Engine seat of the receiver, null for spectators. */
  yourSeat: SeatId | null;
  /** Present only when the receiver is pending.actor. */
  legalActions?: Action[];
}

export type GameSnapshotMsg = Omit<GameUpdateMsg, 'events'>;

export interface SeatStatusMsg {
  seat: SeatId;
  connected: boolean;
  controlledBy: 'human' | 'bot';
  graceMsLeft?: number;
}

/** Emitted once when a connected human leaves and a bot begins controlling that seat. */
export interface SeatTakeoverMsg {
  seat: SeatId;
  name: string;
}

export interface ErrorMsg {
  code: string;
  message: string;
}

export interface ModelInfo {
  id: string;
  obsVersion: string | null;
  actVersion: string | null;
}
