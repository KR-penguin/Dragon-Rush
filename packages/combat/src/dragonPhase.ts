import { emit, shapePx, type Ctx, type MDragon } from './work';

/** Phase from HP: P1 above phase2Pct, P2 down to phase3Pct, then P3. */
export function phaseForHp(c: Ctx, hp: number, maxHp: number): 1 | 2 | 3 {
  const R = c.r.dragon;
  if (hp * 100 <= R.phase3Pct * maxHp) return 3;
  if (hp * 100 <= R.phase2Pct * maxHp) return 2;
  return 1;
}

/**
 * On crossing a phase threshold the dragon roars: the current maneuver is cancelled, it is invulnerable for
 * roarTicks, and every projectile and ground hazard is cleared at the end of the tick.
 */
export function enterPhaseIfNeeded(c: Ctx, d: MDragon): void {
  const want = phaseForHp(c, d.hp, d.maxHp);
  if (want <= d.phase) return;
  d.phase = want;
  if (d.telegraph !== null && d.maneuver !== null && d.stage === 'telegraph') {
    emit(c, String(d.telegraphId), {
      type: 'TelegraphEnd',
      entity: d.telegraphId,
      kind: d.maneuver,
      shape: shapePx(d.telegraph),
      ticks: 0,
    });
  }
  d.telegraph = null;
  d.maneuver = null;
  d.airborne = false;
  d.queued = null;
  d.volleyLeft = 0;
  d.hitMask = 0;
  d.stage = 'roar';
  d.stageTick = 0;
  d.stageLen = c.r.dragon.roarTicks;
  d.invulnerable = true;
  c.clearHazards = true;
  emit(c, String(want), { type: 'PhaseChange', phase: want === 3 ? 3 : 2 });
}
