import type { Policy } from '../policy';
import { createHeuristicBot, HEURISTIC_STYLES, type HeuristicStyle } from './heuristic/heuristicBot';
import { createRandomBot } from './randomBot';

export const BOT_NAMES = [
  'random',
  'random:uniform',
  'heuristic',
  'heuristic:aggro',
  'heuristic:growth',
  'heuristic:rush',
] as const;

/** Resolves a bot name; plain `heuristic` picks a style with `random`. */
export function createPolicyByName(name: string, random: () => number): Policy {
  if (name === 'random') return createRandomBot();
  if (name === 'random:uniform') return createRandomBot({ uniform: true });
  if (name === 'heuristic') {
    const style = HEURISTIC_STYLES[Math.floor(random() * HEURISTIC_STYLES.length)] as HeuristicStyle;
    return createHeuristicBot(style);
  }
  const [kind, style] = name.split(':');
  if (kind === 'heuristic' && HEURISTIC_STYLES.includes(style as HeuristicStyle)) {
    return createHeuristicBot(style as HeuristicStyle);
  }
  throw new RangeError(`unknown bot ${name}`);
}
