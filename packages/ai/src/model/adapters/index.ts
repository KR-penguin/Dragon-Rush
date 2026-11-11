import type { WeightAdapter } from '../../policy';

/**
 * Adapter for the user's Actor-Critic weight JSON. The user defines that format
 * (docs/ai-interface-spec.md §9); until it is received this stays null and
 * model seats remain disabled everywhere (web, server, sim).
 */
export const USER_WEIGHT_ADAPTER: WeightAdapter | null = null;

export function getWeightAdapter(): WeightAdapter | null {
  return USER_WEIGHT_ADAPTER;
}
