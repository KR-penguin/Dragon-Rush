import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyAction, getLegalActions, JOB_IDS, withRules, type Action, type GameState, type JobId } from '../src/index';
import { deepFreeze, newGame } from './helpers';

function play(jobs: JobId[], seed: number, picks: number[], maxRounds = 25) {
  let s = newGame(jobs, seed, withRules({ maxRounds }));
  const trace: Action[] = [];
  let i = 0;
  while (s.pending && i < 5000) {
    const legal = getLegalActions(s);
    const action = legal[(picks[i % picks.length] ?? 0) % legal.length]!;
    trace.push(action);
    s = applyAction(s, action).state;
    i++;
  }
  return { final: s, trace };
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
  if (s.pending) expect(getLegalActions(s).length).toBeGreaterThanOrEqual(2);
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

describe('engine properties', () => {
  it('keeps invariants, never mutates inputs, and always terminates within maxRounds', () => {
    fc.assert(
      fc.property(arbGame, ({ n, seed, jobSeed, picks }) => {
        let s = deepFreeze(newGame(jobsFor(n, jobSeed), seed, withRules({ maxRounds: 25 })));
        let steps = 0;
        while (s.pending && steps < 5000) {
          checkInvariants(s);
          const legal = getLegalActions(s);
          const action = legal[(picks[steps % picks.length] ?? 0) % legal.length]!;
          s = deepFreeze(applyAction(s, action).state);
          steps++;
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
        const a = play(jobs, seed, picks);
        let s = newGame(jobs, seed, withRules({ maxRounds: 25 }));
        for (const action of a.trace) s = applyAction(s, action).state;
        expect(s).toEqual(a.final);
      }),
      { numRuns: 20 },
    );
  });
});
