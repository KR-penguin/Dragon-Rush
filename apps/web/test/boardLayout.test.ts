import { BOARD_SIZE } from '@hero-dice/engine';
import { describe, expect, it } from 'vitest';
import {
  RING_SIDE,
  ringCell,
  ringSize,
  slotOffset,
  stepPath,
  tokenSlots,
} from '../src/types/boardLayout';

describe('ring board layout', () => {
  it('fits the engine board exactly', () => {
    expect(ringSize(RING_SIDE)).toBe(BOARD_SIZE);
  });

  it('places tiles clockwise around a 7x7 border', () => {
    expect(ringCell(0)).toEqual({ row: 0, col: 0 });
    expect(ringCell(6)).toEqual({ row: 0, col: 6 });
    expect(ringCell(7)).toEqual({ row: 1, col: 6 });
    expect(ringCell(11)).toEqual({ row: 5, col: 6 });
    expect(ringCell(12)).toEqual({ row: 6, col: 6 });
    expect(ringCell(18)).toEqual({ row: 6, col: 0 });
    expect(ringCell(19)).toEqual({ row: 5, col: 0 });
    expect(ringCell(23)).toEqual({ row: 1, col: 0 });
  });

  it('uses every border cell once and never the centre', () => {
    const seen = new Set<string>();
    for (let i = 0; i < BOARD_SIZE; i++) {
      const { row, col } = ringCell(i);
      expect(row === 0 || row === 6 || col === 0 || col === 6).toBe(true);
      seen.add(`${row},${col}`);
    }
    expect(seen.size).toBe(BOARD_SIZE);
  });

  it('keeps consecutive tiles adjacent, including the wrap from 23 to 0', () => {
    for (let i = 0; i < BOARD_SIZE; i++) {
      const a = ringCell(i);
      const b = ringCell((i + 1) % BOARD_SIZE);
      expect(Math.abs(a.row - b.row) + Math.abs(a.col - b.col)).toBe(1);
    }
  });

  it('rejects tiles outside the ring', () => {
    expect(() => ringCell(-1)).toThrow(RangeError);
    expect(() => ringCell(24)).toThrow(RangeError);
    expect(() => ringCell(1.5)).toThrow(RangeError);
  });
});

describe('token movement helpers', () => {
  it('walks forward one tile at a time and wraps past START', () => {
    expect(stepPath(3, 4, 24)).toEqual([4, 5, 6, 7]);
    expect(stepPath(22, 3, 24)).toEqual([23, 0, 1]);
    expect(stepPath(5, 0, 24)).toEqual([]);
  });

  it('gives tokens on a shared tile distinct slots', () => {
    const slots = tokenSlots([
      { seat: 2, tile: 5 },
      { seat: 0, tile: 5 },
      { seat: 1, tile: 9 },
    ]);
    expect(slots.get(0)).toEqual({ tile: 5, slot: 0, count: 2 });
    expect(slots.get(2)).toEqual({ tile: 5, slot: 1, count: 2 });
    expect(slots.get(1)).toEqual({ tile: 9, slot: 0, count: 1 });
    expect(slotOffset(0, 1)).toEqual({ dx: 0, dy: 0 });
    const a = slotOffset(0, 2);
    const b = slotOffset(1, 2);
    expect(a.dx).not.toBe(b.dx);
    const four = [0, 1, 2, 3].map((s) => slotOffset(s, 4)).map((o) => `${o.dx},${o.dy}`);
    expect(new Set(four).size).toBe(4);
  });
});
