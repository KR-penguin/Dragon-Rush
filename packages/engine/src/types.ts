export const JOB_IDS = ['swordsman', 'archer', 'mage', 'ninja', 'berserker'] as const;
export type JobId = (typeof JOB_IDS)[number];

export const ITEM_IDS = ['teleport', 'shield', 'princeTotem'] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export const UPGRADE_STATS = ['atk', 'def', 'maxHp'] as const;
export type UpgradeStat = (typeof UPGRADE_STATS)[number];

export const PHASES = [
  'PRE_ROLL',
  'MOVE_ADJUST',
  'CHOOSE_PVP_TARGET',
  'SHIELD_DECISION',
  'TRAINING_CHOICE',
  'POST_MOVE',
  // Appended last so the indices of the board phases above keep their meaning in board observations.
  'COMBAT',
] as const;
export type Phase = (typeof PHASES)[number];

export type SeatId = number;

export const TILE_IDS = [
  'START',
  'GOBLIN',
  'POISON_SWAMP',
  'HERB',
  'BANDIT',
  'TRAINING',
  'SHOP',
  'WOLF',
  'TRAP',
  'TREASURE',
  'PICKPOCKET',
  'BLACKSMITH',
  'INN',
  'ORC',
  'CURSED_ALTAR',
  'FOUNTAIN',
  'ROCKFALL',
  'MYSTERY',
  'TROLL',
  'SPIDER_WEB',
  'WANDERING_MERCHANT',
  'STORM',
  'MOONWELL',
  'RUNESTONE',
  'SUPPLY_CARAVAN',
  'FORTUNE_IDOL',
  'HAUNTED_GROVE',
  'TOLL_GATE',
  'SINKHOLE',
  'BURNING_RUINS',
] as const;
export type TileId = (typeof TILE_IDS)[number];

export type EffectSpec =
  | { kind: 'coins'; amount: number }
  | { kind: 'hp'; amount: number }
  | { kind: 'stat'; stat: 'atk' | 'def'; amount: number }
  | { kind: 'maxHp'; amount: number }
  | { kind: 'skipTurn' }
  | { kind: 'randomItem' }
  | { kind: 'training' }
  | { kind: 'shop' }
  | { kind: 'mystery' };

export interface TileDef {
  readonly id: TileId;
  readonly name: string;
  readonly safe: boolean;
  readonly effects: readonly EffectSpec[];
}

export interface MysteryCardDef {
  readonly id: string;
  readonly name: string;
  readonly effects: readonly EffectSpec[];
}

export interface JobDef {
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
}

/** 'dice': fights auto-resolve inside applyAction. 'external': the engine stops at COMBAT until applyCombatResult. */
export type CombatMode = 'dice' | 'external';

export interface ItemDef {
  readonly price: number;
  readonly perTurnLimit: number | null;
}

export interface RulesConfig {
  readonly version: string;
  readonly startingCoins: number;
  readonly startingItems: Readonly<Partial<Record<ItemId, number>>>;
  readonly startBonus: { readonly coins: number; readonly hp: number };
  readonly maxRounds: number | null;
  readonly pvpGraceRounds: number;
  readonly pvpWinBonusCoins: number;
  readonly eventHpFloor: number;
  readonly coinShortfallHpPerCoin: number;
  readonly maxPaidUpgradesPerTurn: number;
  readonly maxItemsBoughtPerTurn: number;
  readonly jobs: Readonly<Record<JobId, JobDef>>;
  readonly passives: {
    readonly indomitableUses: number;
    readonly archerFirstStrikeBonus: number;
    readonly archerStartingCoinsBonus: number;
    readonly mageDefDivisor: number;
    readonly ninjaEvadeDie: number;
    readonly ninjaAdjustCooldown: number;
    readonly berserkerRageNum: number;
    readonly berserkerRageDen: number;
  };
  readonly upgrades: Readonly<
    Record<
      UpgradeStat,
      { readonly baseCost: number; readonly costStep: number; readonly amount: number }
    >
  >;
  readonly items: Readonly<Record<ItemId, ItemDef>>;
  readonly princeTotemMaxHpBonus: number;
  readonly board: readonly TileDef[];
  readonly boardVariation: {
    readonly fixedTiles: readonly number[];
    readonly good: readonly TileDef[];
    readonly bad: readonly TileDef[];
    readonly newPerKind: number;
  } | null;
  readonly mysteryDeck: readonly MysteryCardDef[];
  readonly movement: { readonly rollSides: number };
  readonly combat: {
    readonly maxExchanges: number;
    readonly dieSides: number;
    readonly mode: CombatMode;
  };
  readonly dragon: {
    readonly hp: number;
    readonly atk: number;
    readonly def: number;
    readonly breathEvery: number;
    /** Multiplies dragon hits after the target's DEF has been applied. */
    readonly damageDealtScale: number;
  };
}

export interface PassiveState {
  indomitableUsed: boolean;
  ninjaCooldown: number;
}

export interface PlayerState {
  seat: SeatId;
  job: JobId;
  position: number;
  alive: boolean;
  skipNextTurn: boolean;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  coins: number;
  items: Record<ItemId, number>;
  upgradeLevels: Record<UpgradeStat, number>;
  passive: PassiveState;
}

export interface PendingDecision {
  actor: SeatId;
  phase: Phase;
}

export interface TurnContext {
  resting: boolean;
  paidUpgradesUsed: number;
  rolled: boolean;
  dice: number | null;
  teleportsUsed: number;
  itemsBought: number;
  canBuy: boolean;
}

export interface PvpContext {
  arriver: SeatId;
  candidates: SeatId[];
  target: SeatId | null;
  stage: 'arriver' | 'defender' | null;
}

/** A fight the engine is waiting on (external mode). */
export interface CombatRequest {
  kind: 'duel' | 'dragonFight';
  /** Arriver (duel) or challenger (dragon). */
  a: SeatId;
  /** Defender seat, null for the dragon. */
  b: SeatId | null;
  /** Temporary maximum-HP bonuses to remove when this fight ends. */
  princeTotemBonusA?: number;
  princeTotemBonusB?: number;
}

/** Outcome of an externally resolved fight, validated by applyCombatResult. */
export interface CombatResult {
  /** 'b' = defender or dragon. */
  winner: 'a' | 'b';
  /** a's hp after the fight (<= 0 allowed for the loser). */
  hpA: number;
  /** Defender hp after the fight; null for dragon fights. */
  hpB: number | null;
  /** Swordsman passive consumed during the fight. */
  indomitableUsedA?: boolean;
  indomitableUsedB?: boolean;
  /** Fight ended by time limit. */
  timedOut?: boolean;
}

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export type OutcomeKind = 'dragon' | 'lastSurvivor' | 'draw';

export interface GameOutcome {
  kind: OutcomeKind;
  winner: SeatId | null;
}

export interface GameState {
  rules: RulesConfig;
  players: PlayerState[];
  current: SeatId;
  round: number;
  seatOrigin: number[];
  pending: PendingDecision | null;
  turn: TurnContext;
  pvp: PvpContext | null;
  combat: CombatRequest | null;
  rng: RngState;
  outcome: GameOutcome | null;
}

export type PublicGameState = Omit<GameState, 'rng'>;

export interface GameSetup {
  seats: readonly { readonly job: JobId }[];
}

export type Action =
  | { type: 'ROLL_DICE' }
  | { type: 'END_TURN' }
  | { type: 'CHALLENGE_DRAGON' }
  | { type: 'UPGRADE'; stat: UpgradeStat }
  | { type: 'CHOOSE_TRAINING_STAT'; stat: UpgradeStat }
  | { type: 'BUY_ITEM'; item: ItemId }
  | { type: 'USE_TELEPORT'; tile: number }
  | { type: 'CHOOSE_PVP_TARGET'; target: SeatId }
  | { type: 'ADJUST_MOVE'; delta: -1 | 0 | 1 }
  | { type: 'SHIELD_DECISION'; use: boolean };

export type ActionType = Action['type'];

export type CombatantRef = SeatId | 'dragon';
export type CombatKind = 'duel' | 'dragonFight';
export type PassiveId = 'indomitable' | 'firstStrike' | 'evade' | 'rage' | 'pierce';

export type GameEvent =
  | { type: 'TurnStarted'; seat: SeatId; round: number; resting: boolean }
  | { type: 'RoundStarted'; round: number }
  | { type: 'TurnSkipped'; seat: SeatId }
  | { type: 'DiceRolled'; seat: SeatId; value: number }
  | { type: 'MoveAdjusted'; seat: SeatId; delta: -1 | 0 | 1; steps: number }
  | {
      type: 'Moved';
      seat: SeatId;
      from: number;
      to: number;
      steps: number;
      via: 'dice' | 'teleport';
    }
  | {
      type: 'StartBonus';
      seat: SeatId;
      coins: number;
      hp: number;
      coinsAfter: number;
      hpAfter: number;
    }
  | { type: 'TileResolved'; seat: SeatId; tile: number; tileId: TileId }
  | { type: 'MysteryCardDrawn'; seat: SeatId; cardId: string }
  | {
      type: 'EffectApplied';
      seat: SeatId;
      effect: EffectSpec['kind'];
      delta: number;
      after: number;
      cause?: 'coinShortfall';
      item?: ItemId;
      stat?: 'atk' | 'def';
    }
  | {
      type: 'StatUpgraded';
      seat: SeatId;
      stat: UpgradeStat;
      cost: number;
      free: boolean;
      valueAfter: number;
      levelAfter: number;
      coinsAfter: number;
    }
  | { type: 'ItemBought'; seat: SeatId; item: ItemId; price: number; coinsAfter: number }
  | { type: 'ItemUsed'; seat: SeatId; item: ItemId; tile?: number; target?: SeatId }
  | { type: 'PvpTriggered'; arriver: SeatId; candidates: SeatId[] }
  | { type: 'PvpTargetChosen'; arriver: SeatId; target: SeatId }
  | { type: 'ShieldUsed'; seat: SeatId; against: SeatId }
  | {
      type: 'CombatStarted';
      kind: CombatKind;
      a: CombatantRef;
      b: CombatantRef;
      first: CombatantRef;
    }
  | {
      type: 'CombatHit';
      kind: CombatKind;
      attacker: CombatantRef;
      defender: CombatantRef;
      roll: number;
      damage: number;
      evaded: boolean;
      breath: boolean;
      rage: boolean;
      firstStrike: boolean;
      hpAfter: number;
    }
  | { type: 'PassiveTriggered'; seat: SeatId; passive: PassiveId }
  | {
      type: 'CombatEnded';
      kind: CombatKind;
      winner: CombatantRef;
      loser: CombatantRef;
      capReached: boolean;
    }
  | { type: 'PlayerEliminated'; seat: SeatId; by: CombatantRef; round: number }
  | {
      type: 'LootTransferred';
      from: SeatId;
      to: SeatId;
      coins: number;
      items: Record<ItemId, number>;
    }
  | { type: 'TurnEnded'; seat: SeatId }
  | { type: 'GameEnded'; outcome: GameOutcome };

export type GameEventType = GameEvent['type'];
