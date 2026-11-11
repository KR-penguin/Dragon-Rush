import { nextFloat } from '@dragon-rush/engine';
import { dragonHalfHeight, dragonHalfWidth, dragonHurtCircles, circleHit, offsetX, offsetY, shapeHit } from './geometry';
import { hitFighter, type HitDesc } from './hits';
import { angleDiff, atan2i, cosQ14, divRound, isqrt, mulDivTrunc, mulQ14, Q, sinQ14, speedPerTick } from './math';
import type { DragonHitSpec, ManeuverId } from './rules';
import type { DragonSetup, DragonState, Shape } from './types';
import { emit, entityId, pos, shapePx, SLOT_FIREBALL, SLOT_TELEGRAPH, type Ctx, type MDragon } from './work';

const SOUTH = 64;
const PICK_ORDER: readonly ManeuverId[] = ['claw', 'tail', 'volley', 'charge', 'gust', 'dive'];

export function createDragonState(setup: DragonSetup, arenaW: number, anchorY: number, firstIdle: number): DragonState {
  return {
    x: (arenaW / 2) * Q,
    y: anchorY * Q,
    facing: SOUTH,
    hp: setup.hp,
    maxHp: setup.hp,
    atk: setup.atk,
    def: setup.def,
    phase: 1,
    stage: 'idle',
    stageTick: 0,
    stageLen: firstIdle,
    maneuver: null,
    aim: SOUTH,
    tx: 0,
    ty: 0,
    sinceBreath: 0,
    headLowered: 0,
    airborne: false,
    invulnerable: false,
    hitMask: 0,
    volleyLeft: 0,
    queued: null,
    telegraph: null,
    telegraphId: 0,
    softEnraged: false,
  };
}

function rollInt(c: Ctx, n: number): number {
  const [f, rng] = nextFloat(c.s.rng);
  c.s.rng = rng;
  return Math.floor(f * n);
}

function clampDragon(c: Ctx, d: MDragon): boolean {
  const hw = dragonHalfWidth(c.r) * Q;
  const hh = dragonHalfHeight(c.r) * Q;
  const x = Math.min(Math.max(d.x, hw), c.s.arenaW * Q - hw);
  const y = Math.min(Math.max(d.y, hh), c.s.arenaH * Q - hh);
  const clamped = x !== d.x || y !== d.y;
  d.x = x;
  d.y = y;
  return clamped;
}

function headX(c: Ctx, d: MDragon): number {
  return offsetX(d.x, d.facing, c.r.dragon.head.forward);
}

function headY(c: Ctx, d: MDragon): number {
  return offsetY(d.y, d.facing, c.r.dragon.head.forward);
}

function telegraphTicks(c: Ctx, d: MDragon, base: number): number {
  return d.phase >= 2 ? divRound(base * c.r.dragon.p2TelegraphPct, 100) : base;
}

function recoveryTicks(c: Ctx, d: MDragon, base: number): number {
  return d.phase >= 3 ? divRound(base * c.r.dragon.p3RecoveryPct, 100) : base;
}

function enterIdle(c: Ctx, d: MDragon): void {
  const R = c.r.dragon;
  const [lo, hi] = R.idle[d.phase - 1]!;
  let gap = lo + rollInt(c, hi - lo + 1);
  if (d.softEnraged) gap = divRound(gap * R.softEnrageIdleNum, R.softEnrageIdleDen);
  d.stage = 'idle';
  d.stageTick = 0;
  d.stageLen = gap;
  d.maneuver = null;
  d.telegraph = null;
  d.facing = SOUTH;
}

type Band = 'front' | 'side' | 'far';

function bandOf(c: Ctx, d: MDragon): Band {
  const p = c.s.a;
  const B = c.r.dragon.bands;
  const dx = p.x - d.x;
  const dy = p.y - d.y;
  const d2 = dx * dx + dy * dy;
  const front = angleDiff(atan2i(dy, dx), SOUTH) <= B.frontHalf;
  if (front && d2 <= B.frontRange * Q * B.frontRange * Q) return 'front';
  if (!front && d2 <= B.sideRange * Q * B.sideRange * Q) return 'side';
  return 'far';
}

function weightOf(c: Ctx, d: MDragon, band: Band, m: ManeuverId): number {
  if (m === 'gust' && d.phase < 2) return 0;
  if (m === 'dive' && d.phase < 3) return 0;
  const w = c.r.dragon.weights[band] as Readonly<Partial<Record<ManeuverId, number>>>;
  return w[m] ?? 0;
}

function pickManeuver(c: Ctx, d: MDragon): ManeuverId {
  const band = bandOf(c, d);
  let total = 0;
  for (const m of PICK_ORDER) total += weightOf(c, d, band, m);
  if (total <= 0) return 'volley';
  let roll = rollInt(c, total);
  for (const m of PICK_ORDER) {
    const w = weightOf(c, d, band, m);
    if (roll < w) return m;
    roll -= w;
  }
  return 'volley';
}

function arc(x: number, y: number, r: number, dir: number, half: number): Shape {
  return { kind: 'arc', x, y, r, dir, half };
}

function chargeShape(c: Ctx, d: MDragon): Shape {
  return { kind: 'line', x: d.x, y: d.y, dir: d.aim, length: c.s.arenaW + c.s.arenaH, halfWidth: c.r.dragon.charge.halfWidth };
}

function breathHalf(c: Ctx, d: MDragon): number {
  const B = c.r.dragon.breath;
  return B.half + (d.phase >= 2 ? B.sweep : 0);
}

function placeFireball(c: Ctx, d: MDragon, index: number): void {
  const V = c.r.dragon.volley;
  const p = c.s.a;
  const id = entityId(c.s.tick, 'dragon', SLOT_FIREBALL + index);
  c.s.zones.push({
    id,
    owner: 'dragon',
    kind: 'fireball',
    x: p.x,
    y: p.y,
    radius: V.radius,
    arm: V.arm,
    active: V.blast,
    every: 0,
    power: V.hit.power,
    atkNum: d.atk,
    atkDen: 1,
    defDiv: 1,
    knockback: V.hit.knockback,
    hitstun: V.hit.hitstun,
    hitstop: V.hit.hitstop,
    parryable: V.hit.parryable,
    hitMask: 0,
    age: 0,
  });
  emit(c, String(id), {
    type: 'TelegraphStart',
    entity: id,
    kind: 'fireball',
    shape: shapePx({ kind: 'circle', x: p.x, y: p.y, r: V.radius }),
    ticks: V.arm,
  });
}

function startManeuver(c: Ctx, d: MDragon, m: ManeuverId): void {
  const R = c.r.dragon;
  const p = c.s.a;
  const aim = atan2i(p.y - d.y, p.x - d.x);
  d.maneuver = m;
  d.stage = 'telegraph';
  d.stageTick = 0;
  d.hitMask = 0;
  d.telegraphId = entityId(c.s.tick, 'dragon', SLOT_TELEGRAPH);
  d.telegraph = null;
  switch (m) {
    case 'claw':
      d.aim = aim;
      d.facing = aim;
      d.stageLen = telegraphTicks(c, d, R.claw.telegraph);
      d.telegraph = arc(headX(c, d), headY(c, d), R.claw.reach, aim, R.claw.half);
      break;
    case 'tail':
      d.facing = SOUTH;
      d.stageLen = telegraphTicks(c, d, R.tail.telegraph);
      d.telegraph = arc(d.x, d.y, R.tail.reach, (SOUTH + 128) & 255, R.tail.half);
      break;
    case 'volley':
      d.stage = 'active';
      d.volleyLeft = R.volley.count[d.phase - 1]!;
      d.stageLen = (d.volleyLeft - 1) * R.volley.interval + 1;
      placeFireball(c, d, 0);
      d.volleyLeft -= 1;
      break;
    case 'charge':
      d.aim = aim;
      d.facing = aim;
      d.stageLen = telegraphTicks(c, d, R.charge.telegraph);
      d.telegraph = chargeShape(c, d);
      break;
    case 'gust':
      d.stageLen = telegraphTicks(c, d, R.gust.telegraph);
      d.telegraph = { kind: 'circle', x: d.x, y: d.y, r: R.gust.reach };
      break;
    case 'breath':
      d.aim = aim;
      d.facing = aim;
      d.stageLen = R.breath.telegraph[d.phase - 1]!;
      d.telegraph = arc(headX(c, d), headY(c, d), R.breath.reach, aim, breathHalf(c, d));
      break;
    case 'dive':
      d.airborne = true;
      d.invulnerable = true;
      d.tx = p.x;
      d.ty = p.y;
      d.stageLen = R.dive.airborne;
      d.telegraph = { kind: 'circle', x: p.x, y: p.y, r: R.dive.radius };
      break;
  }
  if (m === 'breath') d.sinceBreath = 0;
  else if (m !== 'gust') d.sinceBreath += 1;
  if (d.telegraph) {
    emit(c, String(d.telegraphId), {
      type: 'TelegraphStart',
      entity: d.telegraphId,
      kind: m,
      shape: shapePx(d.telegraph),
      ticks: d.stageLen,
    });
  }
}

function chooseManeuver(c: Ctx, d: MDragon): void {
  let m: ManeuverId;
  if (d.sinceBreath >= c.r.dragon.breathEvery - 1) {
    m = 'breath';
    d.queued = null;
  } else if (d.queued !== null) {
    m = d.queued;
    d.queued = null;
  } else m = pickManeuver(c, d);
  startManeuver(c, d, m);
}

function activeTicks(c: Ctx, m: ManeuverId): number {
  const R = c.r.dragon;
  switch (m) {
    case 'claw':
      return R.claw.active;
    case 'tail':
      return R.tail.active;
    case 'charge':
      return R.charge.maxTicks;
    case 'gust':
      return R.gust.active;
    case 'breath':
      return R.breath.active;
    case 'dive':
      return R.dive.active;
    case 'volley':
      return 1;
  }
}

function beginActive(c: Ctx, d: MDragon, m: ManeuverId): void {
  if (m === 'dive') {
    d.x = d.tx;
    d.y = d.ty;
    clampDragon(c, d);
    d.airborne = false;
    d.invulnerable = false;
    d.facing = SOUTH;
    d.telegraph = { kind: 'circle', x: d.x, y: d.y, r: c.r.dragon.dive.radius };
  }
  const len = activeTicks(c, m);
  if (d.telegraph) {
    emit(c, String(d.telegraphId), {
      type: 'TelegraphEnd',
      entity: d.telegraphId,
      kind: m,
      shape: shapePx(d.telegraph),
      ticks: len,
    });
  }
  d.stage = 'active';
  d.stageTick = 0;
  d.stageLen = len;
  if (m === 'breath') d.aim = sweepAim(c, d, d.facing);
}

function recoveryOf(c: Ctx, m: ManeuverId): number {
  const R = c.r.dragon;
  switch (m) {
    case 'claw':
      return R.claw.recovery;
    case 'tail':
      return R.tail.recovery;
    case 'volley':
      return R.volley.recovery;
    case 'breath':
      return R.breath.recovery;
    case 'dive':
      return R.dive.recovery;
    case 'charge':
    case 'gust':
      return 0;
  }
}

function beginRecovery(c: Ctx, d: MDragon, m: ManeuverId): void {
  d.stage = 'recovery';
  d.stageTick = 0;
  d.stageLen = recoveryTicks(c, d, recoveryOf(c, m));
  d.telegraph = null;
  if (m === 'breath') d.headLowered = d.stageLen;
}

function afterManeuver(c: Ctx, d: MDragon, m: ManeuverId): void {
  if (m === 'gust') {
    d.queued = 'volley';
    chooseManeuver(c, d);
    return;
  }
  if (d.y !== c.r.dragon.anchorY * Q) {
    d.stage = 'returning';
    d.stageTick = 0;
    d.maneuver = null;
    d.facing = SOUTH;
    return;
  }
  enterIdle(c, d);
}

function sweepAim(c: Ctx, d: MDragon, base: number): number {
  const B = c.r.dragon.breath;
  if (d.phase < 2) return base;
  const t = d.stageTick;
  const len = d.stageLen;
  const amp = B.sweep;
  if (d.phase === 2) return (base - amp + divRound(2 * amp * t, len)) & 255;
  // phase 3: there and back
  const half = Math.floor(len / 2);
  const off = t < half ? -amp + divRound(2 * amp * t, half) : amp - divRound(2 * amp * (t - half), len - half);
  return (base + off) & 255;
}

/** One live tick of the dragon's script. Choices use only the seeded RNG in state. */
export function updateDragon(c: Ctx): void {
  const d = c.s.dragon;
  if (!d || d.hp <= 0) return;
  const R = c.r.dragon;
  const p = c.s.a;
  if (!d.softEnraged && c.s.tick >= R.softEnrageTick) d.softEnraged = true;
  if (d.headLowered > 0) d.headLowered -= 1;
  d.stageTick += 1;
  const m = d.maneuver;
  switch (d.stage) {
    case 'idle': {
      d.facing = SOUTH;
      const step = speedPerTick(R.driftSpeed, c.r.tickHz);
      const dx = p.x - d.x;
      d.x += Math.max(-step, Math.min(step, dx));
      clampDragon(c, d);
      if (d.stageTick >= d.stageLen) chooseManeuver(c, d);
      return;
    }
    case 'roar':
      if (d.stageTick >= d.stageLen) {
        d.invulnerable = false;
        d.stage = 'returning';
        d.stageTick = 0;
      }
      return;
    case 'telegraph': {
      if (m === null) return;
      const live = d.stageTick < d.stageLen - (m === 'charge' ? R.charge.lockBefore : m === 'dive' ? R.dive.lockBefore : 0);
      if (m === 'charge' && live) {
        d.aim = atan2i(p.y - d.y, p.x - d.x);
        d.facing = d.aim;
        d.telegraph = chargeShape(c, d);
      } else if (m === 'dive' && live) {
        d.tx = p.x;
        d.ty = p.y;
        d.telegraph = { kind: 'circle', x: p.x, y: p.y, r: R.dive.radius };
      }
      if (d.stageTick >= d.stageLen) beginActive(c, d, m);
      return;
    }
    case 'active': {
      if (m === null) return;
      if (m === 'charge') {
        const step = speedPerTick(R.charge.speed, c.r.tickHz);
        d.x += mulQ14(step, cosQ14(d.aim));
        d.y += mulQ14(step, sinQ14(d.aim));
        if (clampDragon(c, d)) {
          emit(c, 'dragon', { type: 'WallSlam', who: 'dragon', pos: pos(d.x, d.y) });
          d.stage = 'stunned';
          d.stageTick = 0;
          d.stageLen = R.charge.stun;
          d.headLowered = R.charge.stun;
          d.telegraph = null;
          return;
        }
        d.telegraph = chargeShape(c, d);
      } else if (m === 'breath') {
        // the head (facing) stays on the base aim; the cone sweeps around it
        d.aim = sweepAim(c, d, d.facing);
      } else if (m === 'volley' && d.volleyLeft > 0 && d.stageTick % R.volley.interval === 0) {
        const index = R.volley.count[d.phase - 1]! - d.volleyLeft;
        placeFireball(c, d, index);
        d.volleyLeft -= 1;
      }
      if (d.stageTick >= d.stageLen) beginRecovery(c, d, m);
      return;
    }
    case 'recovery':
      if (m !== null && d.stageTick >= d.stageLen) afterManeuver(c, d, m);
      return;
    case 'stunned':
      if (d.stageTick >= d.stageLen) {
        d.stage = 'returning';
        d.stageTick = 0;
        d.maneuver = null;
        d.facing = SOUTH;
      }
      return;
    case 'returning': {
      const step = speedPerTick(R.returnSpeed, c.r.tickHz);
      const tx = d.x;
      const ty = R.anchorY * Q;
      const dx = tx - d.x;
      const dy = ty - d.y;
      const dist = isqrt(dx * dx + dy * dy);
      if (dist <= step) {
        d.x = tx;
        d.y = ty;
        enterIdle(c, d);
      } else {
        d.x += mulDivTrunc(dx, step, dist);
        d.y += mulDivTrunc(dy, step, dist);
      }
      return;
    }
  }
}

function dragonHit(c: Ctx, d: MDragon, kind: ManeuverId, spec: DragonHitSpec, dir: number, defDiv = 1): HitDesc {
  return {
    attacker: 'dragon',
    kind,
    srcId: 0,
    power: spec.power,
    atkNum: d.atk,
    atkDen: 1,
    defDiv,
    fixed: 0,
    knockback: spec.knockback,
    hitstun: spec.hitstun,
    dir,
    hitstop: spec.hitstop,
    parryable: spec.parryable,
    srcX: headX(c, d),
    srcY: headY(c, d),
    rage: false,
    projectile: null,
  };
}

/** Hit phase: the active maneuver's hitbox against the challenger. */
export function dragonHits(c: Ctx): void {
  const d = c.s.dragon;
  if (!d || d.hp <= 0 || d.stage !== 'active' || d.maneuver === null) return;
  const p = c.s.a;
  if (p.mode === 'ko') return;
  const R = c.r.dragon;
  const hurt = c.r.body.hurtRadius;
  const away = atan2i(p.y - d.y, p.x - d.x);
  switch (d.maneuver) {
    case 'claw':
    case 'tail': {
      if (d.hitMask & 1) return;
      const spec = d.maneuver === 'claw' ? R.claw : R.tail;
      const sh: Shape =
        d.maneuver === 'claw'
          ? arc(headX(c, d), headY(c, d), spec.reach, d.aim, spec.half)
          : arc(d.x, d.y, spec.reach, (SOUTH + 128) & 255, spec.half);
      if (shapeHit(sh, p.x, p.y, hurt) && hitFighter(c, p, dragonHit(c, d, d.maneuver, spec.hit, away)) !== 'immune') {
        d.hitMask |= 1;
      }
      return;
    }
    case 'breath': {
      const B = R.breath;
      if (d.stageTick % B.every !== 0) return;
      const sh = arc(headX(c, d), headY(c, d), B.reach, d.aim, B.half);
      const inside = shapeHit(sh, p.x, p.y, hurt);
      emit(c, 'dragon', { type: 'BreathTick', shape: shapePx(sh), hit: inside });
      if (inside) {
        const spec: DragonHitSpec = { power: B.power, knockback: 0, hitstun: 0, hitstop: 0, parryable: false };
        hitFighter(c, p, dragonHit(c, d, 'breath', spec, d.aim, 0));
      }
      return;
    }
    case 'charge': {
      if (d.hitMask & 1) return;
      for (const h of dragonHurtCircles(c.r, d)) {
        if (h.head) continue;
        if (circleHit(h.x, h.y, h.r + 8, p.x, p.y, hurt)) {
          if (hitFighter(c, p, dragonHit(c, d, 'charge', R.charge.hit, away)) !== 'immune') d.hitMask |= 1;
          return;
        }
      }
      return;
    }
    case 'dive': {
      if (d.hitMask & 1) return;
      if (circleHit(d.x, d.y, R.dive.radius, p.x, p.y, hurt)) {
        if (hitFighter(c, p, dragonHit(c, d, 'dive', R.dive.hit, away)) !== 'immune') d.hitMask |= 1;
      }
      return;
    }
    case 'volley':
    case 'gust':
      return;
  }
}

/** Physics: Wing Gust pushes the challenger away (displacement only). */
export function dragonPush(c: Ctx): void {
  const d = c.s.dragon;
  if (!d || d.stage !== 'active' || d.maneuver !== 'gust') return;
  const p = c.s.a;
  if (p.mode === 'ko') return;
  const G = c.r.dragon.gust;
  const dx = p.x - d.x;
  const dy = p.y - d.y;
  if (dx * dx + dy * dy > G.reach * Q * G.reach * Q) return;
  const step = speedPerTick(G.push, c.r.tickHz);
  const dir = atan2i(dy, dx);
  p.x += mulQ14(step, cosQ14(dir));
  p.y += mulQ14(step, sinQ14(dir));
}
