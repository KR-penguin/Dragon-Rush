import { afterEach, expect, it, vi } from 'vitest';
import { CONFIRM_BOT_A, CONFIRM_BOT_B, FIGHT_S2C, decodeFightConfirm } from '@dragon-rush/protocol';
import { startServer, type ServerHandle } from '../../server/src/app';
import { OnlineSession } from '../src/services/onlineSession';
import type { GameUpdate } from '../src/services/gameClient';
import type { FightSession } from '../src/services/fight/types';
import { KeyTracker } from '../src/services/fight/keyboardInput';

// Keep the production input, network, rollback, and settlement path; shorten only the
// duel clock so this integration test does not spend 45 seconds waiting for a timeout.
vi.mock('@dragon-rush/combat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dragon-rush/combat')>();
  return {
    ...actual,
    DEFAULT_COMBAT_RULES: {
      ...actual.DEFAULT_COMBAT_RULES,
      timeLimit: { ...actual.DEFAULT_COMBAT_RULES.timeLimit, duel: 300 },
    },
  };
});

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomInt: (min: number, max?: number): number => {
      if (min === 0 && max === 2 ** 31) return 0x40000000;
      if (min === 0 && max === 2 ** 47) return 42;
      if (min === 0 && max === 0x100000000) return 12345;
      return max === undefined ? actual.randomInt(min) : actual.randomInt(min, max);
    },
  };
});

const waitFor = async (check: () => boolean, timeoutMs = 60_000): Promise<void> => {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('timed out waiting for online PvP');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

let server: ServerHandle | null = null;
const sessions: OnlineSession[] = [];
const fights: FightSession[] = [];

afterEach(async () => {
  for (const fight of fights.splice(0)) fight.dispose();
  for (const session of sessions.splice(0)) session.disconnect();
  await server?.close();
  server = null;
  vi.unstubAllGlobals();
});

it('plays a two-human shared-tile duel through both web fight sessions and returns to the board', async () => {
  vi.stubGlobal('document', {
    hidden: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) =>
    setTimeout(() => callback(performance.now()), 16),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));

  server = await startServer(
    {
      port: 0,
      host: '127.0.0.1',
      turnTimeoutMs: 30_000,
      reconnectGraceMs: 2_000,
      botActionDelayMs: 0,
      maxConsecutiveTimeouts: 3,
      modelsDir: 'nonexistent-models-dir',
      webDistDir: null,
      roomTtlMs: 60_000,
      messagesPerSecond: 1000,
    },
    { quiet: true },
  );
  const alice = await OnlineSession.connect(server.url);
  const bob = await OnlineSession.connect(server.url);
  sessions.push(alice, bob);
  const created = await alice.createRoom('Alice');
  if (!created.ok) throw new Error(created.error.code);
  expect((await bob.joinRoom(created.data.roomCode, 'Bob')).ok).toBe(true);
  expect((await alice.configure(null, false)).ok).toBe(true);
  expect((await alice.selectJob('swordsman')).ok).toBe(true);
  expect((await bob.selectJob('archer')).ok).toBe(true);
  expect((await bob.setReady(true)).ok).toBe(true);

  const clients = [alice.createGameClient(), bob.createGameClient()] as const;
  const latest: (GameUpdate | null)[] = [null, null];
  clients.forEach((client, index) => client.subscribe((update) => (latest[index] = update)));
  expect((await alice.start()).ok).toBe(true);
  await waitFor(() => latest.every((update) => update !== null));

  let boardActions = 0;
  let singleTargetConfirmation = false;
  for (; boardActions < 2000; boardActions++) {
    if (latest.some((update) => update?.pending?.phase === 'COMBAT')) break;
    const index = latest.findIndex((update) => update?.legalActions.length);
    if (index < 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      continue;
    }
    const update = latest[index]!;
    if (update.pending?.phase === 'CHOOSE_PVP_TARGET') {
      expect(update.legalActions).toHaveLength(1);
      expect(update.legalActions[0]?.type).toBe('CHOOSE_PVP_TARGET');
      expect(update.events.map((event) => event.type)).toContain('PvpTriggered');
      singleTargetConfirmation = true;
    }
    const action =
      update.legalActions.find(
        (candidate) => candidate.type === 'SHIELD_DECISION' && !candidate.use,
      ) ??
      update.legalActions.find((candidate) => candidate.type === 'ROLL_DICE') ??
      update.legalActions.find((candidate) => candidate.type === 'END_TURN') ??
      update.legalActions.find((candidate) => candidate.type !== 'CHALLENGE_DRAGON') ??
      update.legalActions[0]!;
    const result = await clients[index]!.submit(action, update.version);
    if (!result.ok && result.code !== 'STALE_VERSION') throw new Error(result.code);
  }
  expect(boardActions).toBeLessThan(2000);
  expect(singleTargetConfirmation).toBe(true);
  await waitFor(() =>
    latest.every((update) => update?.fight !== null && update?.fight !== undefined),
  );
  const [left, right] = latest as [GameUpdate, GameUpdate];
  expect(left.pending?.phase).toBe('COMBAT');
  expect(right.pending?.phase).toBe('COMBAT');
  expect(left.publicState.combat?.kind).toBe('duel');
  expect(left.fight?.id).toBe(right.fight?.id);
  const aliceRole = left.fight?.online?.start.you;
  const bobRole = right.fight?.online?.start.you;
  expect(aliceRole?.role).toBe('fighter');
  expect(bobRole?.role).toBe('fighter');
  expect(
    [
      aliceRole?.role === 'fighter' ? aliceRole.seat : null,
      bobRole?.role === 'fighter' ? bobRole.seat : null,
    ].sort(),
  ).toEqual([0, 1]);
  const request = left.publicState.combat!;
  expect(left.publicState.players[request.a]?.position).toBe(
    left.publicState.players[request.b!]?.position,
  );

  const inputsSeen = [false, false];
  alice.socket.on(FIGHT_S2C.confirm, (raw: unknown) => {
    const packet = decodeFightConfirm(raw);
    for (const tick of packet?.ticks ?? []) {
      if (tick.a !== 0 && !(tick.flags & CONFIRM_BOT_A)) inputsSeen[0] = true;
      if (tick.b !== 0 && !(tick.flags & CONFIRM_BOT_B)) inputsSeen[1] = true;
    }
  });
  const keys = [new KeyTracker(), new KeyTracker()];
  keys[0]!.keyDown({
    code: aliceRole?.role === 'fighter' && aliceRole.seat === 0 ? 'KeyD' : 'KeyA',
  });
  keys[0]!.keyDown({ code: 'KeyJ' });
  keys[1]!.keyDown({ code: bobRole?.role === 'fighter' && bobRole.seat === 0 ? 'KeyD' : 'KeyA' });
  keys[1]!.keyDown({ code: 'KeyJ' });
  const results: ReturnType<FightSession['result']>[] = [null, null];
  clients.forEach((client, index) => {
    const fight = client.createFightSession(latest[index]!.fight!, keys[index]!);
    fights.push(fight);
    fight.onEnd((result) => (results[index] = result));
    fight.start();
  });
  await waitFor(() => results.every((result) => result !== null));
  expect(results[0]).toEqual(results[1]);
  expect(inputsSeen).toEqual([true, true]);
  expect(fights.every((fight) => fight.frame().curr.tick > 0)).toBe(true);

  for (const client of clients) expect((await client.reportFight()).ok).toBe(true);
  await waitFor(() => latest.every((update) => update?.fight === null));
  expect(latest[0]!.publicState.combat).toBeNull();
  const winner = results[0]!.winner === 'a' ? request.a : request.b;
  expect(latest[0]!.publicState.outcome).toEqual({ kind: 'lastSurvivor', winner });
  expect(latest[0]!.publicState.outcome).toEqual(latest[1]!.publicState.outcome);
  clients.forEach((client) => client.dispose());
}, 90_000);
