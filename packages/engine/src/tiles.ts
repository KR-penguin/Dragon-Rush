import { emit, playerAt, roll, type Ctx } from './ctx';
import { addCoins, healOrHurtByEvent } from './economy';
import { enterPostMove } from './turn';
import { ITEM_IDS, type EffectSpec, type ItemId, type SeatId } from './types';

type EffectHandler<K extends EffectSpec['kind']> = (ctx: Ctx, seat: SeatId, e: Extract<EffectSpec, { kind: K }>) => void;

const HANDLERS: { [K in EffectSpec['kind']]: EffectHandler<K> } = {
  coins: (ctx, seat, e) => {
    const p = playerAt(ctx.s, seat);
    const before = p.coins;
    const after = addCoins(p, e.amount);
    emit(ctx, { type: 'EffectApplied', seat, effect: 'coins', delta: after - before, after });
  },
  hp: (ctx, seat, e) => {
    const p = playerAt(ctx.s, seat);
    const before = p.hp;
    const after = healOrHurtByEvent(ctx.s.rules, p, e.amount);
    emit(ctx, { type: 'EffectApplied', seat, effect: 'hp', delta: after - before, after });
  },
  stat: (ctx, seat, e) => {
    const p = playerAt(ctx.s, seat);
    p[e.stat] += e.amount;
    emit(ctx, { type: 'EffectApplied', seat, effect: 'stat', stat: e.stat, delta: e.amount, after: p[e.stat] });
  },
  maxHp: (ctx, seat, e) => {
    const p = playerAt(ctx.s, seat);
    p.maxHp += e.amount;
    p.hp += e.amount;
    emit(ctx, { type: 'EffectApplied', seat, effect: 'maxHp', delta: e.amount, after: p.maxHp });
  },
  skipTurn: (ctx, seat) => {
    playerAt(ctx.s, seat).skipNextTurn = true;
    emit(ctx, { type: 'EffectApplied', seat, effect: 'skipTurn', delta: 0, after: 1 });
  },
  randomItem: (ctx, seat) => {
    const item = ITEM_IDS[roll(ctx, ITEM_IDS.length) - 1] as ItemId;
    const p = playerAt(ctx.s, seat);
    p.items[item] += 1;
    emit(ctx, { type: 'EffectApplied', seat, effect: 'randomItem', item, delta: 1, after: p.items[item] });
  },
  training: () => {},
  shop: (ctx) => {
    ctx.s.turn.canBuy = true;
  },
  mystery: (ctx, seat) => {
    const deck = ctx.s.rules.mysteryDeck;
    const card = deck[roll(ctx, deck.length) - 1];
    if (!card) return;
    emit(ctx, { type: 'MysteryCardDrawn', seat, cardId: card.id });
    for (const effect of card.effects) applyEffect(ctx, seat, effect);
  },
};

export function applyEffect(ctx: Ctx, seat: SeatId, effect: EffectSpec): void {
  (HANDLERS[effect.kind] as EffectHandler<typeof effect.kind>)(ctx, seat, effect as never);
}

/** Resolves the arriving player's tile, then moves to TRAINING_CHOICE or POST_MOVE. */
export function resolveTile(ctx: Ctx, seat: SeatId): void {
  const p = playerAt(ctx.s, seat);
  const tile = ctx.s.rules.board[p.position];
  if (!tile) throw new RangeError(`no tile at ${p.position}`);
  emit(ctx, { type: 'TileResolved', seat, tile: p.position, tileId: tile.id });
  for (const effect of tile.effects) applyEffect(ctx, seat, effect);
  if (tile.effects.some((e) => e.kind === 'training')) {
    ctx.s.pvp = null;
    ctx.s.pending = { actor: seat, phase: 'TRAINING_CHOICE' };
    return;
  }
  enterPostMove(ctx);
}
