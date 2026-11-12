import { BOARD_SIZE, DEFAULT_RULES } from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import {
  CORNER_TRACK_PX,
  fitStage,
  GRID_TEMPLATE,
  isCornerTile,
  LAIR_RECT,
  pawnSpot,
  PLANE_SIZE,
  planeToCamera,
  projectedBounds,
  projectPlanePoint,
  SIDE_TRACK_PX,
  tileCenter,
  tileRect,
  tileSide,
} from '../src/types/boardGeometry';
import { cornerOf } from '../src/types/hudLayout';

describe('board plane geometry (1.5fr corners)', () => {
  it('uses Monopoly proportions on a 960 px plane', () => {
    expect(GRID_TEMPLATE).toBe('1.5fr 1fr 1fr 1fr 1fr 1fr 1.5fr');
    expect(CORNER_TRACK_PX).toBe(180);
    expect(SIDE_TRACK_PX).toBe(120);
    expect(LAIR_RECT).toEqual({ x: 180, y: 180, w: 600, h: 600 });
  });

  it('sizes corners 180x180, top/bottom tiles 120x180 and side columns 180x120', () => {
    for (const corner of [0, 6, 12, 18]) {
      expect(isCornerTile(corner)).toBe(true);
      expect(tileSide(corner)).toBe('corner');
      expect(tileRect(corner)).toMatchObject({ w: 180, h: 180 });
    }
    expect(tileRect(3)).toEqual({ x: 420, y: 0, w: 120, h: 180 });
    expect(tileSide(3)).toBe('top');
    expect(tileRect(9)).toEqual({ x: 780, y: 420, w: 180, h: 120 });
    expect(tileSide(9)).toBe('right');
    expect(tileSide(15)).toBe('bottom');
    expect(tileSide(21)).toBe('left');
  });

  it('tiles the plane without gaps or overlaps', () => {
    let area = 0;
    for (let i = 0; i < BOARD_SIZE; i++) {
      const r = tileRect(i);
      area += r.w * r.h;
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(PLANE_SIZE);
      expect(r.y + r.h).toBeLessThanOrEqual(PLANE_SIZE);
    }
    expect(area + LAIR_RECT.w * LAIR_RECT.h).toBe(PLANE_SIZE * PLANE_SIZE);
  });

  it('spreads pawns sharing a tile and keeps them on it', () => {
    const spots = [0, 1, 2, 3].map((slot) => pawnSpot(7, slot, 4));
    expect(new Set(spots.map((p) => `${p.x},${p.y}`)).size).toBe(4);
    const r = tileRect(7);
    for (const p of spots) {
      expect(p.x).toBeGreaterThan(r.x);
      expect(p.x).toBeLessThan(r.x + r.w);
      expect(p.y).toBeGreaterThan(r.y);
      expect(p.y).toBeLessThan(r.y + r.h);
    }
    expect(pawnSpot(7, 0, 1).x).toBe(tileCenter(7).x);
  });
});

describe('projection and fit', () => {
  it('is the identity at tilt 0', () => {
    expect(projectPlanePoint({ x: 100, y: 700 }, { tiltDeg: 0 })).toEqual({ x: 100, y: 700 });
  });

  it('foreshortens the far edge and widens the near edge at 40 degrees', () => {
    const o = { tiltDeg: 40 };
    const farW =
      projectPlanePoint({ x: PLANE_SIZE, y: 0 }, o).x - projectPlanePoint({ x: 0, y: 0 }, o).x;
    const nearW =
      projectPlanePoint({ x: PLANE_SIZE, y: PLANE_SIZE }, o).x -
      projectPlanePoint({ x: 0, y: PLANE_SIZE }, o).x;
    expect(farW).toBeCloseTo(805, 0);
    expect(nearW).toBeCloseTo(1189, 0);
  });

  it('fits the projected board inside the area, centred', () => {
    const bounds = projectedBounds({ tiltDeg: 38 });
    expect(bounds.y0).toBeLessThan(projectPlanePoint({ x: 480, y: 0 }, { tiltDeg: 38 }).y);
    const area = { w: 1440, h: 640 };
    const fit = fitStage(area, bounds, 2, 1);
    const left = fit.x + fit.scale * bounds.x0;
    const right = fit.x + fit.scale * bounds.x1;
    const top = fit.y + fit.scale * bounds.y0;
    const bottom = fit.y + fit.scale * bounds.y1;
    expect(left + right).toBeCloseTo(area.w, 6);
    expect(top + bottom).toBeCloseTo(area.h, 6);
    expect(bottom - top).toBeCloseTo(area.h, 6);
    expect(right - left).toBeLessThanOrEqual(area.w + 1e-6);
    expect(fitStage({ w: 0, h: 0 }, bounds)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('leaves headroom for the camera beats by default', () => {
    const bounds = projectedBounds({ tiltDeg: 38 });
    const tight = fitStage({ w: 1440, h: 640 }, bounds, 2, 1);
    expect(fitStage({ w: 1440, h: 640 }, bounds, 2).scale).toBeCloseTo(tight.scale * 0.94, 6);
  });

  it('maps plane points to camera space relative to the stage centre', () => {
    expect(planeToCamera({ x: 480, y: 480 }, 38)).toEqual({ x: 0, y: 0 });
    const p = planeToCamera({ x: 0, y: 0 }, 60);
    expect(p.x).toBe(-480);
    expect(p.y).toBeCloseTo(-240, 6);
  });
});

describe('corner cards', () => {
  it('puts P1/P2 on top and P3/P4 at the bottom; two players use the top only', () => {
    expect([0, 1, 2, 3].map((i) => cornerOf(i, 4))).toEqual(['tl', 'tr', 'bl', 'br']);
    expect([0, 1].map((i) => cornerOf(i, 2))).toEqual(['tl', 'tr']);
    expect(() => cornerOf(2, 2)).toThrow(RangeError);
  });

  it('matches the engine board size', () => {
    expect(DEFAULT_RULES.board).toHaveLength(BOARD_SIZE);
  });
});
