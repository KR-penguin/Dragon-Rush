import {
  runCombat,
  policyRandom,
  DEFAULT_COMBAT_RULES,
  scaleDragonSetup,
  type CombatResult,
  type CombatSetup,
} from '@dragon-rush/combat';
import { createCombatBotByName } from '@dragon-rush/combat-ai';
import {
  emptyOutcomeModel,
  outcomeFeatures,
  predictOutcome,
  type OutcomeDamage,
  type OutcomeModel,
} from '@dragon-rush/ai';
import {
  createRng,
  nextFloat,
  type RngState,
  type RulesConfig,
  DEFAULT_RULES,
} from '@dragon-rush/engine';
import type { StatDist, FighterSample } from '../statDist';

export const outcomeDamage = (): OutcomeDamage => ({
  ...DEFAULT_COMBAT_RULES.damage,
  mageDefDivisor: DEFAULT_COMBAT_RULES.passives.mageDefDivisor,
});

export interface OutcomeRow {
  readonly setup: CombatSetup;
  readonly result: CombatResult;
  readonly ticks: number;
}

/** Model features use the effective boss stats; runCombat still receives the board setup and scales it itself. */
export function outcomeModelSetup(setup: CombatSetup): CombatSetup {
  return setup.kind === 'dragonFight' && setup.dragon
    ? { ...setup, dragon: scaleDragonSetup(setup.dragon) }
    : setup;
}

export interface GenerateOutcomeOptions {
  readonly seed: number;
  readonly count: number;
  readonly boardRules?: RulesConfig;
  readonly bot?: string;
}

/** Draws board-derived fights with the engine RNG, then runs the 60Hz sim to completion. */
export function generateOutcomeRows(dist: StatDist, opts: GenerateOutcomeOptions): OutcomeRow[] {
  const boardRules = opts.boardRules ?? DEFAULT_RULES;
  if (dist.rules_version !== boardRules.version)
    throw new RangeError('stat distribution rules version mismatch');
  if (
    !Number.isSafeInteger(opts.seed) ||
    opts.seed < 0 ||
    !Number.isInteger(opts.count) ||
    opts.count < 1
  )
    throw new RangeError('invalid seed or count');
  const pool = (kind: CombatSetup['kind']) => dist.fighters.filter((f) => f.kind === kind);
  const duel = pool('duel');
  const dragon = pool('dragonFight');
  const paired = dist.setups;
  if (!duel.length && !dragon.length) throw new RangeError('stat distribution has no fighters');
  const duelShare = duel.length / 2 / (duel.length / 2 + dragon.length);
  let rng = createRng(opts.seed);
  const random = () => {
    const [n, next] = nextFloat(rng);
    rng = next;
    return n;
  };
  const pick = (xs: readonly FighterSample[]) => xs[Math.floor(random() * xs.length)]!;
  const fighter = (f: FighterSample) => ({
    job: f.job,
    hp: f.hp,
    maxHp: f.maxHp,
    atk: f.atk,
    def: f.def,
    indomitableAvailable: f.indomitableAvailable,
  });
  const out: OutcomeRow[] = [];
  for (let i = 0; i < opts.count; i++) {
    const setup: CombatSetup = paired?.length
      ? paired[Math.floor(random() * paired.length)]!
      : (() => {
          const kind =
            duel.length && dragon.length
              ? random() < duelShare
                ? 'duel'
                : 'dragonFight'
              : duel.length
                ? 'duel'
                : 'dragonFight';
          const a = fighter(pick(kind === 'duel' ? duel : dragon));
          return kind === 'duel'
            ? { kind, a, b: fighter(pick(duel)) }
            : { kind, a, b: null, dragon: { ...boardRules.dragon } };
        })();
    const seed = Math.floor(random() * 0x1_0000_0000);
    const bot = opts.bot ?? 'scripted:balanced';
    const r = runCombat(
      setup,
      [
        createCombatBotByName(bot, policyRandom(seed, 3)),
        createCombatBotByName(bot, policyRandom(seed, 4)),
      ],
      seed,
      DEFAULT_COMBAT_RULES,
      { decisionInterval: 1 },
    );
    out.push({ setup, result: r.result, ticks: r.ticks });
  }
  return out;
}

function draw(rng: RngState): [number, RngState] {
  return nextFloat(rng);
}

/** Sample winner, conditional HP bin, integer HP inside that bin, then passive use, all from engine sfc32. */
export function sampleOutcomeResult(
  model: OutcomeModel,
  setup: CombatSetup,
  initial: RngState,
  winShift = 0,
): [CombatResult, RngState] {
  let rng = initial;
  const sample = () => {
    const [v, next] = draw(rng);
    rng = next;
    return v;
  };
  const base = predictOutcome(model, setup).winA;
  const shifted =
    1 / (1 + Math.exp(-(Math.log(Math.max(1e-9, base) / Math.max(1e-9, 1 - base)) + winShift)));
  const winner = sample() < shifted ? 'a' : 'b';
  const prediction = predictOutcome(model, setup, winner);
  const maxHp = winner === 'a' ? setup.a.maxHp : setup.kind === 'duel' ? setup.b!.maxHp : 0;
  let hp = 0;
  if (maxHp > 0) {
    const eligible = prediction.hpBins.map((p, bin) => {
      const lo = Math.floor((bin * maxHp) / 10) + 1;
      const hi = Math.floor(((bin + 1) * maxHp) / 10);
      return lo <= hi ? p : 0;
    });
    const total = eligible.reduce((a, b) => a + b, 0);
    if (total === 0) {
      for (let i = 0; i < eligible.length; i++) {
        if (Math.floor((i * maxHp) / 10) + 1 <= Math.floor(((i + 1) * maxHp) / 10)) eligible[i] = 1;
      }
    }
    let t = sample() * eligible.reduce((a, b) => a + b, 0);
    let bin = eligible.findIndex((v) => (t -= v) < 0);
    if (bin < 0) bin = eligible.reduce((last, v, i) => (v > 0 ? i : last), 0);
    const lo = Math.floor((bin * maxHp) / 10) + 1;
    const hi = Math.floor(((bin + 1) * maxHp) / 10);
    hp = lo + Math.floor(sample() * (hi - lo + 1));
  }
  const usedA = setup.a.indomitableAvailable && sample() < prediction.indomitableUsedA;
  const usedB = setup.b?.indomitableAvailable === true && sample() < prediction.indomitableUsedB;
  return [
    {
      winner,
      hpA: winner === 'a' ? hp : 0,
      hpB: setup.kind === 'duel' ? (winner === 'b' ? hp : 0) : null,
      indomitableUsedA: usedA,
      indomitableUsedB: usedB,
    },
    rng,
  ];
}

const sigmoid = (v: number) => (v >= 0 ? 1 / (1 + Math.exp(-v)) : Math.exp(v) / (1 + Math.exp(v)));
const dot = (w: readonly number[], x: readonly number[]) =>
  w.reduce((sum, v, i) => sum + v * x[i]!, 0);
const hpBin = (hp: number, maxHp: number) =>
  Math.min(9, Math.max(0, Math.ceil((hp * 10) / maxHp) - 1));

export interface FitOutcomeOptions {
  readonly seed: number;
  readonly epochs: number;
  readonly id: string;
  readonly rulesVersion: string;
  readonly combatRulesVersion: string;
  readonly learningRate?: number;
  readonly statDistGames?: number;
  readonly bot?: string;
}

/** Reproducible multihead fit with separate training, calibration, and untouched holdout rows. */
export function fitOutcomeModel(
  rows: readonly OutcomeRow[],
  opts: FitOutcomeOptions,
): { model: OutcomeModel; holdout: OutcomeRow[] } {
  if (rows.length < 2 || !Number.isInteger(opts.epochs) || opts.epochs < 1)
    throw new RangeError('need rows and epochs');
  const model = emptyOutcomeModel(
    opts.id,
    opts.rulesVersion,
    opts.combatRulesVersion,
    outcomeDamage(),
  );
  const order = rows.map((_, i) => i);
  let rng = createRng(opts.seed);
  const random = () => {
    const [v, next] = nextFloat(rng);
    rng = next;
    return v;
  };
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const held = Math.max(1, Math.floor(rows.length * 0.2));
  const calibrated = Math.max(1, Math.floor(rows.length * 0.2));
  const holdout = order.slice(0, held).map((i) => rows[i]!);
  const calibrationRows = order.slice(held, held + calibrated).map((i) => rows[i]!);
  const train = order.slice(held + calibrated).map((i) => rows[i]!);
  const lr = opts.learningRate ?? 0.02;
  for (let epoch = 0; epoch < opts.epochs; epoch++) {
    for (const row of train) {
      const x = outcomeFeatures(outcomeModelSetup(row.setup), model.damage);
      const target = Number(row.result.winner === 'a');
      const error = target - sigmoid(dot(model.win, x));
      for (let j = 0; j < x.length; j++) model.win[j]! += lr * error * x[j]!;
      const z = [...x, target ? 1 : -1];
      const hp = row.result.winner === 'a' ? row.result.hpA : row.result.hpB;
      const maxHp = row.result.winner === 'a' ? row.setup.a.maxHp : row.setup.b?.maxHp;
      if (hp !== null && hp !== undefined && maxHp && hp > 0) {
        const logits = model.hp.map((w) => dot(w, z));
        const max = Math.max(...logits);
        const exps = logits.map((v) => Math.exp(v - max));
        const sum = exps.reduce((a, b) => a + b, 0);
        const bin = hpBin(hp, maxHp);
        for (let k = 0; k < 10; k++) {
          const e = Number(k === bin) - exps[k]! / sum;
          for (let j = 0; j < z.length; j++) model.hp[k]![j]! += lr * e * z[j]!;
        }
      }
      const updateStand = (w: number[], available: boolean, used: boolean) => {
        if (!available) return;
        const e = Number(used) - sigmoid(dot(w, z));
        for (let j = 0; j < z.length; j++) w[j]! += lr * e * z[j]!;
      };
      updateStand(
        model.indomitable_a,
        row.setup.a.indomitableAvailable,
        row.result.indomitableUsedA === true,
      );
      updateStand(
        model.indomitable_b,
        row.setup.b?.indomitableAvailable === true,
        row.result.indomitableUsedB === true,
      );
    }
  }
  const scored = calibrationRows
    .map((row) => ({
      raw: sigmoid(dot(model.win, outcomeFeatures(outcomeModelSetup(row.setup), model.damage))),
      won: Number(row.result.winner === 'a'),
    }))
    .sort((a, b) => a.raw - b.raw);
  const bins = Math.min(20, Math.max(2, Math.floor(scored.length / 100)));
  const blocks: { raw: number; observed: number; count: number }[] = [];
  for (let bin = 0; bin < bins; bin++) {
    const slice = scored.slice(
      Math.floor((bin * scored.length) / bins),
      Math.floor(((bin + 1) * scored.length) / bins),
    );
    if (!slice.length) continue;
    blocks.push({
      raw: slice.reduce((a, b) => a + b.raw, 0) / slice.length,
      observed: slice.reduce((a, b) => a + b.won, 0) / slice.length,
      count: slice.length,
    });
    while (
      blocks.length > 1 &&
      blocks[blocks.length - 2]!.observed > blocks[blocks.length - 1]!.observed
    ) {
      const right = blocks.pop()!;
      const left = blocks.pop()!;
      const count = left.count + right.count;
      blocks.push({
        raw: (left.raw * left.count + right.raw * right.count) / count,
        observed: (left.observed * left.count + right.observed * right.count) / count,
        count,
      });
    }
  }
  const points = blocks
    .filter((p, i) => i === 0 || p.raw > blocks[i - 1]!.raw)
    .map(({ raw, observed }) => ({ raw, observed }));
  model.calibration =
    points.length >= 2
      ? points
      : [
          { raw: 0, observed: points[0]?.observed ?? 0.5 },
          { raw: 1, observed: points[0]?.observed ?? 0.5 },
        ];
  model.training = {
    seed: opts.seed,
    samples: train.length,
    calibration_samples: calibrationRows.length,
    holdout_samples: holdout.length,
    ...(opts.statDistGames !== undefined ? { stat_dist_games: opts.statDistGames } : {}),
    ...(opts.bot ? { bot: opts.bot } : {}),
  };
  return { model, holdout };
}

export interface CalibrationBin {
  readonly count: number;
  readonly predicted: number | null;
  readonly observed: number | null;
  readonly error: number | null;
}
export interface CalibrationReport {
  readonly count: number;
  readonly brier: number;
  readonly deciles: readonly CalibrationBin[];
  readonly maxError: number | null;
  readonly passes: boolean;
}

export function outcomeCalibration(
  model: OutcomeModel,
  rows: readonly OutcomeRow[],
): CalibrationReport {
  const bins = Array.from({ length: 10 }, () => ({ count: 0, predicted: 0, observed: 0 }));
  let brier = 0;
  const scored = rows
    .map((row) => ({
      p: predictOutcome(model, outcomeModelSetup(row.setup)).winA,
      y: Number(row.result.winner === 'a'),
    }))
    .sort((a, b) => a.p - b.p);
  for (let i = 0; i < scored.length; i++) {
    const { p, y } = scored[i]!;
    brier += (p - y) ** 2;
    const bin = bins[Math.min(9, Math.floor((i * 10) / scored.length))]!;
    bin.count++;
    bin.predicted += p;
    bin.observed += y;
  }
  const deciles = bins.map(({ count, predicted, observed }) => ({
    count,
    predicted: count ? predicted / count : null,
    observed: count ? observed / count : null,
    error: count ? Math.abs(predicted - observed) / count : null,
  }));
  const errors = deciles.map((b) => b.error).filter((v): v is number => v !== null);
  return {
    count: rows.length,
    brier: rows.length ? brier / rows.length : 0,
    deciles,
    maxError: errors.length ? Math.max(...errors) : null,
    passes: deciles.every((b) => b.count > 0 && b.error !== null && b.error <= 0.03),
  };
}
