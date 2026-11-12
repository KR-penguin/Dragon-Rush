import {
  createCombatBot,
  IDLE_POLICY,
  NO_INPUT,
  type BotStyle,
  type CombatPolicy,
  type FighterInput,
} from '@dragon-rush/combat';
import { CACT_BUTTON_DIM, CACT_MOVE_DIM, toFighterInput } from '../codec/actions';
import { combatActionMask } from '../mask';

/** Names accepted by env configs (`opponent: "scripted:<name>"`) and the sim combat resolver. */
export const COMBAT_BOT_NAMES = [
  'scripted:balanced',
  'scripted:aggressive',
  'scripted:cautious',
  'scripted:idle',
  'scripted:random',
  'scripted:pool',
] as const;

export type CombatBotName = (typeof COMBAT_BOT_NAMES)[number];

/** `scripted:pool` draws one of these per fight. */
export const COMBAT_BOT_POOL: readonly BotStyle[] = ['balanced', 'aggressive', 'cautious'];

/**
 * Uniform random cact_v1 actions over the mask, held for `actionRepeat` live ticks like an agent's
 * (a baseline opponent). Stateful: create one per fight.
 */
export function createRandomCombatBot(actionRepeat = 4): CombatPolicy {
  let input: FighterInput = NO_INPUT;
  let live = 0;
  return {
    id: 'combat-bot:random',
    decide(state, side, random) {
      if (state.hitstop > 0) return input;
      if (live % actionRepeat === 0) {
        const mask = combatActionMask(state, side);
        const move = Math.floor(random() * CACT_MOVE_DIM);
        const allowed: number[] = [];
        for (let b = 0; b < CACT_BUTTON_DIM; b++) if (mask.button[b]) allowed.push(b);
        const button = allowed[Math.floor(random() * allowed.length)] ?? 0;
        input = toFighterInput({ move, button }, input).input;
      }
      live += 1;
      return input;
    },
  };
}

export function isCombatBotName(name: string): name is CombatBotName {
  return (COMBAT_BOT_NAMES as readonly string[]).includes(name);
}

/** Resolves a scripted combat bot; `pool` uses `random` to pick a style. Stateful bots: one per fight. */
export function createCombatBotByName(
  name: string,
  random: () => number,
  actionRepeat = 4,
): CombatPolicy {
  switch (name) {
    case 'scripted:balanced':
      return createCombatBot('balanced');
    case 'scripted:aggressive':
      return createCombatBot('aggressive');
    case 'scripted:cautious':
      return createCombatBot('cautious');
    case 'scripted:idle':
      return IDLE_POLICY;
    case 'scripted:random':
      return createRandomCombatBot(actionRepeat);
    case 'scripted:pool':
      return createCombatBot(COMBAT_BOT_POOL[Math.floor(random() * COMBAT_BOT_POOL.length)]!);
    default:
      throw new RangeError(`unknown combat bot ${name}`);
  }
}
