import { describe, expect, it } from 'vitest';
import {
  combatResult,
  computeDamage,
  computeDamageQ8,
  createCombat,
  DEFAULT_COMBAT_RULES,
  type CombatState,
  type FighterSetup,
} from '../src/index';
import { baseFighter, duel, eventsOf, idle, input, play } from './helpers';

const Q = 256;
const R = DEFAULT_COMBAT_RULES;
const power = (id: keyof typeof R.moves): number => {
  const m = R.moves[id];
  if (m.type === 'melee' || m.type === 'rune') return m.hit.power;
  if (m.type === 'shot') return m.projectile.hit.power;
  throw new Error(`no power for ${id}`);
};

/** Puts b `gap` px east of a on the centre line (a faces east). */
function closeDuel(a: FighterSetup, b: FighterSetup, gap: number): CombatState {
  const s = createCombat(duel(a, b), 1);
  return { ...s, b: { ...s.b!, x: s.a.x + gap * Q } };
}

describe('불굴 Last Stand (swordsman)', () => {
  const victim = (available: boolean): FighterSetup => ({
    ...baseFighter('swordsman'),
    hp: 3,
    indomitableAvailable: available,
  });

  it('survives the first lethal hit at 1 HP with 60 ticks of invulnerability, once per game', () => {
    const p = play(closeDuel(baseFighter('berserker'), victim(true), 60), [input(3, 'a')], [], 40);
    const ls = eventsOf(p.events, 'LastStand');
    expect(ls).toHaveLength(1);
    const after = p.states.find((s) => s.tick === ls[0]!.tick)!;
    expect(after.b!.hp).toBe(1);
    expect(after.b!.lastStandUsed).toBe(true);
    expect(after.b!.iframes).toBe(R.passives.lastStandIframes);
    expect(after.hitstop).toBe(R.hitstop.lastStand);
    expect(p.final.outcome).toBeNull();
  });

  it('is reported in the result and does nothing when already used on the board', () => {
    const s = closeDuel(baseFighter('berserker'), victim(false), 60);
    const p = play(s, [input(3, 'a')], [], 40);
    expect(eventsOf(p.events, 'LastStand')).toHaveLength(0);
    expect(combatResult(p.final)).toMatchObject({ winner: 'a', hpB: 0, indomitableUsedB: false });
    const used = play(
      closeDuel(baseFighter('berserker'), { ...victim(true), hp: 1 }, 60),
      [input(3, 'a')],
      [],
      2700,
    );
    expect(used.final.b!.lastStandUsed).toBe(true);
  });
});

describe('선제 사격 First Strike (archer)', () => {
  it('starts nocked: the first press fires a full shot at once, the first landed hit gets +3', () => {
    const target = baseFighter('mage');
    const p = play(createCombat(duel(baseFighter('archer'), target), 1), [input(3, 'a')], [], 120);
    const spawn = eventsOf(p.events, 'ProjectileSpawn')[0]!;
    expect(spawn.tick).toBe(1);
    expect(spawn.kind).toBe('fullShot');
    const hit = eventsOf(p.events, 'Hit')[0]!;
    expect(hit.firstStrike).toBe(true);
    expect(hit.dmg).toBe(
      computeDamageQ8(R, power('fullShot'), 6, 1, target.def, 1) / Q +
        R.passives.archerFirstStrikeBonus,
    );
    expect(p.final.a.firstStrikePending).toBe(false);
  });

  it('only the first landed hit gets the bonus', () => {
    const script = Array.from({ length: 400 }, (_, t) => (t % 40 === 0 ? input(3, 'a') : input(3)));
    const p = play(
      closeDuel(baseFighter('archer'), baseFighter('berserker'), 300),
      script,
      [],
      400,
    );
    const hits = eventsOf(p.events, 'Hit').filter((e) => e.attacker === 'a');
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.filter((h) => h.firstStrike)).toHaveLength(1);
  });
});

describe('마력 관통 Arcane Pierce (mage)', () => {
  it('every mage hit uses DEF / 2', () => {
    const target = { ...baseFighter('swordsman'), def: 9 };
    const p = play(closeDuel(baseFighter('mage'), target, 200), [input(3, 'a')], [], 90);
    const hit = eventsOf(p.events, 'Hit')[0]!;
    expect(hit.pierce).toBe(true);
    expect(hit.dmg).toBe(computeDamageQ8(R, power('bolt'), 4, 1, 9, 2) / Q);
    expect(hit.dmg).toBeGreaterThan(computeDamage(R, power('bolt'), 4, 1, 9, 1));
  });
});

describe('fractional duel damage', () => {
  it('accumulates Q8 damage across hits and writes the ceiling to board HP', () => {
    const victim = baseFighter('berserker');
    const script = Array.from({ length: 180 }, (_, t) => (t % 40 === 0 ? input(3, 'a') : idle));
    const fight = play(closeDuel(baseFighter('mage'), victim, 160), script, [], 180);
    const hits = eventsOf(fight.events, 'Hit')
      .filter((e) => e.target === 'b')
      .slice(0, 2);
    expect(hits).toHaveLength(2);
    const exact = victim.hp * Q - Math.round((hits[0]!.dmg + hits[1]!.dmg) * Q);
    const after = fight.states.find((s) => s.tick === hits[1]!.tick)!;
    expect(after.b!.hpQ8).toBe(exact);
    expect(after.b!.hp).toBe(Math.ceil(exact / Q));
  });
});

describe('회피 Evade (ninja)', () => {
  it('every 8th incoming damage instance misses, fire-ring ticks included', () => {
    let s = createCombat(duel(baseFighter('ninja'), baseFighter('mage')), 1);
    s = { ...s, tick: 2400, ringRadius: 180, a: { ...s.a, x: 20 * Q, y: 20 * Q } };
    const p = play(s, [], [], 400);
    const onNinja = p.events.filter(
      (e) =>
        (e.type === 'Hit' || e.type === 'Evade') &&
        ('target' in e ? e.target === 'a' : e.who === 'a'),
    );
    expect(onNinja.length).toBeGreaterThanOrEqual(8);
    expect(onNinja.slice(0, 8).map((e) => e.type)).toEqual([
      'Hit',
      'Hit',
      'Hit',
      'Hit',
      'Hit',
      'Hit',
      'Hit',
      'Evade',
    ]);
  });
});

describe('광폭화 Rage (berserker)', () => {
  it('turns on at hp <= 50% with an event and multiplies ATK by 13/10', () => {
    const berserker: FighterSetup = { ...baseFighter('berserker'), hp: 24 };
    const p = play(closeDuel(baseFighter('swordsman'), berserker, 50), [input(3, 'a')], [], 30);
    expect(eventsOf(p.events, 'RageOn').map((e) => e.who)).toEqual(['b']);
    const raged: FighterSetup = { ...baseFighter('berserker'), hp: 20 };
    const q = play(closeDuel(raged, baseFighter('mage'), 60), [input(3, 'a')], [], 40);
    const hit = eventsOf(q.events, 'Hit')[0]!;
    expect(hit.rage).toBe(true);
    expect(hit.dmg).toBe(computeDamageQ8(R, power('greataxe'), 5 * 13, 10, 5, 1) / Q);
  });
});

describe('kits', () => {
  it('swordsman parry negates a melee hit and staggers a non-armored attacker', () => {
    const s = closeDuel(baseFighter('ninja'), baseFighter('swordsman'), 40);
    const p = play(
      { ...s, b: { ...s.b!, facing: 128 } },
      [idle, idle, input(3, 'a')],
      [input(7, 's')],
      40,
    );
    expect(eventsOf(p.events, 'Parry')).toHaveLength(1);
    expect(eventsOf(p.events, 'Hit').filter((e) => e.target === 'b')).toHaveLength(0);
    expect(eventsOf(p.events, 'Hit').some((e) => e.attacker === 'b' && e.kind === 'counter')).toBe(
      true,
    );
  });

  it('ninja backstab: a hit from behind is stronger', () => {
    const s = closeDuel(baseFighter('ninja'), baseFighter('mage'), 40);
    // the mage faces east, away from the ninja on its west side
    const p = play({ ...s, b: { ...s.b!, facing: 0 } }, [input(3, 'a')], [], 20);
    const hit = eventsOf(p.events, 'Hit')[0]!;
    expect(hit.backstab).toBe(true);
    expect(hit.dmg).toBe(
      computeDamageQ8(
        R,
        Math.round((power('dagger1') * R.jobs.ninja.backstabPct) / 100),
        4,
        1,
        5,
        1,
      ) / Q,
    );
  });

  it('mage bolts are absorbed by a timely parry while arrows are reflected', () => {
    // b fires west at a parrying swordsman 200 px away; the parry window covers each projectile's arrival
    const vs = (job: 'mage' | 'archer', parryAt: number) => {
      const s = closeDuel(baseFighter('swordsman'), baseFighter(job), 200);
      const a = Array.from({ length: 60 }, (_, t) =>
        t >= parryAt && t < parryAt + 3 ? input(3, 's') : idle,
      );
      return play(s, a, [input(7, 'a')], 60);
    };
    const arrow = vs('archer', 3);
    expect(eventsOf(arrow.events, 'Parry').map((e) => e.reflected)).toEqual([true]);
    const bolt = vs('mage', 22);
    expect(eventsOf(bolt.events, 'Parry').map((e) => e.reflected)).toEqual([false]);
    expect(eventsOf(bolt.events, 'Hit').some((e) => e.target === 'a' && e.kind === 'bolt')).toBe(
      false,
    );
    expect(eventsOf(bolt.events, 'Hit').some((e) => e.kind === 'counter')).toBe(false);
    expect(bolt.states.some((s) => s.a.move === 'parry' && s.a.phase === 'active')).toBe(true);
  });
});
