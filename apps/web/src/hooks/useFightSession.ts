import { useEffect, useState } from 'react';
import type { PendingFight } from '../services/gameClient';
import {
  KeyTracker,
  createLocalFightSession,
  createReplaySession,
  gameKeysOf,
  layoutsFor,
  sourcesFor,
  type FightSession,
} from '../services/fight';

export interface FightBundle {
  readonly session: FightSession;
  readonly tracker: KeyTracker;
}

/**
 * Creates the fight session for the pending fight: a live local sim with keyboard/gamepad/bot
 * inputs, or the 4× highlight of a bot-only fight. Keys are tracked on the window while mounted.
 */
export function useFightSession(fight: PendingFight): FightBundle | null {
  const [bundle, setBundle] = useState<FightBundle | null>(null);
  useEffect(() => {
    const layouts = layoutsFor(fight.sides.map((s) => s.control));
    const tracker = new KeyTracker(gameKeysOf(layouts));
    const detach = tracker.attach(window, document);
    const session = fight.replay
      ? createReplaySession(fight, fight.replay)
      : createLocalFightSession(fight, sourcesFor(fight, tracker));
    setBundle({ session, tracker });
    // Dev console handle for inspecting a live fight (`__dragonRushFight.frame().curr`).
    if (import.meta.env.DEV)
      (globalThis as { __dragonRushFight?: FightSession }).__dragonRushFight = session;
    return () => {
      detach();
      session.dispose();
      setBundle(null);
    };
  }, [fight]);
  return bundle;
}
