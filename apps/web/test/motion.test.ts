import { describe, expect, it } from 'vitest';
import { eventDuration } from '../src/animation/eventTimeline';
import {
  clampThrow,
  DIE_FACES,
  diceLandingRotation,
  diceMoveMs,
  diceSpinKeyframes,
  diceThrowKeyframes,
  FACE_PLACEMENT,
  faceTransform,
  hopSchedule,
  HOP_LIFT_KEYFRAMES,
  isDieFace,
  MOVE_STEP_BUDGET_MS,
  REST_ROTATION,
  squashKeyframes,
  type DieFace,
} from '../src/types/motion';

type Vec = [number, number, number];
const rad = (d: number) => (d * Math.PI) / 180;
// CSS rotation matrices applied to a column vector.
const rotX = (d: number, [x, y, z]: Vec): Vec => [
  x,
  y * Math.cos(rad(d)) - z * Math.sin(rad(d)),
  y * Math.sin(rad(d)) + z * Math.cos(rad(d)),
];
const rotY = (d: number, [x, y, z]: Vec): Vec => [
  x * Math.cos(rad(d)) + z * Math.sin(rad(d)),
  y,
  -x * Math.sin(rad(d)) + z * Math.cos(rad(d)),
];
/** `rotateX(a) rotateY(b)` applies rotateY first. */
const cssRot = (r: { x: number; y: number }, v: Vec): Vec => rotX(r.x, rotY(r.y, v));

describe('pawn hops', () => {
  it('starts at 160 ms and shortens by x0.9 per step down to 120 ms', () => {
    expect(hopSchedule(6)).toEqual([160, 144, 130, 120, 120, 120]);
    expect(hopSchedule(0)).toEqual([]);
  });

  it('fits the hops inside the 160 ms-per-step Moved budget', () => {
    expect(diceMoveMs(3)).toBe(480);
    expect(eventDuration({ type: 'Moved', seat: 0, from: 0, to: 3, steps: 3, via: 'dice' })).toBe(
      diceMoveMs(3),
    );
    for (let steps = 1; steps <= 8; steps++) {
      const hops = hopSchedule(steps).reduce((a, b) => a + b, 0);
      expect(hops).toBeLessThanOrEqual(steps * MOVE_STEP_BUDGET_MS);
    }
  });

  it('rises 30 px at 45 %, lands by 85 %, and squashes harder on the final landing', () => {
    expect(HOP_LIFT_KEYFRAMES.find((k) => k.offset === 0.45)?.transform).toBe('translateZ(30px)');
    expect(HOP_LIFT_KEYFRAMES.find((k) => k.offset === 0.85)?.transform).toBe('translateZ(0px)');
    expect(squashKeyframes(false).some((k) => k.transform === 'scale(1.08, 0.92)')).toBe(true);
    expect(squashKeyframes(true).some((k) => k.transform === 'scale(1.18, 0.84)')).toBe(true);
  });
});

describe('CSS-3D die', () => {
  it('turns every face toward the viewer with its rest rotation', () => {
    for (const face of DIE_FACES) {
      const normal = cssRot(FACE_PLACEMENT[face], [0, 0, 1]);
      const shown = cssRot(REST_ROTATION[face], normal);
      expect(shown[0]).toBeCloseTo(0, 9);
      expect(shown[1]).toBeCloseTo(0, 9);
      expect(shown[2]).toBeCloseTo(1, 9);
    }
  });

  it('places faces as in the decision sheet', () => {
    expect(faceTransform(6)).toBe('rotateX(0deg) rotateY(180deg) translateZ(28px)');
    expect(faceTransform(5, 'calc(var(--die) / 2)')).toBe(
      'rotateX(90deg) rotateY(0deg) translateZ(calc(var(--die) / 2))',
    );
  });

  it('lands on the engine value after 720 degrees on X and 360 on Y', () => {
    for (const face of DIE_FACES) {
      const land = diceLandingRotation(face);
      expect(land.x - REST_ROTATION[face].x).toBe(720);
      expect(land.y - REST_ROTATION[face].y).toBe(360);
      const normal = cssRot(FACE_PLACEMENT[face], [0, 0, 1]);
      expect(cssRot(land, normal)[2]).toBeCloseTo(1, 9);
      const frames = diceSpinKeyframes(face);
      expect(frames.at(-1)?.transform).toBe(`rotateX(${land.x}deg) rotateY(${land.y}deg)`);
      expect(frames.at(-1)?.offset).toBe(1);
    }
  });

  it('throws along a bouncing path that ends in the tray centre', () => {
    const frames = diceThrowKeyframes(-150, 8);
    expect(frames[0]!.transform).toContain('translate3d(-150px, 8px, 0px)');
    expect(frames.at(-1)!.transform).toContain('translate3d(0px, 0px, 0px)');
    const offsets = frames.map((f) => f.offset as number);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
    expect(clampThrow({ x: 3000, y: 4000 }, 500)).toEqual({ x: 300, y: 400 });
    expect(clampThrow({ x: 30, y: 40 }, 500)).toEqual({ x: 30, y: 40 });
  });

  it('only accepts real faces', () => {
    expect(isDieFace(3)).toBe(true);
    expect([0, 7, 2.5, null].some((n) => isDieFace(n as number | null))).toBe(false);
    const face: DieFace = 6;
    expect(REST_ROTATION[face]).toEqual({ x: 0, y: 180 });
  });
});
