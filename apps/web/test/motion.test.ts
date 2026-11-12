import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { describeEvent, eventDuration } from '../src/animation/eventTimeline';
import { DiceTray } from '../src/components/board/DiceTray';
import { hopTimings } from '../src/fx/timing';
import { stepPath } from '../src/types/boardLayout';
import { ITEM_DESC } from '../src/types/labels';
import {
  diceMoveMs,
  hopSchedule,
  HOP_LIFT_KEYFRAMES,
  isRouletteValue,
  MOVE_STEP_BUDGET_MS,
  ROULETTE_VALUES,
  rouletteLabelPosition,
  rouletteRestAngle,
  rouletteSectorPath,
  rouletteSpinKeyframes,
  squashKeyframes,
  teleportHopSchedule,
  teleportMoveMs,
} from '../src/types/motion';

describe('pawn hops', () => {
  it('fits ten dice hops inside the movement event budget', () => {
    expect(hopSchedule(6)).toEqual([160, 144, 130, 120, 120, 120]);
    expect(hopSchedule(0)).toEqual([]);
    expect(diceMoveMs(3)).toBe(480);
    for (let steps = 1; steps <= 10; steps++) {
      expect(hopSchedule(steps).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
        steps * MOVE_STEP_BUDGET_MS,
      );
    }
    expect(eventDuration({ type: 'Moved', seat: 0, from: 0, to: 10, steps: 10, via: 'dice' })).toBe(
      diceMoveMs(10),
    );
  });

  it('keeps the lift and final landing squash', () => {
    expect(HOP_LIFT_KEYFRAMES.find((k) => k.offset === 0.45)?.transform).toBe('translateZ(30px)');
    expect(HOP_LIFT_KEYFRAMES.find((k) => k.offset === 0.85)?.transform).toBe('translateZ(0px)');
    expect(squashKeyframes(false).some((k) => k.transform === 'scale(1.08, 0.92)')).toBe(true);
    expect(squashKeyframes(true).some((k) => k.transform === 'scale(1.18, 0.84)')).toBe(true);
  });

  it('travels every clockwise teleport tile, crossing START, within a short budget', () => {
    const path = stepPath(20, 23, 24);
    expect(path).toEqual([
      21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
    const moved = {
      type: 'Moved' as const,
      seat: 0 as const,
      from: 20,
      to: 19,
      steps: 23,
      via: 'teleport' as const,
    };
    const hops = hopTimings(moved, 1, 24);
    expect(hops.map((hop) => hop.tile)).toEqual(path);
    expect(hops.map((hop) => hop.startMs)).toEqual(
      [...hops.map((hop) => hop.startMs)].sort((a, b) => a - b),
    );
    expect(teleportHopSchedule(23)).toHaveLength(23);
    expect(eventDuration(moved)).toBe(teleportMoveMs(23));
    expect(hops.at(-1)!.landMs).toBeLessThan(teleportMoveMs(23));
    expect(teleportMoveMs(23)).toBeLessThan(1600);
  });
});

describe('ten-sector roulette', () => {
  it('renders ten labelled sectors and a fixed pointer', () => {
    const html = renderToStaticMarkup(
      createElement(DiceTray, { value: 10, roll: null, speed: 1, reduced: false }),
    );
    expect(html.match(/class="roulette-sector /g) ?? []).toHaveLength(10);
    expect(html).toContain('class="roulette-pointer"');
    expect(html).toContain('이동 룰렛 10칸');
    expect(html).toContain('rotate(-324deg)');
  });

  it('shows an immediate result and live text with reduced motion', () => {
    const html = renderToStaticMarkup(
      createElement(DiceTray, {
        value: null,
        roll: { key: {}, value: 10, seat: 0, local: true },
        speed: 1,
        reduced: true,
      }),
    );
    expect(html).toContain('rotate(-324deg)');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('이동 룰렛 10칸');
    expect(html).not.toContain('roulette-result is-new');
  });

  it('names roulette outcomes and the clockwise teleport route', () => {
    expect(
      describeEvent(
        { type: 'DiceRolled', seat: 0, value: 10 },
        () => '모험가',
        () => 'START',
      ),
    ).toBe('모험가 룰렛 10칸');
    expect(
      describeEvent(
        { type: 'Moved', seat: 0, from: 20, to: 1, steps: 5, via: 'teleport' },
        () => '모험가',
        () => 'HERB',
      ),
    ).toContain('시계 방향 5칸 이동');
    expect(ITEM_DESC.teleport).toContain('출발 보너스');
  });

  it('centres each sector under the pointer for the event value', () => {
    expect(ROULETTE_VALUES).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const value of ROULETTE_VALUES) {
      const index = value - 1;
      const pos = rouletteLabelPosition(index);
      const angle = (Math.atan2(pos.y - 50, pos.x - 50) * 180) / Math.PI;
      const finalAngle = angle + rouletteRestAngle(value);
      expect((((finalAngle + 90) % 360) + 360) % 360).toBeCloseTo(0, 9);
      expect(rouletteSectorPath(index)).toMatch(/^M 50 50 L .* A 48 48 0 0 1 .* Z$/);
      const frames = rouletteSpinKeyframes(0, value);
      expect(frames.at(-1)?.transform).toBe(
        `rotate(${1080 + ((rouletteRestAngle(value) + 360) % 360)}deg)`,
      );
      expect(frames.at(-1)?.offset).toBe(1);
    }
    expect(isRouletteValue(10)).toBe(true);
    expect([0, 11, 2.5, null].some(isRouletteValue)).toBe(false);
  });
});
