import { useEffect, useState } from 'react';
import type { GameStore } from '../store/gameStore';
import { reduceCombat, type CombatView } from '../types/combatView';

/** Accumulates the fight currently being animated, event by event. */
export function useCombatView(store: GameStore): CombatView | null {
  const [view, setView] = useState<CombatView | null>(null);
  useEffect(() => {
    setView(null);
    return store.subscribe((s, prev) => {
      if (s.current !== prev.current) setView((v) => reduceCombat(v, s.current, s.display));
    });
  }, [store]);
  return view;
}
