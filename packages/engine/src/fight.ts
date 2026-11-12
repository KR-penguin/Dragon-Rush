import { pickFirst, resolveCombat, type CombatOptions, type Fighter } from './combat';
import { emit, playerAt, roll, type Ctx } from './ctx';
import { PASSIVES } from './jobs';
import type {
  CombatRequest,
  CombatResult,
  CombatantRef,
  GameEvent,
  GameState,
  PlayerState,
  RulesConfig,
} from './types';

export class InvalidCombatResultError extends Error {
  override readonly name = 'InvalidCombatResultError';
}

/** Kind-specific continuation after a fight (elimination, loot, turn flow). Lives in duel.ts / dragon.ts. */
export type SettleCombat = (ctx: Ctx, request: CombatRequest, winner: 'a' | 'b') => void;

const OPTIONS: Readonly<Record<CombatRequest['kind'], CombatOptions>> = {
  duel: { kind: 'duel', defaultFirst: 'a', capTieWinner: 'a' },
  dragonFight: { kind: 'dragonFight', defaultFirst: 'a', capTieWinner: 'b', capLoser: 'a' },
};

const toFighter = (p: PlayerState, uses: number): Fighter => ({
  ref: p.seat,
  job: p.job,
  hp: p.hp,
  maxHp: p.maxHp,
  atk: p.atk,
  def: p.def,
  indomitableAvailable:
    PASSIVES[p.job].indomitable === true && uses > 0 && !p.passive.indomitableUsed,
});

const dragonFighter = (rules: RulesConfig): Fighter => ({
  ref: 'dragon',
  job: null,
  hp: rules.dragon.hp,
  maxHp: rules.dragon.hp,
  atk: rules.dragon.atk,
  def: rules.dragon.def,
  indomitableAvailable: false,
});

function fightersOf(s: GameState, request: CombatRequest): { a: Fighter; b: Fighter } {
  const uses = s.rules.passives.indomitableUses;
  return {
    a: toFighter(playerAt(s, request.a), uses),
    b: request.b === null ? dragonFighter(s.rules) : toFighter(playerAt(s, request.b), uses),
  };
}

const refOf = (request: CombatRequest, side: 'a' | 'b'): CombatantRef =>
  side === 'a' ? request.a : (request.b ?? 'dragon');

/** Mirrors the pre-external write-back: an indomitable job whose passive is unavailable after the fight is marked used. */
const indomitableSpent = (f: Fighter): boolean =>
  f.job !== null && PASSIVES[f.job].indomitable === true && !f.indomitableAvailable;

/**
 * Rolls the whole fight with the state rng. Returns the result plus the per-hit events only:
 * CombatStarted / CombatEnded are emitted by beginCombat / finishCombat so both modes share them.
 */
export function rollCombat(
  ctx: Ctx,
  request: CombatRequest,
): { result: CombatResult; events: GameEvent[] } {
  const { a, b } = fightersOf(ctx.s, request);
  const r = resolveCombat(ctx.s.rules, a, b, OPTIONS[request.kind], (sides) => roll(ctx, sides));
  const result: CombatResult = {
    winner: r.winner,
    hpA: r.a.hp,
    hpB: request.b === null ? null : r.b.hp,
    indomitableUsedA: indomitableSpent(r.a),
    indomitableUsedB: indomitableSpent(r.b),
    timedOut: r.capReached,
  };
  return {
    result,
    events: r.events.filter((e) => e.type !== 'CombatStarted' && e.type !== 'CombatEnded'),
  };
}

const writeBack = (p: PlayerState, hp: number, indomitableUsed: boolean | undefined): void => {
  p.hp = hp;
  if (indomitableUsed === true && PASSIVES[p.job].indomitable) p.passive.indomitableUsed = true;
};

/** Writes a result back, then continues the turn exactly like the dice path always did. */
export function finishCombat(
  ctx: Ctx,
  request: CombatRequest,
  result: CombatResult,
  settle: SettleCombat,
): void {
  ctx.s.combat = null;
  ctx.s.pending = null;
  const loserSide = result.winner === 'a' ? 'b' : 'a';
  emit(ctx, {
    type: 'CombatEnded',
    kind: request.kind,
    winner: refOf(request, result.winner),
    loser: refOf(request, loserSide),
    capReached: result.timedOut === true,
  });
  writeBack(playerAt(ctx.s, request.a), result.hpA, result.indomitableUsedA);
  if (request.b !== null && result.hpB !== null) {
    writeBack(playerAt(ctx.s, request.b), result.hpB, result.indomitableUsedB);
  }
  settle(ctx, request, result.winner);
}

export function settleWithDice(ctx: Ctx, request: CombatRequest, settle: SettleCombat): void {
  const { result, events } = rollCombat(ctx, request);
  ctx.ev.push(...events);
  finishCombat(ctx, request, result, settle);
}

/**
 * Starts a fight. Dice mode resolves it on the spot; external mode records the request and stops at
 * COMBAT (no board decisions) until applyCombatResult or resolveCombatWithDice settles it.
 */
export function beginCombat(ctx: Ctx, request: CombatRequest, settle: SettleCombat): void {
  const { a, b } = fightersOf(ctx.s, request);
  const first = pickFirst(a, b, OPTIONS[request.kind].defaultFirst) === 'a' ? a.ref : b.ref;
  ctx.s.pvp = null;
  ctx.s.pending = null;
  emit(ctx, { type: 'CombatStarted', kind: request.kind, a: a.ref, b: b.ref, first });
  if (ctx.s.rules.combat.mode === 'dice') {
    settleWithDice(ctx, request, settle);
    return;
  }
  ctx.s.combat = { ...request };
  ctx.s.pending = { actor: request.a, phase: 'COMBAT' };
}

export function pendingCombat(s: GameState): CombatRequest {
  if (s.combat === null || s.pending?.phase !== 'COMBAT')
    throw new InvalidCombatResultError('no combat is pending');
  return s.combat;
}

function checkHp(label: string, hp: number, maxHp: number, isWinner: boolean): void {
  if (!Number.isInteger(hp))
    throw new InvalidCombatResultError(`${label} must be an integer, got ${hp}`);
  if (hp > maxHp) throw new InvalidCombatResultError(`${label} ${hp} exceeds maxHp ${maxHp}`);
  if (isWinner && hp < 1)
    throw new InvalidCombatResultError(`winner ${label} must be at least 1, got ${hp}`);
}

/** Rejects results that cannot come from a legal fight against the pending request. */
export function validateCombatResult(s: GameState, result: CombatResult): CombatRequest {
  const request = pendingCombat(s);
  if (result.winner !== 'a' && result.winner !== 'b') {
    throw new InvalidCombatResultError(`winner must be 'a' or 'b', got ${String(result.winner)}`);
  }
  checkHp('hpA', result.hpA, playerAt(s, request.a).maxHp, result.winner === 'a');
  if (request.b === null) {
    if (result.hpB !== null)
      throw new InvalidCombatResultError('hpB must be null in a dragon fight');
  } else {
    if (result.hpB === null) throw new InvalidCombatResultError('hpB is required in a duel');
    checkHp('hpB', result.hpB, playerAt(s, request.b).maxHp, result.winner === 'b');
  }
  return request;
}
