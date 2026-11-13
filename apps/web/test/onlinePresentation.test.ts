import { EventEmitter } from 'node:events';
import {
  applyAction,
  applyCombatResult,
  createGame,
  DEFAULT_RULES,
  toPublicState,
} from '@dragon-rush/engine';
import { boardCombatSetup } from '../../../packages/combat-ai/src/board';
import { COMBAT_PACK_VERSION, DEFAULT_COMBAT_RULES, hashCombatRules } from '@dragon-rush/combat';
import { C2S, FIGHT_S2C, S2C, type FightStartMsg, type GameUpdateMsg } from '@dragon-rush/protocol';
import { combatBuildId, NETCODE_VERSION } from '@dragon-rush/netcode';
import { expect, it, vi } from 'vitest';
import { OnlineGameClient } from '../src/services/OnlineGameClient';
import type { OnlineSession } from '../src/services/onlineSession';
import { createGameStore } from '../src/store/gameStore';

function fixture() {
  let state = createGame(
    { seats: [{ job: 'swordsman' }, { job: 'archer' }, { job: 'mage' }] },
    DEFAULT_RULES,
    42,
  );
  let version = 0;
  const socket = new EventEmitter();
  const call = vi.fn().mockResolvedValue({ ok: true });
  const client = new OnlineGameClient({ socket, call } as unknown as OnlineSession);
  const store = createGameStore();
  store.getState().attach(client);
  const update = (events: GameUpdateMsg['events'] = []): GameUpdateMsg => ({
    version,
    publicState: toPublicState(state),
    events,
    pending: state.pending ? { ...state.pending, timeLeftMs: null } : null,
    yourSeat: null,
    legalActions: [],
    seats: [],
  });
  const send = (step: ReturnType<typeof applyAction>) => {
    state = step.state;
    version++;
    socket.emit(S2C.gameUpdate, update(step.events));
    return step.events;
  };
  const start = (fightId: number, human = false) => {
    const actor = state.combat!.a;
    const msg: FightStartMsg = {
      fightId,
      kind: state.combat!.kind,
      seed: 123,
      setup: boardCombatSetup(state),
      rules: DEFAULT_COMBAT_RULES,
      rulesHash: hashCombatRules(DEFAULT_COMBAT_RULES),
      packVersion: COMBAT_PACK_VERSION,
      combatBuildId: combatBuildId(NETCODE_VERSION),
      seats: [
        {
          engineSeat: actor,
          playerId: human ? 'a' : null,
          name: `P${actor}`,
          controller: human ? 'human' : 'bot',
        },
      ],
      you: human ? { role: 'fighter', seat: 0 } : { role: 'spectator' },
      prerollTicks: 90,
      maxTicks: 3600,
      pveHoldTicks: 15,
      pvpHoldTicks: 6,
    };
    socket.emit(FIGHT_S2C.start, msg);
    return msg;
  };
  const replay = (msg: FightStartMsg) =>
    socket.emit(FIGHT_S2C.replay, {
      fightId: msg.fightId,
      seed: msg.seed,
      setup: msg.setup,
      rules: msg.rules,
      inputs: [1, 0, 0],
      endTick: 1,
      outcome: { winner: 'b', hpA: 0, hpB: null },
      finalHash: 0,
    });
  socket.emit(S2C.gameUpdate, update());
  return {
    client,
    store,
    call,
    start,
    replay,
    socket,
    challenge: () => send(applyAction(state, { type: 'CHALLENGE_DRAGON' })),
    startThenChallenge: (fightId: number) => {
      const step = applyAction(state, { type: 'CHALLENGE_DRAGON' });
      state = step.state;
      const message = start(fightId, true);
      send(step);
      return message;
    },
    lose: () => send(applyCombatResult(state, { winner: 'b', hpA: 0, hpB: null })),
    update,
  };
}

it('queues overlapping bot fights with their own board states and retains intermediate events', async () => {
  const f = fixture();
  f.challenge();
  const first = f.start(1);
  const queuedBeforeReplay = [...f.store.getState().queue];
  f.replay(first);
  expect(f.store.getState().queue).toEqual(queuedBeforeReplay);
  expect(f.store.getState().latest?.fight?.replay).not.toBeNull();
  const intermediate = f.lose();
  f.challenge();
  const second = f.start(2);
  f.replay(second);
  expect(f.store.getState().latest?.fight?.id).toBe(1);
  expect(f.call.mock.calls.filter(([event]) => event === C2S.gameRequestSnapshot)).toHaveLength(1);
  expect(await f.client.reportFight(2)).toEqual({ ok: false, code: 'NO_FIGHT' });
  await f.client.reportFight(1);
  const latest = f.store.getState().latest!;
  expect(latest.fight?.id).toBe(2);
  expect(latest.fight?.request.a).toBe(second.seats[0]!.engineSeat);
  expect(latest.version).toBe(3);
  expect(latest.fight?.replay).not.toBeNull();
  expect(f.store.getState().queue).toEqual(expect.arrayContaining(intermediate));
  expect(await f.client.reportFight(1)).toEqual({ ok: false, code: 'NO_FIGHT' });
  expect(f.store.getState().latest?.fight?.id).toBe(2);
  f.lose();
  await f.client.reportFight(2);
  expect(f.store.getState().latest?.publicState.outcome).not.toBeNull();
  expect(f.store.getState().latest?.fight).toBeNull();
  f.store.getState().detach();
});

it('prioritizes a new local live fight over old replays and ignores their late completion', async () => {
  const f = fixture();
  f.challenge();
  f.replay(f.start(1));
  f.lose();
  f.challenge();
  const live = f.start(2, true);
  expect(f.store.getState().latest?.fight?.id).toBe(2);
  expect(f.store.getState().latest?.fight?.request.a).toBe(live.seats[0]!.engineSeat);
  expect(f.store.getState().latest?.fight?.sides[0].control).toBe('keyboard-solo');
  expect(f.store.getState().latest?.snapshot).toBe(true);
  expect(await f.client.reportFight(1)).toEqual({ ok: false, code: 'NO_FIGHT' });
  expect(f.store.getState().latest?.fight?.id).toBe(2);
  f.store.getState().detach();
});

it('prioritizes a live fight whose metadata arrives before its board state', () => {
  const f = fixture();
  f.challenge();
  f.replay(f.start(1));
  f.lose();
  const live = f.startThenChallenge(2);
  expect(f.store.getState().latest?.fight?.id).toBe(2);
  expect(f.store.getState().latest?.fight?.request.a).toBe(live.seats[0]!.engineSeat);
  expect(f.store.getState().latest?.snapshot).toBe(true);
  f.store.getState().detach();
});

it('gives late subscribers a full snapshot after a same-version replay metadata refresh', () => {
  const f = fixture();
  f.challenge();
  f.replay(f.start(1));
  const late = createGameStore();
  late.getState().attach(f.client);
  expect(late.getState().latest?.fight?.id).toBe(1);
  expect(late.getState().latest?.fight?.replay).not.toBeNull();
  expect(late.getState().display?.combat).not.toBeNull();
  late.getState().detach();
  f.store.getState().detach();
});

it('does not resurrect a finished presentation when its old COMBAT snapshot arrives late', async () => {
  const f = fixture();
  f.challenge();
  f.start(1);
  await f.client.reportFight(1);
  f.socket.emit(S2C.gameSnapshot, f.update());
  f.lose();
  expect(f.store.getState().latest?.version).toBe(2);
  expect(f.store.getState().latest?.fight).toBeNull();
  f.store.getState().detach();
});

it('lets a recovery snapshot supersede queued combat whose metadata never arrived', () => {
  const f = fixture();
  f.challenge();
  f.lose();
  f.socket.emit(S2C.gameSnapshot, f.update());
  expect(f.store.getState().latest?.version).toBe(2);
  expect(f.store.getState().latest?.fight).toBeNull();
  expect(f.store.getState().queue).toEqual([]);
  f.store.getState().detach();
});

it('preserves explicit same-version snapshot refreshes while a fight is active', () => {
  const f = fixture();
  f.challenge();
  f.start(1);
  expect(f.store.getState().queue.length).toBeGreaterThan(0);
  f.socket.emit(S2C.gameSnapshot, f.update());
  expect(f.store.getState().latest?.fight?.id).toBe(1);
  expect(f.store.getState().queue).toEqual([]);
  expect(f.store.getState().display).toEqual(f.update().publicState);
  f.store.getState().detach();
});
