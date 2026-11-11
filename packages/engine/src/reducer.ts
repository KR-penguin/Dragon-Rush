import type { Ctx } from './ctx';
import { challengeDragon } from './dragon';
import { chooseTarget, shieldDecision } from './duel';
import { buyItem, trainStat, upgrade, useThief } from './items';
import { actionKey, getLegalActions } from './legal';
import { adjustMove, rollDice, teleport } from './movement';
import { cloneState } from './state';
import { endTurn } from './turn';
import type { Action, GameEvent, GameState } from './types';

export class IllegalActionError extends Error {
  override readonly name = 'IllegalActionError';
  constructor(readonly action: Action) {
    super(`illegal action ${actionKey(action)}`);
  }
}

function dispatch(ctx: Ctx, action: Action): void {
  switch (action.type) {
    case 'ROLL_DICE':
      return rollDice(ctx);
    case 'ADJUST_MOVE':
      return adjustMove(ctx, action.delta);
    case 'USE_TELEPORT':
      return teleport(ctx, action.tile);
    case 'CHALLENGE_DRAGON':
      return challengeDragon(ctx);
    case 'UPGRADE':
      return upgrade(ctx, action.stat);
    case 'CHOOSE_TRAINING_STAT':
      return trainStat(ctx, action.stat);
    case 'BUY_ITEM':
      return buyItem(ctx, action.item);
    case 'USE_THIEF':
      return useThief(ctx, action.target);
    case 'CHOOSE_PVP_TARGET':
      return chooseTarget(ctx, action.target);
    case 'SHIELD_DECISION':
      return shieldDecision(ctx, action.use);
    case 'END_TURN':
      return endTurn(ctx);
  }
}

const MAX_AUTO_STEPS = 10_000;

export function applyAction(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const key = actionKey(action);
  if (!getLegalActions(state).some((a) => actionKey(a) === key)) throw new IllegalActionError(action);
  const ctx: Ctx = { s: cloneState(state), ev: [] };
  dispatch(ctx, action);
  for (let i = 0; i < MAX_AUTO_STEPS; i++) {
    const legal = getLegalActions(ctx.s);
    if (legal.length !== 1) break;
    dispatch(ctx, legal[0] as Action);
  }
  return { state: ctx.s, events: ctx.ev };
}
