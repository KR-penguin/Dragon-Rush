import type { Action, ItemId, SeatId, UpgradeStat } from '@hero-dice/engine';
import { assertNever } from './assertNever';

export type MoveDelta = -1 | 0 | 1;

/** Legal actions sorted into what each piece of UI needs. Built only from `legalActions`. */
export interface ActionGroups {
  readonly roll: boolean;
  readonly endTurn: boolean;
  readonly challengeDragon: boolean;
  readonly upgrades: readonly UpgradeStat[];
  readonly buys: readonly ItemId[];
  readonly teleportTiles: readonly number[];
  readonly thiefTargets: readonly SeatId[];
  readonly moveDeltas: readonly MoveDelta[];
  readonly pvpTargets: readonly SeatId[];
  readonly shieldChoices: readonly boolean[];
  readonly trainingStats: readonly UpgradeStat[];
}

export const EMPTY_GROUPS: ActionGroups = {
  roll: false,
  endTurn: false,
  challengeDragon: false,
  upgrades: [],
  buys: [],
  teleportTiles: [],
  thiefTargets: [],
  moveDeltas: [],
  pvpTargets: [],
  shieldChoices: [],
  trainingStats: [],
};

export function groupActions(legal: readonly Action[]): ActionGroups {
  let roll = false;
  let endTurn = false;
  let challengeDragon = false;
  const upgrades: UpgradeStat[] = [];
  const buys: ItemId[] = [];
  const teleportTiles: number[] = [];
  const thiefTargets: SeatId[] = [];
  const moveDeltas: MoveDelta[] = [];
  const pvpTargets: SeatId[] = [];
  const shieldChoices: boolean[] = [];
  const trainingStats: UpgradeStat[] = [];
  for (const a of legal) {
    switch (a.type) {
      case 'ROLL_DICE':
        roll = true;
        break;
      case 'END_TURN':
        endTurn = true;
        break;
      case 'CHALLENGE_DRAGON':
        challengeDragon = true;
        break;
      case 'UPGRADE':
        upgrades.push(a.stat);
        break;
      case 'BUY_ITEM':
        buys.push(a.item);
        break;
      case 'USE_TELEPORT':
        teleportTiles.push(a.tile);
        break;
      case 'USE_THIEF':
        thiefTargets.push(a.target);
        break;
      case 'ADJUST_MOVE':
        moveDeltas.push(a.delta);
        break;
      case 'CHOOSE_PVP_TARGET':
        pvpTargets.push(a.target);
        break;
      case 'SHIELD_DECISION':
        shieldChoices.push(a.use);
        break;
      case 'CHOOSE_TRAINING_STAT':
        trainingStats.push(a.stat);
        break;
      default:
        assertNever(a);
    }
  }
  moveDeltas.sort((x, y) => x - y);
  return {
    roll,
    endTurn,
    challengeDragon,
    upgrades,
    buys,
    teleportTiles,
    thiefTargets,
    moveDeltas,
    pvpTargets,
    shieldChoices,
    trainingStats,
  };
}
