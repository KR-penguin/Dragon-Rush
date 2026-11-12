import { useLayoutEffect, useState } from 'react';
import type { FightSession } from '../services/fight';
import { useEscape } from './useEscape';

/** Esc pauses a live fight (and resumes it); `hold` pauses while e.g. the controls help is open. */
export function useFightPause(session: FightSession | null, enabled: boolean, hold: boolean) {
  const [paused, setPaused] = useState(false);
  const effective = enabled && (paused || hold);
  useLayoutEffect(() => {
    session?.setPaused(effective);
  }, [session, effective]);
  useEscape(enabled && !hold, () => setPaused((p) => !p));
  return {
    paused: enabled && paused && !hold,
    resume: () => setPaused(false),
    pause: () => setPaused(true),
  };
}
