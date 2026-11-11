import { getLegalActions, type Action, type PublicGameState } from '@dragon-rush/engine';

/** Default action when a human decision times out (docs/architecture.md §8.2). */
export function timeoutAction(state: PublicGameState): Action {
  const legal = getLegalActions(state);
  const has = (type: Action['type']) => legal.some((a) => a.type === type);
  switch (state.pending?.phase) {
    case 'PRE_ROLL':
      return has('ROLL_DICE') ? { type: 'ROLL_DICE' } : { type: 'END_TURN' };
    case 'POST_MOVE':
      return { type: 'END_TURN' };
    case 'SHIELD_DECISION':
      return { type: 'SHIELD_DECISION', use: false };
    default:
      return legal[0]!;
  }
}
