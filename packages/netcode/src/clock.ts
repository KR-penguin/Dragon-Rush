import type { FightPongPacket } from '@dragon-rush/protocol';
import { TICK_MS } from './constants';
import { median, SampleWindow } from './stats';

const KEEP = 16;
const BEST = 4;
const SLEW_MS = 2;
const SNAP_MS = 100;

/**
 * Client clock filter: NTP on-wire offset (RFC 5905) from fight:ping/pong, median of the 4 lowest-delay
 * samples out of the last 16, slewed at most 2 ms per sample; RTT smoothing per RFC 6298.
 */
export class ClockSync {
  /** serverMs ~= clientMs + offset */
  offset = 0;
  srtt: number | null = null;
  rttvar = 0;
  private samples: { offset: number; delay: number }[] = [];

  get ready(): boolean {
    return this.srtt !== null;
  }

  /** Smoothed RTT + 2 * variance: used for the input delay, bars and warnings. */
  get effRttMs(): number {
    return this.srtt === null ? 0 : this.srtt + 2 * this.rttvar;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  toServer(clientMs: number): number {
    return clientMs + this.offset;
  }

  addPong(p: FightPongPacket, nowClientMs: number): void {
    const c0 = p.clientMs;
    const s1 = p.serverRecvMs;
    const s2 = p.serverSendMs;
    const c3 = nowClientMs;
    const delay = Math.max(0, c3 - c0 - (s2 - s1));
    const offset = (s1 - c0 + (s2 - c3)) / 2;
    this.samples.push({ offset, delay });
    if (this.samples.length > KEEP) this.samples.shift();
    const best = [...this.samples].sort((a, b) => a.delay - b.delay).slice(0, BEST);
    const target = median(best.map((s) => s.offset));
    const err = target - this.offset;
    if (this.samples.length === 1 || Math.abs(err) > SNAP_MS) this.offset = target;
    else this.offset += Math.max(-SLEW_MS, Math.min(SLEW_MS, err));
    if (this.srtt === null) {
      this.srtt = delay;
      this.rttvar = delay / 2;
    } else {
      this.rttvar = 0.75 * this.rttvar + 0.25 * Math.abs(this.srtt - delay);
      this.srtt = 0.875 * this.srtt + 0.125 * delay;
    }
  }

  /** After a sleep/resume the old samples are meaningless. */
  reset(): void {
    this.samples = [];
    this.srtt = null;
    this.rttvar = 0;
  }
}

/** RFC 3550 interarrival jitter on tick-stamped arrivals, plus a 3 s p97 for spectator buffer sizing. */
export class ArrivalJitter {
  jitterMs = 0;
  private last: { tick: number; at: number } | null = null;
  private readonly window = new SampleWindow(90);

  add(tick: number, arrivalMs: number): void {
    if (this.last && tick > this.last.tick) {
      const d = Math.abs(arrivalMs - this.last.at - (tick - this.last.tick) * TICK_MS);
      this.jitterMs += (d - this.jitterMs) / 16;
      this.window.push(d);
    }
    if (!this.last || tick > this.last.tick) this.last = { tick, at: arrivalMs };
  }

  get p97Ms(): number {
    return this.window.quantile(0.97);
  }

  reset(): void {
    this.last = null;
    this.window.clear();
  }
}

/** Ping cadence: a burst of 8 at 50 ms, then a steady interval (2 Hz in a fight, 0.5 Hz on the board). */
export class PingSchedule {
  private burstLeft = 0;
  private nextAt = 0;
  private id = 0;

  constructor(private intervalMs: number) {}

  burst(nowMs: number): void {
    this.burstLeft = 8;
    this.nextAt = nowMs;
  }

  setInterval(ms: number): void {
    this.intervalMs = ms;
  }

  /** Returns a ping id when one is due. */
  poll(nowMs: number): number | null {
    if (nowMs < this.nextAt) return null;
    if (this.burstLeft > 0) {
      this.burstLeft -= 1;
      this.nextAt = nowMs + 50;
    } else this.nextAt = nowMs + this.intervalMs;
    this.id = (this.id + 1) & 0xffff;
    return this.id;
  }

  get bursting(): boolean {
    return this.burstLeft > 0;
  }
}
