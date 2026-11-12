import { RING_SIDE, ringCell, slotOffset } from './boardLayout';

/** Board plane (the tile grid) in CSS px before any camera or fit scale. */
export const PLANE_SIZE = 960;
/** Walnut rim around the grid. */
export const RIM = 28;
/** Corner tracks are 1.5x a side track (Monopoly proportions): 180 / 120 px on a 960 plane. */
export const CORNER_TRACK = 1.5;
export const TRACKS: readonly number[] = Array.from({ length: RING_SIDE }, (_, i) =>
  i === 0 || i === RING_SIDE - 1 ? CORNER_TRACK : 1,
);
export const GRID_TEMPLATE = TRACKS.map((t) => `${t}fr`).join(' ');

export const BOARD_TILT_DEG = 38;
export const PERSPECTIVE_PX = 1600;
export const PERSPECTIVE_ORIGIN = { x: 0.5, y: 0.35 } as const;

export interface PlaneRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

const TRACK_UNIT = PLANE_SIZE / TRACKS.reduce((a, b) => a + b, 0);
const TRACK_STARTS = TRACKS.reduce<number[]>((acc, t, i) => {
  acc.push(i === 0 ? 0 : acc[i - 1]! + TRACKS[i - 1]! * TRACK_UNIT);
  return acc;
}, []);

/** Size of one side track in plane px (120 on a 960 plane). */
export const SIDE_TRACK_PX = TRACK_UNIT;
export const CORNER_TRACK_PX = TRACK_UNIT * CORNER_TRACK;

export type TileSide = 'corner' | 'top' | 'right' | 'bottom' | 'left';

export const isCornerTile = (index: number): boolean => index % (RING_SIDE - 1) === 0;

/** Which edge of the ring a tile sits on; side tiles are long toward the lair. */
export function tileSide(index: number): TileSide {
  if (isCornerTile(index)) return 'corner';
  const { row, col } = ringCell(index);
  if (row === 0) return 'top';
  if (col === RING_SIDE - 1) return 'right';
  if (row === RING_SIDE - 1) return 'bottom';
  return 'left';
}

/** Tile rectangle on the plane, origin at the plane's top-left. */
export function tileRect(index: number): PlaneRect {
  const { row, col } = ringCell(index);
  return {
    x: TRACK_STARTS[col]!,
    y: TRACK_STARTS[row]!,
    w: TRACKS[col]! * TRACK_UNIT,
    h: TRACKS[row]! * TRACK_UNIT,
  };
}

export function tileCenter(index: number): Point {
  const r = tileRect(index);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** The lair fills the grid between the rings: 600 x 600 on a 960 plane. */
export const LAIR_RECT: PlaneRect = {
  x: CORNER_TRACK_PX,
  y: CORNER_TRACK_PX,
  w: PLANE_SIZE - 2 * CORNER_TRACK_PX,
  h: PLANE_SIZE - 2 * CORNER_TRACK_PX,
};

const PAWN_SPREAD = 0.27;

/**
 * Where a pawn stands on the plane. Tokens sharing a tile spread out by slot; pawns sit a little
 * toward the near (front) half so a corner landmark has room behind them.
 */
export function pawnSpot(tile: number, slot: number, count: number): Point {
  const r = tileRect(tile);
  const c = tileCenter(tile);
  const off = slotOffset(slot, count);
  const unit = Math.min(r.w, r.h) * (PAWN_SPREAD / 0.22);
  const front = isCornerTile(tile) ? r.h * 0.14 : r.h * 0.06;
  return { x: c.x + off.dx * unit, y: c.y + front + off.dy * unit };
}

export interface ProjectionOptions {
  readonly tiltDeg: number;
  readonly perspective?: number;
  readonly origin?: { readonly x: number; readonly y: number };
  readonly plane?: number;
}

/**
 * Projects a point of the tilted plane (plane px, z lifts toward the viewer) onto the stage,
 * matching `.stage { perspective } > .camera > .board3d { rotateX(tilt) }` with the camera at rest.
 */
export function projectPlanePoint(p: Point & { readonly z?: number }, o: ProjectionOptions): Point {
  const plane = o.plane ?? PLANE_SIZE;
  const d = o.perspective ?? PERSPECTIVE_PX;
  const origin = o.origin ?? PERSPECTIVE_ORIGIN;
  const t = (o.tiltDeg * Math.PI) / 180;
  const u = p.x - plane / 2;
  const v = p.y - plane / 2;
  const z0 = p.z ?? 0;
  // rotateX(t) about the plane centre: y' = v cos t - z sin t, z' = v sin t + z cos t.
  const y = v * Math.cos(t) - z0 * Math.sin(t);
  const z = v * Math.sin(t) + z0 * Math.cos(t);
  const ox = origin.x * plane;
  const oy = origin.y * plane;
  const k = d / (d - z);
  return { x: ox + (plane / 2 + u - ox) * k, y: oy + (plane / 2 + y - oy) * k };
}

export interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Height (plane px) that billboards rise above the far edge: landmarks and pawns. */
export const STANDEE_HEADROOM = 150;

/** Stage-space bounding box of the tilted board including the rim and standees on the far row. */
export function projectedBounds(o: ProjectionOptions): Bounds {
  const plane = o.plane ?? PLANE_SIZE;
  const lo = -RIM;
  const hi = plane + RIM;
  const pts = [
    projectPlanePoint({ x: lo, y: lo }, o),
    projectPlanePoint({ x: hi, y: lo }, o),
    projectPlanePoint({ x: lo, y: hi }, o),
    projectPlanePoint({ x: hi, y: hi }, o),
  ];
  const far = projectPlanePoint({ x: plane / 2, y: lo }, o);
  const t = (o.tiltDeg * Math.PI) / 180;
  // A standee is screen-parallel, so its height scales like the far edge (k = far width / plane).
  const kFar = (pts[1]!.x - pts[0]!.x) / (hi - lo);
  const headroom = STANDEE_HEADROOM * kFar * Math.max(Math.sin(t), 0.35);
  return {
    x0: Math.min(...pts.map((p) => p.x)),
    x1: Math.max(...pts.map((p) => p.x)),
    y0: Math.min(far.y - headroom, ...pts.map((p) => p.y)),
    y1: Math.max(...pts.map((p) => p.y)),
  };
}

export interface StageFit {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** Share of the area the resting board may fill, leaving room for the 1.04-1.06 camera beats. */
export const FIT_FILL = 0.94;

/** Scale and offset that centre `bounds` inside an area (transform-origin 0 0 on the stage). */
export function fitStage(
  area: { readonly w: number; readonly h: number },
  bounds: Bounds,
  maxScale = 1.25,
  fill = FIT_FILL,
): StageFit {
  const bw = bounds.x1 - bounds.x0;
  const bh = bounds.y1 - bounds.y0;
  if (area.w <= 0 || area.h <= 0 || bw <= 0 || bh <= 0) return { scale: 1, x: 0, y: 0 };
  const scale = Math.min((area.w * fill) / bw, (area.h * fill) / bh, maxScale);
  return {
    scale,
    x: area.w / 2 - scale * ((bounds.x0 + bounds.x1) / 2),
    y: area.h / 2 - scale * ((bounds.y0 + bounds.y1) / 2),
  };
}

/**
 * Stage position (camera space, before perspective) of a plane point: used to aim camera beats.
 * Returned relative to the stage centre.
 */
export function planeToCamera(p: Point, tiltDeg: number, plane = PLANE_SIZE): Point {
  const t = (tiltDeg * Math.PI) / 180;
  return { x: p.x - plane / 2, y: (p.y - plane / 2) * Math.cos(t) };
}
