import { clamp01, easeOutQuad } from './easing';

/**
 * FlashGovernor limits (photosensitivity, WCAG 2.3.1 / XAG 118): at most one full-screen flash
 * per 350 ms (under 3 per second), alpha ≤ 0.3, ≤ 80 ms, never saturated red.
 */
export const FLASH_RULES = { minIntervalMs: 350, maxAlpha: 0.3, maxDurationMs: 80 } as const;

export function parseHexColor(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: readonly number[]): string =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

export const isSaturatedRed = ([r, g, b]: readonly [number, number, number]): boolean =>
  r + g + b > 0 && r / (r + g + b) >= 0.8;

/** Returns a flash-safe colour: saturated reds are mixed halfway to white. */
export function safeFlashColor(hex: string): string {
  const rgb = parseHexColor(hex);
  if (!rgb) return '#ffffff';
  if (!isSaturatedRed(rgb)) return toHex(rgb);
  return toHex(rgb.map((v) => v + (255 - v) * 0.5));
}

export interface RateLimiter {
  tryAcquire(): boolean;
  reset(): void;
}

export function createRateLimiter(minIntervalMs: number, now: () => number): RateLimiter {
  let last = -Infinity;
  return {
    tryAcquire() {
      const t = now();
      if (t - last < minIntervalMs) return false;
      last = t;
      return true;
    },
    reset() {
      last = -Infinity;
    },
  };
}

export interface FlashRequest {
  readonly color: string;
  readonly alpha: number;
  readonly durationMs?: number;
}

export interface FlashGrant {
  readonly color: string;
  readonly alpha: number;
  readonly durationMs: number;
  readonly startedAt: number;
}

export interface FlashGovernor {
  /** Grants a clamped flash or refuses it (rate limit or photosensitive mode). */
  request(req: FlashRequest): FlashGrant | null;
  /** Current overlay colour and alpha (0 when idle). */
  sample(): { readonly color: string; readonly alpha: number };
  reset(): void;
}

export function createFlashGovernor(
  now: () => number,
  photosensitive: () => boolean = () => false,
): FlashGovernor {
  const limiter = createRateLimiter(FLASH_RULES.minIntervalMs, now);
  let active: FlashGrant | null = null;
  return {
    request(req) {
      if (photosensitive() || req.alpha <= 0) return null;
      if (!limiter.tryAcquire()) return null;
      active = {
        color: safeFlashColor(req.color),
        alpha: Math.min(FLASH_RULES.maxAlpha, req.alpha),
        durationMs: Math.min(FLASH_RULES.maxDurationMs, Math.max(16, req.durationMs ?? 60)),
        startedAt: now(),
      };
      return active;
    },
    sample() {
      if (!active) return { color: '#ffffff', alpha: 0 };
      const t = (now() - active.startedAt) / active.durationMs;
      if (t >= 1) {
        const color = active.color;
        active = null;
        return { color, alpha: 0 };
      }
      return { color: active.color, alpha: active.alpha * (1 - clamp01(t)) };
    },
    reset() {
      active = null;
      limiter.reset();
    },
  };
}

/** Attack-release envelope in 0..1 for slow, edge-only effects (vignette pulse, fades). */
export function pulseEnvelope(ageMs: number, attackMs: number, releaseMs: number): number {
  if (ageMs < 0) return 0;
  if (ageMs < attackMs) return attackMs <= 0 ? 1 : ageMs / attackMs;
  const t = (ageMs - attackMs) / Math.max(1, releaseMs);
  return t >= 1 ? 0 : 1 - easeOutQuad(t);
}
