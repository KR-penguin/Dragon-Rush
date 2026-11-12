import { COMBAT_PASSIVES, computeDamage, dragonScale, isRaging } from './damage';
import { enterPhaseIfNeeded } from './dragonPhase';
import {
  angleDiff,
  atan2i,
  bamToMove,
  cosQ14,
  divRound,
  MOVE_BAM,
  mulQ14,
  Q,
  sinQ14,
} from './math';
import { startMove } from './moves';
import type { ParryMoveSpec } from './rules';
import type { CombatantId, HitKind } from './types';
import {
  emit,
  fighterOf,
  pos,
  type Ctx,
  type MDragon,
  type MFighter,
  type MProjectile,
} from './work';

export interface HitDesc {
  readonly attacker: CombatantId | 'ring';
  readonly kind: HitKind;
  /** Projectile/zone entity id, 0 for melee, maneuvers and the ring (part of the event id). */
  readonly srcId: number;
  /** P in percent. */
  readonly power: number;
  readonly atkNum: number;
  readonly atkDen: number;
  /** 1 = normal, mageDefDivisor = pierce, 0 = ignore DEF. */
  readonly defDiv: number;
  /** > 0: fixed damage that skips the formula (fire ring). */
  readonly fixed: number;
  readonly knockback: number;
  readonly hitstun: number;
  /** Knockback direction (BAM). */
  readonly dir: number;
  /** Hitstop before weak-point / Last Stand adjustments. */
  readonly hitstop: number;
  readonly parryable: boolean;
  /** Where the hit comes from (Q8), for the parry's front check. */
  readonly srcX: number;
  readonly srcY: number;
  readonly rage: boolean;
  /** Power already includes the backstab bonus. */
  readonly backstab: boolean;
  readonly projectile: MProjectile | null;
}

export type HitOutcome = 'hit' | 'parried' | 'evaded' | 'immune';

export function isInvulnerable(f: {
  readonly iframeDelay: number;
  readonly iframes: number;
}): boolean {
  return f.iframeDelay === 0 && f.iframes > 0;
}

function addHitstop(c: Ctx, ticks: number): void {
  if (ticks > c.s.hitstop) c.s.hitstop = ticks;
}

/** Archer First Strike: flat bonus on the first landed hit (after mitigation). */
function takeFirstStrike(c: Ctx, attacker: CombatantId | 'ring'): number {
  if (attacker !== 'a' && attacker !== 'b') return 0;
  const f = fighterOf(c.s, attacker);
  if (!f || !f.firstStrikePending) return 0;
  f.firstStrikePending = false;
  return c.r.passives.archerFirstStrikeBonus;
}

/** Knockback of `distPx` px whose velocity decays linearly to 0 over `ticks`. */
export function setKnockback(f: MFighter, dir: number, distPx: number, ticks: number): void {
  if (distPx <= 0 || ticks <= 0) {
    f.kbLeft = 0;
    return;
  }
  const v0 = divRound(2 * distPx * Q, ticks + 1);
  f.kbx = mulQ14(v0, cosQ14(dir));
  f.kby = mulQ14(v0, sinQ14(dir));
  f.kbLeft = ticks;
  f.kbTotal = ticks;
  f.wallSlammed = false;
}

function cancelMove(f: MFighter): void {
  f.move = null;
  f.moveTick = 0;
  f.phase = 'none';
  f.moveHits = 0;
  f.superArmor = false;
  f.drawTicks = 0;
  f.drawReleased = false;
}

function tryParry(c: Ctx, t: MFighter, h: HitDesc): boolean {
  if (!h.parryable || t.move !== 'parry' || t.phase !== 'active') return false;
  const spec = c.r.moves.parry as ParryMoveSpec;
  const toSrc = atan2i(h.srcY - t.y, h.srcX - t.x);
  if (angleDiff(toSrc, t.facing) > spec.half) return false;
  const attacker = h.attacker === 'ring' ? 'dragon' : h.attacker;
  emit(c, `${t.side}:${h.kind}:${h.srcId}`, {
    type: 'Parry',
    who: t.side,
    attacker,
    kind: h.kind,
    pos: pos(t.x, t.y),
    reflected: h.projectile !== null,
  });
  addHitstop(c, Math.min(c.r.hitstop.parry, c.r.hitstop.cap));
  // the counter-slash turns toward whoever was parried (aim assist then snaps to the exact angle)
  t.facing = MOVE_BAM[bamToMove(toSrc)]!;
  if (spec.refundOnParry && h.attacker !== 'dragon') {
    t.skillCharges = c.r.jobs[t.job].skillCharges;
    t.skillTimer = 0;
  }
  // a parried melee attacker reels unless it is in super armor (armor is how the berserker beats parry)
  const a =
    h.projectile === null && (h.attacker === 'a' || h.attacker === 'b')
      ? fighterOf(c.s, h.attacker)
      : null;
  if (a && a.mode !== 'ko' && !a.superArmor && spec.stagger > 0) {
    cancelMove(a);
    a.mode = 'hitstun';
    a.hitstun = spec.stagger;
    a.kbLeft = 0;
  }
  startMove(c, t, spec.counter, 'attack');
  return true;
}

/** Resolves one damage instance on a fighter: i-frames, parry, evade, damage, Last Stand, knockback, rage. */
export function hitFighter(c: Ctx, t: MFighter, h: HitDesc): HitOutcome {
  if (t.mode === 'ko' || t.hp <= 0 || isInvulnerable(t)) return 'immune';
  if (tryParry(c, t, h)) return 'parried';
  const r = c.r;
  const key = `${h.attacker}:${t.side}:${h.kind}:${h.srcId}`;
  if (COMBAT_PASSIVES[t.job].evade) {
    t.evadeCounter += 1;
    if (t.evadeCounter >= r.passives.ninjaEvadeEvery) {
      t.evadeCounter = 0;
      emit(c, key, {
        type: 'Evade',
        who: t.side,
        attacker: h.attacker,
        kind: h.kind,
        pos: pos(t.x, t.y),
      });
      return 'evaded';
    }
  }
  let dmg = h.fixed > 0 ? h.fixed : computeDamage(r, h.power, h.atkNum, h.atkDen, t.def, h.defDiv);
  const flat = takeFirstStrike(c, h.attacker);
  dmg += flat;
  let hitstop = Math.min(h.hitstop, r.hitstop.cap);
  if (t.hp - dmg <= 0 && t.lastStandAvailable) {
    t.hp = 1;
    t.lastStandAvailable = false;
    t.lastStandUsed = true;
    t.iframeDelay = 0;
    t.iframes = r.passives.lastStandIframes;
    // the only hitstop allowed above the cap
    hitstop = r.hitstop.lastStand;
    emit(c, t.side, { type: 'LastStand', who: t.side, pos: pos(t.x, t.y) });
  } else {
    t.hp -= dmg;
  }
  // a backstab breaks super armor: the rushdown's answer to armored brawlers
  const flinch = (!t.superArmor || h.backstab) && t.hp > 0 && h.hitstun > 0;
  if (flinch) {
    cancelMove(t);
    t.mode = 'hitstun';
    t.hitstun = h.hitstun;
    setKnockback(t, h.dir, h.knockback, h.hitstun);
  }
  if (!t.raging && isRaging(t)) {
    t.raging = true;
    emit(c, t.side, { type: 'RageOn', who: t.side });
  }
  emit(c, key, {
    type: 'Hit',
    attacker: h.attacker,
    target: t.side,
    dmg,
    kind: h.kind,
    dir: h.dir,
    pos: pos(t.x, t.y),
    hpAfter: t.hp,
    knockback: flinch ? h.knockback : 0,
    hitstun: flinch ? h.hitstun : 0,
    hitstop,
    weakPoint: false,
    firstStrike: flat > 0,
    rage: h.rage,
    pierce: h.defDiv > 1,
    backstab: h.backstab,
  });
  addHitstop(c, hitstop);
  return 'hit';
}

/** Resolves one damage instance on the dragon (always super armor; head is a weak point while lowered). */
export function hitDragon(
  c: Ctx,
  d: MDragon,
  h: HitDesc,
  head: boolean,
  x: number,
  y: number,
): HitOutcome {
  if (d.hp <= 0 || d.invulnerable || d.airborne) return 'immune';
  const r = c.r;
  const weak = head && d.headLowered > 0;
  // full-formula damage (min 1, weak point x3/2, flat bonus), then dragonDamageTakenScale in 1/1000 HP so a
  // low scale keeps every stat point meaningful instead of rounding all small hits to the minimum
  const base = computeDamage(
    r,
    h.power,
    h.atkNum,
    h.atkDen,
    d.def,
    h.defDiv,
    weak ? r.dragon.weakPointNum : 1,
    weak ? r.dragon.weakPointDen : 1,
  );
  const flat = takeFirstStrike(c, h.attacker);
  const [sn, sd] = dragonScale(r);
  const chip = d.chip + divRound((base + flat) * 1000 * sn, sd);
  const dmg = Math.floor(chip / 1000);
  d.chip = chip - dmg * 1000;
  d.hp -= dmg;
  const hitstop = Math.min(h.hitstop + (weak ? r.hitstop.weakPointBonus : 0), r.hitstop.cap);
  emit(c, `${h.attacker}:dragon:${h.kind}:${h.srcId}`, {
    type: 'Hit',
    attacker: h.attacker,
    target: 'dragon',
    dmg,
    kind: h.kind,
    dir: h.dir,
    pos: pos(x, y),
    hpAfter: d.hp,
    knockback: 0,
    hitstun: 0,
    hitstop,
    weakPoint: weak,
    firstStrike: flat > 0,
    rage: h.rage,
    pierce: h.defDiv > 1,
    backstab: false,
  });
  addHitstop(c, hitstop);
  if (d.hp > 0) enterPhaseIfNeeded(c, d);
  return 'hit';
}

/** hitMask bit per combatant. */
export function targetBit(id: CombatantId): number {
  return id === 'a' ? 1 : id === 'b' ? 2 : 4;
}
