export interface NetDebugSettings {
  enabled: boolean;
  upMs: number;
  downMs: number;
  jitterMs: number;
  lossPct: number;
}

const DEFAULT: NetDebugSettings = {
  enabled: false,
  upMs: 40,
  downMs: 40,
  jitterMs: 15,
  lossPct: 0.5,
};
let settings: NetDebugSettings = DEFAULT;

export const netDebugEnabled = (): boolean =>
  import.meta.env.DEV ||
  (typeof location !== 'undefined' && new URLSearchParams(location.search).get('netdebug') === '1');

export const getNetDebug = (): NetDebugSettings => settings;

export const setNetDebug = (next: NetDebugSettings): void => {
  settings = {
    enabled: next.enabled,
    upMs: Math.max(0, Math.min(500, next.upMs)),
    downMs: Math.max(0, Math.min(500, next.downMs)),
    jitterMs: Math.max(0, Math.min(100, next.jitterMs)),
    lossPct: Math.max(0, Math.min(10, next.lossPct)),
  };
};

/** Adds reliable ordered TCP-like latency in one direction; timeouts belong to the caller. */
export class NetDebugPipe {
  private rng: number;
  private lastRelease = 0;

  constructor(
    seed: number,
    private readonly oneWay: (settings: NetDebugSettings) => number,
  ) {
    this.rng = seed >>> 0;
  }

  private random(): number {
    this.rng = (Math.imul(1664525, this.rng) + 1013904223) >>> 0;
    return this.rng / 0x100000000;
  }

  delay(now: number): number {
    const settings = getNetDebug();
    if (!settings.enabled) return Math.max(0, this.lastRelease - now);
    const base = this.oneWay(settings);
    let at = now + base + (this.random() * 2 - 1) * settings.jitterMs;
    if (this.random() * 100 < settings.lossPct) {
      const rtt = settings.upMs + settings.downMs;
      at += this.random() < 0.8 ? rtt + 50 : Math.max(200, 2 * rtt);
    }
    at = Math.max(now, at, this.lastRelease);
    this.lastRelease = at;
    return at - now;
  }
}
