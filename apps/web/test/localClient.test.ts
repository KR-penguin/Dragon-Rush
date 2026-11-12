import { describe, expect, it } from 'vitest';
import { LocalGameClient, type Scheduler } from '../src/services/LocalGameClient';
import type { GameUpdate } from '../src/services/gameClient';
import { createGameStore } from '../src/store/gameStore';

/** Manual scheduler: bot moves run only when the test flushes them. */
function manualScheduler() {
  const tasks: (() => void)[] = [];
  const schedule: Scheduler = (fn) => {
    tasks.push(fn);
    return () => {
      const i = tasks.indexOf(fn);
      if (i >= 0) tasks.splice(i, 1);
    };
  };
  const flush = (max = 10_000) => {
    for (let i = 0; i < max && tasks.length; i++) tasks.shift()!();
  };
  return { schedule, flush, pending: () => tasks.length };
}

describe('LocalGameClient', () => {
  it('lets the human act only on their decisions and runs bots', async () => {
    const sched = manualScheduler();
    const client = new LocalGameClient(
      {
        seed: 12,
        maxRounds: 40,
        // Board-flow test: fights settle with dice (real-time fights are covered in localFight.test.ts).
        fightMode: () => 'dice',
        seats: [
          { name: '나', job: 'swordsman', kind: 'human' },
          { name: '봇', job: 'mage', kind: 'bot', botName: 'heuristic:growth' },
        ],
      },
      sched.schedule,
    );
    const updates: GameUpdate[] = [];
    client.subscribe((u) => updates.push(u));
    const human = updates[0]!.seats.find((s) => s.kind === 'human')!.seat;
    for (let i = 0; i < 2000; i++) {
      sched.flush();
      const u = updates.at(-1)!;
      if (!u.pending) break;
      expect(u.pending.actor).toBe(human);
      expect(u.legalActions.length).toBeGreaterThanOrEqual(2);
      const action = u.legalActions.find((a) => a.type !== 'CHALLENGE_DRAGON') ?? u.legalActions[0]!;
      const r = await client.submit(action, u.version);
      expect(r.ok).toBe(true);
    }
    expect(updates.at(-1)!.publicState.outcome).not.toBeNull();
    client.dispose();
  });

  it('rejects stale versions and illegal actions', async () => {
    const client = new LocalGameClient(
      {
        seed: 3,
        seats: [
          { name: 'A', job: 'archer', kind: 'human' },
          { name: 'B', job: 'ninja', kind: 'human' },
        ],
      },
      manualScheduler().schedule,
    );
    let latest!: GameUpdate;
    client.subscribe((u) => (latest = u));
    expect(latest.controllableSeats).toHaveLength(2);
    expect((await client.submit({ type: 'END_TURN' }, latest.version)).ok).toBe(false);
    expect(await client.submit({ type: 'ROLL_DICE' }, latest.version + 5)).toEqual({ ok: false, code: 'STALE_VERSION' });
    expect((await client.submit({ type: 'ROLL_DICE' }, latest.version)).ok).toBe(true);
  });
});

describe('game store animation queue', () => {
  it('queues events, animates them into the display and snaps at the end', async () => {
    const store = createGameStore();
    const client = new LocalGameClient(
      { seed: 5, seats: [{ name: 'A', job: 'archer', kind: 'human' }, { name: 'B', job: 'mage', kind: 'human' }] },
      manualScheduler().schedule,
    );
    store.getState().attach(client);
    while (store.getState().advance() !== null);
    expect(store.getState().log.length).toBeGreaterThan(0);
    const before = store.getState().display!.players[0]!.position;
    await store.getState().submit({ type: 'ROLL_DICE' });
    expect(store.getState().queue.length).toBeGreaterThan(0);
    expect(store.getState().display!.players[0]!.position).toBe(before);
    while (store.getState().advance() !== null);
    expect(store.getState().display).toEqual(store.getState().latest!.publicState);
    store.getState().detach();
  });
});
