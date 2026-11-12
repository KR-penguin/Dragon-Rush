import type { FightController } from '@dragon-rush/protocol';
import { INPUT_RING } from '../constants';
import { substitute } from '../mask';

/** What the client knows about one seat's mask at one tick. */
export const KIND_NONE = 0;
/** Unconfirmed real mask: relayed by the server, or the own seat's stamp. */
export const KIND_REAL = 1;
/** Unconfirmed bot mask relayed by the server. */
export const KIND_BOT = 2;
/** Confirmed real or bot mask. */
export const KIND_CONFIRMED = 3;
/** Confirmed substitution (the server had no mask in time). */
export const KIND_SUBST = 4;

const MASK = INPUT_RING - 1;

interface Segment {
  readonly from: number;
  readonly controller: FightController;
}

/**
 * One seat's input history on a client: confirmed masks, relayed masks, the own seat's stamps and the
 * controller timeline, in 512-slot rings guarded by tick (a freeze cannot overwrite unconfirmed masks).
 * `inputFor` implements the prediction rule: pure repeat of the newest known mask, or the server's
 * substitution continued when the newest known tick was a confirmed substitution.
 */
export class SeatInputs {
  private readonly tickOf = new Int32Array(INPUT_RING).fill(-0x7fffffff);
  private readonly mask = new Int16Array(INPUT_RING);
  private readonly kind = new Uint8Array(INPUT_RING);
  private readonly run = new Uint8Array(INPUT_RING);
  private readonly base = new Int16Array(INPUT_RING);
  private readonly ownTick = new Int32Array(INPUT_RING).fill(-0x7fffffff);
  private readonly ownMask = new Int16Array(INPUT_RING);
  private segments: Segment[];
  /** Highest tick with an own stamp (own seat only). */
  ownHead = -0x7fffffff;

  constructor(
    readonly own: boolean,
    initial: FightController,
  ) {
    this.segments = [{ from: -0x7fffffff, controller: initial }];
  }

  controllerAt(t: number): FightController {
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i]!;
      if (s.from <= t) return s.controller;
    }
    return this.segments[0]!.controller;
  }

  /** Controller change from `from` on; later segments are superseded. */
  setController(from: number, controller: FightController): void {
    this.segments = this.segments.filter((s) => s.from < from);
    this.segments.push({ from, controller });
  }

  /** Drops segments that no longer matter (keeps the one in effect at `tick`). */
  prune(tick: number): void {
    let keep = 0;
    for (let i = 0; i < this.segments.length; i++) if (this.segments[i]!.from <= tick) keep = i;
    if (keep > 0) this.segments = this.segments.slice(keep);
  }

  /** Own seat: first stamp per tick wins (the server is first-write-wins too). */
  stamp(t: number, m: number): boolean {
    const i = t & MASK;
    if (this.ownTick[i] === t) return false;
    this.ownTick[i] = t;
    this.ownMask[i] = m;
    if (t > this.ownHead) this.ownHead = t;
    return true;
  }

  stampAt(t: number): number | null {
    const i = t & MASK;
    return this.ownTick[i] === t ? (this.ownMask[i] ?? 0) : null;
  }

  /** Relayed mask (unconfirmed). Never overrides a confirmed slot. */
  relay(t: number, m: number, bot: boolean): boolean {
    const i = t & MASK;
    if (this.tickOf[i] === t && (this.kind[i] ?? 0) >= KIND_CONFIRMED) return false;
    const k = bot ? KIND_BOT : KIND_REAL;
    if (this.tickOf[i] === t && this.mask[i] === m && this.kind[i] === k) return false;
    this.tickOf[i] = t;
    this.mask[i] = m;
    this.kind[i] = k;
    return true;
  }

  confirm(t: number, m: number, substituted: boolean, run: number, base: number): void {
    const i = t & MASK;
    this.tickOf[i] = t;
    this.mask[i] = m;
    this.kind[i] = substituted ? KIND_SUBST : KIND_CONFIRMED;
    this.run[i] = Math.min(255, run);
    this.base[i] = base;
  }

  /** Clears relayed/confirmed knowledge (sync); own stamps survive. */
  reset(controller: FightController): void {
    this.tickOf.fill(-0x7fffffff);
    this.segments = [{ from: -0x7fffffff, controller }];
  }

  kindAt(t: number): number {
    const i = t & MASK;
    return this.tickOf[i] === t ? (this.kind[i] ?? KIND_NONE) : KIND_NONE;
  }

  /** Known mask at t, or -1. Own stamps count only while the seat is human-controlled at t. */
  knownAt(t: number): number {
    const i = t & MASK;
    if (this.tickOf[i] === t) return this.mask[i] ?? 0;
    if (this.own && this.ownTick[i] === t && this.controllerAt(t) === 'human') return this.ownMask[i] ?? 0;
    return -1;
  }

  /**
   * Mask to simulate tick t with. `floor` is the newest tick that is surely known (confirmed); the backward
   * scan never goes below it.
   */
  inputFor(t: number, floor: number): number {
    const k = this.knownAt(t);
    if (k >= 0) return k;
    for (let n = t - 1; n >= floor && n > t - INPUT_RING; n--) {
      const i = n & MASK;
      if (this.tickOf[i] === n) {
        if (this.kind[i] === KIND_SUBST) return substitute(this.base[i] ?? 0, (this.run[i] ?? 0) + (t - n));
        return this.mask[i] ?? 0;
      }
      if (this.own && this.ownTick[i] === n && this.controllerAt(n) === 'human') return this.ownMask[i] ?? 0;
    }
    return 0;
  }

  /** Newest tick >= from with a known real/bot mask (relayed, own or confirmed), scanning up to `to`. */
  newestKnown(from: number, to: number): number {
    let best = from - 1;
    for (let t = from; t <= to; t++) if (this.knownAt(t) >= 0) best = t;
    return best;
  }
}
