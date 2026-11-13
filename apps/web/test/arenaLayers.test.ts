import { createCombat } from '@dragon-rush/combat';
import { expect, it, vi } from 'vitest';
import { ArenaRenderer } from '../src/combat/render/arenaRenderer';
import type { ArenaFx } from '../src/fx/runtime/arenaFx';

const paintHud = vi.hoisted(() => vi.fn());
vi.mock('../src/combat/render/drawHud', () => ({ drawHud: paintHud }));

function recordingContext() {
  const calls: { name: string; args: unknown[] }[] = [];
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy(
    {},
    {
      get:
        (_target, key) =>
        (...args: unknown[]) => {
          calls.push({ name: String(key), args });
          return String(key).startsWith('create') ? gradient : undefined;
        },
      set: () => true,
    },
  ) as CanvasRenderingContext2D;
  return { ctx, calls };
}

it('retains static browser surfaces and redraws the floor with the same camera only when it moves', () => {
  paintHud.mockClear();
  const fighter = {
    job: 'swordsman' as const,
    hp: 50,
    maxHp: 50,
    atk: 5,
    def: 5,
    indomitableAvailable: false,
  };
  const state = createCombat({ kind: 'duel', a: fighter, b: { ...fighter, job: 'archer' } }, 42);
  const doc = {
    createElement: () => ({ width: 0, height: 0, getContext: () => recordingContext().ctx }),
  } as unknown as Document;
  const renderer = new ArenaRenderer(
    doc,
    {
      a: { name: 'A', color: '#fff', crest: 'shield' },
      b: { name: 'B', color: '#f00', crest: 'diamond' },
      fighterImage: () => null,
      dragonImage: () => null,
      dragonAttackImage: () => null,
    },
    state,
    42,
  );
  let dx = 0;
  const fx = {
    setTelegraph: () => {},
    cameraTransform: () => ({ dx, dy: 0, rot: 0, zoom: 1 }),
    update: () => {},
    draw: () => {},
  } as unknown as ArenaFx;
  const main = recordingContext();
  const background = recordingContext();
  const hud = recordingContext();
  const env = {
    scale: 2,
    now: 1000,
    dtMs: 16,
    fx,
    softFlash: false,
    layers: { background: background.ctx, hud: hud.ctx },
  };
  const frame = { prev: state, curr: state, alpha: 0.5 };
  renderer.render(main.ctx, frame, env);
  const firstBackgroundCalls = background.calls.length;
  renderer.render(main.ctx, frame, { ...env, now: 1016 });
  expect(background.calls).toHaveLength(firstBackgroundCalls);
  expect(paintHud).toHaveBeenCalledTimes(1);
  expect(main.calls.filter((call) => call.name === 'clearRect')).toHaveLength(2);
  expect(main.calls.filter((call) => call.name === 'drawImage')).toEqual([]);
  dx = 2;
  renderer.render(main.ctx, frame, { ...env, now: 1032 });
  expect(background.calls.length).toBeGreaterThan(firstBackgroundCalls);
  const camera = { name: 'translate', args: [482, 298] };
  expect(background.calls).toContainEqual(camera);
  expect(main.calls).toContainEqual(camera);
  const moved = background.calls.length;
  renderer.invalidateLayers();
  renderer.render(main.ctx, frame, { ...env, now: 1048 });
  expect(background.calls.length).toBeGreaterThan(moved);
  expect(paintHud).toHaveBeenCalledTimes(2);
});
