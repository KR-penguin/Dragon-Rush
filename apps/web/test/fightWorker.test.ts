import { afterEach, expect, it, vi } from 'vitest';
import { LocalGameClient, type Scheduler } from '../src/services/LocalGameClient';
import { createFightBotSource } from '../src/services/fight/botInput';
import { simulateFight } from '../src/services/fight/simProvider';
import {
  createBatchedFightSimulation,
  createFightSimulationRunner,
  simulateBotFight,
} from '../src/services/fight/fightSimulation';
import type { GameUpdate } from '../src/services/gameClient';

interface Job {
  id: number;
  setup: Parameters<typeof simulateFight>[0];
  seed: number;
  level: 'normal';
}

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly requests: Job[] = [];
  readonly terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(job: Job) {
    this.requests.push(job);
  }
  finish() {
    const job = this.requests[0]!;
    const replay = simulateFight(job.setup, job.seed, [
      createFightBotSource(job.level, job.seed, 'a'),
      job.setup.b ? createFightBotSource(job.level, job.seed, 'b') : null,
    ]);
    this.onmessage?.({ data: { id: job.id, replay } } as MessageEvent);
    return replay;
  }
}

const workerRequest = {
  seed: 42,
  level: 'normal' as const,
  setup: {
    kind: 'dragonFight' as const,
    a: { job: 'mage' as const, hp: 40, maxHp: 40, atk: 4, def: 5, indomitableAvailable: false },
    b: null,
    dragon: { hp: 88, atk: 50, def: 10 },
  },
};

function preparingBotGame() {
  const tasks: (() => void)[] = [];
  const schedule: Scheduler = (task) => {
    tasks.push(task);
    return () => {};
  };
  const client = new LocalGameClient(
    {
      seed: 0,
      maxRounds: 25,
      seats: [
        { name: 'A', job: 'berserker', kind: 'bot', botName: 'heuristic:aggro' },
        { name: 'B', job: 'swordsman', kind: 'bot', botName: 'heuristic:aggro' },
      ],
    },
    schedule,
  );
  const updates: GameUpdate[] = [];
  client.subscribe((update) => updates.push(update));
  for (let i = 0; i < 10000 && tasks.length; i++) tasks.shift()!();
  expect(updates.at(-1)?.fight?.preparingReplay).toBe(true);
  return { client, updates };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

it('yields between fallback batches without changing the recorded fight', async () => {
  vi.useFakeTimers();
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5));
  const request = {
    seed: 42,
    level: 'normal' as const,
    setup: {
      kind: 'duel' as const,
      a: {
        job: 'swordsman' as const,
        hp: 53,
        maxHp: 53,
        atk: 5,
        def: 5,
        indomitableAvailable: true,
      },
      b: { job: 'archer' as const, hp: 39, maxHp: 39, atk: 6, def: 6, indomitableAvailable: false },
    },
  };
  const runner = createBatchedFightSimulation();
  const pending = runner.run(request);
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  await vi.runAllTimersAsync();
  expect(await pending).toEqual(simulateBotFight(request));
  runner.dispose();
});

it('cancels fallback work when the game is disposed', async () => {
  vi.useFakeTimers();
  const runner = createBatchedFightSimulation();
  const pending = Promise.resolve(
    runner.run({
      seed: 42,
      level: 'normal',
      setup: {
        kind: 'dragonFight',
        a: { job: 'mage', hp: 40, maxHp: 40, atk: 4, def: 5, indomitableAvailable: false },
        b: null,
        dragon: { hp: 88, atk: 50, def: 10 },
      },
    }),
  );
  const cancelled = expect(pending).rejects.toThrow('disposed');
  runner.dispose();
  await cancelled;
  expect(vi.getTimerCount()).toBe(0);
});

it('terminates a failed worker and falls back to the exact recorded fight', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('Worker', FakeWorker);
  const runner = createFightSimulationRunner();
  const worker = FakeWorker.instances[0]!;
  try {
    const pending = runner.run(workerRequest);
    const preventDefault = vi.fn();
    worker.onerror?.({ preventDefault } as unknown as ErrorEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(await pending).toEqual(simulateBotFight(workerRequest));
    expect(await runner.run(workerRequest)).toEqual(simulateBotFight(workerRequest));
    expect(worker.requests).toHaveLength(1);
  } finally {
    runner.dispose();
  }
});

it('rejects outstanding worker jobs on disposal and ignores their late replies', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('Worker', FakeWorker);
  const runner = createFightSimulationRunner();
  const worker = FakeWorker.instances[0]!;
  const published = vi.fn();
  const pending = Promise.resolve(runner.run(workerRequest)).then(published);
  const cancelled = expect(pending).rejects.toThrow('disposed');
  runner.dispose();
  worker.finish();
  await cancelled;
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(published).not.toHaveBeenCalled();
  await expect(runner.run(workerRequest)).rejects.toThrow('disposed');
});

it('does not publish a late prepared replay after the client is disposed', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('Worker', FakeWorker);
  const { client, updates } = preparingBotGame();
  const count = updates.length;
  client.dispose();
  FakeWorker.instances[0]!.finish();
  await Promise.resolve();
  await Promise.resolve();
  expect(updates).toHaveLength(count);
});

it('does not publish an old replay after the fight has already been settled', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('Worker', FakeWorker);
  const { client, updates } = preparingBotGame();
  try {
    const pending = updates.at(-1)!;
    expect(await client.reportFight(pending.fight!.id, 'dice')).toEqual({ ok: true });
    const count = updates.length;
    expect(updates.at(-1)!.version).toBeGreaterThan(pending.version);
    expect(updates.at(-1)!.fight).toBeNull();
    FakeWorker.instances[0]!.finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(updates).toHaveLength(count);
  } finally {
    client.dispose();
  }
});

it('keeps the browser responsive while a bot fight is prepared and publishes its exact replay at the same version', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('Worker', FakeWorker);
  const { client, updates } = preparingBotGame();
  try {
    expect(updates.at(-1)?.fight?.replay).toBeNull();
    const version = updates.at(-1)!.version;
    const replay = FakeWorker.instances[0]!.finish();
    await Promise.resolve();
    await Promise.resolve();
    const latest = updates.at(-1)!;
    expect(latest.version).toBe(version);
    expect(latest.presentationOnly).toBe(true);
    expect(latest.fight?.preparingReplay).toBe(false);
    expect(latest.fight?.replay).toEqual(replay);
  } finally {
    client.dispose();
  }
});
