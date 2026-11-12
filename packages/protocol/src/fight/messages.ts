import type { CombatKind, CombatResult, CombatRules, CombatSetup } from '@dragon-rush/combat';
import type { SeatId } from '@dragon-rush/engine';

/** Who drives a fight seat right now. */
export type FightController = 'human' | 'bot';

export interface FightSeatInfo {
  /** Engine seat (board turn order) of this fighter; null for the dragon side. */
  readonly engineSeat: SeatId | null;
  readonly playerId: string | null;
  readonly name: string;
  readonly controller: FightController;
}

export type FightRole = { readonly role: 'fighter'; readonly seat: 0 | 1 } | { readonly role: 'spectator' };

/** S -> room (and to any socket that joins while the fight is active). */
export interface FightStartMsg {
  readonly fightId: number;
  readonly kind: CombatKind;
  /** Combat seed: exact PvE prediction needs it (combat-only exception to the hidden-RNG rule). */
  readonly seed: number;
  readonly setup: CombatSetup;
  /** Effective rules; clients build the fight from these, never from their own defaults. */
  readonly rules: CombatRules;
  readonly rulesHash: number;
  readonly packVersion: number;
  readonly combatBuildId: string;
  /** Index 0 = side a, 1 = side b (absent in a dragon fight). */
  readonly seats: readonly FightSeatInfo[];
  readonly you: FightRole;
  readonly prerollTicks: number;
  readonly maxTicks: number;
  readonly pveHoldTicks: number;
  readonly pvpHoldTicks: number;
}

/** S -> room: wall clock of tick 0 in the server's monotonic clock (ms). */
export interface FightGoMsg {
  readonly fightId: number;
  readonly epochServerMs: number;
}

export interface FightControlMsg {
  readonly fightId: number;
  readonly seat: 0 | 1;
  readonly controller: FightController;
  readonly fromTick: number;
}

export interface FightSyncSeat {
  readonly lastRealTick: number;
  readonly lastRealMask: number;
  readonly substRun: number;
  readonly controller: FightController;
}

export type FightSyncReason = 'join' | 'gap' | 'desync' | 'stall' | 'backlog' | 'overflow' | 'degraded';

export interface FightSyncMsg {
  readonly fightId: number;
  readonly reason: FightSyncReason;
  /** State produced by `tick` (serializeCombatState). */
  readonly tick: number;
  readonly state: readonly number[];
  readonly hash: number;
  readonly seats: readonly FightSyncSeat[];
  /** Future controller changes already decided by the server (fromTick > tick). */
  readonly controls: readonly FightControlMsg[];
  /** Buffered (unstepped) masks the recipient may see: contiguous runs, oldest first. */
  readonly pending: readonly { readonly seat: 0 | 1; readonly firstTick: number; readonly masks: readonly number[] }[];
}

export interface FightRetimeMsg {
  readonly fightId: number;
  readonly epochServerMs: number;
  readonly atTick: number;
}

export interface FightEndMsg {
  readonly fightId: number;
  readonly endTick: number;
  readonly outcome: CombatResult;
  readonly finalHash: number;
  /** True when the server ended the fight without a sim result (dice fallback). */
  readonly aborted?: boolean;
}

/** All-bot fights: simulated at once on the server, sent for a highlight replay. */
export interface FightReplayMsg {
  readonly fightId: number;
  readonly seed: number;
  readonly setup: CombatSetup;
  readonly rules: CombatRules;
  /** Run-length pairs per tick: [count, maskA, maskB, count, maskA, maskB, ...]. */
  readonly inputs: readonly number[];
  readonly endTick: number;
  readonly outcome: CombatResult;
  readonly finalHash: number;
}
