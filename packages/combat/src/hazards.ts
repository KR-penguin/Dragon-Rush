import { defDivisorOf, effectiveAtk, isRaging } from './damage';
import { circleHit, dragonHurtCircles } from './geometry';
import { hitDragon, hitFighter, targetBit, type HitDesc, type HitOutcome } from './hits';
import { angleDelta, atan2i, cosQ14, divRound, mulQ14, Q, sinQ14, speedPerTick } from './math';
import type { CombatantId } from './types';
import {
  emit,
  entityId,
  pos,
  shapePx,
  SLOT_FLOOR,
  type Ctx,
  type MFighter,
  type MProjectile,
  type MZone,
} from './work';

/** Opponent fighter of an owner, if any (the dragon's opponent is always fighter a). */
function opposingFighter(c: Ctx, owner: CombatantId): MFighter | null {
  const s = c.s;
  if (owner === 'dragon') return s.a;
  if (owner === 'a') return s.b;
  return s.a;
}

function targetsDragon(c: Ctx, owner: CombatantId): boolean {
  return owner !== 'dragon' && c.s.dragon !== null;
}

function projectileDesc(c: Ctx, p: MProjectile): HitDesc {
  return {
    attacker: p.owner,
    kind: p.kind,
    srcId: p.id,
    power: p.power,
    atkNum: p.atkNum,
    atkDen: p.atkDen,
    defDiv: p.defDiv,
    fixed: 0,
    knockback: p.knockback,
    hitstun: p.hitstun,
    dir: p.angle,
    hitstop: projectileHitstop(c, p),
    parryable: projectileParryable(c, p),
    srcX: p.x - p.vx,
    srcY: p.y - p.vy,
    rage: p.rage,
    backstab: false,
    projectile: p,
    armorBreak: false,
  };
}

function projectileHitstop(c: Ctx, p: MProjectile): number {
  const h = c.r.hitstop;
  const multi = p.kind === 'volley';
  const base = multi
    ? h.multiHit
    : p.power <= h.lightMaxPower
      ? h.light
      : p.power >= h.heavyMinPower
        ? h.heavy
        : h.normal;
  return base + (p.rage ? h.rageBonus : 0);
}

/** Parry reflection: the projectile flies back as the parrying fighter's, with the parry's reflect power. */
function reflect(c: Ctx, p: MProjectile, by: MFighter): void {
  const [atkNum, atkDen] = effectiveAtk(c.r, by);
  const spec = c.r.moves.parry;
  p.owner = by.side;
  p.angle = (p.angle + 128) & 255;
  p.vx = -p.vx;
  p.vy = -p.vy;
  p.power = spec.type === 'parry' ? Math.round((p.power * spec.reflectPower) / 100) : p.power;
  p.atkNum = atkNum;
  p.atkDen = atkDen;
  p.defDiv = defDivisorOf(c.r, by.job);
  p.pierce = false;
  p.rage = isRaging(by);
  p.hitMask = targetBit(by.side);
  p.homingLeft = 0;
  p.reflected = true;
}

function projectileParryable(c: Ctx, p: MProjectile): boolean {
  const spec = c.r.moves[p.kind];
  return spec.type !== 'shot' || spec.projectile.parryable;
}

function projectileReflectable(c: Ctx, p: MProjectile): boolean {
  const spec = c.r.moves[p.kind];
  return spec.type !== 'shot' || spec.projectile.reflectable;
}

function homingTarget(c: Ctx, p: MProjectile): { x: number; y: number } | null {
  if (targetsDragon(c, p.owner)) {
    const d = c.s.dragon;
    return d && !d.airborne && d.hp > 0 ? { x: d.x, y: d.y } : null;
  }
  const t = opposingFighter(c, p.owner);
  return t && t.mode !== 'ko' ? { x: t.x, y: t.y } : null;
}

/** Moves one projectile and resolves its hits; returns false when it is removed. */
function stepProjectile(c: Ctx, p: MProjectile): boolean {
  if (p.homingLeft > 0) {
    const t = homingTarget(c, p);
    if (t) {
      const delta = angleDelta(p.angle, atan2i(t.y - p.y, t.x - p.x));
      if (delta !== 0) {
        const turn = Math.min(p.homingPerTick, p.homingLeft, Math.abs(delta));
        p.angle = (p.angle + (delta > 0 ? turn : -turn)) & 255;
        p.homingLeft -= turn;
        p.vx = mulQ14(p.speed, cosQ14(p.angle));
        p.vy = mulQ14(p.speed, sinQ14(p.angle));
      }
    }
  }
  p.x += p.vx;
  p.y += p.vy;
  p.ttl -= 1;
  const s = c.s;
  if (p.x < 0 || p.y < 0 || p.x > s.arenaW * Q || p.y > s.arenaH * Q) {
    emit(c, String(p.id), {
      type: 'ProjectileEnd',
      entity: p.id,
      reason: 'wall',
      pos: pos(p.x, p.y),
    });
    return false;
  }
  if (p.ttl <= 0) {
    emit(c, String(p.id), {
      type: 'ProjectileEnd',
      entity: p.id,
      reason: 'expired',
      pos: pos(p.x, p.y),
    });
    return false;
  }
  let out: HitOutcome | null = null;
  let bit = 0;
  if (targetsDragon(c, p.owner)) {
    const d = s.dragon!;
    bit = targetBit('dragon');
    if (!(p.hitMask & bit)) {
      for (const h of dragonHurtCircles(c.r, d)) {
        if (circleHit(p.x, p.y, p.radius, h.x, h.y, h.r)) {
          out = hitDragon(c, d, projectileDesc(c, p), h.head, p.x, p.y);
          break;
        }
      }
    }
  } else {
    const t = opposingFighter(c, p.owner);
    if (t && t.mode !== 'ko') {
      bit = targetBit(t.side);
      if (!(p.hitMask & bit) && circleHit(p.x, p.y, p.radius, t.x, t.y, c.r.body.hurtRadius)) {
        out = hitFighter(c, t, projectileDesc(c, p));
        if (out === 'parried') {
          if (projectileReflectable(c, p)) {
            reflect(c, p, t);
            return true;
          }
          emit(c, String(p.id), {
            type: 'ProjectileEnd',
            entity: p.id,
            reason: 'parried',
            pos: pos(p.x, p.y),
          });
          return false;
        }
      }
    }
  }
  if (out === null || out === 'immune') return true;
  p.hitMask |= bit;
  if (p.pierce) return true;
  emit(c, String(p.id), { type: 'ProjectileEnd', entity: p.id, reason: 'hit', pos: pos(p.x, p.y) });
  return false;
}

export function updateProjectiles(c: Ctx): void {
  const list = c.s.projectiles;
  if (list.length === 0) return;
  const kept: MProjectile[] = [];
  for (const p of list) if (stepProjectile(c, p)) kept.push(p);
  const cleared = new Set<number>();
  for (const shot of kept) {
    const shotMove = c.r.moves[shot.kind];
    if (shotMove.type !== 'shot' || !shotMove.projectile.cancelsProjectiles) continue;
    for (const other of kept) {
      if (other.owner === shot.owner || (other.kind !== 'bolt' && other.kind !== 'kunai')) continue;
      const dx = shot.x - shot.vx - (other.x - other.vx);
      const dy = shot.y - shot.vy - (other.y - other.vy);
      const vx = shot.vx - other.vx;
      const vy = shot.vy - other.vy;
      const den = vx * vx + vy * vy;
      const t =
        den === 0 ? 0 : Math.max(0, Math.min(256, divRound(-(dx * vx + dy * vy) * 256, den)));
      const cx = dx + divRound(vx * t, 256);
      const cy = dy + divRound(vy * t, 256);
      const radius = (shot.radius + other.radius) * Q;
      if (cx * cx + cy * cy <= radius * radius) cleared.add(other.id);
    }
  }
  c.s.projectiles = kept.filter((p) => {
    if (!cleared.has(p.id)) return true;
    emit(c, String(p.id), {
      type: 'ProjectileEnd',
      entity: p.id,
      reason: 'cleared',
      pos: pos(p.x, p.y),
    });
    return false;
  });
}

function zoneDesc(c: Ctx, z: MZone, dir: number): HitDesc {
  return {
    attacker: z.owner,
    kind: z.kind,
    srcId: z.id,
    power: z.power,
    atkNum: z.atkNum,
    atkDen: z.atkDen,
    defDiv: z.defDiv,
    fixed: 0,
    knockback: z.knockback,
    hitstun: z.hitstun,
    dir,
    hitstop: z.hitstop,
    parryable: z.parryable,
    srcX: z.x,
    srcY: z.y,
    rage: false,
    backstab: false,
    projectile: null,
    armorBreak:
      z.kind === 'meteor' && c.r.moves.meteor.type === 'rune' && c.r.moves.meteor.armorBreak,
  };
}

function zoneHits(c: Ctx, z: MZone, dot: boolean): void {
  if (targetsDragon(c, z.owner)) {
    const d = c.s.dragon!;
    const bit = targetBit('dragon');
    if (!dot && z.hitMask & bit) return;
    for (const h of dragonHurtCircles(c.r, d)) {
      if (circleHit(z.x, z.y, z.radius, h.x, h.y, h.r)) {
        if (hitDragon(c, d, zoneDesc(c, z, 0), h.head, h.x, h.y) !== 'immune') z.hitMask |= bit;
        return;
      }
    }
    return;
  }
  const t = opposingFighter(c, z.owner);
  if (!t || t.mode === 'ko') return;
  const bit = targetBit(t.side);
  if (!dot && z.hitMask & bit) return;
  if (!circleHit(z.x, z.y, z.radius, t.x, t.y, c.r.body.hurtRadius)) return;
  const dir = atan2i(t.y - z.y, t.x - z.x);
  const outcome = hitFighter(c, t, zoneDesc(c, z, dir));
  if (outcome !== 'immune') z.hitMask |= bit;
  if (outcome === 'parried' && z.kind === 'fireball' && c.s.dragon) {
    const [atkNum, atkDen] = effectiveAtk(c.r, t);
    hitDragon(
      c,
      c.s.dragon,
      {
        ...zoneDesc(c, z, 0),
        attacker: t.side,
        power: 100,
        atkNum,
        atkDen,
        defDiv: defDivisorOf(c.r, t.job),
        parryable: false,
      },
      false,
      c.s.dragon.x,
      c.s.dragon.y,
    );
  }
}

function stepZone(c: Ctx, z: MZone, spawned: MZone[]): boolean {
  z.age += 1;
  if (z.arm > 0) {
    z.arm -= 1;
    if (z.arm > 0) return true;
    if (z.kind !== 'burningFloor') {
      emit(c, String(z.id), {
        type: 'TelegraphEnd',
        entity: z.id,
        kind: z.kind,
        shape: shapePx({ kind: 'circle', x: z.x, y: z.y, r: z.radius }),
        ticks: z.active,
      });
    }
  }
  if (z.every > 0) {
    if (z.age % z.every === 0) zoneHits(c, z, true);
  } else zoneHits(c, z, false);
  z.active -= 1;
  if (z.active > 0) return true;
  const d = c.s.dragon;
  const V = c.r.dragon.volley;
  if (z.kind === 'fireball' && d && d.phase >= V.floorFromPhase) {
    spawned.push({
      id: entityId(c.s.tick, 'dragon', SLOT_FLOOR),
      owner: 'dragon',
      kind: 'burningFloor',
      x: z.x,
      y: z.y,
      radius: z.radius,
      arm: 0,
      active: V.floorTicks,
      every: V.floorEvery,
      power: V.floorPower,
      atkNum: z.atkNum,
      atkDen: z.atkDen,
      defDiv: 1,
      knockback: 0,
      hitstun: 0,
      hitstop: 0,
      parryable: false,
      hitMask: 0,
      age: 0,
    });
  }
  return false;
}

export function updateZones(c: Ctx): void {
  const list = c.s.zones;
  if (list.length === 0) return;
  const kept: MZone[] = [];
  const spawned: MZone[] = [];
  for (const z of list) if (stepZone(c, z, spawned)) kept.push(z);
  for (const z of spawned) kept.push(z);
  c.s.zones = kept;
}

/** Duel fire ring radius (px) at a tick: shrinks linearly from startTick to endTick, then holds. */
export function ringRadiusAt(c: Ctx, tick: number): number {
  const R = c.r.ring;
  if (tick <= R.startTick) return R.startRadius;
  if (tick >= R.endTick) return R.endRadius;
  return (
    R.startRadius -
    divRound((R.startRadius - R.endRadius) * (tick - R.startTick), R.endTick - R.startTick)
  );
}

/** Fire ring: outside it a fighter is pushed inward and burns for fixed damage (ignores DEF) at most every `every` ticks. */
export function ringTick(c: Ctx): void {
  const s = c.s;
  if (s.kind !== 'duel') return;
  const R = c.r.ring;
  const cx = (s.arenaW / 2) * Q;
  const cy = (s.arenaH / 2) * Q;
  const rq = s.ringRadius * Q;
  const push = speedPerTick(R.push, c.r.tickHz);
  for (const f of [s.a, s.b]) {
    if (!f || f.mode === 'ko') continue;
    const dx = f.x - cx;
    const dy = f.y - cy;
    // the burn cooldown keeps running inside the ring, so hugging the edge (pushed in, drifting out) still burns
    if (dx * dx + dy * dy <= rq * rq) {
      if (f.ringTimer > 0) f.ringTimer -= 1;
      continue;
    }
    const inward = atan2i(-dy, -dx);
    f.x += mulQ14(push, cosQ14(inward));
    f.y += mulQ14(push, sinQ14(inward));
    if (f.ringTimer > 0) {
      f.ringTimer -= 1;
      continue;
    }
    f.ringTimer = R.every;
    hitFighter(c, f, {
      attacker: 'ring',
      kind: 'ring',
      srcId: 0,
      power: 0,
      atkNum: 0,
      atkDen: 1,
      defDiv: 0,
      fixed: R.damage,
      knockback: 0,
      hitstun: 0,
      dir: inward,
      hitstop: 0,
      parryable: false,
      srcX: cx,
      srcY: cy,
      rage: false,
      backstab: false,
      projectile: null,
    });
  }
}

/** Dragon phase change: every projectile and ground hazard is cleared. */
export function clearHazards(c: Ctx): void {
  for (const p of c.s.projectiles) {
    emit(c, String(p.id), {
      type: 'ProjectileEnd',
      entity: p.id,
      reason: 'cleared',
      pos: pos(p.x, p.y),
    });
  }
  for (const z of c.s.zones) {
    if (z.arm > 0 && z.kind !== 'burningFloor') {
      emit(c, String(z.id), {
        type: 'TelegraphEnd',
        entity: z.id,
        kind: z.kind,
        shape: shapePx({ kind: 'circle', x: z.x, y: z.y, r: z.radius }),
        ticks: 0,
      });
    }
  }
  c.s.projectiles = [];
  c.s.zones = [];
}
