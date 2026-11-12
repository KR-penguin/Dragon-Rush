import {
  DEFAULT_COMBAT_RULES,
  policyRandom,
  runCombat,
  type CombatSetup,
} from '@dragon-rush/combat';
import { boardCombatSetup, createCombatBotByName } from '@dragon-rush/combat-ai';
import { assertOutcomeCompatible, type OutcomeModel } from '@dragon-rush/ai';
import {
  applyCombatResult,
  resolveCombatWithDice,
  type GameEvent,
  type GameState,
  createRng,
  nextFloat,
} from '@dragon-rush/engine';
import { outcomeModelSetup, sampleOutcomeResult } from './outcome';

export const COMBAT_RESOLVERS = ['dice', 'sim', 'outcome'] as const;
export type CombatResolverName = (typeof COMBAT_RESOLVERS)[number];

/** Settles every fight the engine is waiting on (phase COMBAT) and continues to the next board decision. */
export type CombatResolver = (r: { state: GameState; events: GameEvent[] }) => {
  state: GameState;
  events: GameEvent[];
};

/** One fight as the board handed it over (stat distribution logs, docs/combat-ai-spec.md §10.3). */
export interface FightLog {
  readonly setup: CombatSetup;
  readonly round: number;
  readonly winner: 'a' | 'b';
  readonly ticks: number | null;
}

export interface CombatResolverOptions {
  /** Base seed for per-fight combat seeds (sim resolver). */
  readonly seed: number;
  /** Scripted bot for both fighters (sim resolver), default `scripted:balanced`. */
  readonly bot?: string;
  readonly outcomeModel?: OutcomeModel;
  /** Per-seat episode skill dispersion on the win logit (0 disables it). */
  readonly outcomeSkillNoise?: number;
  readonly onFight?: (fight: FightLog) => void;
}

/** Deterministic per-fight seed: same game seed and fight index -> same fight. */
function fightSeed(base: number, index: number): number {
  return (Math.imul(base ^ 0x2545f491, 0x9e3779b1) + Math.imul(index + 1, 0x85ebca6b)) >>> 0;
}

/**
 * 'dice' keeps the board's dice duel (resolveCombatWithDice, the old behaviour). 'sim' builds a real-time
 * setup from both players' board stats and plays it to the end with scripted bots (runCombat), then writes
 * the result back with applyCombatResult.
 */
export function createCombatResolver(
  name: CombatResolverName,
  opts: CombatResolverOptions,
): CombatResolver {
  let fights = 0;
  const bot = opts.bot ?? 'scripted:balanced';
  let skillRng = createRng(opts.seed);
  const uniform = () => {
    const [v, next] = nextFloat(skillRng);
    skillRng = next;
    return v;
  };
  const skills = Array.from({ length: 4 }, () => {
    const u = Math.max(1e-9, uniform());
    const v = uniform();
    return (opts.outcomeSkillNoise ?? 0) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  });
  if (name === 'outcome' && !opts.outcomeModel)
    throw new RangeError('outcome resolver needs an outcome_v1 model');
  return (r) => {
    let { state, events } = r;
    while (state.pending?.phase === 'COMBAT') {
      const setup = opts.onFight || name !== 'dice' ? boardCombatSetup(state) : null;
      const round = state.round;
      let settled: { state: GameState; events: GameEvent[] };
      let winner: 'a' | 'b';
      let ticks: number | null = null;
      if (name === 'outcome') {
        const model = opts.outcomeModel!;
        assertOutcomeCompatible(model, state.rules.version, DEFAULT_COMBAT_RULES.version);
        const req = state.combat!;
        const [result, rng] = sampleOutcomeResult(
          model,
          outcomeModelSetup(setup!),
          state.rng,
          skills[req.a]! - (req.b === null ? 0 : skills[req.b]!),
        );
        settled = applyCombatResult({ ...state, rng }, result);
        winner = result.winner;
      } else if (name === 'sim') {
        const seed = fightSeed(opts.seed, fights);
        const random = policyRandom(seed, 3);
        const out = runCombat(
          setup!,
          [createCombatBotByName(bot, random), createCombatBotByName(bot, random)],
          seed,
          DEFAULT_COMBAT_RULES,
          { decisionInterval: 1 },
        );
        settled = applyCombatResult(state, out.result);
        winner = out.result.winner;
        ticks = out.ticks;
      } else {
        settled = resolveCombatWithDice(state);
        const ended = settled.events.find((e) => e.type === 'CombatEnded');
        const req = state.combat!;
        winner = ended?.type === 'CombatEnded' && ended.winner === req.a ? 'a' : 'b';
      }
      if (setup && opts.onFight) opts.onFight({ setup, round, winner, ticks });
      fights += 1;
      state = settled.state;
      events = [...events, ...settled.events];
    }
    return { state, events };
  };
}
