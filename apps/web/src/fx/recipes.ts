import { KO_STOP } from './core/time';
import { scaled } from './timing';
import type { FxAnchor, FxCue } from './types';

/**
 * Reusable effect recipes (pure cue lists, no sound): the board event mapping and the arena API
 * build on the same numbers. Trauma values follow the decision sheet table §2.3.
 */
export const TRAUMA = {
  diceLand: 0.32,
  teleport: 0.35,
  badTile: 0.45,
  challenge: 0.55,
  elimination: 0.63,
  lightHit: 0.2,
  heavyHit: 0.35,
  parry: 0.4,
  hostileHit: 0.5,
  lastStand: 0.55,
  ko: 0.85,
  dragonDeath: 1,
} as const;

/** Board hit-stop for dice-resolved hits: 40–90 ms by strength. */
export const hitStopMs = (strength: number): number =>
  Math.round(40 + 50 * Math.min(1, Math.max(0, strength)));

/** 0..1 impact strength from damage relative to the defender (a 30%-of-max-HP hit is full strength). */
export function hitStrength(damage: number, maxHp: number): number {
  if (damage <= 0) return 0;
  const s = damage / Math.max(8, maxHp * 0.3);
  return Math.min(1, Math.max(0.15, s));
}

export interface HitRecipe {
  readonly at: FxAnchor;
  readonly damage: number;
  readonly strength: number;
  /** Forces heavy treatment (finishers, charged shots); otherwise strength ≥ 0.5. */
  readonly heavy?: boolean;
  /** Dragon-on-player: heavier trauma and a heavy number. */
  readonly hostile?: boolean;
  readonly evaded?: boolean;
  readonly parried?: boolean;
  readonly breath?: boolean;
  /** Spark cone direction in radians (away from the attacker); omit for a full ring. */
  readonly angle?: number;
  /** Merge key for damage numbers. */
  readonly target?: string;
  /** A locally controlled fighter was hurt: red edge vignette. */
  readonly mine?: boolean;
  readonly speed?: number;
}

export function hitCues(h: HitRecipe): FxCue[] {
  const speed = h.speed ?? 1;
  const target = h.target;
  if (h.evaded) return [{ type: 'text', kind: 'evade', text: '회피', at: h.at, target }];
  if (h.parried) {
    return [
      { type: 'hitStop', ms: scaled(167, speed) },
      { type: 'shake', trauma: TRAUMA.parry },
      {
        type: 'burst',
        preset: 'sparkParry',
        at: h.at,
        angle: h.angle,
        spread: h.angle === undefined ? Math.PI * 2 : undefined,
      },
      { type: 'ring', preset: 'light', at: h.at, color: '#8FB3D9' },
      { type: 'text', kind: 'parry', text: '패링', at: h.at, target },
    ];
  }
  if (h.damage <= 0) return [{ type: 'text', kind: 'evade', text: 'MISS', at: h.at, target }];
  const heavy = h.heavy ?? h.strength >= 0.5;
  const cues: FxCue[] = [
    { type: 'hitStop', ms: scaled(hitStopMs(h.strength), speed) },
    {
      type: 'shake',
      trauma: h.hostile ? TRAUMA.hostileHit : heavy ? TRAUMA.heavyHit : TRAUMA.lightHit,
    },
    {
      type: 'burst',
      preset: heavy ? 'sparkHeavy' : 'sparkLight',
      at: h.at,
      angle: h.angle,
      spread: h.angle === undefined ? Math.PI * 2 : undefined,
    },
    { type: 'ring', preset: heavy ? 'heavy' : 'light', at: h.at, color: '#FFF6E0' },
    { type: 'punch', at: h.at, kind: 'press' },
    {
      type: 'text',
      kind: heavy || h.hostile ? 'heavy' : 'damage',
      value: h.damage,
      at: h.at,
      target,
    },
  ];
  if (h.breath) cues.push({ type: 'burst', preset: 'embers', at: h.at, amount: 1.2 });
  if (heavy && h.strength >= 0.6)
    cues.push({ type: 'flash', tone: 'white', alpha: 0.12 + 0.18 * h.strength, ms: 60 });
  if (h.strength >= 0.8) cues.push({ type: 'duck' });
  if (h.mine)
    cues.push({ type: 'vignette', tone: 'red', strength: 0.35 + 0.4 * h.strength, ms: 600 });
  return cues;
}

export function deathCues(o: {
  readonly at: FxAnchor;
  readonly speed?: number;
  readonly mine?: boolean;
}): FxCue[] {
  const speed = o.speed ?? 1;
  return [
    { type: 'shake', trauma: TRAUMA.elimination },
    {
      type: 'bossStop',
      freezeMs: scaled(KO_STOP.freezeMs, speed),
      slowFactor: KO_STOP.slowFactor,
      slowMs: scaled(KO_STOP.slowMs, speed),
      rampMs: scaled(KO_STOP.rampMs, speed),
    },
    { type: 'burst', preset: 'smokeKo', at: o.at },
    { type: 'text', kind: 'ko', text: '탈락', at: o.at },
    { type: 'vignette', tone: o.mine ? 'red' : 'dark', strength: 0.6, ms: 1100 },
    { type: 'duck' },
  ];
}

export function coinGainCues(o: {
  readonly from: FxAnchor;
  readonly to: FxAnchor;
  readonly coins: number;
  readonly delayMs?: number;
}): FxCue[] {
  if (o.coins <= 0) return [];
  return [
    { type: 'coins', from: o.from, to: o.to, coins: o.coins, delayMs: o.delayMs },
    { type: 'text', kind: 'coin', value: o.coins, at: o.from, delayMs: o.delayMs },
  ];
}

export function coinLossCues(o: {
  readonly at: FxAnchor;
  readonly coins: number;
  readonly purse?: FxAnchor;
}): FxCue[] {
  if (o.coins <= 0) return [];
  const purse = o.purse ?? o.at;
  return [
    { type: 'text', kind: 'loss', value: o.coins, at: o.at },
    { type: 'burst', preset: 'coinDrop', at: purse, amount: Math.min(2, 0.4 + o.coins / 8) },
    { type: 'punch', at: purse, kind: 'wobble' },
  ];
}

export function healCues(o: {
  readonly at: FxAnchor;
  readonly amount: number;
  readonly delayMs?: number;
}): FxCue[] {
  if (o.amount <= 0) return [];
  return [
    { type: 'burst', preset: 'heal', at: o.at, delayMs: o.delayMs },
    { type: 'text', kind: 'heal', value: o.amount, at: o.at, delayMs: o.delayMs },
  ];
}

export function magicCues(at: FxAnchor, amount = 1, color = '#B38CFF'): FxCue[] {
  return [
    { type: 'burst', preset: 'magic', at, amount },
    { type: 'ring', preset: 'light', at, color },
  ];
}

/** Victory: two confetti cannons from the bottom corners (~150 pieces) and a gold flash. */
export function victoryCues(): FxCue[] {
  return [
    {
      type: 'burst',
      preset: 'confetti',
      at: { kind: 'screen', at: 'bottomLeft' },
      angle: -Math.PI / 2 + 0.45,
    },
    {
      type: 'burst',
      preset: 'confetti',
      at: { kind: 'screen', at: 'bottomRight' },
      angle: -Math.PI / 2 - 0.45,
    },
    { type: 'flash', tone: 'gold', alpha: 0.22, ms: 80 },
    { type: 'shake', trauma: 0.3 },
  ];
}

export type ArenaHitKind = 'light' | 'heavy' | 'parry' | 'hostile';

export interface ArenaHitRecipe {
  readonly at: FxAnchor;
  readonly damage: number;
  readonly kind: ArenaHitKind;
  /** Attack direction; sparks fly along it. */
  readonly angle?: number;
  readonly target?: string;
  readonly evaded?: boolean;
  readonly breath?: boolean;
  readonly mine?: boolean;
}

/**
 * Arena hit (decision sheet §2.2/§2.3). No hit-stop (the sim owns it) and no full-screen flash
 * (the renderer flashes the sprite): trauma, sparks, ring and the number only.
 */
export function arenaHitCues(h: ArenaHitRecipe): FxCue[] {
  if (h.evaded) return [{ type: 'text', kind: 'evade', text: '회피', at: h.at, target: h.target }];
  const trauma =
    h.kind === 'hostile'
      ? TRAUMA.hostileHit
      : h.kind === 'parry'
        ? TRAUMA.parry
        : h.kind === 'heavy'
          ? TRAUMA.heavyHit
          : TRAUMA.lightHit;
  const heavy = h.kind !== 'light';
  const cues: FxCue[] = [
    { type: 'shake', trauma },
    {
      type: 'burst',
      preset: h.kind === 'parry' ? 'sparkParry' : heavy ? 'sparkHeavy' : 'sparkLight',
      at: h.at,
      angle: h.angle,
      spread: h.angle === undefined ? Math.PI * 2 : undefined,
    },
    {
      type: 'ring',
      preset: heavy ? 'heavy' : 'light',
      at: h.at,
      color: h.kind === 'parry' ? '#8FB3D9' : '#FFF6E0',
    },
  ];
  if (h.kind === 'parry')
    cues.push({ type: 'text', kind: 'parry', text: '패링', at: h.at, target: h.target });
  else if (h.damage > 0) {
    cues.push({
      type: 'text',
      kind: heavy ? 'heavy' : 'damage',
      value: h.damage,
      at: h.at,
      target: h.target,
    });
  }
  if (h.breath) cues.push({ type: 'burst', preset: 'embers', at: h.at, amount: 0.6 });
  if (h.mine)
    cues.push({
      type: 'vignette',
      tone: 'red',
      strength: h.kind === 'hostile' ? 0.5 : 0.3,
      ms: 500,
    });
  return cues;
}
