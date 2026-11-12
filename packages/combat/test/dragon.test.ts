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
  type DragonState,
  type ManeuverId,
} from '../src/index';
import { statFighter } from './calibration';
import { dragonFight, eventsOf, play, randomInputs } from './helpers';

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

/** Maneuvers in the order they started, read from the state stream. */
function maneuverStarts(states: readonly CombatState[]): ManeuverId[] {
  const out: ManeuverId[] = [];
  let prev: DragonState | null = null;
  for (const s of states) {
    const d = s.dragon!;
    const starting =
      d.maneuver !== null &&
      d.stageTick === 0 &&
      (d.stage === 'telegraph' || (d.stage === 'active' && d.maneuver === 'volley'));
    const same =
      prev !== null &&
      prev.maneuver === d.maneuver &&
      prev.stage === d.stage &&
      prev.stageTick === 0;
    if (starting && !same && d.maneuver) out.push(d.maneuver);
    prev = d;
  }
  return out;
}

describe('dragon script', () => {
  it('telegraphs every maneuver for 24+ live ticks and resolves it exactly when announced', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { states, events } = botFight(seed);
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
        expect(live).toBe(st.ticks);
      }
    }
  });

  it('every 3rd damaging maneuver is Breath (gust does not count)', () => {
    for (const seed of [5, 6, 7]) {
      const seq = maneuverStarts(botFight(seed).states).filter((m) => m !== 'gust');
      expect(seq.length).toBeGreaterThanOrEqual(6);
      seq.forEach((m, i) =>
        expect(m === 'breath').toBe(i % R.dragon.breathEvery === R.dragon.breathEvery - 1),
      );
    }
  });

  it('changes phase at 60% and 25% HP with an invulnerable roar', () => {
    const strong = statFighter('berserker', 200, 30, 20);
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

  it('the challenger loses at the time limit and the dragon soft-enrages at 50 s', () => {
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
});
