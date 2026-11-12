import type { JobId } from '@dragon-rush/engine';
import { atan2i, cosQ14, Q, sinQ14 } from '../math';
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
import {
  aimedAt,
  bestAway,
  distPx,
  escapeShape,
  moveToward,
  targetOf,
  type Escape,
  type Target,
} from './sense';

export type BotStyle = 'balanced' | 'aggressive' | 'cautious';

/**
 * How each job is played (the designed matchup chart depends on it):
 * duelist baits and parries, kiter keeps distance, rushdown dives behind and retreats,
 * zoner places runes on committed targets, brawler walks in behind super armor.
 */
export type BotRole = 'duelist' | 'kiter' | 'rushdown' | 'zoner' | 'brawler';

export const JOB_ROLES: Readonly<Record<JobId, BotRole>> = {
  swordsman: 'duelist',
  archer: 'kiter',
  ninja: 'rushdown',
  mage: 'zoner',
  berserker: 'brawler',
};

/** Behaviour knobs of the scripted bot (AI tuning, not game balance). Probabilities are per tick at 60 Hz. */
export interface BotParams {
  /** Ticks before a new telegraph, zone or projectile is noticed (human reaction). */
  readonly reaction: number;
  /** Chance per tick to act on a noticed threat. */
  readonly dodge: number;
  /** Chance to spend a dash when walking out would be too late. */
  readonly dashDodge: number;
  /** Chance per tick to start an attack in range while the opponent is not open (neutral pokes). */
  readonly poke: number;
  /** Chance per tick to attack (or step in) while the opponent is open: recovery, hitstun, a whiff. */
  readonly punish: number;
  /** Ranged kits: chance per tick to shoot while lined up. */
  readonly fire: number;
  /** Chance per tick to use a ready skill when it would connect. */
  readonly skill: number;
  /** Chance per tick to dash in to close a gap (melee). */
  readonly gapClose: number;
  /** Chance per tick for a ranged kit to dash away from a close opponent. */
  readonly panicDash: number;
  /** Duelist: chance to answer a readable hit with a parry. */
  readonly parryRead: number;
  /** Extra px of safety margin around hazards. */
  readonly margin: number;
  /** Melee: px kept outside the opponent's reach while waiting for an opening. */
  readonly spacing: number;
  /** Ranged kits: preferred distance multiplier. */
  readonly rangeScale: number;
  /** Archer: release a drawn arrow as a quick shot below this distance (px). */
  readonly quickShotRange: number;
}

export const BOT_STYLES: Readonly<Record<BotStyle, BotParams>> = {
  balanced: {
    reaction: 10,
    dodge: 0.8,
    dashDodge: 0.8,
    poke: 0.015,
    punish: 0.3,
    fire: 0.02,
    skill: 0.03,
    gapClose: 0.03,
    panicDash: 0.25,
    parryRead: 0.6,
    margin: 6,
    spacing: 30,
    rangeScale: 1,
    quickShotRange: 260,
  },
  aggressive: {
    reaction: 12,
    dodge: 0.65,
    dashDodge: 0.6,
    poke: 0.1,
    punish: 0.6,
    fire: 0.1,
    skill: 0.08,
    gapClose: 0.06,
    panicDash: 0.1,
    parryRead: 0.45,
    margin: 2,
    spacing: 10,
    rangeScale: 0.8,
    quickShotRange: 320,
  },
  cautious: {
    reaction: 8,
    dodge: 0.8,
    dashDodge: 0.9,
    poke: 0.02,
    punish: 0.45,
    fire: 0.035,
    skill: 0.04,
    gapClose: 0.02,
    panicDash: 0.35,
    parryRead: 0.75,
    margin: 12,
    spacing: 45,
    rangeScale: 1.2,
    quickShotRange: 220,
  },
};

interface Threat extends Escape {
  readonly ticksLeft: number;
  readonly parryable: boolean;
  /** Direction toward the source (for facing a parry). */
  readonly src: number;
  readonly kind: 'projectile' | 'zone' | 'dragon' | 'melee';
  readonly homing: boolean;
  /** Stable identity of the threat, so the bot commits to one dodge decision per threat. */
  readonly key: number;
  readonly fullShot?: boolean;
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

function projectileParryable(s: CombatState, kind: keyof CombatState['rules']['moves']): boolean {
  const spec = s.rules.moves[kind];
  return spec.type !== 'shot' || spec.projectile.parryable;
}

function pickThreat(
  s: CombatState,
  me: FighterState,
  best: Threat | null,
  t: Threat | null,
): Threat | null {
  if (!t) return best;
  if (!best) return t;
  return slack(s, me, t) < slack(s, me, best) ? t : best;
}

function projectileThreats(
  s: CombatState,
  me: FighterState,
  p: BotParams,
  best: Threat | null,
): Threat | null {
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
    if (cx * cx + cy * cy > hitR * hitR) continue;
    const off = distPx(0, 0, cx, cy);
    const angle = off > 0 ? atan2i(cy, cx) : (atan2i(pr.vy, pr.vx) + 64) & 255;
    const homing = pr.homingLeft > 0;
    best = pickThreat(s, me, best, {
      angle,
      needed: pr.radius + hurt - off + (homing ? 40 : 0),
      ticksLeft: t,
      parryable: projectileParryable(s, pr.kind),
      src: atan2i(-ry, -rx),
      kind: 'projectile',
      homing,
      key: pr.id,
      fullShot: pr.kind === 'fullShot',
    });
  }
  return best;
}

function zoneThreats(
  s: CombatState,
  me: FighterState,
  p: BotParams,
  best: Threat | null,
): Threat | null {
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
      kind: 'zone',
      homing: false,
      key: z.id,
    });
  }
  return best;
}

function dragonThreat(
  s: CombatState,
  me: FighterState,
  p: BotParams,
  best: Threat | null,
): Threat | null {
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
  const parryable =
    (d.maneuver === 'claw' && R.claw.hit.parryable) ||
    (d.maneuver === 'tail' && R.tail.hit.parryable);
  return pickThreat(s, me, best, {
    ...e,
    ticksLeft: left,
    parryable,
    src: atan2i(d.y - me.y, d.x - me.x),
    kind: 'dragon',
    homing: false,
    key: d.telegraphId,
  });
}

function meleeThreat(
  s: CombatState,
  me: FighterState,
  p: BotParams,
  best: Threat | null,
): Threat | null {
  const o = me.side === 'a' ? s.b : s.a;
  if (!o || o.mode === 'ko' || o.move === null) return best;
  const melee = (angle: number, needed: number, ticksLeft: number, parryable: boolean): Threat => ({
    angle,
    needed,
    ticksLeft,
    parryable,
    src: atan2i(o.y - me.y, o.x - me.x),
    kind: 'melee',
    homing: false,
    key: (s.tick - o.moveTick) * 4 + 3,
  });
  if (o.mode === 'dash') {
    const dash = s.rules.dashes[o.move as keyof typeof s.rules.dashes];
    if (!dash?.contact) return best;
    const dist = distPx(o.x, o.y, me.x, me.y);
    if (dist > 140 || !aimedAt(o, me.x, me.y, 24)) return best;
    return pickThreat(s, me, best, melee((o.aim + 64) & 255, 40, 4, false));
  }
  if ((o.mode !== 'attack' && o.mode !== 'skill') || o.phase === 'recovery') return best;
  const spec = s.rules.moves[o.move as keyof typeof s.rules.moves] as MoveSpec | undefined;
  if (!spec || spec.type !== 'melee') return best;
  const dist = distPx(o.x, o.y, me.x, me.y);
  const reach = spec.reach + spec.lunge + s.rules.body.hurtRadius + p.margin;
  if (dist > reach || !aimedAt(o, me.x, me.y, spec.half)) return best;
  return pickThreat(
    s,
    me,
    best,
    melee(
      atan2i(me.y - o.y, me.x - o.x),
      reach - dist,
      Math.max(0, spec.startup - o.moveTick),
      spec.parry === 'counter',
    ),
  );
}

function dashDir(s: CombatState, me: FighterState, angle: number): number {
  // a backstep always goes away from facing: face the opposite way to send it along `angle`
  const backward = s.rules.dashes[s.rules.jobs[me.job].dash].backward;
  return moveToward(backward ? (angle + 128) & 255 : angle);
}

function canParry(s: CombatState, me: FighterState): boolean {
  return s.rules.moves[s.rules.jobs[me.job].skill].type === 'parry' && me.skillCharges > 0;
}

function respond(
  s: CombatState,
  me: FighterState,
  p: BotParams,
  t: Threat,
  random: () => number,
  o: Out,
): void {
  const kit = s.rules.jobs[me.job];
  const role = JOB_ROLES[me.job];
  if (
    t.parryable &&
    canParry(s, me) &&
    t.ticksLeft >= 1 &&
    t.ticksLeft <= 16 &&
    random() < p.parryRead
  ) {
    o.move = moveToward(t.src);
    o.skill = press(me, BTN_SKILL);
    return;
  }
  const axe = s.rules.moves[kit.attack];
  const armorIn =
    axe.type === 'melee' && axe.armorFrom >= 0 ? axe.armorFrom : Number.POSITIVE_INFINITY;
  if (
    role === 'brawler' &&
    t.kind === 'melee' &&
    t.ticksLeft > armorIn &&
    me.mode !== 'attack' &&
    random() < p.punish
  ) {
    // trade into it: the greataxe's super armor absorbs the poke
    o.move = moveToward(t.src);
    o.attack = press(me, BTN_ATTACK);
    return;
  }
  o.move = moveToward(t.angle);
  if (me.dashCharges <= 0) return;
  const melee = s.rules.moves[kit.attack].type === 'melee';
  if (melee && t.kind === 'projectile') {
    // melee kits dash *through* projectiles toward the opponent, timed so the hit lands inside the i-frames
    const d = s.rules.dashes[kit.dash];
    const st = s.rules.dashStale;
    const stale = me.sinceDash < st.window ? Math.min(me.dashStale + 1, st.max) : 0;
    const first = d.iframeFrom - 1 + stale * st.delay;
    const last = d.iframeTo - 1;
    if (t.ticksLeft < first || t.ticksLeft > last || random() >= p.dashDodge) return;
    const tg = targetOf(s, me);
    o.move = dashDir(s, me, tg ? atan2i(tg.y - me.y, tg.x - me.x) : t.angle);
    o.dash = press(me, BTN_DASH);
    return;
  }
  const urgent = slack(s, me, t) < 3 || (t.homing && t.ticksLeft <= 12);
  if (!urgent || random() >= p.dashDodge) return;
  if (role === 'zoner' && t.fullShot) {
    const tg = targetOf(s, me);
    o.move = dashDir(s, me, tg ? atan2i(tg.y - me.y, tg.x - me.x) : t.angle);
  } else o.move = dashDir(s, me, t.angle);
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

/** The opponent is open: recovering or stunned (a rushdown also dives on a drawing archer). */
function isOpen(tg: Target, role: BotRole): boolean {
  const o = tg.fighter;
  if (!o) return true;
  return (
    o.mode === 'hitstun' || o.phase === 'recovery' || (role === 'rushdown' && o.move === 'draw')
  );
}

/** The opponent is committed and will not walk away soon (rune / full-draw timing). */
function isCommitted(tg: Target): boolean {
  const o = tg.fighter;
  if (!o) return true;
  return (
    o.mode === 'attack' ||
    o.mode === 'skill' ||
    o.mode === 'hitstun' ||
    o.mode === 'dash' ||
    o.move === 'draw'
  );
}

/** A melee attack or skill of `o` is in startup or active frames. */
function swinging(s: CombatState, o: FighterState): boolean {
  if ((o.mode !== 'attack' && o.mode !== 'skill') || o.move === null || o.phase === 'recovery')
    return false;
  const spec = s.rules.moves[o.move as keyof typeof s.rules.moves] as MoveSpec | undefined;
  return spec?.type === 'melee';
}

function opponentReach(s: CombatState, tg: Target): number {
  const o = tg.fighter;
  if (!o) return 0;
  const atk = s.rules.moves[s.rules.jobs[o.job].attack];
  return atk.type === 'melee' ? atk.reach : 0;
}

/** Point `px` behind the opponent (rushdown flank target), Q8. */
function behind(tg: Target, px: number): [number, number] {
  const o = tg.fighter;
  if (!o) return [tg.x, tg.y];
  const back = (o.facing + 128) & 255;
  return [
    tg.x + Math.round((px * Q * cosQ14(back)) / 16384),
    tg.y + Math.round((px * Q * sinQ14(back)) / 16384),
  ];
}

function meleePlan(
  s: CombatState,
  me: FighterState,
  p: BotParams,
  tg: Target,
  random: () => number,
  o: Out,
): void {
  const kit = s.rules.jobs[me.job];
  const role = JOB_ROLES[me.job];
  const atk = s.rules.moves[kit.attack];
  const skill = s.rules.moves[kit.skill];
  const dash = s.rules.dashes[kit.dash];
  const reach = atk.type === 'melee' ? atk.reach : 48;
  const dist = distPx(me.x, me.y, tg.x, tg.y);
  const surface = dist - tg.r;
  const aim = atan2i(tg.y - me.y, tg.x - me.x);
  const aimMove = moveToward(aim);
  const open = isOpen(tg, role);
  const theirReach = opponentReach(s, tg);
  const spacing = role === 'brawler' ? 0 : p.spacing;
  const poke = role === 'brawler' || role === 'rushdown' ? p.poke * 2 : p.poke;

  // duelist bait: an opponent stepping into reach eats a parry
  const opp = tg.fighter;
  const oppAttack = opp ? s.rules.moves[s.rules.jobs[opp.job].attack] : null;
  if (
    role === 'brawler' &&
    oppAttack?.type === 'shot' &&
    opp?.dashCharges === 0 &&
    me.dashCharges > 0 &&
    surface > 70 &&
    surface < 200
  ) {
    o.move = aimMove;
    o.dash = press(me, BTN_DASH);
    return;
  }
  if (
    role === 'duelist' &&
    opp &&
    canParry(s, me) &&
    oppAttack?.type === 'melee' &&
    oppAttack.parry === 'counter' &&
    surface <= Math.max(reach, theirReach) + 24 &&
    !open &&
    (opp.mode === 'dash' || (opp.mode === 'attack' && opp.phase === 'startup'))
  ) {
    if (random() < (oppAttack.startup <= 4 ? 1 : p.parryRead)) {
      o.move = aimMove;
      o.skill = press(me, BTN_SKILL);
      return;
    }
  }

  if (
    role === 'brawler' &&
    opp?.move === 'parry' &&
    opp.phase !== 'recovery' &&
    surface < reach + 10
  ) {
    o.move = aimMove;
    o.attack = press(me, BTN_ATTACK);
    return;
  }

  if (surface <= reach - 6) {
    o.move = aimMove;
    if (
      skill.type === 'melee' &&
      skill.half >= 128 &&
      surface <= skill.reach - 8 &&
      me.skillCharges > 0 &&
      random() <
        (role === 'brawler' &&
        oppAttack?.type === 'melee' &&
        oppAttack.startup <= 4 &&
        opp &&
        s.rules.dashes[s.rules.jobs[opp.job].dash].charges > 1
          ? 0.2
          : p.skill)
    ) {
      o.skill = press(me, BTN_SKILL);
      return;
    }
    // hit-confirm: only continue a string whose last hit connected
    const confirmed = me.mode !== 'attack' || me.moveHits !== 0;
    if (confirmed && random() < (open ? p.punish : poke)) {
      o.attack = press(me, BTN_ATTACK);
      return;
    }
    if (me.mode !== 'idle' && me.mode !== 'move') return;
    // rushdown hits and runs; others hold ground or step out of the opponent's reach
    if (role === 'rushdown' && !open && random() < 0.08) o.move = bestAway(s, me, tg.x, tg.y);
    else
      o.move =
        theirReach > 0 && role !== 'brawler' && random() < 0.5 ? bestAway(s, me, tg.x, tg.y) : 0;
    return;
  }
  if (
    skill.type === 'shot' &&
    surface > 90 &&
    surface < 420 &&
    me.skillCharges > 0 &&
    random() < p.skill
  ) {
    o.move = aimMove;
    o.skill = press(me, BTN_SKILL);
    return;
  }
  // never walk into a swing that is coming out: wait at the edge and punish the whiff
  if (opp && swinging(s, opp) && surface <= theirReach + 2 * p.spacing) {
    o.move = surface <= theirReach + p.spacing ? bestAway(s, me, tg.x, tg.y) : strafe(s, me, aim);
    return;
  }
  const footsie = theirReach > 0 && surface <= Math.max(reach, theirReach) + spacing;
  if (footsie && !open && reach <= theirReach + 6 && random() >= poke * 3) {
    o.move = strafe(s, me, aim);
    return;
  }
  o.move = aimMove;
  if (role === 'rushdown' && opp && surface < 160) {
    // flank: aim for the opponent's back, and dash through it when a charge is up
    const [bx, by] = behind(tg, 40);
    o.move = moveToward(atan2i(by - me.y, bx - me.x));
    if (
      me.dashCharges > 0 &&
      surface > 30 &&
      surface < 110 &&
      random() < p.gapClose * (open ? 8 : 3)
    ) {
      o.move = aimMove;
      o.dash = press(me, BTN_DASH);
    }
    return;
  }
  const gap = surface > 50 && surface < 120 + dash.fastTicks * dash.fastSpeed;
  const eager = role === 'brawler' ? 2 : 1;
  if (
    !dash.backward &&
    me.dashCharges > 0 &&
    gap &&
    random() < (open ? p.gapClose * 6 : p.gapClose * eager)
  ) {
    o.dash = press(me, BTN_DASH);
  }
}

function rangedPlan(
  s: CombatState,
  me: FighterState,
  p: BotParams,
  tg: Target,
  random: () => number,
  o: Out,
): void {
  const kit = s.rules.jobs[me.job];
  const role = JOB_ROLES[me.job];
  const atk = s.rules.moves[kit.attack];
  const skill = s.rules.moves[kit.skill];
  const dist = distPx(me.x, me.y, tg.x, tg.y);
  const surface = dist - tg.r;
  const aim = atan2i(tg.y - me.y, tg.x - me.x);
  const aimMove = moveToward(aim);
  const oneDashPursuer =
    role === 'zoner' &&
    tg.fighter !== null &&
    s.rules.moves[s.rules.jobs[tg.fighter.job].attack].type === 'melee' &&
    s.rules.jobs[tg.fighter.job].speed > kit.speed &&
    s.rules.jobs[tg.fighter.job].speed <= kit.speed + 30 &&
    s.rules.dashes[s.rules.jobs[tg.fighter.job].dash].charges === 1;
  // a kiter facing another ranged kit backs off to where only its long shots reach
  const oppRanged =
    tg.fighter !== null && s.rules.moves[s.rules.jobs[tg.fighter.job].attack].type !== 'melee';
  const outrange = role === 'kiter' && oppRanged;
  const minD = (outrange ? 420 : 200) * p.rangeScale;
  const maxD = (outrange ? 580 : 340) * p.rangeScale;
  let walk: number;
  if (surface < minD) walk = bestAway(s, me, tg.x, tg.y);
  else if (surface > maxD) walk = aimMove;
  else walk = strafe(s, me, aim);
  o.move = walk;

  if (me.move === 'meteor') {
    o.move = aimMove;
    return;
  }

  if (atk.type === 'draw' && me.move === 'draw') {
    // keep the draw as a level; release for a quick shot when close, hold to full draw when far
    const wantFull = surface > p.quickShotRange || outrange;
    o.attack = wantFull ? me.drawTicks < atk.fullAt : me.drawTicks < atk.quickAt;
    return;
  }
  const incoming = tg.fighter?.move
    ? s.rules.moves[tg.fighter.move as keyof typeof s.rules.moves]
    : null;
  if (
    role === 'zoner' &&
    tg.fighter?.phase === 'startup' &&
    incoming?.type === 'melee' &&
    incoming.startup >= 5 &&
    incoming.startup <= 10 &&
    surface < 140 &&
    me.dashCharges > 0
  ) {
    o.move = strafe(s, me, aim);
    o.dash = press(me, BTN_DASH);
    return;
  }
  const close =
    tg.fighter !== null &&
    surface <
      (oneDashPursuer
        ? 140
        : role === 'zoner' && s.rules.jobs[tg.fighter.job].speed > kit.speed
          ? 160
          : 110);
  if (close && me.dashCharges > 0 && random() < (oneDashPursuer ? 0.75 : p.panicDash)) {
    const dash = s.rules.dashes[kit.dash];
    o.move = dash.backward ? aimMove : bestAway(s, me, tg.x, tg.y);
    o.dash = press(me, BTN_DASH);
    return;
  }
  if (me.mode === 'attack' || me.mode === 'skill' || me.mode === 'hitstun') return;
  if (me.skillCharges > 0) {
    const range =
      skill.type === 'rune'
        ? skill.assistRange
        : skill.type === 'shot'
          ? skill.projectile.range
          : 0;
    // zoner: runes go down where the target is committed (it cannot walk out in time)
    const chance = role === 'zoner' ? (isCommitted(tg) ? p.punish : p.skill * 0.3) : p.skill;
    if (surface < range * 0.9 && random() < chance) {
      o.move = aimMove;
      o.skill = press(me, BTN_SKILL);
      return;
    }
  }
  const range = atk.type === 'shot' ? atk.projectile.range : 520;
  if (oneDashPursuer && tg.fighter?.dashCharges && surface < 200 && !isOpen(tg, role)) return;
  if (surface < range * 0.9 && random() < (isOpen(tg, role) ? p.punish * 0.5 : p.fire)) {
    o.move = aimMove;
    o.attack = press(me, BTN_ATTACK);
  }
}

/** Deterministic per-threat coin: a bot either reacts to a given threat for its whole life or ignores it. */
function commits(key: number, side: Side, chance: number): boolean {
  let h = Math.imul(key ^ (side === 'a' ? 0x9e3779b9 : 0x7f4a7c15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000 < chance;
}

function decideBot(s: CombatState, side: Side, random: () => number, p: BotParams): FighterInput {
  const me = side === 'a' ? s.a : s.b;
  if (!me || me.mode === 'ko' || s.outcome) return NO_INPUT;
  const tg = targetOf(s, me);
  const o: Out = { move: 0, attack: false, skill: false, dash: false };
  if (tg?.fighter?.move === 'whirlwind' && tg.fighter.phase !== 'recovery') {
    const dist = distPx(me.x, me.y, tg.x, tg.y);
    if (dist < 150) {
      const away = bestAway(s, me, tg.x, tg.y);
      return {
        move: away as MoveDir,
        attack: false,
        skill: false,
        dash: dist < 95 && me.dashCharges > 0 && press(me, BTN_DASH),
      };
    }
  }
  let threat: Threat | null = null;
  threat = projectileThreats(s, me, p, threat);
  threat = zoneThreats(s, me, p, threat);
  threat = dragonThreat(s, me, p, threat);
  threat = meleeThreat(s, me, p, threat);
  const drawing = me.move === 'draw';
  // the brawler shrugs off light projectiles (walks through) more often than it sidesteps
  const dodge = JOB_ROLES[me.job] === 'brawler' && threat?.fullShot ? p.dodge * 0.5 : p.dodge;
  if (threat && commits(threat.key, side, dodge)) {
    respond(s, me, p, threat, random, o);
    // keep a held draw while sidestepping; a dodge dash drops it
    if (drawing && !o.dash) o.attack = true;
  } else if (tg) {
    const atk = s.rules.moves[s.rules.jobs[me.job].attack];
    if (atk.type === 'melee') meleePlan(s, me, p, tg, random, o);
    else rangedPlan(s, me, p, tg, random, o);
  }
  const ring = ringGuard(s, me);
  if (ring !== 0 && !o.dash) o.move = ring;
  return {
    move: (o.move >= 0 && o.move <= 8 ? o.move : 0) as MoveDir,
    attack: o.attack,
    skill: o.skill,
    dash: o.dash,
  };
}

/** Scripted, job-aware combat bot for duels and the dragon fight. Stateless: everything comes from the state. */
export function createCombatBot(
  style: BotStyle = 'balanced',
  params: Partial<BotParams> = {},
): CombatPolicy {
  const p: BotParams = { ...BOT_STYLES[style], ...params };
  return {
    id: `combat-bot:${style}`,
    decide: (state, side, random) => decideBot(state, side, random, p),
  };
}

/** Idle dummy (curriculum stage 0 / tests). */
export const IDLE_POLICY: CombatPolicy = { id: 'idle', decide: () => NO_INPUT };
