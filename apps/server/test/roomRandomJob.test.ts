import { describe, expect, it } from 'vitest';
import { Room } from '../src/rooms/Room';

describe('random jobs in a room', () => {
  it('samples all five jobs for each game and preserves the random lobby choice', () => {
    const room = new Room('ABCDEF', 'host', 'Host', 0);
    room.selectJob('host', 'swordsman');
    room.configureSeat('host', { seat: 1, kind: 'bot', botName: 'heuristic' }, () => false);

    expect(room.seats[1]!.job).toBeNull();
    expect(room.prepareStart('host', () => 0)[1]!.job).toBe('swordsman');
    expect(room.seats[1]!.job).toBeNull();
    expect(room.prepareStart('host', () => 0.999)[1]!.job).toBe('berserker');
    expect(room.seats[1]!.job).toBeNull();
  });

  it('lets a human keep the random choice through ready and start', () => {
    const room = new Room('ABCDEF', 'host', 'Host', 0);
    room.join('guest', 'Guest');
    room.setReady('guest', true);

    const picks = [0, 0.999][Symbol.iterator]();
    const started = room.prepareStart('host', () => picks.next().value ?? 0);
    expect(started.map((s) => s.job)).toEqual(['swordsman', 'berserker']);
    expect(room.seats.slice(0, 2).map((s) => s.job)).toEqual([null, null]);
  });
});
