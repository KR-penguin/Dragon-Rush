import type { MysteryCardDef, RulesConfig, TileDef } from '../types';

const tile = (
  id: TileDef['id'],
  name: string,
  effects: TileDef['effects'],
  safe = false,
): TileDef => ({
  id,
  name,
  safe,
  effects,
});

const BOARD: readonly TileDef[] = [
  tile('START', '출발', []),
  tile('GOBLIN', '고블린 무리 처치', [{ kind: 'coins', amount: 6 }]),
  tile('POISON_SWAMP', '독 늪', [{ kind: 'hp', amount: -5 }]),
  tile('TREASURE', '보물 상자', [{ kind: 'coins', amount: 12 }]),
  tile('BANDIT', '산적의 습격', [{ kind: 'coins', amount: -4 }]),
  tile('TRAINING', '수련장', [{ kind: 'training' }]),
  tile('SHOP', '상점', [{ kind: 'shop' }]),
  tile('WOLF', '늑대 무리 처치', [
    { kind: 'coins', amount: 10 },
    { kind: 'hp', amount: -3 },
  ]),
  tile('TRAP', '가시 함정', [{ kind: 'hp', amount: -6 }]),
  tile('HERB', '약초 군락', [{ kind: 'hp', amount: 8 }]),
  tile('PICKPOCKET', '소매치기', [{ kind: 'coins', amount: -6 }]),
  tile('BLACKSMITH', '대장장이의 축복', [{ kind: 'stat', stat: 'def', amount: 1 }]),
  tile('INN', '여관', [{ kind: 'hp', amount: 20 }]),
  tile('ORC', '오크 전사 처치', [
    { kind: 'coins', amount: 12 },
    { kind: 'hp', amount: -4 },
  ]),
  tile('CURSED_ALTAR', '저주받은 제단', [{ kind: 'coins', amount: -6 }]),
  tile('FOUNTAIN', '행운의 샘', [
    { kind: 'coins', amount: 6 },
    { kind: 'hp', amount: 6 },
  ]),
  tile('ROCKFALL', '낙석', [{ kind: 'hp', amount: -5 }]),
  tile('MYSTERY', '미지의 동굴', [{ kind: 'mystery' }]),
  tile('SHOP', '상점', [{ kind: 'shop' }]),
  tile('TROLL', '트롤 처치', [
    { kind: 'coins', amount: 16 },
    { kind: 'hp', amount: -7 },
  ]),
  tile('SPIDER_WEB', '거미줄 늪', [{ kind: 'skipTurn' }]),
  tile('WANDERING_MERCHANT', '떠돌이 상인', [{ kind: 'randomItem' }]),
  tile('STORM', '폭풍', [
    { kind: 'coins', amount: -2 },
    { kind: 'hp', amount: -3 },
  ]),
  tile('MYSTERY', '미지의 동굴', [{ kind: 'mystery' }]),
];

const NEW_GOOD_TILES: readonly TileDef[] = [
  tile('MOONWELL', '달빛 우물', [{ kind: 'hp', amount: 10 }]),
  tile('RUNESTONE', '룬 각인석', [{ kind: 'stat', stat: 'atk', amount: 1 }]),
  tile('SUPPLY_CARAVAN', '보급 마차', [
    { kind: 'coins', amount: 8 },
    { kind: 'hp', amount: 4 },
  ]),
  tile('FORTUNE_IDOL', '행운의 수호상', [
    { kind: 'coins', amount: 4 },
    { kind: 'stat', stat: 'def', amount: 1 },
  ]),
];

const NEW_BAD_TILES: readonly TileDef[] = [
  tile('HAUNTED_GROVE', '망령의 숲', [{ kind: 'hp', amount: -7 }]),
  tile('TOLL_GATE', '산적 검문소', [{ kind: 'coins', amount: -8 }]),
  tile('SINKHOLE', '깊은 싱크홀', [{ kind: 'skipTurn' }]),
  tile('BURNING_RUINS', '불타는 폐허', [
    { kind: 'coins', amount: -3 },
    { kind: 'hp', amount: -4 },
  ]),
];

const MYSTERY_DECK: readonly MysteryCardDef[] = [
  { id: 'HIDDEN_GOLD', name: '숨겨진 금화', effects: [{ kind: 'coins', amount: 12 }] },
  { id: 'GEM_VEIN', name: '보석 광맥', effects: [{ kind: 'coins', amount: 8 }] },
  { id: 'ANCIENT_RELIC', name: '고대 유물', effects: [{ kind: 'stat', stat: 'atk', amount: 1 }] },
  { id: 'HEALING_SPRING', name: '치유의 샘물', effects: [{ kind: 'hp', amount: 15 }] },
  { id: 'GIANT_BLESSING', name: '거인의 축복', effects: [{ kind: 'maxHp', amount: 5 }] },
  { id: 'LOST_BAG', name: '잃어버린 가방', effects: [{ kind: 'randomItem' }] },
  { id: 'CAVE_IN', name: '동굴 붕괴', effects: [{ kind: 'hp', amount: -7 }] },
  { id: 'GOBLIN_TRICK', name: '도깨비 장난', effects: [{ kind: 'coins', amount: -6 }] },
  {
    id: 'BAT_SWARM',
    name: '박쥐 떼',
    effects: [
      { kind: 'coins', amount: -4 },
      { kind: 'hp', amount: -3 },
    ],
  },
  { id: 'LOST_IN_DARK', name: '어둠 속 길 잃음', effects: [{ kind: 'skipTurn' }] },
];

export const DEFAULT_RULES: RulesConfig = deepFreeze({
  version: 'rush-11',
  startingCoins: 10,
  startingItems: {},
  startBonus: { coins: 35, hp: 6 },
  maxRounds: null,
  pvpGraceRounds: 0,
  pvpWinBonusCoins: 30,
  eventHpFloor: 1,
  coinShortfallHpPerCoin: 1,
  maxPaidUpgradesPerTurn: 3,
  jobs: {
    swordsman: { hp: 53, atk: 5, def: 5 },
    archer: { hp: 39, atk: 6, def: 6 },
    mage: { hp: 40, atk: 4, def: 5 },
    ninja: { hp: 34, atk: 4, def: 5 },
    berserker: { hp: 47, atk: 5, def: 5 },
  },
  passives: {
    indomitableUses: 1,
    archerFirstStrikeBonus: 3,
    archerStartingCoinsBonus: 6,
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
  thiefStealAmount: 10,
  board: BOARD,
  boardVariation: {
    fixedTiles: [0, 6, 12, 18],
    good: NEW_GOOD_TILES,
    bad: NEW_BAD_TILES,
    newPerKind: 2,
  },
  mysteryDeck: MYSTERY_DECK,
  movement: { rollSides: 10 },
  combat: { maxExchanges: 100, dieSides: 6, mode: 'external' },
  dragon: { hp: 88, atk: 50, def: 10, breathEvery: 3, damageDealtScale: 0.6 },
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

export function withRules(
  overrides: Partial<RulesConfig>,
  base: RulesConfig = DEFAULT_RULES,
): RulesConfig {
  return deepFreeze({
    ...base,
    ...overrides,
    ...(overrides.board !== undefined && overrides.boardVariation === undefined
      ? { boardVariation: null }
      : {}),
  });
}
