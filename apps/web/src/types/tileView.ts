import type { EffectSpec, TileDef, TileId } from '@dragon-rush/engine';
import { assertNever } from './assertNever';
import { isCornerTile } from './boardGeometry';
import type { IconName } from './icons';
import { STAT_LABEL } from './labels';

export type TileTone = 'safe' | 'special' | 'good' | 'bad';

const SPECIAL_KINDS = new Set(['shop', 'mystery', 'training', 'randomItem']);

/** Colour family of a tile, read from its effect data (presentation only). */
export function tileTone(def: TileDef): TileTone {
  if (def.safe) return 'safe';
  if (def.id === 'START') return 'special';
  if (def.effects.some((e) => SPECIAL_KINDS.has(e.kind))) return 'special';
  let score = 0;
  for (const e of def.effects) {
    if (e.kind === 'coins' || e.kind === 'hp') score += e.amount;
    else if (e.kind === 'stat' || e.kind === 'maxHp') score += Math.abs(e.amount) * 10;
    else if (e.kind === 'skipTurn') score -= 10;
  }
  return score > 0 ? 'good' : 'bad';
}

/**
 * Category gem of a tile on the board. Corner tiles are landmarks (teal gem); the rest follow
 * their effect data. Corner tiles remain landmarks even when START permits PvP.
 */
export type TileCategory = 'landmark' | 'special' | 'good' | 'bad';

export function tileCategory(def: TileDef, index: number): TileCategory {
  if (isCornerTile(index) || def.safe) return 'landmark';
  const tone = tileTone(def);
  return tone === 'safe' ? 'landmark' : tone;
}

export const CATEGORY_LABEL: Record<TileCategory, string> = {
  good: '이로운 칸',
  bad: '해로운 칸',
  special: '특수 칸',
  landmark: '거점',
};

export const CATEGORIES: readonly TileCategory[] = ['good', 'bad', 'special', 'landmark'];

export type ChipTone = 'good' | 'bad' | 'neutral';

/** One effect shown as icon + number on a plaque or event card. */
export interface EffectChip {
  readonly icon: IconName;
  /** Signed amount, or null for effects without a number. */
  readonly amount: number | null;
  readonly label: string;
  readonly tone: ChipTone;
}

const toneOf = (n: number): ChipTone => (n > 0 ? 'good' : n < 0 ? 'bad' : 'neutral');

export function effectChip(e: EffectSpec): EffectChip {
  switch (e.kind) {
    case 'coins':
      return { icon: 'coins', amount: e.amount, label: '코인', tone: toneOf(e.amount) };
    case 'hp':
      return { icon: 'hp', amount: e.amount, label: 'HP', tone: toneOf(e.amount) };
    case 'stat':
      return { icon: e.stat, amount: e.amount, label: STAT_LABEL[e.stat], tone: toneOf(e.amount) };
    case 'maxHp':
      return { icon: 'maxHp', amount: e.amount, label: '최대 HP', tone: toneOf(e.amount) };
    case 'skipTurn':
      return { icon: 'sleep', amount: null, label: '한 턴 쉼', tone: 'bad' };
    case 'randomItem':
      return { icon: 'bag', amount: null, label: '무작위 아이템', tone: 'good' };
    case 'training':
      return { icon: 'training', amount: null, label: '무료 강화', tone: 'neutral' };
    case 'shop':
      return { icon: 'shop', amount: null, label: '아이템 구매', tone: 'neutral' };
    case 'mystery':
      return { icon: 'cave', amount: null, label: '동굴 카드', tone: 'neutral' };
    default:
      return assertNever(e);
  }
}

export const effectChips = (effects: readonly EffectSpec[]): EffectChip[] =>
  effects.map(effectChip);

/** "+3", "−5" with a real minus sign; empty for effects without a number. */
export function signed(n: number | null): string {
  if (n === null) return '';
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

/** Plain-language effect line for tooltips, e.g. "코인 +5 · HP −3". */
export function effectSummary(effects: readonly EffectSpec[]): string {
  if (effects.length === 0) return '효과 없음';
  return effectChips(effects)
    .map((c) => (c.amount === null ? c.label : `${c.label} ${signed(c.amount)}`))
    .join(' · ');
}

/** Corner landmark art (billboarded standee) by tile id; other ids have none. */
export type LandmarkKind = 'gate' | 'tent' | 'inn';

const LANDMARKS: Partial<Record<TileId, LandmarkKind>> = {
  START: 'gate',
  SHOP: 'tent',
  INN: 'inn',
};

export const landmarkOf = (id: TileId): LandmarkKind | null => LANDMARKS[id] ?? null;
