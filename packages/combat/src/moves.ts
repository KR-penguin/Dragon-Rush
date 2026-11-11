import { defDivisorOf, effectiveAtk, fighterHitstop, isRaging } from './damage';
import { offsetX, offsetY } from './geometry';
import {
  angleDiff,
  atan2i,
  cosQ14,
  divRound,
  idiv,
  MOVE_BAM,
  mulQ14,
  Q,
  sinQ14,
  speedPerTick,
} from './math';
import type { DashId, DashSpec, DrawMoveSpec, MoveId, MoveSpec, RuneMoveSpec, ShotMoveSpec } from './rules';
import { BTN_ATTACK, BTN_DASH, BTN_SKILL, type FighterInput, type MoveDir } from './types';
import { emit, entityId, pos, shapePx, SLOT_METEOR, SLOT_SHOT, type Ctx, type MFighter } from './work';

function sanitizeMove(m: unknown): MoveDir {
  return typeof m === 'number' && Number.isInteger(m) && m >= 0 && m <= 8 ? (m as MoveDir) : 0;
}

/** Records levels and rising edges. Buffers age only on live (non-hitstop) ticks. */
export function readInput(c: Ctx, f: MFighter, input: FighterInput | undefined, live: boolean): void {
  if (f.mode === 'ko') return;
  const bits = input
    ? (input.attack === true ? BTN_ATTACK : 0) | (input.skill === true ? BTN_SKILL : 0) | (input.dash === true ? BTN_DASH : 0)
    : 0;
  if (live) {
    if (f.bufAttack > 0) f.bufAttack -= 1;
    if (f.bufSkill > 0) f.bufSkill -= 1;
    if (f.bufDash > 0) f.bufDash -= 1;
  }
  const pressed = bits & ~f.held;
  const buf = c.r.inputBuffer;
  if (pressed & BTN_ATTACK) f.bufAttack = buf;
  if (pressed & BTN_SKILL) f.bufSkill = buf;
  if (pressed & BTN_DASH) f.bufDash = buf;
  f.held = bits;
  f.moveInput = sanitizeMove(input?.move);
}

function tickTimers(c: Ctx, f: MFighter): void {
  if (f.iframeDelay > 0) f.iframeDelay -= 1;
  else if (f.iframes > 0) {
    f.iframes -= 1;
    if (f.iframes === 0) f.invisible = false;
  }
  const kit = c.r.jobs[f.job];
  if (f.skillCharges < kit.skillCharges) {
    f.skillTimer -= 1;
    if (f.skillTimer <= 0) {
      f.skillCharges += 1;
      f.skillTimer = f.skillCharges < kit.skillCharges ? kit.skillCooldown : 0;
    }
  }
  const dash = c.r.dashes[kit.dash];
  if (f.dashCharges < dash.charges) {
    f.dashTimer -= 1;
    if (f.dashTimer <= 0) {
      f.dashCharges += 1;
      f.dashTimer = f.dashCharges < dash.charges ? dash.cooldown : 0;
    }
  }
  if (f.sinceDash < c.r.dashStale.window) f.sinceDash += 1;
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}

function topSpeed(c: Ctx, f: MFighter, pct: number): number {
  return divRound(c.r.jobs[f.job].speed * pct * Q, 100 * c.r.tickHz);
}

/** 8-way locomotion with acceleration (top speed in accelTicks, stop in stopTicks). Never changes facing. */
export function locomote(c: Ctx, f: MFighter, dir: MoveDir, pct: number): void {
  const top = topSpeed(c, f, pct);
  let tvx = 0;
  let tvy = 0;
  if (dir !== 0 && top > 0) {
    const a = MOVE_BAM[dir]!;
    tvx = mulQ14(top, cosQ14(a));
    tvy = mulQ14(top, sinQ14(a));
  }
  const full = topSpeed(c, f, 100);
  const acc = Math.max(1, divRound(full, c.r.accelTicks));
  const dec = Math.max(1, divRound(full, c.r.stopTicks));
  f.vx = approach(f.vx, tvx, tvx !== 0 ? acc : dec);
  f.vy = approach(f.vy, tvy, tvy !== 0 ? acc : dec);
  f.x += f.vx;
  f.y += f.vy;
}

function brake(c: Ctx, f: MFighter): void {
  locomote(c, f, 0, 0);
}

export function moveTotal(spec: MoveSpec): number {
  switch (spec.type) {
    case 'melee':
      return spec.startup + spec.active + spec.recovery;
    case 'parry':
      return spec.startup + spec.active + spec.recovery;
    case 'shot':
    case 'rune':
      return spec.startup + 1 + spec.recovery;
    case 'draw':
      return Number.MAX_SAFE_INTEGER;
  }
}

/** Aim point of the opponent (fighter centre, or the dragon's head while lowered / its centre). */
export function aimTarget(c: Ctx, f: MFighter): { x: number; y: number; r: number } | null {
  const s = c.s;
  if (s.dragon) {
    const d = s.dragon;
    if (d.hp <= 0 || d.airborne) return null;
    if (d.headLowered > 0) {
      const R = c.r.dragon;
      return { x: offsetX(d.x, d.facing, R.head.forward), y: offsetY(d.y, d.facing, R.head.forward), r: R.head.r };
    }
    return { x: d.x, y: d.y, r: c.r.dragon.body[0]?.r ?? 0 };
  }
  const o = f.side === 'a' ? s.b : s.a;
  if (!o || o.mode === 'ko') return null;
  return { x: o.x, y: o.y, r: c.r.body.hurtRadius };
}

/** Soft aim assist: snap to the exact angle when the target is within the cone and 1.5x range. */
export function assistAim(c: Ctx, f: MFighter, range: number): number {
  const t = aimTarget(c, f);
  if (!t) return f.facing;
  const dx = t.x - f.x;
  const dy = t.y - f.y;
  const maxR = (divRound(range * c.r.aimAssist.rangePct, 100) + t.r) * Q;
  if (dx * dx + dy * dy > maxR * maxR) return f.facing;
  const ang = atan2i(dy, dx);
  return angleDiff(ang, f.facing) <= c.r.aimAssist.half ? ang : f.facing;
}

export function startMove(c: Ctx, f: MFighter, id: MoveId, mode: 'attack' | 'skill', announce = true): void {
  const spec = c.r.moves[id];
  f.mode = mode;
  f.move = id;
  f.moveTick = 0;
  f.moveHits = 0;
  f.superArmor = false;
  f.aim = spec.type === 'melee' ? assistAim(c, f, spec.reach) : f.facing;
  if (spec.type === 'draw') {
    f.drawTicks = 0;
    f.drawReleased = (f.held & BTN_ATTACK) === 0;
  }
  if (announce) {
    const key = `${f.side}:${id}`;
    if (mode === 'skill') emit(c, key, { type: 'SkillUsed', who: f.side, skill: id, dir: f.aim, pos: pos(f.x, f.y) });
    else emit(c, key, { type: 'AttackStart', who: f.side, move: id, dir: f.aim, pos: pos(f.x, f.y) });
  }
  runMoveTick(c, f, id, spec);
}

function useAttack(c: Ctx, f: MFighter): void {
  const id = c.r.jobs[f.job].attack;
  const spec = c.r.moves[id];
  if (spec.type === 'draw' && f.nocked) {
    // First Strike: the opening arrow is already fully drawn
    f.nocked = false;
    startMove(c, f, spec.full, 'attack');
    return;
  }
  startMove(c, f, id, 'attack');
}

function useSkill(c: Ctx, f: MFighter): void {
  const kit = c.r.jobs[f.job];
  if (f.skillCharges === kit.skillCharges) f.skillTimer = kit.skillCooldown;
  f.skillCharges -= 1;
  startMove(c, f, kit.skill, 'skill');
}

function startDash(c: Ctx, f: MFighter): void {
  const id = c.r.jobs[f.job].dash;
  const d = c.r.dashes[id];
  let dir: number;
  if (d.backward) dir = (f.facing + 128) & 255;
  else {
    dir = f.moveInput !== 0 ? MOVE_BAM[f.moveInput]! : f.facing;
    f.facing = dir;
  }
  f.mode = 'dash';
  f.move = id;
  f.moveTick = 0;
  f.moveHits = 0;
  f.aim = dir;
  f.phase = 'active';
  f.vx = 0;
  f.vy = 0;
  if (f.dashCharges === d.charges) f.dashTimer = d.cooldown + d.ticks;
  f.dashCharges -= 1;
  const st = c.r.dashStale;
  f.dashStale = f.sinceDash < st.window ? Math.min(f.dashStale + 1, st.max) : 0;
  f.sinceDash = 0;
  const delay = d.iframeFrom - 1 + f.dashStale * st.delay;
  const count = Math.max(0, d.iframeTo - d.iframeFrom + 1 - f.dashStale * st.delay);
  const covered = f.iframeDelay === 0 && f.iframes >= delay + count;
  if (!covered) {
    f.iframeDelay = delay;
    f.iframes = count;
  }
  f.invisible = d.invisible;
  f.superArmor = d.superArmor;
  emit(c, `${f.side}:${id}`, { type: 'Dash', who: f.side, dash: id, dir, pos: pos(f.x, f.y) });
  dashMoveTick(f, d);
}

function dashMoveTick(f: MFighter, d: DashSpec): void {
  const speed = f.moveTick < d.fastTicks ? d.fastSpeed : d.slowSpeed;
  const q = Math.round(speed * Q);
  f.x += mulQ14(q, cosQ14(f.aim));
  f.y += mulQ14(q, sinQ14(f.aim));
}

function advanceDash(c: Ctx, f: MFighter): boolean {
  const d = c.r.dashes[f.move as DashId];
  f.moveTick += 1;
  if (f.moveTick >= d.ticks) {
    f.superArmor = false;
    return true;
  }
  if (d.cancelFrom > 0 && f.moveTick + 1 >= d.cancelFrom && f.bufAttack > 0) {
    f.bufAttack = 0;
    f.superArmor = false;
    useAttack(c, f);
    return false;
  }
  dashMoveTick(f, d);
  return false;
}

function fireShot(c: Ctx, f: MFighter, id: MoveId, spec: ShotMoveSpec): void {
  const p = spec.projectile;
  const aim = assistAim(c, f, p.range);
  f.aim = aim;
  const [atkNum, atkDen] = effectiveAtk(c.r, f);
  const defDiv = defDivisorOf(c.r, f.job);
  const rage = isRaging(f);
  const speed = speedPerTick(p.speed, c.r.tickHz);
  const ttl = idiv(p.range * Q + speed - 1, speed);
  for (let i = 0; i < spec.count; i++) {
    const ang = (aim + Math.trunc(((2 * i - (spec.count - 1)) * spec.spread) / 2)) & 255;
    const off = c.r.body.bodyRadius + p.radius;
    const x = offsetX(f.x, ang, off);
    const y = offsetY(f.y, ang, off);
    const vx = mulQ14(speed, cosQ14(ang));
    const vy = mulQ14(speed, sinQ14(ang));
    const pid = entityId(c.s.tick, f.side, SLOT_SHOT + i);
    c.s.projectiles.push({
      id: pid,
      owner: f.side,
      kind: id,
      x,
      y,
      vx,
      vy,
      angle: ang,
      speed,
      radius: p.radius,
      ttl,
      power: p.hit.power,
      atkNum,
      atkDen,
      defDiv,
      pierce: p.pierce,
      hitMask: 0,
      knockback: p.hit.knockback,
      hitstun: p.hit.hitstun,
      homingLeft: p.homingMax,
      homingPerTick: p.homingPerTick,
      rage,
      reflected: false,
    });
    emit(c, String(pid), {
      type: 'ProjectileSpawn',
      entity: pid,
      owner: f.side,
      kind: id,
      pos: pos(x, y),
      vel: pos(vx, vy),
      radius: p.radius,
    });
  }
}

function placeRune(c: Ctx, f: MFighter, spec: RuneMoveSpec): void {
  const t = aimTarget(c, f);
  let x = offsetX(f.x, f.aim, spec.distance);
  let y = offsetY(f.y, f.aim, spec.distance);
  if (t) {
    const dx = t.x - f.x;
    const dy = t.y - f.y;
    const maxR = (spec.assistRange + t.r) * Q;
    if (dx * dx + dy * dy <= maxR * maxR && angleDiff(atan2i(dy, dx), f.facing) <= c.r.aimAssist.half) {
      x = t.x;
      y = t.y;
    }
  }
  x = Math.min(Math.max(x, 0), c.s.arenaW * Q);
  y = Math.min(Math.max(y, 0), c.s.arenaH * Q);
  const [atkNum, atkDen] = effectiveAtk(c.r, f);
  const id = entityId(c.s.tick, f.side, SLOT_METEOR);
  const zone = {
    id,
    owner: f.side,
    kind: 'meteor' as const,
    x,
    y,
    radius: spec.radius,
    arm: spec.arm,
    active: spec.active,
    every: 0,
    power: spec.hit.power,
    atkNum,
    atkDen,
    defDiv: defDivisorOf(c.r, f.job),
    knockback: spec.hit.knockback,
    hitstun: spec.hit.hitstun,
    hitstop: fighterHitstop(c.r, spec.hit.power, false, isRaging(f)),
    parryable: false,
    hitMask: 0,
    age: 0,
  };
  c.s.zones.push(zone);
  emit(c, String(id), {
    type: 'TelegraphStart',
    entity: id,
    kind: 'meteor',
    shape: shapePx({ kind: 'circle', x, y, r: spec.radius }),
    ticks: spec.arm,
  });
}

function drawTick(c: Ctx, f: MFighter, spec: DrawMoveSpec): void {
  const t = f.moveTick;
  f.drawTicks = t;
  f.phase = 'startup';
  if ((f.held & BTN_ATTACK) === 0) f.drawReleased = true;
  locomote(c, f, f.moveInput, spec.moveSpeedPct);
  if (!f.drawReleased) return;
  if (t >= spec.fullAt) startMove(c, f, spec.full, 'attack', false);
  else if (t >= spec.quickAt) startMove(c, f, spec.quick, 'attack', false);
}

function lungeStep(spec: { lunge: number; active: number }, k: number): number {
  const total = spec.lunge * Q;
  return divRound(total * (k + 1), spec.active) - divRound(total * k, spec.active);
}

/** Per-tick behaviour of a move at f.moveTick (phase, lunge, projectile release, rune placement, armor). */
function runMoveTick(c: Ctx, f: MFighter, id: MoveId, spec: MoveSpec): void {
  const t = f.moveTick;
  switch (spec.type) {
    case 'melee': {
      const activeEnd = spec.startup + spec.active;
      f.phase = t < spec.startup ? 'startup' : t < activeEnd ? 'active' : 'recovery';
      f.superArmor = spec.armorFrom >= 0 && t >= spec.armorFrom && t <= spec.armorTo;
      if (f.phase === 'active' && spec.lunge > 0) {
        const step = lungeStep(spec, t - spec.startup);
        f.x += mulQ14(step, cosQ14(f.aim));
        f.y += mulQ14(step, sinQ14(f.aim));
      }
      if (spec.moveSpeedPct > 0 && f.phase !== 'recovery') locomote(c, f, f.moveInput, spec.moveSpeedPct);
      else brake(c, f);
      if (f.phase === 'recovery' && f.moveInput !== 0) f.facing = MOVE_BAM[f.moveInput]!;
      return;
    }
    case 'shot':
    case 'rune':
      f.phase = t < spec.startup ? 'startup' : t === spec.startup ? 'active' : 'recovery';
      if (t === spec.startup) {
        if (spec.type === 'shot') fireShot(c, f, id, spec);
        else placeRune(c, f, spec);
      }
      brake(c, f);
      if (f.phase === 'recovery' && f.moveInput !== 0) f.facing = MOVE_BAM[f.moveInput]!;
      return;
    case 'parry':
      f.phase = t < spec.startup ? 'startup' : t < spec.startup + spec.active ? 'active' : 'recovery';
      brake(c, f);
      return;
    case 'draw':
      drawTick(c, f, spec);
      return;
  }
}

/** Advances the current attack/skill one tick; returns true when the fighter is free to act this tick. */
function advanceMove(c: Ctx, f: MFighter): boolean {
  const id = f.move as MoveId;
  const spec = c.r.moves[id];
  f.moveTick += 1;
  if (f.moveTick >= moveTotal(spec)) return true;
  if (spec.type === 'melee' && spec.next !== null && f.moveTick >= spec.chainFrom && f.bufAttack > 0) {
    f.bufAttack = 0;
    startMove(c, f, spec.next, 'attack');
    return false;
  }
  runMoveTick(c, f, id, spec);
  return false;
}

function actFree(c: Ctx, f: MFighter): void {
  f.mode = 'idle';
  f.move = null;
  f.moveTick = 0;
  f.phase = 'none';
  f.moveHits = 0;
  f.superArmor = false;
  if (f.moveInput !== 0) f.facing = MOVE_BAM[f.moveInput]!;
  if (f.bufDash > 0 && f.dashCharges > 0) {
    f.bufDash = 0;
    startDash(c, f);
    return;
  }
  if (f.bufSkill > 0 && f.skillCharges > 0) {
    f.bufSkill = 0;
    useSkill(c, f);
    return;
  }
  if (f.bufAttack > 0) {
    f.bufAttack = 0;
    useAttack(c, f);
    return;
  }
  locomote(c, f, f.moveInput, 100);
  f.mode = f.moveInput !== 0 ? 'move' : 'idle';
}

/** One live tick of a fighter's state machine. */
export function updateFighter(c: Ctx, f: MFighter): void {
  if (f.mode === 'ko') return;
  tickTimers(c, f);
  let free = false;
  switch (f.mode) {
    case 'hitstun':
      if (f.hitstun > 0) {
        f.hitstun -= 1;
        brake(c, f);
      } else free = true;
      break;
    case 'attack':
    case 'skill':
      free = advanceMove(c, f);
      break;
    case 'dash':
      free = advanceDash(c, f);
      break;
    default:
      free = true;
  }
  if (free) actFree(c, f);
}
