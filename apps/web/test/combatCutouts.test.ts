import { createCombat } from '@dragon-rush/combat';
import { describe, expect, it } from 'vitest';
import { drawDragon } from '../src/combat/render/drawDragon';
import { drawFighterBody, type FighterPose } from '../src/combat/render/drawFighter';

type Call = { name: string; args: unknown[] };

function recordingContext(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy(
    {},
    {
      get:
        (_target, key) =>
        (...args: unknown[]) => {
          calls.push({ name: String(key), args });
          if (key === 'getTransform') return { a: 1, b: 0, c: 0, d: 1 };
          return String(key).startsWith('create') ? gradient : undefined;
        },
      set: (_target, key, value: unknown) => {
        calls.push({ name: String(key), args: [value] });
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, calls };
}

const setup = {
  kind: 'duel' as const,
  a: { job: 'swordsman' as const, hp: 50, maxHp: 50, atk: 5, def: 5, indomitableAvailable: true },
  b: { job: 'archer' as const, hp: 40, maxHp: 40, atk: 5, def: 5, indomitableAvailable: false },
};

const image = { naturalWidth: 512, naturalHeight: 256 } as HTMLImageElement;

describe('combat cutout drawing', () => {
  it('mirrors a fighter cutout and uses its silhouette for the governed hit flash', () => {
    const state = createCombat(setup, 42);
    const pose: FighterPose = {
      x: 100,
      y: 120,
      f: state.a,
      look: { name: '검사', color: '#fff', crest: 'shield' },
      image,
      flip: -1,
      flash: 0.8,
      shakeX: 2,
      shakeY: 0,
      fall: 0,
      alpha: 1,
      now: 100,
      softFlash: false,
    };
    const { ctx, calls } = recordingContext();
    drawFighterBody(ctx, pose, state.rules);
    expect(calls.filter((c) => c.name === 'drawImage')).toHaveLength(2);
    expect(calls).toContainEqual({ name: 'scale', args: [-1, 1] });
    expect(calls).toContainEqual({ name: 'filter', args: ['brightness(0) invert(1)'] });
    const soft = recordingContext();
    drawFighterBody(soft.ctx, { ...pose, softFlash: true }, state.rules);
    expect(soft.calls).toContainEqual({ name: 'filter', args: ['sepia(1) saturate(3)'] });
  });

  it('draws a procedural tool when a fighter image is unavailable', () => {
    const state = createCombat(setup, 42);
    const { ctx, calls } = recordingContext();
    drawFighterBody(
      ctx,
      {
        x: 100,
        y: 120,
        f: state.a,
        look: { name: '검사', color: '#fff', crest: 'shield' },
        image: null,
        flip: 1,
        flash: 0,
        shakeX: 0,
        shakeY: 0,
        fall: 0,
        alpha: 1,
        now: 100,
        softFlash: false,
      },
      state.rules,
    );
    expect(calls.some((c) => c.name === 'drawImage')).toBe(false);
    expect(calls.some((c) => c.name === 'stroke')).toBe(true);
  });

  it('keeps dragon facing, breath charge, and the head weakpoint with a cutout', () => {
    const state = createCombat(
      { kind: 'dragonFight', a: setup.a, b: null, dragon: { hp: 100, atk: 5, def: 5 } },
      42,
    );
    const dragon = state.dragon!;
    const d = {
      ...dragon,
      facing: 128,
      headLowered: 10,
      maneuver: 'breath' as const,
      stage: 'telegraph' as const,
      stageTick: 10,
      stageLen: 20,
    };
    const { ctx, calls } = recordingContext();
    drawDragon(
      ctx,
      { x: 300, y: 200, d, image, flash: 0.5, fall: 0, now: 100, softFlash: false },
      state.rules,
    );
    expect(calls.filter((c) => c.name === 'drawImage')).toHaveLength(2);
    expect(calls).toContainEqual({ name: 'rotate', args: [Math.PI / 2] });
    expect(calls.some((c) => c.name === 'createRadialGradient')).toBe(true);
    expect(calls.some((c) => c.name === 'fillText' && c.args[0] === '약점')).toBe(true);
    const airborne = recordingContext();
    drawDragon(
      airborne.ctx,
      {
        x: 300,
        y: 200,
        d: { ...d, airborne: true },
        image,
        flash: 0,
        fall: 0,
        now: 100,
        softFlash: false,
      },
      state.rules,
    );
    expect(airborne.calls.some((c) => c.name === 'drawImage')).toBe(false);
  });
});
