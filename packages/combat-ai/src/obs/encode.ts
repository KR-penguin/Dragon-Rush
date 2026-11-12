import {
  cosQ14,
  isqrt,
  Q,
  sinQ14,
  type CombatRules,
  type CombatState,
  type DashId,
  type DragonState,
  type FighterState,
  type MoveId,
  type Shape,
  type Side,
} from '@dragon-rush/combat';
import { JOB_IDS } from '@dragon-rush/engine';
import { CACT_BUTTON_DIM, CACT_MOVE_DIM, NO_MIRROR, type Mirror } from '../codec/actions';
import { fighterOf, moveTotal } from '../mask';
import { mirrorCombatObservation } from './mirror';
import {
  COBS_DIM,
  COBS_V1_SCALES as S,
  MANEUVER_NAMES,
  O,
  THREAT_SLOTS,
  THREAT_WIDTH,
} from './layout';

/** Values that are not part of the (possibly delayed) sim state. */
export interface CombatObsContext {
  /** Reaction delay of this seat in ticks (g.match[3]). */
  readonly delay: number;
  /** Previous decision in the world frame (mirrored together with the rest of the vector). */
  readonly prevMove: number;
  readonly prevButton: number;
  readonly mirror?: Mirror;
}

export const DEFAULT_OBS_CONTEXT: CombatObsContext = Object.freeze({
  delay: 0,
  prevMove: 0,
  prevButton: 0,
});

const TRIG_ONE = 16384;
const DRAGON_TYPE = 5;

const clip = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
/** n(x, S) = clip(x / S, 0, 2) */
const n = (x: number, s: number): number => clip(x / s, 0, 2);
/** s(x, S) = clip(x / S, -1, 1) */
const sg = (x: number, s: number): number => clip(x / s, -1, 1);
const sin = (bam: number): number => sinQ14(bam) / TRIG_ONE;
const cos = (bam: number): number => cosQ14(bam) / TRIG_ONE;
const ratio = (num: number, den: number): number => (den > 0 ? clip(num / den, 0, 1) : 0);

function jobIndex(job: string): number {
  return (JOB_IDS as readonly string[]).indexOf(job);
}

/** Velocity a viewer would see (px/s): locomotion + knockback + dash travel. */
function fighterVelocity(r: CombatRules, f: FighterState): [number, number] {
  if (f.mode === 'ko') return [0, 0];
  let vx = f.vx;
  let vy = f.vy;
  if (f.kbLeft > 0 && f.kbTotal > 0) {
    vx += (f.kbx * f.kbLeft) / f.kbTotal;
    vy += (f.kby * f.kbLeft) / f.kbTotal;
  }
  if (f.mode === 'dash' && f.move !== null) {
    const d = r.dashes[f.move as DashId];
    const next = f.moveTick + 1;
    if (d && next < d.ticks) {
      const speed = (next < d.fastTicks ? d.fastSpeed : d.slowSpeed) * Q;
      vx += (speed * cosQ14(f.aim)) / TRIG_ONE;
      vy += (speed * sinQ14(f.aim)) / TRIG_ONE;
    }
  }
  const k = r.tickHz / Q;
  return [vx * k, vy * k];
}

function dragonVelocity(s: CombatState, d: DragonState): [number, number] {
  const R = s.rules.dragon;
  const hz = s.rules.tickHz;
  if (d.hp <= 0) return [0, 0];
  if (d.stage === 'active' && d.maneuver === 'charge')
    return [
      (R.charge.speed * cosQ14(d.aim)) / TRIG_ONE,
      (R.charge.speed * sinQ14(d.aim)) / TRIG_ONE,
    ];
  if (d.stage === 'idle') {
    const dx = (s.a.x - d.x) / Q;
    return [clip(dx * hz, -R.driftSpeed, R.driftSpeed), 0];
  }
  if (d.stage === 'returning') {
    const dy = (R.anchorY * Q - d.y) / Q;
    return [0, clip(dy * hz, -R.returnSpeed, R.returnSpeed)];
  }
  return [0, 0];
}

/** Index in STATE_NAMES (-1 = KO, all zero). */
function fighterStateIndex(f: FighterState): number {
  switch (f.mode) {
    case 'idle':
      return 0;
    case 'move':
      return 1;
    case 'attack':
    case 'skill':
      return f.phase === 'active' ? 3 : f.phase === 'recovery' ? 4 : 2;
    case 'dash':
      return 5;
    case 'hitstun':
      return 6;
    case 'ko':
      return -1;
  }
}

/** Progress through the current state in [0, 1]; hitstun counts down from HITSTUN_S. */
function fighterProgress(r: CombatRules, f: FighterState): number {
  switch (f.mode) {
    case 'attack':
    case 'skill': {
      const spec = r.moves[f.move as MoveId];
      if (spec.type === 'draw') return ratio(f.drawTicks, spec.fullAt);
      return ratio(f.moveTick, moveTotal(spec));
    }
    case 'dash':
      return ratio(f.moveTick, r.dashes[f.move as DashId].ticks);
    case 'hitstun':
      return 1 - ratio(f.hitstun, S.HITSTUN_S);
    default:
      return 0;
  }
}

/** Position of the current move in the job's attack string (slash1 0, slash2 1, thrust 2). */
function chainStep(r: CombatRules, f: FighterState): number {
  if (f.mode !== 'attack' || f.move === null) return 0;
  let id: MoveId | null = r.jobs[f.job].attack;
  for (let step = 0; id !== null && step < 8; step++) {
    if (id === f.move) return step;
    const spec: (typeof r.moves)[MoveId] = r.moves[id];
    id = spec.type === 'melee' ? spec.next : null;
  }
  return 0;
}

function moveKind(r: CombatRules, f: FighterState): number {
  if (f.mode === 'skill') return 3;
  if (f.mode !== 'attack' || f.move === null) return 0;
  const spec = r.moves[f.move as MoveId];
  const power =
    spec.type === 'melee' || spec.type === 'rune'
      ? spec.hit.power
      : spec.type === 'shot'
        ? spec.projectile.hit.power
        : 0;
  return power >= r.hitstop.heavyMinPower ? 2 : 1;
}

const invulnerable = (f: FighterState): boolean => f.iframeDelay === 0 && f.iframes > 0;

function writeStats(
  o: Float32Array,
  at: number,
  hp: number,
  maxHp: number,
  atk: number,
  def: number,
): void {
  o[at] = ratio(Math.max(0, hp), maxHp);
  o[at + 1] = n(maxHp, S.HP_S);
  o[at + 2] = n(atk, S.STAT_S);
  o[at + 3] = n(def, S.STAT_S);
}

function encodeSelf(o: Float32Array, s: CombatState, f: FighterState): void {
  const r = s.rules;
  const kit = r.jobs[f.job];
  const dash = r.dashes[kit.dash];
  writeStats(o, O.selfStats, f.hp, f.maxHp, f.atk, f.def);
  o[O.selfJob + jobIndex(f.job)] = 1;
  const st = fighterStateIndex(f);
  if (st >= 0) o[O.selfState + st] = 1;
  o[O.selfStateInfo] = fighterProgress(r, f);
  o[O.selfStateInfo + 1] = chainStep(r, f) / 2;
  // the sim starts a skill's cooldown timer at use with the move's own length added
  o[O.selfCooldowns] =
    f.skillCharges < kit.skillCharges
      ? ratio(f.skillTimer, kit.skillCooldown + moveTotal(r.moves[kit.skill]))
      : 0;
  o[O.selfCooldowns + 1] =
    f.dashCharges < dash.charges ? ratio(f.dashTimer, dash.cooldown + dash.ticks) : 0;
  o[O.selfCooldowns + 2] = ratio(f.skillCharges, kit.skillCharges);
  o[O.selfCooldowns + 3] = ratio(f.dashCharges, dash.charges);
  const attack = r.moves[kit.attack];
  o[O.selfFlags] = invulnerable(f) ? 1 : 0;
  o[O.selfFlags + 1] = f.superArmor ? 1 : 0;
  o[O.selfFlags + 2] = f.lastStandAvailable ? 1 : 0;
  o[O.selfFlags + 3] = f.raging ? 1 : 0;
  o[O.selfFlags + 4] = f.firstStrikePending ? 1 : 0;
  o[O.selfFlags + 5] =
    attack.type === 'draw' && f.move === 'draw' ? ratio(f.drawTicks, attack.fullAt) : 0;
  o[O.selfFlags + 6] = ratio(f.evadeCounter, r.passives.ninjaEvadeEvery - 1);
  o[O.selfFlags + 7] = ratio(f.dashStale, r.dashStale.max);
  const [vx, vy] = fighterVelocity(r, f);
  o[O.selfVel] = sg(vx, S.V_S);
  o[O.selfVel + 1] = sg(vy, S.V_S);
  o[O.selfFacing] = sin(f.facing);
  o[O.selfFacing + 1] = cos(f.facing);
  o[O.selfPos] = sg(f.x / Q - s.arenaW / 2, s.arenaW / 2);
  o[O.selfPos + 1] = sg(f.y / Q - s.arenaH / 2, s.arenaH / 2);
}

function writeRel(o: Float32Array, s: CombatState, me: FighterState, x: number, y: number): void {
  const dx = x - me.x;
  const dy = y - me.y;
  o[O.oppRel] = sg(dx / Q, s.arenaW);
  o[O.oppRel + 1] = sg(dy / Q, s.arenaH);
  o[O.oppRel + 2] = n(isqrt(dx * dx + dy * dy) / Q, s.arenaW);
}

function encodeOpponentFighter(
  o: Float32Array,
  s: CombatState,
  me: FighterState,
  f: FighterState,
): void {
  const r = s.rules;
  writeRel(o, s, me, f.x, f.y);
  const [mvx, mvy] = fighterVelocity(r, me);
  const [vx, vy] = fighterVelocity(r, f);
  o[O.oppMotion] = sg(vx - mvx, S.V_S);
  o[O.oppMotion + 1] = sg(vy - mvy, S.V_S);
  o[O.oppMotion + 2] = sin(f.facing);
  o[O.oppMotion + 3] = cos(f.facing);
  writeStats(o, O.oppStats, f.hp, f.maxHp, f.atk, f.def);
  o[O.oppType + jobIndex(f.job)] = 1;
  const st = fighterStateIndex(f);
  if (st >= 0) o[O.oppState + st] = 1;
  o[O.oppState + 7] = fighterProgress(r, f);
  o[O.oppMoveKind + moveKind(r, f)] = 1;
  o[O.oppFlags] = invulnerable(f) ? 1 : 0;
  o[O.oppFlags + 1] = f.superArmor ? 1 : 0;
  o[O.oppFlags + 2] = f.lastStandAvailable ? 1 : 0;
  o[O.oppFlags + 3] = f.raging ? 1 : 0;
  o[O.oppFlags + 4] = ratio(f.evadeCounter, r.passives.ninjaEvadeEvery - 1);
  o[O.oppFlags + 5] = f.firstStrikePending ? 1 : 0;
  o[O.oppReady] = f.skillCharges > 0 ? 1 : 0;
  o[O.oppReady + 1] = f.dashCharges > 0 ? 1 : 0;
  o[O.oppReady + 2] = f.mode === 'hitstun' ? n(f.hitstun, S.HITSTUN_S) : 0;
}

function dragonStateIndex(d: DragonState): number {
  switch (d.stage) {
    case 'idle':
      return 0;
    case 'returning':
      return 1;
    case 'telegraph':
      return 2;
    case 'active':
      return 3;
    case 'recovery':
    case 'roar':
      return 4;
    case 'stunned':
      return 6;
  }
}

function dragonMoveKind(d: DragonState): number {
  switch (d.maneuver) {
    case null:
      return 0;
    case 'claw':
    case 'tail':
      return 1;
    case 'charge':
    case 'breath':
    case 'dive':
      return 2;
    case 'volley':
    case 'gust':
      return 3;
  }
}

function telegraphAim(d: DragonState): number | null {
  const t = d.telegraph;
  if (!t || t.kind === 'circle' || (d.stage !== 'telegraph' && d.stage !== 'active')) return null;
  return d.maneuver === 'breath' && d.stage === 'active' ? d.aim : t.dir;
}

function encodeDragon(o: Float32Array, s: CombatState, me: FighterState, d: DragonState): void {
  const r = s.rules;
  writeRel(o, s, me, d.x, d.y);
  const [mvx, mvy] = fighterVelocity(r, me);
  const [vx, vy] = dragonVelocity(s, d);
  o[O.oppMotion] = sg(vx - mvx, S.V_S);
  o[O.oppMotion + 1] = sg(vy - mvy, S.V_S);
  o[O.oppMotion + 2] = sin(d.facing);
  o[O.oppMotion + 3] = cos(d.facing);
  writeStats(o, O.oppStats, d.hp, d.maxHp, d.atk, d.def);
  o[O.oppType + DRAGON_TYPE] = 1;
  if (d.hp > 0) {
    o[O.oppState + dragonStateIndex(d)] = 1;
    o[O.oppState + 7] = ratio(d.stageTick, d.stageLen);
  }
  o[O.oppMoveKind + dragonMoveKind(d)] = 1;
  o[O.oppFlags] = d.invulnerable || d.airborne ? 1 : 0;
  o[O.oppFlags + 1] = 1;
  o[O.oppReady + 2] = d.stage === 'stunned' ? n(d.stageLen - d.stageTick, S.HITSTUN_S) : 0;

  o[O.dragonPhase + d.phase - 1] = 1;
  if (d.maneuver !== null) o[O.dragonManeuver + MANEUVER_NAMES.indexOf(d.maneuver)] = 1;
  const staged = d.stage === 'telegraph' || d.stage === 'active' || d.stage === 'recovery';
  o[O.dragonStage] = staged ? ratio(d.stageTick, d.stageLen) : 0;
  o[O.dragonStage + 1] = n(Math.max(0, r.dragon.breathEvery - 1 - d.sinceBreath), S.BREATH_S);
  o[O.dragonStage + 2] = d.headLowered > 0 ? 1 : 0;
  const aim = telegraphAim(d);
  if (aim !== null) {
    o[O.dragonAim] = sin(aim);
    o[O.dragonAim + 1] = cos(aim);
  }
}

interface Threat {
  hostile: number;
  kind: number;
  /** Q8 offsets from me. */
  dx: number;
  dy: number;
  /** px/s */
  vx: number;
  vy: number;
  radius: number;
  ticks: number;
  /** Sort key: closest approach (projectiles) or ticks until active (areas). */
  key: number;
  dist2: number;
}

function shapeRadius(sh: Shape): number {
  return sh.kind === 'line' ? sh.halfWidth : sh.r;
}

function gatherThreats(s: CombatState, side: Side, me: FighterState): Threat[] {
  const out: Threat[] = [];
  const k = s.rules.tickHz / Q;
  for (const p of s.projectiles) {
    const dx = p.x - me.x;
    const dy = p.y - me.y;
    const vv = p.vx * p.vx + p.vy * p.vy;
    const t = vv > 0 ? Math.max(0, -(dx * p.vx + dy * p.vy) / vv) : 0;
    out.push({
      hostile: p.owner !== side ? 1 : 0,
      kind: 0,
      dx,
      dy,
      vx: p.vx * k,
      vy: p.vy * k,
      radius: p.radius,
      ticks: 0,
      key: t,
      dist2: dx * dx + dy * dy,
    });
  }
  for (const z of s.zones) {
    const dx = z.x - me.x;
    const dy = z.y - me.y;
    out.push({
      hostile: z.owner !== side ? 1 : 0,
      kind: 1,
      dx,
      dy,
      vx: 0,
      vy: 0,
      radius: z.radius,
      ticks: z.arm,
      key: z.arm,
      dist2: dx * dx + dy * dy,
    });
  }
  const d = s.dragon;
  if (
    d &&
    d.hp > 0 &&
    d.telegraph &&
    d.maneuver !== null &&
    (d.stage === 'telegraph' || d.stage === 'active')
  ) {
    const t = d.telegraph;
    const dx = t.x - me.x;
    const dy = t.y - me.y;
    const ticks = d.stage === 'telegraph' ? Math.max(0, d.stageLen - d.stageTick) : 0;
    out.push({
      hostile: d.maneuver === 'gust' ? 0 : 1,
      kind: 1,
      dx,
      dy,
      vx: 0,
      vy: 0,
      radius: shapeRadius(t),
      ticks,
      key: ticks,
      dist2: dx * dx + dy * dy,
    });
  }
  // stable sort: ties keep gather order, which is deterministic
  out.sort((a, b) => b.hostile - a.hostile || a.key - b.key || a.dist2 - b.dist2);
  return out;
}

function encodeThreats(o: Float32Array, s: CombatState, side: Side, me: FighterState): void {
  const list = gatherThreats(s, side, me);
  const count = Math.min(THREAT_SLOTS, list.length);
  for (let i = 0; i < count; i++) {
    const t = list[i]!;
    const at = O.threats + i * THREAT_WIDTH;
    o[at] = 1;
    o[at + 1] = t.hostile;
    o[at + 2] = t.kind;
    o[at + 3] = sg(t.dx / Q, s.arenaW);
    o[at + 4] = sg(t.dy / Q, s.arenaH);
    o[at + 5] = sg(t.vx, S.PV_S);
    o[at + 6] = sg(t.vy, S.PV_S);
    o[at + 7] = n(t.radius, S.R_S);
    o[at + 8] = n(t.ticks, S.T_S);
  }
}

function encodeGlobal(o: Float32Array, s: CombatState, ctx: CombatObsContext): void {
  o[O.gMatch] = ratio(Math.max(0, s.timeLimit - s.tick), s.timeLimit);
  o[O.gMatch + 1] = s.kind === 'dragonFight' ? 1 : 0;
  o[O.gMatch + 2] = s.kind === 'duel' ? n(s.ringRadius, S.RING_S) : 0;
  o[O.gMatch + 3] = n(ctx.delay, S.DELAY_S);
  const move =
    Number.isInteger(ctx.prevMove) && ctx.prevMove >= 0 && ctx.prevMove < CACT_MOVE_DIM
      ? ctx.prevMove
      : 0;
  const button =
    Number.isInteger(ctx.prevButton) && ctx.prevButton >= 0 && ctx.prevButton < CACT_BUTTON_DIM
      ? ctx.prevButton
      : 0;
  o[O.gPrevMove + move] = 1;
  o[O.gPrevButton + button] = 1;
}

/**
 * cobs_v1 observation of `side` (docs/combat-ai-spec.md §4): ego-centric, axis-aligned, normalised to [-1, 2].
 * `state` is whatever the seat may see (the env passes the delayed state); `ctx` carries the delay, the
 * previous decision and the mirror flags. Writes into `out` when given (zeroed first).
 */
export function encodeCombatObservation(
  state: CombatState,
  side: Side,
  ctx: CombatObsContext = DEFAULT_OBS_CONTEXT,
  out?: Float32Array,
): Float32Array {
  const me = fighterOf(state, side);
  if (!me) throw new RangeError(`no fighter on side ${side}`);
  const o = out ?? new Float32Array(COBS_DIM);
  if (o.length !== COBS_DIM) throw new RangeError(`obs buffer must have length ${COBS_DIM}`);
  o.fill(0);
  encodeSelf(o, state, me);
  if (state.dragon) encodeDragon(o, state, me, state.dragon);
  else {
    const opp = fighterOf(state, side === 'a' ? 'b' : 'a');
    if (opp) encodeOpponentFighter(o, state, me, opp);
  }
  encodeThreats(o, state, side, me);
  encodeGlobal(o, state, ctx);
  const mirror = ctx.mirror ?? NO_MIRROR;
  if (mirror.x || mirror.y) mirrorCombatObservation(o, mirror, o);
  return o;
}
