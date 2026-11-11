import { resolveCombat, type Fighter } from './combat';
import { playerAt, roll, type Ctx } from './ctx';
import { toFighter, writeBack } from './duel';
import { checkLastSurvivor, eliminate, endGame, endTurn } from './turn';

export function challengeDragon(ctx: Ctx): void {
  const seat = ctx.s.current;
  const p = playerAt(ctx.s, seat);
  const { dragon, passives } = ctx.s.rules;
  ctx.s.pending = null;
  const dragonFighter: Fighter = {
    ref: 'dragon',
    job: null,
    hp: dragon.hp,
    maxHp: dragon.hp,
    atk: dragon.atk,
    def: dragon.def,
    indomitableAvailable: false,
  };
  const result = resolveCombat(
    ctx.s.rules,
    toFighter(p, passives.indomitableUses),
    dragonFighter,
    { kind: 'dragonFight', defaultFirst: 'a', capTieWinner: 'b', capLoser: 'a' },
    (sides) => roll(ctx, sides),
  );
  ctx.ev.push(...result.events);
  writeBack(p, result.a);
  if (result.winner === 'a') {
    endGame(ctx, { kind: 'dragon', winner: seat });
    return;
  }
  eliminate(ctx, seat, 'dragon', null);
  if (checkLastSurvivor(ctx)) return;
  endTurn(ctx);
}
