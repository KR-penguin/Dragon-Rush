import type { SeatId } from '@hero-dice/engine';

/** The board is drawn as the border of a square grid of this many cells per side. */
export const RING_SIDE = 7;

export interface GridCell {
  readonly row: number;
  readonly col: number;
}

export const ringSize = (side: number = RING_SIDE): number => (side - 1) * 4;

/**
 * 0-based grid cell of a ring tile. Top row runs left→right, right column top→bottom,
 * bottom row right→left and left column bottom→top.
 */
export function ringCell(index: number, side: number = RING_SIDE): GridCell {
  const edge = side - 1;
  if (!Number.isInteger(index) || index < 0 || index >= ringSize(side)) {
    throw new RangeError(`tile ${index} is outside a ring of side ${side}`);
  }
  if (index <= edge) return { row: 0, col: index };
  if (index <= edge * 2) return { row: index - edge, col: edge };
  if (index <= edge * 3) return { row: edge, col: edge * 3 - index };
  return { row: edge * 4 - index, col: 0 };
}

/** Tiles visited one by one by a forward move, ending on the destination. */
export function stepPath(from: number, steps: number, size: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= steps; k++) out.push((from + k) % size);
  return out;
}

export interface TokenSlot {
  readonly tile: number;
  readonly slot: number;
  readonly count: number;
}

/** Assigns each token a slot among the tokens sharing its tile (ordered by seat). */
export function tokenSlots(
  entries: readonly { readonly seat: SeatId; readonly tile: number }[],
): Map<SeatId, TokenSlot> {
  const byTile = new Map<number, SeatId[]>();
  for (const e of [...entries].sort((a, b) => a.seat - b.seat)) {
    const list = byTile.get(e.tile) ?? [];
    list.push(e.seat);
    byTile.set(e.tile, list);
  }
  const out = new Map<SeatId, TokenSlot>();
  for (const [tile, seats] of byTile) {
    seats.forEach((seat, slot) => out.set(seat, { tile, slot, count: seats.length }));
  }
  return out;
}

const SLOT_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/** Offset of a token from its tile centre, as a fraction of the tile size. */
export function slotOffset(slot: number, count: number): { dx: number; dy: number } {
  if (count <= 1) return { dx: 0, dy: 0 };
  const [x, y] = SLOT_OFFSETS[slot % SLOT_OFFSETS.length]!;
  const spread = 0.22;
  return { dx: x * spread, dy: count === 2 ? 0 : y * spread };
}
