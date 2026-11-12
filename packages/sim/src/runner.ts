import {
  applyAction,
  createGameWithEvents,
  DEFAULT_RULES,
  getLegalActions,
  ITEM_IDS,
  JOB_IDS,
  resolveCombatWithDice,
  toPublicState,
  type GameEvent,
  type GameState,
  type ItemId,
  type JobId,
  type OutcomeKind,
  type RulesConfig,
  type SeatId,
} from '@dragon-rush/engine';
import { createPolicyByName, createPolicyRandom, type Policy } from '@dragon-rush/ai';
import { loadModelPolicy } from './modelLoader';

export interface GameRecord {
  seed: number;
  jobs: JobId[];
  policies: string[];
  outcome: OutcomeKind;
  winner: SeatId | null;
  rounds: number;
  eliminations: { seat: SeatId; round: number; by: 'dragon' | 'pvp' }[];
  pvpFights: number;
  shieldCancels: number;
  dragonAttempts: number;
  dragonWins: number;
  purchases: Record<ItemId, number>;
  turns: number[];
  netCoins: number[];
}

export interface PlayGameOptions {
  jobs: JobId[];
  seed: number;
  policies: Policy[];
  rules?: RulesConfig;
  random?: () => number;
}

/**
 * TEMPORARY resolver until real-time combat (@dragon-rush/combat) lands: settles a pending COMBAT
 * with the dice rules right away, so sims and the env behave exactly like the old 'dice' mode.
 */
export function autoResolveCombat(r: { state: GameState; events: GameEvent[] }): { state: GameState; events: GameEvent[] } {
  let { state, events } = r;
  while (state.pending?.phase === 'COMBAT') {
    const settled = resolveCombatWithDice(state);
    state = settled.state;
    events = [...events, ...settled.events];
  }
  return { state, events };
}

export function playGame(opts: PlayGameOptions): GameRecord {
  const rules = opts.rules ?? DEFAULT_RULES;
  const random = opts.random ?? createPolicyRandom(opts.seed ^ 0x5bd1e995);
  const created = createGameWithEvents({ seats: opts.jobs.map((job) => ({ job })) }, rules, opts.seed);
  let state = created.state;
  const events: GameEvent[] = [...created.events];
  const seatPolicies = state.seatOrigin.map((origin) => opts.policies[origin]!);
  for (let i = 0; i < 100_000 && state.pending; i++) {
    const seat = state.pending.actor;
    const legal = getLegalActions(state);
    const action = seatPolicies[seat]!.decide({ view: toPublicState(state), seat, legal, random });
    const r = autoResolveCombat(applyAction(state, action));
    state = r.state;
    for (const e of r.events) events.push(e);
  }
  const n = state.players.length;
  const record: GameRecord = {
    seed: opts.seed,
    jobs: state.players.map((p) => p.job),
    policies: seatPolicies.map((p) => p.id),
    outcome: state.outcome?.kind ?? 'draw',
    winner: state.outcome?.winner ?? null,
    rounds: state.round,
    eliminations: [],
    pvpFights: 0,
    shieldCancels: 0,
    dragonAttempts: 0,
    dragonWins: 0,
    purchases: { teleport: 0, shield: 0, thief: 0 },
    turns: Array.from({ length: n }, () => 0),
    netCoins: Array.from({ length: n }, () => 0),
  };
  for (const e of events) {
    switch (e.type) {
      case 'TurnStarted':
        record.turns[e.seat]! += 1;
        break;
      case 'CombatStarted':
        if (e.kind === 'duel') record.pvpFights++;
        else record.dragonAttempts++;
        break;
      case 'ShieldUsed':
        record.shieldCancels++;
        break;
      case 'GameEnded':
        if (e.outcome.kind === 'dragon') record.dragonWins++;
        break;
      case 'PlayerEliminated':
        record.eliminations.push({ seat: e.seat, round: e.round, by: e.by === 'dragon' ? 'dragon' : 'pvp' });
        break;
      case 'ItemBought':
        record.purchases[e.item]++;
        break;
      case 'StartBonus':
        record.netCoins[e.seat]! += e.coins;
        break;
      case 'EffectApplied':
        if (e.effect === 'coins') record.netCoins[e.seat]! += e.delta;
        break;
    }
  }
  return record;
}

/** Mixes three integers into a deterministic 53-bit seed (splitmix64-style). */
export function deriveSeed(base: number, a: number, b: number): number {
  let x = BigInt.asUintN(64, BigInt(base) * 0x9e3779b97f4a7c15n + BigInt(a) * 0xbf58476d1ce4e5b9n + BigInt(b) * 0x94d049bb133111ebn);
  x = BigInt.asUintN(64, (x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n);
  x = BigInt.asUintN(64, (x ^ (x >> 27n)) * 0x94d049bb133111ebn);
  x ^= x >> 31n;
  return Number(x >> 11n);
}

export function randomJobs(n: number, random: () => number): JobId[] {
  const pool = [...JOB_IDS];
  const out: JobId[] = [];
  for (let i = 0; i < n; i++) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!);
  return out;
}

export interface BatchOptions {
  games: number;
  players: number;
  bots: string;
  baseSeed: number;
  startIndex?: number;
  rules?: RulesConfig;
}

export function runBatch(opts: BatchOptions): GameRecord[] {
  const out: GameRecord[] = [];
  const start = opts.startIndex ?? 0;
  for (let g = start; g < start + opts.games; g++) {
    const seed = deriveSeed(opts.baseSeed, g, 0);
    const random = createPolicyRandom(deriveSeed(opts.baseSeed, g, 1));
    const jobs = randomJobs(opts.players, random);
    const names = opts.bots.split(',');
    const policies = jobs.map((_, i) => {
      const name = names[i % names.length]!;
      return name.startsWith('model:') ? loadModelPolicy(name.slice('model:'.length)) : createPolicyByName(name, random);
    });
    out.push(playGame({ jobs, seed, policies, random, ...(opts.rules ? { rules: opts.rules } : {}) }));
  }
  return out;
}

export { ITEM_IDS };
