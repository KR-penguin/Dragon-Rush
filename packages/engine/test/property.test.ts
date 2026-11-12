import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  DEFAULT_RULES,
  getLegalActions,
  JOB_IDS,
  resolveCombatWithDice,
  withRules,
  type Action,
  type CombatMode,
  type GameEvent,
  type GameState,
  type JobId,
} from '../src/index';
import { deepFreeze, newGame } from './helpers';

const COMBAT_MODES: readonly CombatMode[] = ['dice', 'external'];
const rulesFor = (mode: CombatMode) =>
  withRules({ maxRounds: 25, combat: { ...DEFAULT_RULES.combat, mode } });

/** `null` in a trace stands for settling a pending fight with the dice resolver. */
type Step = Action | null;

/** One engine step: pending fights go to the dice resolver; board decisions use `pick` (fights do not consume a pick). */
function step(s: GameState, pick: number): { state: GameState; events: GameEvent[]; taken: Step } {
  if (s.pending?.phase === 'COMBAT') return { ...resolveCombatWithDice(s), taken: null };
  const legal = getLegalActions(s);
  const action = legal[pick % legal.length]!;
  return { ...applyAction(s, action), taken: action };
}

function play(jobs: JobId[], seed: number, picks: number[], mode: CombatMode) {
  let s = newGame(jobs, seed, rulesFor(mode));
  const trace: Step[] = [];
  const events: GameEvent[] = [];
  let decisions = 0;
  for (let i = 0; s.pending && i < 10_000; i++) {
    const r = step(s, picks[decisions % picks.length] ?? 0);
    if (r.taken) decisions++;
    trace.push(r.taken);
    events.push(...r.events);
    s = r.state;
  }
  return { final: s, trace, events };
}

const checkInvariants = (s: GameState) => {
  for (const p of s.players) {
    expect(p.coins).toBeGreaterThanOrEqual(0);
    for (const n of Object.values(p.items)) expect(n).toBeGreaterThanOrEqual(0);
    if (p.alive) {
      expect(p.hp).toBeGreaterThanOrEqual(1);
      expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    }
  }
  expect(s.pending === null).toBe(s.outcome !== null);
  if (s.pending?.phase === 'COMBAT') {
    expect(s.rules.combat.mode).toBe('external');
    expect(getLegalActions(s)).toEqual([]);
    expect(s.pending.actor).toBe(s.combat?.a);
  } else {
    expect(s.combat).toBeNull();
    if (s.pending) expect(getLegalActions(s).length).toBeGreaterThanOrEqual(2);
  }
};

const arbGame = fc.record({
  n: fc.integer({ min: 2, max: 4 }),
  seed: fc.integer({ min: 0, max: 2 ** 31 }),
  jobSeed: fc.integer({ min: 0, max: 1000 }),
  picks: fc.array(fc.nat(1000), { minLength: 1, maxLength: 64 }),
});

const jobsFor = (n: number, jobSeed: number): JobId[] => {
  const pool = [...JOB_IDS];
  const out: JobId[] = [];
  let x = jobSeed;
  for (let i = 0; i < n; i++) {
    const j = x % pool.length;
    out.push(pool.splice(j, 1)[0]!);
    x = Math.floor(x / 3) + 7;
  }
  return out;
};

describe.each(COMBAT_MODES)('engine properties (combat mode %s)', (mode) => {
  it('keeps invariants, never mutates inputs, and always terminates within maxRounds', () => {
    fc.assert(
      fc.property(arbGame, ({ n, seed, jobSeed, picks }) => {
        let s = deepFreeze(newGame(jobsFor(n, jobSeed), seed, rulesFor(mode)));
        let decisions = 0;
        for (let i = 0; s.pending && i < 10_000; i++) {
          checkInvariants(s);
          const r = step(s, picks[decisions % picks.length] ?? 0);
          if (r.taken) decisions++;
          s = deepFreeze(r.state);
        }
        checkInvariants(s);
        expect(s.outcome).not.toBeNull();
      }),
      { numRuns: 60 },
    );
  });

  it('is deterministic: same seed and actions give the same result', () => {
    fc.assert(
      fc.property(arbGame, ({ n, seed, jobSeed, picks }) => {
        const jobs = jobsFor(n, jobSeed);
        const a = play(jobs, seed, picks, mode);
        let s = newGame(jobs, seed, rulesFor(mode));
        for (const taken of a.trace)
          s = taken ? applyAction(s, taken).state : resolveCombatWithDice(s).state;
        expect(s).toEqual(a.final);
      }),
      { numRuns: 20 },
    );
  });
});

describe('combat mode equivalence', () => {
  it('external mode settled by resolveCombatWithDice replays dice mode exactly', () => {
    fc.assert(
      fc.property(arbGame, ({ n, seed, jobSeed, picks }) => {
        const jobs = jobsFor(n, jobSeed);
        const dice = play(jobs, seed, picks, 'dice');
        const external = play(jobs, seed, picks, 'external');
        expect(external.events).toEqual(dice.events);
        expect({ ...external.final, rules: null }).toEqual({ ...dice.final, rules: null });
      }),
      { numRuns: 40 },
    );
  });
});
