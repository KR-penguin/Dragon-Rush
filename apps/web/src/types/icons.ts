import type { ItemId, JobId, TileId, UpgradeStat } from '@dragon-rush/engine';

/**
 * Semantic icon names. `components/icons/GameIcon` maps them to game-icons.net SVGs
 * (CC BY 3.0, Lorc, Delapouite & contributors) until painted art lands.
 */
export const ICON_NAMES = [
  // jobs
  'swordsman',
  'archer',
  'mage',
  'ninja',
  'berserker',
  // tiles
  'start',
  'goblin',
  'swamp',
  'herb',
  'bandit',
  'training',
  'shop',
  'wolf',
  'trap',
  'treasure',
  'pickpocket',
  'blacksmith',
  'inn',
  'orc',
  'altar',
  'fountain',
  'rockfall',
  'cave',
  'troll',
  'web',
  'merchant',
  'storm',
  // items and stats
  'teleport',
  'shield',
  'thief',
  'atk',
  'def',
  'hp',
  'maxHp',
  'coins',
  // mystery cards
  'gold',
  'gems',
  'relic',
  'spring',
  'giant',
  'bag',
  'bat',
  'dark',
  // dragon and status
  'dragon',
  'breath',
  'rune',
  'eye',
  'sleep',
  'rage',
  'indomitable',
  'cooldown',
  'disconnected',
  'bot',
  'skull',
  'crown',
  'duel',
  'scroll',
  'footsteps',
  // landmarks
  'gate',
  'tent',
  'cabin',
  'lantern',
  'flag',
  // UI
  'dice',
  'endTurn',
  'chronicle',
  'exit',
  'skip',
  'soundOn',
  'soundOff',
  'motion',
  'anvil',
  'close',
  'local',
  'online',
  'trophy',
  'restart',
  'settings',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const JOB_ICON_NAME: Record<JobId, IconName> = {
  swordsman: 'swordsman',
  archer: 'archer',
  mage: 'mage',
  ninja: 'ninja',
  berserker: 'berserker',
};

export const TILE_ICON_NAME: Record<TileId, IconName> = {
  START: 'start',
  GOBLIN: 'goblin',
  POISON_SWAMP: 'swamp',
  HERB: 'herb',
  BANDIT: 'bandit',
  TRAINING: 'training',
  SHOP: 'shop',
  WOLF: 'wolf',
  TRAP: 'trap',
  TREASURE: 'treasure',
  PICKPOCKET: 'pickpocket',
  BLACKSMITH: 'blacksmith',
  INN: 'inn',
  ORC: 'orc',
  CURSED_ALTAR: 'altar',
  FOUNTAIN: 'fountain',
  ROCKFALL: 'rockfall',
  MYSTERY: 'cave',
  TROLL: 'troll',
  SPIDER_WEB: 'web',
  WANDERING_MERCHANT: 'merchant',
  STORM: 'storm',
};

export const ITEM_ICON_NAME: Record<ItemId, IconName> = {
  teleport: 'teleport',
  shield: 'shield',
  thief: 'thief',
};

export const STAT_ICON_NAME: Record<UpgradeStat, IconName> = {
  atk: 'atk',
  def: 'def',
  maxHp: 'maxHp',
};

const CARD_ICON_NAME: Record<string, IconName> = {
  HIDDEN_GOLD: 'gold',
  GEM_VEIN: 'gems',
  ANCIENT_RELIC: 'relic',
  HEALING_SPRING: 'spring',
  GIANT_BLESSING: 'giant',
  LOST_BAG: 'bag',
  CAVE_IN: 'rockfall',
  GOBLIN_TRICK: 'goblin',
  BAT_SWARM: 'bat',
  LOST_IN_DARK: 'dark',
};

export const cardIconName = (cardId: string): IconName => CARD_ICON_NAME[cardId] ?? 'cave';
