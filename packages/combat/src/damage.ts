import type { JobId } from '@dragon-rush/engine';
import { divRound } from './math';
import type { CombatRules } from './rules';
import type { FighterState } from './types';

/** Board passives kept in real time, looked up instead of branching on job ids (same idea as engine PASSIVES). */
export interface CombatPassive {
  /** 불굴: the first lethal hit leaves 1 HP (once per game). */
  readonly lastStand?: true;
  /** 선제 사격: starts nocked; the first landed hit gets a flat bonus. */
  readonly firstStrike?: true;
  /** 마력 관통: every hit uses DEF / mageDefDivisor. */
  readonly pierce?: true;
  /** 회피: every Nth incoming damage instance misses. */
  readonly evade?: true;
  /** 광폭화: ATK x num/den at hp <= 50%. */
  readonly rage?: true;
}

export const COMBAT_PASSIVES: Readonly<Record<JobId, CombatPassive>> = {
  swordsman: { lastStand: true },
  archer: { firstStrike: true },
  mage: { pierce: true },
  ninja: { evade: true },
  berserker: { rage: true },
};

export function isRaging(
  f: Pick<FighterState, 'job' | 'hp' | 'maxHp'> & Partial<Pick<FighterState, 'hpQ8'>>,
): boolean {
  const hpQ8 = f.hpQ8 ?? f.hp * 256;
  return COMBAT_PASSIVES[f.job].rage === true && hpQ8 > 0 && 2 * hpQ8 <= f.maxHp * 256;
}

/** Effective ATK as an integer ratio [num, den]. */
export function effectiveAtk(
  r: CombatRules,
  f: Pick<FighterState, 'job' | 'hp' | 'maxHp' | 'atk'> & Partial<Pick<FighterState, 'hpQ8'>>,
): [number, number] {
  return isRaging(f)
    ? [f.atk * r.passives.berserkerRageNum, r.passives.berserkerRageDen]
    : [f.atk, 1];
}

/** DEF divisor used by this attacker's hits (0 is reserved for "ignore DEF"). */
export function defDivisorOf(r: CombatRules, job: JobId): number {
  return COMBAT_PASSIVES[job].pierce ? r.passives.mageDefDivisor : 1;
}

/**
 * dmg = max(min, roundHalfUp(S * P * ATK_eff * K / (K + DEF_eff) * extra)), computed on integer
 * numerators and denominators. defDiv 0 ignores DEF (dragon breath). Flat bonuses are added by the caller.
 */
export function computeDamage(
  r: CombatRules,
  power: number,
  atkNum: number,
  atkDen: number,
  def: number,
  defDiv: number,
  extraNum = 1,
  extraDen = 1,
): number {
  const { sNum, sDen, k, min } = r.damage;
  let num = sNum * power * atkNum * k * extraNum;
  let den = sDen * 100 * atkDen * extraDen;
  if (defDiv > 0) {
    num *= defDiv;
    den *= k * defDiv + def;
  } else {
    den *= k;
  }
  return Math.max(min, divRound(num, den));
}

/** Q8 damage for duels, rounded only after the full ratio is evaluated. */
export function computeDamageQ8(
  r: CombatRules,
  power: number,
  atkNum: number,
  atkDen: number,
  def: number,
  defDiv: number,
): number {
  const { sNum, sDen, k, min } = r.damage;
  const div = defDiv > 0 ? defDiv : 1;
  const num = 256 * sNum * power * atkNum * k * div;
  const den = sDen * 100 * atkDen * (defDiv > 0 ? k * div + def : k * div);
  return Math.max(256 * min, divRound(num, den));
}

/** Hitstop for a fighter's hit: by power class, +rage bonus; the caller caps it. */
export function fighterHitstop(
  r: CombatRules,
  power: number,
  multiHit: boolean,
  rage: boolean,
): number {
  const h = r.hitstop;
  const base = multiHit
    ? h.multiHit
    : power <= h.lightMaxPower
      ? h.light
      : power >= h.heavyMinPower
        ? h.heavy
        : h.normal;
  return base + (rage ? h.rageBonus : 0);
}

/** dragonDamageTakenScale as an exact ratio (quantised to 1/1000). */
export function dragonScale(r: CombatRules): [number, number] {
  return [Math.round(r.damage.dragonDamageTakenScale * 1000), 1000];
}
