import type { CombatWeightAdapter } from '../types';

/**
 * Adapter for the user's combat Actor-Critic weight JSON. The user defines that format
 * (docs/combat-ai-spec.md §11); until it is received this stays null and model fighters fall back to the
 * scripted combat bots everywhere. Kept apart from the board USER_WEIGHT_ADAPTER.
 */
export const USER_COMBAT_WEIGHT_ADAPTER: CombatWeightAdapter | null = null;

export function getCombatWeightAdapter(): CombatWeightAdapter | null {
  return USER_COMBAT_WEIGHT_ADAPTER;
}
