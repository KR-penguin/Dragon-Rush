import { JOB_IDS } from '@dragon-rush/engine';
import { z } from 'zod';

const int = z.number().int();
const range = z
  .tuple([z.number(), z.number()])
  .refine(([lo, hi]) => lo <= hi, 'range must be [lo, hi] with lo <= hi');

export const CombatEnvConfigSchema = z
  .object({
    /** 'both' = both fighters are external (self-play), 'p0' = only slot 0 (fighter a). */
    controlled: z.enum(['both', 'p0']).default('both'),
    /** Opponent of slot 0 when controlled = 'p0': `scripted:<name>`; 'external' only goes with 'both'. */
    opponent: z.string().default('scripted:pool'),
    mode_mix: z
      .object({ pvp: z.number().min(0), dragon: z.number().min(0) })
      .strict()
      .refine((m) => m.pvp + m.dragon > 0, 'mode_mix needs a positive weight')
      .default({ pvp: 0.75, dragon: 0.25 }),
    /** 'uniform' or a per-slot list (job id or 'uniform'); same-job duels are allowed. */
    jobs: z
      .union([
        z.literal('uniform'),
        z
          .array(z.union([z.enum(JOB_IDS), z.literal('uniform')]))
          .min(1)
          .max(2),
      ])
      .default('uniform'),
    /** 'uniform_board' | 'start' | 'file:<path>' (stat_dist_v1 JSON from `pnpm sim --log-fights`). */
    stat_sampler: z.string().default('uniform_board'),
    action_repeat: int.min(1).max(60).default(4),
    obs_delay: z
      .union([int.min(0).max(120), z.tuple([int.min(0).max(120), int.min(0).max(120)])])
      .default([4, 18]),
    flat_actions: z.boolean().default(false),
    reward: z
      .object({
        k_start: z.number().default(0.5),
        k_end: z.number().default(0.1),
        anneal_decisions: int.min(0).default(0),
        approach: z.number().default(0),
      })
      .strict()
      .default({ k_start: 0.5, k_end: 0.1, anneal_decisions: 0, approach: 0 }),
    dragon_curriculum: z
      .object({ hp_scale: range.default([1, 1]), telegraph_scale: range.default([1, 1]) })
      .strict()
      .nullable()
      .default(null),
    mirror: z.boolean().default(true),
    /** 'default' or a partial DEFAULT_COMBAT_RULES override (deep merge, same types only). */
    rules: z.union([z.literal('default'), z.record(z.string(), z.unknown())]).default('default'),
    return_events: z.boolean().default(false),
  })
  .strict();

export type CombatEnvConfig = z.infer<typeof CombatEnvConfigSchema>;

export const CombatResetParamsSchema = z
  .object({
    num_envs: int.min(1).max(4096).default(1),
    seed: int.min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    encoding: z.enum(['b64', 'json']).default('b64'),
    auto_reset: z.boolean().default(true),
    expect: z
      .object({
        cobs_version: z.string().optional(),
        cact_version: z.string().optional(),
        combat_rules_version: z.string().optional(),
      })
      .strict()
      .optional(),
    config: CombatEnvConfigSchema.default(CombatEnvConfigSchema.parse({})),
  })
  .strict();

export type CombatResetParams = z.infer<typeof CombatResetParamsSchema>;

/** Per env: n_ctrl entries, each [move, button] (multi) or a flat index (flat_actions). */
export const CombatStepParamsSchema = z
  .object({ actions: z.array(z.array(z.union([int, z.tuple([int, int])]))) })
  .strict();

export const CombatRequestSchema = z.object({
  id: int,
  cmd: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});
