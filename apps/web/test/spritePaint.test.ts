import { afterEach, expect, it, vi } from 'vitest';
import { drawSprite } from '../src/combat/render/spritePaint';

afterEach(() => vi.unstubAllGlobals());

it('bakes hit-flash filters once per source and output resolution without filtering live frames', () => {
  const bakes: { filter: string; drawImage: ReturnType<typeof vi.fn> }[] = [];
  class Canvas {
    readonly context = { filter: 'none', drawImage: vi.fn() };
    constructor(
      readonly width: number,
      readonly height: number,
    ) {
      bakes.push(this.context);
    }
    getContext() {
      return this.context;
    }
  }
  vi.stubGlobal('OffscreenCanvas', Canvas);
  const image = { naturalWidth: 1312, naturalHeight: 1199 } as HTMLImageElement;
  let scale = 2;
  const ctx = {
    getTransform: () => ({ a: scale, b: 0, c: 0, d: scale }),
    drawImage: vi.fn(),
    filter: 'none',
  } as unknown as CanvasRenderingContext2D;
  drawSprite(ctx, image, -32, -64, 64, 58.5, 'white');
  drawSprite(ctx, image, -32, -64, 64, 58.5, 'white');
  expect(bakes).toHaveLength(1);
  expect(bakes[0]?.filter).toBe('brightness(0) invert(1)');
  expect(bakes[0]?.drawImage).toHaveBeenCalledTimes(1);
  expect(ctx.filter).toBe('none');
  expect(ctx.drawImage).toHaveBeenLastCalledWith(expect.any(Canvas), -32, -64, 64, 58.5);
  scale = 3;
  drawSprite(ctx, image, -32, -64, 64, 58.5, 'white');
  expect(bakes).toHaveLength(2);
  drawSprite(ctx, image, -32, -64, 64, 58.5, 'soft');
  expect(bakes.at(-1)?.filter).toBe('sepia(1) saturate(3)');
  drawSprite(ctx, image, -32, -64, 64, 58.5);
  expect(ctx.drawImage).toHaveBeenLastCalledWith(image, -32, -64, 64, 58.5);
  expect(bakes).toHaveLength(3);
});
