import { describe, expect, it } from 'vitest';
import {
  TEXT_KINDS,
  TEXT_MAX_PER_TARGET,
  createFloatingTextBook,
  formatTextValue,
  popScale,
  textFrame,
} from '../src/fx/core/floatingText';
import { PARTICLE_CAP, createParticlePool } from '../src/fx/core/particles';
import {
  BURST_PRESETS,
  COIN_FLIGHT,
  emitBurst,
  emitCoinFlight,
  emitRing,
  RING_PRESETS,
  presetUnit,
} from '../src/fx/core/particlePresets';
import { createFxRng } from '../src/fx/core/rng';
import {
  DEFAULT_FX_SETTINGS,
  parseFxSettings,
  resolveFxPolicy,
  type FxSettings,
} from '../src/fx/settings/fxSettings';

describe('particle pool', () => {
  it('caps live particles at 500 and drops the overflow', () => {
    const pool = createParticlePool();
    expect(pool.capacity).toBe(PARTICLE_CAP);
    let accepted = 0;
    for (let i = 0; i < 700; i++)
      if (pool.spawn({ x: 0, y: 0, lifeMs: 100, size: 1, color: '#fff', shape: 'dot' }) >= 0)
        accepted++;
    expect(accepted).toBe(500);
    expect(pool.count).toBe(500);
  });

  it('integrates velocity, gravity and per-tick drag, and recycles dead slots', () => {
    const pool = createParticlePool(8);
    pool.spawn({
      x: 0,
      y: 0,
      vx: 100,
      vy: 0,
      gravity: 0,
      lifeMs: 1000,
      size: 1,
      color: '#fff',
      shape: 'dot',
    });
    pool.spawn({ x: 0, y: 0, lifeMs: 50, size: 1, color: '#000', shape: 'dot' });
    pool.update(500);
    expect(pool.count).toBe(1);
    expect(pool.data.x[0]).toBeCloseTo(50);
    expect(pool.colorOf(0)).toBe('#fff');
    pool.update(600);
    expect(pool.count).toBe(0);
  });

  it('holds delayed particles in place until their delay passes', () => {
    const pool = createParticlePool(4);
    pool.spawn({
      x: 5,
      y: 5,
      vx: 100,
      lifeMs: 100,
      delayMs: 200,
      size: 1,
      color: '#fff',
      shape: 'dot',
    });
    pool.update(150);
    expect(pool.data.x[0]).toBe(5);
    pool.update(100);
    expect(pool.data.x[0]).toBeGreaterThan(5);
  });

  it('is deterministic for the same FX seed', () => {
    const run = () => {
      const pool = createParticlePool();
      emitBurst(pool, BURST_PRESETS.sparkHeavy, 100, 100, createFxRng(99));
      for (let i = 0; i < 10; i++) pool.update(16);
      return Array.from(pool.data.x.slice(0, pool.count));
    };
    expect(run()).toEqual(run());
  });

  it('emits presets with the spec counts and cone', () => {
    const rng = createFxRng(1);
    const pool = createParticlePool();
    expect(emitBurst(pool, BURST_PRESETS.sparkLight, 0, 0, rng)).toBe(8);
    expect(emitBurst(pool, BURST_PRESETS.sparkHeavy, 0, 0, rng)).toBe(20);
    expect(emitBurst(pool, BURST_PRESETS.sparkParry, 0, 0, rng)).toBe(14);
    expect(emitBurst(pool, BURST_PRESETS.goldSparkle, 0, 0, rng)).toBe(12);
    expect(emitBurst(pool, BURST_PRESETS.smokeDark, 0, 0, rng)).toBe(8);
    expect(emitBurst(pool, BURST_PRESETS.sparkLight, 0, 0, rng, { amount: 0.5 })).toBe(4);
    // Sparks stay within ±35° of the given direction.
    for (let i = 0; i < 8; i++) {
      const angle = Math.atan2(pool.data.vy[i]!, pool.data.vx[i]!);
      expect(Math.abs(angle)).toBeLessThanOrEqual((35 * Math.PI) / 180 + 1e-6);
      const speed = Math.hypot(pool.data.vx[i]!, pool.data.vy[i]!);
      expect(speed).toBeGreaterThanOrEqual(200 - 1e-3);
      expect(speed).toBeLessThanOrEqual(500 + 1e-3);
    }
    expect(emitRing(pool, RING_PRESETS.heavy, 0, 0, '#fff')).toBe(true);
    expect(presetUnit('arena', 'screen', 1)).toBe(2);
    expect(presetUnit('board', 'arena')).toBe(0.5);
  });

  it('flies at most 10 coins to the HUD and reports each arrival', () => {
    const pool = createParticlePool();
    const n = emitCoinFlight(pool, createFxRng(3), {
      from: { x: 0, y: 0 },
      to: { x: 300, y: -200 },
      coins: 25,
      group: 7,
    });
    expect(n).toBe(COIN_FLIGHT.maxCoins);
    const total = COIN_FLIGHT.burstMs + COIN_FLIGHT.flyMs + COIN_FLIGHT.staggerMs * (n - 1);
    let arrivals = 0;
    for (let t = 0; t <= total + 32; t += 16) {
      pool.update(16);
      for (const a of pool.drainArrivals()) {
        expect(a).toEqual({ group: 7, x: 300, y: -200 });
        arrivals++;
      }
    }
    expect(arrivals).toBe(10);
    expect(pool.count).toBe(0);
  });
});

describe('floating text', () => {
  it('pops 0.4 → 1.25 → 1 over 150 ms', () => {
    expect(popScale(0)).toBeCloseTo(0.4);
    expect(popScale(90)).toBeCloseTo(1.25);
    expect(popScale(150)).toBeCloseTo(1);
    expect(popScale(1000)).toBe(1);
  });

  it('rises 20 px over 700 ms and fades over the last 30%', () => {
    const spec = TEXT_KINDS.damage;
    expect(textFrame(spec, 0).alpha).toBe(1);
    expect(textFrame(spec, 700).dy).toBeCloseTo(-20);
    expect(textFrame(spec, 480).alpha).toBe(1);
    expect(textFrame(spec, 595).alpha).toBeCloseTo(0.5);
    expect(textFrame(spec, 700).alpha).toBe(0);
    // Evade slides sideways; 불굴! holds before it moves.
    expect(textFrame(TEXT_KINDS.evade, 700).dx).toBeCloseTo(20);
    expect(textFrame(TEXT_KINDS.lastStand, 800).dy).toBeCloseTo(0);
  });

  it('fades in place under reduced motion', () => {
    const f = textFrame(TEXT_KINDS.heavy, 300, 300, true);
    expect(f).toMatchObject({ dx: 0, dy: 0, scale: 1 });
    expect(f.alpha).toBe(1);
  });

  it('merges hits on one target within 150 ms and keeps at most 6 per target', () => {
    let t = 0;
    const book = createFloatingTextBook(() => t);
    const a = book.add({ kind: 'damage', x: 0, y: 0, value: 4, target: 'p1' });
    t = 100;
    const b = book.add({ kind: 'damage', x: 0, y: 0, value: 3, target: 'p1' });
    expect(b.merged).toBe(true);
    expect(b.item.id).toBe(a.item.id);
    expect(b.item.text).toBe('7.0');
    expect(b.item.popAt).toBe(100);
    t = 300;
    expect(book.add({ kind: 'damage', x: 0, y: 0, value: 1, target: 'p1' }).merged).toBe(false);
    expect(book.add({ kind: 'damage', x: 0, y: 0, value: 1, target: 'p2' }).merged).toBe(false);
    for (let i = 0; i < 8; i++) {
      t += 200;
      book.add({ kind: 'heavy', x: 0, y: 0, value: 1, target: 'p3' });
    }
    // Heavy numbers live 700 ms, so only the recent ones are still around.
    expect(book.live().filter((it) => it.target === 'p3').length).toBeLessThanOrEqual(
      TEXT_MAX_PER_TARGET,
    );
    t += 10;
    for (let i = 0; i < 9; i++)
      book.add({ kind: 'callout', x: 0, y: 0, text: `x${i}`, target: 'p4' });
    expect(book.live().filter((it) => it.target === 'p4').length).toBe(TEXT_MAX_PER_TARGET);
    expect(book.add({ kind: 'loss', x: 0, y: 0, value: 5 }).item.text).toBe('−5');
  });
});

describe('floating damage labels', () => {
  it('rounds display to one decimal while retaining raw hit values for merging', () => {
    expect(formatTextValue('damage', 1.23456789)).toBe('1.2');
    expect(formatTextValue('heavy', 1.29999999)).toBe('1.3');
    let now = 0;
    const book = createFloatingTextBook(() => now);
    const first = book.add({ kind: 'damage', x: 0, y: 0, value: 1.23456789, target: 'dragon' });
    expect(first.item.value).toBe(1.23456789);
    expect(first.item.text).toBe('1.2');
    now = 100;
    const merged = book.add({ kind: 'damage', x: 0, y: 0, value: 0.33333333, target: 'dragon' });
    expect(merged.item.value).toBeCloseTo(1.56790122, 8);
    expect(merged.item.text).toBe('1.6');
  });
});

describe('fx settings policy', () => {
  const with_ = (patch: Partial<FxSettings>): FxSettings => ({ ...DEFAULT_FX_SETTINGS, ...patch });

  it('reduced motion: no shake or slow-mo, half particles, hit-stop kept, numbers in place', () => {
    const p = resolveFxPolicy(DEFAULT_FX_SETTINGS, true);
    expect(p).toMatchObject({
      shakeScale: 0,
      slowMo: false,
      particleScale: 0.5,
      hitStopScale: 1,
      textInPlace: true,
    });
    // An explicit in-game choice overrides the system preference.
    expect(resolveFxPolicy(with_({ reduceMotion: false }), true).shakeScale).toBe(1);
    expect(resolveFxPolicy(with_({ reduceMotion: true }), false).slowMo).toBe(false);
  });

  it('photosensitive mode removes flashes; juice off removes visuals but not sound', () => {
    expect(resolveFxPolicy(with_({ photosensitive: true }), false).flash).toBe(false);
    const off = resolveFxPolicy(with_({ juice: false }), false);
    expect(off).toMatchObject({
      shakeScale: 0,
      particleScale: 0,
      text: false,
      flash: false,
      hitStopScale: 0,
      sound: true,
    });
    expect(resolveFxPolicy(with_({ shakeIntensity: 0.4 }), false).shakeScale).toBeCloseTo(0.4);
  });

  it('parses persisted settings defensively', () => {
    expect(parseFxSettings(null)).toEqual(DEFAULT_FX_SETTINGS);
    expect(parseFxSettings('not json')).toEqual(DEFAULT_FX_SETTINGS);
    const s = parseFxSettings(
      JSON.stringify({
        shakeIntensity: 7,
        reduceMotion: true,
        channels: { flash: false, bogus: 1 },
      }),
    );
    expect(s.shakeIntensity).toBe(1);
    expect(s.reduceMotion).toBe(true);
    expect(s.channels.flash).toBe(false);
    expect(s.channels.shake).toBe(true);
  });
});
