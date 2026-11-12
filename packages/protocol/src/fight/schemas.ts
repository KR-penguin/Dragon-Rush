import { z } from 'zod';
import {
  hashCombatRules,
  validateCombatSetup,
  type CombatRules,
  type CombatSetup,
} from '@dragon-rush/combat';

const fightId = z.number().int().min(0).max(0xffffffff);

export const FightReadySchema = z
  .object({
    fightId,
    inputDelay: z.number().int().min(0).max(8),
    rttMs: z.number().min(0).max(60_000),
    jitterMs: z.number().min(0).max(60_000),
  })
  .strict();

export const FightAwaySchema = z
  .object({ fightId, reason: z.enum(['hidden', 'mismatch', 'left']).optional() })
  .strict();

export const FightBackSchema = z.object({ fightId }).strict();

export const FightRequestSyncSchema = z
  .object({
    fightId,
    reason: z.enum(['join', 'gap', 'desync', 'stall', 'backlog', 'overflow']),
    tick: z.number().int().optional(),
    clientHash: z.number().int().min(0).max(0xffffffff).optional(),
  })
  .strict();

/** Untrusted client telemetry, logged only. */
export const FightStatsSchema = z
  .object({
    fightId,
    depthHist: z.array(z.number().int().min(0)).max(64),
    rollbacks: z.number().int().min(0),
    resimTicks: z.number().int().min(0),
    freezes: z.number().int().min(0),
    snaps: z.number().int().min(0),
    phantomKos: z.number().int().min(0),
    rebinds: z.number().int().min(0),
    desyncs: z.number().int().min(0),
  })
  .strict();

const u32 = z.number().int().min(0).max(0xffffffff);
const tick = z.number().int().min(0);
const controller = z.enum(['human', 'bot']);
const setup = z.custom<CombatSetup>((value) => {
  try {
    validateCombatSetup(value as CombatSetup);
    return true;
  } catch {
    return false;
  }
});
const rules = z.custom<CombatRules>((value) => {
  try {
    return Number.isInteger(hashCombatRules(value as CombatRules));
  } catch {
    return false;
  }
});
const outcome = z
  .object({
    winner: z.enum(['a', 'b']),
    hpA: tick,
    hpB: tick.nullable(),
    indomitableUsedA: z.boolean().optional(),
    indomitableUsedB: z.boolean().optional(),
    timedOut: z.boolean().optional(),
  })
  .strict();

export const FightStartSchema = z
  .object({
    fightId,
    kind: z.enum(['duel', 'dragonFight']),
    seed: u32,
    setup,
    rules,
    rulesHash: u32,
    packVersion: tick,
    combatBuildId: z.string().min(1).max(100),
    seats: z
      .array(
        z
          .object({
            engineSeat: tick.nullable(),
            playerId: z.string().nullable(),
            name: z.string(),
            controller,
          })
          .strict(),
      )
      .min(1)
      .max(2),
    you: z.discriminatedUnion('role', [
      z
        .object({ role: z.literal('fighter'), seat: z.union([z.literal(0), z.literal(1)]) })
        .strict(),
      z.object({ role: z.literal('spectator') }).strict(),
    ]),
    prerollTicks: tick,
    maxTicks: tick,
    pveHoldTicks: tick,
    pvpHoldTicks: tick,
  })
  .strict()
  .refine((msg) => msg.kind === msg.setup.kind, { message: 'combat kind differs from setup' });
export const FightGoSchema = z.object({ fightId, epochServerMs: z.number().finite() }).strict();
export const FightControlSchema = z
  .object({ fightId, seat: z.union([z.literal(0), z.literal(1)]), controller, fromTick: tick })
  .strict();
export const FightRetimeSchema = z
  .object({ fightId, epochServerMs: z.number().finite(), atTick: tick })
  .strict();
export const FightEndSchema = z
  .object({ fightId, endTick: tick, outcome, finalHash: u32, aborted: z.boolean().optional() })
  .strict();
export const FightSyncSchema = z
  .object({
    fightId,
    reason: z.enum(['join', 'gap', 'desync', 'stall', 'backlog', 'overflow', 'degraded']),
    tick,
    state: z.array(z.number().int()).min(1).max(20000),
    hash: u32,
    seats: z
      .array(
        z
          .object({
            lastRealTick: tick,
            lastRealMask: z.number().int().min(0).max(127),
            substRun: tick,
            controller,
          })
          .strict(),
      )
      .min(1)
      .max(2),
    controls: z.array(FightControlSchema).max(100),
    pending: z
      .array(
        z
          .object({
            seat: z.union([z.literal(0), z.literal(1)]),
            firstTick: tick,
            masks: z.array(z.number().int().min(0).max(127)).min(1).max(16),
          })
          .strict(),
      )
      .max(64),
  })
  .strict();
export const FightReplaySchema = z
  .object({
    fightId,
    seed: u32,
    setup,
    rules,
    inputs: z.array(z.number().int().min(0).max(65535)).max(20000),
    endTick: tick,
    outcome,
    finalHash: u32,
  })
  .strict();

export type FightReady = z.infer<typeof FightReadySchema>;
export type FightAway = z.infer<typeof FightAwaySchema>;
export type FightBack = z.infer<typeof FightBackSchema>;
export type FightRequestSync = z.infer<typeof FightRequestSyncSchema>;
export type FightStats = z.infer<typeof FightStatsSchema>;
