import { describe, expect, it } from 'vitest';
import { ARENA_CAMERA, BOARD_CAMERA, createCameraRig } from '../src/fx/core/camera';
import {
  createTween,
  decayPerTick,
  easeInOutCubic,
  easeOutBack,
  easeOutBounce,
  easeOutCubic,
  easeOutElastic,
  sampleTween,
} from '../src/fx/core/easing';
import {
  FLASH_RULES,
  createFlashGovernor,
  createRateLimiter,
  isSaturatedRed,
  parseHexColor,
  pulseEnvelope,
  safeFlashColor,
} from '../src/fx/core/flash';
import { perlin1 } from '../src/fx/core/noise';
import { createFxRng, hashSeed } from '../src/fx/core/rng';
import { KO_STOP, MAX_FREEZE_MS, createFxClock } from '../src/fx/core/time';

/** Manually advanced clock. */
function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    set: (v: number) => {
      t = v;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('easing', () => {
  const curves = { easeOutCubic, easeInOutCubic, easeOutBack, easeOutElastic, easeOutBounce };

  it('starts at 0 and ends at 1', () => {
    for (const [name, f] of Object.entries(curves)) {
      expect(f(0), name).toBeCloseTo(0, 6);
      expect(f(1), name).toBeCloseTo(1, 6);
    }
  });

  it('has the expected shapes', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 6);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 6);
    // Back and elastic overshoot past 1 before settling.
    const back = Array.from({ length: 99 }, (_, i) => easeOutBack((i + 1) / 100));
    expect(Math.max(...back)).toBeGreaterThan(1.05);
    expect(Math.max(...back)).toBeLessThan(1.15);
    expect(easeOutElastic(0.1)).toBeGreaterThan(1);
  });

  it('samples and steps tweens with a caller-supplied delta', () => {
    expect(sampleTween(10, 20, 0, 100, (t) => t)).toBe(10);
    expect(sampleTween(10, 20, 50, 100, (t) => t)).toBe(15);
    expect(sampleTween(10, 20, 500, 100, (t) => t)).toBe(20);
    expect(sampleTween(10, 20, 40, 100, (t) => t, 50)).toBe(10);
    let done = false;
    const tw = createTween({
      from: 0,
      to: 1,
      durationMs: 100,
      ease: (t) => t,
      onComplete: () => (done = true),
    });
    tw.step(50);
    expect(tw.value).toBeCloseTo(0.5);
    tw.step(0);
    expect(tw.value).toBeCloseTo(0.5);
    tw.step(60);
    expect(tw.value).toBe(1);
    expect(done && tw.done).toBe(true);
  });

  it('decays per 60 Hz tick independently of the frame rate', () => {
    expect(decayPerTick(0.85, 1000 / 60)).toBeCloseTo(0.85, 6);
    const at60 = decayPerTick(0.9, 1000 / 60) ** 60;
    const at144 = decayPerTick(0.9, 1000 / 144) ** 144;
    expect(at144).toBeCloseTo(at60, 6);
  });
});

describe('perlin noise and FX rng', () => {
  it('is deterministic, bounded and smooth', () => {
    const xs = Array.from({ length: 2000 }, (_, i) => i * 0.013);
    const a = xs.map((x) => perlin1(x, 7));
    const b = xs.map((x) => perlin1(x, 7));
    expect(a).toEqual(b);
    expect(Math.max(...a.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(Math.max(...a.map(Math.abs))).toBeGreaterThan(0.2);
    for (let i = 1; i < a.length; i++) expect(Math.abs(a[i]! - a[i - 1]!)).toBeLessThan(0.1);
    // Gradient noise is zero on lattice points; other seeds differ.
    expect(perlin1(3, 7)).toBeCloseTo(0, 9);
    expect(xs.some((x) => perlin1(x, 8) !== perlin1(x, 7))).toBe(true);
  });

  it('xorshift is seeded and reproducible', () => {
    const r1 = createFxRng(hashSeed(42, 1));
    const r2 = createFxRng(hashSeed(42, 1));
    const seq = Array.from({ length: 50 }, () => r1.next());
    expect(Array.from({ length: 50 }, () => r2.next())).toEqual(seq);
    expect(seq.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(hashSeed(1)).not.toBe(hashSeed(2));
  });
});

describe('trauma camera', () => {
  it('decays trauma linearly at 1.5 per second and clamps at 1', () => {
    const clock = fakeClock(1000);
    const cam = createCameraRig(BOARD_CAMERA, clock);
    cam.addTrauma(0.6);
    expect(cam.trauma()).toBeCloseTo(0.6);
    clock.advance(200);
    expect(cam.trauma()).toBeCloseTo(0.3);
    clock.advance(200);
    expect(cam.trauma()).toBe(0);
    cam.addTrauma(0.7);
    cam.addTrauma(0.7);
    expect(cam.trauma()).toBe(1);
    expect(cam.isIdle()).toBe(false);
    clock.advance(1000 / 1.5 + 1);
    expect(cam.isIdle()).toBe(true);
  });

  it('shakes by trauma² within the board limits (20 px, 1°)', () => {
    const clock = fakeClock();
    const cam = createCameraRig(BOARD_CAMERA, clock);
    cam.addTrauma(1);
    const fullTrauma = Array.from({ length: 50 }, (_, i) => {
      clock.set(i * 7);
      cam.reset();
      cam.addTrauma(1);
      return cam.sample();
    });
    for (const s of fullTrauma) {
      expect(Math.abs(s.dx)).toBeLessThanOrEqual(20);
      expect(Math.abs(s.dy)).toBeLessThanOrEqual(20);
      expect(Math.abs(s.rot)).toBeLessThanOrEqual(Math.PI / 180 + 1e-9);
    }
    // Same time, half the trauma → a quarter of the offset.
    clock.set(123);
    cam.reset();
    cam.addTrauma(1);
    const full = cam.sample();
    cam.reset();
    cam.addTrauma(0.5);
    const half = cam.sample();
    expect(half.dx).toBeCloseTo(full.dx / 4, 6);
    expect(half.dy).toBeCloseTo(full.dy / 4, 6);
  });

  it('is a pure function of the injected clock (frame-rate independent)', () => {
    const run = (fps: number) => {
      const clock = fakeClock();
      const cam = createCameraRig(BOARD_CAMERA, clock);
      cam.addTrauma(0.8);
      for (let t = 0; t <= 300; t += 1000 / fps) {
        clock.set(t);
        cam.sample();
      }
      clock.set(300);
      return cam.sample();
    };
    expect(run(30)).toEqual(run(144));
  });

  it('applies the shake slider, viewport unit and telegraph cap', () => {
    const clock = fakeClock(321);
    const cam = createCameraRig(ARENA_CAMERA, clock);
    cam.addTrauma(1);
    const base = cam.sample();
    expect(cam.sample({ scale: 0 })).toMatchObject({ dx: 0, dy: 0, rot: 0, zoom: 1 });
    const scaled = cam.sample({ scale: 0.5, unit: 2 });
    expect(scaled.dx).toBeCloseTo(base.dx, 6);
    const capped = cam.sample({ telegraph: true });
    expect(Math.hypot(capped.dx, capped.dy)).toBeLessThanOrEqual(4 + 1e-9);
    expect(capped.rot).toBe(0);
  });

  it('kicks against the attack direction and zoom-punches with frame-rate independent decay', () => {
    const clock = fakeClock();
    const cam = createCameraRig(ARENA_CAMERA, clock);
    cam.kick(1, 0);
    expect(cam.sample().dx).toBeCloseTo(-6);
    clock.advance(1000 / 60);
    expect(cam.sample().dx).toBeCloseTo(-6 * 0.85);
    cam.zoomPunch(0.2);
    clock.advance(40);
    expect(cam.sample().zoom).toBeCloseTo(1.06);
    clock.advance(1000 / 60);
    expect(cam.sample().zoom).toBeCloseTo(1 + 0.06 * 0.9);
  });

  it('sustains continuous trauma up to a soft cap', () => {
    const clock = fakeClock();
    const cam = createCameraRig(ARENA_CAMERA, clock);
    // +0.6/s net: about 0.3 after half a second, held at the 0.5 cap after that.
    for (let i = 0; i < 30; i++) {
      clock.advance(1000 / 60);
      cam.sustainTrauma(0.6, 1000 / 60, 0.5);
    }
    expect(cam.trauma()).toBeCloseTo(0.3, 1);
    for (let i = 0; i < 90; i++) {
      clock.advance(1000 / 60);
      cam.sustainTrauma(0.6, 1000 / 60, 0.5);
    }
    expect(cam.trauma()).toBeCloseTo(0.5, 6);
  });
});

describe('fx clock (hit-stop and slow-mo)', () => {
  it('freezes for N ms, then runs at real speed', () => {
    const real = fakeClock(1000);
    const clock = createFxClock(real.now);
    real.advance(100);
    expect(clock.now()).toBeCloseTo(100);
    clock.freeze(60);
    expect(clock.isFrozen()).toBe(true);
    expect(clock.freezeRemainingMs()).toBeCloseTo(60);
    real.advance(40);
    expect(clock.now()).toBeCloseTo(100);
    real.advance(40);
    expect(clock.now()).toBeCloseTo(120);
    expect(clock.isFrozen()).toBe(false);
  });

  it('extends overlapping freezes instead of stacking them and caps their length', () => {
    const real = fakeClock();
    const clock = createFxClock(real.now);
    clock.freeze(80);
    real.advance(50);
    clock.freeze(80);
    expect(clock.freezeRemainingMs()).toBeCloseTo(80);
    real.advance(200);
    // Frozen from 0 to 130 (not 160): 250 − 130.
    expect(clock.now()).toBeCloseTo(120);
    const capped = createFxClock(real.now);
    capped.freeze(5000);
    expect(capped.freezeRemainingMs()).toBe(MAX_FREEZE_MS);
  });

  it('slows time and ramps back', () => {
    const real = fakeClock();
    const clock = createFxClock(real.now);
    clock.slowMo(0.25, 400, 200);
    real.advance(400);
    expect(clock.now()).toBeCloseTo(100, 3);
    real.advance(200);
    // Linear ramp 0.25 → 1 over 200 ms averages 0.625.
    expect(clock.now()).toBeCloseTo(100 + 125, 3);
    real.advance(100);
    expect(clock.now()).toBeCloseTo(325, 3);
  });

  it('plays a KO boss stop and reports scaled deltas', () => {
    const real = fakeClock();
    const clock = createFxClock(real.now);
    clock.bossStop(KO_STOP);
    real.advance(KO_STOP.freezeMs);
    expect(clock.now()).toBeCloseTo(0, 3);
    expect(clock.scaledDelta(100)).toBeCloseTo(0, 3);
    real.advance(100);
    expect(clock.scaledDelta(100)).toBeCloseTo(30, 3);
    expect(clock.scale()).toBeCloseTo(0.3, 3);
  });
});

describe('flash governor', () => {
  it('allows at most one full-screen flash per 350 ms (fewer than 3 per second)', () => {
    const clock = fakeClock();
    const gov = createFlashGovernor(clock.now);
    let granted = 0;
    const starts: number[] = [];
    for (let t = 0; t <= 2000; t += 10) {
      clock.set(t);
      if (gov.request({ color: '#ffffff', alpha: 0.3 })) {
        granted++;
        starts.push(t);
      }
    }
    expect(granted).toBe(6);
    for (let i = 0; i < starts.length; i++) {
      const inWindow = starts.filter((s) => s >= starts[i]! && s < starts[i]! + 1000);
      expect(inWindow.length).toBeLessThan(4);
    }
  });

  it('clamps alpha and length and desaturates red', () => {
    const clock = fakeClock();
    const gov = createFlashGovernor(clock.now);
    const g = gov.request({ color: '#ff0000', alpha: 0.9, durationMs: 500 });
    expect(g?.alpha).toBe(FLASH_RULES.maxAlpha);
    expect(g?.durationMs).toBe(FLASH_RULES.maxDurationMs);
    expect(isSaturatedRed(parseHexColor(g!.color)!)).toBe(false);
    expect(safeFlashColor('#ffffff')).toBe('#ffffff');
    clock.advance(40);
    expect(gov.sample().alpha).toBeCloseTo(0.15);
    clock.advance(41);
    expect(gov.sample().alpha).toBe(0);
  });

  it('never flashes in photosensitive mode', () => {
    const gov = createFlashGovernor(
      () => 0,
      () => true,
    );
    expect(gov.request({ color: '#fff', alpha: 0.2 })).toBeNull();
  });

  it('rate limiter and pulse envelope', () => {
    const clock = fakeClock();
    const limiter = createRateLimiter(334, clock.now);
    expect(limiter.tryAcquire()).toBe(true);
    clock.advance(333);
    expect(limiter.tryAcquire()).toBe(false);
    clock.advance(1);
    expect(limiter.tryAcquire()).toBe(true);
    expect(pulseEnvelope(40, 80, 400)).toBeCloseTo(0.5);
    expect(pulseEnvelope(80, 80, 400)).toBeCloseTo(1);
    expect(pulseEnvelope(480, 80, 400)).toBe(0);
  });
});
