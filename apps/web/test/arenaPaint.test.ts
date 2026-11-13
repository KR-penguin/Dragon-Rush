import { createCombat } from '@dragon-rush/combat';
import { beforeEach, expect, it, vi } from 'vitest';
import { ArenaPaintCache } from '../src/combat/render/arenaPaint';
import type { HudInput } from '../src/combat/render/drawHud';

const paintHud = vi.hoisted(() => vi.fn());
vi.mock('../src/combat/render/drawHud', () => ({ drawHud: paintHud }));

beforeEach(() => paintHud.mockClear());

const fighter = {
  job: 'swordsman' as const,
  hp: 50,
  maxHp: 50,
  atk: 5,
  def: 5,
  indomitableAvailable: true,
};
const state = () =>
  createCombat({ kind: 'duel', a: fighter, b: { ...fighter, job: 'archer' } }, 42);
const input = (): HudInput => ({
  s: state(),
  looks: [
    { name: 'A', color: '#fff', crest: 'shield' },
    { name: 'B', color: '#f00', crest: 'diamond' },
  ],
  ghosts: { a: 50, b: 50, dragon: 0 },
  now: 0,
});

function surface() {
  const drawImage = vi.fn();
  const doc = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ setTransform: vi.fn(), clearRect: vi.fn() }),
    }),
  } as unknown as Document;
  return {
    cache: new ArenaPaintCache(doc, 42),
    ctx: { drawImage } as unknown as CanvasRenderingContext2D,
  };
}

it('reuses unchanged HUD pixels while actor positions and non-visible timer ticks change', () => {
  const { cache, ctx } = surface();
  const h = input();
  cache.drawHud(ctx, h, 2);
  cache.drawHud(
    ctx,
    { ...h, now: 16, s: { ...h.s, tick: 1, a: { ...h.s.a, x: h.s.a.x + 256 } } },
    2,
  );
  expect(paintHud).toHaveBeenCalledTimes(1);
  expect(ctx.drawImage).toHaveBeenCalledTimes(2);
});

it('refreshes HUD pixels for health, ghost drainage, cooldowns, timer, and DPR changes', () => {
  const { cache, ctx } = surface();
  const h = input();
  cache.drawHud(ctx, h, 1);
  cache.drawHud(ctx, { ...h, ghosts: { ...h.ghosts, a: 45 } }, 1);
  cache.drawHud(ctx, { ...h, s: { ...h.s, a: { ...h.s.a, hp: 40 } } }, 1);
  cache.drawHud(ctx, { ...h, s: { ...h.s, a: { ...h.s.a, skillCharges: 0, skillTimer: 30 } } }, 1);
  cache.drawHud(ctx, { ...h, s: { ...h.s, tick: 60 } }, 1);
  cache.drawHud(ctx, h, 3);
  expect(paintHud).toHaveBeenCalledTimes(6);
});

it('continues painting urgent timer pulses instead of freezing an animated HUD', () => {
  const { cache, ctx } = surface();
  const h = input();
  const urgent = { ...h, s: { ...h.s, tick: h.s.timeLimit - 60 } };
  cache.drawHud(ctx, urgent, 2);
  cache.drawHud(ctx, { ...urgent, now: 120 }, 2);
  expect(paintHud).toHaveBeenCalledTimes(2);
});

it('retains a persistent HUD layer without copying its bitmap into the live canvas', () => {
  const { cache } = surface();
  const ctx = { setTransform: vi.fn(), clearRect: vi.fn() } as unknown as CanvasRenderingContext2D;
  const h = input();
  cache.drawHudLayer(ctx, h, 2);
  cache.drawHudLayer(ctx, { ...h, now: 16 }, 2);
  expect(paintHud).toHaveBeenCalledTimes(1);
  expect(ctx.clearRect).toHaveBeenCalledTimes(1);
  cache.invalidateLayers();
  cache.drawHudLayer(ctx, h, 2);
  expect(paintHud).toHaveBeenCalledTimes(2);
});
