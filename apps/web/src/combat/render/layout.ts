/** Logical canvas (art-direction §10): 960×540, 56 px HUD band on top, arena centred below it. */
export const VIEW_W = 960;
export const VIEW_H = 540;
export const HUD_H = 56;

export interface ArenaRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Arena placement for a sim arena size (PvP 800×448, dragon 896×448). */
export function arenaRect(w: number, h: number): ArenaRect {
  return {
    x: Math.round((VIEW_W - w) / 2),
    y: Math.round(HUD_H + (VIEW_H - HUD_H - h) / 2),
    w,
    h,
  };
}

export interface CanvasFit {
  /** CSS size of the canvas element. */
  readonly cssW: number;
  readonly cssH: number;
  /** Backing store size in device pixels. */
  readonly pixelW: number;
  readonly pixelH: number;
  /** Logical px → device px. */
  readonly scale: number;
}

/** Fits 16:9 into the container (letterboxed) and sizes the backing store for the device pixel ratio. */
export function fitCanvas(containerW: number, containerH: number, dpr: number): CanvasFit {
  const k = Math.max(0.1, Math.min(containerW / VIEW_W, containerH / VIEW_H));
  const cssW = Math.floor(VIEW_W * k);
  const cssH = Math.floor(VIEW_H * k);
  const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, 3) : 1;
  return {
    cssW,
    cssH,
    pixelW: Math.round(cssW * ratio),
    pixelH: Math.round(cssH * ratio),
    scale: (cssW * ratio) / VIEW_W,
  };
}

/** BAM (0..255, 0 = east, 64 = south) → radians. */
export const bamToRad = (bam: number): number => (bam / 256) * Math.PI * 2;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
