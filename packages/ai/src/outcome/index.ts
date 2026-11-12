import { JOB_IDS, type JobId } from '@dragon-rush/engine';
import { z } from 'zod';

export const OUTCOME_VERSION = 'outcome_v1';
export const OUTCOME_FEATURE_DIM = 56;
export const OUTCOME_CONDITIONAL_DIM = OUTCOME_FEATURE_DIM + 1;
const finite = z.number().finite();
const weights = (n: number) => z.array(finite.min(-1000).max(1000)).length(n);

export const OutcomeDamageSchema = z
  .object({
    sNum: finite.positive(),
    sDen: finite.positive(),
    k: finite.positive(),
    min: finite.positive(),
    dragonDamageTakenScale: finite.positive(),
    mageDefDivisor: finite.positive(),
  })
  .strict();
export type OutcomeDamage = z.infer<typeof OutcomeDamageSchema>;

const CalibrationSchema = z
  .array(z.object({ raw: finite.min(0).max(1), observed: finite.min(0).max(1) }).strict())
  .min(2)
  .max(64)
  .refine(
    (points) => points.every((p, i) => i === 0 || p.raw > points[i - 1]!.raw),
    'calibration knots must increase',
  );

export interface OutcomeFighter {
  readonly job: JobId;
  readonly hp: number;
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly indomitableAvailable: boolean;
}
export interface OutcomeSetup {
  readonly kind: 'duel' | 'dragonFight';
  readonly a: OutcomeFighter;
  readonly b: OutcomeFighter | null;
  readonly dragon?: { readonly hp: number; readonly atk: number; readonly def: number };
}

export const OutcomeModelSchema = z
  .object({
    version: z.literal(OUTCOME_VERSION),
    id: z.string().min(1),
    rules_version: z.string().min(1),
    combat_rules_version: z.string().min(1),
    damage: OutcomeDamageSchema,
    training: z
      .object({
        seed: z.number().int().nonnegative(),
        samples: z.number().int().nonnegative(),
        calibration_samples: z.number().int().nonnegative().optional(),
      })
      .strict(),
    calibration: CalibrationSchema.optional(),
    win: weights(OUTCOME_FEATURE_DIM),
    hp: z.array(weights(OUTCOME_CONDITIONAL_DIM)).length(10),
    indomitable_a: weights(OUTCOME_CONDITIONAL_DIM),
    indomitable_b: weights(OUTCOME_CONDITIONAL_DIM),
  })
  .strict();

export type OutcomeModel = z.infer<typeof OutcomeModelSchema>;

export function parseOutcomeModel(raw: unknown): OutcomeModel {
  return OutcomeModelSchema.parse(raw);
}

export function emptyOutcomeModel(
  id: string,
  rulesVersion: string,
  combatRulesVersion: string,
  damage: OutcomeDamage,
): OutcomeModel {
  return parseOutcomeModel({
    version: OUTCOME_VERSION,
    id,
    rules_version: rulesVersion,
    combat_rules_version: combatRulesVersion,
    damage,
    training: { seed: 0, samples: 0 },
    win: Array(OUTCOME_FEATURE_DIM).fill(0),
    hp: Array.from({ length: 10 }, () => Array(OUTCOME_CONDITIONAL_DIM).fill(0)),
    indomitable_a: Array(OUTCOME_CONDITIONAL_DIM).fill(0),
    indomitable_b: Array(OUTCOME_CONDITIONAL_DIM).fill(0),
  });
}

export function assertOutcomeCompatible(
  model: OutcomeModel,
  rulesVersion: string,
  combatRulesVersion: string,
): void {
  if (model.rules_version !== rulesVersion || model.combat_rules_version !== combatRulesVersion) {
    throw new RangeError(
      `outcome model ${model.id} needs ${model.rules_version}/${model.combat_rules_version}, got ${rulesVersion}/${combatRulesVersion}`,
    );
  }
}

function jobBits(job: JobId | 'dragon'): number[] {
  return [...JOB_IDS, 'dragon'].map((j) => (j === job ? 1 : 0));
}

function matchupBits(a: JobId, b: JobId | 'dragon'): number[] {
  return JOB_IDS.flatMap((left) =>
    [...JOB_IDS, 'dragon'].map((right) => Number(a === left && b === right)),
  );
}

function hitsToKill(
  attacker: { job: JobId | 'dragon'; atk: number },
  target: { job: JobId | 'dragon'; hp: number; def: number },
  damage: OutcomeDamage,
): number {
  const def = attacker.job === 'mage' ? target.def / damage.mageDefDivisor : target.def;
  const hit = Math.max(
    damage.min,
    Math.floor(((damage.sNum / damage.sDen) * attacker.atk * damage.k) / (damage.k + def) + 0.5),
  );
  const scale = target.job === 'dragon' ? damage.dragonDamageTakenScale : 1;
  return Math.log1p(target.hp / Math.max(0.01, hit * scale)) / 5;
}

/** Frozen feature order: bias, mode, A/B jobs, A/B HP/maxHP/ATK/DEF, A/B Last Stand, A/B log hits to kill, 5×6 matchup. */
export function outcomeFeatures(setup: OutcomeSetup, damage: OutcomeDamage): number[] {
  const a = setup.a;
  const b =
    setup.kind === 'duel'
      ? setup.b!
      : {
          job: 'dragon' as const,
          hp: setup.dragon!.hp,
          maxHp: setup.dragon!.hp,
          atk: setup.dragon!.atk,
          def: setup.dragon!.def,
          indomitableAvailable: false,
        };
  const stats = (f: { hp: number; maxHp: number; atk: number; def: number }) => [
    f.hp / 40,
    f.maxHp / 40,
    f.atk / 15,
    f.def / 15,
  ];
  const x = [
    1,
    setup.kind === 'dragonFight' ? 1 : 0,
    ...jobBits(a.job),
    ...jobBits(b.job),
    ...stats(a),
    ...stats(b),
    Number(a.indomitableAvailable),
    Number(b.indomitableAvailable),
    hitsToKill(a, b, damage),
    hitsToKill(b, a, damage),
    ...matchupBits(a.job, b.job),
  ];
  if (x.length !== OUTCOME_FEATURE_DIM) throw new Error('outcome feature layout drift');
  return x;
}

const dot = (w: readonly number[], x: readonly number[]) =>
  w.reduce((sum, v, i) => sum + v * x[i]!, 0);
const sigmoid = (v: number) => (v >= 0 ? 1 / (1 + Math.exp(-v)) : Math.exp(v) / (1 + Math.exp(v)));

function calibratedWin(raw: number, model: OutcomeModel): number {
  const points = model.calibration;
  if (!points) return raw;
  if (raw <= points[0]!.raw) return points[0]!.observed;
  for (let i = 1; i < points.length; i++) {
    const right = points[i]!;
    if (raw > right.raw) continue;
    const left = points[i - 1]!;
    const t = (raw - left.raw) / (right.raw - left.raw);
    return left.observed + t * (right.observed - left.observed);
  }
  return points[points.length - 1]!.observed;
}

export interface OutcomePrediction {
  readonly winA: number;
  readonly hpBins: readonly number[];
  readonly indomitableUsedA: number;
  readonly indomitableUsedB: number;
}

/** Winner-conditioned HP and passive heads; choose `winner` after sampling winA. */
export function predictOutcome(
  model: OutcomeModel,
  setup: OutcomeSetup,
  winner: 'a' | 'b' = 'a',
): OutcomePrediction {
  const x = outcomeFeatures(setup, model.damage);
  const conditional = [...x, winner === 'a' ? 1 : -1];
  const logits = model.hp.map((w) => dot(w, conditional));
  const max = Math.max(...logits);
  const exp = logits.map((v) => Math.exp(v - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return {
    winA: calibratedWin(sigmoid(dot(model.win, x)), model),
    hpBins: exp.map((v) => v / sum),
    indomitableUsedA: setup.a.indomitableAvailable
      ? sigmoid(dot(model.indomitable_a, conditional))
      : 0,
    indomitableUsedB: setup.b?.indomitableAvailable
      ? sigmoid(dot(model.indomitable_b, conditional))
      : 0,
  };
}
