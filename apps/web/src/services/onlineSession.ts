import type { JobId } from '@dragon-rush/engine';
import {
  C2S,
  PROTOCOL_VERSION,
  S2C,
  type Ack,
  type RoomConfigureSeat,
  type RoomStateMsg,
  type SessionWelcomeMsg,
} from '@dragon-rush/protocol';
import { io, type Socket } from 'socket.io-client';
import { OnlineGameClient } from './OnlineGameClient';

const TOKEN_KEY = 'dragonRush.sessionToken';

const readToken = (): string | undefined => {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

const writeToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Storage may be unavailable (private mode); the session then lasts for this tab only.
  }
};

export type AckResult<T = unknown> = Ack<T>;

/** One Socket.IO connection to the game server plus lobby commands. */
export class OnlineSession {
  private roomListeners = new Set<(room: RoomStateMsg | null) => void>();
  room: RoomStateMsg | null = null;

  private constructor(
    readonly socket: Socket,
    readonly welcome: SessionWelcomeMsg,
  ) {
    socket.on(S2C.roomState, (room: RoomStateMsg) => this.setRoom(room));
  }

  static connect(url?: string): Promise<OnlineSession> {
    const token = readToken();
    const socket = io(url ?? '/', {
      transports: ['websocket'],
      reconnectionDelay: 250,
      reconnectionDelayMax: 2000,
      auth: { protocolVersion: PROTOCOL_VERSION, ...(token ? { sessionToken: token } : {}) },
    });
    return new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        socket.off(S2C.sessionWelcome);
        socket.disconnect();
        reject(err);
      };
      socket.once('connect_error', onError);
      socket.once(S2C.sessionWelcome, (welcome: SessionWelcomeMsg) => {
        socket.off('connect_error', onError);
        writeToken(welcome.sessionToken);
        // Automatic reconnects reuse socket.auth, so it must carry the issued token.
        socket.auth = { protocolVersion: PROTOCOL_VERSION, sessionToken: welcome.sessionToken };
        resolve(new OnlineSession(socket, welcome));
      });
    });
  }

  get playerId(): string {
    return this.welcome.playerId;
  }

  private setRoom(room: RoomStateMsg | null): void {
    this.room = room;
    for (const l of this.roomListeners) l(room);
  }

  onRoom(listener: (room: RoomStateMsg | null) => void): () => void {
    this.roomListeners.add(listener);
    listener(this.room);
    return () => this.roomListeners.delete(listener);
  }

  call<T = unknown>(event: string, payload: unknown = {}): Promise<Ack<T>> {
    return this.socket.timeout(10_000).emitWithAck(event, payload) as Promise<Ack<T>>;
  }

  createRoom(nickname: string) {
    return this.call<{ roomCode: string; seat: number }>(C2S.roomCreate, { nickname });
  }
  joinRoom(roomCode: string, nickname: string) {
    return this.call<{ roomCode: string; seat: number }>(C2S.roomJoin, { roomCode, nickname });
  }
  async leaveRoom() {
    const r = await this.call(C2S.roomLeave);
    this.setRoom(null);
    return r;
  }
  configure(maxRounds: number | null, quickCombat = false) {
    return this.call(C2S.roomConfigure, { maxRounds, quickCombat });
  }
  configureSeat(p: RoomConfigureSeat) {
    return this.call(C2S.roomConfigureSeat, p);
  }
  selectJob(job: JobId | null, seat?: number) {
    return this.call(C2S.roomSelectJob, seat === undefined ? { job } : { job, seat });
  }
  setReady(ready: boolean) {
    return this.call(C2S.roomSetReady, { ready });
  }
  start() {
    return this.call(C2S.roomStart);
  }
  rematch() {
    return this.call(C2S.roomRematch);
  }

  createGameClient(): OnlineGameClient {
    return new OnlineGameClient(this);
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}
