import { DEFAULT_RULES, type GameEvent } from '@dragon-rush/engine';
import { describe, expect, it } from 'vitest';
import { planeToCamera, tileCenter } from '../src/types/boardGeometry';
import { cameraBeat, poseToward, poseTransform, REST_POSE, type CameraContext } from '../src/types/camera';

const ctx = (positions: Record<number, number | null>): CameraContext => ({
  tiltDeg: 38,
  board: DEFAULT_RULES.board,
  positionOf: (seat) => positions[seat] ?? null,
});

/** Where a camera-space point lands after the pose (zoom about the centre, then pan). */
const apply = (pose: { x: number; y: number; zoom: number }, p: { x: number; y: number }) => ({
  x: pose.zoom * p.x + pose.x,
  y: pose.zoom * p.y + pose.y,
});

describe('camera beats', () => {
  it('pulls a target the requested fraction toward the centre while zooming', () => {
    const target = { x: 200, y: -100 };
    const pose = poseToward(target, 0.08, 1.04);
    const landed = apply(pose, target);
    expect(landed.x).toBeCloseTo(target.x * 0.92, 0);
    expect(landed.y).toBeCloseTo(target.y * 0.92, 0);
    expect(poseTransform(REST_POSE)).toBe('translate3d(0px, 0px, 0px) scale(1)');
  });

  it('pans 8% toward the pawn and zooms 1.04 over 500 ms at turn start', () => {
    const e: GameEvent = { type: 'TurnStarted', seat: 1, round: 1, resting: false };
    const beat = cameraBeat(e, ctx({ 1: 0 }))!;
    expect(beat.ms).toBe(500);
    expect(beat.pose.zoom).toBe(1.04);
    const start = planeToCamera(tileCenter(0), 38);
    const landed = apply(beat.pose, start);
    expect(Math.hypot(landed.x, landed.y)).toBeLessThan(Math.hypot(start.x, start.y));
    expect(cameraBeat(e, ctx({ 1: null }))).toBeNull();
  });

  it('pulses 1.06 on event tiles only, then settles back', () => {
    const herb: GameEvent = { type: 'TileResolved', seat: 0, tile: 3, tileId: 'HERB' };
    const beat = cameraBeat(herb, ctx({}))!;
    expect(beat).toMatchObject({ ms: 250, settleMs: 900 });
    expect(beat.pose.zoom).toBe(1.06);
    const shop: GameEvent = { type: 'TileResolved', seat: 0, tile: 6, tileId: 'SHOP' };
    expect(cameraBeat(shop, ctx({}))).toBeNull();
  });

  it('zooms 1.15 on a duel tile or the lair over 400 ms', () => {
    const duel: GameEvent = { type: 'CombatStarted', kind: 'duel', a: 2, b: 0, first: 2 };
    const d = cameraBeat(duel, ctx({ 2: 9 }))!;
    expect(d).toMatchObject({ ms: 400 });
    expect(d.pose.zoom).toBe(1.15);
    const dragon: GameEvent = { type: 'CombatStarted', kind: 'dragonFight', a: 2, b: 'dragon', first: 2 };
    expect(cameraBeat(dragon, ctx({}))!.pose.zoom).toBe(1.15);
  });

  it('holds during dice and moves, returns at turn end and pulls back on victory', () => {
    expect(cameraBeat({ type: 'DiceRolled', seat: 0, value: 4 }, ctx({}))).toBeNull();
    expect(
      cameraBeat({ type: 'Moved', seat: 0, from: 0, to: 4, steps: 4, via: 'dice' }, ctx({})),
    ).toBeNull();
    expect(cameraBeat({ type: 'TurnEnded', seat: 0 }, ctx({}))).toMatchObject({ pose: REST_POSE, ms: 600 });
    const end = cameraBeat({ type: 'GameEnded', outcome: { kind: 'dragon', winner: 0 } }, ctx({}))!;
    expect(end.ms).toBe(800);
    expect(end.pose.zoom).toBeLessThan(1);
  });
});
