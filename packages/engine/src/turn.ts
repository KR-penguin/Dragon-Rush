import { emit, playerAt, type Ctx } from './ctx';
import { ITEM_IDS, type CombatantRef, type GameOutcome, type ItemId, type SeatId } from './types';

export const freshTurn = (resting: boolean) => ({
  resting,
  paidUpgradesUsed: 0,
  rolled: false,
  dice: null,
  teleportsUsed: 0,
  thiefUsed: false,
  canBuy: false,
});

export function beginTurn(ctx: Ctx, seat: SeatId): void {
  const p = playerAt(ctx.s, seat);
  if (p.passive.ninjaCooldown > 0) p.passive.ninjaCooldown -= 1;
  ctx.s.current = seat;
  ctx.s.turn = freshTurn(p.skipNextTurn);
  ctx.s.pvp = null;
  emit(ctx, { type: 'TurnStarted', seat, round: ctx.s.round, resting: p.skipNextTurn });
  ctx.s.pending = { actor: seat, phase: 'PRE_ROLL' };
}

export function enterPostMove(ctx: Ctx): void {
  ctx.s.pvp = null;
  ctx.s.pending = { actor: ctx.s.current, phase: 'POST_MOVE' };
}

export function endGame(ctx: Ctx, outcome: GameOutcome): void {
  ctx.s.outcome = outcome;
  ctx.s.pending = null;
  ctx.s.pvp = null;
  emit(ctx, { type: 'GameEnded', outcome });
}

const aliveSeats = (ctx: Ctx): SeatId[] => ctx.s.players.filter((p) => p.alive).map((p) => p.seat);

/** Ends the game if only one player is left. Returns true when the game is over. */
export function checkLastSurvivor(ctx: Ctx): boolean {
  const alive = aliveSeats(ctx);
  if (alive.length === 1) {
    endGame(ctx, { kind: 'lastSurvivor', winner: alive[0] ?? null });
    return true;
  }
  return false;
}

export function eliminate(ctx: Ctx, seat: SeatId, by: CombatantRef, lootTo: SeatId | null): void {
  const loser = playerAt(ctx.s, seat);
  if (lootTo !== null) {
    const winner = playerAt(ctx.s, lootTo);
    const coins = Math.floor(loser.coins / 2);
    const items = { ...loser.items };
    winner.coins += coins;
    for (const id of ITEM_IDS) winner.items[id] += items[id];
    emit(ctx, { type: 'LootTransferred', from: seat, to: lootTo, coins, items });
  }
  loser.alive = false;
  loser.hp = 0;
  loser.coins = 0;
  loser.items = emptyItems();
  loser.skipNextTurn = false;
  emit(ctx, { type: 'PlayerEliminated', seat, by, round: ctx.s.round });
}

export const emptyItems = (): Record<ItemId, number> => ({ teleport: 0, shield: 0, thief: 0 });

export function endTurn(ctx: Ctx): void {
  const seat = ctx.s.current;
  const p = playerAt(ctx.s, seat);
  if (ctx.s.turn.resting && p.alive) {
    p.skipNextTurn = false;
    emit(ctx, { type: 'TurnSkipped', seat });
  }
  emit(ctx, { type: 'TurnEnded', seat });
  ctx.s.pending = null;
  ctx.s.pvp = null;

  const n = ctx.s.players.length;
  let next = seat;
  let wrapped = false;
  for (let i = 0; i < n; i++) {
    next = (next + 1) % n;
    if (next <= seat) wrapped = true;
    if (playerAt(ctx.s, next).alive) break;
  }
  if (wrapped) {
    ctx.s.round += 1;
    const max = ctx.s.rules.maxRounds;
    if (max !== null && ctx.s.round > max) {
      ctx.s.round = max;
      endGame(ctx, { kind: 'draw', winner: null });
      return;
    }
    emit(ctx, { type: 'RoundStarted', round: ctx.s.round });
  }
  beginTurn(ctx, next);
}
