import type { CombatKind, CombatResult } from '@dragon-rush/combat';
import { DRAGON_DEATH_STOP, KO_STOP } from '../fx/core/time';

/**
 * Presentation phases around a fight (combat-design §8.2, art-direction §10):
 * VS splash → READY with key hints → "싸워라!" (sim tick 0) → fight → KO/time-up beat →
 * result card → back to the board. Bot-only replays skip READY and can be skipped manually.
 */
export type FightPhase = 'intro' | 'ready' | 'fight' | 'finish' | 'result' | 'done';

export const FLOW_MS = {
  intro: 1300,
  replayIntro: 900,
  ready: 1500,
  /** "싸워라!" banner over the first moments of the fight. */
  go: 700,
  timeUp: 900,
  result: 1200,
} as const;

/** Next phase after the timed ones; 'fight' ends on the session's result instead of a timer. */
export function nextPhase(phase: FightPhase, replay: boolean): FightPhase {
  switch (phase) {
    case 'intro':
      return replay ? 'fight' : 'ready';
    case 'ready':
      return 'fight';
    case 'fight':
      return 'finish';
    case 'finish':
      return 'result';
    case 'result':
    case 'done':
      return 'done';
  }
}

export interface PhaseContext {
  readonly replay: boolean;
  readonly kind: CombatKind;
  readonly result: CombatResult | null;
}

/** How long a phase stays up before `nextPhase` (null: waits for the fight to end). */
export function phaseMs(phase: FightPhase, o: PhaseContext): number | null {
  switch (phase) {
    case 'intro':
      return o.replay ? FLOW_MS.replayIntro : FLOW_MS.intro;
    case 'ready':
      return FLOW_MS.ready;
    case 'fight':
    case 'done':
      return null;
    case 'finish':
      return finishMs(o.kind, o.result);
    case 'result':
      return FLOW_MS.result;
  }
}

/** The KO "boss stop" plays out before the result card (presentation only; the sim already ended). */
export function finishMs(kind: CombatKind, result: CombatResult | null): number {
  if (!result || result.timedOut) return FLOW_MS.timeUp;
  const stop = kind === 'dragonFight' && result.winner === 'a' ? DRAGON_DEATH_STOP : KO_STOP;
  return stop.freezeMs + stop.slowMs + stop.rampMs;
}
