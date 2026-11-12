export type Corner = 'tl' | 'tr' | 'bl' | 'br';

const ORDER: readonly Corner[] = ['tl', 'tr', 'bl', 'br'];

/**
 * Screen corner for a player card by turn-order index: P1 top-left, P2 top-right, P3 bottom-left,
 * P4 bottom-right. Two players use the top corners only.
 */
export function cornerOf(index: number, count: number): Corner {
  if (index < 0 || index >= Math.max(count, 1)) throw new RangeError(`seat ${index} of ${count}`);
  return ORDER[index % ORDER.length]!;
}

export const isTopCorner = (c: Corner): boolean => c === 'tl' || c === 'tr';
