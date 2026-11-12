import { JOB_IDS } from '@dragon-rush/engine';
import { BOT_NAMES } from '@dragon-rush/ai';
import { z } from 'zod';
import { COMBAT_RESOLVERS } from '../combatResolver';

const seatList = z.array(z.number().int().min(0).max(3));
const botName = z.enum(BOT_NAMES);

export const EnvConfigSchema = z
  .object({
    mode: z.enum(['single', 'selfplay']).default('single'),
    num_players: z
      .union([z.number().int().min(2).max(4), z.array(z.number().int().min(2).max(4)).min(1)])
      .default(4),
    agent_seat: z.union([z.number().int().min(0).max(3), z.literal('random')]).default('random'),
    controlled_seats: z.union([seatList, z.literal('all')]).default('all'),
    jobs: z.union([z.literal('random'), z.array(z.enum(JOB_IDS)).min(2).max(4)]).default('random'),
    opponents: z.union([botName, z.array(botName).min(1)]).default('heuristic'),
    max_rounds: z.number().int().min(1).nullable().default(100),
    rules: z.union([z.literal('default'), z.record(z.string(), z.unknown())]).default('default'),
    reward_shaping: z
      .object({
        coins: z.number().default(0),
        stats: z.number().default(0),
        kill: z.number().default(0),
        dragon_try: z.number().default(0),
      })
      .strict()
      .nullable()
      .default(null),
    return_events: z.boolean().default(false),
    /** How fights are settled; the shipped outcome_v1 model is the default. */
    combat_resolver: z.enum(COMBAT_RESOLVERS).default('outcome'),
    outcome_model: z.string().min(1).optional(),
    outcome_skill_noise: z.number().finite().min(0).max(2).default(0.5),
  })
  .strict();

export type EnvConfig = z.infer<typeof EnvConfigSchema>;

export const ResetParamsSchema = z
  .object({
    num_envs: z.number().int().min(1).max(4096).default(1),
    seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    encoding: z.enum(['b64', 'json']).default('b64'),
    auto_reset: z.boolean().default(true),
    expect: z
      .object({
        obs_version: z.string().optional(),
        act_version: z.string().optional(),
        combat_resolver: z.string().optional(),
        outcome_model_id: z.string().optional(),
      })
      .optional(),
    config: EnvConfigSchema.default(EnvConfigSchema.parse({})),
  })
  .strict();

export type ResetParams = z.infer<typeof ResetParamsSchema>;

export const StepParamsSchema = z.object({ actions: z.array(z.number().int()) }).strict();

export const RequestSchema = z.object({
  id: z.number().int(),
  cmd: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const DEFAULT_JOBS_POOL = JOB_IDS;
