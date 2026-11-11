import { TEXT_KINDS, textFrame, type FloatingTextItem } from '../core/floatingText';

/** Damage numbers use Black Han Sans (no Latin glyphs, so it falls back for MISS/KO). */
export const IMPACT_FONT = "'Black Han Sans', 'Noto Sans KR', 'Malgun Gothic', sans-serif";

/**
 * Canvas renderer for floating texts (arena). Sizes are in the context's units, so the arena
 * draws them in logical px inside its camera transform.
 */
export function drawFloatingTexts(
  ctx: CanvasRenderingContext2D,
  items: readonly FloatingTextItem[],
  now: number,
  inPlace = false,
  unit = 1,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const it of items) {
    const spec = TEXT_KINDS[it.kind];
    const f = textFrame(spec, now - it.born, now - it.popAt, inPlace);
    if (f.alpha <= 0) continue;
    const size = spec.fontPx * unit * f.scale;
    ctx.globalAlpha = f.alpha;
    ctx.font = `${Math.round(size * 10) / 10}px ${IMPACT_FONT}`;
    const x = it.x + f.dx * unit;
    const y = it.y + f.dy * unit;
    ctx.lineWidth = 2 * unit;
    ctx.strokeStyle = '#1A1210';
    ctx.strokeText(it.text, x, y);
    ctx.fillStyle = spec.color;
    ctx.fillText(it.text, x, y);
  }
  ctx.globalAlpha = 1;
}
