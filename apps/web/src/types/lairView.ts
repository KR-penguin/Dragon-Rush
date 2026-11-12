import type { CombatView } from './combatView';

export type LairState = 'asleep' | 'awake' | 'roar';

/** Board state has a breath cadence, but no running dragon attack count between fights. */
export function dragonIntentCue(
  state: LairState,
  breathEvery: number,
): { status: string; breath: string } {
  const status =
    state === 'asleep'
      ? '용이 잠들어 있습니다'
      : state === 'awake'
        ? '용에게 도전할 수 있습니다'
        : '용이 포효합니다';
  return { status, breath: `전투 시 ${breathEvery}번째 공격마다 브레스` };
}

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
