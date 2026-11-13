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
  ctx.s.turn.itemsBought += 1;
  emit(ctx, { type: 'ItemBought', seat, item, price, coinsAfter: p.coins });
}

export function activatePrinceTotem(ctx: Ctx, seat: SeatId): number {
  const p = playerAt(ctx.s, seat);
  if (p.items.princeTotem < 1) return 0;
  const bonus = ctx.s.rules.princeTotemMaxHpBonus;
  const hpBefore = p.hp;
  p.items.princeTotem -= 1;
  p.maxHp += bonus;
  p.hp = p.maxHp;
  emit(ctx, { type: 'ItemUsed', seat, item: 'princeTotem' });
  emit(ctx, { type: 'EffectApplied', seat, effect: 'maxHp', delta: bonus, after: p.maxHp });
  emit(ctx, { type: 'EffectApplied', seat, effect: 'hp', delta: p.hp - hpBefore, after: p.hp });
  return bonus;
}

export function restorePrinceTotem(ctx: Ctx, seat: SeatId, bonus: number | undefined): void {
  if (bonus === undefined) return;
  const p = playerAt(ctx.s, seat);
  const hpBefore = p.hp;
  p.maxHp -= bonus;
  p.hp = Math.min(p.hp, p.maxHp);
  emit(ctx, { type: 'EffectApplied', seat, effect: 'maxHp', delta: -bonus, after: p.maxHp });
  emit(ctx, { type: 'EffectApplied', seat, effect: 'hp', delta: p.hp - hpBefore, after: p.hp });
}
