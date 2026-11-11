import { rollDie } from './rng';
import type { GameEvent, GameState, PlayerState, SeatId } from './types';

/** Mutable working copy used inside a single applyAction call. Inputs are never mutated. */
export interface Ctx {
  s: GameState;
  ev: GameEvent[];
}

export const roll = (ctx: Ctx, sides: number): number => {
  const [value, rng] = rollDie(ctx.s.rng, sides);
  ctx.s.rng = rng;
  return value;
};

export const playerAt = (s: Pick<GameState, 'players'>, seat: SeatId): PlayerState => {
  const p = s.players[seat];
  if (!p) throw new RangeError(`no player at seat ${seat}`);
  return p;
};

export const emit = (ctx: Ctx, event: GameEvent): void => {
  ctx.ev.push(event);
};

export const isOver = (ctx: Ctx): boolean => ctx.s.outcome !== null;
