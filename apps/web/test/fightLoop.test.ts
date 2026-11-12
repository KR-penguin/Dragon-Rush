import {
  createCombat,
  type CombatEvent,
  type CombatResult,
  type CombatState,
} from '@dragon-rush/combat';
import { describe, expect, it } from 'vitest';
import { FightLoop, type LoopHost } from '../src/services/fight/FightLoop';
import {
  SIM_STEP,
  createEventDeduper,
  createFixedStep,
  lerpQ8,
} from '../src/services/fight/fixedStep';
import type { FightInfo, FightStateProvider } from '../src/services/fight/types';

const STEP = 1000 / 60;

describe('fixed-step accumulator', () => {
  it('turns frame time into whole 60 Hz steps and keeps the remainder as alpha', () => {
    const s = createFixedStep();
    expect(s.advance(STEP)).toEqual({ steps: 1, alpha: expect.closeTo(0, 6) as number });
    const half = s.advance(STEP / 2);
    expect(half.steps).toBe(0);
    expect(half.alpha).toBeCloseTo(0.5, 6);
    const more = s.advance(STEP);
    expect(more.steps).toBe(1);
    expect(more.alpha).toBeCloseTo(0.5, 6);
    // 144 Hz display: steps average out to 60 per second
    const t = createFixedStep();
    let total = 0;
    for (let i = 0; i < 144; i++) total += t.advance(1000 / 144).steps;
    expect(total).toBeGreaterThanOrEqual(59);
    expect(total).toBeLessThanOrEqual(60);
  });

  it('clamps a long frame to 0.25 s and at most 5 steps, dropping the backlog', () => {
    const s = createFixedStep();
    const r = s.advance(2000);
    expect(r.steps).toBe(SIM_STEP.maxSteps);
    expect(r.alpha).toBeLessThan(1);
    expect(s.pending()).toBeLessThan(STEP);
    expect(s.advance(-50).steps).toBe(0);
    expect(s.advance(Number.NaN).steps).toBe(0);
  });

  it('plays faster at speed 4 with a proportionally higher cap', () => {
    const s = createFixedStep();
    expect(s.advance(STEP, 4).steps).toBe(4);
    expect(s.advance(250, 4).steps).toBe(20);
  });

  it('interpolates Q8 positions to px', () => {
    expect(lerpQ8(0, 256 * 10, 0.5)).toBe(5);
    expect(lerpQ8(256, 512, 0)).toBe(1);
  });
});

describe('event dedupe', () => {
  it('lets each event id through once (rollback re-emits)', () => {
    const d = createEventDeduper(3);
    const e = (id: string) => ({ id, tick: 1, type: 'TimeUp' }) as CombatEvent;
    expect(d.filter([e('a'), e('b'), e('a')]).map((x) => x.id)).toEqual(['a', 'b']);
    expect(d.filter([e('b'), e('c')]).map((x) => x.id)).toEqual(['c']);
    d.filter([e('d')]); // capacity 3 forgets the oldest id
    expect(d.filter([e('a')]).map((x) => x.id)).toEqual(['a']);
  });
});

const SETUP = {
  kind: 'duel' as const,
  a: { job: 'swordsman' as const, hp: 50, maxHp: 50, atk: 5, def: 5, indomitableAvailable: false },
  b: { job: 'archer' as const, hp: 40, maxHp: 40, atk: 6, def: 6, indomitableAvailable: false },
};

/** Counts steps; re-emits the previous tick's events like a rollback client would; ends at `endAt`. */
class FakeProvider implements FightStateProvider {
  prev: CombatState;
  curr: CombatState;
  steps = 0;
  private last: CombatEvent[] = [];
  constructor(private readonly endAt: number) {
    this.curr = createCombat(SETUP, 1);
    this.prev = this.curr;
  }
  step(): readonly CombatEvent[] {
    this.steps += 1;
    this.prev = this.curr;
    const done = this.steps >= this.endAt;
    this.curr = {
      ...this.curr,
      tick: this.steps,
      outcome: done ? { winner: 'a', timedOut: false, tick: this.steps } : null,
    };
    const now = { id: `${this.steps}:TimeUp:x`, tick: this.steps, type: 'TimeUp' } as CombatEvent;
    const out = [...this.last, now];
    this.last = [now];
    return out;
  }
  result(): CombatResult | null {
    return this.curr.outcome ? { winner: 'a', hpA: 50, hpB: 0 } : null;
  }
}

function fakeHost() {
  let hidden = false;
  let visibility: (() => void) | null = null;
  const host: LoopHost = {
    now: () => 0,
    requestFrame: () => 1,
    cancelFrame: () => undefined,
    isHidden: () => hidden,
    onVisibilityChange: (cb) => {
      visibility = cb;
      return () => (visibility = null);
    },
  };
  return {
    host,
    hide(h: boolean) {
      hidden = h;
      visibility?.();
    },
  };
}

const INFO: FightInfo = {
  id: 1,
  setup: SETUP,
  seed: 1,
  sides: [
    { side: 'a', seat: 0, control: 'keyboard-p1' },
    { side: 'b', seat: 1, control: 'keyboard-p2' },
  ],
};

describe('fight loop', () => {
  it('shows tick 0 until start, then steps at 60 Hz with interpolation alpha', () => {
    const p = new FakeProvider(1000);
    const { host } = fakeHost();
    const loop = new FightLoop(INFO, p, host);
    const frames: number[] = [];
    loop.onFrame((f) => frames.push(f.alpha));
    loop.tick(0);
    loop.tick(100);
    expect(p.steps).toBe(0);
    loop.start();
    loop.tick(200); // first frame after start only sets the clock
    loop.tick(200 + STEP * 2.5);
    expect(p.steps).toBe(2);
    expect(loop.frame().alpha).toBeCloseTo(0.5, 5);
    expect(frames.length).toBe(4);
  });

  it('pauses while the tab is hidden and resumes without catching up', () => {
    const p = new FakeProvider(1000);
    const h = fakeHost();
    const loop = new FightLoop(INFO, p, h.host);
    loop.start();
    loop.tick(0);
    loop.tick(STEP * 3);
    expect(p.steps).toBe(3);
    h.hide(true);
    expect(loop.isPaused()).toBe(true);
    loop.tick(STEP * 10);
    loop.tick(STEP * 200);
    expect(p.steps).toBe(3);
    h.hide(false);
    loop.tick(STEP * 5000);
    expect(p.steps).toBe(3);
    loop.tick(STEP * 5001);
    expect(p.steps).toBe(4);
    loop.setPaused(true);
    loop.tick(STEP * 5010);
    expect(p.steps).toBe(4);
  });

  it('delivers every sim event once and the result once, then stops stepping', () => {
    const p = new FakeProvider(4);
    const { host } = fakeHost();
    const loop = new FightLoop(INFO, p, host);
    const ids: string[] = [];
    const ends: CombatResult[] = [];
    loop.onFrame((_f, events) => ids.push(...events.map((e) => e.id)));
    loop.onEnd((r) => ends.push(r));
    loop.start();
    loop.tick(0);
    for (let i = 1; i <= 10; i++) loop.tick(i * STEP);
    expect(p.steps).toBe(4);
    expect(ids).toEqual(['1:TimeUp:x', '2:TimeUp:x', '3:TimeUp:x', '4:TimeUp:x']);
    expect(ends).toHaveLength(1);
    expect(loop.frame().alpha).toBe(1);
    loop.dispose();
    loop.tick(99999);
    expect(p.steps).toBe(4);
  });
});
