import type { CombatResult, CombatSetup } from '@dragon-rush/combat';
import type { FightGoMsg, FightStartMsg } from '@dragon-rush/protocol';
import type { FightSession } from './fight/types';
import type { KeyTracker } from './fight/keyboardInput';
import type {
  Action,
  CombatRequest,
  GameEvent,
  Phase,
  PublicGameState,
  SeatId,
} from '@dragon-rush/engine';

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
  /**
   * Real-time fight the engine is waiting on (phase COMBAT), or null. Optional so backends that still
   * settle fights themselves (online, for now) need not send it.
   */
  readonly fight?: PendingFight | null;
}

/**
 * Who drives one side of a real-time fight on this screen. Hot-seat: the arriver plays with the P1
 * keys (left), the defender with the P2 keys. One local human against a bot or the dragon: solo keys.
 */
export type FightControl =
  'keyboard-p1' | 'keyboard-p2' | 'keyboard-solo' | 'bot' | 'dragon' | 'remote';

export interface FightSide {
  readonly side: 'a' | 'b';
  /** Board seat; null for the dragon. */
  readonly seat: SeatId | null;
  readonly control: FightControl;
}

export type FightBotLevel = 'easy' | 'normal' | 'hard';

/** A fight nobody on this screen plays (bots, bot vs dragon), already resolved headlessly. */
export interface FightReplay {
  readonly result: CombatResult;
  readonly ticks: number;
  /** Packed inputs per tick, interleaved [a0, b0, a1, b1, ...] (see `packInput`). */
  readonly inputs: Uint8Array;
}

/** Everything a screen needs to run or show the pending fight. */
export interface PendingFight {
  /** Unique within the game; `reportFight` must quote it. */
  readonly id: number;
  readonly request: CombatRequest;
  /** Built from the two players' board stats (dragon stats from the rules). */
  readonly setup: CombatSetup;
  readonly seed: number;
  readonly sides: readonly [FightSide, FightSide];
  readonly botLevel: FightBotLevel;
  /** Set for bot-only fights: show it as a skippable highlight, then report `replay.result`. */
  readonly replay: FightReplay | null;
  readonly online?: { readonly start: FightStartMsg; readonly go: FightGoMsg | null };
}

export type SubmitResult = { ok: true } | { ok: false; code: string; message?: string };

/** Port between the UI and a game backend (local engine or online server). */
export interface GameClient {
  readonly mode: 'local' | 'online';
  subscribe(onUpdate: (u: GameUpdate) => void): () => void;
  submit(action: Action, stateVersion: number): Promise<SubmitResult>;
  requestSnapshot(): void;
  dispose(): void;
  /**
   * Settles `GameUpdate.fight` with the fight's result, or with the dice rules ('dice': fast combat,
   * or a fallback when the fight screen fails). Only backends that send `fight` implement it.
   */
  reportFight?(fightId: number, outcome: CombatResult | 'dice'): Promise<SubmitResult>;
  createFightSession?(fight: PendingFight, tracker: KeyTracker): FightSession;
}
