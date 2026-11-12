import { EventEmitter } from 'node:events';
import { COMBAT_PACK_VERSION, DEFAULT_COMBAT_RULES, hashCombatRules } from '@dragon-rush/combat';
import { DEFAULT_RULES, withRules } from '@dragon-rush/engine';
import { FIGHT_S2C, S2C, type FightStartMsg } from '@dragon-rush/protocol';
import { combatBuildId, NETCODE_VERSION } from '@dragon-rush/netcode';
import { expect, it, vi } from 'vitest';
import { GameSession, type SessionNotifier } from '../../server/src/game/GameSession';
import { OnlineGameClient } from '../src/services/OnlineGameClient';
import type { GameUpdate } from '../src/services/gameClient';
import type { OnlineSession } from '../src/services/onlineSession';
import { createGameStore } from '../src/store/gameStore';

it('keeps fight:start received before the COMBAT update and applies the final board result', async () => {
  let launch: Parameters<NonNullable<SessionNotifier['fightStarted']>>[0] | null = null;
  const game = new GameSession(
    {
      seats: [
        { lobbySeat: 0, kind: 'human', playerId: 'a', name: 'Alice', job: 'swordsman' },
        { lobbySeat: 1, kind: 'bot', playerId: null, name: 'Bot', job: 'archer' },
      ],
      rules: withRules({ combat: { ...DEFAULT_RULES.combat, mode: 'external' } }, DEFAULT_RULES),
      seed: 42,
      turnTimeoutMs: 50_000,
      reconnectGraceMs: 2_000,
      botActionDelayMs: 0,
      maxConsecutiveTimeouts: 3,
    },
    {
      update: () => {},
      seatStatus: () => {},
      ended: () => {},
      fightStarted: (fight) => {
        launch = fight;
      },
    },
  );
  const actor = game.publicState.pending!.actor;
  const pre = game.updateFor('a', []);
  game.submit(actor, { type: 'CHALLENGE_DRAGON' }, game.version, 'human');
  const combat = game.updateFor('a', []);
  expect(launch).not.toBeNull();
  const fight = launch!;
  const start: FightStartMsg = {
    fightId: fight.id,
    kind: fight.setup.kind,
    seed: fight.seed,
    setup: fight.setup,
    rules: DEFAULT_COMBAT_RULES,
    rulesHash: hashCombatRules(DEFAULT_COMBAT_RULES),
    packVersion: COMBAT_PACK_VERSION,
    combatBuildId: combatBuildId(NETCODE_VERSION),
    seats: [{ engineSeat: actor, playerId: 'a', name: 'Alice', controller: 'human' }],
    you: { role: 'fighter', seat: 0 },
    prerollTicks: 90,
    maxTicks: DEFAULT_COMBAT_RULES.timeLimit.dragonFight,
    pveHoldTicks: 15,
    pvpHoldTicks: 6,
  };
  const socket = new EventEmitter();
  const client = new OnlineGameClient({
    socket,
    call: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as OnlineSession);
  const updates: GameUpdate[] = [];
  client.subscribe((update) => updates.push(update));
  const store = createGameStore();
  store.getState().attach(client);

  socket.emit(S2C.gameUpdate, pre);
  socket.emit(FIGHT_S2C.start, start);
  expect(updates.at(-1)?.fight).toBeNull();
  socket.emit(S2C.gameUpdate, combat);
  expect(updates.at(-1)?.fight?.id).toBe(start.fightId);
  expect(updates.at(-1)?.fight?.online?.start).toMatchObject({ fightId: start.fightId });
  expect(store.getState().latest?.fight?.id).toBe(start.fightId);

  // The server normally emits game:update before fight:start. The store must see
  // the fight even though the metadata arrives at the same board version.
  const reverseSocket = new EventEmitter();
  const reverseClient = new OnlineGameClient({
    socket: reverseSocket,
    call: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as OnlineSession);
  const reverseStore = createGameStore();
  reverseStore.getState().attach(reverseClient);
  reverseSocket.emit(S2C.gameUpdate, pre);
  reverseSocket.emit(S2C.gameUpdate, {
    ...combat,
    pending: { ...combat.pending!, timeLeftMs: 30_000 },
  });
  expect(reverseStore.getState().latest?.fight).toBeNull();
  reverseSocket.emit(FIGHT_S2C.start, start);
  expect(reverseStore.getState().latest?.fight?.id).toBe(start.fightId);
  expect(reverseStore.getState().latest?.pending?.timeLeftMs).toBeNull();

  const result = { winner: 'b' as const, hpA: 0, hpB: null };
  game.submitCombatResult(fight.id, result);
  const finished = game.updateFor('a', []);
  expect(finished.publicState.outcome).not.toBeNull();
  socket.emit(S2C.gameUpdate, finished);
  expect(updates.at(-1)?.fight?.id).toBe(start.fightId);
  await client.reportFight();
  expect(updates.at(-1)?.fight).toBeNull();
  expect(updates.at(-1)?.publicState.outcome).not.toBeNull();
  client.dispose();
  reverseStore.getState().detach();
  store.getState().detach();
  game.dispose();
});
