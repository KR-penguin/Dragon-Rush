import type { GameEvent } from '@dragon-rush/engine';
import { eventDuration } from '../animation/eventTimeline';

/**
 * Board effect timings derived from the animation timeline, so sounds and particles land on the
 * frames the board shows (dice settle, each hop). All values are real ms at the given speed.
 */
const DICE_SETTLE_FRACTION = 0.85;
/** The token's CSS move transition; dust waits for the pawn to arrive. */
const TOKEN_SETTLE_MS = 120;

export const scaled = (ms: number, speed: number): number => Math.round(ms / Math.max(1, speed));

export function diceLandMs(e: Extract<GameEvent, { type: 'DiceRolled' }>, speed: number): number {
  return scaled(eventDuration(e) * DICE_SETTLE_FRACTION, speed);
}

export interface HopTiming {
  /** Tile the pawn lands on at this hop. */
  readonly tile: number;
  /** When the hop starts (the token is moved). */
  readonly startMs: number;
  /** When the pawn has settled on the tile. */
  readonly landMs: number;
}

/** One entry per hop of a dice move, matching `useSteppedMove`. */
export function hopTimings(
  e: Extract<GameEvent, { type: 'Moved' }>,
  speed: number,
  boardSize: number,
): HopTiming[] {
  if (e.via !== 'dice' || e.steps < 1) return [];
  const stepMs = eventDuration(e) / e.steps / Math.max(1, speed);
  const settle = Math.min(TOKEN_SETTLE_MS, stepMs * 0.75);
  return Array.from({ length: e.steps }, (_, i) => ({
    tile: (e.from + i + 1) % boardSize,
    startMs: Math.round(i * stepMs),
    landMs: Math.round(i * stepMs + settle),
  }));
}
