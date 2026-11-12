import {
  applyAction,
  createGame,
  DEFAULT_RULES,
  getLegalActions,
  toPublicState,
  validateRules,
  withRules,
  type Action,
  type GameEvent,
  type GameOutcome,
  type GameState,
  type JobId,
  type RulesConfig,
  type SeatId,
} from '@dragon-rush/engine';
import {
  createPolicyByName,
  createPolicyRandom,
  decodeAction,
  encodeObservation,
  legalIndices,
  type Policy,
} from '@dragon-rush/ai';
import type { OutcomeModel } from '@dragon-rush/ai';
import { createCombatResolver, type CombatResolver } from '../combatResolver';
import { deriveSeed, randomJobs } from '../runner';
import type { EnvConfig } from './config';

export class EnvError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface EpisodeStart {
  episode: number;
  seed: number;
  num_players: number;
  jobs: JobId[];
  agent_seat: SeatId | null;
}

export interface Transition {
  obs: Float32Array;
  legal: number[];
  acting_seat: SeatId | null;
  turn_seat: SeatId | null;
  phase: string | null;
  round: number;
  rewards: number[];
  terminated: boolean;
  truncated: boolean;
  outcome: GameOutcome | null;
  eliminated: SeatId[];
  final_obs: Record<string, Float32Array>;
  episode_start?: EpisodeStart;
  events?: GameEvent[];
}

const terminalObs = (state: GameState, seat: SeatId) =>
  encodeObservation({ ...toPublicState(state), pending: null }, seat);

export function buildRules(config: EnvConfig): RulesConfig {
  const base =
    config.rules === 'default' ? DEFAULT_RULES : withRules(config.rules as Partial<RulesConfig>);
  const rules = withRules({ maxRounds: config.max_rounds }, base);
  try {
    validateRules(rules);
  } catch (e) {
    throw new EnvError('BAD_CONFIG', (e as Error).message);
  }
  return rules;
}

/** One environment: a game plus the bots for seats the client does not control. */
export class EnvInstance {
  private state!: GameState;
  private controlled = new Set<SeatId>();
  private bots = new Map<SeatId, Policy>();
  private random: () => number = Math.random;
  private resolveCombat: CombatResolver = (r) => r;
  private episode = -1;
  private done = false;
  private agentSeat: SeatId | null = null;

  constructor(
    private readonly index: number,
    private readonly baseSeed: number,
    private readonly config: EnvConfig,
    private readonly rules: RulesConfig,
    private readonly outcomeModel?: OutcomeModel,
  ) {}

  get isDone(): boolean {
    return this.done;
  }

  legal(): number[] {
    if (this.done || !this.state.pending) return [];
    return legalIndices(
      toPublicState(this.state),
      this.state.pending.actor,
      getLegalActions(this.state),
    );
  }

  reset(): Transition {
    this.episode += 1;
    const seed = deriveSeed(this.baseSeed, this.index, this.episode);
    this.random = createPolicyRandom(deriveSeed(seed, 7, 7));
    const c = this.config;
    this.resolveCombat = createCombatResolver(c.combat_resolver, {
      seed: deriveSeed(seed, 9, 9),
      ...(this.outcomeModel ? { outcomeModel: this.outcomeModel } : {}),
      outcomeSkillNoise: c.outcome_skill_noise,
    });
    const n = Array.isArray(c.num_players)
      ? c.num_players[Math.floor(this.random() * c.num_players.length)]!
      : c.jobs !== 'random'
        ? c.jobs.length
        : c.num_players;
    const jobs = c.jobs === 'random' ? randomJobs(n, this.random) : (c.jobs as JobId[]);
    if (jobs.length !== n) throw new EnvError('BAD_CONFIG', 'jobs length must match num_players');
    try {
      this.state = createGame({ seats: jobs.map((job) => ({ job })) }, this.rules, seed);
    } catch (e) {
      throw new EnvError('BAD_CONFIG', (e as Error).message);
    }
    this.controlled.clear();
    this.bots.clear();
    this.agentSeat = null;
    if (c.mode === 'single') {
      const seat = c.agent_seat === 'random' ? Math.floor(this.random() * n) : c.agent_seat;
      if (seat >= n) throw new EnvError('BAD_CONFIG', `agent_seat ${seat} >= num_players ${n}`);
      this.agentSeat = seat;
      this.controlled.add(seat);
    } else {
      const seats =
        c.controlled_seats === 'all'
          ? [...Array(n).keys()]
          : c.controlled_seats.filter((s) => s < n);
      if (seats.length === 0) throw new EnvError('BAD_CONFIG', 'no controlled seats');
      for (const s of seats) this.controlled.add(s);
    }
    const names = Array.isArray(c.opponents) ? c.opponents : [c.opponents];
    for (let seat = 0; seat < n; seat++) {
      if (!this.controlled.has(seat))
        this.bots.set(
          seat,
          createPolicyByName(names[seat % names.length]!, this.random, this.outcomeModel),
        );
    }
    this.done = false;
    const t = this.advance([], Array(4).fill(0), []);
    t.episode_start = {
      episode: this.episode,
      seed,
      num_players: n,
      jobs: this.state.players.map((p) => p.job),
      agent_seat: this.agentSeat,
    };
    return t;
  }

  validate(index: number): void {
    if (this.done)
      throw new EnvError('EPISODE_OVER', `env ${this.index} episode is over; call reset`);
    if (!this.legal().includes(index)) {
      throw new EnvError(
        'ILLEGAL_ACTION',
        `action ${index} not legal in phase ${this.state.pending?.phase}`,
      );
    }
  }

  step(index: number): Transition {
    this.validate(index);
    const seat = this.state.pending!.actor;
    const action = decodeAction(toPublicState(this.state), seat, index);
    const rewards = Array(4).fill(0);
    const events: GameEvent[] = [];
    const eliminated: SeatId[] = [];
    this.apply(action, rewards, events, eliminated);
    return this.advance(events, rewards, eliminated, seat);
  }

  private apply(
    action: Action,
    rewards: number[],
    events: GameEvent[],
    eliminated: SeatId[],
  ): void {
    const before = this.state;
    const r = this.resolveCombat(applyAction(this.state, action));
    this.state = r.state;
    events.push(...r.events);
    for (const e of r.events) {
      if (e.type === 'PlayerEliminated') {
        eliminated.push(e.seat);
        rewards[e.seat] = (rewards[e.seat] ?? 0) - 1;
      }
    }
    this.shape(before, r.events, rewards);
  }

  private shape(before: GameState, events: GameEvent[], rewards: number[]): void {
    const w = this.config.reward_shaping;
    if (!w) return;
    for (const p of this.state.players) {
      const b = before.players[p.seat]!;
      const alive = p.alive ? 1 : 0;
      rewards[p.seat] = (rewards[p.seat] ?? 0) + w.coins * (p.coins - b.coins) * alive;
      rewards[p.seat] =
        (rewards[p.seat] ?? 0) +
        w.stats * (p.atk + p.def + p.maxHp / 6 - (b.atk + b.def + b.maxHp / 6)) * alive;
    }
    for (const e of events) {
      if (e.type === 'PlayerEliminated' && typeof e.by === 'number')
        rewards[e.by] = (rewards[e.by] ?? 0) + w.kill;
      if (e.type === 'CombatStarted' && e.kind === 'dragonFight' && typeof e.a === 'number')
        rewards[e.a] = (rewards[e.a] ?? 0) + w.dragon_try;
    }
  }

  /** Runs bots until a controlled seat must decide or the episode ends. */
  private advance(
    events: GameEvent[],
    rewards: number[],
    eliminated: SeatId[],
    lastActor?: SeatId,
  ): Transition {
    for (let guard = 0; guard < 100_000; guard++) {
      const pending = this.state.pending;
      if (!pending || this.controlled.has(pending.actor)) break;
      if (this.agentSeat !== null && !this.state.players[this.agentSeat]!.alive) break;
      const bot = this.bots.get(pending.actor)!;
      const view = toPublicState(this.state);
      const action = bot.decide({
        view,
        seat: pending.actor,
        legal: getLegalActions(this.state),
        random: this.random,
      });
      this.apply(action, rewards, events, eliminated);
    }
    const outcome = this.state.outcome;
    const finalObs: Record<string, Float32Array> = {};
    for (const seat of eliminated) {
      if (this.controlled.has(seat)) finalObs[String(seat)] = terminalObs(this.state, seat);
    }
    let terminated = false;
    let truncated = false;
    if (outcome) {
      truncated = outcome.kind === 'draw';
      terminated = !truncated;
      for (const p of this.state.players) {
        if (!p.alive) continue;
        if (outcome.kind !== 'draw')
          rewards[p.seat] = (rewards[p.seat] ?? 0) + (outcome.winner === p.seat ? 1 : -1);
        if (this.controlled.has(p.seat)) finalObs[String(p.seat)] = terminalObs(this.state, p.seat);
      }
    } else if (this.agentSeat !== null && !this.state.players[this.agentSeat]!.alive) {
      terminated = true;
    }
    this.done = terminated || truncated;
    const reportOutcome = outcome ?? null;
    const t: Transition = {
      obs: new Float32Array(0),
      legal: [],
      acting_seat: null,
      turn_seat: null,
      phase: null,
      round: this.state.round,
      rewards,
      terminated,
      truncated,
      outcome: reportOutcome,
      eliminated,
      final_obs: finalObs,
    };
    if (this.config.return_events) t.events = events;
    if (this.done) {
      const seat = this.agentSeat ?? lastActor ?? 0;
      t.obs = finalObs[String(seat)] ?? terminalObs(this.state, seat);
      return t;
    }
    const pending = this.state.pending!;
    t.obs = encodeObservation(toPublicState(this.state), pending.actor);
    t.legal = this.legal();
    t.acting_seat = pending.actor;
    t.turn_seat = this.state.current;
    t.phase = pending.phase;
    return t;
  }
}
