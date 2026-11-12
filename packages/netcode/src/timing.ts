import {
  LEAD_BASE_MS,
  LEAD_DEAD_BAND,
  LEAD_FAR_CONFIRMS,
  LEAD_FAR_TICKS,
  LEAD_GAIN,
  LEAD_LIMIT,
  LEAD_LIMIT_FAR,
  LEAD_TARGET_CAP_MS,
  TICK_MS,
} from './constants';

/** effRTT thresholds (ms) for D = 1..7 (combat-design §9 input delay table). */
const DELAY_STEPS = [60, 130, 210, 270, 340, 420] as const;

/** "입력 반응" setting: 반응 우선 (-1) / 표준 (0) / 부드럽게 (+1). */
export type InputDelayPreference = -1 | 0 | 1;

/**
 * Input delay D for one fight, locked at fight start from the player's own effRTT. PvE and local play use 0.
 * Clamped to [0, min(8, ceil(effRTT / T))]: a larger D only puts the client behind the confirm stream.
 */
export function chooseInputDelay(effRttMs: number, pref: InputDelayPreference = 0, pve = false): number {
  if (pve) return 0;
  let d = 1;
  for (const step of DELAY_STEPS) if (effRttMs >= step) d += 1;
  const max = Math.min(8, Math.ceil(Math.max(0, effRttMs) / TICK_MS));
  return Math.max(0, Math.min(max, d + pref));
}

/** Arrival margin the client aims for at the server (ms). */
export const leadTargetMs = (jitUpMs: number): number => Math.min(LEAD_BASE_MS + 2 * jitUpMs, LEAD_TARGET_CAP_MS);

/**
 * Time dilation from the server's median arrival slack: ±3% (±5% beyond 4 ticks of error), gain 0.01 per
 * tick of error, dead band ±0.5 tick; re-anchor after 15 consecutive confirms more than 10 ticks off.
 */
export class LeadController {
  timeScale = 1;
  lastErrTicks = 0;
  private farCount = 0;

  /** Returns true when the input clock should re-anchor from the clock filter. */
  onConfirm(slackMedMs: number, jitUpMs: number): boolean {
    const err = (slackMedMs - leadTargetMs(jitUpMs)) / TICK_MS;
    this.lastErrTicks = err;
    const lim = Math.abs(err) > 4 ? LEAD_LIMIT_FAR : LEAD_LIMIT;
    this.timeScale = Math.abs(err) <= LEAD_DEAD_BAND ? 1 : 1 - Math.max(-lim, Math.min(lim, LEAD_GAIN * err));
    if (Math.abs(err) > LEAD_FAR_TICKS) {
      this.farCount += 1;
      if (this.farCount >= LEAD_FAR_CONFIRMS) {
        this.farCount = 0;
        return true;
      }
    } else this.farCount = 0;
    return false;
  }

  reset(): void {
    this.timeScale = 1;
    this.farCount = 0;
    this.lastErrTicks = 0;
  }
}
