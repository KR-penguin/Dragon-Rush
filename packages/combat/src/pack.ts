import { JOB_IDS } from '@dragon-rush/engine';
import {
  DEFAULT_COMBAT_RULES,
  type CombatRules,
  type DashId,
  type ManeuverId,
  type MoveId,
} from './rules';
import type {
  CombatState,
  DragonState,
  FighterState,
  ProjectileState,
  Shape,
  ZoneState,
} from './types';

/**
 * Canonical packing of a CombatState into a flat array of integers, in an explicit field order (never object
 * key order). Used for the FNV-1a state hash (desync checks, golden replays) and as a compact JSON-safe
 * snapshot. Rules are not packed: pass the same rules to deserialize, compare `hashCombatRules` to check.
 */
export const COMBAT_PACK_VERSION = 1;

type Codec = 'int' | 'bool' | readonly (string | null)[];

const SIDES = ['a', 'b'] as const;
const OWNERS = ['a', 'b', 'dragon'] as const;
const MODES = ['idle', 'move', 'attack', 'skill', 'dash', 'hitstun', 'ko'] as const;
const PHASES = ['startup', 'active', 'recovery', 'none'] as const;
const MOVE_IDS: readonly MoveId[] = [
  'slash1',
  'slash2',
  'thrust',
  'parry',
  'counter',
  'draw',
  'quickShot',
  'fullShot',
  'volley',
  'bolt',
  'meteor',
  'dagger1',
  'dagger2',
  'kunai',
  'greataxe',
  'whirlwind',
];
const DASH_IDS: readonly DashId[] = ['dash', 'backstep', 'blink', 'shadowStep', 'shoulderCharge'];
const ANY_MOVE: readonly (string | null)[] = [null, ...MOVE_IDS, ...DASH_IDS];
const MANEUVERS: readonly (ManeuverId | null)[] = [
  null,
  'claw',
  'tail',
  'volley',
  'charge',
  'gust',
  'breath',
  'dive',
];
const STAGES = ['idle', 'telegraph', 'active', 'recovery', 'stunned', 'returning', 'roar'] as const;
const ZONE_KINDS = ['meteor', 'fireball', 'burningFloor'] as const;
const SHAPE_KINDS = ['circle', 'arc', 'line'] as const;

const FIGHTER: readonly (readonly [keyof FighterState, Codec])[] = [
  ['side', SIDES],
  ['job', JOB_IDS],
  ['x', 'int'],
  ['y', 'int'],
  ['vx', 'int'],
  ['vy', 'int'],
  ['kbx', 'int'],
  ['kby', 'int'],
  ['kbLeft', 'int'],
  ['kbTotal', 'int'],
  ['facing', 'int'],
  ['aim', 'int'],
  ['hp', 'int'],
  ['maxHp', 'int'],
  ['atk', 'int'],
  ['def', 'int'],
  ['mode', MODES],
  ['move', ANY_MOVE],
  ['moveTick', 'int'],
  ['phase', PHASES],
  ['moveHits', 'int'],
  ['hitstun', 'int'],
  ['wallSlammed', 'bool'],
  ['iframes', 'int'],
  ['iframeDelay', 'int'],
  ['invisible', 'bool'],
  ['superArmor', 'bool'],
  ['skillCharges', 'int'],
  ['skillTimer', 'int'],
  ['dashCharges', 'int'],
  ['dashTimer', 'int'],
  ['dashStale', 'int'],
  ['sinceDash', 'int'],
  ['bufAttack', 'int'],
  ['bufSkill', 'int'],
  ['bufDash', 'int'],
  ['held', 'int'],
  ['moveInput', 'int'],
  ['drawTicks', 'int'],
  ['drawReleased', 'bool'],
  ['nocked', 'bool'],
  ['lastStandAvailable', 'bool'],
  ['lastStandUsed', 'bool'],
  ['firstStrikePending', 'bool'],
  ['evadeCounter', 'int'],
  ['raging', 'bool'],
  ['ringTimer', 'int'],
];

const DRAGON: readonly (readonly [Exclude<keyof DragonState, 'telegraph'>, Codec])[] = [
  ['x', 'int'],
  ['y', 'int'],
  ['facing', 'int'],
  ['hp', 'int'],
  ['maxHp', 'int'],
  ['atk', 'int'],
  ['def', 'int'],
  ['phase', 'int'],
  ['stage', STAGES],
  ['stageTick', 'int'],
  ['stageLen', 'int'],
  ['maneuver', MANEUVERS],
  ['aim', 'int'],
  ['tx', 'int'],
  ['ty', 'int'],
  ['sinceBreath', 'int'],
  ['headLowered', 'int'],
  ['airborne', 'bool'],
  ['invulnerable', 'bool'],
  ['hitMask', 'int'],
  ['volleyLeft', 'int'],
  ['queued', MANEUVERS],
  ['telegraphId', 'int'],
  ['softEnraged', 'bool'],
  ['chip', 'int'],
];

const PROJECTILE: readonly (readonly [keyof ProjectileState, Codec])[] = [
  ['id', 'int'],
  ['owner', OWNERS],
  ['kind', MOVE_IDS],
  ['x', 'int'],
  ['y', 'int'],
  ['vx', 'int'],
  ['vy', 'int'],
  ['angle', 'int'],
  ['speed', 'int'],
  ['radius', 'int'],
  ['ttl', 'int'],
  ['power', 'int'],
  ['atkNum', 'int'],
  ['atkDen', 'int'],
  ['defDiv', 'int'],
  ['pierce', 'bool'],
  ['hitMask', 'int'],
  ['knockback', 'int'],
  ['hitstun', 'int'],
  ['homingLeft', 'int'],
  ['homingPerTick', 'int'],
  ['rage', 'bool'],
  ['reflected', 'bool'],
];

const ZONE: readonly (readonly [keyof ZoneState, Codec])[] = [
  ['id', 'int'],
  ['owner', OWNERS],
  ['kind', ZONE_KINDS],
  ['x', 'int'],
  ['y', 'int'],
  ['radius', 'int'],
  ['arm', 'int'],
  ['active', 'int'],
  ['every', 'int'],
  ['power', 'int'],
  ['atkNum', 'int'],
  ['atkDen', 'int'],
  ['defDiv', 'int'],
  ['knockback', 'int'],
  ['hitstun', 'int'],
  ['hitstop', 'int'],
  ['parryable', 'bool'],
  ['hitMask', 'int'],
  ['age', 'int'],
];

function enc(v: unknown, codec: Codec): number {
  if (codec === 'int') return v as number;
  if (codec === 'bool') return v === true ? 1 : 0;
  const i = codec.indexOf(v as string | null);
  if (i < 0) throw new RangeError(`cannot pack value ${String(v)}`);
  return i;
}

function dec(n: number, codec: Codec): unknown {
  if (codec === 'int') return n;
  if (codec === 'bool') return n === 1;
  if (n < 0 || n >= codec.length) throw new RangeError(`bad packed code ${n}`);
  return codec[n];
}

function packFields<T>(
  out: number[],
  obj: T,
  fields: readonly (readonly [keyof T, Codec])[],
): void {
  for (const [k, codec] of fields) out.push(enc(obj[k], codec));
}

function packShape(out: number[], sh: Shape | null): void {
  if (!sh) {
    out.push(0, 0, 0, 0, 0, 0, 0);
    return;
  }
  const kind = SHAPE_KINDS.indexOf(sh.kind) + 1;
  if (sh.kind === 'circle') out.push(kind, sh.x, sh.y, sh.r, 0, 0, 0);
  else if (sh.kind === 'arc') out.push(kind, sh.x, sh.y, sh.r, sh.dir, sh.half, 0);
  else out.push(kind, sh.x, sh.y, sh.dir, sh.length, sh.halfWidth, 0);
}

/** Flat integer array of the full state (JSON-safe). */
export function serializeCombatState(s: CombatState): number[] {
  const out: number[] = [
    COMBAT_PACK_VERSION,
    s.kind === 'duel' ? 0 : 1,
    s.tick,
    s.timeLimit,
    s.arenaW,
    s.arenaH,
    s.rng.a,
    s.rng.b,
    s.rng.c,
    s.rng.d,
    s.hitstop,
    s.ringRadius,
  ];
  if (s.outcome)
    out.push(1, SIDES.indexOf(s.outcome.winner), s.outcome.timedOut ? 1 : 0, s.outcome.tick);
  else out.push(0, 0, 0, 0);
  packFields(out, s.a, FIGHTER);
  out.push(s.b ? 1 : 0);
  if (s.b) packFields(out, s.b, FIGHTER);
  out.push(s.dragon ? 1 : 0);
  if (s.dragon) {
    packFields(out, s.dragon, DRAGON);
    packShape(out, s.dragon.telegraph);
  }
  out.push(s.projectiles.length);
  for (const p of s.projectiles) packFields(out, p, PROJECTILE);
  out.push(s.zones.length);
  for (const z of s.zones) packFields(out, z, ZONE);
  return out;
}

class Reader {
  private i = 0;
  constructor(private readonly a: readonly number[]) {}
  next(): number {
    const v = this.a[this.i++];
    if (v === undefined) throw new RangeError('truncated combat snapshot');
    return v;
  }
  done(): boolean {
    return this.i === this.a.length;
  }
}

function unpackFields<T>(rd: Reader, fields: readonly (readonly [keyof T, Codec])[]): T {
  const o: Record<string, unknown> = {};
  for (const [k, codec] of fields) o[k as string] = dec(rd.next(), codec);
  return o as T;
}

function unpackShape(rd: Reader): Shape | null {
  const kind = rd.next();
  const v = [rd.next(), rd.next(), rd.next(), rd.next(), rd.next(), rd.next()] as const;
  if (kind === 0) return null;
  const x = v[0];
  const y = v[1];
  switch (SHAPE_KINDS[kind - 1]) {
    case 'circle':
      return { kind: 'circle', x, y, r: v[2] };
    case 'arc':
      return { kind: 'arc', x, y, r: v[2], dir: v[3], half: v[4] };
    case 'line':
      return { kind: 'line', x, y, dir: v[2], length: v[3], halfWidth: v[4] };
    default:
      throw new RangeError(`bad shape kind ${kind}`);
  }
}

/** Inverse of serializeCombatState; `rules` must be the rules the state was created with. */
export function deserializeCombatState(
  data: readonly number[],
  rules: CombatRules = DEFAULT_COMBAT_RULES,
): CombatState {
  const rd = new Reader(data);
  if (rd.next() !== COMBAT_PACK_VERSION)
    throw new RangeError('unsupported combat snapshot version');
  const kind = rd.next() === 0 ? 'duel' : 'dragonFight';
  const tick = rd.next();
  const timeLimit = rd.next();
  const arenaW = rd.next();
  const arenaH = rd.next();
  const rng = { a: rd.next(), b: rd.next(), c: rd.next(), d: rd.next() };
  const hitstop = rd.next();
  const ringRadius = rd.next();
  const hasOutcome = rd.next();
  const winner = SIDES[rd.next()] ?? 'a';
  const timedOut = rd.next() === 1;
  const outTick = rd.next();
  const a = unpackFields<FighterState>(rd, FIGHTER);
  const b = rd.next() === 1 ? unpackFields<FighterState>(rd, FIGHTER) : null;
  let dragon: DragonState | null = null;
  if (rd.next() === 1) {
    const d = unpackFields<Omit<DragonState, 'telegraph'>>(rd, DRAGON);
    dragon = { ...d, telegraph: unpackShape(rd) };
  }
  const projectiles: ProjectileState[] = [];
  for (let n = rd.next(); n > 0; n--)
    projectiles.push(unpackFields<ProjectileState>(rd, PROJECTILE));
  const zones: ZoneState[] = [];
  for (let n = rd.next(); n > 0; n--) zones.push(unpackFields<ZoneState>(rd, ZONE));
  if (!rd.done()) throw new RangeError('trailing data in combat snapshot');
  return {
    kind,
    rules,
    tick,
    timeLimit,
    arenaW,
    arenaH,
    rng,
    a,
    b,
    dragon,
    projectiles,
    zones,
    hitstop,
    ringRadius,
    outcome: hasOutcome === 1 ? { winner, timedOut, tick: outTick } : null,
  };
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(words: readonly number[]): number {
  let h = FNV_OFFSET;
  for (const w of words) {
    const v = w | 0;
    h = Math.imul(h ^ (v & 0xff), FNV_PRIME);
    h = Math.imul(h ^ ((v >>> 8) & 0xff), FNV_PRIME);
    h = Math.imul(h ^ ((v >>> 16) & 0xff), FNV_PRIME);
    h = Math.imul(h ^ (v >>> 24), FNV_PRIME);
  }
  return h >>> 0;
}

/** FNV-1a (32-bit) over the canonical packing: identical across engines for identical states. */
export function hashCombatState(s: CombatState): number {
  return fnv1a(serializeCombatState(s));
}

/** FNV-1a over the rules' JSON (for env `combat_rules_hash` / version checks). */
export function hashCombatRules(rules: CombatRules): number {
  const json = JSON.stringify(rules);
  const words: number[] = [];
  for (let i = 0; i < json.length; i++) words.push(json.charCodeAt(i));
  return fnv1a(words);
}
