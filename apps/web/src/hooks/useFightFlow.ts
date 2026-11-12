import type { CombatResult } from '@dragon-rush/combat';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FLOW_MS, nextPhase, phaseMs, type FightPhase } from '../combat/fightFlow';
import { fx } from '../fx/runtime/fxInstance';
import { playSound } from '../services/audio';
import type { FightSession } from '../services/fight';
import type { PendingFight } from '../services/gameClient';

export interface FightFlow {
  readonly phase: FightPhase;
  readonly result: CombatResult | null;
  /** "싸워라!" banner is up. */
  readonly go: boolean;
  /** Highlights only: jump straight back to the board. */
  readonly skip: (() => void) | null;
}

/**
 * Runs the presentation phases around the session: VS → READY → fight (starts the sim) →
 * KO beat → result card → `onDone(result)` once.
 */
export function useFightFlow(
  session: FightSession | null,
  fight: PendingFight,
  onDone: (result: CombatResult) => void,
): FightFlow {
  const replay = fight.replay !== null;
  const kind = fight.setup.kind;
  const [phase, setPhase] = useState<FightPhase>('intro');
  const [result, setResult] = useState<CombatResult | null>(null);
  const [go, setGo] = useState(false);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    const ms = phaseMs(phase, { replay, kind, result });
    if (ms === null) return;
    const id = setTimeout(() => setPhase((p) => nextPhase(p, replay)), ms);
    return () => clearTimeout(id);
  }, [phase, replay, kind, result]);

  // VS clash: one white flash (≤ 0.3, 80 ms) and the clash sound as the portraits meet.
  useEffect(() => {
    if (phase !== 'intro') return;
    const id = setTimeout(() => {
      fx.play([{ type: 'flash', tone: 'white', alpha: 0.3, ms: 80 }]);
      playSound('clash');
    }, 300);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'fight' || !session) return;
    session.start();
    if (replay) return;
    setGo(true);
    playSound('chime');
    const id = setTimeout(() => setGo(false), FLOW_MS.go);
    return () => clearTimeout(id);
  }, [phase, session, replay]);

  useEffect(
    () =>
      session?.onEnd((r) => {
        setResult((prev) => prev ?? r);
        setPhase((p) => (p === 'fight' ? 'finish' : p));
      }),
    [session],
  );

  useEffect(() => {
    if (phase === 'done' && result) done.current(result);
  }, [phase, result]);

  const skipReplay = useCallback(() => {
    if (!fight.replay) return;
    setResult(fight.replay.result);
    setPhase('done');
  }, [fight.replay]);

  return { phase, result, go, skip: replay ? skipReplay : null };
}
