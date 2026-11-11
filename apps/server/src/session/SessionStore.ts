import { randomBytes } from 'node:crypto';

export interface Session {
  readonly token: string;
  readonly playerId: string;
  nickname: string | null;
  roomCode: string | null;
  socketId: string | null;
}

/** Maps opaque session tokens (kept by the browser) to players and their current room. */
export class SessionStore {
  private readonly byToken = new Map<string, Session>();
  private readonly byPlayer = new Map<string, Session>();
  private readonly bySocket = new Map<string, Session>();

  resolve(token: string | undefined): Session {
    const existing = token ? this.byToken.get(token) : undefined;
    if (existing) return existing;
    const session: Session = {
      token: randomBytes(16).toString('hex'),
      playerId: `p_${randomBytes(6).toString('hex')}`,
      nickname: null,
      roomCode: null,
      socketId: null,
    };
    this.byToken.set(session.token, session);
    this.byPlayer.set(session.playerId, session);
    return session;
  }

  attach(session: Session, socketId: string): string | null {
    const previous = session.socketId;
    if (previous) this.bySocket.delete(previous);
    session.socketId = socketId;
    this.bySocket.set(socketId, session);
    return previous;
  }

  detach(socketId: string): Session | null {
    const session = this.bySocket.get(socketId) ?? null;
    this.bySocket.delete(socketId);
    if (session && session.socketId === socketId) session.socketId = null;
    return session;
  }

  bySocketId(socketId: string): Session | null {
    return this.bySocket.get(socketId) ?? null;
  }

  player(playerId: string): Session | null {
    return this.byPlayer.get(playerId) ?? null;
  }

  forget(playerId: string): void {
    const s = this.byPlayer.get(playerId);
    if (!s) return;
    this.byPlayer.delete(playerId);
    this.byToken.delete(s.token);
    if (s.socketId) this.bySocket.delete(s.socketId);
  }
}
