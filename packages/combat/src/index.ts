export { COMBAT_TICK_HZ, DEFAULT_COMBAT_RULES } from './rules';
export type {
  CombatRules,
  DashId,
  DashSpec,
  DragonHitSpec,
  DragonRules,
  DrawMoveSpec,
  HitSpec,
  JobKit,
  ManeuverId,
  MeleeMoveSpec,
  MoveId,
  MoveSpec,
  ParryMoveSpec,
  ProjectileSpec,
  RuneMoveSpec,
  ShotMoveSpec,
} from './rules';
export * from './types';
export { createCombat, stepCombat, cloneCombatState, validateCombatSetup } from './step';
export { combatResult } from './result';
export {
  COMBAT_PACK_VERSION,
  serializeCombatState,
  deserializeCombatState,
  hashCombatState,
  hashCombatRules,
} from './pack';
export { runCombat, policyRandom, type CombatPolicy, type RunCombatOptions, type RunCombatOutput } from './runner';
export { createCombatBot, IDLE_POLICY, BOT_STYLES, type BotStyle, type BotParams } from './bots/combatBot';
export { COMBAT_PASSIVES, computeDamage, effectiveAtk, type CombatPassive } from './damage';
export { Q, MOVE_BAM, atan2i, sinQ14, cosQ14, isqrt, bamToMove } from './math';
