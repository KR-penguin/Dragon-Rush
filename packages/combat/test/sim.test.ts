import { describe, expect, it } from 'vitest';
import { JOB_IDS } from '@dragon-rush/engine';
import {
  combatResult,
  COMBAT_TICK_HZ,
  createCombat,
  createCombatBot,
  DEFAULT_COMBAT_RULES,
  hashCombatState,
  runCombat,
  stepCombat,
  type CombatState,
} from '../src/index';
import {
  deepFreeze,
  dragonFight,
  duel,
  eventsOf,
  idle,
  input,
  newDuel,
  play,
  randomInputs,
} from './helpers';

const Q = 256;

function checkInvariants(s: CombatState): void {
  const r = s.rules;
  for (const f of [s.a, s.b]) {
    if (!f) continue;
    const pad = r.body.bodyRadius * Q;
    expect(f.x).toBeGreaterThanOrEqual(pad);
    expect(f.y).toBeGreaterThanOrEqual(pad);
    expect(f.x).toBeLessThanOrEqual(s.arenaW * Q - pad);
    expect(f.y).toBeLessThanOrEqual(s.arenaH * Q - pad);
    expect(f.hp).toBeLessThanOrEqual(f.maxHp);
    expect(Number.isInteger(f.x) && Number.isInteger(f.y) && Number.isInteger(f.hp)).toBe(true);
    expect(f.bufAttack).toBeLessThanOrEqual(r.inputBuffer);
  }
  if (s.dragon) expect(s.dragon.hp).toBeLessThanOrEqual(s.dragon.maxHp);
  expect(s.tick).toBeLessThanOrEqual(s.timeLimit);
}

describe('setup', () => {
  it('spawns the duel 480 px apart on the centre line, the arriver on the left facing east', () => {
    const s = newDuel('swordsman', 'archer');
    expect(s.tick).toBe(0);
    expect(COMBAT_TICK_HZ).toBe(60);
    expect([s.arenaW, s.arenaH]).toEqual([800, 448]);
    expect([s.a.x / Q, s.a.y / Q, s.b!.x / Q, s.b!.y / Q]).toEqual([160, 224, 640, 224]);
    expect([s.a.facing, s.b!.facing]).toEqual([0, 128]);
  });

  it('puts the challenger 320 px below the dragon in the 896x448 arena', () => {
    const s = createCombat(dragonFight('mage'), 1);
    expect([s.arenaW, s.arenaH]).toEqual([896, 448]);
    expect((s.a.y - s.dragon!.y) / Q).toBe(320);
    expect(s.b).toBeNull();
  });

  it('rejects malformed setups', () => {
    expect(() => createCombat({ kind: 'duel', a: duel('mage', 'ninja').a, b: null }, 1)).toThrow(
      RangeError,
    );
    expect(() =>
      createCombat({ ...duel('mage', 'ninja'), a: { ...duel('mage', 'ninja').a, hp: 0 } }, 1),
    ).toThrow(RangeError);
    expect(() =>
      createCombat({ kind: 'dragonFight', a: duel('mage', 'ninja').a, b: null }, 1),
    ).toThrow(RangeError);
  });
});

describe('determinism and purity', () => {
  it('replays bit-identically from (setup, seed, inputs)', () => {
    for (const seed of [1, 2, 3]) {
      const ia = randomInputs(seed, 3000);
      const ib = randomInputs(seed + 100, 3000);
      const x = play(newDuel('ninja', 'berserker', seed), ia, ib);
      const y = play(newDuel('ninja', 'berserker', seed), ia, ib);
      expect(y.final).toEqual(x.final);
      expect(y.events).toEqual(x.events);
      expect(x.states.map(hashCombatState)).toEqual(y.states.map(hashCombatState));
    }
  });

  it('never mutates its input state (deep-frozen) and returns a new object', () => {
    let s = deepFreeze(newDuel('archer', 'mage', 7));
    const inputs = randomInputs(9, 600);
    for (let t = 0; t < 600 && !s.outcome; t++) {
      const out = stepCombat(s, [inputs[t]!, inputs[(t * 7) % 600]!]);
      expect(out.state).not.toBe(s);
      s = deepFreeze(out.state);
    }
  });

  it('a finished fight is a fixed point', () => {
    const done = runCombat(duel('mage', 'ninja'), [createCombatBot(), createCombatBot()], 4);
    expect(done.result.winner === 'a' || done.result.winner === 'b').toBe(true);
    const s = play(newDuel('mage', 'ninja', 4), [], [], 100_000).final;
    const out = stepCombat(s, [idle, idle]);
    expect(out.state).toBe(s);
    expect(out.events).toEqual([]);
  });

  it('dragon choices depend only on the seed', () => {
    const a = play(createCombat(dragonFight('swordsman'), 11), [], [], 900);
    const b = play(createCombat(dragonFight('swordsman'), 11), [], [], 900);
    const c = play(createCombat(dragonFight('swordsman'), 12), [], [], 900);
    const kinds = (p: typeof a) => eventsOf(p.events, 'TelegraphStart').map((e) => e.kind);
    expect(kinds(b)).toEqual(kinds(a));
    expect(kinds(c)).not.toEqual(kinds(a));
  });
});

describe('invariants (seeded fuzz)', () => {
  it('keeps fighters in the arena, hp <= maxHp, and ends by the time limit', () => {
    for (let seed = 0; seed < 25; seed++) {
      const jobs = JOB_IDS;
      const ja = jobs[seed % 5]!;
      const jb = jobs[(seed * 3 + 1) % 5]!;
      const p = play(
        newDuel(ja, jb, seed),
        randomInputs(seed, 2700),
        randomInputs(seed + 50, 2700),
      );
      for (const s of p.states) checkInvariants(s);
      expect(p.final.outcome).not.toBeNull();
      expect(p.final.tick).toBeLessThanOrEqual(DEFAULT_COMBAT_RULES.timeLimit.duel);
    }
    for (let seed = 0; seed < 5; seed++) {
      const p = play(createCombat(dragonFight(JOB_IDS[seed]!), seed), randomInputs(seed, 4500));
      for (const s of p.states) checkInvariants(s);
      expect(p.final.outcome).not.toBeNull();
    }
  });

  it('every event carries the tick it happened on and a unique, stable id', () => {
    const p = play(newDuel('swordsman', 'ninja', 5), randomInputs(5, 2000), randomInputs(6, 2000));
    const ids = new Set<string>();
    for (const e of p.events) {
      expect(e.id.startsWith(`${e.tick}:${e.type}:`)).toBe(true);
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
    }
  });
});

describe('input model', () => {
  it('a press is a rising edge: holding attack does not repeat, re-pressing does', () => {
    const held = play(newDuel('ninja', 'mage'), Array(120).fill(input(0, 'a')), [], 120);
    expect(eventsOf(held.events, 'AttackStart').filter((e) => e.who === 'a')).toHaveLength(1);
    const mash = play(
      newDuel('ninja', 'mage'),
      Array.from({ length: 120 }, (_, t) => input(0, t % 30 === 0 ? 'a' : '')),
      [],
      120,
    );
    expect(
      eventsOf(mash.events, 'AttackStart').filter((e) => e.who === 'a').length,
    ).toBeGreaterThan(1);
  });

  it('buffers a press made during recovery for 6 live ticks', () => {
    // the greataxe lasts 14 + 5 + 20 = 39 ticks and has no follow-up
    const total = 39;
    const at = (late: number) =>
      Array.from({ length: 80 }, (_, t) => (t === 0 || t === total - late ? input(0, 'a') : idle));
    const starts = (late: number) =>
      eventsOf(play(newDuel('berserker', 'mage'), at(late), [], 80).events, 'AttackStart').filter(
        (e) => e.who === 'a',
      );
    expect(starts(5)).toHaveLength(2);
    expect(starts(5)[1]!.tick).toBe(total + 1);
    expect(starts(7)).toHaveLength(1);
  });

  it('moves 8 ways at walk speed, reaching top speed in 4 ticks', () => {
    const p = play(newDuel('swordsman', 'mage'), Array(10).fill(input(3)), [], 10);
    const v = p.states.map((s) => s.a.vx);
    const top = Math.round((190 * Q) / 60);
    expect(v[4]).toBe(top);
    expect(v[1]).toBeLessThan(top);
    const diag = play(newDuel('swordsman', 'mage'), Array(10).fill(input(4)), [], 10).final.a;
    expect(diag.vx).toBe(diag.vy);
  });
});

describe('hitstop and dash', () => {
  it('freezes the whole sim for the hitstop ticks after a landed hit', () => {
    let s = newDuel('swordsman', 'mage');
    s = { ...s, b: { ...s.b!, x: s.a.x + 50 * Q } };
    const p = play(s, [input(3, 'a')], [], 30);
    const hit = eventsOf(p.events, 'Hit')[0]!;
    expect(hit.hitstop).toBeGreaterThan(0);
    const at = p.states.findIndex((x) => x.tick === hit.tick);
    const frozen = p.states.slice(at + 1, at + 1 + hit.hitstop);
    for (const f of frozen) {
      expect(f.a.x).toBe(p.states[at]!.a.x);
      expect(f.b!.x).toBe(p.states[at]!.b!.x);
    }
  });

  it('a dash moves 128 px with i-frames on frames 1-10 and goes stale when spammed', () => {
    const p = play(newDuel('swordsman', 'mage'), [input(3, 'd')], [], 20);
    expect((p.final.a.x - p.states[0]!.a.x) / Q).toBeCloseTo(128, 0);
    const first = p.states[1]!.a;
    expect(first.iframeDelay === 0 && first.iframes > 0).toBe(true);
    expect(p.states[11]!.a.iframes).toBe(0);
    const spam = Array.from({ length: 200 }, (_, t) =>
      input(t % 120 < 60 ? 3 : 7, t % 2 === 0 ? 'd' : ''),
    );
    const q = play(newDuel('swordsman', 'mage'), spam, [], 200);
    expect(Math.max(...q.states.map((s) => s.a.dashStale))).toBeGreaterThan(0);
  });
});

describe('result', () => {
  it('matches the engine CombatResult shape and write-back rules', () => {
    for (let seed = 0; seed < 10; seed++) {
      const out = runCombat(
        duel('archer', 'berserker'),
        [createCombatBot(), createCombatBot('aggressive')],
        seed,
      );
      const r = out.result;
      expect(Object.keys(r).sort()).toEqual([
        'hpA',
        'hpB',
        'indomitableUsedA',
        'indomitableUsedB',
        'timedOut',
        'winner',
      ]);
      const winnerHp = r.winner === 'a' ? r.hpA : r.hpB!;
      expect(winnerHp).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(r.hpA) && Number.isInteger(r.hpB)).toBe(true);
    }
    const d = runCombat(dragonFight('swordsman'), [createCombatBot()], 3).result;
    expect(d.hpB).toBeNull();
    expect('indomitableUsedB' in d).toBe(false);
  });

  it('times out by hp ratio in a duel (tie -> arriver) and as a challenger loss vs the dragon', () => {
    const duelOut = play(newDuel('mage', 'mage'), [], [], 10_000).final;
    expect(duelOut.tick).toBe(DEFAULT_COMBAT_RULES.timeLimit.duel);
    expect(combatResult(duelOut)).toMatchObject({ winner: 'a', timedOut: true });
    const dragonOut = play(
      createCombat(dragonFight('mage'), 1),
      Array(5000).fill(idle),
      [],
      10_000,
    ).final;
    // an idle challenger dies or times out; either way the dragon wins
    expect(combatResult(dragonOut)?.winner).toBe('b');
  });

  it('the fire ring shrinks from 30 s to 40 s and burns fighters outside it', () => {
    let s = newDuel('mage', 'mage');
    s = { ...s, a: { ...s.a, x: 20 * Q, y: 20 * Q } };
    const p = play(s, [], [], 2700);
    expect(p.states.find((x) => x.tick === 1800)!.ringRadius).toBe(460);
    expect(p.states.find((x) => x.tick === 2400)!.ringRadius).toBe(180);
    const burns = eventsOf(p.events, 'Hit').filter((e) => e.attacker === 'ring');
    expect(burns.length).toBeGreaterThan(0);
    expect(burns.every((e) => e.dmg === 2)).toBe(true);
  });
});
