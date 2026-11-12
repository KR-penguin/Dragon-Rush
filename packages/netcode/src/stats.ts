/** Integer histogram with an overflow bucket (last index). */
export class Histogram {
  readonly buckets: number[];
  count = 0;
  sum = 0;
  max = 0;

  constructor(size = 64) {
    this.buckets = new Array<number>(size).fill(0);
  }

  add(v: number): void {
    const i = Math.max(0, Math.min(this.buckets.length - 1, Math.round(v)));
    this.buckets[i] = (this.buckets[i] ?? 0) + 1;
    this.count += 1;
    this.sum += v;
    if (v > this.max) this.max = v;
  }

  /** p in [0, 1]; returns the bucket value (0 when empty). */
  quantile(p: number): number {
    if (this.count === 0) return 0;
    const target = Math.max(1, Math.ceil(p * this.count));
    let acc = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      acc += this.buckets[i] ?? 0;
      if (acc >= target) return i;
    }
    return this.buckets.length - 1;
  }

  get mean(): number {
    return this.count === 0 ? 0 : this.sum / this.count;
  }

  /** Compact "value:count" list for logs. */
  toString(): string {
    const parts: string[] = [];
    this.buckets.forEach((n, i) => {
      if (n > 0) parts.push(`${i}:${n}`);
    });
    return parts.join(' ');
  }
}

/** Median of a small sample (copy-sort; sizes are <= 30). */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** Fixed-size sample window (oldest dropped). */
export class SampleWindow {
  private readonly data: number[] = [];
  constructor(private readonly size: number) {}

  push(v: number): void {
    this.data.push(v);
    if (this.data.length > this.size) this.data.shift();
  }

  get length(): number {
    return this.data.length;
  }

  median(): number {
    return median(this.data);
  }

  quantile(p: number): number {
    if (this.data.length === 0) return 0;
    const s = [...this.data].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  }

  clear(): void {
    this.data.length = 0;
  }
}
