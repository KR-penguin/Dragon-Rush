import { readFileSync } from 'node:fs';
import {
  DEFAULT_COMBAT_RULES,
  type CombatRules,
  type CombatSetup,
  type FighterSetup,
} from '@dragon-rush/combat';
import { NO_MIRROR, type Mirror } from '@dragon-rush/combat-ai';
import { DEFAULT_RULES, JOB_IDS, type JobId } from '@dragon-rush/engine';
import { StatDistSchema, type FighterSample } from '../statDist';
import type { CombatEnvConfig } from './config';
import { CombatRulesSchema } from './rulesSchema';

export class CombatEnvError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type CombatMode = 'pvp' | 'dragon';
type Kind = CombatSetup['kind'];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Deep merge of an override onto the defaults; every key must exist and keep its type. */
function mergeStrict(base: unknown, over: unknown, path: string): unknown {
  if (isPlainObject(base)) {
    if (!isPlainObject(over))
      throw new CombatEnvError('BAD_CONFIG', `rules${path} must be an object`);
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(over)) {
      if (!(k in base)) throw new CombatEnvError('BAD_CONFIG', `unknown rules key ${path}.${k}`);
      out[k] = mergeStrict(base[k], v, `${path}.${k}`);
    }
    return out;
  }
  if (Array.isArray(base)) {
    if (!Array.isArray(over) || over.length !== base.length)
      throw new CombatEnvError('BAD_CONFIG', `rules${path} must be an array of ${base.length}`);
    return base.map((b, i) => mergeStrict(b, over[i], `${path}[${i}]`));
  }
  if (base === null) {
    if (over !== null && typeof over !== 'string')
      throw new CombatEnvError('BAD_CONFIG', `rules${path} has the wrong type`);
    return over;
  }
  if (typeof over !== typeof base || (typeof over === 'number' && !Number.isFinite(over))) {
    throw new CombatEnvError('BAD_CONFIG', `rules${path} must be a ${typeof base}`);
  }
  return over;
}

export function buildCombatRules(config: CombatEnvConfig): CombatRules {
  if (config.rules === 'default') return DEFAULT_COMBAT_RULES;
  const parsed = CombatRulesSchema.safeParse(mergeStrict(DEFAULT_COMBAT_RULES, config.rules, ''));
  if (!parsed.success) throw new CombatEnvError('BAD_CONFIG', parsed.error.message);
  return parsed.data;
}

/** Scales every dragon telegraph (curriculum); lock-on times keep their length so aiming stays fair. */
export function scaleTelegraphs(rules: CombatRules, scale: number): CombatRules {
  if (scale === 1) return rules;
  const t = (x: number, min = 1) => Math.max(min, Math.round(x * scale));
  const D = rules.dragon;
  return {
    ...rules,
    dragon: {
      ...D,
      claw: { ...D.claw, telegraph: t(D.claw.telegraph) },
      tail: { ...D.tail, telegraph: t(D.tail.telegraph) },
      volley: { ...D.volley, arm: t(D.volley.arm) },
      charge: { ...D.charge, telegraph: t(D.charge.telegraph, D.charge.lockBefore + 1) },
      gust: { ...D.gust, telegraph: t(D.gust.telegraph) },
      breath: {
        ...D.breath,
        telegraph: [t(D.breath.telegraph[0]), t(D.breath.telegraph[1]), t(D.breath.telegraph[2])],
      },
      dive: { ...D.dive, airborne: t(D.dive.airborne, D.dive.lockBefore + 1) },
    },
  };
}

/**
 * `uniform_board`: board-sized stats derived from rush-1. Base stats come from DEFAULT_RULES.jobs and each
 * level adds DEFAULT_RULES.upgrades[stat].amount; the level and HP ranges cover the p5..p95 of fighters
 * logged from 3000 four-player heuristic games (`pnpm sim --log-fights`), wider for duels than for dragon
 * challengers (who arrive upgraded and healthy).
 */
export const UNIFORM_BOARD: Readonly<
  Record<
    Kind,
    {
      atk: [number, number];
      def: [number, number];
      maxHp: [number, number];
      hpFrac: [number, number];
    }
  >
> = {
  duel: { atk: [0, 6], def: [0, 6], maxHp: [0, 5], hpFrac: [0.35, 1] },
  dragonFight: { atk: [3, 9], def: [3, 9], maxHp: [2, 7], hpFrac: [0.6, 1] },
};
/** Chance that a sampled swordsman still has Last Stand (about 0.98 in logged games; lower for robustness). */
export const LAST_STAND_AVAILABLE = 0.9;

export type StatSampler =
  | { readonly kind: 'uniform_board' }
  | { readonly kind: 'start' }
  | {
      readonly kind: 'file';
      readonly path: string;
      readonly pools: ReadonlyMap<string, readonly FighterSample[]>;
    };

export function parseStatSampler(spec: string, cwd: string = process.cwd()): StatSampler {
  if (spec === 'uniform_board') return { kind: 'uniform_board' };
  if (spec === 'start') return { kind: 'start' };
  if (spec.startsWith('file:')) {
    const path = spec.slice('file:'.length);
    let raw: unknown;
    try {
      raw = JSON.parse(
        readFileSync(
          path.startsWith('/') || /^[A-Za-z]:/.test(path) ? path : `${cwd}/${path}`,
          'utf8',
        ),
      ) as unknown;
    } catch (e) {
      throw new CombatEnvError('BAD_CONFIG', `stat_sampler ${spec}: ${(e as Error).message}`);
    }
    const parsed = StatDistSchema.safeParse(raw);
    if (!parsed.success)
      throw new CombatEnvError('BAD_CONFIG', `stat_sampler ${spec}: ${parsed.error.message}`);
    const pools = new Map<string, FighterSample[]>();
    for (const fighter of parsed.data.fighters) {
      for (const key of [fighter.job, `${fighter.job}:${fighter.kind}`]) {
        const pool = pools.get(key);
        if (pool) pool.push(fighter);
        else pools.set(key, [fighter]);
      }
    }
    return { kind: 'file', path, pools };
  }
  throw new CombatEnvError(
    'BAD_CONFIG',
    `stat_sampler must be uniform_board | start | file:<path>, got ${spec}`,
  );
}

const randInt = (random: () => number, lo: number, hi: number) =>
  lo + Math.floor(random() * (hi - lo + 1));

function startFighter(job: JobId): FighterSetup {
  const j = DEFAULT_RULES.jobs[job];
  return { job, hp: j.hp, maxHp: j.hp, atk: j.atk, def: j.def, indomitableAvailable: true };
}

/** Samples one fighter of `job` for a fight of `kind`. Draw order is fixed (determinism). */
export function sampleFighter(
  sampler: StatSampler,
  job: JobId,
  kind: Kind,
  random: () => number,
): FighterSetup {
  switch (sampler.kind) {
    case 'start':
      return startFighter(job);
    case 'uniform_board': {
      const r = UNIFORM_BOARD[kind];
      const base = DEFAULT_RULES.jobs[job];
      const up = DEFAULT_RULES.upgrades;
      const atk = base.atk + randInt(random, r.atk[0], r.atk[1]) * up.atk.amount;
      const def = base.def + randInt(random, r.def[0], r.def[1]) * up.def.amount;
      const maxHp = base.hp + randInt(random, r.maxHp[0], r.maxHp[1]) * up.maxHp.amount;
      const frac = r.hpFrac[0] + random() * (r.hpFrac[1] - r.hpFrac[0]);
      const hp = Math.min(maxHp, Math.max(1, Math.round(frac * maxHp)));
      const lastStand = random() < LAST_STAND_AVAILABLE;
      return { job, hp, maxHp, atk, def, indomitableAvailable: lastStand };
    }
    case 'file': {
      const any = sampler.pools.get(`${job}:${kind}`) ?? sampler.pools.get(job) ?? [];
      const pick = any[Math.floor(random() * any.length)];
      if (!pick) return startFighter(job);
      return {
        job,
        hp: pick.hp,
        maxHp: pick.maxHp,
        atk: pick.atk,
        def: pick.def,
        indomitableAvailable: pick.indomitableAvailable,
      };
    }
  }
}

export interface EpisodeSpec {
  readonly mode: CombatMode;
  readonly setup: CombatSetup;
  readonly rules: CombatRules;
  /** Reaction delay per slot (ticks). */
  readonly delays: readonly [number, number];
  readonly mirror: Mirror;
  readonly dragonHpScale: number | null;
  readonly telegraphScale: number | null;
}

function pickJob(entry: JobId | 'uniform' | undefined, random: () => number): JobId {
  const roll = JOB_IDS[Math.floor(random() * JOB_IDS.length)]!;
  return entry === undefined || entry === 'uniform' ? roll : entry;
}

/** Everything random about one episode, drawn in a fixed order from the episode's sampler stream. */
export function sampleEpisode(
  config: CombatEnvConfig,
  sampler: StatSampler,
  baseRules: CombatRules,
  random: () => number,
): EpisodeSpec {
  const { pvp, dragon } = config.mode_mix;
  const mode: CombatMode = random() * (pvp + dragon) < pvp ? 'pvp' : 'dragon';
  const kind: Kind = mode === 'pvp' ? 'duel' : 'dragonFight';
  const list = config.jobs === 'uniform' ? [] : config.jobs;
  const jobA = pickJob(list[0], random);
  const jobB = pickJob(list[1] ?? list[0], random);
  const a = sampleFighter(sampler, jobA, kind, random);
  const b = sampleFighter(sampler, jobB, kind, random);
  const cur = config.dragon_curriculum;
  const hpScale = cur ? cur.hp_scale[0] + random() * (cur.hp_scale[1] - cur.hp_scale[0]) : 1;
  const tgScale = cur
    ? cur.telegraph_scale[0] + random() * (cur.telegraph_scale[1] - cur.telegraph_scale[0])
    : 1;
  const [dLo, dHi] =
    typeof config.obs_delay === 'number' ? [config.obs_delay, config.obs_delay] : config.obs_delay;
  const delays: [number, number] = [randInt(random, dLo, dHi), randInt(random, dLo, dHi)];
  const mx = random() < 0.5;
  const my = random() < 0.5;
  // a y flip in a dragon fight would put the dragon below the player, a state real play never shows
  const mirror: Mirror = config.mirror ? { x: mx, y: mode === 'pvp' && my } : NO_MIRROR;
  if (mode === 'pvp') {
    return {
      mode,
      setup: { kind: 'duel', a, b },
      rules: baseRules,
      delays,
      mirror,
      dragonHpScale: null,
      telegraphScale: null,
    };
  }
  const d = DEFAULT_RULES.dragon;
  const hp = Math.max(1, Math.round(d.hp * hpScale));
  return {
    mode,
    setup: { kind: 'dragonFight', a, b: null, dragon: { hp, atk: d.atk, def: d.def } },
    rules: scaleTelegraphs(baseRules, Math.round(tgScale * 1000) / 1000),
    delays,
    mirror,
    dragonHpScale: cur ? hpScale : null,
    telegraphScale: cur ? tgScale : null,
  };
}
