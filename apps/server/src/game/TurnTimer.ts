export type Clock = () => number;

/** One-shot decision timer keyed by (actor, phase); re-arming the same key keeps the deadline. */
export class TurnTimer {
  private handle: ReturnType<typeof setTimeout> | null = null;
  private key: string | null = null;
  private deadline: number | null = null;

  constructor(
    private readonly timeoutMs: number,
    private readonly clock: Clock = Date.now,
  ) {}

  arm(key: string, onExpire: () => void): void {
    if (this.key === key && this.handle) return;
    this.cancel();
    this.key = key;
    this.deadline = this.clock() + this.timeoutMs;
    this.handle = setTimeout(() => {
      this.handle = null;
      this.key = null;
      this.deadline = null;
      onExpire();
    }, this.timeoutMs);
  }

  cancel(): void {
    if (this.handle) clearTimeout(this.handle);
    this.handle = null;
    this.key = null;
    this.deadline = null;
  }

  timeLeftMs(): number | null {
    return this.deadline === null ? null : Math.max(0, this.deadline - this.clock());
  }
}
