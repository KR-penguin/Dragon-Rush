import { defDivisorOf, effectiveAtk, fighterHitstop, isRaging } from './damage';
import { arcHit, circleHit, dragonHurtCircles } from './geometry';
import { hitDragon, hitFighter, type HitDesc } from './hits';
import { angleDiff, atan2i } from './math';
import type { DashId, HitSpec, MoveId } from './rules';
import type { FighterState, HitKind } from './types';
import type { Ctx, MFighter } from './work';

/** A melee hitbox that overlaps its target this tick, gathered before any hit is applied. */
interface Intent {
  readonly f: FighterState;
  readonly bit: number;
  readonly kind: HitKind;
  readonly hit: HitSpec;
  readonly multi: boolean;
  /** Dragon circle that was hit (head = weak point), or null for the fighter opponent. */
  readonly dragonCircle: { readonly x: number; readonly y: number; readonly head: boolean } | null;
}

function overlap(
  c: Ctx,
  f: MFighter,
  test: (tx: number, ty: number, tr: number) => boolean,
): { hit: boolean; circle: Intent['dragonCircle'] } {
  const d = c.s.dragon;
  if (d) {
    if (d.hp <= 0) return { hit: false, circle: null };
    for (const h of dragonHurtCircles(c.r, d)) {
      if (test(h.x, h.y, h.r)) return { hit: true, circle: { x: h.x, y: h.y, head: h.head } };
    }
    return { hit: false, circle: null };
  }
  const o = f.side === 'a' ? c.s.b : c.s.a;
  if (!o || o.mode === 'ko') return { hit: false, circle: null };
  return { hit: test(o.x, o.y, c.r.body.hurtRadius), circle: null };
}

function intentOf(c: Ctx, f: MFighter): Intent | null {
  if (f.mode === 'ko' || f.move === null) return null;
  if (f.mode === 'dash') {
    const dash = c.r.dashes[f.move as DashId];
    if (!dash.contact || f.moveHits & 1) return null;
    const reach = c.r.body.bodyRadius + dash.contactReach;
    const o = overlap(c, f, (tx, ty, tr) => circleHit(f.x, f.y, reach, tx, ty, tr));
    return o.hit
      ? {
          f: { ...f },
          bit: 1,
          kind: f.move as DashId,
          hit: dash.contact,
          multi: false,
          dragonCircle: o.circle,
        }
      : null;
  }
  if ((f.mode !== 'attack' && f.mode !== 'skill') || f.phase !== 'active') return null;
  const spec = c.r.moves[f.move as MoveId];
  if (spec.type !== 'melee') return null;
  const idx = Math.floor((f.moveTick - spec.startup) / spec.hitEvery);
  if (idx >= spec.hits || f.moveHits & (1 << idx)) return null;
  const o = overlap(c, f, (tx, ty, tr) =>
    arcHit(f.x, f.y, spec.reach, f.aim, spec.half, tx, ty, tr),
  );
  if (!o.hit) return null;
  return {
    f: { ...f },
    bit: 1 << idx,
    kind: f.move as MoveId,
    hit: spec.hit,
    multi: spec.hits > 1,
    dragonCircle: o.circle,
  };
}

function apply(c: Ctx, it: Intent): void {
  const f = it.f;
  const [atkNum, atkDen] = effectiveAtk(c.r, f);
  const rage = isRaging(f);
  const base: Omit<HitDesc, 'dir'> = {
    attacker: f.side,
    kind: it.kind,
    srcId: 0,
    power: it.hit.power,
    atkNum,
    atkDen,
    defDiv: defDivisorOf(c.r, f.job),
    fixed: 0,
    knockback: it.hit.knockback,
    hitstun: it.hit.hitstun,
    hitstop: fighterHitstop(c.r, it.hit.power, it.multi, rage),
    parryable: f.move !== 'shoulderCharge',
    srcX: f.x,
    srcY: f.y,
    rage,
    backstab: false,
    projectile: null,
    armorBreak: f.move === 'meteor',
  };
  let out;
  if (it.dragonCircle && c.s.dragon) {
    const dc = it.dragonCircle;
    out = hitDragon(
      c,
      c.s.dragon,
      { ...base, dir: atan2i(dc.y - f.y, dc.x - f.x) },
      dc.head,
      dc.x,
      dc.y,
    );
  } else {
    const o = f.side === 'a' ? c.s.b : c.s.a;
    if (!o) return;
    const dir = atan2i(o.y - f.y, o.x - f.x);
    // backstab: the blow travels along the target's facing, i.e. it comes from behind
    const pct = c.r.jobs[f.job].backstabPct;
    const backstab = pct > 100 && angleDiff(dir, o.facing) <= c.r.backstabHalf;
    const power = backstab ? Math.round((base.power * pct) / 100) : base.power;
    out = hitFighter(c, o, { ...base, power, backstab, dir });
  }
  if (out !== 'immune') {
    const source = f.side === 'a' ? c.s.a : c.s.b;
    if (source) source.moveHits |= it.bit;
  }
}

/**
 * Melee and shoulder-charge hits. Both fighters' hitboxes are gathered first and then applied, so a trade
 * on the same tick lands for both sides regardless of who is 'a'.
 */
export function meleeHits(c: Ctx): void {
  const ia = intentOf(c, c.s.a);
  const ib = c.s.b ? intentOf(c, c.s.b) : null;
  if (ia) apply(c, ia);
  if (ib) apply(c, ib);
}
