import {
  actionKey,
  BOARD_SIZE,
  forwardDistance,
  ITEM_IDS,
  UPGRADE_STATS,
  upgradeCost,
  type Action,
  type EffectSpec,
  type PlayerState,
  type PublicGameState,
  type SeatId,
  type UpgradeStat,
} from '@dragon-rush/engine';
import type { DecisionContext, Policy } from '../../policy';
import { dragonProfile, profileOf, race, winProbability, type Profile } from './estimate';

export type HeuristicStyle = 'aggro' | 'growth' | 'rush';
export const HEURISTIC_STYLES: readonly HeuristicStyle[] = ['aggro', 'growth', 'rush'];

interface StyleParams {
  wd: number;
  wp: number;
  dragonThreshold: number;
  hunt: number;
  wantTeleport: number;
  wantShield: number;
  thiefMin: number;
  innFrac: number;
  tpEcon: number;
  tpBuySpare: number;
}

/** Style table from docs/ai-interface-spec.md §10. */
export const STYLE_PARAMS: Readonly<Record<HeuristicStyle, StyleParams>> = {
  aggro: { wd: 0.35, wp: 0.65, dragonThreshold: 0.55, hunt: 0.7, wantTeleport: 1, wantShield: 1, thiefMin: 6, innFrac: 0.35, tpEcon: 5, tpBuySpare: 0 },
  growth: { wd: 0.6, wp: 0.4, dragonThreshold: 0.6, hunt: 0.8, wantTeleport: 1, wantShield: 1, thiefMin: 7, innFrac: 0.45, tpEcon: 6, tpBuySpare: 4 },
  rush: { wd: 1, wp: 0, dragonThreshold: 0.48, hunt: 0.85, wantTeleport: 0, wantShield: 1, thiefMin: 7, innFrac: 0.5, tpEcon: 6, tpBuySpare: 99 },
};

const PVP_SAMPLES = 192;
const DRAGON_SAMPLES = 320;
const DEATH_PENALTY = 60;
const KILL_BONUS = 12;
const NINJA_MIN_GAIN = 2;
// Stall breaker: lower the dragon threshold once a game runs past ~1.7x the average length (rush-1: ~10 rounds).
const LATE_GAME_ROUND = 18;
const LATE_GAME_DECAY = 0.02;

class Planner {
  private readonly rules;
  private readonly me: PlayerState;
  private readonly s: StyleParams;

  constructor(
    private readonly view: PublicGameState,
    private readonly seat: SeatId,
    style: HeuristicStyle,
  ) {
    this.rules = view.rules;
    this.me = view.players[seat]!;
    this.s = STYLE_PARAMS[style];
  }

  private opponents(of: PlayerState = this.me): PlayerState[] {
    return this.view.players.filter((p) => p.alive && p.seat !== of.seat);
  }

  private duelWp(att: PlayerState, def: PlayerState): number {
    return winProbability(this.rules, profileOf(att, this.rules), profileOf(def, this.rules), PVP_SAMPLES);
  }

  private upgraded(p: Profile, stat: UpgradeStat): Profile {
    const amount = this.rules.upgrades[stat].amount;
    if (stat === 'atk') return { ...p, atk: p.atk + amount };
    if (stat === 'def') return { ...p, def: p.def + amount };
    return { ...p, hp: p.hp + amount, maxHp: p.maxHp + amount };
  }

  private power(p: Profile, opps: Profile[]): number {
    let v = this.s.wd * race(this.rules, p, dragonProfile(this.rules));
    if (this.s.wp && opps.length) v += (this.s.wp * opps.reduce((sum, q) => sum + race(this.rules, p, q), 0)) / opps.length;
    return v;
  }

  private pickUpgrade(p: Profile, levels: Record<UpgradeStat, number>, budget: number, dragonOnly: boolean): UpgradeStat | null {
    const opps = this.opponents().map((q) => profileOf(q, this.rules));
    const value = (x: Profile) => (dragonOnly ? race(this.rules, x, dragonProfile(this.rules)) : this.power(x, opps));
    const base = value(p);
    let best: UpgradeStat | null = null;
    let bestGain = 0;
    for (const stat of UPGRADE_STATS) {
      const cost = upgradeCost(this.rules, { upgradeLevels: levels }, stat);
      if (cost > budget) continue;
      const gain = (value(this.upgraded(p, stat)) - base) / cost;
      if (gain > bestGain) {
        best = stat;
        bestGain = gain;
      }
    }
    return best;
  }

  dragonPlan(of: PlayerState = this.me): { wp: number; ups: UpgradeStat[] } {
    let p = profileOf(of, this.rules);
    const levels = { ...of.upgradeLevels };
    let coins = of.coins;
    const ups: UpgradeStat[] = [];
    for (;;) {
      const stat = this.pickUpgrade(p, levels, coins, true);
      if (!stat) break;
      coins -= upgradeCost(this.rules, { upgradeLevels: levels }, stat);
      levels[stat] += 1;
      p = this.upgraded(p, stat);
      ups.push(stat);
    }
    if (race(this.rules, p, dragonProfile(this.rules)) < -0.9) return { wp: 0, ups };
    return { wp: winProbability(this.rules, p, dragonProfile(this.rules), DRAGON_SAMPLES), ups };
  }

  private dragonThreshold(): number {
    let thr = this.s.dragonThreshold;
    if (this.view.round > LATE_GAME_ROUND) thr -= LATE_GAME_DECAY * (this.view.round - LATE_GAME_ROUND);
    const opps = this.opponents();
    if (opps.length === 1 && this.dragonPlan(opps[0]).wp >= 0.5) thr -= 0.12;
    return Math.max(thr, 0.35);
  }

  private reserve(): number {
    let r = 0;
    if (this.s.wantShield && this.me.items.shield === 0) r += this.rules.items.shield.price;
    if (this.s.wantTeleport && this.me.items.teleport === 0 && this.s.tpBuySpare === 0) r += this.rules.items.teleport.price;
    return r;
  }

  upgradeToBuy(): UpgradeStat | null {
    const budget = this.me.coins - this.reserve();
    if (budget <= 0) return null;
    return this.pickUpgrade(profileOf(this.me, this.rules), this.me.upgradeLevels, budget, false);
  }

  dragonMove(): Action | null {
    const plan = this.dragonPlan();
    if (plan.wp < this.dragonThreshold()) return null;
    const next = plan.ups[0];
    return next ? { type: 'UPGRADE', stat: next } : { type: 'CHALLENGE_DRAGON' };
  }

  trainingChoice(): UpgradeStat {
    const opps = this.opponents().map((q) => profileOf(q, this.rules));
    const p = profileOf(this.me, this.rules);
    const base = this.power(p, opps);
    let best: UpgradeStat = 'atk';
    let bestV = -Infinity;
    for (const stat of UPGRADE_STATS) {
      const v = this.power(this.upgraded(p, stat), opps) - base;
      if (v > bestV) {
        best = stat;
        bestV = v;
      }
    }
    return best;
  }

  private threatened(): boolean {
    return this.opponents().some((q) => this.duelWp(q, this.me) >= 0.5);
  }

  private richest(): PlayerState | null {
    const opps = this.opponents();
    return opps.length ? opps.reduce((a, b) => (b.coins > a.coins ? b : a)) : null;
  }

  thiefTarget(): SeatId | null {
    if (this.me.items.thief < 1) return null;
    const q = this.richest();
    if (!q) return null;
    const amount = this.rules.thiefStealAmount;
    return q.coins >= amount || q.coins >= Math.min(amount, this.s.thiefMin) ? q.seat : null;
  }

  private itemValue(q: PlayerState): number {
    return ITEM_IDS.reduce((sum, id) => sum + q.items[id] * this.rules.items[id].price, 0);
  }

  private hpValue(delta: number): number {
    const p = this.me;
    const w = p.hp < p.maxHp * 0.5 ? 1 : 0;
    if (delta > 0) return Math.min(delta, p.maxHp - p.hp) * (w ? 0.45 : 0.2);
    if (delta < 0) return -Math.min(-delta, p.hp - 1) * (w ? 0.35 : 0.2);
    return 0;
  }

  private effectsValue(effects: readonly EffectSpec[], depth: number): number {
    const p = this.me;
    let v = 0;
    for (const e of effects) {
      switch (e.kind) {
        case 'coins':
          v += e.amount > 0 ? e.amount : -Math.min(p.coins, -e.amount);
          break;
        case 'hp':
          v += this.hpValue(e.amount);
          break;
        case 'maxHp':
          v += 3 + p.upgradeLevels.maxHp;
          break;
        case 'stat':
          v += 3 + p.upgradeLevels[e.stat];
          break;
        case 'randomItem':
          v += 5;
          break;
        case 'skipTurn':
          v -= 4;
          break;
        case 'training':
          v += 2 + Math.min(...UPGRADE_STATS.map((s) => p.upgradeLevels[s]));
          break;
        case 'shop': {
          const minPrice = Math.min(...ITEM_IDS.map((id) => this.rules.items[id].price));
          if (p.coins >= minPrice && (this.reserve() > 0 || p.items.thief === 0)) v += 3;
          break;
        }
        case 'mystery':
          if (depth === 0) {
            const deck = this.rules.mysteryDeck;
            v += deck.reduce((sum, card) => sum + this.effectsValue(card.effects, 1), 0) / deck.length;
          }
          break;
      }
    }
    return v;
  }

  tileValue(tile: number, crossed: boolean): number {
    const p = this.me;
    let v = 0;
    if (crossed) v += this.rules.startBonus.coins + this.hpValue(this.rules.startBonus.hp);
    const def = this.rules.board[tile]!;
    if (!def.safe && this.view.round > this.rules.pvpGraceRounds) {
      const occ = this.opponents().filter((q) => q.position === tile);
      if (occ.length) {
        const q = occ.reduce((a, b) => (this.duelWp(p, b) > this.duelWp(p, a) ? b : a));
        const wp = this.duelWp(p, q);
        if (q.items.shield > 0 && wp > 0.5) {
          // they will shield
        } else if (p.items.shield > 0 && wp < 0.5) v -= this.rules.items.shield.price;
        else v += wp * (q.coins / 2 + this.itemValue(q) + KILL_BONUS) - (1 - wp) * (DEATH_PENALTY + p.coins);
      }
    }
    return v + this.effectsValue(def.effects, 0);
  }

  ninjaDelta(legal: readonly Action[]): -1 | 0 | 1 {
    const d = this.view.turn.dice ?? 1;
    const pos = this.me.position;
    const valueOf = (steps: number) => this.tileValue((pos + steps) % BOARD_SIZE, pos + steps >= BOARD_SIZE);
    const base = valueOf(d);
    let best: -1 | 0 | 1 = 0;
    let bestV = base;
    for (const a of legal) {
      if (a.type !== 'ADJUST_MOVE' || a.delta === 0) continue;
      const v = valueOf(d + a.delta);
      if (v > bestV) {
        best = a.delta;
        bestV = v;
      }
    }
    if (bestV - base < NINJA_MIN_GAIN && base > -20) return 0;
    return best;
  }

  pvpTarget(candidates: SeatId[]): SeatId {
    const score = (seat: SeatId) => {
      const q = this.view.players[seat]!;
      const wp = this.duelWp(this.me, q);
      return [wp - (q.items.shield > 0 && wp > 0.5 ? 1 : 0), q.coins] as const;
    };
    return candidates.reduce((a, b) => {
      const [sa, ca] = score(a);
      const [sb, cb] = score(b);
      return sb > sa || (sb === sa && cb > ca) ? b : a;
    });
  }

  useShield(): boolean {
    const pvp = this.view.pvp;
    if (!pvp || pvp.target === null) return false;
    const amArriver = pvp.arriver === this.seat;
    const other = this.view.players[amArriver ? pvp.target : pvp.arriver]!;
    const wp = amArriver ? this.duelWp(this.me, other) : 1 - this.duelWp(other, this.me);
    return wp < 0.5;
  }

  teleportTarget(preRoll: boolean): number | null {
    const p = this.me;
    const safe = (t: number) => this.rules.board[t]!.safe;
    if (this.view.round > this.rules.pvpGraceRounds) {
      let best: number | null = null;
      let bestV = 0;
      for (const q of this.opponents()) {
        if (safe(q.position) || q.position === p.position) continue;
        if (this.opponents().filter((x) => x.position === q.position).length > 1) continue;
        const wp = this.duelWp(p, q);
        if (q.items.shield > 0 && wp > 0.5) continue;
        if (wp >= this.s.hunt) {
          const v = wp * (q.coins / 2 + this.itemValue(q) + KILL_BONUS);
          if (v > bestV) {
            best = q.position;
            bestV = v;
          }
        }
      }
      if (best !== null) return best;
    }
    if (p.hp <= p.maxHp * this.s.innFrac && p.maxHp - p.hp >= 12) {
      for (let t = 0; t < BOARD_SIZE; t++) {
        const heal = this.rules.board[t]!.effects.some((e) => e.kind === 'hp' && e.amount >= 15);
        if (heal && t !== p.position && this.tileValue(t, false) > 0) return t;
      }
    }
    if (!preRoll) return null;
    const prices = this.rules.items;
    const shops = [...this.rules.board.keys()].filter((t) => this.rules.board[t]!.effects.some((e) => e.kind === 'shop'));
    if (p.coins >= prices.shield.price + prices.thief.price + 2 && shops.length) {
      const dist = Math.min(...shops.map((t) => forwardDistance(p.position, t)));
      if (dist > 6 || dist === 0) {
        const cands = shops.filter((t) => t !== p.position);
        if (cands.length) {
          const sh = cands.reduce((a, b) => (this.tileValue(b, false) > this.tileValue(a, false) ? b : a));
          const rich = this.richest();
          if (this.tileValue(sh, false) > 0 && (p.items.shield === 0 || (p.items.thief === 0 && (rich?.coins ?? 0) >= 7))) return sh;
        }
      }
    }
    let rollEv = 0;
    for (let d = 1; d <= 6; d++) rollEv += this.tileValue((p.position + d) % BOARD_SIZE, p.position + d >= BOARD_SIZE);
    rollEv /= 6;
    let bt: number | null = null;
    let bv = -Infinity;
    for (let t = 0; t < BOARD_SIZE; t++) {
      if (t === p.position) continue;
      const v = this.tileValue(t, false);
      if (v > bv) {
        bt = t;
        bv = v;
      }
    }
    const margin = this.s.tpEcon - (p.items.teleport >= 2 ? 2 : 0);
    return bt !== null && bv - rollEv >= margin ? bt : null;
  }

  purchase(): Action | null {
    const p = this.me;
    const price = (id: 'teleport' | 'shield' | 'thief') => this.rules.items[id].price;
    const rich = this.richest();
    if (p.items.shield < this.s.wantShield && p.coins >= price('shield') && this.threatened()) return { type: 'BUY_ITEM', item: 'shield' };
    if (p.items.thief === 0 && rich && rich.coins >= this.s.thiefMin && p.coins >= price('thief')) return { type: 'BUY_ITEM', item: 'thief' };
    if (p.items.teleport < this.s.wantTeleport && p.coins >= price('teleport') + this.s.tpBuySpare) return { type: 'BUY_ITEM', item: 'teleport' };
    if (p.items.teleport === 0 && p.coins >= price('teleport') && p.hp <= p.maxHp * 0.4 && p.maxHp - p.hp >= 15) return { type: 'BUY_ITEM', item: 'teleport' };
    return null;
  }
}

function choose(ctx: DecisionContext, style: HeuristicStyle): Action | null {
  const { view, seat, legal } = ctx;
  const plan = new Planner(view, seat, style);
  const phase = view.pending?.phase;
  switch (phase) {
    case 'MOVE_ADJUST':
      return { type: 'ADJUST_MOVE', delta: plan.ninjaDelta(legal) };
    case 'CHOOSE_PVP_TARGET':
      return { type: 'CHOOSE_PVP_TARGET', target: plan.pvpTarget(view.pvp?.candidates ?? []) };
    case 'SHIELD_DECISION':
      return { type: 'SHIELD_DECISION', use: plan.useShield() };
    case 'TRAINING_CHOICE':
      return { type: 'CHOOSE_TRAINING_STAT', stat: plan.trainingChoice() };
    case 'PRE_ROLL': {
      const thief = plan.thiefTarget();
      if (thief !== null) return { type: 'USE_THIEF', target: thief };
      const dragon = plan.dragonMove();
      if (dragon) return dragon;
      const up = plan.upgradeToBuy();
      if (up) return { type: 'UPGRADE', stat: up };
      if (view.turn.resting) return { type: 'END_TURN' };
      if (view.players[seat]!.items.teleport > 0) {
        const t = plan.teleportTarget(true);
        if (t !== null) return { type: 'USE_TELEPORT', tile: t };
      }
      return { type: 'ROLL_DICE' };
    }
    case 'POST_MOVE': {
      if (view.turn.canBuy) {
        const buy = plan.purchase();
        if (buy) return buy;
      }
      const thief = plan.thiefTarget();
      if (thief !== null) return { type: 'USE_THIEF', target: thief };
      if (view.players[seat]!.items.teleport > 0 && view.turn.teleportsUsed === 0) {
        const t = plan.teleportTarget(false);
        if (t !== null) return { type: 'USE_TELEPORT', tile: t };
      }
      const up = plan.upgradeToBuy();
      if (up) return { type: 'UPGRADE', stat: up };
      return { type: 'END_TURN' };
    }
    default:
      return null;
  }
}

export function createHeuristicBot(style: HeuristicStyle = 'growth'): Policy {
  return {
    id: `heuristic:${style}`,
    decide(ctx: DecisionContext): Action {
      const wanted = choose(ctx, style);
      if (wanted) {
        const key = actionKey(wanted);
        const legal = ctx.legal.find((a) => actionKey(a) === key);
        if (legal) return legal;
      }
      return ctx.legal[0]!;
    },
  };
}
