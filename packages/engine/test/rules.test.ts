import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, validateRules, withRules } from '../src/index';

describe('DEFAULT_RULES matches docs/game-design.md', () => {
  it('jobs (§4)', () => {
    expect(DEFAULT_RULES.jobs).toEqual({
      swordsman: { hp: 56, atk: 5, def: 5 },
      archer: { hp: 39, atk: 6, def: 6 },
      mage: { hp: 38, atk: 4, def: 5 },
      ninja: { hp: 30, atk: 4, def: 5 },
      berserker: { hp: 49, atk: 5, def: 5 },
    });
  });

  it('start, economy, items (§3, §7, §8)', () => {
    expect(DEFAULT_RULES.startingCoins).toBe(5);
    expect(DEFAULT_RULES.startingItems).toEqual({ shield: 1 });
    expect(DEFAULT_RULES.startBonus).toEqual({ coins: 10, hp: 6 });
    expect(DEFAULT_RULES.pvpGraceRounds).toBe(3);
    expect(DEFAULT_RULES.upgrades).toEqual({
      atk: { baseCost: 3, costStep: 1, amount: 1 },
      def: { baseCost: 2, costStep: 1, amount: 1 },
      maxHp: { baseCost: 2, costStep: 1, amount: 6 },
    });
    expect(DEFAULT_RULES.items.teleport).toEqual({ price: 6, perTurnLimit: null });
    expect(DEFAULT_RULES.items.shield.price).toBe(6);
    expect(DEFAULT_RULES.items.thief).toEqual({ price: 5, perTurnLimit: 1 });
    expect(DEFAULT_RULES.thiefStealAmount).toBe(7);
  });

  it('dragon and combat (§9, §10)', () => {
    expect(DEFAULT_RULES.dragon).toEqual({ hp: 115, atk: 10, def: 6, breathEvery: 3 });
    expect(DEFAULT_RULES.combat).toEqual({ maxExchanges: 100, dieSides: 6, mode: 'external' });
    expect(DEFAULT_RULES.passives.ninjaEvadeDie).toBe(8);
    expect(DEFAULT_RULES.passives.ninjaAdjustCooldown).toBe(2);
  });

  it('board layout (§5)', () => {
    expect(DEFAULT_RULES.board.map((t) => t.id)).toEqual([
      'START', 'GOBLIN', 'POISON_SWAMP', 'HERB', 'BANDIT', 'TRAINING', 'SHOP', 'WOLF', 'TRAP', 'TREASURE',
      'PICKPOCKET', 'BLACKSMITH', 'INN', 'ORC', 'CURSED_ALTAR', 'FOUNTAIN', 'ROCKFALL', 'MYSTERY', 'SHOP',
      'TROLL', 'SPIDER_WEB', 'WANDERING_MERCHANT', 'STORM', 'MYSTERY',
    ]);
    expect(DEFAULT_RULES.board.filter((t) => t.safe).map((t) => t.id)).toEqual(['START']);
    expect(DEFAULT_RULES.board[1]!.effects).toEqual([{ kind: 'coins', amount: 3 }]);
    expect(DEFAULT_RULES.mysteryDeck).toHaveLength(10);
  });

  it('is frozen and valid', () => {
    expect(Object.isFrozen(DEFAULT_RULES.jobs)).toBe(true);
    expect(() => validateRules(DEFAULT_RULES)).not.toThrow();
    expect(() => validateRules(withRules({ board: DEFAULT_RULES.board.slice(1) }))).toThrow();
    const badMode = { ...DEFAULT_RULES.combat, mode: 'auto' } as unknown as typeof DEFAULT_RULES.combat;
    expect(() => validateRules(withRules({ combat: badMode }))).toThrow();
  });
});
