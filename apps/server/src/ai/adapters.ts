import type { WeightAdapter } from '@hero-dice/ai';

/**
 * Adapter for the user's Actor-Critic weight JSON. The format is defined by the user
 * (docs/ai-interface-spec.md §9); until it is received no adapter is registered and
 * model seats stay disabled.
 */
export function getWeightAdapter(): WeightAdapter | null {
  return null;
}
