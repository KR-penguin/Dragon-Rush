import {
  NO_INPUT,
  createCombatBot,
  policyRandom,
  type BotParams,
  type BotStyle,
  type CombatPolicy,
  type FighterInput,
  type Side,
} from '@dragon-rush/combat';
import type { FightBotLevel } from '../gameClient';
import type { FightInputSource } from './types';

export interface FightBotParams {
  readonly style: BotStyle;
  /** Ticks before a new threat is noticed. */
  readonly reaction: number;
  /** Decides every N ticks and holds the input in between (AI action repeat, combat-ai-spec). */
  readonly interval: number;
  readonly behavior?: Omit<BotParams, 'reaction'>;
}

const BEGINNER_BEHAVIOR: Omit<BotParams, 'reaction'> = {
  dodge: 0.18,
  dashDodge: 0.15,
  poke: 0.005,
  punish: 0.035,
  fire: 0.008,
  skill: 0.005,
  gapClose: 0.006,
  panicDash: 0.035,
  parryRead: 0.04,
  margin: 0,
  spacing: 12,
  rangeScale: 0.85,
  quickShotRange: 200,
};

/** Difficulty changes decision quality while every scripted bot still decides each tick. */
export const FIGHT_BOT_LEVELS: Readonly<Record<FightBotLevel, FightBotParams>> = {
  easy: { style: 'cautious', reaction: 36, interval: 1, behavior: BEGINNER_BEHAVIOR },
  normal: { style: 'balanced', reaction: 10, interval: 1 },
  hard: { style: 'aggressive', reaction: 6, interval: 1 },
};

export const FIGHT_BOT_LABEL: Readonly<Record<FightBotLevel, string>> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
};

/** Policy input held for `interval` ticks between decisions; counts its own ticks. */
export function createPolicySource(
  policy: CombatPolicy,
  random: () => number,
  interval: number,
): FightInputSource {
  const every = Math.max(1, Math.floor(interval));
  let n = 0;
  let held: FighterInput = NO_INPUT;
  return {
    sample(state, side) {
      if (n % every === 0) held = policy.decide(state, side, random);
      n += 1;
      return held;
    },
  };
}

/**
 * Scripted combat bot for one side. Its randomness is its own stream from the fight seed, so a
 * bot-only fight replays exactly from (setup, seed) and live play matches the headless resolve.
 */
export function createFightBotSource(
  level: FightBotLevel,
  seed: number,
  side: Side,
): FightInputSource {
  const p = FIGHT_BOT_LEVELS[level];
  const policy = createCombatBot(p.style, { ...p.behavior, reaction: p.reaction });
  return createPolicySource(policy, policyRandom(seed, side === 'a' ? 1 : 2), p.interval);
}
