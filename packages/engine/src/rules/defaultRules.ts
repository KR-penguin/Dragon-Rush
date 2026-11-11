import type { MysteryCardDef, RulesConfig, TileDef } from '../types';

const tile = (id: TileDef['id'], name: string, effects: TileDef['effects'], safe = false): TileDef => ({
  id,
  name,
  safe,
  effects,
});

const BOARD: readonly TileDef[] = [
  tile('START', '출발', [], true),
  tile('GOBLIN', '고블린 무리 처치', [{ kind: 'coins', amount: 3 }]),
  tile('POISON_SWAMP', '독 늪', [{ kind: 'hp', amount: -5 }]),
  tile('HERB', '약초 군락', [{ kind: 'hp', amount: 8 }]),
  tile('BANDIT', '산적의 습격', [{ kind: 'coins', amount: -2 }]),
  tile('TRAINING', '수련장', [{ kind: 'training' }]),
  tile('SHOP', '상점', [{ kind: 'shop' }]),
  tile('WOLF', '늑대 무리 처치', [
    { kind: 'coins', amount: 5 },
    { kind: 'hp', amount: -3 },
  ]),
  tile('TRAP', '가시 함정', [{ kind: 'hp', amount: -6 }]),
  tile('TREASURE', '보물 상자', [{ kind: 'coins', amount: 6 }]),
  tile('PICKPOCKET', '소매치기', [{ kind: 'coins', amount: -3 }]),
  tile('BLACKSMITH', '대장장이의 축복', [{ kind: 'stat', stat: 'def', amount: 1 }]),
  tile('INN', '여관', [{ kind: 'hp', amount: 20 }]),
  tile('ORC', '오크 전사 처치', [
    { kind: 'coins', amount: 6 },
    { kind: 'hp', amount: -4 },
  ]),
  tile('CURSED_ALTAR', '저주받은 제단', [{ kind: 'coins', amount: -3 }]),
  tile('FOUNTAIN', '행운의 샘', [
    { kind: 'coins', amount: 3 },
    { kind: 'hp', amount: 6 },
  ]),
  tile('ROCKFALL', '낙석', [{ kind: 'hp', amount: -5 }]),
  tile('MYSTERY', '미지의 동굴', [{ kind: 'mystery' }]),
  tile('SHOP', '상점', [{ kind: 'shop' }]),
  tile('TROLL', '트롤 처치', [
    { kind: 'coins', amount: 8 },
    { kind: 'hp', amount: -7 },
  ]),
  tile('SPIDER_WEB', '거미줄 늪', [{ kind: 'skipTurn' }]),
  tile('WANDERING_MERCHANT', '떠돌이 상인', [{ kind: 'randomItem' }]),
  tile('STORM', '폭풍', [
    { kind: 'coins', amount: -1 },
    { kind: 'hp', amount: -3 },
  ]),
  tile('MYSTERY', '미지의 동굴', [{ kind: 'mystery' }]),
];

const MYSTERY_DECK: readonly MysteryCardDef[] = [
  { id: 'HIDDEN_GOLD', name: '숨겨진 금화', effects: [{ kind: 'coins', amount: 6 }] },
  { id: 'GEM_VEIN', name: '보석 광맥', effects: [{ kind: 'coins', amount: 4 }] },
  { id: 'ANCIENT_RELIC', name: '고대 유물', effects: [{ kind: 'stat', stat: 'atk', amount: 1 }] },
  { id: 'HEALING_SPRING', name: '치유의 샘물', effects: [{ kind: 'hp', amount: 15 }] },
  { id: 'GIANT_BLESSING', name: '거인의 축복', effects: [{ kind: 'maxHp', amount: 5 }] },
  { id: 'LOST_BAG', name: '잃어버린 가방', effects: [{ kind: 'randomItem' }] },
  { id: 'CAVE_IN', name: '동굴 붕괴', effects: [{ kind: 'hp', amount: -7 }] },
  { id: 'GOBLIN_TRICK', name: '도깨비 장난', effects: [{ kind: 'coins', amount: -3 }] },
  {
    id: 'BAT_SWARM',
    name: '박쥐 떼',
    effects: [
      { kind: 'coins', amount: -2 },
      { kind: 'hp', amount: -3 },
    ],
  },
  { id: 'LOST_IN_DARK', name: '어둠 속 길 잃음', effects: [{ kind: 'skipTurn' }] },
];

export const DEFAULT_RULES: RulesConfig = deepFreeze({
  version: 'final-1',
  startingCoins: 5,
  startingItems: { shield: 1 },
  startBonus: { coins: 10, hp: 6 },
  maxRounds: null,
  pvpGraceRounds: 3,
  eventHpFloor: 1,
  jobs: {
    swordsman: { hp: 56, atk: 5, def: 5 },
    archer: { hp: 39, atk: 6, def: 6 },
    mage: { hp: 38, atk: 4, def: 5 },
    ninja: { hp: 30, atk: 4, def: 5 },
    berserker: { hp: 49, atk: 5, def: 5 },
  },
  passives: {
    indomitableUses: 1,
    archerFirstStrikeBonus: 3,
    mageDefDivisor: 2,
    ninjaEvadeDie: 8,
    ninjaAdjustCooldown: 2,
    berserkerRageNum: 13,
    berserkerRageDen: 10,
  },
  upgrades: {
    atk: { baseCost: 3, costStep: 1, amount: 1 },
    def: { baseCost: 2, costStep: 1, amount: 1 },
    maxHp: { baseCost: 2, costStep: 1, amount: 6 },
  },
  items: {
    teleport: { price: 6, perTurnLimit: null },
    shield: { price: 6, perTurnLimit: null },
    thief: { price: 5, perTurnLimit: 1 },
  },
  thiefStealAmount: 7,
  board: BOARD,
  mysteryDeck: MYSTERY_DECK,
  combat: { maxExchanges: 100, dieSides: 6, mode: 'external' },
  dragon: { hp: 115, atk: 10, def: 6, breathEvery: 3 },
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

export function withRules(overrides: Partial<RulesConfig>, base: RulesConfig = DEFAULT_RULES): RulesConfig {
  return deepFreeze({ ...base, ...overrides });
}
