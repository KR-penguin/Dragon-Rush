/** Short, edge-only motion accent. Its wall clock is separate from gameplay and hit-stop. */
export interface SpeedLineFrame {
  readonly progress: number;
  readonly strength: number;
}

export const SPEED_LINE_COOLDOWN_MS = 320;

export function createSpeedLineBurst(now: () => number, durationMs = 180) {
  let started = -Infinity;
  let strength = 0;
  return {
    trigger(next: number): void {
      const value = Math.min(1, Math.max(0, next));
      if (!Number.isFinite(value) || value <= 0) return;
      const time = now();
      // A multi-hit sequence gets one accent, followed by a quiet gap.
      if (time - started < SPEED_LINE_COOLDOWN_MS) return;
      started = time;
      strength = value;
    },
    sample(): SpeedLineFrame | null {
      const age = now() - started;
      return age >= 0 && age < durationMs ? { progress: age / durationMs, strength } : null;
    },
    reset(): void {
      started = -Infinity;
      strength = 0;
    },
  };
}
