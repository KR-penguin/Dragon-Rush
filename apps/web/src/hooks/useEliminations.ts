import { useEffect, useState } from 'react';
import type { GameStore } from '../store/gameStore';
import { collectEliminations, type Eliminations } from '../types/resultView';

/** Records who was eliminated when and by whom, from authoritative updates (unaffected by skipping). */
export function useEliminations(store: GameStore): Eliminations {
  const [record, setRecord] = useState<Eliminations>(() =>
    collectEliminations(new Map(), store.getState().latest?.events ?? []),
  );
  useEffect(
    () =>
      store.subscribe((s, prev) => {
        if (s.latest && s.latest !== prev.latest) {
          const events = s.latest.events;
          setRecord((r) => collectEliminations(r, events));
        }
      }),
    [store],
  );
  return record;
}
