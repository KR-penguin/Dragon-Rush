import { DEFAULT_COMBAT_RULES, type CombatResult } from '@dragon-rush/combat';
import {
  applyAction,
  applyCombatResult,
  createGameWithEvents,
  DEFAULT_RULES,
  getLegalActions,
  InvalidCombatResultError,
  isLegalAction,
  resolveCombatWithDice,
  toPublicState,
  withRules,
  type Action,
  type GameEvent,
  type GameState,
  type ItemId,
  type JobId,
  type SeatId,
} from '@dragon-rush/engine';
import {
  bundledOutcomeModel,
  createPolicyByName,
  createPolicyRandom,
  type Policy,
} from '@dragon-rush/ai';
import { createFightBotSource } from './fight/botInput';
import { buildFightSetup, createSeedStream, fightSides, isBotOnlyFight } from './fight/fightSetup';
import { simulateFight } from './fight/simProvider';
import type {
  FightBotLevel,
  GameClient,
  GameUpdate,
  PendingFight,
  SeatInfo,
  SubmitResult,
} from './gameClient';

export interface LocalSeatConfig {
  name: string;
  job: JobId;
  kind: 'human' | 'bot';
  botName?: string;
}

/** 'realtime' plays fights on the combat screen; 'dice' settles them at once (빠른 전투). */
export type FightMode = 'realtime' | 'dice';

export interface LocalGameConfig {
  seats: LocalSeatConfig[];
  seed?: number;
  maxRounds?: number | null;
  botDelayMs?: number;
  /** Read whenever a fight starts, so the setting can change mid-game. Default 'realtime'. */
  fightMode?: () => FightMode;
  /** Combat bot strength, read whenever a fight starts. Default 'normal'. */
  fightBotLevel?: () => FightBotLevel;
  /** Enables `debugPatchPlayer` (dev builds only). */
  debug?: boolean;
}

/** Dev-only state edits for testing fights (not a game rule). */
export interface DebugPlayerPatch {
  coins?: number;
  hp?: number;
  maxHp?: number;
  atk?: number;
  def?: number;
  position?: number;
  items?: Partial<Record<ItemId, number>>;
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

type Step = { state: GameState; events: GameEvent[] };

/**
 * Runs the engine and bots in the browser: hot-seat and vs-bot play without a server.
 * When the engine stops at COMBAT, the fight is offered as `GameUpdate.fight` for the combat screen
 * and settled by `reportFight`. Bot-only fights are simulated first and their recorded inputs
 * are replayed by the combat screen before the board applies the result.
 */
export class LocalGameClient implements GameClient {
  readonly mode = 'local' as const;
  private state: GameState;
  private version = 0;
  private lastEvents: GameEvent[];
  private readonly seats: SeatInfo[];
  private readonly policies = new Map<SeatId, Policy>();
  private readonly random: () => number;
  private readonly fightSeed: () => number;
  private readonly listeners = new Set<(u: GameUpdate) => void>();
  private cancelBot: (() => void) | null = null;
  private disposed = false;
  private fight: PendingFight | null = null;
  private fightCount = 0;

  constructor(
    private readonly config: LocalGameConfig,
    private readonly schedule: Scheduler = defaultScheduler,
  ) {
    const seed = config.seed ?? randomSeed();
    const rules = withRules({ maxRounds: config.maxRounds ?? null }, DEFAULT_RULES);
    const created = createGameWithEvents(
      { seats: config.seats.map((s) => ({ job: s.job })) },
      rules,
      seed,
    );
    this.state = created.state;
    this.lastEvents = created.events;
    this.random = createPolicyRandom((seed ^ 0x2545f491) >>> 0);
    // Fight seeds follow the game seed (reproducible games) without touching the bots' stream.
    this.fightSeed = createSeedStream(createPolicyRandom((seed ^ 0x51ed270b) >>> 0));
    const outcomeModel =
      bundledOutcomeModel(rules.version, DEFAULT_COMBAT_RULES.version) ?? undefined;
    this.seats = this.state.seatOrigin.map((origin, seat) => {
      const cfg = config.seats[origin]!;
      if (cfg.kind === 'bot')
        this.policies.set(
          seat,
          createPolicyByName(cfg.botName ?? 'heuristic', this.random, outcomeModel),
        );
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
    const legal =
      pending && controllable.includes(pending.actor) ? getLegalActions(this.state) : [];
    return {
      version: this.version,
      publicState: toPublicState(this.state),
      events: snapshot ? [] : this.lastEvents,
      pending: pending ? { actor: pending.actor, phase: pending.phase, timeLeftMs: null } : null,
      controllableSeats: controllable,
      legalActions: legal,
      seats: this.seats,
      snapshot,
      fight: this.fight,
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
    if (!pending || !this.humanSeats.includes(pending.actor))
      return { ok: false, code: 'NOT_YOUR_TURN' };
    if (!isLegalAction(this.state, action)) return { ok: false, code: 'ILLEGAL_ACTION' };
    this.commit(applyAction(this.state, action));
    return { ok: true };
  }

  async reportFight(fightId: number, outcome: CombatResult | 'dice'): Promise<SubmitResult> {
    if (this.disposed) return { ok: false, code: 'INTERNAL', message: 'client disposed' };
    const fight = this.fight;
    if (!fight || fight.id !== fightId) return { ok: false, code: 'NO_FIGHT' };
    let step: Step;
    try {
      step =
        outcome === 'dice'
          ? resolveCombatWithDice(this.state)
          : applyCombatResult(this.state, outcome);
    } catch (e) {
      if (e instanceof InvalidCombatResultError)
        return { ok: false, code: 'INVALID_RESULT', message: e.message };
      throw e;
    }
    this.fight = null;
    this.commit(step);
    return { ok: true };
  }

  /** Dev builds only: edit a player to set up fights quickly (outside the rules on purpose). */
  debugPatchPlayer(seat: SeatId, patch: DebugPlayerPatch): void {
    if (!this.config.debug || this.disposed) return;
    const players = this.state.players.map((p) => {
      if (p.seat !== seat) return p;
      const { items, ...stats } = patch;
      const next = { ...p, ...stats, items: { ...p.items, ...items } };
      return { ...next, hp: Math.min(next.hp, next.maxHp) };
    });
    this.state = { ...this.state, players };
    this.lastEvents = [];
    this.version += 1;
    this.emit(true);
  }

  private commit(step: Step): void {
    const r = this.settleFights(step);
    this.state = r.state;
    this.lastEvents = r.events;
    this.version += 1;
    this.emit();
    this.scheduleBot();
  }

  /**
   * Handles every COMBAT stop of one update: dice mode settles it, and real-time mode waits for
   * `reportFight` after the combat screen has shown the fight.
   */
  private settleFights(step: Step): Step {
    let { state, events } = step;
    while (state.pending?.phase === 'COMBAT' && state.combat) {
      const mode = this.config.fightMode?.() ?? 'realtime';
      if (mode === 'dice') {
        const r = resolveCombatWithDice(state);
        state = r.state;
        events = [...events, ...r.events];
        continue;
      }
      const fight = this.openFight(state);
      this.fight = fight;
      break;
    }
    return { state, events };
  }

  private openFight(state: GameState): PendingFight {
    const request = { ...state.combat! };
    const humans = new Set(this.humanSeats);
    const sides = fightSides(request, (seat) => humans.has(seat));
    const setup = buildFightSetup(toPublicState(state), request);
    const seed = this.fightSeed();
    const botLevel = this.config.fightBotLevel?.() ?? 'normal';
    const replay = isBotOnlyFight(sides)
      ? simulateFight(setup, seed, [
          createFightBotSource(botLevel, seed, 'a'),
          setup.b ? createFightBotSource(botLevel, seed, 'b') : null,
        ])
      : null;
    this.fightCount += 1;
    return { id: this.fightCount, request, setup, seed, sides, botLevel, replay };
  }

  private scheduleBot(): void {
    this.cancelBot?.();
    this.cancelBot = null;
    const pending = this.state.pending;
    // A pending fight is not a board decision: the combat screen settles it.
    if (this.disposed || !pending || pending.phase === 'COMBAT') return;
    const policy = this.policies.get(pending.actor);
    if (!policy) return;
    this.cancelBot = this.schedule(() => {
      this.cancelBot = null;
      const p = this.state.pending;
      if (!p || p.actor !== pending.actor || p.phase === 'COMBAT') return;
      const action = policy.decide({
        view: toPublicState(this.state),
        seat: p.actor,
        legal: getLegalActions(this.state),
        random: this.random,
      });
      this.commit(applyAction(this.state, action));
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
