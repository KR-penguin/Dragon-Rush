import {
  decodeFightPong,
  encodeFightPing,
  FIGHT_C2S,
  type FightC2SEvent,
} from '@dragon-rush/protocol';
import { ClockSync, PingSchedule } from './clock';

/** Outgoing half of a fight connection (Socket.IO in the app, a simulated link in tests). */
export interface FightTransport {
  send(event: FightC2SEvent, payload: unknown): void;
}

export const BOARD_PING_MS = 2000;
export const FIGHT_PING_MS = 500;

/**
 * Client clock service for the whole online session: pings at 0.5 Hz on the board (keeps the filter warm),
 * 2 Hz in a fight, a burst of 8 at fight start, after a reconnect and on becoming visible.
 */
export class NetClock {
  readonly sync = new ClockSync();
  private readonly schedule = new PingSchedule(BOARD_PING_MS);

  constructor(private readonly transport: FightTransport) {}

  poll(nowMs: number): void {
    const id = this.schedule.poll(nowMs);
    if (id !== null)
      this.transport.send(FIGHT_C2S.ping, encodeFightPing({ pingId: id, clientMs: nowMs }));
  }

  burst(nowMs: number): void {
    this.schedule.burst(nowMs);
    this.poll(nowMs);
  }

  setFightMode(inFight: boolean): void {
    this.schedule.setInterval(inFight ? FIGHT_PING_MS : BOARD_PING_MS);
  }

  get bursting(): boolean {
    return this.schedule.bursting;
  }

  onPong(raw: unknown, nowMs: number): void {
    const p = decodeFightPong(raw);
    if (p) this.sync.addPong(p, nowMs);
  }
}
