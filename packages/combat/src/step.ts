import { createRng, JOB_IDS } from '@dragon-rush/engine';
import { COMBAT_PASSIVES, isRaging } from './damage';
import { createDragonState, dragonHits, updateDragon } from './dragon';
import { clearHazards, ringRadiusAt, ringTick, updateProjectiles, updateZones } from './hazards';
import { meleeHits } from './hitPhase';
import { Q } from './math';
import { readInput, updateFighter } from './moves';
import { physics } from './physics';
import { combatResult } from './result';
import { DEFAULT_COMBAT_RULES, type CombatRules } from './rules';
import type {
  CombatEvent,
  CombatSetup,
  CombatState,
  FighterInput,
  FighterSetup,
  FighterState,
  Side,
} from './types';
import { cloneWorking, emit, pos, type Ctx, type MFighter, type WState } from './work';

const EAST = 0;
const WEST = 128;
const NORTH = 192;

function checkFighter(f: FighterSetup, label: string): void {
  if (!(JOB_IDS as readonly string[]).includes(f.job))
    throw new RangeError(`${label}.job is not a job id`);
  for (const k of ['hp', 'maxHp', 'atk', 'def'] as const) {
    if (!Number.isSafeInteger(f[k]) || f[k] < 0)
      throw new RangeError(`${label}.${k} must be a non-negative integer`);
  }
  if (f.hp < 1 || f.hp > f.maxHp) throw new RangeError(`${label}.hp must be within 1..maxHp`);
}

export function validateCombatSetup(setup: CombatSetup): void {
  checkFighter(setup.a, 'a');
  if (setup.kind === 'duel') {
    if (!setup.b) throw new RangeError('a duel needs fighter b');
    checkFighter(setup.b, 'b');
  } else {
    if (setup.b) throw new RangeError('a dragon fight has no fighter b');
    const d = setup.dragon;
    if (
      !d ||
      !Number.isSafeInteger(d.hp) ||
      d.hp < 1 ||
      !Number.isSafeInteger(d.atk) ||
      !Number.isSafeInteger(d.def)
    ) {
      throw new RangeError('a dragon fight needs integer dragon stats (hp >= 1)');
    }
  }
}

function createFighter(
  r: CombatRules,
  side: Side,
  f: FighterSetup,
  xPx: number,
  yPx: number,
  facing: number,
): FighterState {
  const kit = r.jobs[f.job];
  const passive = COMBAT_PASSIVES[f.job];
  return {
    side,
    job: f.job,
    x: xPx * Q,
    y: yPx * Q,
    vx: 0,
    vy: 0,
    kbx: 0,
    kby: 0,
    kbLeft: 0,
    kbTotal: 0,
    facing,
    aim: facing,
    hp: f.hp,
    hpQ8: f.hp * 256,
    maxHp: f.maxHp,
    atk: f.atk,
    def: f.def,
    mode: 'idle',
    move: null,
    moveTick: 0,
    phase: 'none',
    moveHits: 0,
    hitstun: 0,
    wallSlammed: false,
    iframes: 0,
    iframeDelay: 0,
    invisible: false,
    superArmor: false,
    skillCharges: kit.skillCharges,
    skillTimer: 0,
    dashCharges: r.dashes[kit.dash].charges,
    dashTimer: 0,
    dashStale: 0,
    sinceDash: r.dashStale.window,
    bufAttack: 0,
    bufSkill: 0,
    bufDash: 0,
    held: 0,
    moveInput: 0,
    drawTicks: 0,
    drawReleased: false,
    nocked: passive.firstStrike === true,
    lastStandAvailable: passive.lastStand === true && f.indomitableAvailable,
    lastStandUsed: false,
    firstStrikePending: passive.firstStrike === true,
    evadeCounter: 0,
    raging: isRaging(f),
    ringTimer: 0,
  };
}

/**
 * Builds tick 0 ("싸워라!"). Duel: the arriver (a) spawns left facing east, the defender right facing west,
 * `duelGap` px apart. Dragon fight: the dragon is anchored top-centre and the challenger spawns below it.
 */
export function createCombat(
  setup: CombatSetup,
  seed: number,
  rules: CombatRules = DEFAULT_COMBAT_RULES,
): CombatState {
  validateCombatSetup(setup);
  const duel = setup.kind === 'duel';
  const arena = duel ? rules.arena.duel : rules.arena.dragonFight;
  const cx = arena.w / 2;
  const a = duel
    ? createFighter(rules, 'a', setup.a, cx - rules.duelGap / 2, arena.h / 2, EAST)
    : createFighter(
        rules,
        'a',
        setup.a,
        cx,
        rules.dragon.anchorY + rules.dragon.playerDistance,
        NORTH,
      );
  const b =
    duel && setup.b
      ? createFighter(rules, 'b', setup.b, cx + rules.duelGap / 2, arena.h / 2, WEST)
      : null;
  const dragon =
    !duel && setup.dragon
      ? createDragonState(setup.dragon, arena.w, rules.dragon.anchorY, rules.dragon.firstIdle)
      : null;
  return {
    kind: setup.kind,
    rules,
    tick: 0,
    timeLimit: duel ? rules.timeLimit.duel : rules.timeLimit.dragonFight,
    arenaW: arena.w,
    arenaH: arena.h,
    rng: createRng(seed),
    a,
    b,
    dragon,
    projectiles: [],
    zones: [],
    hitstop: 0,
    ringRadius: duel ? rules.ring.startRadius : 0,
    outcome: null,
  };
}

function knockOut(c: Ctx, f: MFighter): void {
  f.mode = 'ko';
  f.move = null;
  f.phase = 'none';
  f.superArmor = false;
  f.kbLeft = 0;
  f.vx = 0;
  f.vy = 0;
  emit(c, f.side, { type: 'KO', who: f.side, pos: pos(f.x, f.y) });
}

function finish(c: Ctx, winner: Side, timedOut: boolean): void {
  c.s.outcome = { winner, timedOut, tick: c.s.tick };
  const result = combatResult(c.s);
  if (result) emit(c, 'fight', { type: 'FightEnded', result });
}

/**
 * KO ends the fight on the KO tick (no sim freeze). A double KO goes to the arriver/challenger with 1 HP.
 * Timeout: duel -> higher hp/maxHp (exact cross-multiplication, tie -> a); dragon -> the challenger loses.
 */
function resolveOutcome(c: Ctx): void {
  const s = c.s;
  if (s.outcome) return;
  const a = s.a;
  if (s.kind === 'duel' && s.b) {
    const b = s.b;
    const aDead = a.hp <= 0;
    const bDead = b.hp <= 0;
    if (aDead || bDead) {
      if (aDead && bDead) {
        a.hp = 1;
        a.hpQ8 = 256;
      }
      if (a.hp <= 0) knockOut(c, a);
      if (b.hp <= 0) knockOut(c, b);
      finish(c, a.hp > 0 ? 'a' : 'b', false);
      return;
    }
  } else if (s.dragon) {
    const d = s.dragon;
    if (d.hp <= 0) {
      if (a.hp <= 0) {
        a.hp = 1;
        a.hpQ8 = 256;
      }
      emit(c, 'dragon', { type: 'KO', who: 'dragon', pos: pos(d.x, d.y) });
      finish(c, 'a', false);
      return;
    }
    if (a.hp <= 0) {
      knockOut(c, a);
      finish(c, 'b', false);
      return;
    }
  }
  if (s.tick < s.timeLimit) return;
  emit(c, 'fight', { type: 'TimeUp' });
  let winner: Side = 'b';
  if (s.kind === 'duel' && s.b) winner = a.hp * s.b.maxHp >= s.b.hp * a.maxHp ? 'a' : 'b';
  finish(c, winner, true);
}

/** Advances a working copy by one tick in place (the runner owns its copy; stepCombat clones first). */
export function advanceInPlace(
  s: WState,
  inputs: readonly [FighterInput, FighterInput?],
  events: CombatEvent[],
): void {
  if (s.outcome) return;
  const c: Ctx = { s, r: s.rules, ev: events, clearHazards: false };
  s.tick += 1;
  const live = s.hitstop === 0;
  readInput(c, s.a, inputs[0], live);
  if (s.b) readInput(c, s.b, inputs[1], live);
  if (s.kind === 'duel') s.ringRadius = ringRadiusAt(c, s.tick);
  if (live) {
    updateFighter(c, s.a);
    if (s.b) updateFighter(c, s.b);
    updateDragon(c);
    physics(c);
    updateProjectiles(c);
    meleeHits(c);
    dragonHits(c);
    updateZones(c);
    ringTick(c);
    if (c.clearHazards) clearHazards(c);
  } else {
    s.hitstop -= 1;
  }
  resolveOutcome(c);
}

/**
 * One fixed tick. Pure: the input state is never mutated, and the same (state, inputs) always gives the same
 * state and events. Inputs are the only external data; the dragon draws from the seeded RNG in the state.
 */
export function stepCombat(
  state: CombatState,
  inputs: readonly [FighterInput, FighterInput?],
): { state: CombatState; events: CombatEvent[] } {
  if (state.outcome) return { state, events: [] };
  const s = cloneWorking(state);
  const events: CombatEvent[] = [];
  advanceInPlace(s, inputs, events);
  return { state: s, events };
}

/** Deep copy of the mutable entities (rules, RNG and telegraph shapes are immutable and shared). */
export function cloneCombatState(state: CombatState): CombatState {
  return cloneWorking(state);
}
