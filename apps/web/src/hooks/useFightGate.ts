import { useState } from 'react';
import { useStore } from 'zustand';
import type { PendingFight } from '../services/gameClient';
import { isAnimating, type GameStore } from '../store/gameStore';

/**
 * The fight to put on screen: the client's pending fight, once the board has finished animating
 * up to it (the CombatStarted beat plays on the board first). Latched until the fight is settled.
 */
export function useFightGate(store: GameStore): PendingFight | null {
  const pending = useStore(store, (s) => s.latest?.fight ?? null);
  const idle = useStore(store, (s) => !isAnimating(s));
  const [shown, setShown] = useState<PendingFight | null>(null);
  if (pending === null && shown !== null) setShown(null);
  else if (pending !== null && idle && shown?.id !== pending.id) setShown(pending);
  return pending === null ? null : shown;
}
