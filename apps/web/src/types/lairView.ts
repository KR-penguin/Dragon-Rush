import type { CombatView } from './combatView';

export type LairState = 'asleep' | 'awake' | 'roar';

/**
 * Cosmetic dragon state: roaring during a dragon fight, awake while a challenge is legal for a
 * seat deciding here (read from legalActions), asleep otherwise.
 */
export function lairState(combat: CombatView | null, challengeLegal: boolean): LairState {
  if (combat?.kind === 'dragonFight') return 'roar';
  return challengeLegal ? 'awake' : 'asleep';
}

/**
 * Breath runes lit in the dragon fight on screen: one per dragon attack, all of them on the
 * breath itself (every `breathEvery`-th attack), then the cycle restarts.
 */
export function breathRunesLit(combat: CombatView | null, breathEvery: number): number {
  if (!combat || combat.kind !== 'dragonFight' || breathEvery <= 0) return 0;
  const attacks = combat.hits.filter((h) => h.attacker === 'dragon').length;
  return attacks === 0 ? 0 : ((attacks - 1) % breathEvery) + 1;
}
