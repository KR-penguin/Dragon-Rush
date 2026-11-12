import { emit, playerAt, type Ctx } from './ctx';
import { beginCombat, type SettleCombat } from './fight';
import { resolveTile } from './tiles';
import { checkLastSurvivor, eliminate, endTurn } from './turn';
import type { SeatId } from './types';

/** Seats that share the arriver's tile, ordered by turn order starting after the arriver. */
export function opponentsOnTile(ctx: Ctx, arriver: SeatId): SeatId[] {
  const n = ctx.s.players.length;
  const pos = playerAt(ctx.s, arriver).position;
  const out: SeatId[] = [];
  for (let k = 1; k < n; k++) {
    const seat = (arriver + k) % n;
    const p = playerAt(ctx.s, seat);
    if (p.alive && p.position === pos) out.push(seat);
  }
  return out;
}

export function startPvp(ctx: Ctx, arriver: SeatId, target: SeatId): void {
  const a = playerAt(ctx.s, arriver);
  const d = playerAt(ctx.s, target);
  ctx.s.pvp = { arriver, candidates: [target], target, stage: null };
  if (a.items.shield > 0) {
    ctx.s.pvp.stage = 'arriver';
    ctx.s.pending = { actor: arriver, phase: 'SHIELD_DECISION' };
  } else if (d.items.shield > 0) {
    ctx.s.pvp.stage = 'defender';
    ctx.s.pending = { actor: target, phase: 'SHIELD_DECISION' };
  } else {
    runDuel(ctx, arriver, target);
  }
}

export function chooseTarget(ctx: Ctx, target: SeatId): void {
  const pvp = ctx.s.pvp;
  if (!pvp) throw new Error('no pvp in progress');
  emit(ctx, { type: 'PvpTargetChosen', arriver: pvp.arriver, target });
  startPvp(ctx, pvp.arriver, target);
}

export function shieldDecision(ctx: Ctx, use: boolean): void {
  const pvp = ctx.s.pvp;
  if (!pvp || pvp.target === null) throw new Error('no pvp in progress');
  const { arriver, target } = pvp;
  const actor = pvp.stage === 'arriver' ? arriver : target;
  if (use) {
    const p = playerAt(ctx.s, actor);
    p.items.shield -= 1;
    emit(ctx, {
      type: 'ItemUsed',
      seat: actor,
      item: 'shield',
      target: actor === arriver ? target : arriver,
    });
    emit(ctx, { type: 'ShieldUsed', seat: actor, against: actor === arriver ? target : arriver });
    ctx.s.pvp = null;
    resolveTile(ctx, arriver);
    return;
  }
  if (pvp.stage === 'arriver' && playerAt(ctx.s, target).items.shield > 0) {
    pvp.stage = 'defender';
    ctx.s.pending = { actor: target, phase: 'SHIELD_DECISION' };
    return;
  }
  runDuel(ctx, arriver, target);
}

export function runDuel(ctx: Ctx, arriver: SeatId, target: SeatId): void {
  beginCombat(ctx, { kind: 'duel', a: arriver, b: target }, settleDuel);
}

/** Loser is eliminated and looted; a losing arriver ends the turn, a winning one resolves the tile. */
export const settleDuel: SettleCombat = (ctx, request, winner) => {
  const { a: arriver, b: target } = request;
  if (target === null) throw new Error('duel without a defender');
  const winnerSeat = winner === 'a' ? arriver : target;
  const loserSeat = winner === 'a' ? target : arriver;
  eliminate(ctx, loserSeat, winnerSeat, winnerSeat);
  if (checkLastSurvivor(ctx)) return;
  if (loserSeat === arriver) endTurn(ctx);
  else resolveTile(ctx, arriver);
};
