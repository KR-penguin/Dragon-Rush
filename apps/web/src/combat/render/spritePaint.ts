export type SpriteFilter = 'white' | 'soft' | 'stunned';

const FILTERS: Readonly<Record<SpriteFilter, string>> = {
  white: 'brightness(0) invert(1)',
  soft: 'sepia(1) saturate(3)',
  stunned: 'grayscale(0.65)',
};
const MAX_VARIANTS = 12;
type Surface = HTMLCanvasElement | OffscreenCanvas;
const variants = new WeakMap<HTMLImageElement, Map<string, Surface>>();

function filteredSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  w: number,
  h: number,
  filter: SpriteFilter,
): Surface | null {
  const transform = ctx.getTransform();
  const sx = Math.hypot(transform.a, transform.b);
  const sy = Math.hypot(transform.c, transform.d);
  const width = Math.max(
    1,
    Math.ceil(Math.min(image.naturalWidth, Math.abs(w) * (Number.isFinite(sx) ? sx : 1))),
  );
  const height = Math.max(
    1,
    Math.ceil(Math.min(image.naturalHeight, Math.abs(h) * (Number.isFinite(sy) ? sy : 1))),
  );
  const key = `${filter}:${width}:${height}`;
  let cache = variants.get(image);
  const cached = cache?.get(key);
  if (cached) {
    cache!.delete(key);
    cache!.set(key, cached);
    return cached;
  }
  const doc = image.ownerDocument ?? (typeof document === 'undefined' ? null : document);
  const surface =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : doc
        ? Object.assign(doc.createElement('canvas'), { width, height })
        : null;
  const paint = surface?.getContext('2d') as
    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!surface || !paint) return null;
  paint.filter = FILTERS[filter];
  paint.drawImage(image, 0, 0, width, height);
  if (!cache) {
    cache = new Map();
    variants.set(image, cache);
  }
  cache.set(key, surface);
  if (cache.size > MAX_VARIANTS) cache.delete(cache.keys().next().value!);
  return surface;
}

/** Normal art uses the browser's image cache; expensive color filters are baked at output resolution. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  filter?: SpriteFilter,
): void {
  if (!filter) {
    ctx.drawImage(image, x, y, w, h);
    return;
  }
  const sprite = filteredSprite(ctx, image, w, h, filter);
  if (sprite) ctx.drawImage(sprite, x, y, w, h);
  else {
    const previous = ctx.filter;
    ctx.filter = FILTERS[filter];
    ctx.drawImage(image, x, y, w, h);
    ctx.filter = typeof previous === 'string' ? previous : 'none';
  }
}
