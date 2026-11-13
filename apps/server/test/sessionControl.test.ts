import { DEFAULT_RULES, getLegalActions } from '@dragon-rush/engine';
import { Server } from 'socket.io';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FightRoom } from '../src/fight/FightRoom';
import { GameSession } from '../src/game/GameSession';
import { Room } from '../src/rooms/Room';
import { SessionStore } from '../src/session/SessionStore';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function session() {
  return new GameSession(
    {
      seats: [
        { lobbySeat: 0, kind: 'human', playerId: 'alice', name: 'Alice', job: 'swordsman' },
        { lobbySeat: 1, kind: 'human', playerId: 'bob', name: 'Bob', job: 'archer' },
      ],
      rules: DEFAULT_RULES,
      seed: 42,
      turnTimeoutMs: 60000,
      reconnectGraceMs: 1000,
      botActionDelayMs: 10000,
      maxConsecutiveTimeouts: 3,
    },
    { update: () => {}, seatStatus: () => {}, seatTakeover: () => {}, ended: () => {} },
  );
}

describe('permanent bot control', () => {
  it('rejects human board input after reconnect grace expires while allowing the policy', () => {
    const game = session();
    try {
      const seat = game.publicState.pending!.actor;
      const playerId = game.seatOf('alice') === seat ? 'alice' : 'bob';
      game.disconnect(playerId);
      vi.advanceTimersByTime(1000);
      game.reconnect(playerId);
      expect(game.snapshotFor(playerId).legalActions).toBeUndefined();
      const action = getLegalActions(game.publicState).find(
        (candidate) => candidate.type === 'UPGRADE',
      )!;
      expect(() => game.submit(seat, action, 0, 'human')).toThrow('NOT_YOUR_TURN');
      expect(game.version).toBe(0);
      expect(game.submit(seat, action, 0, 'policy')).toBe(1);
    } finally {
      game.dispose();
    }
  });

  it('keeps a returning fighter as a spectator after permanent bot takeover', () => {
    const game = session();
    const room = new Room('ROOM', 'alice', 'Alice', 0);
    room.join('bob', 'Bob');
    const fighterSeat = game.seatOf('alice')!;
    const fight = new FightRoom(new Server(), room, new SessionStore(), game, {
      id: 7,
      seed: 42,
      setup: {
        kind: 'dragonFight',
        a: { job: 'swordsman', hp: 100, maxHp: 100, atk: 10, def: 5, indomitableAvailable: false },
        b: null,
        dragon: { hp: 100, atk: 10, def: 5 },
      },
      request: { a: fighterSeat, b: null },
    });
    try {
      expect(fight.roleOf('alice')).toBe(0);
      fight.away('alice');
      game.disconnect('alice');
      vi.advanceTimersByTime(1000);
      game.reconnect('alice');
      expect(fight.roleOf('alice')).toBeNull();
      fight.back('alice');
      expect(fight.authority.streams[0].wantsBack).toBe(false);
      fight.epochMs = 0;
      const accept = vi.spyOn(fight.authority, 'accept');
      fight.input('alice', { fightId: 7, newestTick: 1, ackConfirmTick: 0, masks: [3] });
      expect(accept).not.toHaveBeenCalled();
    } finally {
      fight.dispose();
      game.dispose();
    }
  });

  it('restores human board control on a reconnect within the grace period', () => {
    const game = session();
    try {
      const seat = game.publicState.pending!.actor;
      const playerId = game.seatOf('alice') === seat ? 'alice' : 'bob';
      game.disconnect(playerId);
      vi.advanceTimersByTime(999);
      game.reconnect(playerId);
      const action = getLegalActions(game.publicState).find(
        (candidate) => candidate.type === 'UPGRADE',
      )!;
      expect(game.submit(seat, action, 0, 'human')).toBe(1);
    } finally {
      game.dispose();
    }
  });
});
