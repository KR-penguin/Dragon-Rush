import { atan2i, Q } from '../math';
import type { MoveSpec } from '../rules';
import type { CombatPolicy } from '../runner';
import {
  BTN_ATTACK,
  BTN_DASH,
  BTN_SKILL,
  NO_INPUT,
  type CombatState,
  type FighterInput,
  type FighterState,
  type MoveDir,
  type Side,
} from '../types';
import { aimedAt, bestAway, distPx, escapeShape, moveToward, targetOf, type Escape, type Target } from './sense';

export type BotStyle = 'balanced' | 'aggressive' | 'cautious';

/** Behaviour knobs of the scripted bot (AI tuning, not game balance). Probabilities are per tick at 60 Hz. */
export interface BotParams {
  /** Ticks before a new telegraph, zone or projectile is noticed (human reaction). */
  readonly reaction: number;
  /** Chance per tick to act on a noticed threat. */
  readonly dodge: number;
  /** Chance to spend a dash when walking out would be too late. */
  readonly dashDodge: number;
  /** Chance per tick to press attack while in range. */
  readonly aggression: number;
  /** Chance per tick to use a ready skill when it would connect. */
  readonly skill: number;
  /** Chance per tick to dash in to close a gap (melee). */
  readonly gapClose: number;
  /** Chance per tick for a ranged kit to dash away from a close opponent. */
  readonly panicDash: number;
  /** Swordsman: chance to answer a readable hit with a parry. */
  readonly parryRead: number;
  /** Extra px of safety margin around hazards. */
  readonly margin: number;
  /** Ranged kits: preferred distance multiplier. */
  readonly rangeScale: number;
  /** Archer: release a drawn arrow as a quick shot below this distance (px). */
  readonly quickShotRange: number;
}

export const BOT_STYLES: Readonly<Record<BotStyle, BotParams>> = {
  balanced: {
    reaction: 10,
    dodge: 0.6,
    dashDodge: 0.8,
    aggression: 0.35,
    skill: 0.08,
    gapClose: 0.04,
    panicDash: 0.15,
    parryRead: 0.6,
    margin: 6,
    rangeScale: 1,
    quickShotRange: 260,
  },
  aggressive: {
    reaction: 12,
    dodge: 0.45,
    dashDodge: 0.6,
    aggression: 0.6,
    skill: 0.12,
    gapClose: 0.08,
    panicDash: 0.06,
    parryRead: 0.45,
    margin: 2,
    rangeScale: 0.8,
    quickShotRange: 320,
  },
  cautious: {
    reaction: 8,
    dodge: 0.8,
    dashDodge: 0.9,
    aggression: 0.25,
    skill: 0.06,
    gapClose: 0.02,
    panicDash: 0.3,
    parryRead: 0.75,
    margin: 12,
    rangeScale: 1.2,
    quickShotRange: 220,
  },
};

interface Threat extends Escape {
  readonly ticksLeft: number;
  readonly parryable: boolean;
  /** Direction toward the source (for facing a parry). */
  readonly src: number;
  /** A projectile (homing ones cannot be outwalked: dash through them). */
  readonly projectile: boolean;
  readonly homing: boolean;
}

interface Out {
  move: number;
  attack: boolean;
  skill: boolean;
  dash: boolean;
}

/** A press is a rising edge: if the button is still held from last tick, release it first. */
function press(me: FighterState, bit: number): boolean {
  return (me.held & bit) === 0;
}

function walkPx(s: CombatState, me: FighterState): number {
  return s.rules.jobs[me.job].speed / s.rules.tickHz;
}

function slack(s: CombatState, me: FighterState, t: Threat): number {
  return t.ticksLeft - t.needed / walkPx(s, me);
}

function pickThreat(s: CombatState, me: FighterState, best: Threat | null, t: Threat | null): Threat | null {
  if (!t) return best;
  if (!best) return t;
  return slack(s, me, t) < slack(s, me, best) ? t : best;
}

function projectileThreats(s: CombatState, me: FighterState, p: BotParams, best: Threat | null): Threat | null {
  const hurt = s.rules.body.hurtRadius + p.margin;
  for (const pr of s.projectiles) {
    if (pr.owner === me.side) continue;
    if (s.tick - Math.floor(pr.id / 256) < p.reaction) continue;
    const rx = me.x - pr.x;
    const ry = me.y - pr.y;
    const vv = pr.vx * pr.vx + pr.vy * pr.vy;
    if (vv === 0) continue;
    const t = (rx * pr.vx + ry * pr.vy) / vv;
    if (t < 0 || t > 40) continue;
    const cx = rx - pr.vx * t;
    const cy = ry - pr.vy * t;
    const hitR = (pr.radius + hurt) * Q;
    const c2 = cx * cx + cy * cy;
    if (c2 > hitR * hitR) continue;
    const off = distPx(0, 0, cx, cy);
    const angle = off > 0 ? atan2i(cy, cx) : (atan2i(pr.vy, pr.vx) + 64) & 255;
    const homing = pr.homingLeft > 0;
    best = pickThreat(s, me, best, {
      angle,
      needed: pr.radius + hurt - off + (homing ? 40 : 0),
      ticksLeft: t,
      parryable: true,
      src: atan2i(-ry, -rx),
      projectile: true,
      homing,
    });
  }
  return best;
}

function zoneThreats(s: CombatState, me: FighterState, p: BotParams, best: Threat | null): Threat | null {
  for (const z of s.zones) {
    if (z.owner === me.side) continue;
    if (z.kind !== 'burningFloor' && (z.arm <= 0 || z.age < p.reaction)) continue;
    const e = escapeShape(s, { kind: 'circle', x: z.x, y: z.y, r: z.radius }, me, p.margin);
    if (!e) continue;
    best = pickThreat(s, me, best, {
      ...e,
      ticksLeft: z.arm,
      parryable: z.parryable,
      src: atan2i(z.y - me.y, z.x - me.x),
      projectile: false,
      homing: false,
    });
  }
  return best;
}

function dragonThreat(s: CombatState, me: FighterState, p: BotParams, best: Threat | null): Threat | null {
  const d = s.dragon;
  if (!d || !d.telegraph || d.maneuver === null || d.maneuver === 'gust') return best;
  if (d.stage !== 'telegraph' && d.stage !== 'active') return best;
  const R = s.rules.dragon;
  const left = d.stage === 'telegraph' ? d.stageLen - d.stageTick : 0;
  if (d.stage === 'telegraph' && d.stageTick < p.reaction) return best;
  // tracking telegraphs follow the player until they lock: moving earlier is wasted
  if (d.maneuver === 'charge' && d.stage === 'telegraph' && left > R.charge.lockBefore) return best;
  if (d.maneuver === 'dive' && left > R.dive.lockBefore) return best;
  const e = escapeShape(s, d.telegraph, me, p.margin);
  if (!e) return best;
  const parryable = (d.maneuver === 'claw' && R.claw.hit.parryable) || (d.maneuver === 'tail' && R.tail.hit.parryable);
  return pickThreat(s, me, best, {
    ...e,
    ticksLeft: left,
    parryable,
    src: atan2i(d.y - me.y, d.x - me.x),
    projectile: false,
    homing: false,
  });
}

function meleeThreat(s: CombatState, me: FighterState, p: BotParams, best: Threat | null): Threat | null {
  const o = me.side === 'a' ? s.b : s.a;
  if (!o || o.mode === 'ko' || o.move === null) return best;
  if (o.mode === 'dash') {
    const dash = s.rules.dashes[o.move as keyof typeof s.rules.dashes];
    if (!dash?.contact) return best;
    const dist = distPx(o.x, o.y, me.x, me.y);
    if (dist > 140 || !aimedAt(o, me.x, me.y, 24)) return best;
    return pickThreat(s, me, best, {
      angle: (o.aim + 64) & 255,
      needed: 40,
      ticksLeft: 4,
      parryable: false,
      src: atan2i(o.y - me.y, o.x - me.x),
      projectile: false,
      homing: false,
    });
  }
  if ((o.mode !== 'attack' && o.mode !== 'skill') || o.phase === 'recovery') return best;
  const spec = s.rules.moves[o.move as keyof typeof s.rules.moves] as MoveSpec | undefined;
  if (!spec || spec.type !== 'melee') return best;
  const dist = distPx(o.x, o.y, me.x, me.y);
  const reach = spec.reach + s.rules.body.hurtRadius + p.margin;
  if (dist > reach || !aimedAt(o, me.x, me.y, spec.half)) return best;
  return pickThreat(s, me, best, {
    angle: atan2i(me.y - o.y, me.x - o.x),
    needed: reach - dist,
    ticksLeft: Math.max(0, spec.startup - o.moveTick),
    parryable: true,
    src: atan2i(o.y - me.y, o.x - me.x),
    projectile: false,
    homing: false,
  });
}

function dashDir(s: CombatState, me: FighterState, angle: number): number {
  // a backstep always goes away from facing: face the opposite way to send it along `angle`
  const backward = s.rules.dashes[s.rules.jobs[me.job].dash].backward;
  return moveToward(backward ? (angle + 128) & 255 : angle);
}

function respond(s: CombatState, me: FighterState, p: BotParams, t: Threat, random: () => number, o: Out): void {
  const kit = s.rules.jobs[me.job];
  if (
    t.parryable &&
    kit.skill === 'parry' &&
    me.skillCharges > 0 &&
    t.ticksLeft >= 2 &&
    t.ticksLeft <= 14 &&
    random() < p.parryRead
  ) {
    o.move = moveToward(t.src);
    o.skill = press(me, BTN_SKILL);
    return;
  }
  o.move = moveToward(t.angle);
  if (me.dashCharges <= 0) return;
  const urgent = slack(s, me, t) < 3 || (t.homing && t.ticksLeft <= 12);
  if (!urgent || random() >= p.dashDodge) return;
  // melee kits dash *through* projectiles toward the opponent (i-frames), others sidestep
  const melee = s.rules.moves[kit.attack].type === 'melee';
  const tg = melee && t.projectile ? targetOf(s, me) : null;
  const angle = tg ? atan2i(tg.y - me.y, tg.x - me.x) : t.angle;
  o.move = dashDir(s, me, angle);
  o.dash = press(me, BTN_DASH);
}

function ringGuard(s: CombatState, me: FighterState): number {
  if (s.kind !== 'duel' || s.ringRadius >= s.rules.ring.startRadius) return 0;
  const cx = (s.arenaW / 2) * Q;
  const cy = (s.arenaH / 2) * Q;
  if (distPx(cx, cy, me.x, me.y) < s.ringRadius - 36) return 0;
  return moveToward(atan2i(cy - me.y, cx - me.x));
}

function strafe(s: CombatState, me: FighterState, aim: number): number {
  const flip = ((s.tick >> 6) + (me.side === 'a' ? 0 : 1)) & 1;
  return moveToward((aim + (flip ? 64 : -64)) & 255);
}

function meleePlan(s: CombatState, me: FighterState, p: BotParams, tg: Target, random: () => number, o: Out): void {
  const kit = s.rules.jobs[me.job];
  const atk = s.rules.moves[kit.attack];
  const skill = s.rules.moves[kit.skill];
  const dash = s.rules.dashes[kit.dash];
  const reach = atk.type === 'melee' ? atk.reach : 48;
  const dist = distPx(me.x, me.y, tg.x, tg.y);
  const surface = dist - tg.r;
  const aim = atan2i(tg.y - me.y, tg.x - me.x);
  const aimMove = moveToward(aim);
  if (surface <= reach - 6) {
    o.move = aimMove;
    if (skill.type === 'melee' && skill.half >= 128 && surface <= skill.reach - 8 && me.skillCharges > 0 && random() < p.skill) {
      o.skill = press(me, BTN_SKILL);
      return;
    }
    if (random() < p.aggression) o.attack = press(me, BTN_ATTACK);
    else if (me.mode === 'idle' || me.mode === 'move') o.move = 0;
    return;
  }
  o.move = aimMove;
  if (skill.type === 'shot' && surface > 90 && surface < 420 && me.skillCharges > 0 && random() < p.skill) {
    o.skill = press(me, BTN_SKILL);
    return;
  }
  const busy = tg.fighter !== null && (tg.fighter.mode === 'attack' || tg.fighter.mode === 'skill' || tg.fighter.mode === 'hitstun');
  const gap = surface > 50 && surface < 120 + dash.fastTicks * dash.fastSpeed;
  if (!dash.backward && me.dashCharges > 0 && gap && random() < (busy ? p.gapClose * 6 : p.gapClose)) {
    o.dash = press(me, BTN_DASH);
  }
}

function rangedPlan(s: CombatState, me: FighterState, p: BotParams, tg: Target, random: () => number, o: Out): void {
  const kit = s.rules.jobs[me.job];
  const atk = s.rules.moves[kit.attack];
  const skill = s.rules.moves[kit.skill];
  const dist = distPx(me.x, me.y, tg.x, tg.y);
  const surface = dist - tg.r;
  const aim = atan2i(tg.y - me.y, tg.x - me.x);
  const aimMove = moveToward(aim);
  const minD = 200 * p.rangeScale;
  const maxD = 340 * p.rangeScale;
  let walk: number;
  if (surface < minD) walk = bestAway(s, me, tg.x, tg.y);
  else if (surface > maxD) walk = aimMove;
  else walk = strafe(s, me, aim);
  o.move = walk;

  if (atk.type === 'draw' && me.move === 'draw') {
    // keep the draw as a level; release for a quick shot when close, hold to full draw when far
    const wantFull = surface > p.quickShotRange;
    o.attack = wantFull ? me.drawTicks < atk.fullAt : me.drawTicks < atk.quickAt;
    return;
  }
  const close = tg.fighter !== null && surface < 90;
  if (close && me.dashCharges > 0 && random() < p.panicDash) {
    const dash = s.rules.dashes[kit.dash];
    o.move = dash.backward ? aimMove : bestAway(s, me, tg.x, tg.y);
    o.dash = press(me, BTN_DASH);
    return;
  }
  if (me.mode === 'attack' || me.mode === 'skill' || me.mode === 'hitstun') return;
  if (me.skillCharges > 0 && random() < p.skill) {
    const range = skill.type === 'rune' ? skill.assistRange : skill.type === 'shot' ? skill.projectile.range : 0;
    if (surface < range * 0.9) {
      o.move = aimMove;
      o.skill = press(me, BTN_SKILL);
      return;
    }
  }
  const range = atk.type === 'shot' ? atk.projectile.range : 520;
  if (surface < range * 0.9 && random() < p.aggression) {
    o.move = aimMove;
    o.attack = press(me, BTN_ATTACK);
  }
}

function decideBot(s: CombatState, side: Side, random: () => number, p: BotParams): FighterInput {
  const me = side === 'a' ? s.a : s.b;
  if (!me || me.mode === 'ko' || s.outcome) return NO_INPUT;
  const tg = targetOf(s, me);
  const o: Out = { move: 0, attack: false, skill: false, dash: false };
  let threat: Threat | null = null;
  threat = projectileThreats(s, me, p, threat);
  threat = zoneThreats(s, me, p, threat);
  threat = dragonThreat(s, me, p, threat);
  threat = meleeThreat(s, me, p, threat);
  const drawing = me.move === 'draw';
  if (threat && random() < p.dodge) {
    respond(s, me, p, threat, random, o);
    // a held draw stays held while dodging
    if (drawing) o.attack = true;
  } else if (tg) {
    const atk = s.rules.moves[s.rules.jobs[me.job].attack];
    if (atk.type === 'melee') meleePlan(s, me, p, tg, random, o);
    else rangedPlan(s, me, p, tg, random, o);
  }
  const ring = ringGuard(s, me);
  if (ring !== 0 && !o.dash) o.move = ring;
  return { move: (o.move >= 0 && o.move <= 8 ? o.move : 0) as MoveDir, attack: o.attack, skill: o.skill, dash: o.dash };
}

/** Scripted, job-aware combat bot for duels and the dragon fight. Stateless: everything comes from the state. */
export function createCombatBot(style: BotStyle = 'balanced', params: Partial<BotParams> = {}): CombatPolicy {
  const p: BotParams = { ...BOT_STYLES[style], ...params };
  return {
    id: `combat-bot:${style}`,
    decide: (state, side, random) => decideBot(state, side, random, p),
  };
}

/** Idle dummy (curriculum stage 0 / tests). */
export const IDLE_POLICY: CombatPolicy = { id: 'idle', decide: () => NO_INPUT };

