import {
  createRng,
  nextFloat,
  resolveCombat,
  type Fighter,
  type JobId,
  type PlayerState,
  type RngState,
  type RulesConfig,
} from '@dragon-rush/engine';
import { hashString } from '../../policy';

/** Compact combat profile: what matters for estimating a fight. */
export interface Profile {
  readonly job: JobId | 'dragon';
  readonly hp: number;
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly indomitable: number;
}

export const profileOf = (p: PlayerState, rules: RulesConfig): Profile => ({
  job: p.job,
  hp: p.hp,
  maxHp: p.maxHp,
  atk: p.atk,
  def: p.def,
  indomitable:
    p.job === 'swordsman' && !p.passive.indomitableUsed ? rules.passives.indomitableUses : 0,
});

export const dragonProfile = (rules: RulesConfig): Profile => ({
  job: 'dragon',
  hp: rules.dragon.hp,
  maxHp: rules.dragon.hp,
  atk: rules.dragon.atk,
  def: rules.dragon.def,
  indomitable: 0,
});

const key = (p: Profile) => `${p.job}/${p.hp}/${p.maxHp}/${p.atk}/${p.def}/${p.indomitable}`;

const toFighter = (p: Profile, ref: number | 'dragon'): Fighter => ({
  ref,
  job: p.job === 'dragon' ? null : p.job,
  hp: p.hp,
  maxHp: p.maxHp,
  atk: p.atk,
  def: p.def,
  indomitableAvailable: p.indomitable > 0,
});

const CACHE_LIMIT = 200_000;
const cache = new Map<string, number>();

/**
 * Monte Carlo win probability of `a` (striking first unless `b` is an archer) against `b`.
 * Seeded from the profile key so results never depend on call order.
 */
export function winProbability(
  rules: RulesConfig,
  a: Profile,
  b: Profile,
  samples: number,
): number {
  const k = `${rules.version}|${key(a)}|${key(b)}|${samples}`;
  const hit = cache.get(k);
  if (hit !== undefined) return hit;
  let rng: RngState = createRng(hashString(k));
  const roll = (sides: number) => {
    const [f, next] = nextFloat(rng);
    rng = next;
    return 1 + Math.floor(f * sides);
  };
  const isDragon = b.job === 'dragon';
  let wins = 0;
  for (let i = 0; i < samples; i++) {
    const r = resolveCombat(
      rules,
      toFighter(a, 0),
      toFighter(b, isDragon ? 'dragon' : 1),
      isDragon
        ? { kind: 'dragonFight', defaultFirst: 'a', capTieWinner: 'b', capLoser: 'a' }
        : { kind: 'duel', defaultFirst: 'a', capTieWinner: 'a' },
      roll,
    );
    if (r.winner === 'a') wins++;
  }
  const p = wins / samples;
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(k, p);
  return p;
}

const fexp = (x: number): number => {
  let s = 0;
  for (let d = 1; d <= 6; d++) s += Math.max(1, x + d);
  return s / 6;
};

/** Expected damage per attack of `a` against `b`. */
export function expectedDamage(rules: RulesConfig, a: Profile, b: Profile): number {
  const ps = rules.passives;
  let def = b.def;
  if (a.job === 'mage') def = Math.floor(def / ps.mageDefDivisor);
  let e: number;
  if (a.job === 'berserker') {
    e =
      0.6 * fexp(a.atk - def) +
      0.4 * fexp(Math.floor((a.atk * ps.berserkerRageNum) / ps.berserkerRageDen) - def);
  } else if (a.job === 'dragon') {
    const k = rules.dragon.breathEvery;
    e = ((k - 1) * fexp(a.atk - def) + fexp(a.atk)) / k;
  } else e = fexp(a.atk - def);
  if (b.job === 'ninja') e *= 1 - 1 / ps.ninjaEvadeDie;
  return Math.max(e, 0.05);
}

/** log(time A survives B / time A needs to kill B); > 0 favours A. */
export function race(rules: RulesConfig, a: Profile, b: Profile): number {
  const eA = expectedDamage(rules, a, b);
  const eB = expectedDamage(rules, b, a);
  let hA = a.maxHp + eB * a.indomitable;
  let hB = b.maxHp + eA * b.indomitable;
  if (a.job === 'archer') hB -= rules.passives.archerFirstStrikeBonus;
  if (b.job === 'archer') hA -= rules.passives.archerFirstStrikeBonus;
  return Math.log(Math.max(hA, 1) / eB) - Math.log(Math.max(hB, 1) / eA);
}
