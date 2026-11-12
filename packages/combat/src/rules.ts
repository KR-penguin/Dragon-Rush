import { DEFAULT_RULES, type JobId } from '@dragon-rush/engine';

/** Fixed simulation rate. One `stepCombat` call = one tick. */
export const COMBAT_TICK_HZ = 60;

/** Fighter move ids (attacks, skills and their follow-ups). */
export type MoveId =
  | 'slash1'
  | 'slash2'
  | 'thrust'
  | 'parry'
  | 'counter'
  | 'draw'
  | 'quickShot'
  | 'fullShot'
  | 'volley'
  | 'bolt'
  | 'meteor'
  | 'dagger1'
  | 'dagger2'
  | 'kunai'
  | 'greataxe'
  | 'whirlwind';

export type DashId = 'dash' | 'backstep' | 'blink' | 'shadowStep' | 'shoulderCharge';

export type ManeuverId = 'claw' | 'tail' | 'volley' | 'charge' | 'gust' | 'breath' | 'dive';

/** Damage parameters of one hit. `power` is P in percent (100 = P 1.0); knockback in px, hitstun in ticks. */
export interface HitSpec {
  readonly power: number;
  readonly knockback: number;
  readonly hitstun: number;
}

interface MoveBase {
  readonly startup: number;
  readonly recovery: number;
  /** Locomotion allowed during the move, percent of walk speed (0 = rooted). */
  readonly moveSpeedPct: number;
}

/** Melee hitbox: an arc of `half` BAM around the aim (>= 128 = all around), reaching `reach` px past the body centre. */
export interface MeleeMoveSpec extends MoveBase {
  readonly type: 'melee';
  readonly active: number;
  readonly reach: number;
  readonly half: number;
  readonly hit: HitSpec;
  /** Multi-hit moves hit up to `hits` times, once per `hitEvery` active ticks. */
  readonly hits: number;
  readonly hitEvery: number;
  /** Forward travel in px spread over the active frames. */
  readonly lunge: number;
  /** Super armor on move ticks [armorFrom, armorTo] (0-based); -1 = none. */
  readonly armorFrom: number;
  readonly armorTo: number;
  /** String follow-up started by a buffered attack press from move tick `chainFrom` on. */
  readonly next: MoveId | null;
  readonly chainFrom: number;
  readonly parry: 'counter' | 'crush';
  readonly armorBreak?: boolean;
}

export interface ProjectileSpec {
  readonly speed: number;
  readonly radius: number;
  readonly range: number;
  readonly pierce: boolean;
  /** A parry stops it (arrows, kunai); magic bolts pass through the parry. */
  readonly parryable: boolean;
  /** A parried projectile flies back as the parrier's (otherwise it is only negated). */
  readonly reflectable: boolean;
  /** Homing: BAM turned per tick toward the target, capped at `homingMax` in total. */
  readonly homingPerTick: number;
  readonly homingMax: number;
  readonly hit: HitSpec;
  readonly leadTicks?: number;
  readonly cancelsProjectiles?: boolean;
}

/** Fires `count` projectiles (fanned `spread` BAM apart) on move tick `startup`. */
export interface ShotMoveSpec extends MoveBase {
  readonly type: 'shot';
  readonly projectile: ProjectileSpec;
  readonly count: number;
  readonly spread: number;
}

/** Archer bow: press starts a draw; release before `fullAt` fires `quick` (not before `quickAt`), at or after it `full`. */
export interface DrawMoveSpec extends MoveBase {
  readonly type: 'draw';
  readonly quickAt: number;
  readonly fullAt: number;
  readonly quick: MoveId;
  readonly full: MoveId;
}

/** Parry window on ticks [startup, startup + active); `recovery` is the whiff recovery. */
export interface ParryMoveSpec extends MoveBase {
  readonly type: 'parry';
  readonly active: number;
  readonly half: number;
  readonly counter: MoveId;
  readonly reflectPower: number;
  /** A successful parry gives the skill charge back (a duelist who reads every hit can keep parrying). */
  readonly refundOnParry: boolean;
  /** Hitstun put on a parried melee attacker that is not in super armor (the counter-slash then lands). */
  readonly stagger: number;
}

/** Ground rune: after `startup` a mark appears `distance` px ahead (or on an aim-assisted target), explodes after `arm`. */
export interface RuneMoveSpec extends MoveBase {
  readonly type: 'rune';
  readonly distance: number;
  readonly assistRange: number;
  readonly radius: number;
  readonly arm: number;
  readonly active: number;
  readonly hit: HitSpec;
  readonly holdTicks: number;
  readonly armorBreak: boolean;
}

export type MoveSpec = MeleeMoveSpec | ShotMoveSpec | DrawMoveSpec | ParryMoveSpec | RuneMoveSpec;

/** Dash: `fastTicks` at `fastSpeed` px/tick, then the rest at `slowSpeed`. Frames are 1-based like frame data. */
export interface DashSpec {
  readonly ticks: number;
  readonly fastTicks: number;
  readonly fastSpeed: number;
  readonly slowSpeed: number;
  readonly iframeFrom: number;
  readonly iframeTo: number;
  /** First frame from which a buffered attack cancels the dash (0 = never). */
  readonly cancelFrom: number;
  /** Cooldown after the dash ends (per charge when `charges` > 1). */
  readonly cooldown: number;
  readonly charges: number;
  /** Moves straight away from facing and keeps facing. */
  readonly backward: boolean;
  readonly superArmor: boolean;
  readonly invisible: boolean;
  /** Shoulder charge: one contact hit within `contactReach` px of the body edge. */
  readonly contact: HitSpec | null;
  readonly contactReach: number;
}

export interface JobKit {
  /** Walk speed in px/s. */
  readonly speed: number;
  readonly attack: MoveId;
  readonly skill: MoveId;
  /** Skill cooldown in ticks from use (per charge when `skillCharges` > 1). */
  readonly skillCooldown: number;
  readonly skillCharges: number;
  readonly dash: DashId;
  /** Melee damage from behind the target (within `backstabHalf` of its back), percent of P; 100 = none. */
  readonly backstabPct: number;
  readonly poisePct: number;
}

export interface DragonHitSpec extends HitSpec {
  readonly hitstop: number;
  readonly parryable: boolean;
}

export interface DragonRules {
  /** Real-time boss HP relative to the board dragon; permits larger visible hit numbers. */
  readonly hpMultiplier: number;
  /** Real-time boss attack relative to the board dragon. */
  readonly atkMultiplier: number;
  /** Body hurtbox circles relative to the centre (px). */
  readonly body: readonly { readonly dx: number; readonly dy: number; readonly r: number }[];
  /** Head hurtbox: `forward` px from the centre along the facing; a weak point while lowered. */
  readonly head: { readonly forward: number; readonly r: number };
  readonly anchorY: number;
  readonly playerDistance: number;
  readonly driftSpeed: number;
  readonly returnSpeed: number;
  readonly idle: readonly [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  readonly firstIdle: number;
  readonly softEnrageTick: number;
  readonly softEnrageIdleNum: number;
  readonly softEnrageIdleDen: number;
  /** Phase 2 starts at hp <= phase2Pct% of maxHp, phase 3 at phase3Pct%. */
  readonly phase2Pct: number;
  readonly phase3Pct: number;
  readonly roarTicks: number;
  readonly postRoarIdle: number;
  readonly p2TelegraphPct: number;
  readonly p3RecoveryPct: number;
  /** Every `breathEvery`-th damaging maneuver is Breath (board rule). */
  readonly breathEvery: number;
  readonly weakPointNum: number;
  readonly weakPointDen: number;
  readonly bands: {
    readonly frontHalf: number;
    readonly frontRange: number;
    readonly sideRange: number;
  };
  /** Maneuver weights per range band; gust needs phase 2, dive phase 3. */
  readonly weights: {
    readonly front: Readonly<Record<'claw' | 'volley' | 'charge' | 'gust' | 'dive', number>>;
    readonly side: Readonly<Record<'tail' | 'volley' | 'charge' | 'gust' | 'dive', number>>;
    readonly far: Readonly<Record<'volley' | 'charge' | 'gust' | 'dive', number>>;
  };
  readonly claw: {
    readonly telegraph: number;
    readonly active: number;
    readonly recovery: number;
    readonly reach: number;
    readonly half: number;
    readonly hit: DragonHitSpec;
  };
  readonly tail: {
    readonly telegraph: number;
    readonly active: number;
    readonly recovery: number;
    readonly reach: number;
    readonly half: number;
    readonly hit: DragonHitSpec;
  };
  readonly volley: {
    readonly interval: number;
    readonly count: readonly [number, number, number];
    readonly arm: number;
    readonly blast: number;
    readonly radius: number;
    readonly recovery: number;
    readonly hit: DragonHitSpec;
    readonly floorFromPhase: number;
    readonly floorTicks: number;
    readonly floorEvery: number;
    readonly floorPower: number;
  };
  readonly charge: {
    readonly telegraph: number;
    readonly lockBefore: number;
    readonly halfWidth: number;
    readonly speed: number;
    readonly maxTicks: number;
    readonly stun: number;
    readonly hit: DragonHitSpec;
  };
  readonly gust: {
    readonly telegraph: number;
    readonly active: number;
    readonly push: number;
    readonly reach: number;
  };
  readonly breath: {
    readonly telegraph: readonly [number, number, number];
    readonly active: number;
    readonly every: number;
    readonly reach: number;
    readonly half: number;
    /** Sweep amplitude (BAM) from phase 2; phase 3 sweeps there and back. */
    readonly sweep: number;
    readonly recovery: number;
    readonly power: number;
  };
  readonly dive: {
    readonly airborne: number;
    readonly lockBefore: number;
    readonly radius: number;
    readonly active: number;
    readonly recovery: number;
    readonly hit: DragonHitSpec;
  };
}

export interface CombatRules {
  readonly version: string;
  readonly tickHz: number;
  /** Arena sizes in logical px (1 tile = 32 px). */
  readonly arena: {
    readonly duel: { readonly w: number; readonly h: number };
    readonly dragonFight: { readonly w: number; readonly h: number };
  };
  /** Duel spawns sit on the horizontal centre line `duelGap` px apart. */
  readonly duelGap: number;
  readonly timeLimit: { readonly duel: number; readonly dragonFight: number };
  readonly inputBuffer: number;
  readonly body: { readonly hurtRadius: number; readonly bodyRadius: number };
  /** Ticks to reach top speed / to stop. */
  readonly accelTicks: number;
  readonly stopTicks: number;
  /** Soft aim assist: snap to the target within `half` BAM and `rangePct`% of the move's range. */
  readonly aimAssist: { readonly half: number; readonly rangePct: number };
  /**
   * dmg = max(min, roundHalfUp(S * P * ATK_eff * K / (K + DEF_eff))) + flat, all in integer ratios.
   * Hits on the dragon are further scaled by `dragonDamageTakenScale` (quantised to 1/1000).
   * Hits from the dragon are scaled after DEF by `dragonDamageDealtScale`.
   */
  readonly damage: {
    readonly sNum: number;
    readonly sDen: number;
    readonly k: number;
    readonly min: number;
    readonly dragonDamageTakenScale: number;
    readonly dragonDamageDealtScale: number;
  };
  /** Hitstop ticks (global freeze) by hit class; P thresholds in percent. */
  readonly hitstop: {
    readonly light: number;
    readonly multiHit: number;
    readonly normal: number;
    readonly heavy: number;
    readonly lightMaxPower: number;
    readonly heavyMinPower: number;
    readonly parry: number;
    readonly rageBonus: number;
    readonly weakPointBonus: number;
    readonly lastStand: number;
    readonly cap: number;
  };
  readonly wallSlamStun: number;
  readonly dashStale: { readonly window: number; readonly delay: number; readonly max: number };
  /** Half-angle (BAM) of the cone behind a fighter that counts as a backstab. */
  readonly backstabHalf: number;
  readonly passives: {
    readonly archerFirstStrikeBonus: number;
    readonly mageDefDivisor: number;
    /** Every Nth incoming damage instance on a ninja misses (deterministic counter). */
    readonly ninjaEvadeEvery: number;
    readonly berserkerRageNum: number;
    readonly berserkerRageDen: number;
    readonly lastStandIframes: number;
  };
  /** Duel fire ring centred on the arena, shrinking between `startTick` and `endTick`. */
  readonly ring: {
    readonly startTick: number;
    readonly endTick: number;
    readonly startRadius: number;
    readonly endRadius: number;
    readonly damage: number;
    readonly every: number;
    readonly push: number;
  };
  readonly jobs: Readonly<Record<JobId, JobKit>>;
  readonly moves: Readonly<Record<MoveId, MoveSpec>>;
  readonly dashes: Readonly<Record<DashId, DashSpec>>;
  readonly dragon: DragonRules;
}

const NO_ARMOR = { armorFrom: -1, armorTo: -1 } as const;

/** Every combat number lives here (decision sheet v1 §3; board passives come from the engine's DEFAULT_RULES). */
export const DEFAULT_COMBAT_RULES: CombatRules = deepFreeze({
  version: 'combat-5',
  tickHz: COMBAT_TICK_HZ,
  arena: { duel: { w: 800, h: 448 }, dragonFight: { w: 896, h: 448 } },
  duelGap: 480,
  timeLimit: { duel: 2700, dragonFight: 1800 },
  inputBuffer: 6,
  body: { hurtRadius: 12, bodyRadius: 14 },
  accelTicks: 4,
  stopTicks: 3,
  aimAssist: { half: 18, rangePct: 150 },
  damage: {
    sNum: 8,
    sDen: 5,
    k: 10,
    min: 1,
    dragonDamageTakenScale: 0.3,
    dragonDamageDealtScale: 0.6,
  },
  hitstop: {
    light: 3,
    multiHit: 2,
    normal: 5,
    heavy: 7,
    lightMaxPower: 80,
    heavyMinPower: 150,
    parry: 10,
    rageBonus: 2,
    weakPointBonus: 2,
    lastStand: 15,
    cap: 12,
  },
  wallSlamStun: 6,
  dashStale: { window: 60, delay: 3, max: 2 },
  backstabHalf: 43,
  passives: {
    archerFirstStrikeBonus: DEFAULT_RULES.passives.archerFirstStrikeBonus,
    mageDefDivisor: DEFAULT_RULES.passives.mageDefDivisor,
    ninjaEvadeEvery: DEFAULT_RULES.passives.ninjaEvadeDie,
    berserkerRageNum: DEFAULT_RULES.passives.berserkerRageNum,
    berserkerRageDen: DEFAULT_RULES.passives.berserkerRageDen,
    lastStandIframes: 60,
  },
  ring: {
    startTick: 1440,
    endTick: 2040,
    startRadius: 460,
    endRadius: 160,
    damage: 2,
    every: 30,
    push: 60,
  },
  jobs: {
    swordsman: {
      speed: 195,
      attack: 'slash1',
      skill: 'parry',
      skillCooldown: 240,
      skillCharges: 1,
      dash: 'dash',
      backstabPct: 100,
      poisePct: 100,
    },
    archer: {
      speed: 190,
      attack: 'draw',
      skill: 'volley',
      skillCooldown: 210,
      skillCharges: 1,
      dash: 'backstep',
      backstabPct: 100,
      poisePct: 100,
    },
    mage: {
      speed: 175,
      attack: 'bolt',
      skill: 'meteor',
      skillCooldown: 210,
      skillCharges: 1,
      dash: 'blink',
      backstabPct: 100,
      poisePct: 100,
    },
    ninja: {
      speed: 230,
      attack: 'dagger1',
      skill: 'kunai',
      skillCooldown: 90,
      skillCharges: 2,
      dash: 'shadowStep',
      backstabPct: 250,
      poisePct: 100,
    },
    berserker: {
      speed: 165,
      attack: 'greataxe',
      skill: 'whirlwind',
      skillCooldown: 240,
      skillCharges: 1,
      dash: 'shoulderCharge',
      backstabPct: 100,
      poisePct: 50,
    },
  },
  moves: {
    slash1: {
      type: 'melee',
      startup: 6,
      active: 3,
      recovery: 12,
      moveSpeedPct: 0,
      reach: 60,
      half: 39,
      hit: { power: 76, knockback: 20, hitstun: 14 },
      hits: 1,
      hitEvery: 3,
      lunge: 12,
      ...NO_ARMOR,
      next: 'slash2',
      chainFrom: 9,
      parry: 'counter',
    },
    slash2: {
      type: 'melee',
      startup: 5,
      active: 3,
      recovery: 12,
      moveSpeedPct: 0,
      reach: 60,
      half: 39,
      hit: { power: 76, knockback: 20, hitstun: 14 },
      hits: 1,
      hitEvery: 3,
      lunge: 12,
      ...NO_ARMOR,
      next: 'thrust',
      chainFrom: 8,
      parry: 'counter',
    },
    thrust: {
      type: 'melee',
      startup: 9,
      active: 4,
      recovery: 22,
      moveSpeedPct: 0,
      reach: 64,
      half: 28,
      hit: { power: 119, knockback: 64, hitstun: 22 },
      hits: 1,
      hitEvery: 4,
      lunge: 12,
      ...NO_ARMOR,
      next: null,
      chainFrom: 0,
      parry: 'counter',
    },
    parry: {
      type: 'parry',
      startup: 3,
      active: 18,
      recovery: 24,
      moveSpeedPct: 0,
      half: 128,
      counter: 'counter',
      reflectPower: 50,
      refundOnParry: false,
      stagger: 24,
    },
    counter: {
      type: 'melee',
      startup: 3,
      active: 3,
      recovery: 14,
      moveSpeedPct: 0,
      reach: 68,
      half: 43,
      hit: { power: 190, knockback: 64, hitstun: 22 },
      hits: 1,
      hitEvery: 3,
      lunge: 12,
      ...NO_ARMOR,
      next: null,
      chainFrom: 0,
      parry: 'counter',
    },
    draw: {
      type: 'draw',
      startup: 0,
      recovery: 0,
      moveSpeedPct: 50,
      quickAt: 8,
      fullAt: 40,
      quick: 'quickShot',
      full: 'fullShot',
    },
    quickShot: {
      type: 'shot',
      startup: 0,
      recovery: 10,
      moveSpeedPct: 0,
      count: 1,
      spread: 0,
      projectile: {
        speed: 720,
        radius: 4,
        range: 480,
        pierce: false,
        parryable: true,
        reflectable: true,
        homingPerTick: 0,
        homingMax: 0,
        hit: { power: 120, knockback: 10, hitstun: 8 },
        leadTicks: 12,
      },
    },
    fullShot: {
      type: 'shot',
      startup: 0,
      recovery: 14,
      moveSpeedPct: 0,
      count: 1,
      spread: 0,
      projectile: {
        speed: 960,
        radius: 5,
        range: 900,
        pierce: true,
        parryable: true,
        reflectable: true,
        homingPerTick: 0,
        homingMax: 0,
        hit: { power: 240, knockback: 40, hitstun: 10 },
        leadTicks: 12,
        cancelsProjectiles: true,
      },
    },
    volley: {
      type: 'shot',
      startup: 14,
      recovery: 12,
      moveSpeedPct: 0,
      count: 3,
      spread: 11,
      projectile: {
        speed: 720,
        radius: 4,
        range: 480,
        pierce: false,
        parryable: true,
        reflectable: true,
        homingPerTick: 0,
        homingMax: 0,
        hit: { power: 90, knockback: 10, hitstun: 8 },
      },
    },
    bolt: {
      type: 'shot',
      startup: 10,
      recovery: 14,
      moveSpeedPct: 0,
      count: 1,
      spread: 0,
      projectile: {
        speed: 480,
        radius: 8,
        range: 360,
        pierce: false,
        parryable: true,
        reflectable: false,
        homingPerTick: 1,
        homingMax: 14,
        hit: { power: 118, knockback: 8, hitstun: 4 },
      },
    },
    meteor: {
      type: 'rune',
      startup: 12,
      recovery: 10,
      moveSpeedPct: 0,
      distance: 192,
      assistRange: 288,
      radius: 56,
      arm: 18,
      active: 4,
      hit: { power: 270, knockback: 96, hitstun: 24 },
      holdTicks: 24,
      armorBreak: true,
    },
    dagger1: {
      type: 'melee',
      startup: 4,
      active: 2,
      recovery: 8,
      moveSpeedPct: 0,
      reach: 50,
      half: 32,
      hit: { power: 63, knockback: 16, hitstun: 12 },
      hits: 1,
      hitEvery: 2,
      lunge: 16,
      ...NO_ARMOR,
      next: 'dagger2',
      chainFrom: 6,
      parry: 'counter',
    },
    dagger2: {
      type: 'melee',
      startup: 4,
      active: 2,
      recovery: 8,
      moveSpeedPct: 0,
      reach: 50,
      half: 32,
      hit: { power: 63, knockback: 40, hitstun: 10 },
      hits: 1,
      hitEvery: 2,
      lunge: 16,
      ...NO_ARMOR,
      next: null,
      chainFrom: 0,
      parry: 'counter',
    },
    kunai: {
      type: 'shot',
      startup: 6,
      recovery: 8,
      moveSpeedPct: 0,
      count: 1,
      spread: 0,
      projectile: {
        speed: 900,
        radius: 4,
        range: 240,
        pierce: false,
        parryable: true,
        reflectable: true,
        homingPerTick: 0,
        homingMax: 0,
        hit: { power: 38, knockback: 8, hitstun: 6 },
      },
    },
    greataxe: {
      type: 'melee',
      startup: 14,
      active: 5,
      recovery: 20,
      moveSpeedPct: 0,
      reach: 72,
      half: 53,
      hit: { power: 213, knockback: 48, hitstun: 22 },
      hits: 1,
      hitEvery: 5,
      lunge: 8,
      armorFrom: 10,
      armorTo: 18,
      next: null,
      chainFrom: 0,
      parry: 'crush',
    },
    whirlwind: {
      type: 'melee',
      startup: 12,
      active: 30,
      recovery: 12,
      moveSpeedPct: 60,
      reach: 72,
      half: 128,
      hit: { power: 56, knockback: 20, hitstun: 12 },
      hits: 3,
      hitEvery: 10,
      lunge: 0,
      armorFrom: 0,
      armorTo: 41,
      next: null,
      chainFrom: 0,
      parry: 'crush',
    },
  },
  dashes: {
    dash: {
      ticks: 16,
      fastTicks: 8,
      fastSpeed: 12,
      slowSpeed: 4,
      iframeFrom: 1,
      iframeTo: 10,
      cancelFrom: 11,
      cooldown: 40,
      charges: 1,
      backward: false,
      superArmor: false,
      invisible: false,
      contact: null,
      contactReach: 0,
    },
    backstep: {
      ticks: 12,
      fastTicks: 8,
      fastSpeed: 12,
      slowSpeed: 4,
      iframeFrom: 1,
      iframeTo: 8,
      cancelFrom: 9,
      cooldown: 45,
      charges: 1,
      backward: true,
      superArmor: false,
      invisible: false,
      contact: null,
      contactReach: 0,
    },
    blink: {
      ticks: 4,
      fastTicks: 4,
      fastSpeed: 40,
      slowSpeed: 0,
      iframeFrom: 1,
      iframeTo: 8,
      cancelFrom: 0,
      cooldown: 56,
      charges: 1,
      backward: false,
      superArmor: false,
      invisible: true,
      contact: null,
      contactReach: 0,
    },
    shadowStep: {
      ticks: 14,
      fastTicks: 8,
      fastSpeed: 12,
      slowSpeed: 8,
      iframeFrom: 1,
      iframeTo: 10,
      cancelFrom: 11,
      cooldown: 50,
      charges: 2,
      backward: false,
      superArmor: false,
      invisible: false,
      contact: null,
      contactReach: 0,
    },
    shoulderCharge: {
      ticks: 18,
      fastTicks: 8,
      fastSpeed: 12,
      slowSpeed: 4.8,
      iframeFrom: 1,
      iframeTo: 4,
      cancelFrom: 0,
      cooldown: 45,
      charges: 1,
      backward: false,
      superArmor: true,
      invisible: false,
      contact: { power: 73, knockback: 64, hitstun: 16 },
      contactReach: 10,
    },
  },
  dragon: {
    hpMultiplier: 2.2,
    atkMultiplier: 1.1,
    body: [
      { dx: -48, dy: 0, r: 40 },
      { dx: 0, dy: 0, r: 40 },
      { dx: 48, dy: 0, r: 40 },
    ],
    head: { forward: 60, r: 28 },
    anchorY: 96,
    playerDistance: 320,
    driftSpeed: 60,
    returnSpeed: 240,
    idle: [
      [40, 70],
      [30, 55],
      [30, 55],
    ],
    firstIdle: 30,
    softEnrageTick: 1200,
    softEnrageIdleNum: 4,
    softEnrageIdleDen: 5,
    phase2Pct: 60,
    phase3Pct: 25,
    roarTicks: 60,
    postRoarIdle: 30,
    p2TelegraphPct: 88,
    p3RecoveryPct: 75,
    breathEvery: DEFAULT_RULES.dragon.breathEvery,
    weakPointNum: 3,
    weakPointDen: 2,
    bands: { frontHalf: 43, frontRange: 200, sideRange: 220 },
    weights: {
      front: { claw: 6, volley: 1, charge: 1, gust: 2, dive: 2 },
      side: { tail: 6, volley: 1, charge: 1, gust: 2, dive: 2 },
      far: { volley: 4, charge: 3, gust: 1, dive: 3 },
    },
    claw: {
      telegraph: 30,
      active: 6,
      recovery: 30,
      reach: 140,
      half: 43,
      hit: { power: 96, knockback: 64, hitstun: 18, hitstop: 6, parryable: true },
    },
    tail: {
      telegraph: 36,
      active: 8,
      recovery: 36,
      reach: 220,
      half: 78,
      hit: { power: 80, knockback: 96, hitstun: 22, hitstop: 6, parryable: true },
    },
    volley: {
      interval: 12,
      count: [3, 5, 5],
      arm: 42,
      blast: 6,
      radius: 44,
      recovery: 24,
      hit: { power: 80, knockback: 48, hitstun: 16, hitstop: 6, parryable: true },
      floorFromPhase: 2,
      floorTicks: 120,
      floorEvery: 15,
      floorPower: 16,
    },
    charge: {
      telegraph: 48,
      lockBefore: 18,
      halfWidth: 60,
      speed: 720,
      maxTicks: 90,
      stun: 90,
      hit: { power: 144, knockback: 128, hitstun: 26, hitstop: 8, parryable: false },
    },
    gust: { telegraph: 30, active: 60, push: 150, reach: 520 },
    breath: {
      telegraph: [48, 42, 36],
      active: 72,
      every: 12,
      reach: 360,
      half: 18,
      sweep: 21,
      recovery: 48,
      power: 32,
    },
    dive: {
      airborne: 60,
      lockBefore: 30,
      radius: 120,
      active: 6,
      recovery: 90,
      hit: { power: 160, knockback: 96, hitstun: 22, hitstop: 8, parryable: false },
    },
  },
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
