import {
  COMBAT_PACK_VERSION,
  hashCombatRules,
  type CombatResult,
  type CombatState,
} from '@dragon-rush/combat';
import {
  decodeFightConfirm,
  decodeFightRelay,
  encodeFightInput,
  FIGHT_C2S,
  FIGHT_S2C,
  qualityOf,
  type FightControlMsg,
  type FightEndMsg,
  type FightGoMsg,
  type FightRetimeMsg,
  type FightStartMsg,
  type FightSyncMsg,
  type SeatQuality,
} from '@dragon-rush/protocol';
import { ArrivalJitter, type ClockSync } from '../clock';
import {
  FRAME_DT_CLAMP_MS,
  HARD_CAP_PVE,
  HARD_CAP_PVP,
  LEAD_BASE_MS,
  MAX_INPUT_MASKS_PER_PACKET,
  MAX_INPUT_TICKS_PER_FRAME,
  OVERFLOW_TICKS,
  SYNC_MIN_INTERVAL_MS,
  TICK_MS,
} from '../constants';
import { chooseInputDelay, LeadController, type InputDelayPreference } from '../timing';
import type { FightTransport } from '../transport';
import { RollbackSession } from './rollbackSession';

export type FightClientPhase = 'waiting' | 'preroll' | 'live' | 'ended';

/** Why a fight cannot be played on this client (the server bot plays the seat instead). */
export type FightAbortReason = 'rules-mismatch' | 'pack-mismatch' | 'build-mismatch';

export const combatBuildId = (netcodeVersion: number): string =>
  `pack${COMBAT_PACK_VERSION}-net${netcodeVersion}`;

/** Checks fight:start against this build. */
export function checkFightStart(msg: FightStartMsg, buildId: string): FightAbortReason | null {
  if (msg.packVersion !== COMBAT_PACK_VERSION) return 'pack-mismatch';
  if (hashCombatRules(msg.rules) !== msg.rulesHash) return 'rules-mismatch';
  if (msg.combatBuildId !== buildId) return 'build-mismatch';
  return null;
}

export interface FightClientOptions {
  readonly start: FightStartMsg;
  readonly transport: FightTransport;
  readonly clock: ClockSync;
  readonly inputDelayPref?: InputDelayPreference;
}

/** Connection-quality numbers for the HUD and the debug overlay (read at <= 10 Hz). */
export interface FightNetStats {
  readonly rttMs: number;
  readonly effRttMs: number;
  readonly jitterMs: number;
  readonly inputDelay: number;
  readonly timeScale: number;
  readonly leadErrTicks: number;
  /** simTick - confirmed tick. */
  readonly unconfirmed: number;
  readonly rollbacks: number;
  readonly rollbackFrames: number;
  readonly frozen: boolean;
  readonly frozenMs: number;
  readonly eatenOwn: number;
  readonly desyncs: number;
  readonly quality: readonly [SeatQuality, SeatQuality];
  readonly ownBot: boolean;
  readonly opponentBot: boolean;
}

/**
 * One fighter's online fight: owns the RollbackSession, the input clock (anchored on the server epoch and
 * nudged by the lead controller), the fixed input delay, packetisation and message ingest. Pure: callers
 * pass `now` and feed transport messages; the web app and the tests drive it the same way.
 */
export class FightClient {
  readonly session: RollbackSession;
  readonly lead = new LeadController();
  readonly downJitter = new ArrivalJitter();
  readonly seat: 0 | 1;
  readonly pve: boolean;
  inputDelay: number | null = null;
  epochServerMs: number | null = null;
  /** Last produced (stamped) input tick and the fractional input clock. */
  inputTick = Number.NEGATIVE_INFINITY;
  private inputClock = 0;
  private lastFrameMs: number | null = null;
  private lastMask = 0;
  private lastSyncMs = Number.NEGATIVE_INFINITY;
  private frozenSince: number | null = null;
  hidden = false;
  end: FightEndMsg | null = null;
  quality: [SeatQuality, SeatQuality] = [0, 0];
  lastMessageMs = 0;
  reanchors = 0;
  private readonly fightId: number;

  constructor(private readonly opts: FightClientOptions) {
    const { start } = opts;
    if (start.you.role !== 'fighter') throw new Error('FightClient is for fighters');
    this.seat = start.you.seat;
    this.fightId = start.fightId;
    this.pve = start.setup.kind === 'dragonFight';
    this.session = new RollbackSession({
      setup: start.setup,
      seed: start.seed,
      rules: start.rules,
      localSeat: this.seat,
      controllers: start.seats.map((s) => s.controller),
      hardCap: this.pve ? HARD_CAP_PVE : HARD_CAP_PVP,
    });
  }

  get phase(): FightClientPhase {
    if (this.end && this.session.lastPromoted >= this.end.endTick) return 'ended';
    if (this.epochServerMs === null) return 'waiting';
    return this.inputTick < 1 ? 'preroll' : 'live';
  }

  /** Locks D (never changes during the fight) and tells the server this client is ready. */
  ready(): number {
    if (this.inputDelay === null) {
      this.inputDelay = chooseInputDelay(
        this.opts.clock.effRttMs,
        this.opts.inputDelayPref ?? 0,
        this.pve,
      );
      this.opts.transport.send(FIGHT_C2S.ready, {
        fightId: this.fightId,
        inputDelay: this.inputDelay,
        rttMs: Math.round(this.opts.clock.srtt ?? 0),
        jitterMs: Math.round(this.opts.clock.rttvar),
      });
    }
    return this.inputDelay;
  }

  /** Locks D without telling the server (a reconnecting client keeps its D). */
  lockInputDelay(d: number): void {
    this.inputDelay ??= d;
  }

  private estServerTick(nowMs: number): number {
    return (this.opts.clock.toServer(nowMs) - (this.epochServerMs ?? 0)) / TICK_MS;
  }

  private anchorTick(nowMs: number): number {
    const c = this.opts.clock;
    const jit = Math.max(this.downJitter.jitterMs, c.rttvar / 2);
    const leadMs = (c.srtt ?? 0) / 2 + LEAD_BASE_MS + 2 * jit;
    return (
      Math.floor(this.estServerTick(nowMs)) + Math.ceil(leadMs / TICK_MS) - (this.inputDelay ?? 0)
    );
  }

  /** Jumps forward (filling own stamps) or holds the clock until real time passes the stamped head. */
  reanchor(nowMs: number): void {
    const a = this.anchorTick(nowMs);
    const d = this.inputDelay ?? 0;
    if (!Number.isFinite(this.inputTick)) {
      this.inputTick = a - 1;
    } else if (a > this.inputTick) {
      for (let t = Math.max(this.inputTick + 1, a - 64); t <= a; t++)
        this.session.stamp(t + d, this.lastMask);
      this.inputTick = a;
    }
    this.inputClock = a;
    this.lead.reset();
    this.reanchors += 1;
  }

  receive(event: string, payload: unknown, nowMs: number): void {
    this.lastMessageMs = nowMs;
    switch (event) {
      case FIGHT_S2C.go: {
        const msg = payload as FightGoMsg;
        if (msg.fightId !== this.fightId) return;
        const first = this.epochServerMs === null;
        this.epochServerMs = msg.epochServerMs;
        if (first) {
          this.ready();
          this.reanchor(nowMs);
        }
        return;
      }
      case FIGHT_S2C.relay: {
        const p = decodeFightRelay(payload);
        if (p && p.fightId === this.fightId) this.session.ingestRelay(p);
        return;
      }
      case FIGHT_S2C.confirm: {
        const p = decodeFightConfirm(payload);
        if (!p || p.fightId !== this.fightId) return;
        if (p.ticks.length > 0) this.downJitter.add(p.firstTick + p.ticks.length - 1, nowMs);
        this.quality = [qualityOf(p.quality, 0), qualityOf(p.quality, 1)];
        if (
          !this.hidden &&
          this.epochServerMs !== null &&
          this.lead.onConfirm(p.slackMedMs, p.jitUpMs)
        )
          this.reanchor(nowMs);
        this.session.ingestConfirm(p);
        return;
      }
      case FIGHT_S2C.control: {
        const msg = payload as FightControlMsg;
        if (msg.fightId === this.fightId) this.session.ingestControl(msg);
        return;
      }
      case FIGHT_S2C.sync: {
        const msg = payload as FightSyncMsg;
        if (msg.fightId === this.fightId) this.session.ingestSync(msg);
        return;
      }
      case FIGHT_S2C.retime: {
        const msg = payload as FightRetimeMsg;
        if (msg.fightId !== this.fightId) return;
        this.epochServerMs = msg.epochServerMs;
        this.reanchor(nowMs);
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

  /** Tab hidden: the server hands the seat to a bot; nothing is simulated while hidden. */
  setHidden(hidden: boolean, nowMs: number): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (hidden) {
      this.opts.transport.send(FIGHT_C2S.away, { fightId: this.fightId, reason: 'hidden' });
    } else {
      this.opts.transport.send(FIGHT_C2S.back, { fightId: this.fightId });
      this.lastFrameMs = null;
      if (this.epochServerMs !== null) this.reanchor(nowMs);
    }
  }

  /**
   * One render frame. `sample` reads the local input for the next input tick (called at most 5 times).
   * Returns the render alpha (0..1) between session.previous and session.current.
   */
  frame(nowMs: number, sample: (state: CombatState) => number): number {
    // The GO packet may arrive during the VS overlay, before this frame loop starts.
    // Re-anchor to the current wall clock so the intro's elapsed time does not delay input.
    if (this.lastFrameMs === null && this.epochServerMs !== null) this.reanchor(nowMs);
    const dt =
      this.lastFrameMs === null
        ? 0
        : Math.min(Math.max(0, nowMs - this.lastFrameMs), FRAME_DT_CLAMP_MS);
    this.lastFrameMs = nowMs;
    if (this.epochServerMs === null || this.hidden) return 1;
    const d = this.inputDelay ?? this.ready();
    const ended = this.end !== null;
    this.inputClock += (dt * this.lead.timeScale) / TICK_MS;
    let produced = 0;
    while (
      !ended &&
      this.inputTick < Math.floor(this.inputClock) &&
      produced < MAX_INPUT_TICKS_PER_FRAME
    ) {
      this.inputTick += 1;
      this.lastMask = sample(this.session.current);
      this.session.stamp(this.inputTick + d, this.lastMask);
      produced += 1;
    }
    if (!ended && Math.floor(this.inputClock) - this.inputTick >= MAX_INPUT_TICKS_PER_FRAME)
      this.reanchor(nowMs);
    if (produced > 0) this.sendInputs(produced, d);
    const target = Math.max(0, this.inputTick);
    const r = this.session.update(target, target);
    this.session.decaySmoothing(dt);
    if (r.frozen) this.frozenSince ??= nowMs;
    else this.frozenSince = null;
    if (target - this.session.lastPromoted > OVERFLOW_TICKS)
      this.session.requestSync({ reason: 'overflow' });
    this.flushSyncRequest(nowMs);
    return this.session.simTick >= this.inputTick
      ? Math.min(1, Math.max(0, this.inputClock - this.inputTick))
      : 1;
  }

  private sendInputs(produced: number, d: number): void {
    const own = this.session.seats[this.seat];
    const newest = this.inputTick + d;
    const n = Math.min(MAX_INPUT_MASKS_PER_PACKET, Math.max(4, produced));
    const masks: number[] = [];
    for (let i = 0; i < n; i++) {
      const m = own.stampAt(newest - i);
      if (m === null) break;
      masks.push(m);
    }
    if (masks.length === 0) return;
    this.opts.transport.send(
      FIGHT_C2S.input,
      encodeFightInput({
        fightId: this.fightId,
        newestTick: newest,
        ackConfirmTick: this.session.confirmHead,
        masks,
      }),
    );
  }

  private flushSyncRequest(nowMs: number): void {
    if (!this.session.syncRequest || nowMs - this.lastSyncMs < SYNC_MIN_INTERVAL_MS) return;
    const r = this.session.takeSyncRequest();
    if (!r) return;
    this.lastSyncMs = nowMs;
    this.opts.transport.send(FIGHT_C2S.requestSync, { fightId: this.fightId, ...r });
  }

  /** After a reconnect: ask for the full state (the same D is kept). */
  requestJoinSync(nowMs: number): void {
    this.session.requestSync({ reason: 'join' });
    this.lastSyncMs = Number.NEGATIVE_INFINITY;
    this.flushSyncRequest(nowMs);
  }

  /** Confirmed result: from fight:end once the client caught up (or is hopelessly behind), or a confirmed KO. */
  result(): CombatResult | null {
    if (this.end) {
      if (
        this.session.lastPromoted >= this.end.endTick ||
        this.end.endTick - this.session.lastPromoted > 600
      ) {
        return this.end.outcome;
      }
    }
    return this.session.confirmedOutcome?.result ?? null;
  }

  stats(nowMs: number): FightNetStats {
    const c = this.opts.clock;
    const s = this.session;
    const own = s.seats[this.seat];
    const other = s.duel ? s.seats[this.seat === 0 ? 1 : 0] : null;
    return {
      rttMs: c.srtt ?? 0,
      effRttMs: c.effRttMs,
      jitterMs: this.downJitter.jitterMs,
      inputDelay: this.inputDelay ?? 0,
      timeScale: this.lead.timeScale,
      leadErrTicks: this.lead.lastErrTicks,
      unconfirmed: s.simTick - s.lastPromoted,
      rollbacks: s.stats.rollbacks,
      rollbackFrames: s.stats.rollbackDepth.quantile(0.95),
      frozen: this.frozenSince !== null,
      frozenMs: this.frozenSince === null ? 0 : nowMs - this.frozenSince,
      eatenOwn: s.stats.eatenOwn,
      desyncs: s.stats.desyncs,
      quality: this.quality,
      ownBot: own.controllerAt(s.simTick + 1) === 'bot',
      opponentBot: other ? other.controllerAt(s.simTick + 1) === 'bot' : false,
    };
  }
}
