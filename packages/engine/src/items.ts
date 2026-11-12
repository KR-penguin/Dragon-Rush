import { emit, playerAt, type Ctx } from './ctx';
import { raiseStat, upgradeCost } from './economy';
import { enterPostMove } from './turn';
import type { ItemId, SeatId, UpgradeStat } from './types';

export function upgrade(ctx: Ctx, stat: UpgradeStat): void {
  const seat = ctx.s.current;
  const p = playerAt(ctx.s, seat);
  const cost = upgradeCost(ctx.s.rules, p, stat);
  p.coins -= cost;
  ctx.s.turn.paidUpgradesUsed += 1;
  const valueAfter = raiseStat(ctx.s.rules, p, stat);
  p.upgradeLevels[stat] += 1;
  emit(ctx, {
    type: 'StatUpgraded',
    seat,
    stat,
    cost,
    free: false,
    valueAfter,
    levelAfter: p.upgradeLevels[stat],
    coinsAfter: p.coins,
  });
}

export function trainStat(ctx: Ctx, stat: UpgradeStat): void {
  const seat = ctx.s.current;
  const p = playerAt(ctx.s, seat);
  const valueAfter = raiseStat(ctx.s.rules, p, stat);
  p.upgradeLevels[stat] += 1;
  emit(ctx, {
    type: 'StatUpgraded',
    seat,
    stat,
    cost: 0,
    free: true,
    valueAfter,
    levelAfter: p.upgradeLevels[stat],
    coinsAfter: p.coins,
  });
  enterPostMove(ctx);
}

export function buyItem(ctx: Ctx, item: ItemId): void {
  const seat = ctx.s.current;
  const p = playerAt(ctx.s, seat);
  const price = ctx.s.rules.items[item].price;
  p.coins -= price;
  p.items[item] += 1;
  emit(ctx, { type: 'ItemBought', seat, item, price, coinsAfter: p.coins });
}

export function useThief(ctx: Ctx, target: SeatId): void {
  const seat = ctx.s.current;
  const p = playerAt(ctx.s, seat);
  const victim = playerAt(ctx.s, target);
  p.items.thief -= 1;
  ctx.s.turn.thiefUsed = true;
  const amount = Math.min(ctx.s.rules.thiefStealAmount, victim.coins);
  victim.coins -= amount;
  p.coins += amount;
  emit(ctx, { type: 'ItemUsed', seat, item: 'thief', target });
  emit(ctx, { type: 'CoinsStolen', from: target, to: seat, amount });
}
