export type LinkMode = 'tcp' | 'datagram';

export interface LinkProfile {
  oneWayMs: number;
  jitterMs: number;
  lossPct: number;
  mode: LinkMode;
  bandwidthBps?: number;
}

interface Task {
  at: number;
  seq: number;
  run: () => void;
}

/** Deterministic event clock; tasks scheduled at the same time retain send order. */
export class VirtualClock {
  now = 0;
  private seq = 0;
  private tasks: Task[] = [];

  schedule(at: number, run: () => void): void {
    this.tasks.push({ at, seq: this.seq++, run });
  }

  advanceTo(target: number): void {
    if (target < this.now) throw new RangeError('time cannot run backward');
    for (;;) {
      this.tasks.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = this.tasks[0];
      if (!next || next.at > target) break;
      this.tasks.shift();
      this.now = next.at;
      next.run();
    }
    this.now = target;
  }

  get pending(): number {
    return this.tasks.length;
  }
}

/** Seeded latency, jitter, retransmission, TCP ordering and optional bandwidth serialization. */
export class VirtualLink {
  private rng: number;
  private lastRelease = 0;
  private lastSerialized = 0;
  dropped = 0;
  retransmitted = 0;

  constructor(
    private readonly clock: VirtualClock,
    private readonly profile: LinkProfile,
    seed: number,
  ) {
    this.rng = seed >>> 0;
  }

  private random(): number {
    this.rng = (Math.imul(1664525, this.rng) + 1013904223) >>> 0;
    return this.rng / 0x100000000;
  }

  send(bytes: number, deliver: () => void): void {
    const p = this.profile;
    let at = this.clock.now + p.oneWayMs + (this.random() * 2 - 1) * p.jitterMs;
    if (this.random() * 100 < p.lossPct) {
      if (p.mode === 'datagram') {
        this.dropped += 1;
        return;
      }
      this.retransmitted += 1;
      const rtt = 2 * p.oneWayMs;
      at += this.random() < 0.8 ? rtt + 50 : Math.max(200, 2 * rtt);
    }
    if (p.bandwidthBps) {
      this.lastSerialized = Math.max(at, this.lastSerialized) + (bytes * 8 * 1000) / p.bandwidthBps;
      at = this.lastSerialized;
    }
    if (p.mode === 'tcp') {
      at = Math.max(at, this.lastRelease);
      this.lastRelease = at;
    }
    this.clock.schedule(at, deliver);
  }
}
