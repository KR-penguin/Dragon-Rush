import { DEFAULT_RULES, JOB_IDS } from '@dragon-rush/engine';
import { z } from 'zod';
import type { GameRecord } from './runner';

export const STAT_DIST_VERSION = 'stat_dist_v1';

const FighterSampleSchema = z
  .object({
    kind: z.enum(['duel', 'dragonFight']),
    job: z.enum(JOB_IDS),
    hp: z.number().int().min(1),
    maxHp: z.number().int().min(1),
    atk: z.number().int().min(0),
    def: z.number().int().min(0),
    indomitableAvailable: z.boolean(),
  })
  .refine((f) => f.hp <= f.maxHp, 'hp must be <= maxHp');

/** Fighter stats at the moment the board handed a fight over (`pnpm sim --log-fights <file>`). */
export const StatDistSchema = z.object({
  version: z.literal(STAT_DIST_VERSION),
  rules_version: z.string(),
  resolver: z.string().optional(),
  games: z.number().int().min(0).optional(),
  fighters: z.array(FighterSampleSchema).min(1),
});

export type StatDist = z.infer<typeof StatDistSchema>;
export type FighterSample = StatDist['fighters'][number];

export function statDistFromRecords(records: readonly GameRecord[], resolver: string): StatDist {
  const fighters: FighterSample[] = [];
  for (const r of records) {
    for (const f of r.fights ?? []) {
      fighters.push({ kind: f.setup.kind, ...f.setup.a });
      if (f.setup.b) fighters.push({ kind: f.setup.kind, ...f.setup.b });
    }
  }
  return {
    version: STAT_DIST_VERSION,
    rules_version: DEFAULT_RULES.version,
    resolver,
    games: records.length,
    fighters,
  };
}
