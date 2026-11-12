import {
  NO_INPUT,
  createCombatBot,
  policyRandom,
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
}

/** Scripted bots decide each tick; difficulty changes reaction delay and style. */
export const FIGHT_BOT_LEVELS: Readonly<Record<FightBotLevel, FightBotParams>> = {
  easy: { style: 'cautious', reaction: 18, interval: 1 },
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
  const policy = createCombatBot(p.style, { reaction: p.reaction });
  return createPolicySource(policy, policyRandom(seed, side === 'a' ? 1 : 2), p.interval);
}
