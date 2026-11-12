import type { JobId, RulesConfig } from './types';

/** Passive behaviour per job, looked up by the combat loop instead of branching on job ids. */
export interface PassiveHooks {
  readonly alwaysFirst?: true;
  readonly firstStrikeBonus?: (r: RulesConfig) => number;
  readonly effectiveAtk?: (
    r: RulesConfig,
    atk: number,
    hp: number,
    maxHp: number,
  ) => { atk: number; rage: boolean };
  readonly pierce?: (r: RulesConfig, def: number) => number;
  readonly evadeDie?: (r: RulesConfig) => number;
  readonly indomitable?: true;
  readonly moveAdjust?: true;
}

export const PASSIVES: Readonly<Record<JobId, PassiveHooks>> = {
  swordsman: { indomitable: true },
  archer: { alwaysFirst: true, firstStrikeBonus: (r) => r.passives.archerFirstStrikeBonus },
  mage: { pierce: (r, def) => Math.floor(def / r.passives.mageDefDivisor) },
  ninja: { evadeDie: (r) => r.passives.ninjaEvadeDie, moveAdjust: true },
  berserker: {
    effectiveAtk: (r, atk, hp, maxHp) =>
      2 * hp <= maxHp
        ? {
            atk: Math.floor((atk * r.passives.berserkerRageNum) / r.passives.berserkerRageDen),
            rage: true,
          }
        : { atk, rage: false },
  },
};
