import {
  BOARD_SIZE,
  ITEM_IDS,
  UPGRADE_STATS,
  type Action,
  type PublicGameState,
  type SeatId,
} from '@dragon-rush/engine';

export const ACT_VERSION = 'act_v1';
export const ACTION_DIM = 47;

const IDX = {
  ROLL_DICE: 0,
  END_TURN: 1,
  CHALLENGE_DRAGON: 2,
  UPGRADE: 3,
  BUY: 6,
  TELEPORT: 9,
  THIEF: 33,
  ADJUST: 36,
  SHIELD: 39,
  PVP_TARGET: 41,
  TRAIN: 44,
} as const;

const STAT_NAMES = ['ATK', 'DEF', 'MAXHP'] as const;

export const ACTION_NAMES: readonly string[] = [
  'ROLL_DICE',
  'END_TURN',
  'CHALLENGE_DRAGON',
  ...STAT_NAMES.map((s) => `UPGRADE_${s}`),
  ...ITEM_IDS.map((i) => `BUY_${i.toUpperCase()}`),
  ...Array.from({ length: BOARD_SIZE }, (_, t) => `TELEPORT_T${String(t).padStart(2, '0')}`),
  ...[1, 2, 3].map((k) => `THIEF_OPP${k}`),
  'ADJUST_M1',
  'ADJUST_0',
  'ADJUST_P1',
  'SHIELD_NO',
  'SHIELD_YES',
  ...[1, 2, 3].map((k) => `PVP_TARGET_OPP${k}`),
  ...STAT_NAMES.map((s) => `TRAIN_${s}`),
];

export class ActionCodecError extends Error {
  override readonly name = 'ActionCodecError';
}

const rel = (seat: SeatId, target: SeatId, n: number): number => (target - seat + n) % n;
const abs = (seat: SeatId, k: number, n: number): SeatId => (seat + k) % n;

export function encodeAction(view: PublicGameState, seat: SeatId, action: Action): number {
  const n = view.players.length;
  switch (action.type) {
    case 'ROLL_DICE':
      return IDX.ROLL_DICE;
    case 'END_TURN':
      return IDX.END_TURN;
    case 'CHALLENGE_DRAGON':
      return IDX.CHALLENGE_DRAGON;
    case 'UPGRADE':
      return IDX.UPGRADE + UPGRADE_STATS.indexOf(action.stat);
    case 'BUY_ITEM':
      return IDX.BUY + ITEM_IDS.indexOf(action.item);
    case 'USE_TELEPORT':
      return IDX.TELEPORT + action.tile;
    case 'USE_THIEF':
      return IDX.THIEF + rel(seat, action.target, n) - 1;
    case 'ADJUST_MOVE':
      return IDX.ADJUST + action.delta + 1;
    case 'SHIELD_DECISION':
      return IDX.SHIELD + (action.use ? 1 : 0);
    case 'CHOOSE_PVP_TARGET':
      return IDX.PVP_TARGET + rel(seat, action.target, n) - 1;
    case 'CHOOSE_TRAINING_STAT':
      return IDX.TRAIN + UPGRADE_STATS.indexOf(action.stat);
  }
}

export function decodeAction(view: PublicGameState, seat: SeatId, index: number): Action {
  const n = view.players.length;
  if (!Number.isInteger(index) || index < 0 || index >= ACTION_DIM)
    throw new ActionCodecError(`bad index ${index}`);
  if (index === IDX.ROLL_DICE) return { type: 'ROLL_DICE' };
  if (index === IDX.END_TURN) return { type: 'END_TURN' };
  if (index === IDX.CHALLENGE_DRAGON) return { type: 'CHALLENGE_DRAGON' };
  if (index < IDX.BUY) return { type: 'UPGRADE', stat: UPGRADE_STATS[index - IDX.UPGRADE]! };
  if (index < IDX.TELEPORT) return { type: 'BUY_ITEM', item: ITEM_IDS[index - IDX.BUY]! };
  if (index < IDX.THIEF) return { type: 'USE_TELEPORT', tile: index - IDX.TELEPORT };
  if (index < IDX.ADJUST) return { type: 'USE_THIEF', target: abs(seat, index - IDX.THIEF + 1, n) };
  if (index < IDX.SHIELD)
    return { type: 'ADJUST_MOVE', delta: (index - IDX.ADJUST - 1) as -1 | 0 | 1 };
  if (index < IDX.PVP_TARGET) return { type: 'SHIELD_DECISION', use: index === IDX.SHIELD + 1 };
  if (index < IDX.TRAIN)
    return { type: 'CHOOSE_PVP_TARGET', target: abs(seat, index - IDX.PVP_TARGET + 1, n) };
  return { type: 'CHOOSE_TRAINING_STAT', stat: UPGRADE_STATS[index - IDX.TRAIN]! };
}

export function maskFromLegal(
  view: PublicGameState,
  seat: SeatId,
  legal: readonly Action[],
): Uint8Array {
  const mask = new Uint8Array(ACTION_DIM);
  for (const a of legal) mask[encodeAction(view, seat, a)] = 1;
  return mask;
}

export function legalIndices(
  view: PublicGameState,
  seat: SeatId,
  legal: readonly Action[],
): number[] {
  return legal.map((a) => encodeAction(view, seat, a)).sort((x, y) => x - y);
}
