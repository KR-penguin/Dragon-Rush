import type { ItemId, JobId, OutcomeKind, Phase, TileId, UpgradeStat } from '@dragon-rush/engine';

export const JOB_LABEL: Record<JobId, string> = {
  swordsman: '검사',
  archer: '궁수',
  mage: '마법사',
  ninja: '닌자',
  berserker: '광전사',
};

export const JOB_ICON: Record<JobId, string> = {
  swordsman: '⚔️',
  archer: '🏹',
  mage: '🔮',
  ninja: '🥷',
  berserker: '🪓',
};

export const JOB_PASSIVE: Record<JobId, string> = {
  swordsman: '불굴: 게임당 1회, 치명상을 HP 1로 버팀',
  archer: '선제 사격: 항상 선공, 첫 공격 +3',
  mage: '마력 관통: 상대 방어력 절반만 적용',
  ninja: '그림자 걸음(±1 이동) + 회피 1/8',
  berserker: '광폭화: HP 절반 이하일 때 공격력 ×1.3',
};

export const ITEM_LABEL: Record<ItemId, string> = { teleport: '텔레포트', shield: '방어막', thief: '도둑' };
export const ITEM_ICON: Record<ItemId, string> = { teleport: '🌀', shield: '🛡️', thief: '🦝' };
export const ITEM_DESC: Record<ItemId, string> = {
  teleport: '원하는 칸으로 즉시 이동 (일회용)',
  shield: '결투가 성립할 때 전투를 취소 (일회용)',
  thief: '상대 1명의 코인 최대 10개를 훔침 (일회용, 턴당 1회)',
};

export const STAT_LABEL: Record<UpgradeStat | 'atk' | 'def', string> = { atk: '공격력', def: '방어력', maxHp: '최대 HP' };
export const STAT_ICON: Record<UpgradeStat, string> = { atk: '⚔️', def: '🛡️', maxHp: '❤️' };

export const TILE_LABEL: Record<TileId, string> = {
  START: '출발',
  GOBLIN: '고블린 무리 처치',
  POISON_SWAMP: '독 늪',
  HERB: '약초 군락',
  BANDIT: '산적의 습격',
  TRAINING: '수련장',
  SHOP: '상점',
  WOLF: '늑대 무리 처치',
  TRAP: '가시 함정',
  TREASURE: '보물 상자',
  PICKPOCKET: '소매치기',
  BLACKSMITH: '대장장이의 축복',
  INN: '여관',
  ORC: '오크 전사 처치',
  CURSED_ALTAR: '저주받은 제단',
  FOUNTAIN: '행운의 샘',
  ROCKFALL: '낙석',
  MYSTERY: '미지의 동굴',
  TROLL: '트롤 처치',
  SPIDER_WEB: '거미줄 늪',
  WANDERING_MERCHANT: '떠돌이 상인',
  STORM: '폭풍',
};

export const TILE_ICON: Record<TileId, string> = {
  START: '🏁',
  GOBLIN: '👺',
  POISON_SWAMP: '☠️',
  HERB: '🌿',
  BANDIT: '🗡️',
  TRAINING: '🏋️',
  SHOP: '🛒',
  WOLF: '🐺',
  TRAP: '🪤',
  TREASURE: '💰',
  PICKPOCKET: '🫳',
  BLACKSMITH: '⚒️',
  INN: '🛏️',
  ORC: '👹',
  CURSED_ALTAR: '🕯️',
  FOUNTAIN: '⛲',
  ROCKFALL: '🪨',
  MYSTERY: '❓',
  TROLL: '🧌',
  SPIDER_WEB: '🕸️',
  WANDERING_MERCHANT: '🧳',
  STORM: '⛈️',
};

const CARD_LABEL: Record<string, string> = {
  HIDDEN_GOLD: '숨겨진 금화',
  GEM_VEIN: '보석 광맥',
  ANCIENT_RELIC: '고대 유물',
  HEALING_SPRING: '치유의 샘물',
  GIANT_BLESSING: '거인의 축복',
  LOST_BAG: '잃어버린 가방',
  CAVE_IN: '동굴 붕괴',
  GOBLIN_TRICK: '도깨비 장난',
  BAT_SWARM: '박쥐 떼',
  LOST_IN_DARK: '어둠 속 길 잃음',
};
export const cardLabel = (id: string): string => CARD_LABEL[id] ?? id;

export const PHASE_LABEL: Record<Phase, string> = {
  PRE_ROLL: '행동 선택',
  MOVE_ADJUST: '이동 보정',
  CHOOSE_PVP_TARGET: '결투 상대 선택',
  SHIELD_DECISION: '방어막 결정',
  TRAINING_CHOICE: '수련장 스탯 선택',
  POST_MOVE: '이동 후 행동',
  COMBAT: '전투',
};

/** Player colors by engine seat (turn order). */
export const SEAT_COLORS = ['#e8564a', '#3d9be9', '#4cc26b', '#e9b83d'] as const;

export const seatColor = (seat: number): string => SEAT_COLORS[seat % SEAT_COLORS.length]!;

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  dragon: '용 처치',
  lastSurvivor: '최후 생존',
  draw: '무승부',
};

export const BOT_LABEL: Record<string, string> = {
  heuristic: '무작위',
  'heuristic:aggro': '공격형',
  'heuristic:growth': '성장형',
  'heuristic:rush': '용 러시형',
  random: '무작위 정책',
  'random:uniform': '완전 무작위',
};

export const botLabel = (name: string | undefined): string => (name ? (BOT_LABEL[name] ?? name) : '봇');

export const DRAGON_NAME = '용';
export const DRAGON_ICON = '🐉';
export const COIN_ICON = '🪙';
