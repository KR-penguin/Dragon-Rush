import {
  combatResult,
  createCombat,
  hashCombatState,
  serializeCombatState,
  stepCombat,
  type CombatResult,
  type CombatRules,
  type CombatSetup,
  type CombatState,
} from '@dragon-rush/combat';
import {
  CONFIRM_BOT_A,
  CONFIRM_BOT_B,
  CONFIRM_HELD,
  CONFIRM_SUBST_A,
  CONFIRM_SUBST_B,
  CONFIRM_TERMINAL,
  type ConfirmedTick,
  type FightConfirmPacket,
  type FightControlMsg,
  type FightController,
  type FightInputPacket,
  type FightRelayPacket,
  type FightSyncMsg,
  type FightSyncReason,
} from '@dragon-rush/protocol';
import {
  BOT_TENURE_TICKS,
  HANDBACK_BUFFERED_TICKS,
  HASH_EVERY,
  MAX_AHEAD_TICKS,
  PVE_HOLD_TICKS,
  PVP_HOLD_TICKS,
  SLACK_WINDOW,
  STARVE_BOT_MS,
  STREAM_ALIVE_MS,
  TICK_MS,
} from './constants';
import { maskToInput, substitute } from './mask';
import { SampleWindow } from './stats';

export interface AuthorityOptions {
  fightId: number;
  setup: CombatSetup;
  seed: number;
  rules: CombatRules;
  controllers: readonly FightController[];
  botMask: (state: CombatState, seat: 0 | 1, tick: number) => number;
}

interface SeatStream {
  controller: FightController;
  masks: Map<number, number>;
  revealed: Set<number>;
  lastRealTick: number;
  lastRealMask: number;
  lastAcceptedTick: number;
  lastPacketMs: number;
  substRun: number;
  holdTick: number;
  holdExpired: boolean;
  botUntil: number;
  pendingBotAt: number | null;
  wantsBack: boolean;
  slack: SampleWindow;
  jitterMs: number;
  lastTransit: number | null;
  eaten: number;
  late: number;
}

export interface AuthorityOutput {
  readonly relays: readonly { readonly recipient: 0 | 1; readonly packet: FightRelayPacket }[];
  readonly controls: readonly FightControlMsg[];
  readonly confirmed: readonly ConfirmedTick[];
  readonly end: CombatResult | null;
}

/** Server timeline. All methods take the server clock, so tests can drive it without timers or sockets. */
export class FightAuthority {
  readonly fightId: number;
  readonly pve: boolean;
  state: CombatState;
  readonly log: ConfirmedTick[] = [];
  readonly hashes = new Map<number, number>();
  readonly controls: FightControlMsg[] = [];
  readonly streams: [SeatStream, SeatStream];
  tick = 0;
  private outRelays: { recipient: 0 | 1; packet: FightRelayPacket }[] = [];
  private outControls: FightControlMsg[] = [];
  private ended: CombatResult | null = null;

  constructor(private readonly opts: AuthorityOptions) {
    this.fightId = opts.fightId;
    this.pve = opts.setup.kind === 'dragonFight';
    this.state = createCombat(opts.setup, opts.seed, opts.rules);
    const stream = (controller: FightController): SeatStream => ({
      controller,
      masks: new Map(),
      revealed: new Set(),
      lastRealTick: 0,
      lastRealMask: 0,
      lastAcceptedTick: 0,
      lastPacketMs: 0,
      substRun: 0,
      holdTick: 0,
      holdExpired: false,
      botUntil: 0,
      pendingBotAt: null,
      wantsBack: false,
      slack: new SampleWindow(SLACK_WINDOW),
      jitterMs: 0,
      lastTransit: null,
      eaten: 0,
      late: 0,
    });
    this.streams = [stream(opts.controllers[0] ?? 'human'), stream(opts.controllers[1] ?? 'bot')];
  }

  get result(): CombatResult | null {
    return this.ended;
  }
  get hash(): number {
    return hashCombatState(this.state);
  }

  /** First write wins. The caller has already derived the seat from the authenticated socket. */
  accept(
    seat: 0 | 1,
    packet: FightInputPacket,
    wallTick: number,
    nowMs: number,
    lateWake = false,
  ): number {
    if (this.ended || packet.fightId !== this.fightId || (this.pve && seat !== 0)) return 0;
    const s = this.streams[seat];
    s.lastPacketMs = nowMs;
    let accepted = 0;
    for (let i = packet.masks.length - 1; i >= 0; i--) {
      const tick = packet.newestTick - i;
      const mask = packet.masks[i]!;
      if (tick <= this.tick) {
        if (tick >= 1) s.late += 1;
        continue;
      }
      if (tick < 1 || tick > wallTick + MAX_AHEAD_TICKS || s.masks.has(tick)) continue;
      s.masks.set(tick, mask);
      s.lastAcceptedTick = Math.max(s.lastAcceptedTick, tick);
      accepted += 1;
      if (!lateWake) {
        const transit = nowMs - tick * TICK_MS;
        s.slack.push(tick * TICK_MS - nowMs);
        if (s.lastTransit !== null)
          s.jitterMs +=
            (Math.min(2 * TICK_MS, Math.abs(transit - s.lastTransit)) - s.jitterMs) / 16;
        s.lastTransit = transit;
      }
    }
    this.reveal();
    return accepted;
  }

  /** A human seat can request its controls back only after three buffered future masks exist. */
  requestBack(seat: 0 | 1): void {
    this.streams[seat].wantsBack = true;
  }

  takeOver(seat: 0 | 1): void {
    const s = this.streams[seat];
    if (s.controller === 'bot' || s.pendingBotAt !== null) return;
    const fromTick = Math.max(this.tick, s.lastAcceptedTick) + 1;
    s.pendingBotAt = fromTick;
    s.botUntil = fromTick + BOT_TENURE_TICKS;
    s.wantsBack = false;
    const msg: FightControlMsg = { fightId: this.fightId, seat, controller: 'bot', fromTick };
    this.controls.push(msg);
    this.outControls.push(msg);
  }

  private handBack(seat: 0 | 1): void {
    const s = this.streams[seat];
    if (s.controller !== 'bot' || !s.wantsBack || this.tick + 1 < s.botUntil) return;
    const k = this.tick + 1;
    for (let i = 0; i < HANDBACK_BUFFERED_TICKS; i++) if (!s.masks.has(k + i)) return;
    s.controller = 'human';
    s.holdExpired = false;
    s.holdTick = 0;
    s.wantsBack = false;
    const msg: FightControlMsg = { fightId: this.fightId, seat, controller: 'human', fromTick: k };
    this.controls.push(msg);
    this.outControls.push(msg);
  }

  /** A relay only leaves after the other human has committed that same tick. */
  private reveal(): void {
    if (this.pve) return;
    for (const seat of [0, 1] as const) {
      const s = this.streams[seat];
      const other = this.streams[seat === 0 ? 1 : 0];
      if (other.controller !== 'human') continue;
      for (const [tick, m] of s.masks) {
        if (s.revealed.has(tick)) continue;
        if (other.masks.has(tick) || tick <= this.tick) {
          this.outRelays.push({
            recipient: seat === 0 ? 1 : 0,
            packet: { fightId: this.fightId, seat, newestTick: tick, masks: [m] },
          });
          s.revealed.add(tick);
        }
      }
    }
  }

  advanceTo(wallTick: number, nowMs: number, maxSteps = 120): number {
    let stepped = 0;
    while (!this.ended && this.tick < wallTick && stepped < maxSteps) {
      const k = this.tick + 1;
      for (const seat of [0, 1] as const) {
        if (this.pve && seat === 1) continue;
        const s = this.streams[seat];
        if (s.controller === 'human' && nowMs - s.lastPacketMs >= STARVE_BOT_MS)
          this.takeOver(seat);
        if (s.pendingBotAt === k) {
          s.controller = 'bot';
          s.pendingBotAt = null;
        }
        this.handBack(seat);
      }
      let held = false;
      for (const seat of [0, 1] as const) {
        if (this.pve && seat === 1) continue;
        const s = this.streams[seat];
        if (s.controller === 'bot' || s.masks.has(k)) {
          s.holdTick = 0;
          s.holdExpired = false;
          continue;
        }
        if (this.pve) {
          if (wallTick < k + PVE_HOLD_TICKS) return stepped;
          continue;
        }
        if (s.holdTick !== k && !s.holdExpired && nowMs - s.lastPacketMs <= STREAM_ALIVE_MS)
          s.holdTick = k;
        if (s.holdTick === k && wallTick < k + PVP_HOLD_TICKS) {
          held = true;
          break;
        }
        if (s.holdTick === k) {
          held = true;
          s.holdExpired = true;
          s.holdTick = 0;
        }
      }
      if (held && wallTick < k + PVP_HOLD_TICKS) break;
      const masks: [number, number] = [0, 0];
      let flags = held ? CONFIRM_HELD : 0;
      for (const seat of [0, 1] as const) {
        if (this.pve && seat === 1) continue;
        const s = this.streams[seat];
        const real = s.masks.get(k);
        if (s.controller === 'bot') {
          masks[seat] = this.opts.botMask(this.state, seat, k);
          flags |= seat === 0 ? CONFIRM_BOT_A : CONFIRM_BOT_B;
          s.substRun = 0;
          s.lastRealTick = k;
          s.lastRealMask = masks[seat];
        } else if (real !== undefined) {
          masks[seat] = real;
          s.substRun = 0;
          s.lastRealTick = k;
          s.lastRealMask = real;
        } else {
          s.substRun += 1;
          masks[seat] = substitute(s.lastRealMask, s.substRun);
          flags |= seat === 0 ? CONFIRM_SUBST_A : CONFIRM_SUBST_B;
          s.eaten += 1;
        }
        if (!this.pve && real !== undefined && !s.revealed.has(k)) {
          this.outRelays.push({
            recipient: seat === 0 ? 1 : 0,
            packet: { fightId: this.fightId, seat, newestTick: k, masks: [real] },
          });
        }
        if (!this.pve && s.controller === 'bot') {
          for (const recipient of [0, 1] as const)
            this.outRelays.push({
              recipient,
              packet: { fightId: this.fightId, seat, newestTick: k, masks: [masks[seat]] },
            });
        }
        s.masks.delete(k);
        s.revealed.delete(k);
      }
      const result = stepCombat(this.state, [maskToInput(masks[0]), maskToInput(masks[1])]);
      this.state = result.state;
      this.tick = k;
      if (this.state.outcome) {
        flags |= CONFIRM_TERMINAL;
        this.ended = combatResult(this.state);
      }
      this.log.push({ a: masks[0], b: masks[1], flags });
      if (k % HASH_EVERY === 0) this.hashes.set(k, this.hash);
      stepped += 1;
      this.reveal();
    }
    return stepped;
  }

  confirm(firstTick: number, recipient: 0 | 1 | null): FightConfirmPacket {
    const ticks = this.log.slice(Math.max(0, firstTick - 1), this.tick);
    const s = recipient === null ? null : this.streams[recipient];
    const candidate = Math.floor(this.tick / HASH_EVERY) * HASH_EVERY;
    const hashTick = candidate >= firstTick ? candidate : -1;
    return {
      fightId: this.fightId,
      firstTick,
      ticks,
      slackMedMs: Math.max(-32768, Math.min(32767, Math.round(s?.slack.median() ?? 0))),
      jitUpMs: Math.max(0, Math.min(255, Math.round(s?.jitterMs ?? 0))),
      quality: 0,
      hashTick,
      hash: hashTick < 0 ? 0 : (this.hashes.get(hashTick) ?? 0),
    };
  }

  sync(reason: FightSyncReason, recipient: 0 | 1 | null = null): FightSyncMsg {
    return {
      fightId: this.fightId,
      reason,
      tick: this.tick,
      state: serializeCombatState(this.state),
      hash: this.hash,
      seats: this.streams.map((s) => ({
        lastRealTick: s.lastRealTick,
        lastRealMask: s.lastRealMask,
        substRun: s.substRun,
        controller: s.controller,
      })),
      controls: this.controls.filter((c) => c.fromTick > this.tick),
      pending: this.streams.flatMap((s, seat) =>
        [...s.masks.entries()]
          .filter(
            ([tick]) =>
              tick > this.tick &&
              recipient !== null &&
              (seat === recipient || this.streams[recipient].masks.has(tick)),
          )
          .map(([tick, mask]) => ({ seat: seat as 0 | 1, firstTick: tick, masks: [mask] })),
      ),
    };
  }

  drain(): AuthorityOutput {
    const output = {
      relays: this.outRelays,
      controls: this.outControls,
      confirmed: this.log,
      end: this.ended,
    };
    this.outRelays = [];
    this.outControls = [];
    return output;
  }
}
