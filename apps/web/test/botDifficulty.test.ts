import { DEFAULT_RULES, JOB_IDS, type JobId } from '@dragon-rush/engine';
import {
  createCombat,
  createCombatBot,
  NO_INPUT,
  policyRandom,
  stepCombat,
} from '@dragon-rush/combat';
import { describe, expect, it, vi } from 'vitest';
import { createFightBotSource, FIGHT_BOT_LEVELS } from '../src/services/fight/botInput';
import { LocalSimProvider, ReplayProvider } from '../src/services/fight/simProvider';
import type {
  FightWorkerRequest,
  FightWorkerResponse,
} from '../src/services/fight/fightSimulation';

function fighter(job: JobId) {
  const stats = DEFAULT_RULES.jobs[job];
  return {
    job,
    hp: stats.hp,
    maxHp: stats.hp,
    atk: stats.atk,
    def: stats.def,
    indomitableAvailable: true,
  };
}

describe('local combat difficulty', () => {
  it.each(JOB_IDS)(
    'Easy %s loses clearly more often to the same Normal job without becoming idle',
    async (job) => {
      let wins = 0;
      let attacks = 0;
      let skills = 0;
      let movement = 0;
      const seeds = 20;
      for (let seed = 1; seed <= seeds; seed++) {
        for (const easySide of ['a', 'b'] as const) {
          const a = createFightBotSource(easySide === 'a' ? 'easy' : 'normal', seed, 'a');
          const b = createFightBotSource(easySide === 'b' ? 'easy' : 'normal', seed, 'b');
          const easy = easySide === 'a' ? a : b;
          const sample = easy.sample;
          easy.sample = (state, side) => {
            const input = sample(state, side);
            if (input.move !== 0) movement++;
            return input;
          };
          const provider = new LocalSimProvider(
            { kind: 'duel', a: fighter(job), b: fighter(job) },
            seed,
            [a, b],
          );
          while (!provider.curr.outcome) {
            for (const event of provider.step()) {
              if (!('who' in event) || event.who !== easySide) continue;
              if (event.type === 'AttackStart') attacks++;
              if (event.type === 'SkillUsed') skills++;
            }
          }
          if (provider.curr.outcome.winner === easySide) wins++;
        }
        if (seed % 5 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
      }
      expect(wins / (seeds * 2)).toBeLessThanOrEqual(0.3);
      expect(movement).toBeGreaterThan(0);
      expect(attacks).toBeGreaterThan(0);
      expect(skills).toBeGreaterThan(0);
    },
  );

  it.each([
    { level: 'normal' as const, style: 'balanced' as const, reaction: 10 },
    { level: 'hard' as const, style: 'aggressive' as const, reaction: 6 },
  ])('preserves every tick of the existing $level policy', ({ level, style, reaction }) => {
    for (const job of JOB_IDS) {
      let state = createCombat({ kind: 'duel', a: fighter(job), b: fighter(job) }, 733);
      const source = createFightBotSource(level, 733, 'a');
      const expected = createCombatBot(style, { reaction });
      const random = policyRandom(733, 1);
      for (let tick = 0; tick < 600 && !state.outcome; tick++) {
        const input = source.sample(state, 'a');
        expect(input).toEqual(expected.decide(state, 'a', random));
        state = stepCombat(state, [input, NO_INPUT]).state;
      }
    }
  });

  it('keeps Easy worker, live and replay inputs identical at per-tick cadence', async () => {
    for (const level of ['easy', 'normal', 'hard'] as const)
      expect(FIGHT_BOT_LEVELS[level].interval).toBe(1);
    const setup = { kind: 'duel' as const, a: fighter('mage'), b: fighter('archer') };
    const provider = new LocalSimProvider(setup, 42, [
      createFightBotSource('easy', 42, 'a'),
      createFightBotSource('easy', 42, 'b'),
    ]);
    while (!provider.curr.outcome) provider.step();
    const replay = new ReplayProvider(setup, 42, provider.inputs());
    while (!replay.curr.outcome) replay.step();
    expect(replay.curr).toEqual(provider.curr);
    expect(replay.result()).toEqual(provider.result());
    const postMessage = vi.fn<(message: FightWorkerResponse, transfer?: Transferable[]) => void>();
    const scope = {
      onmessage: null as ((event: MessageEvent<FightWorkerRequest>) => void) | null,
      postMessage,
    };
    vi.stubGlobal('self', scope);
    try {
      await import('../src/services/fight/fightSimulation.worker');
      scope.onmessage!({
        data: { id: 7, setup, seed: 42, level: 'easy' },
      } as MessageEvent<FightWorkerRequest>);
      expect(postMessage).toHaveBeenCalledOnce();
      const [message, transfer] = postMessage.mock.calls[0]!;
      expect(message).toEqual({
        id: 7,
        replay: { result: provider.result(), ticks: provider.curr.tick, inputs: provider.inputs() },
      });
      if ('replay' in message) expect(transfer?.[0]).toBe(message.replay.inputs.buffer);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
