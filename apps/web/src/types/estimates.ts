import { dragonProfile, profileOf, winProbability, type OutcomeModel } from '@dragon-rush/ai';
import type { PublicGameState, SeatId } from '@dragon-rush/engine';
import { playerOf } from './playerView';

export const ESTIMATE_SAMPLES = 320;

/** Monte Carlo estimate of `seat` beating the dragon right now. */
export function dragonWinChance(
  state: PublicGameState,
  seat: SeatId,
  samples = ESTIMATE_SAMPLES,
  outcomeModel?: OutcomeModel,
): number {
  return winProbability(
    state.rules,
    profileOf(playerOf(state, seat), state.rules),
    dragonProfile(state.rules),
    samples,
    outcomeModel,
  );
}

/** Chance that `arriver` wins a duel against `defender` (the arriver strikes first unless the defender is an archer). */
export function duelWinChance(
  state: PublicGameState,
  arriver: SeatId,
  defender: SeatId,
  samples = ESTIMATE_SAMPLES,
  outcomeModel?: OutcomeModel,
): number {
  const rules = state.rules;
  return winProbability(
    rules,
    profileOf(playerOf(state, arriver), rules),
    profileOf(playerOf(state, defender), rules),
    samples,
    outcomeModel,
  );
}

/** Duel win chance for whoever is deciding on a shield, or null when no duel is pending. */
export function shieldDecisionChance(
  state: PublicGameState,
  decider: SeatId,
  samples = ESTIMATE_SAMPLES,
  outcomeModel?: OutcomeModel,
): number | null {
  const pvp = state.pvp;
  if (!pvp || pvp.target === null) return null;
  if (decider === pvp.arriver)
    return duelWinChance(state, pvp.arriver, pvp.target, samples, outcomeModel);
  return 1 - duelWinChance(state, pvp.arriver, decider, samples, outcomeModel);
}

export const formatPercent = (p: number): string => `${Math.round(p * 100)}%`;
