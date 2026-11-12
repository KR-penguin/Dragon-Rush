import {
  createCombat,
  isqrt,
  NO_INPUT,
  policyRandom,
  stepCombat,
  type CombatEvent,
  type CombatPolicy,
  type CombatRules,
  type CombatState,
  type FighterInput,
  type Side,
} from '@dragon-rush/combat';
import {
  COBS_DIM,
  combatActionMask,
  createCombatBotByName,
  encodeCombatObservation,
  inactiveMask,
  isActionable,
  isMasked,
  mirrorAction,
  NO_ACTION,
  StateHistory,
  toFighterInput,
  type CombatAction,
  type CombatActionMask,
  type Mirror,
} from '@dragon-rush/combat-ai';
import type { JobId } from '@dragon-rush/engine';
import { deriveSeed } from '../runner';
import type { CombatEnvConfig } from './config';
import { CombatEnvError, sampleEpisode, type CombatMode, type StatSampler } from './sampler';

export interface CombatOutcomeInfo {
  /** 0 = slot 0 / fighter a, 1 = fighter b, 'dragon'. */
  readonly winner: 0 | 1 | 'dragon';
  readonly reason: 'ko' | 'timeout' | 'cap';
  readonly hp: [number, number | null];
  readonly last_stand_used: [boolean, boolean];
  readonly dragon_hp?: number;
}

export interface CombatEpisodeStart {
  readonly episode: number;
  readonly seed: number;
  readonly mode: CombatMode;
  readonly jobs: [JobId, JobId | null];
  readonly stats: unknown;
  readonly delay: [number, number];
  readonly mirror: Mirror;
  readonly opponent: string | null;
  readonly dragon_hp_scale?: number;
  readonly telegraph_scale?: number;
}

export interface CombatTransition {
  obs: Float32Array[];
  masks: CombatActionMask[];
  rewards: number[];
  actionable: boolean[];
  active: boolean[];
  ticks_elapsed: number;
  tick: number;
  mode: CombatMode;
  terminated: boolean;
  truncated: boolean;
  outcome: CombatOutcomeInfo | null;
  final_obs: Record<string, Float32Array>;
  episode_start?: CombatEpisodeStart;
  events?: CombatEvent[];
}

/** Process-wide decision counter for the shaping anneal (docs/combat-ai-spec.md §7). */
export interface DecisionCounter {
  value: number;
}

const SIDES: readonly Side[] = ['a', 'b'];
const ZERO_OBS = new Float32Array(COBS_DIM);

/** One combat environment: a fight, the reaction-delay history and the scripted opponent if any. */
export class CombatEnvInstance {
  readonly nCtrl: 1 | 2;
  private s!: CombatState;
  private history!: StateHistory;
  private delays: [number, number] = [0, 0];
  private mirror: Mirror = { x: false, y: false };
  private mode: CombatMode = 'pvp';
  private prev: CombatAction[] = [NO_ACTION, NO_ACTION];
  private inputs: FighterInput[] = [NO_INPUT, NO_INPUT];
  private actionable: boolean[] = [false, false];
  private opponent: CombatPolicy | null = null;
  private opponentRandom: () => number = () => 0;
  private episode = -1;
  private done = false;
  private cap = 0;

  constructor(
    private readonly index: number,
    private readonly baseSeed: number,
    private readonly config: CombatEnvConfig,
    private readonly rules: CombatRules,
    private readonly sampler: StatSampler,
    private readonly maxDelay: number,
    private readonly counter: DecisionCounter,
  ) {
    this.nCtrl = config.controlled === 'both' ? 2 : 1;
  }

  get isDone(): boolean {
    return this.done;
  }

  private isActive(slot: number): boolean {
    return slot === 0 || this.s.b !== null;
  }

  private fighter(slot: number) {
    return slot === 0 ? this.s.a : this.s.b;
  }

  reset(): CombatTransition {
    this.episode += 1;
    const seed = deriveSeed(this.baseSeed, this.index, this.episode);
    const spec = sampleEpisode(this.config, this.sampler, this.rules, policyRandom(seed, 11));
    try {
      this.s = createCombat(spec.setup, seed, spec.rules);
    } catch (e) {
      throw new CombatEnvError('BAD_CONFIG', (e as Error).message);
    }
    this.mode = spec.mode;
    this.delays = [...spec.delays];
    this.mirror = spec.mirror;
    this.history = new StateHistory(this.maxDelay + 1, this.s);
    this.prev = [NO_ACTION, NO_ACTION];
    this.inputs = [NO_INPUT, NO_INPUT];
    this.done = false;
    this.cap = 2 * this.s.timeLimit;
    const oppName = this.nCtrl === 1 && this.s.b ? this.config.opponent : null;
    this.opponentRandom = policyRandom(seed, 2);
    this.opponent = oppName
      ? createCombatBotByName(oppName, this.opponentRandom, this.config.action_repeat)
      : null;
    const t = this.observe();
    const start: CombatEpisodeStart = {
      episode: this.episode,
      seed,
      mode: spec.mode,
      jobs: [spec.setup.a.job, spec.setup.b ? spec.setup.b.job : null],
      stats: spec.setup.b ? [spec.setup.a, spec.setup.b] : [spec.setup.a, spec.setup.dragon],
      delay: [...spec.delays],
      mirror: spec.mirror,
      opponent: this.opponent ? this.opponent.id : null,
      ...(spec.dragonHpScale !== null ? { dragon_hp_scale: spec.dragonHpScale } : {}),
      ...(spec.telegraphScale !== null ? { telegraph_scale: spec.telegraphScale } : {}),
    };
    t.episode_start = start;
    return t;
  }

  private obsFor(slot: number): Float32Array {
    if (!this.isActive(slot)) return ZERO_OBS;
    const delay = this.delays[slot]!;
    const prev = this.prev[slot]!;
    return encodeCombatObservation(this.history.delayed(delay), SIDES[slot]!, {
      delay,
      prevMove: prev.move,
      prevButton: prev.button,
      mirror: this.mirror,
    });
  }

  /** Observation, masks and actionable flags at a decision point (or the terminal point). */
  private observe(): CombatTransition {
    const obs: Float32Array[] = [];
    const masks: CombatActionMask[] = [];
    const active: boolean[] = [];
    for (let slot = 0; slot < this.nCtrl; slot++) {
      const on = this.isActive(slot);
      active.push(on);
      obs.push(this.obsFor(slot));
      masks.push(on && !this.done ? combatActionMask(this.s, SIDES[slot]!) : inactiveMask());
      this.actionable[slot] =
        on && !this.done && isActionable(this.s, SIDES[slot]!, this.config.action_repeat);
    }
    return {
      obs,
      masks,
      rewards: Array(this.nCtrl).fill(0),
      actionable: this.actionable.slice(0, this.nCtrl),
      active,
      ticks_elapsed: 0,
      tick: this.s.tick,
      mode: this.mode,
      terminated: false,
      truncated: false,
      outcome: null,
      final_obs: {},
    };
  }

  /** Throws ILLEGAL_ACTION (no state change) when an action is outside its slot's mask. */
  validate(actions: readonly CombatAction[]): void {
    if (this.done)
      throw new CombatEnvError('EPISODE_OVER', `env ${this.index} episode is over; call reset`);
    if (actions.length !== this.nCtrl)
      throw new CombatEnvError('BAD_REQUEST', `env ${this.index} expects ${this.nCtrl} actions`);
    for (let slot = 0; slot < this.nCtrl; slot++) {
      const a = actions[slot]!;
      const mask = this.isActive(slot) ? combatActionMask(this.s, SIDES[slot]!) : inactiveMask();
      if (!isMasked(mask, a.move, a.button)) {
        throw new CombatEnvError(
          'ILLEGAL_ACTION',
          `slot ${slot} action [${a.move}, ${a.button}] is masked`,
        );
      }
    }
  }

  private hpOf(side: Side | 'dragon'): { hp: number; max: number } {
    if (side === 'dragon') {
      const d = this.s.dragon!;
      return { hp: Math.max(0, d.hp), max: d.maxHp };
    }
    const f = side === 'a' ? this.s.a : this.s.b!;
    return { hp: Math.max(0, f.hp), max: f.maxHp };
  }

  private opponentOf(slot: number): Side | 'dragon' {
    return this.s.dragon ? 'dragon' : slot === 0 ? 'b' : 'a';
  }

  private distance(slot: number): number {
    const me = this.fighter(slot)!;
    const o = this.s.dragon ?? (slot === 0 ? this.s.b : this.s.a)!;
    const dx = o.x - me.x;
    const dy = o.y - me.y;
    return isqrt(dx * dx + dy * dy) / 256;
  }

  step(actions: readonly CombatAction[]): CombatTransition {
    this.validate(actions);
    const cfg = this.config;
    for (let slot = 0; slot < this.nCtrl; slot++) {
      if (!this.isActive(slot) || !this.actionable[slot]) {
        // ignored decision: nothing is held, so skipping it in training is exact
        this.inputs[slot] = NO_INPUT;
        this.prev[slot] = NO_ACTION;
        continue;
      }
      const world = mirrorAction(actions[slot]!, this.mirror);
      this.inputs[slot] = toFighterInput(world, this.inputs[slot]).input;
      this.prev[slot] = world;
    }
    const before = Array.from({ length: this.nCtrl }, (_, slot) =>
      this.isActive(slot)
        ? {
            me: this.hpOf(SIDES[slot]!),
            opp: this.hpOf(this.opponentOf(slot)),
            dist: this.distance(slot),
          }
        : null,
    );
    const events: CombatEvent[] | undefined = cfg.return_events ? [] : undefined;
    let live = 0;
    while (!this.s.outcome && this.s.tick < this.cap) {
      if (live >= cfg.action_repeat && this.s.hitstop === 0) break;
      const isLive = this.s.hitstop === 0;
      const ia = this.inputs[0]!;
      const ib =
        this.nCtrl === 2
          ? this.inputs[1]!
          : this.opponent && this.s.b
            ? this.opponent.decide(this.s, 'b', this.opponentRandom)
            : NO_INPUT;
      const r = stepCombat(this.s, [ia, ib]);
      this.s = r.state;
      this.history.push(this.s);
      if (events) for (const e of r.events) events.push(e);
      if (isLive) live++;
    }
    const k = this.shapingK();
    let activeSlots = 0;
    const rewards: number[] = [];
    for (let slot = 0; slot < this.nCtrl; slot++) {
      const b = before[slot];
      if (!b) {
        rewards.push(0);
        continue;
      }
      activeSlots++;
      const me = this.hpOf(SIDES[slot]!);
      const opp = this.hpOf(this.opponentOf(slot));
      const dealt = (b.opp.hp - opp.hp) / Math.max(1, opp.max);
      const taken = (b.me.hp - me.hp) / Math.max(1, me.max);
      let r = Math.max(-1, Math.min(1, k * (dealt - taken)));
      if (cfg.reward.approach !== 0)
        r += (cfg.reward.approach * (b.dist - this.distance(slot))) / this.s.arenaW;
      rewards.push(r);
    }
    this.counter.value += activeSlots;
    const outcome = this.s.outcome;
    const capped = !outcome && this.s.tick >= this.cap;
    this.done = outcome !== null || capped;
    const t = this.observe();
    t.rewards = rewards;
    t.ticks_elapsed = live;
    if (events) t.events = events;
    if (!this.done) return t;
    t.terminated = outcome !== null;
    t.truncated = capped;
    for (let slot = 0; slot < this.nCtrl; slot++) {
      if (!this.isActive(slot)) continue;
      t.final_obs[String(slot)] = t.obs[slot]!;
      if (outcome) t.rewards[slot] = t.rewards[slot]! + (outcome.winner === SIDES[slot] ? 1 : -1);
    }
    t.outcome = this.outcomeInfo(capped);
    return t;
  }

  private shapingK(): number {
    const { k_start, k_end, anneal_decisions } = this.config.reward;
    if (anneal_decisions <= 0) return k_start;
    return k_start + (k_end - k_start) * Math.min(1, this.counter.value / anneal_decisions);
  }

  private outcomeInfo(capped: boolean): CombatOutcomeInfo {
    const s = this.s;
    const o = s.outcome;
    const hp: [number, number | null] = [Math.max(0, s.a.hp), s.b ? Math.max(0, s.b.hp) : null];
    const lastStand: [boolean, boolean] = [s.a.lastStandUsed, s.b ? s.b.lastStandUsed : false];
    const winner = o ? (o.winner === 'a' ? 0 : s.b ? 1 : 'dragon') : s.b ? 1 : 'dragon';
    return {
      winner,
      reason: capped ? 'cap' : o!.timedOut ? 'timeout' : 'ko',
      hp,
      last_stand_used: lastStand,
      ...(s.dragon ? { dragon_hp: Math.max(0, s.dragon.hp) } : {}),
    };
  }
}
