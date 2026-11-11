import type { PlayerState, RulesConfig, UpgradeStat } from './types';

export const upgradeCost = (rules: RulesConfig, p: Pick<PlayerState, 'upgradeLevels'>, stat: UpgradeStat): number => {
  const up = rules.upgrades[stat];
  return up.baseCost + p.upgradeLevels[stat] * up.costStep;
};

export const canAffordUpgrade = (rules: RulesConfig, p: PlayerState, stat: UpgradeStat): boolean =>
  p.coins >= upgradeCost(rules, p, stat);

/** Applies a stat increase. Returns the stat value after the change. */
export const raiseStat = (rules: RulesConfig, p: PlayerState, stat: UpgradeStat): number => {
  const amount = rules.upgrades[stat].amount;
  if (stat === 'maxHp') {
    p.maxHp += amount;
    p.hp += amount;
    return p.maxHp;
  }
  p[stat] += amount;
  return p[stat];
};

export const addCoins = (p: PlayerState, delta: number): number => {
  p.coins = Math.max(0, p.coins + delta);
  return p.coins;
};

export const healOrHurtByEvent = (rules: RulesConfig, p: PlayerState, delta: number): number => {
  if (delta >= 0) p.hp = Math.min(p.maxHp, p.hp + delta);
  else p.hp = Math.max(Math.min(p.hp, rules.eventHpFloor), p.hp + delta);
  return p.hp;
};
