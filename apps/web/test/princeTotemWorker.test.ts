import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalGameClient, type Scheduler } from '../src/services/LocalGameClient';
import type {
  FightWorkerRequest,
  FightWorkerResponse,
} from '../src/services/fight/fightSimulation';
import type { GameUpdate } from '../src/services/gameClient';

const require = createRequire(import.meta.url);
const threads: NodeWorker[] = [];
const requests: FightWorkerRequest[] = [];
const errors: Error[] = [];

/** Runs the production browser worker module on a native thread with the same message contract. */
class ThreadWorker {
  onmessage: ((event: MessageEvent<FightWorkerResponse>) => void) | null = null;
  onerror: ((event: Pick<ErrorEvent, 'preventDefault'>) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  private readonly thread: NodeWorker;

  constructor(url: URL) {
    this.thread = new NodeWorker(
      `
      require(${JSON.stringify(require.resolve('tsx/cjs'))});
      const { parentPort } = require('node:worker_threads');
      globalThis.self = {
        onmessage: null,
        postMessage: (message, transfer) => parentPort.postMessage(message, transfer),
      };
      require(${JSON.stringify(fileURLToPath(url))});
      parentPort.on('message', data => self.onmessage({ data }));
    `,
      { eval: true },
    );
    threads.push(this.thread);
    this.thread.on('message', (data: FightWorkerResponse) =>
      this.onmessage?.({ data } as MessageEvent<FightWorkerResponse>),
    );
    this.thread.on('error', (error) => {
      errors.push(error);
      this.onerror?.({ preventDefault() {} });
    });
    this.thread.on('messageerror', () => this.onmessageerror?.());
  }

  postMessage(request: FightWorkerRequest): void {
    requests.push(request);
    this.thread.postMessage(request);
  }

  terminate(): void {
    void this.thread.terminate();
  }
}

afterEach(async () => {
  await Promise.all(threads.splice(0).map((thread) => thread.terminate()));
  requests.length = 0;
  errors.length = 0;
  vi.unstubAllGlobals();
});

it('preserves a consumed totem bonus through native worker preparation and restores board maximum HP on settlement', async () => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('Worker', ThreadWorker);
  const tasks: (() => void)[] = [];
  const schedule: Scheduler = (task) => {
    tasks.push(task);
    return () => {
      const index = tasks.indexOf(task);
      if (index >= 0) tasks.splice(index, 1);
    };
  };
  const client = new LocalGameClient(
    {
      seed: 42,
      debug: true,
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
  try {
    const actor = updates.at(-1)!.pending!.actor;
    const originalMaxHp = 50;
    client.debugPatchPlayer(actor, {
      hp: 1,
      maxHp: originalMaxHp,
      atk: 1000,
      def: 1000,
      coins: 0,
      items: { teleport: 0, shield: 0, princeTotem: 2 },
    });
    tasks.shift()!();
    const preparing = updates.at(-1)!;
    const bonus = preparing.publicState.rules.princeTotemMaxHpBonus;
    expect(preparing.fight?.preparingReplay).toBe(true);
    expect(preparing.fight?.request).toEqual({
      kind: 'dragonFight',
      a: actor,
      b: null,
      princeTotemBonusA: bonus,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.setup.a).toMatchObject({
      hp: originalMaxHp + bonus,
      maxHp: originalMaxHp + bonus,
    });
    await vi.waitFor(() => expect(updates.at(-1)?.fight?.replay).not.toBeNull(), {
      timeout: 15_000,
    });
    const ready = updates.at(-1)!;
    expect(errors).toEqual([]);
    expect(ready.version).toBe(preparing.version);
    expect(ready.presentationOnly).toBe(true);
    expect(ready.fight?.preparingReplay).toBe(false);
    expect(ready.fight?.request).toEqual(preparing.fight!.request);
    expect(ready.publicState.players[actor]?.items.princeTotem).toBe(1);
    expect(await client.reportFight(ready.fight!.id, ready.fight!.replay!.result)).toEqual({
      ok: true,
    });
    const settled = updates.at(-1)!.publicState.players[actor]!;
    expect(settled.maxHp).toBe(originalMaxHp);
    expect(settled.hp).toBeLessThanOrEqual(originalMaxHp);
    expect(settled.items.princeTotem).toBe(1);
  } finally {
    client.dispose();
  }
});
