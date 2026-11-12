import {
  combatResult,
  createCombat,
  deserializeCombatState,
  hashCombatState,
  stepCombat,
  type CombatEvent,
  type CombatResult,
  type CombatState,
} from '@dragon-rush/combat';
import {
  decodeFightConfirm,
  encodeFightAck,
  FIGHT_C2S,
  FIGHT_S2C,
  type FightEndMsg,
  type FightStartMsg,
  type FightSyncMsg,
} from '@dragon-rush/protocol';
import { ArrivalJitter } from '../clock';
import {
  FRAME_DT_CLAMP_MS,
  HASH_EVERY,
  SPECTATOR_BUFFER_MAX,
  SPECTATOR_BUFFER_MIN,
  SPECTATOR_CATCHUP_EXTRA,
  SYNC_MIN_INTERVAL_MS,
  TICK_MS,
} from '../constants';
import { maskToInput } from '../mask';
import type { FightTransport } from '../transport';

const ACK_EVERY_MS = 250;

/** B = clamp(3 + ceil(1.25 * p97 jitter / T) + 2, 6, 15) ticks. */
export const spectatorBuffer = (p97JitterMs: number): number =>
  Math.max(
    SPECTATOR_BUFFER_MIN,
    Math.min(SPECTATOR_BUFFER_MAX, 3 + Math.ceil((1.25 * p97JitterMs) / TICK_MS) + 2),
  );

/**
 * Spectator: deterministic playback of the confirmed input stream behind an adaptive buffer (never rolls
 * back). Playback rate 0.95..1.05, 2x catch-up when far behind, hold on underrun; hashes checked as fighters do.
 */
export class SpectatorPlayback {
  private readonly masks: number[] = [];
  private readonly flagsLog: number[] = [];
  private base = 0;
  private state: CombatState;
  private prevState: CombatState;
  confirmHead = 0;
  private playClock = 0;
  private lastFrameMs: number | null = null;
  private playing = false;
  private lastAckMs = Number.NEGATIVE_INFINITY;
  private lastSyncMs = Number.NEGATIVE_INFINITY;
  private readonly serverHash = new Map<number, number>();
  readonly jitter = new ArrivalJitter();
  end: FightEndMsg | null = null;
  needsJoin: boolean;
  hidden = false;
  desyncs = 0;
  underruns = 0;
  syncs = 0;
  private pendingSync: {
    reason: 'join' | 'gap' | 'desync' | 'backlog';
    tick?: number;
    clientHash?: number;
  } | null = null;
  private readonly fightId: number;
  private readonly duel: boolean;
  private outEvents: CombatEvent[] = [];

  constructor(
    private readonly start: FightStartMsg,
    private readonly transport: FightTransport,
    /** True when joining a running fight: start from a sync, not from tick 0. */
    joining: boolean,
  ) {
    this.fightId = start.fightId;
    this.duel = start.setup.kind === 'duel';
    this.state = createCombat(start.setup, start.seed, start.rules);
    this.prevState = this.state;
    this.needsJoin = joining;
    if (joining) this.pendingSync = { reason: 'join' };
  }

  get tick(): number {
    return this.state.tick;
  }

  get current(): CombatState {
    return this.state;
  }

  get previous(): CombatState {
    return this.prevState;
  }

  get buffer(): number {
    return spectatorBuffer(this.jitter.p97Ms);
  }

  receive(event: string, payload: unknown, nowMs: number): void {
    switch (event) {
      case FIGHT_S2C.confirm: {
        const p = decodeFightConfirm(payload);
        if (!p || p.fightId !== this.fightId) return;
        if (p.hashTick >= 0) {
          this.serverHash.set(p.hashTick, p.hash);
          if (p.hashTick <= this.state.tick) this.checkHash(p.hashTick, null);
        }
        if (p.ticks.length === 0 || this.needsJoin) return;
        const last = p.firstTick + p.ticks.length - 1;
        this.jitter.add(last, nowMs);
        if (last <= this.confirmHead) return;
        if (p.firstTick > this.confirmHead + 1) {
          this.pendingSync ??= { reason: 'gap' };
          return;
        }
        for (let t = this.confirmHead + 1; t <= last; t++) {
          const e = p.ticks[t - p.firstTick]!;
          this.masks.push(e.a, e.b);
          this.flagsLog.push(e.flags);
        }
        this.confirmHead = last;
        return;
      }
      case FIGHT_S2C.sync: {
        const msg = payload as FightSyncMsg;
        if (msg.fightId === this.fightId) this.applySync(msg);
        return;
      }
      case FIGHT_S2C.end: {
        const msg = payload as FightEndMsg;
        if (msg.fightId === this.fightId) this.end = msg;
        return;
      }
      default:
        return;
    }
  }

  private applySync(msg: FightSyncMsg): void {
    const state = deserializeCombatState(msg.state, this.start.rules);
    if (hashCombatState(state) !== msg.hash) {
      this.pendingSync ??= { reason: 'desync', tick: msg.tick, clientHash: hashCombatState(state) };
      return;
    }
    this.state = state;
    this.prevState = this.state;
    this.base = msg.tick;
    this.masks.length = 0;
    this.flagsLog.length = 0;
    this.confirmHead = msg.tick;
    this.playClock = msg.tick;
    this.needsJoin = false;
    this.syncs += 1;
    for (const t of [...this.serverHash.keys()]) if (t <= msg.tick) this.serverHash.delete(t);
  }

  private checkHash(t: number, local: number | null): void {
    const s = this.serverHash.get(t);
    if (s === undefined) return;
    const l = local ?? (t === this.state.tick ? hashCombatState(this.state) : null);
    if (l === null || l === s) return;
    this.desyncs += 1;
    this.pendingSync ??= { reason: 'desync', tick: t, clientHash: l };
  }

  private stepOne(): void {
    const t = this.state.tick + 1;
    const i = (t - this.base - 1) * 2;
    const a = this.masks[i] ?? 0;
    const b = this.duel ? (this.masks[i + 1] ?? 0) : 0;
    this.prevState = this.state;
    const r = stepCombat(this.state, [maskToInput(a), maskToInput(b)]);
    this.state = r.state;
    this.outEvents.push(...r.events);
    if (t % HASH_EVERY === 0) this.checkHash(t, hashCombatState(this.state));
  }

  /** One render frame; returns the new (confirmed) events. */
  frame(nowMs: number): readonly CombatEvent[] {
    const dt =
      this.lastFrameMs === null
        ? 0
        : Math.min(Math.max(0, nowMs - this.lastFrameMs), FRAME_DT_CLAMP_MS);
    this.lastFrameMs = nowMs;
    if (nowMs - this.lastAckMs >= ACK_EVERY_MS) {
      this.lastAckMs = nowMs;
      this.transport.send(
        FIGHT_C2S.ack,
        encodeFightAck({ fightId: this.fightId, tick: this.confirmHead }),
      );
    }
    if (this.pendingSync && nowMs - this.lastSyncMs >= SYNC_MIN_INTERVAL_MS) {
      this.lastSyncMs = nowMs;
      this.transport.send(FIGHT_C2S.requestSync, { fightId: this.fightId, ...this.pendingSync });
      this.pendingSync = null;
    }
    if (this.hidden || this.needsJoin) return this.drainEvents();
    const b = this.buffer;
    const ended = this.end !== null && this.confirmHead >= this.end.endTick;
    // Playback starts once the buffer has filled.
    if (!this.playing && !ended && this.confirmHead - this.base < b) return this.drainEvents();
    this.playing = true;
    const lag = this.confirmHead - this.playClock;
    let rate = 1;
    if (lag > b + SPECTATOR_CATCHUP_EXTRA) rate = 2;
    else if (!ended) rate = 1 + Math.max(-0.05, Math.min(0.05, 0.01 * (lag - b)));
    // Underrun: hold the frame at the newest confirmed tick.
    this.playClock = Math.min(this.playClock + (dt * rate) / TICK_MS, this.confirmHead);
    if (!ended && this.state.tick >= this.confirmHead) this.underruns += 1;
    let n = 0;
    while (this.state.tick < Math.floor(this.playClock) && !this.state.outcome && n < 600) {
      this.stepOne();
      n += 1;
    }
    this.trim();
    return this.drainEvents();
  }

  private trim(): void {
    const consumed = this.state.tick - this.base;
    if (consumed > 512) {
      this.masks.splice(0, consumed * 2);
      this.flagsLog.splice(0, consumed);
      this.base = this.state.tick;
    }
  }

  private drainEvents(): CombatEvent[] {
    const out = this.outEvents;
    this.outEvents = [];
    return out;
  }

  /** Render alpha between previous and current. */
  get alpha(): number {
    return Math.max(0, Math.min(1, this.playClock - this.state.tick + 1));
  }

  result(): CombatResult | null {
    if (this.end && this.state.tick >= this.end.endTick) return this.end.outcome;
    return this.state.outcome ? combatResult(this.state) : null;
  }

  finalHash(): number {
    return hashCombatState(this.state);
  }
}
