import {
  combatResult,
  createCombat,
  deserializeCombatState,
  hashCombatState,
  stepCombat,
  type CombatResult,
  type CombatRules,
  type CombatSetup,
  type CombatState,
} from '@dragon-rush/combat';
import {
  CONFIRM_BOT_A,
  CONFIRM_BOT_B,
  CONFIRM_SUBST_A,
  CONFIRM_SUBST_B,
  CONFIRM_TERMINAL,
  type FightConfirmPacket,
  type FightControlMsg,
  type FightController,
  type FightRelayPacket,
  type FightSyncMsg,
} from '@dragon-rush/protocol';
import { HASH_EVERY, MAX_FAST_FORWARD_PER_FRAME, MAX_SIM_STEPS_PER_FRAME } from '../constants';
import { maskToInput, substitute } from '../mask';
import { Histogram } from '../stats';
import { EventReconciler } from './eventReconciler';
import { SeatInputs } from './seatInputs';
import { posesOf, VisualSmoother } from './smoothing';
import { StateRing } from './stateRing';

export type SyncReason = 'join' | 'gap' | 'desync' | 'stall' | 'backlog' | 'overflow';

export interface SyncRequest {
  readonly reason: SyncReason;
  readonly tick?: number;
  readonly clientHash?: number;
}

export interface RollbackSessionInit {
  readonly setup: CombatSetup;
  readonly seed: number;
  readonly rules: CombatRules;
  /** The seat this client plays. */
  readonly localSeat: 0 | 1;
  /** Controller per fight seat at the start (length 1 for the dragon fight). */
  readonly controllers: readonly FightController[];
  /** Max simTick - confirmedTick (PvP 40, PvE 120). */
  readonly hardCap: number;
}

export interface SessionStats {
  rollbacks: number;
  resimTicks: number;
  /** Ticks re-simulated per rollback. */
  readonly rollbackDepth: Histogram;
  /** Per update: how far the sim runs past the newest known opponent mask (PvE: past the confirm head). */
  readonly predictionDepth: Histogram;
  /** Updates that hit the prediction cap. */
  frozenFrames: number;
  /** Own masks the server replaced by substitution. */
  eatenOwn: number;
  desyncs: number;
  syncs: number;
  gaps: number;
  /** Rollbacks whose first changed tick was an own-seat mask (own corrections, should be 0 in PvE). */
  ownCorrections: number;
}

export interface UpdateResult {
  readonly stepped: number;
  readonly frozen: boolean;
}

/**
 * Client rollback core: input history per seat, a 128-slot state ring, prediction, re-simulation from the
 * first mispredicted tick, fast-forward on confirmed inputs, promotion of confirmed ticks (hash checks,
 * event confirmation, the confirmed result) and render smoothing. Pure: no clock, no transport.
 */
export class RollbackSession {
  readonly seats: [SeatInputs, SeatInputs];
  readonly ring = new StateRing();
  readonly reconciler = new EventReconciler();
  readonly smoother: VisualSmoother;
  readonly duel: boolean;
  readonly stats: SessionStats = {
    rollbacks: 0,
    resimTicks: 0,
    rollbackDepth: new Histogram(64),
    predictionDepth: new Histogram(130),
    frozenFrames: 0,
    eatenOwn: 0,
    desyncs: 0,
    syncs: 0,
    gaps: 0,
    ownCorrections: 0,
  };
  simTick = 0;
  /** Highest tick known confirmed and simulated (promoted). */
  lastPromoted = 0;
  /** Highest contiguous confirmed tick received. */
  confirmHead = 0;
  syncRequest: SyncRequest | null = null;
  confirmedOutcome: { readonly tick: number; readonly result: CombatResult } | null = null;
  /** Confirmed terminal tick from the server (confirm flag bit 4). */
  terminalTick: number | null = null;
  private rescanFrom = Infinity;
  private readonly confLastReal = [0, 0];
  private readonly confRun = [0, 0];
  private readonly knownHead = [0, 0];
  private readonly serverHash = new Map<number, number>();
  private readonly localHash = new Map<number, number>();
  /** After a sync, presented events are matched until the sim passes the pre-sync head again. */
  private resyncUntil: number | null = null;

  constructor(private readonly init: RollbackSessionInit) {
    this.duel = init.setup.kind === 'duel';
    this.seats = [
      new SeatInputs(init.localSeat === 0, init.controllers[0] ?? 'human'),
      new SeatInputs(init.localSeat === 1, init.controllers[1] ?? 'bot'),
    ];
    this.smoother = new VisualSmoother(init.localSeat === 0 ? 'a' : 'b');
    this.ring.set(0, createCombat(init.setup, init.seed, init.rules), 0, 0, []);
  }

  get localSeat(): 0 | 1 {
    return this.init.localSeat;
  }

  get current(): CombatState {
    return this.ring.must(this.simTick).state;
  }

  get previous(): CombatState {
    return this.ring.get(this.simTick - 1)?.state ?? this.current;
  }

  stateAt(tick: number): CombatState | null {
    return this.ring.get(tick)?.state ?? null;
  }

  inputFor(seat: 0 | 1, t: number): number {
    if (seat === 1 && !this.duel) return 0;
    return this.seats[seat].inputFor(t, this.lastPromoted);
  }

  /** Own seat input for tick t (first stamp wins). */
  stamp(t: number, mask: number): void {
    if (!this.seats[this.init.localSeat].stamp(t, mask)) return;
    if (t <= this.simTick) this.markChanged(t);
  }

  private markChanged(t: number): void {
    if (t < this.rescanFrom) this.rescanFrom = t;
  }

  ingestRelay(p: FightRelayPacket): void {
    if (p.seat === 1 && !this.duel) return;
    const seat = this.seats[p.seat];
    p.masks.forEach((m, i) => {
      const t = p.newestTick - i;
      if (t <= this.confirmHead) return;
      if (seat.relay(t, m, seat.controllerAt(t) === 'bot') && t <= this.simTick)
        this.markChanged(t);
      if (t > (this.knownHead[p.seat] ?? 0)) this.knownHead[p.seat] = t;
    });
  }

  /** Returns 'gap' when a confirm is missing (a sync was requested). */
  ingestConfirm(p: FightConfirmPacket): 'ok' | 'stale' | 'gap' | 'timing' {
    if (p.hashTick >= 0) {
      this.serverHash.set(p.hashTick, p.hash);
      if (p.hashTick <= this.lastPromoted) this.checkHash(p.hashTick);
    }
    if (p.ticks.length === 0) return 'timing';
    const last = p.firstTick + p.ticks.length - 1;
    if (last <= this.confirmHead) return 'stale';
    if (p.firstTick > this.confirmHead + 1) {
      this.stats.gaps += 1;
      this.requestSync({ reason: 'gap' });
      return 'gap';
    }
    for (let t = this.confirmHead + 1; t <= last; t++) {
      const e = p.ticks[t - p.firstTick]!;
      this.confirmSeat(
        0,
        t,
        e.a,
        (e.flags & CONFIRM_SUBST_A) !== 0,
        (e.flags & CONFIRM_BOT_A) !== 0,
      );
      if (this.duel)
        this.confirmSeat(
          1,
          t,
          e.b,
          (e.flags & CONFIRM_SUBST_B) !== 0,
          (e.flags & CONFIRM_BOT_B) !== 0,
        );
      if ((e.flags & CONFIRM_TERMINAL) !== 0) this.terminalTick = t;
      if (t <= this.simTick) this.markChanged(t);
    }
    this.confirmHead = last;
    return 'ok';
  }

  private confirmSeat(s: 0 | 1, t: number, mask: number, subst: boolean, _bot: boolean): void {
    const seat = this.seats[s];
    if (subst) {
      this.confRun[s] = (this.confRun[s] ?? 0) + 1;
      if (
        s === this.init.localSeat &&
        seat.controllerAt(t) === 'human' &&
        seat.stampAt(t) !== null
      ) {
        this.stats.eatenOwn += 1;
      }
      seat.confirm(t, mask, true, this.confRun[s]!, this.confLastReal[s]!);
    } else {
      this.confRun[s] = 0;
      this.confLastReal[s] = mask;
      seat.confirm(t, mask, false, 0, 0);
    }
    if (t > (this.knownHead[s] ?? 0)) this.knownHead[s] = t;
  }

  ingestControl(msg: FightControlMsg): void {
    if (msg.seat === 1 && !this.duel) return;
    this.seats[msg.seat].setController(msg.fromTick, msg.controller);
    if (msg.fromTick <= this.simTick)
      this.markChanged(Math.max(msg.fromTick, this.lastPromoted + 1));
  }

  ingestSync(msg: FightSyncMsg): void {
    const state = deserializeCombatState(msg.state, this.init.rules);
    if (hashCombatState(state) !== msg.hash) {
      this.requestSync({ reason: 'desync', tick: msg.tick, clientHash: hashCombatState(state) });
      return;
    }
    this.reconciler.beginResim(msg.tick + 1);
    this.resyncUntil = Math.max(this.resyncUntil ?? 0, this.simTick);
    this.ring.clear();
    this.ring.set(msg.tick, state, 0, 0, []);
    for (const s of [0, 1] as const) {
      const info = msg.seats[s];
      const seat = this.seats[s];
      seat.reset(info?.controller ?? (s === 0 ? 'human' : 'bot'));
      const lastReal = info?.lastRealMask ?? 0;
      const run = info?.substRun ?? 0;
      this.confLastReal[s] = lastReal;
      this.confRun[s] = run;
      // Plant the server's prediction base at the sync tick so inputFor continues exactly like the server.
      if (run > 0) seat.confirm(msg.tick, substitute(lastReal, run), true, run, lastReal);
      else seat.confirm(msg.tick, lastReal, false, 0, 0);
      this.knownHead[s] = msg.tick;
    }
    for (const c of msg.controls) this.seats[c.seat].setController(c.fromTick, c.controller);
    for (const run of msg.pending) {
      const seat = this.seats[run.seat];
      run.masks.forEach((m, i) => {
        const t = run.firstTick + i;
        seat.relay(t, m, seat.controllerAt(t) === 'bot');
        if (t > (this.knownHead[run.seat] ?? 0)) this.knownHead[run.seat] = t;
      });
    }
    this.simTick = msg.tick;
    this.lastPromoted = msg.tick;
    this.confirmHead = msg.tick;
    this.rescanFrom = Infinity;
    this.localHash.clear();
    for (const t of [...this.serverHash.keys()]) if (t <= msg.tick) this.serverHash.delete(t);
    if (state.outcome && !this.confirmedOutcome) {
      const result = combatResult(state);
      if (result) this.confirmedOutcome = { tick: state.outcome.tick, result };
    }
    this.smoother.snapAll();
    this.stats.syncs += 1;
    this.syncRequest = null;
  }

  requestSync(r: SyncRequest): void {
    if (!this.syncRequest) this.syncRequest = r;
  }

  takeSyncRequest(): SyncRequest | null {
    const r = this.syncRequest;
    this.syncRequest = null;
    return r;
  }

  /**
   * One frame of simulation toward `target` (the input clock), never past lastPromoted + hardCap.
   * `nowTick` is the tick the player perceives (for late-event decisions).
   */
  update(target: number, nowTick: number = target): UpdateResult {
    const from = this.findRollback();
    if (from !== null) this.resimulate(from, nowTick);
    this.fastForward(nowTick);
    this.promote();
    const cap = this.lastPromoted + this.init.hardCap;
    const goal = Math.min(target, cap);
    let stepped = 0;
    while (this.simTick < goal && stepped < MAX_SIM_STEPS_PER_FRAME) {
      this.stepInto(this.simTick + 1, nowTick);
      stepped += 1;
    }
    if (this.resyncUntil !== null && this.simTick >= this.resyncUntil) {
      this.resyncUntil = null;
      this.reconciler.endResim();
    }
    this.promote();
    const frozen = target > cap && this.simTick >= cap;
    if (frozen) this.stats.frozenFrames += 1;
    if (this.simTick >= 1) {
      const remote = this.duel ? 1 - this.init.localSeat : null;
      const depth =
        remote === null
          ? this.simTick - this.confirmHead
          : this.simTick - (this.knownHead[remote] ?? 0);
      this.stats.predictionDepth.add(Math.max(0, depth));
    }
    return { stepped, frozen };
  }

  private findRollback(): number | null {
    if (this.rescanFrom > this.simTick) {
      this.rescanFrom = Infinity;
      return null;
    }
    const from = Math.max(this.rescanFrom, this.lastPromoted + 1);
    this.rescanFrom = Infinity;
    for (let t = from; t <= this.simTick; t++) {
      const slot = this.ring.must(t);
      const own = this.init.localSeat;
      const m0 = this.inputFor(0, t);
      const m1 = this.inputFor(1, t);
      if (m0 !== slot.used0 || m1 !== slot.used1) {
        if (own === 0 ? m0 !== slot.used0 : m1 !== slot.used1) this.stats.ownCorrections += 1;
        return t;
      }
    }
    return null;
  }

  private resimulate(from: number, nowTick: number): void {
    const end = this.simTick;
    const pre = posesOf(this.current);
    this.reconciler.beginResim(from);
    this.simTick = from - 1;
    for (let t = from; t <= end; t++) this.stepInto(t, nowTick);
    this.reconciler.endResim();
    this.smoother.correct(pre, posesOf(this.current));
    this.stats.rollbacks += 1;
    this.stats.resimTicks += end - from + 1;
    this.stats.rollbackDepth.add(end - from + 1);
  }

  private fastForward(nowTick: number): void {
    if (this.confirmHead <= this.simTick) return;
    if (this.confirmHead - this.simTick > MAX_FAST_FORWARD_PER_FRAME)
      this.requestSync({ reason: 'gap' });
    const end = Math.min(this.confirmHead, this.simTick + MAX_FAST_FORWARD_PER_FRAME);
    const pre = posesOf(this.current);
    while (this.simTick < end) {
      this.stepInto(this.simTick + 1, nowTick);
      this.promote();
    }
    this.smoother.correct(pre, posesOf(this.current));
    this.smoother.snapAll();
  }

  private stepInto(t: number, nowTick: number): void {
    const prev = this.ring.must(t - 1).state;
    const m0 = this.inputFor(0, t);
    const m1 = this.inputFor(1, t);
    const r = stepCombat(prev, [maskToInput(m0), maskToInput(m1)]);
    this.ring.set(t, r.state, m0, m1, r.events);
    this.reconciler.add(t, r.events, nowTick);
    this.simTick = t;
  }

  private promote(): void {
    const limit = Math.min(this.confirmHead, this.simTick);
    for (let t = this.lastPromoted + 1; t <= limit; t++) {
      const slot = this.ring.must(t);
      this.lastPromoted = t;
      if (t % HASH_EVERY === 0) {
        this.localHash.set(t, hashCombatState(slot.state));
        this.checkHash(t);
      }
      this.reconciler.confirm(t, slot.events);
      if (slot.state.outcome && !this.confirmedOutcome) {
        const result = combatResult(slot.state);
        if (result) this.confirmedOutcome = { tick: slot.state.outcome.tick, result };
      }
    }
    if (this.lastPromoted % 64 === 0) {
      this.seats[0].prune(this.lastPromoted);
      this.seats[1].prune(this.lastPromoted);
      for (const m of [this.serverHash, this.localHash]) {
        for (const t of m.keys()) if (t < this.lastPromoted - 300) m.delete(t);
      }
    }
  }

  private checkHash(t: number): void {
    const s = this.serverHash.get(t);
    const l = this.localHash.get(t);
    if (s === undefined || l === undefined || s === l) return;
    this.stats.desyncs += 1;
    this.requestSync({ reason: 'desync', tick: t, clientHash: l });
  }

  /** Hash of the promoted state at a multiple of HASH_EVERY (tests, telemetry). */
  localHashAt(t: number): number | undefined {
    return this.localHash.get(t);
  }

  decaySmoothing(dtMs: number): void {
    this.smoother.decay(dtMs, posesOf(this.current));
  }

  /** Render pair with correction offsets applied (same offsets on both, so interpolation stays smooth). */
  renderPair(): { prev: CombatState; curr: CombatState } {
    return { prev: this.smoother.apply(this.previous), curr: this.smoother.apply(this.current) };
  }
}
