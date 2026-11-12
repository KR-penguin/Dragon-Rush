import type { CombatResult, CombatState } from './types';

/** Board write-back once the fight is over: winner, remaining HP (>= 0), Last Stand use, timeout flag. */
export function combatResult(state: CombatState): CombatResult | null {
  if (!state.outcome) return null;
  const { winner, timedOut } = state.outcome;
  const b = state.b;
  return b
    ? {
        winner,
        hpA: Math.max(0, state.a.hp),
        hpB: Math.max(0, b.hp),
        indomitableUsedA: state.a.lastStandUsed,
        indomitableUsedB: b.lastStandUsed,
        timedOut,
      }
    : {
        winner,
        hpA: Math.max(0, state.a.hp),
        hpB: null,
        indomitableUsedA: state.a.lastStandUsed,
        timedOut,
      };
}
