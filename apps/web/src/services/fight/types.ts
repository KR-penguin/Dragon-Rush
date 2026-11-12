import type {
  CombatEvent,
  CombatResult,
  CombatSetup,
  CombatState,
  FighterInput,
  Side,
} from '@dragon-rush/combat';
import type { FightNetStats } from '@dragon-rush/netcode';
import type { FightSide } from '../gameClient';

/**
 * Real-time fight plumbing, split so an online fight can plug in later:
 * - `FightInputSource` samples one side's input per sim tick (keyboard, gamepad, bot, network).
 * - `FightStateProvider` owns the timeline (local: deterministic sim; online: server snapshots +
 *   prediction/rollback re-simulating with the same `stepCombat`).
 * - `FightSession` drives a provider from requestAnimationFrame at a fixed 60 Hz and hands the
 *   renderer `{prev, curr, alpha}` plus each sim event exactly once.
 */
export interface FightInputSource {
  /** Called exactly once per sim tick, before the tick, with the state the tick starts from. */
  sample(state: CombatState, side: Side): FighterInput;
  dispose?(): void;
}

export interface FightStateProvider {
  /** State before the last tick (render interpolation start). */
  readonly prev: CombatState;
  readonly curr: CombatState;
  /** Advances one fixed tick. Events may repeat ids after a rollback; the session dedupes. */
  step(): readonly CombatEvent[];
  result(): CombatResult | null;
  dispose?(): void;
}

export interface FightInfo {
  readonly id: number;
  readonly setup: CombatSetup;
  readonly seed: number;
  readonly sides: readonly [FightSide, FightSide];
}

export interface FightFrame {
  readonly prev: CombatState;
  readonly curr: CombatState;
  /** 0..1 progress from prev to curr. */
  readonly alpha: number;
}

export type FrameListener = (
  frame: FightFrame,
  events: readonly CombatEvent[],
  dtMs: number,
) => void;

export interface FightSession {
  readonly info: FightInfo;
  /** Starts the sim clock ("싸워라!" = tick 0). Before that, frames show tick 0 without stepping. */
  start(): void;
  isStarted(): boolean;
  frame(): FightFrame;
  /** Called once per animation frame after the sim advanced, with the new (deduped) events. */
  onFrame(listener: FrameListener): () => void;
  onEnd(listener: (result: CombatResult) => void): () => void;
  result(): CombatResult | null;
  stats?(): FightNetStats | null;
  /** Manual pause; the session also pauses by itself while the tab is hidden. */
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  dispose(): void;
}
