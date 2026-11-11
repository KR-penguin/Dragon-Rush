import type { TileDef } from '@dragon-rush/engine';

export type TileTone = 'safe' | 'special' | 'good' | 'bad';

const SPECIAL_KINDS = new Set(['shop', 'mystery', 'training', 'randomItem']);

/** Colour family of a tile, read from its effect data (presentation only). */
export function tileTone(def: TileDef): TileTone {
  if (def.safe) return 'safe';
  if (def.effects.some((e) => SPECIAL_KINDS.has(e.kind))) return 'special';
  let score = 0;
  for (const e of def.effects) {
    if (e.kind === 'coins' || e.kind === 'hp') score += e.amount;
    else if (e.kind === 'stat' || e.kind === 'maxHp') score += Math.abs(e.amount) * 10;
    else if (e.kind === 'skipTurn') score -= 10;
  }
  return score > 0 ? 'good' : 'bad';
}
