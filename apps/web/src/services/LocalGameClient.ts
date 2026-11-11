import {
  applyAction,
  createGameWithEvents,
  DEFAULT_RULES,
  getLegalActions,
  isLegalAction,
  toPublicState,
  withRules,
  type Action,
  type GameEvent,
  type GameState,
  type JobId,
  type SeatId,
} from '@hero-dice/engine';
import { createPolicyByName, createPolicyRandom, type Policy } from '@hero-dice/ai';
import type { GameClient, GameUpdate, SeatInfo, SubmitResult } from './gameClient';

export interface LocalSeatConfig {
  name: string;
  job: JobId;
  kind: 'human' | 'bot';
  botName?: string;
}

export interface LocalGameConfig {
  seats: LocalSeatConfig[];
  seed?: number;
  maxRounds?: number | null;
  botDelayMs?: number;
}

export type Scheduler = (fn: () => void, ms: number) => () => void;

const defaultScheduler: Scheduler = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export const randomSeed = (): number => {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return (buf[0]! % 2 ** 21) * 2 ** 32 + buf[1]!;
};

/** Runs the engine and bots in the browser: hot-seat and vs-bot play without a server. */
export class LocalGameClient implements GameClient {
  readonly mode = 'local' as const;
  private state: GameState;
  private version = 0;
  private lastEvents: GameEvent[];
  private readonly seats: SeatInfo[];
  private readonly policies = new Map<SeatId, Policy>();
  private readonly random: () => number;
  private readonly listeners = new Set<(u: GameUpdate) => void>();
  private cancelBot: (() => void) | null = null;
  private disposed = false;

  constructor(
    private readonly config: LocalGameConfig,
    private readonly schedule: Scheduler = defaultScheduler,
  ) {
    const seed = config.seed ?? randomSeed();
    const rules = withRules({ maxRounds: config.maxRounds ?? null }, DEFAULT_RULES);
    const created = createGameWithEvents({ seats: config.seats.map((s) => ({ job: s.job })) }, rules, seed);
    this.state = created.state;
    this.lastEvents = created.events;
    this.random = createPolicyRandom((seed ^ 0x2545f491) >>> 0);
    this.seats = this.state.seatOrigin.map((origin, seat) => {
      const cfg = config.seats[origin]!;
      if (cfg.kind === 'bot') this.policies.set(seat, createPolicyByName(cfg.botName ?? 'heuristic', this.random));
      return {
        seat,
        name: cfg.name,
        kind: cfg.kind,
        ...(cfg.botName ? { botName: cfg.botName } : {}),
        connected: true,
        controlledBy: cfg.kind === 'human' ? 'human' : 'bot',
      };
    });
  }

  private get humanSeats(): SeatId[] {
    return this.seats.filter((s) => s.kind === 'human').map((s) => s.seat);
  }

  private buildUpdate(snapshot: boolean): GameUpdate {
    const pending = this.state.pending;
    const controllable = this.humanSeats;
    const legal = pending && controllable.includes(pending.actor) ? getLegalActions(this.state) : [];
    return {
      version: this.version,
      publicState: toPublicState(this.state),
      events: snapshot ? [] : this.lastEvents,
      pending: pending ? { actor: pending.actor, phase: pending.phase, timeLeftMs: null } : null,
      controllableSeats: controllable,
      legalActions: legal,
      seats: this.seats,
      snapshot,
    };
  }

  private emit(snapshot = false): void {
    const u = this.buildUpdate(snapshot);
    for (const l of this.listeners) l(u);
  }

  subscribe(onUpdate: (u: GameUpdate) => void): () => void {
    this.listeners.add(onUpdate);
    onUpdate({ ...this.buildUpdate(false), events: this.version === 0 ? this.lastEvents : [] });
    this.scheduleBot();
    return () => this.listeners.delete(onUpdate);
  }

  async submit(action: Action, stateVersion: number): Promise<SubmitResult> {
    if (this.disposed) return { ok: false, code: 'INTERNAL', message: 'client disposed' };
    if (stateVersion !== this.version) return { ok: false, code: 'STALE_VERSION' };
    const pending = this.state.pending;
    if (!pending || !this.humanSeats.includes(pending.actor)) return { ok: false, code: 'NOT_YOUR_TURN' };
    if (!isLegalAction(this.state, action)) return { ok: false, code: 'ILLEGAL_ACTION' };
    this.apply(action);
    return { ok: true };
  }

  private apply(action: Action): void {
    const r = applyAction(this.state, action);
    this.state = r.state;
    this.lastEvents = r.events;
    this.version += 1;
    this.emit();
    this.scheduleBot();
  }

  private scheduleBot(): void {
    this.cancelBot?.();
    this.cancelBot = null;
    const pending = this.state.pending;
    if (this.disposed || !pending) return;
    const policy = this.policies.get(pending.actor);
    if (!policy) return;
    this.cancelBot = this.schedule(() => {
      this.cancelBot = null;
      const p = this.state.pending;
      if (!p || p.actor !== pending.actor) return;
      const action = policy.decide({
        view: toPublicState(this.state),
        seat: p.actor,
        legal: getLegalActions(this.state),
        random: this.random,
      });
      this.apply(action);
    }, this.config.botDelayMs ?? 500);
  }

  requestSnapshot(): void {
    this.emit(true);
  }

  dispose(): void {
    this.disposed = true;
    this.cancelBot?.();
    this.listeners.clear();
  }
}
