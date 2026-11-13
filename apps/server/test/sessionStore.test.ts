import { describe, expect, it } from 'vitest';
import { SessionStore } from '../src/session/SessionStore';

describe('session expiry', () => {
  it('expires disconnected sessions without a room after the idle TTL', () => {
    let now = 0;
    const sessions = new SessionStore(() => now);
    const session = sessions.resolve(undefined);
    sessions.attach(session, 'socket');
    now = 100;
    sessions.detach('socket');
    now = 1099;
    expect(sessions.sweep(1000, () => false)).toEqual([]);
    expect(sessions.resolve(session.token)).toBe(session);
    now = 2100;
    expect(sessions.sweep(1000, () => false)).toEqual([session.playerId]);
    expect(sessions.player(session.playerId)).toBeNull();
    expect(sessions.resolve(session.token).token).not.toBe(session.token);
  });

  it('preserves connected sessions and disconnected members of existing rooms', () => {
    let now = 0;
    const sessions = new SessionStore(() => now);
    const connected = sessions.resolve(undefined);
    sessions.attach(connected, 'socket');
    const member = sessions.resolve(undefined);
    member.roomCode = 'ROOM';
    now = 10000;
    expect(sessions.sweep(1000, (code) => code === 'ROOM')).toEqual([]);
    expect(sessions.player(connected.playerId)).toBe(connected);
    expect(sessions.player(member.playerId)).toBe(member);
    expect(sessions.sweep(1000, () => false)).toEqual([member.playerId]);
    expect(sessions.player(connected.playerId)).toBe(connected);
  });

  it('renews the idle TTL when a session reconnects and disconnects again', () => {
    let now = 0;
    const sessions = new SessionStore(() => now);
    const session = sessions.resolve(undefined);
    sessions.attach(session, 'first');
    sessions.detach('first');
    now = 900;
    sessions.attach(sessions.resolve(session.token), 'second');
    sessions.detach('second');
    now = 1100;
    expect(sessions.sweep(1000, () => false)).toEqual([]);
    now = 1900;
    expect(sessions.sweep(1000, () => false)).toEqual([session.playerId]);
  });
});
