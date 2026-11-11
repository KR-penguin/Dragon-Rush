import type { GameState, PublicGameState } from './types';

export function toPublicState(state: GameState): PublicGameState {
  const { rng: _rng, ...rest } = state;
  return rest;
}
