import { describe, expect, it } from 'vitest';
import {
  combatResult,
  createCombat,
  createCombatBot,
  DEFAULT_COMBAT_RULES,
  policyRandom,
  stepCombat,
  type CombatEvent,
  type CombatState,
} from '../src/index';
import { statFighter } from './calibration';
import { dragonFight, eventsOf, idle, play, randomInputs } from './helpers';

const R = DEFAULT_COMBAT_RULES;

/** Bot-driven dragon fight keeping every state (states[i].tick === i). */
function botFight(
  seed: number,
  fighter = statFighter('swordsman', 70, 9, 8),
): { states: CombatState[]; events: CombatEvent[] } {
  const bot = createCombatBot('balanced');
  const random = policyRandom(seed, 1);
  let s = createCombat(dragonFight(fighter), seed);
  const states = [s];
  const events: CombatEvent[] = [];
  while (!s.outcome) {
    const out = stepCombat(s, [bot.decide(s, 'a', random)]);
    s = out.state;
    states.push(s);
    events.push(...out.events);
  }
  return { states, events };
}

describe('dragon script', () => {
  it('scales actual outgoing dragon hits after defense in real time', () => {
    const firstHit = (scale: number): number => {
      const rules = { ...R, damage: { ...R.damage, dragonDamageDealtScale: scale } };
      let state = createCombat(dragonFight(statFighter('swordsman', 5000, 1, 8)), 19, rules);
      while (!state.outcome) {
        const result = stepCombat(state, [idle]);
        const hit = result.events.find(
          (event) => event.type === 'Hit' && event.attacker === 'dragon',
        );
        if (hit?.type === 'Hit') return hit.dmg;
        state = result.state;
      }
      throw new Error('dragon did not land a hit');
    };
    const normal = firstHit(1);
    const reduced = firstHit(0.6);
    expect(reduced / normal).toBeCloseTo(0.6, 2);
  });

  it('scales the stronger board dragon for real-time fights', () => {
    const d = createCombat(dragonFight(statFighter('swordsman', 70, 9, 8)), 1).dragon!;
    expect(d.maxHp).toBe(194);
    expect(d.atk).toBe(55);
    expect(R.damage.dragonDamageTakenScale).toBe(0.3);
    expect(R.damage.dragonDamageDealtScale).toBe(0.6);
  });

  it('telegraphs every maneuver for 24+ live ticks and resolves within one live tick', () => {
    const wall = statFighter('swordsman', 5000, 1, 60);
    for (const seed of [1, 2, 3, 4]) {
      const { states, events } = botFight(seed, wall);
      const starts = eventsOf(events, 'TelegraphStart');
      expect(starts.length).toBeGreaterThan(3);
      for (const st of starts) {
        expect(st.ticks).toBeGreaterThanOrEqual(st.kind === 'meteor' ? 30 : 24);
        const end = eventsOf(events, 'TelegraphEnd').find(
          (e) => e.entity === st.entity && e.tick > st.tick,
        );
        if (!end) continue; // the fight ended first
        if (end.ticks === 0) continue; // cancelled by a phase roar
        // hitstop ticks freeze the sim, so count live ticks only
        let live = 0;
        for (let t = st.tick + 1; t <= end.tick; t++) if (states[t - 1]!.hitstop === 0) live += 1;
        // End events can land on either edge of the last live tick when hitstop ends.
        expect(live).toBeGreaterThanOrEqual(st.ticks - 1);
        expect(live).toBeLessThanOrEqual(st.ticks);
      }
    }
  });

  it('every 3rd damaging maneuver is Breath (gust does not count)', () => {
    const wall = statFighter('swordsman', 5000, 1, 60);
    for (const seed of [5, 6, 7]) {
      const { states, events } = botFight(seed, wall);
      let breaths = 0;
      for (let i = 1; i < states.length; i++) {
        const before = states[i - 1]!.dragon!.sinceBreath;
        const after = states[i]!.dragon!.sinceBreath;
        if (after === before) continue;
        if (after === 0) {
          expect(before).toBe(R.dragon.breathEvery - 1);
          if (states[i]!.dragon!.maneuver !== null)
            expect(states[i]!.dragon!.maneuver).toBe('breath');
          breaths++;
        } else {
          expect(after).toBe(before + 1);
          expect(after).toBeLessThan(R.dragon.breathEvery);
        }
      }
      expect(breaths).toBeGreaterThanOrEqual(2);
      expect(eventsOf(events, 'TelegraphStart').filter((e) => e.kind === 'breath')).toHaveLength(
        breaths,
      );
    }
  });

  it('changes phase at 60% and 25% HP with an invulnerable roar', () => {
    const strong = statFighter('berserker', 5000, 30, 60);
    const { states, events } = botFight(9, strong);
    const phases = eventsOf(events, 'PhaseChange');
    expect(phases.map((e) => e.phase)).toEqual([2, 3]);
    for (const ph of phases) {
      const d = states[ph.tick]!.dragon!;
      const pct = ph.phase === 2 ? R.dragon.phase2Pct : R.dragon.phase3Pct;
      expect(d.hp * 100).toBeLessThanOrEqual(pct * d.maxHp);
      expect(d.stage).toBe('roar');
      expect(d.invulnerable).toBe(true);
    }
    expect(combatResult(states.at(-1)!)?.winner).toBe('a');
  });

  it('the challenger loses at 60 s and the dragon soft-enrages at 20 s', () => {
    expect(R.timeLimit.dragonFight).toBe(60 * R.tickHz);
    expect(R.dragon.softEnrageTick).toBe(20 * R.tickHz);
    const wall = statFighter('swordsman', 5000, 1, 60);
    const p = play(createCombat(dragonFight(wall), 3), randomInputs(3, 6000), [], 6000);
    expect(p.final.tick).toBe(R.timeLimit.dragonFight);
    expect(combatResult(p.final)).toMatchObject({ winner: 'b', hpB: null, timedOut: true });
    expect(p.states.find((s) => s.tick === R.dragon.softEnrageTick + 1)!.dragon!.softEnraged).toBe(
      true,
    );
  });

  it('dragonDamageTakenScale applies exactly through the 1/1000 HP carry', () => {
    const { states, events } = botFight(2);
    const hits = eventsOf(events, 'Hit').filter((e) => e.target === 'dragon');
    expect(hits.length).toBeGreaterThan(10);
    const d0 = states[0]!.dragon!;
    const d1 = states.at(-1)!.dragon!;
    expect(hits.reduce((a, h) => a + h.dmg, 0)).toBe(d0.hp - d1.hp);
    expect(d1.chip).toBeGreaterThanOrEqual(0);
    expect(d1.chip).toBeLessThan(1000);
  });

  it('shows meaningful per-hit damage and rewards attack upgrades against the dragon', () => {
    const normal = eventsOf(botFight(2, statFighter('swordsman', 70, 9, 8)).events, 'Hit').filter(
      (e) => e.target === 'dragon',
    );
    const upgraded = eventsOf(
      botFight(2, statFighter('swordsman', 70, 12, 8)).events,
      'Hit',
    ).filter((e) => e.target === 'dragon');
    expect(normal.some((hit) => hit.dmg >= 3)).toBe(true);
    expect(upgraded.slice(0, 5).reduce((total, hit) => total + hit.dmg, 0)).toBeGreaterThan(
      normal.slice(0, 5).reduce((total, hit) => total + hit.dmg, 0),
    );
  });
});
