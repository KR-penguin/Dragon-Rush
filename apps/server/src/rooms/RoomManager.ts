import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET } from '@dragon-rush/protocol';
import { Room } from './Room';

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly clock: () => number = Date.now) {}

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 6; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  create(hostId: string, nickname: string): Room {
    const room = new Room(this.newCode(), hostId, nickname, this.clock());
    this.rooms.set(room.code, room);
    return room;
  }

  get(code: string): Room | null {
    return this.rooms.get(code) ?? null;
  }

  delete(code: string): void {
    const room = this.rooms.get(code);
    room?.game?.dispose();
    this.rooms.delete(code);
  }

  /** Drops rooms idle for longer than ttl (finished games, abandoned lobbies). Returns removed codes. */
  sweep(ttlMs: number, hasConnectedHuman: (room: Room) => boolean): string[] {
    const now = this.clock();
    const removed: string[] = [];
    for (const room of this.rooms.values()) {
      const idle = now - room.lastActivity > ttlMs;
      if (idle && (room.status === 'finished' || !hasConnectedHuman(room))) {
        this.delete(room.code);
        removed.push(room.code);
      }
    }
    return removed;
  }

  get size(): number {
    return this.rooms.size;
  }
}
