import {
  applyAction,
  createGameWithEvents,
  getLegalActions,
  isLegalAction,
  resolveCombatWithDice,
  toPublicState,
  type Action,
  type GameEvent,
  type GameState,
  type JobId,
  type RulesConfig,
  type SeatId,
} from '@dragon-rush/engine';
import { createHeuristicBot, createPolicyRandom, type Policy } from '@dragon-rush/ai';
import type { GameSnapshotMsg, GameUpdateMsg, OnlineSeatInfo, SeatStatusMsg } from '@dragon-rush/protocol';
import { ProtocolError } from '../errors';
import { timeoutAction } from './timeoutAction';
import { TurnTimer } from './TurnTimer';

export interface SessionSeatSetup {
  lobbySeat: number;
  kind: 'human' | 'bot' | 'model';
  playerId: string | null;
  name: string;
  job: JobId;
  botName?: string;
  policy?: Policy;
}

export interface GameSessionOptions {
  seats: SessionSeatSetup[];
  rules: RulesConfig;
  seed: number;
  turnTimeoutMs: number;
  reconnectGraceMs: number;
  botActionDelayMs: number;
  maxConsecutiveTimeouts: number;
}

/** Side effects the session needs from the transport layer. */
export interface SessionNotifier {
  update(events: GameEvent[]): void;
  seatStatus(msg: SeatStatusMsg): void;
  ended(): void;
}

export type SubmitSource = 'human' | 'timer' | 'policy';

/**
 * TEMPORARY resolver until real-time combat (@dragon-rush/combat) lands: settles a pending COMBAT
 * with the dice rules inside the same submit, so clients see one update exactly like the old 'dice' mode.
 */
function autoResolveCombat(r: { state: GameState; events: GameEvent[] }): { state: GameState; events: GameEvent[] } {
  let { state, events } = r;
  while (state.pending?.phase === 'COMBAT') {
    const settled = resolveCombatWithDice(state);
    state = settled.state;
    events = [...events, ...settled.events];
  }
  return { state, events };
}

interface SeatController {
  readonly engineSeat: SeatId;
  readonly setup: SessionSeatSetup;
  policy: Policy | null;
  connected: boolean;
  proxied: boolean;
  permanentBot: boolean;
  timeouts: number;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

/** Authoritative game: every input (human, timer, policy) goes through `submit`. */
export class GameSession {
  private state: GameState;
  private _version = 0;
  private readonly seats: SeatController[];
  private readonly timer: TurnTimer;
  private policyTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly random: () => number;
  private readonly proxyPolicy = createHeuristicBot('growth');
  private disposed = false;
  readonly initialEvents: GameEvent[];

  constructor(
    private readonly opts: GameSessionOptions,
    private readonly notify: SessionNotifier,
  ) {
    const created = createGameWithEvents({ seats: opts.seats.map((s) => ({ job: s.job })) }, opts.rules, opts.seed);
    this.state = created.state;
    this.initialEvents = created.events;
    this.random = createPolicyRandom((opts.seed ^ 0x6a09e667) >>> 0);
    this.timer = new TurnTimer(opts.turnTimeoutMs);
    this.seats = this.state.seatOrigin.map((origin, engineSeat) => {
      const setup = opts.seats[origin]!;
      return {
        engineSeat,
        setup,
        policy: setup.kind === 'human' ? null : (setup.policy ?? createHeuristicBot('growth')),
        connected: true,
        proxied: false,
        permanentBot: false,
        timeouts: 0,
        graceTimer: null,
      };
    });
  }

  get version(): number {
    return this._version;
  }

  get isOver(): boolean {
    return this.state.outcome !== null;
  }

  get publicState() {
    return toPublicState(this.state);
  }

  /** Starts timers/bots for the first decision. Call once after listeners are ready. */
  start(): void {
    this.scheduleNext();
  }

  seatOf(playerId: string): SeatId | null {
    const s = this.seats.find((x) => x.setup.playerId === playerId);
    return s ? s.engineSeat : null;
  }

  submit(seat: SeatId, action: Action, stateVersion: number, source: SubmitSource): number {
    if (this.disposed || !this.state.pending) throw new ProtocolError('ILLEGAL_ACTION', 'game is over');
    if (stateVersion !== this._version) throw new ProtocolError('STALE_VERSION', `version is ${this._version}`);
    if (this.state.pending.actor !== seat) throw new ProtocolError('NOT_YOUR_TURN');
    if (!isLegalAction(this.state, action)) throw new ProtocolError('ILLEGAL_ACTION');
    const ctl = this.seats[seat]!;
    if (source === 'human') ctl.timeouts = 0;
    const r = autoResolveCombat(applyAction(this.state, action));
    this.state = r.state;
    this._version += 1;
    this.notify.update(r.events);
    this.scheduleNext();
    if (this.state.outcome) this.notify.ended();
    return this._version;
  }

  /** Any input from a human releases a timeout-triggered proxy (not a disconnect proxy). */
  humanActivity(playerId: string): void {
    const ctl = this.seats.find((s) => s.setup.playerId === playerId);
    if (!ctl || !ctl.proxied || !ctl.connected || ctl.permanentBot) return;
    ctl.proxied = false;
    ctl.timeouts = 0;
    this.notify.seatStatus(this.statusOf(ctl));
    this.scheduleNext();
  }

  disconnect(playerId: string): void {
    const ctl = this.seats.find((s) => s.setup.playerId === playerId);
    if (!ctl || !ctl.connected) return;
    ctl.connected = false;
    ctl.proxied = true;
    if (ctl.graceTimer) clearTimeout(ctl.graceTimer);
    ctl.graceTimer = setTimeout(() => {
      ctl.graceTimer = null;
      ctl.permanentBot = true;
      this.notify.seatStatus(this.statusOf(ctl));
    }, this.opts.reconnectGraceMs);
    this.notify.seatStatus({ ...this.statusOf(ctl), graceMsLeft: this.opts.reconnectGraceMs });
    this.scheduleNext();
  }

  reconnect(playerId: string): void {
    const ctl = this.seats.find((s) => s.setup.playerId === playerId);
    if (!ctl || ctl.connected) return;
    ctl.connected = true;
    if (ctl.graceTimer) clearTimeout(ctl.graceTimer);
    ctl.graceTimer = null;
    if (!ctl.permanentBot) {
      ctl.proxied = false;
      ctl.timeouts = 0;
    }
    this.notify.seatStatus(this.statusOf(ctl));
    this.scheduleNext();
  }

  private controlledByBot(ctl: SeatController): boolean {
    return ctl.setup.kind !== 'human' || ctl.proxied || ctl.permanentBot;
  }

  private statusOf(ctl: SeatController): SeatStatusMsg {
    return { seat: ctl.engineSeat, connected: ctl.connected, controlledBy: this.controlledByBot(ctl) ? 'bot' : 'human' };
  }

  private scheduleNext(): void {
    if (this.policyTimer) clearTimeout(this.policyTimer);
    this.policyTimer = null;
    const pending = this.state.pending;
    if (this.disposed || !pending) {
      this.timer.cancel();
      return;
    }
    const ctl = this.seats[pending.actor]!;
    if (this.controlledByBot(ctl)) {
      this.timer.cancel();
      const version = this._version;
      this.policyTimer = setTimeout(() => this.runPolicy(ctl, version), this.opts.botActionDelayMs);
      return;
    }
    this.timer.arm(`${pending.actor}:${pending.phase}:${this.state.current}:${this.state.round}`, () => this.onTimeout(ctl));
  }

  private runPolicy(ctl: SeatController, version: number): void {
    this.policyTimer = null;
    if (this.disposed || version !== this._version || this.state.pending?.actor !== ctl.engineSeat) return;
    const legal = getLegalActions(this.state);
    const ctx = { view: toPublicState(this.state), seat: ctl.engineSeat, legal, random: this.random };
    let action: Action;
    try {
      action = (ctl.setup.kind === 'human' ? this.proxyPolicy : ctl.policy ?? this.proxyPolicy).decide(ctx);
      if (!isLegalAction(this.state, action)) throw new Error('policy returned an illegal action');
    } catch {
      action = this.proxyPolicy.decide(ctx);
    }
    this.submit(ctl.engineSeat, action, version, 'policy');
  }

  private onTimeout(ctl: SeatController): void {
    if (this.disposed || this.state.pending?.actor !== ctl.engineSeat) return;
    ctl.timeouts += 1;
    const action = timeoutAction(this.state);
    const proxyNow = ctl.timeouts >= this.opts.maxConsecutiveTimeouts;
    if (proxyNow) {
      ctl.proxied = true;
      this.notify.seatStatus(this.statusOf(ctl));
    }
    this.submit(ctl.engineSeat, action, this._version, 'timer');
  }

  seatInfos(names: (setup: SessionSeatSetup) => string = (s) => s.name): OnlineSeatInfo[] {
    return this.seats.map((ctl) => ({
      seat: ctl.engineSeat,
      lobbySeat: ctl.setup.lobbySeat,
      name: names(ctl.setup),
      kind: ctl.setup.kind,
      ...(ctl.setup.botName ? { botName: ctl.setup.botName } : {}),
      connected: ctl.setup.kind === 'human' ? ctl.connected : true,
      controlledBy: this.controlledByBot(ctl) ? 'bot' : 'human',
    }));
  }

  snapshotFor(playerId: string | null): GameSnapshotMsg {
    const pending = this.state.pending;
    const yourSeat = playerId ? this.seatOf(playerId) : null;
    const msg: GameSnapshotMsg = {
      version: this._version,
      publicState: toPublicState(this.state),
      pending: pending
        ? {
            actor: pending.actor,
            phase: pending.phase,
            timeLeftMs: this.controlledByBot(this.seats[pending.actor]!) ? null : this.timer.timeLeftMs(),
          }
        : null,
      seats: this.seatInfos(),
      yourSeat,
    };
    const ctl = yourSeat !== null ? this.seats[yourSeat] : undefined;
    if (pending && yourSeat === pending.actor && ctl && !ctl.permanentBot) msg.legalActions = getLegalActions(this.state);
    return msg;
  }

  updateFor(playerId: string | null, events: GameEvent[]): GameUpdateMsg {
    return { ...this.snapshotFor(playerId), events };
  }

  dispose(): void {
    this.disposed = true;
    this.timer.cancel();
    if (this.policyTimer) clearTimeout(this.policyTimer);
    for (const s of this.seats) if (s.graceTimer) clearTimeout(s.graceTimer);
  }
}
