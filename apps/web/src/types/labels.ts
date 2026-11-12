import type { ItemId, JobId, OutcomeKind, Phase, TileId, UpgradeStat } from '@dragon-rush/engine';

export const JOB_LABEL: Record<JobId, string> = {
  swordsman: '검사',
  archer: '궁수',
  mage: '마법사',
  ninja: '닌자',
  berserker: '광전사',
};

/** @deprecated Emoji placeholders; the UI draws `components/icons/GameIcon` SVGs instead. */
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

export const ITEM_LABEL: Record<ItemId, string> = {
  teleport: '텔레포트',
  shield: '방어막',
  thief: '도둑',
};
/** @deprecated Emoji placeholders; use `components/icons/GameIcon`. */
export const ITEM_ICON: Record<ItemId, string> = { teleport: '🌀', shield: '🛡️', thief: '🦝' };
export const ITEM_DESC: Record<ItemId, string> = {
  teleport: '원하는 칸으로 즉시 이동 (일회용)',
  shield: '결투가 성립할 때 전투를 취소 (일회용)',
  thief: '상대 1명의 코인 최대 10개를 훔침 (일회용, 턴당 1회)',
};

export const STAT_LABEL: Record<UpgradeStat | 'atk' | 'def', string> = {
  atk: '공격력',
  def: '방어력',
  maxHp: '최대 HP',
};
/** @deprecated Emoji placeholders; use `components/icons/GameIcon`. */
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

/** @deprecated Emoji placeholders; use `components/icons/GameIcon`. */
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

/** Player colors by engine seat (turn order). Used for rims, rings, ribbons and crests only. */
export const SEAT_COLORS = ['#D9443A', '#2F78D6', '#23935A', '#F0B429'] as const;

export const seatColor = (seat: number): string => SEAT_COLORS[seat % SEAT_COLORS.length]!;

/** Crest shapes give every seat a non-colour cue (WCAG 1.4.1). */
export type CrestShape = 'shield' | 'diamond' | 'leaf' | 'star';
export const SEAT_CRESTS: readonly CrestShape[] = ['shield', 'diamond', 'leaf', 'star'];
export const seatCrest = (seat: number): CrestShape => SEAT_CRESTS[seat % SEAT_CRESTS.length]!;

/** Amber needs ink text; the other seat colours take white text at 18 px bold and up. */
export const seatInk = (seat: number): string =>
  seat % SEAT_COLORS.length === 3 ? '#2B1D14' : '#FFF7EA';

/** One-line flavour for event cards and tooltips (Gowun Batang). */
export const TILE_FLAVOR: Record<TileId, string> = {
  START: '모험이 시작되는 성문. 한 바퀴 돌 때마다 보급을 받는다.',
  GOBLIN: '시끄러운 고블린 떼를 쫓아내고 주머니를 털었다.',
  POISON_SWAMP: '발밑에서 독한 거품이 올라온다.',
  HERB: '향긋한 약초가 상처를 감싼다.',
  BANDIT: '숲길의 산적이 통행료를 뜯어 간다.',
  TRAINING: '교관이 한 가지를 제대로 가르쳐 준다.',
  SHOP: '등불 아래 상인이 물건을 펼쳐 놓았다.',
  WOLF: '늑대 무리를 물리쳤지만 상처가 남았다.',
  TRAP: '덜컥! 숨겨진 가시가 튀어나온다.',
  TREASURE: '먼지 쌓인 상자 속에서 금화가 반짝인다.',
  PICKPOCKET: '정신을 차려 보니 주머니가 가볍다.',
  BLACKSMITH: '대장장이가 갑옷의 이음새를 손봐 준다.',
  INN: '따뜻한 수프와 푹신한 침대.',
  ORC: '오크 전사를 쓰러뜨리고 전리품을 챙겼다.',
  CURSED_ALTAR: '제단에 바친 금화는 돌아오지 않는다.',
  FOUNTAIN: '샘물에 동전을 던지자 행운이 돌아왔다.',
  ROCKFALL: '머리 위로 돌무더기가 쏟아진다.',
  MYSTERY: '어두운 동굴 입구. 무엇이 기다릴지 아무도 모른다.',
  TROLL: '거대한 트롤을 쓰러뜨렸다. 대가는 컸지만 보상도 크다.',
  SPIDER_WEB: '끈적한 거미줄에 발이 묶였다.',
  WANDERING_MERCHANT: '떠돌이 상인이 쓸 만한 물건 하나를 건넨다.',
  STORM: '번개와 비바람이 짐과 체력을 앗아 간다.',
};

const CARD_FLAVOR: Record<string, string> = {
  HIDDEN_GOLD: '바위 틈에 누군가 숨겨 둔 금화 주머니.',
  GEM_VEIN: '벽에 박힌 보석이 횃불에 반짝인다.',
  ANCIENT_RELIC: '오래된 무기의 기운이 손끝에 스민다.',
  HEALING_SPRING: '맑은 샘물이 피로를 씻어 낸다.',
  GIANT_BLESSING: '잠든 거인의 숨결이 몸을 단단하게 한다.',
  LOST_BAG: '누군가 잃어버린 가방 속에 쓸 만한 물건이.',
  CAVE_IN: '천장이 무너져 내린다!',
  GOBLIN_TRICK: '도깨비가 킥킥대며 금화를 채 간다.',
  BAT_SWARM: '박쥐 떼가 날카롭게 스쳐 지나간다.',
  LOST_IN_DARK: '어둠 속에서 길을 잃었다. 한 턴 쉬어 간다.',
};
export const cardFlavor = (id: string): string => CARD_FLAVOR[id] ?? '';

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

export const botLabel = (name: string | undefined): string =>
  name ? (BOT_LABEL[name] ?? name) : '봇';

export const DRAGON_NAME = '용';
/** @deprecated Emoji placeholder; use `components/icons/GameIcon`. */
export const DRAGON_ICON = '🐉';
/** @deprecated Emoji placeholder; use `components/icons/GameIcon`. */
export const COIN_ICON = '🪙';
