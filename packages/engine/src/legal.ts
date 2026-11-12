import { BOARD_SIZE } from './board';
import { playerAt } from './ctx';
import { canAffordUpgrade } from './economy';
import {
  ITEM_IDS,
  UPGRADE_STATS,
  type Action,
  type Phase,
  type PublicGameState,
  type SeatId,
} from './types';

type LegalGenerator = (s: PublicGameState) => Action[];

const upgrades = (s: PublicGameState): Action[] => {
  const p = playerAt(s, s.current);
  return UPGRADE_STATS.filter((stat) => canAffordUpgrade(s.rules, p, stat)).map((stat) => ({
    type: 'UPGRADE' as const,
    stat,
  }));
};

const thieves = (s: PublicGameState): Action[] => {
  const seat = s.current;
  const p = playerAt(s, seat);
  const limit = s.rules.items.thief.perTurnLimit;
  if (p.items.thief < 1 || (limit !== null && s.turn.thiefUsed && limit <= 1)) return [];
  const n = s.players.length;
  const out: Action[] = [];
  for (let k = 1; k < n; k++) {
    const target: SeatId = (seat + k) % n;
    const t = playerAt(s, target);
    if (t.alive && t.coins >= 1) out.push({ type: 'USE_THIEF', target });
  }
  return out;
};

const teleports = (s: PublicGameState): Action[] => {
  const p = playerAt(s, s.current);
  const limit = s.rules.items.teleport.perTurnLimit;
  if (p.items.teleport < 1 || s.turn.resting) return [];
  if (limit !== null && s.turn.teleportsUsed >= limit) return [];
  const out: Action[] = [];
  for (let tile = 0; tile < BOARD_SIZE; tile++) {
    if (tile !== p.position) out.push({ type: 'USE_TELEPORT', tile });
  }
  return out;
};

const purchases = (s: PublicGameState): Action[] => {
  if (!s.turn.canBuy) return [];
  const p = playerAt(s, s.current);
  return ITEM_IDS.filter((item) => p.coins >= s.rules.items[item].price).map((item) => ({
    type: 'BUY_ITEM' as const,
    item,
  }));
};

/** Order inside each phase is fixed: timeouts pick the first legal action. */
const LEGAL_BY_PHASE: Record<Phase, LegalGenerator> = {
  PRE_ROLL: (s) => [
    s.turn.resting ? { type: 'END_TURN' } : { type: 'ROLL_DICE' },
    { type: 'CHALLENGE_DRAGON' },
    ...upgrades(s),
    ...thieves(s),
    ...teleports(s),
  ],
  MOVE_ADJUST: (s) => {
    const out: Action[] = [{ type: 'ADJUST_MOVE', delta: 0 }];
    if ((s.turn.dice ?? 0) >= 2) out.push({ type: 'ADJUST_MOVE', delta: -1 });
    out.push({ type: 'ADJUST_MOVE', delta: 1 });
    return out;
  },
  CHOOSE_PVP_TARGET: (s) =>
    (s.pvp?.candidates ?? []).map((target) => ({ type: 'CHOOSE_PVP_TARGET' as const, target })),
  SHIELD_DECISION: (s) => [
    { type: 'SHIELD_DECISION', use: false },
    ...(playerAt(s, s.pending!.actor).items.shield > 0
      ? [{ type: 'SHIELD_DECISION' as const, use: true }]
      : []),
  ],
  TRAINING_CHOICE: () =>
    UPGRADE_STATS.map((stat) => ({ type: 'CHOOSE_TRAINING_STAT' as const, stat })),
  POST_MOVE: (s) => [
    { type: 'END_TURN' },
    ...purchases(s),
    ...upgrades(s),
    ...thieves(s),
    ...teleports(s),
  ],
  // A pending fight is settled by applyCombatResult / resolveCombatWithDice, never by a board action.
  COMBAT: () => [],
};

export function getLegalActions(state: PublicGameState): Action[] {
  if (!state.pending) return [];
  return LEGAL_BY_PHASE[state.pending.phase](state);
}

export function actionKey(action: Action): string {
  switch (action.type) {
    case 'UPGRADE':
    case 'CHOOSE_TRAINING_STAT':
      return `${action.type}:${action.stat}`;
    case 'BUY_ITEM':
      return `${action.type}:${action.item}`;
    case 'USE_TELEPORT':
      return `${action.type}:${action.tile}`;
    case 'USE_THIEF':
    case 'CHOOSE_PVP_TARGET':
      return `${action.type}:${action.target}`;
    case 'ADJUST_MOVE':
      return `${action.type}:${action.delta}`;
    case 'SHIELD_DECISION':
      return `${action.type}:${action.use}`;
    default:
      return action.type;
  }
}

export function isLegalAction(state: PublicGameState, action: Action): boolean {
  const key = actionKey(action);
  return getLegalActions(state).some((a) => actionKey(a) === key);
}
