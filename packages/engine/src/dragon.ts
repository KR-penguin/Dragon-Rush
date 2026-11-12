import type { Ctx } from './ctx';
import { beginCombat, type SettleCombat } from './fight';
import { checkLastSurvivor, eliminate, endGame, endTurn } from './turn';

export function challengeDragon(ctx: Ctx): void {
  beginCombat(ctx, { kind: 'dragonFight', a: ctx.s.current, b: null }, settleDragon);
}

/** A win ends the game; a loss eliminates the challenger (assets vanish) and ends the turn. */
export const settleDragon: SettleCombat = (ctx, request, winner) => {
  const seat = request.a;
  if (winner === 'a') {
    endGame(ctx, { kind: 'dragon', winner: seat });
    return;
  }
  eliminate(ctx, seat, 'dragon', null);
  if (checkLastSurvivor(ctx)) return;
  endTurn(ctx);
};
