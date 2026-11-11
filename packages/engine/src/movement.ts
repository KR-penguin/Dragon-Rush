import { advance, passesStart } from './board';
import { emit, playerAt, roll, type Ctx } from './ctx';
import { opponentsOnTile, startPvp } from './duel';
import { PASSIVES } from './jobs';
import { resolveTile } from './tiles';
import type { SeatId } from './types';

export function rollDice(ctx: Ctx): void {
  const seat = ctx.s.current;
  const p = playerAt(ctx.s, seat);
  const value = roll(ctx, ctx.s.rules.combat.dieSides);
  ctx.s.turn.rolled = true;
  ctx.s.turn.dice = value;
  emit(ctx, { type: 'DiceRolled', seat, value });
  if (PASSIVES[p.job].moveAdjust && p.passive.ninjaCooldown === 0) {
    ctx.s.pending = { actor: seat, phase: 'MOVE_ADJUST' };
    return;
  }
  moveBy(ctx, value);
}

export function adjustMove(ctx: Ctx, delta: -1 | 0 | 1): void {
  const seat = ctx.s.current;
  const p = playerAt(ctx.s, seat);
  const steps = (ctx.s.turn.dice ?? 0) + delta;
  if (delta !== 0) p.passive.ninjaCooldown = ctx.s.rules.passives.ninjaAdjustCooldown;
  emit(ctx, { type: 'MoveAdjusted', seat, delta, steps });
  moveBy(ctx, steps);
}

function moveBy(ctx: Ctx, steps: number): void {
  const seat = ctx.s.current;
  const p = playerAt(ctx.s, seat);
  const from = p.position;
  const to = advance(from, steps);
  emit(ctx, { type: 'Moved', seat, from, to, steps, via: 'dice' });
  if (passesStart(from, steps)) {
    const bonus = ctx.s.rules.startBonus;
    p.coins += bonus.coins;
    p.hp = Math.min(p.maxHp, p.hp + bonus.hp);
    emit(ctx, { type: 'StartBonus', seat, coins: bonus.coins, hp: bonus.hp, coinsAfter: p.coins, hpAfter: p.hp });
  }
  p.position = to;
  land(ctx, seat);
}

export function teleport(ctx: Ctx, tile: number): void {
  const seat = ctx.s.current;
  const p = playerAt(ctx.s, seat);
  p.items.teleport -= 1;
  ctx.s.turn.teleportsUsed += 1;
  emit(ctx, { type: 'ItemUsed', seat, item: 'teleport', tile });
  const from = p.position;
  emit(ctx, { type: 'Moved', seat, from, to: tile, steps: 0, via: 'teleport' });
  p.position = tile;
  land(ctx, seat);
}

function land(ctx: Ctx, seat: SeatId): void {
  ctx.s.turn.canBuy = false;
  const p = playerAt(ctx.s, seat);
  const tile = ctx.s.rules.board[p.position];
  const pvpOpen = tile !== undefined && !tile.safe && ctx.s.round > ctx.s.rules.pvpGraceRounds;
  if (pvpOpen) {
    const others = opponentsOnTile(ctx, seat);
    if (others.length > 0) emit(ctx, { type: 'PvpTriggered', arriver: seat, candidates: others });
    if (others.length === 1) {
      startPvp(ctx, seat, others[0] as SeatId);
      return;
    }
    if (others.length > 1) {
      ctx.s.pvp = { arriver: seat, candidates: others, target: null, stage: null };
      ctx.s.pending = { actor: seat, phase: 'CHOOSE_PVP_TARGET' };
      return;
    }
  }
  resolveTile(ctx, seat);
}
