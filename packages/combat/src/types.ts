import type { JobId, RngState } from '@dragon-rush/engine';
import type { CombatRules, DashId, ManeuverId, MoveId } from './rules';

export type Side = 'a' | 'b';
export type CombatantId = Side | 'dragon';
export type CombatKind = 'duel' | 'dragonFight';

/** 0 = none, 1..8 = N, NE, E, SE, S, SW, W, NW (screen space, y grows downward). */
export type MoveDir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Per-tick input shared by keyboard, gamepad, network and AI. Buttons are levels; a press is the rising edge
 * (held -> not held -> held). Presses are buffered for `rules.inputBuffer` live ticks.
 */
export interface FighterInput {
  readonly move: MoveDir;
  readonly attack: boolean;
  readonly skill: boolean;
  readonly dash: boolean;
}

export const NO_INPUT: FighterInput = Object.freeze({ move: 0, attack: false, skill: false, dash: false });

export interface FighterSetup {
  readonly job: JobId;
  readonly hp: number;
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  /** Board 불굴 (Last Stand) still unused this game. */
  readonly indomitableAvailable: boolean;
}

export interface DragonSetup {
  readonly hp: number;
  readonly atk: number;
  readonly def: number;
}

/** a = arriver / challenger, b = defender (null in a dragon fight). */
export interface CombatSetup {
  readonly kind: CombatKind;
  readonly a: FighterSetup;
  readonly b: FighterSetup | null;
  readonly dragon?: DragonSetup;
}

/** Same shape as the board engine's real-time combat contract. hpB is null for the dragon. */
export interface CombatResult {
  readonly winner: Side;
  readonly hpA: number;
  readonly hpB: number | null;
  readonly indomitableUsedA?: boolean;
  readonly indomitableUsedB?: boolean;
  readonly timedOut?: boolean;
}

export type FighterMode = 'idle' | 'move' | 'attack' | 'skill' | 'dash' | 'hitstun' | 'ko';
export type MovePhase = 'startup' | 'active' | 'recovery' | 'none';

/** Button bits used in `FighterState.held`. */
export const BTN_ATTACK = 1;
export const BTN_SKILL = 2;
export const BTN_DASH = 4;

/**
 * Plain serialisable fighter state. Positions/velocities are Q8 (px * 256), angles BAM (0..255, 0 = east,
 * 64 = south), sizes in px, timers in ticks.
 */
export interface FighterState {
  readonly side: Side;
  readonly job: JobId;
  readonly x: number;
  readonly y: number;
  /** Locomotion velocity, Q8 per tick. */
  readonly vx: number;
  readonly vy: number;
  /** Knockback: initial velocity (Q8/tick) decaying linearly over `kbTotal` ticks; `kbLeft` remain. */
  readonly kbx: number;
  readonly kby: number;
  readonly kbLeft: number;
  readonly kbTotal: number;
  /** Last non-zero move direction (multiple of 32). */
  readonly facing: number;
  /** Aim of the current move (facing or aim-assisted exact angle). */
  readonly aim: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly mode: FighterMode;
  /** Current attack/skill move or dash id. */
  readonly move: MoveId | DashId | null;
  readonly moveTick: number;
  readonly phase: MovePhase;
  /** Bit i set = hit window i of the current move already connected. */
  readonly moveHits: number;
  readonly hitstun: number;
  readonly wallSlammed: boolean;
  /** Invulnerability: starts after `iframeDelay` ticks and lasts `iframes` ticks. */
  readonly iframes: number;
  readonly iframeDelay: number;
  readonly invisible: boolean;
  readonly superArmor: boolean;
  readonly skillCharges: number;
  readonly skillTimer: number;
  readonly dashCharges: number;
  readonly dashTimer: number;
  readonly dashStale: number;
  readonly sinceDash: number;
  /** Buffered presses: live ticks left (0 = none). */
  readonly bufAttack: number;
  readonly bufSkill: number;
  readonly bufDash: number;
  /** Buttons held on the previous tick (BTN_* bits) for edge detection. */
  readonly held: number;
  readonly moveInput: MoveDir;
  /** Archer: ticks drawn, whether the button was released, and the First Strike nocked arrow. */
  readonly drawTicks: number;
  readonly drawReleased: boolean;
  readonly nocked: boolean;
  readonly lastStandAvailable: boolean;
  readonly lastStandUsed: boolean;
  readonly firstStrikePending: boolean;
  /** Ninja: damage instances counted toward the next guaranteed evade (0..ninjaEvadeEvery-1). */
  readonly evadeCounter: number;
  readonly raging: boolean;
  readonly ringTimer: number;
}

/** Entity ids are `tick * 256 + owner * 64 + slot` so they survive rollback re-simulation unchanged. */
export interface ProjectileState {
  readonly id: number;
  readonly owner: CombatantId;
  readonly kind: MoveId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  /** Q8 per tick. */
  readonly speed: number;
  readonly radius: number;
  readonly ttl: number;
  readonly power: number;
  /** Attacker's effective ATK as a ratio, captured on release. */
  readonly atkNum: number;
  readonly atkDen: number;
  readonly defDiv: number;
  readonly pierce: boolean;
  /** Bit per target already hit (1 = a, 2 = b, 4 = dragon). */
  readonly hitMask: number;
  readonly knockback: number;
  readonly hitstun: number;
  readonly homingLeft: number;
  readonly homingPerTick: number;
  readonly rage: boolean;
  readonly reflected: boolean;
}

export type ZoneKind = 'meteor' | 'fireball' | 'burningFloor';

/** Ground hazard: telegraphed for `arm` ticks, then active for `active` ticks. */
export interface ZoneState {
  readonly id: number;
  readonly owner: CombatantId;
  readonly kind: ZoneKind;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly arm: number;
  readonly active: number;
  /** > 0: damage every `every` active ticks (damage over time); 0 = one hit per target. */
  readonly every: number;
  readonly power: number;
  readonly atkNum: number;
  readonly atkDen: number;
  readonly defDiv: number;
  readonly knockback: number;
  readonly hitstun: number;
  readonly hitstop: number;
  readonly parryable: boolean;
  readonly hitMask: number;
  readonly age: number;
}

/** Hazard shapes. Positions Q8 in state, px in events; sizes always px; angles BAM. */
export type Shape =
  | { readonly kind: 'circle'; readonly x: number; readonly y: number; readonly r: number }
  | { readonly kind: 'arc'; readonly x: number; readonly y: number; readonly r: number; readonly dir: number; readonly half: number }
  | {
      readonly kind: 'line';
      readonly x: number;
      readonly y: number;
      readonly dir: number;
      readonly length: number;
      readonly halfWidth: number;
    };

export type DragonStage = 'idle' | 'telegraph' | 'active' | 'recovery' | 'stunned' | 'returning' | 'roar';

export interface DragonState {
  readonly x: number;
  readonly y: number;
  readonly facing: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly phase: 1 | 2 | 3;
  readonly stage: DragonStage;
  readonly stageTick: number;
  readonly stageLen: number;
  readonly maneuver: ManeuverId | null;
  readonly aim: number;
  /** Locked target point (charge end, dive shadow), Q8. */
  readonly tx: number;
  readonly ty: number;
  /** Damaging maneuvers since the last Breath. */
  readonly sinceBreath: number;
  /** Ticks the head stays lowered (×1.5 weak point). */
  readonly headLowered: number;
  readonly airborne: boolean;
  readonly invulnerable: boolean;
  readonly hitMask: number;
  readonly volleyLeft: number;
  readonly queued: ManeuverId | null;
  /** Current maneuver telegraph (Q8 positions) and its id, null when none. */
  readonly telegraph: Shape | null;
  readonly telegraphId: number;
  readonly softEnraged: boolean;
}

export interface CombatOutcome {
  readonly winner: Side;
  readonly timedOut: boolean;
  readonly tick: number;
}

export interface CombatState {
  readonly kind: CombatKind;
  readonly rules: CombatRules;
  /** Ticks simulated so far (tick 0 = "싸워라!"). */
  readonly tick: number;
  readonly timeLimit: number;
  readonly arenaW: number;
  readonly arenaH: number;
  readonly rng: RngState;
  readonly a: FighterState;
  readonly b: FighterState | null;
  readonly dragon: DragonState | null;
  readonly projectiles: readonly ProjectileState[];
  readonly zones: readonly ZoneState[];
  /** Global freeze ticks left (both fighters, projectiles and zones stop). */
  readonly hitstop: number;
  /** Duel fire ring radius (px); 0 in dragon fights. */
  readonly ringRadius: number;
  readonly outcome: CombatOutcome | null;
}

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export type HitKind = MoveId | DashId | ManeuverId | 'fireball' | 'burningFloor' | 'ring';

/** Events carry results and positions (px) so renderers, FX and SFX never recompute rules. */
export type CombatEventBody =
  | { readonly type: 'AttackStart'; readonly who: Side; readonly move: MoveId; readonly dir: number; readonly pos: Vec }
  | { readonly type: 'SkillUsed'; readonly who: Side; readonly skill: MoveId; readonly dir: number; readonly pos: Vec }
  | { readonly type: 'Dash'; readonly who: Side; readonly dash: DashId; readonly dir: number; readonly pos: Vec }
  | {
      readonly type: 'ProjectileSpawn';
      /** Projectile entity id (stable across re-simulation: derived from tick, owner and slot). */
      readonly entity: number;
      readonly owner: CombatantId;
      readonly kind: MoveId;
      readonly pos: Vec;
      /** px per tick */
      readonly vel: Vec;
      readonly radius: number;
    }
  | {
      readonly type: 'ProjectileEnd';
      readonly entity: number;
      readonly reason: 'hit' | 'wall' | 'expired' | 'cleared' | 'parried';
      readonly pos: Vec;
    }
  | {
      readonly type: 'Hit';
      readonly attacker: CombatantId | 'ring';
      readonly target: CombatantId;
      readonly dmg: number;
      readonly kind: HitKind;
      /** Knockback / impact direction (BAM). */
      readonly dir: number;
      readonly pos: Vec;
      readonly hpAfter: number;
      readonly knockback: number;
      readonly hitstun: number;
      readonly hitstop: number;
      readonly weakPoint: boolean;
      readonly firstStrike: boolean;
      readonly rage: boolean;
      readonly pierce: boolean;
    }
  | { readonly type: 'Parry'; readonly who: Side; readonly attacker: CombatantId; readonly kind: HitKind; readonly pos: Vec; readonly reflected: boolean }
  | { readonly type: 'Evade'; readonly who: Side; readonly attacker: CombatantId | 'ring'; readonly kind: HitKind; readonly pos: Vec }
  | { readonly type: 'LastStand'; readonly who: Side; readonly pos: Vec }
  | { readonly type: 'RageOn'; readonly who: Side }
  | {
      readonly type: 'TelegraphStart';
      /** Hazard entity id (zone id or the dragon's telegraphId). */
      readonly entity: number;
      readonly kind: ManeuverId | 'meteor' | 'fireball';
      readonly shape: Shape;
      /** Ticks until the hazard turns active. */
      readonly ticks: number;
    }
  | {
      readonly type: 'TelegraphEnd';
      readonly entity: number;
      readonly kind: ManeuverId | 'meteor' | 'fireball';
      readonly shape: Shape;
      /** Active ticks that follow (0 when cancelled). */
      readonly ticks: number;
    }
  | { readonly type: 'WallSlam'; readonly who: CombatantId; readonly pos: Vec }
  | { readonly type: 'PhaseChange'; readonly phase: 2 | 3 }
  | { readonly type: 'BreathTick'; readonly shape: Shape; readonly hit: boolean }
  | { readonly type: 'KO'; readonly who: CombatantId; readonly pos: Vec }
  | { readonly type: 'TimeUp' }
  | { readonly type: 'FightEnded'; readonly result: CombatResult };

/**
 * A sim event. `id` is `${tick}:${type}:${key}` built only from the tick, the actor and the move/entity, so a
 * rollback client can dedupe events re-emitted while re-simulating the same ticks.
 */
export type CombatEvent = CombatEventBody & { readonly id: string; readonly tick: number };
