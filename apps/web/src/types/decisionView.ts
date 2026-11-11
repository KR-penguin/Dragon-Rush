import {
  BOARD_SIZE,
  ITEM_IDS,
  UPGRADE_STATS,
  upgradeCost,
  type ItemId,
  type JobId,
  type PublicGameState,
  type SeatId,
  type TileId,
  type UpgradeStat,
} from '@hero-dice/engine';
import type { MoveDelta } from './actionGroups';
import { playerOf } from './playerView';

export interface MoveOption {
  readonly delta: MoveDelta;
  readonly steps: number;
  readonly tile: number;
  readonly tileId: TileId;
}

/** Destination preview for each legal move adjustment of the player who rolled. */
export function moveOptions(state: PublicGameState, deltas: readonly MoveDelta[]): MoveOption[] {
  const p = playerOf(state, state.current);
  const dice = state.turn.dice ?? 0;
  return [...deltas]
    .sort((a, b) => a - b)
    .map((delta) => {
      const steps = dice + delta;
      const tile = (p.position + steps) % BOARD_SIZE;
      return { delta, steps, tile, tileId: state.rules.board[tile]!.id };
    });
}

export interface StatOption {
  readonly stat: UpgradeStat;
  readonly cost: number;
  readonly current: number;
  readonly next: number;
  readonly legal: boolean;
}

const statValue = (p: { atk: number; def: number; maxHp: number }, stat: UpgradeStat): number =>
  stat === 'maxHp' ? p.maxHp : p[stat];

/** Next cost and value after one level, for paid upgrades or the free training choice. */
export function statOptions(
  state: PublicGameState,
  seat: SeatId,
  legalStats: readonly UpgradeStat[],
): StatOption[] {
  const p = playerOf(state, seat);
  return UPGRADE_STATS.map((stat) => {
    const current = statValue(p, stat);
    return {
      stat,
      cost: upgradeCost(state.rules, p, stat),
      current,
      next: current + state.rules.upgrades[stat].amount,
      legal: legalStats.includes(stat),
    };
  });
}

export interface ShopRow {
  readonly item: ItemId;
  readonly price: number;
  readonly owned: number;
  readonly buyable: boolean;
}

export function shopRows(state: PublicGameState, seat: SeatId, buys: readonly ItemId[]): ShopRow[] {
  const p = playerOf(state, seat);
  return ITEM_IDS.map((item) => ({
    item,
    price: state.rules.items[item].price,
    owned: p.items[item],
    buyable: buys.includes(item),
  }));
}

export interface OpponentSummary {
  readonly seat: SeatId;
  readonly job: JobId;
  readonly hp: number;
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly coins: number;
  readonly shields: number;
}

export function opponentSummaries(
  state: PublicGameState,
  seats: readonly SeatId[],
): OpponentSummary[] {
  return seats.map((seat) => {
    const p = playerOf(state, seat);
    return {
      seat,
      job: p.job,
      hp: p.hp,
      maxHp: p.maxHp,
      atk: p.atk,
      def: p.def,
      coins: p.coins,
      shields: p.items.shield,
    };
  });
}
