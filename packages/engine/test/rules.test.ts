import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, validateRules, withRules } from '../src/index';

describe('DEFAULT_RULES matches docs/game-design.md', () => {
  it('jobs (§4)', () => {
    expect(DEFAULT_RULES.jobs).toEqual({
      swordsman: { hp: 53, atk: 5, def: 5 },
      archer: { hp: 39, atk: 6, def: 6 },
      mage: { hp: 40, atk: 4, def: 5 },
      ninja: { hp: 34, atk: 4, def: 5 },
      berserker: { hp: 47, atk: 5, def: 5 },
    });
  });

  it('start, economy, items (§3, §7, §8)', () => {
    expect(DEFAULT_RULES.startingCoins).toBe(10);
    expect(DEFAULT_RULES.startingItems).toEqual({});
    expect(DEFAULT_RULES.startBonus).toEqual({ coins: 35, hp: 6 });
    expect(DEFAULT_RULES.pvpGraceRounds).toBe(0);
    expect(DEFAULT_RULES.pvpWinBonusCoins).toBe(30);
    expect(DEFAULT_RULES.coinShortfallHpPerCoin).toBe(1);
    expect(DEFAULT_RULES.maxPaidUpgradesPerTurn).toBe(3);
    expect(DEFAULT_RULES.upgrades).toEqual({
      atk: { baseCost: 3, costStep: 1, amount: 1 },
      def: { baseCost: 2, costStep: 1, amount: 1 },
      maxHp: { baseCost: 2, costStep: 1, amount: 6 },
    });
    expect(DEFAULT_RULES.items.teleport).toEqual({ price: 6, perTurnLimit: null });
    expect(DEFAULT_RULES.items.shield.price).toBe(6);
    expect(DEFAULT_RULES.items.thief).toEqual({ price: 5, perTurnLimit: 1 });
    expect(DEFAULT_RULES.thiefStealAmount).toBe(10);
  });

  it('dragon and combat (§9, §10)', () => {
    expect(DEFAULT_RULES.movement).toEqual({ rollSides: 10 });
    expect(DEFAULT_RULES.dragon).toEqual({
      hp: 88,
      atk: 50,
      def: 10,
      breathEvery: 3,
      damageDealtScale: 0.6,
    });
    expect(DEFAULT_RULES.combat).toEqual({ maxExchanges: 100, dieSides: 6, mode: 'external' });
    expect(DEFAULT_RULES.passives.ninjaEvadeDie).toBe(8);
    expect(DEFAULT_RULES.passives.ninjaAdjustCooldown).toBe(2);
  });

  it('board layout (§5)', () => {
    expect(DEFAULT_RULES.board.map((t) => t.id)).toEqual([
      'START',
      'GOBLIN',
      'POISON_SWAMP',
      'TREASURE',
      'BANDIT',
      'TRAINING',
      'SHOP',
      'WOLF',
      'TRAP',
      'HERB',
      'PICKPOCKET',
      'BLACKSMITH',
      'INN',
      'ORC',
      'CURSED_ALTAR',
      'FOUNTAIN',
      'ROCKFALL',
      'MYSTERY',
      'SHOP',
      'TROLL',
      'SPIDER_WEB',
      'WANDERING_MERCHANT',
      'STORM',
      'MYSTERY',
    ]);
    expect(DEFAULT_RULES.board.filter((t) => t.safe).map((t) => t.id)).toEqual([]);
    const amounts = (effects: readonly { kind: string; amount?: number }[]) =>
      effects
        .filter((e) => e.kind === 'coins' || e.kind === 'hp')
        .map((e) => `${e.kind}${e.amount}`)
        .join(' ');
    expect(DEFAULT_RULES.board.map((t) => amounts(t.effects))).toEqual([
      '',
      'coins6',
      'hp-5',
      'coins12',
      'coins-4',
      '',
      '',
      'coins10 hp-3',
      'hp-6',
      'hp8',
      'coins-6',
      '',
      'hp20',
      'coins12 hp-4',
      'coins-6',
      'coins6 hp6',
      'hp-5',
      '',
      '',
      'coins16 hp-7',
      '',
      '',
      'coins-2 hp-3',
      '',
    ]);
    expect(DEFAULT_RULES.mysteryDeck).toHaveLength(10);
    expect(
      Object.fromEntries(DEFAULT_RULES.mysteryDeck.map((c) => [c.id, amounts(c.effects)])),
    ).toEqual({
      HIDDEN_GOLD: 'coins12',
      GEM_VEIN: 'coins8',
      ANCIENT_RELIC: '',
      HEALING_SPRING: 'hp15',
      GIANT_BLESSING: '',
      LOST_BAG: '',
      CAVE_IN: 'hp-7',
      GOBLIN_TRICK: 'coins-6',
      BAT_SWARM: 'coins-4 hp-3',
      LOST_IN_DARK: '',
    });
  });

  it('carries the balance version', () => {
    expect(DEFAULT_RULES.version).toBe('rush-9');
  });

  it('is frozen and valid', () => {
    expect(Object.isFrozen(DEFAULT_RULES.jobs)).toBe(true);
    expect(() => validateRules(DEFAULT_RULES)).not.toThrow();
    expect(() => validateRules(withRules({ board: DEFAULT_RULES.board.slice(1) }))).toThrow();
    const badMode = {
      ...DEFAULT_RULES.combat,
      mode: 'auto',
    } as unknown as typeof DEFAULT_RULES.combat;
    expect(() => validateRules(withRules({ combat: badMode }))).toThrow();
    expect(() => validateRules(withRules({ pvpWinBonusCoins: -1 }))).toThrow();
    expect(() => validateRules(withRules({ coinShortfallHpPerCoin: -1 }))).toThrow();
    expect(() => validateRules(withRules({ movement: { rollSides: 25 } }))).toThrow();
  });
});
