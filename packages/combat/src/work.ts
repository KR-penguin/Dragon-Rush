import type { CombatRules } from './rules';
import type {
  CombatantId,
  CombatEvent,
  CombatEventBody,
  CombatState,
  DragonState,
  FighterState,
  ProjectileState,
  Shape,
  Side,
  Vec,
  ZoneState,
} from './types';
import { Q } from './math';

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };
export type MFighter = Mutable<FighterState>;
export type MDragon = Mutable<DragonState>;
export type MProjectile = Mutable<ProjectileState>;
export type MZone = Mutable<ZoneState>;

/** Copy-on-write working copy of a CombatState: every entity is a fresh object the step may edit. */
export interface WState extends Omit<
  Mutable<CombatState>,
  'a' | 'b' | 'dragon' | 'projectiles' | 'zones'
> {
  a: MFighter;
  b: MFighter | null;
  dragon: MDragon | null;
  projectiles: MProjectile[];
  zones: MZone[];
}

/** Step context: the working copy, its rules, and the events emitted this tick. */
export interface Ctx {
  readonly s: WState;
  readonly r: CombatRules;
  readonly ev: CombatEvent[];
  /** Set by a dragon phase change: projectiles and zones are cleared at the end of the tick. */
  clearHazards: boolean;
}

/** Fresh copies of every entity; immutable leaves (rules, rng, shapes) are shared. */
export function cloneWorking(s: CombatState): WState {
  const projectiles: MProjectile[] = [];
  for (const p of s.projectiles) projectiles.push({ ...p });
  const zones: MZone[] = [];
  for (const z of s.zones) zones.push({ ...z });
  return {
    ...s,
    a: { ...s.a },
    b: s.b ? { ...s.b } : null,
    dragon: s.dragon ? { ...s.dragon } : null,
    projectiles,
    zones,
  };
}

/** Pushes an event with its rollback-stable id `${tick}:${type}:${key}`. */
export function emit(c: Ctx, key: string, body: CombatEventBody): void {
  const tick = c.s.tick;
  c.ev.push({ ...body, id: `${tick}:${body.type}:${key}`, tick });
}

export const OWNER_CODE: Readonly<Record<CombatantId, number>> = { a: 0, b: 1, dragon: 2 };

/** Entity slot kinds (8 slots each) inside one owner's id block. */
export const SLOT_SHOT = 0;
export const SLOT_METEOR = 8;
export const SLOT_FIREBALL = 16;
export const SLOT_FLOOR = 24;
export const SLOT_TELEGRAPH = 32;

/** Stable entity id: depends only on the tick, the owner and the slot, never on how many entities exist. */
export function entityId(tick: number, owner: CombatantId, slot: number): number {
  return tick * 256 + OWNER_CODE[owner] * 64 + slot;
}

export function pos(x: number, y: number): Vec {
  return { x: x / Q, y: y / Q };
}

/** Converts a Q8-positioned shape to px for events. */
export function shapePx(sh: Shape): Shape {
  return { ...sh, x: sh.x / Q, y: sh.y / Q };
}

export function fighterOf(s: WState, side: Side): MFighter | null {
  return side === 'a' ? s.a : s.b;
}

export const otherSide = (side: Side): Side => (side === 'a' ? 'b' : 'a');
