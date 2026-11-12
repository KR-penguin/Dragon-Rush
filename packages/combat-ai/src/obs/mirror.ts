import { CACT_MOVE_DIM, mirrorMove, type Mirror } from '../codec/actions';
import { COBS_DIM, O, THREAT_SLOTS, THREAT_WIDTH } from './layout';

function indices(axis: 'x' | 'y'): number[] {
  // [sin, cos] pairs: an x flip (theta -> pi - theta) negates cos, a y flip (theta -> -theta) negates sin
  const x = axis === 'x';
  const out = [
    O.selfVel + (x ? 0 : 1),
    O.selfFacing + (x ? 1 : 0),
    O.selfPos + (x ? 0 : 1),
    O.oppRel + (x ? 0 : 1),
    O.oppMotion + (x ? 0 : 1),
    O.oppMotion + (x ? 3 : 2),
    O.dragonAim + (x ? 1 : 0),
  ];
  for (let k = 0; k < THREAT_SLOTS; k++) {
    const at = O.threats + k * THREAT_WIDTH;
    out.push(at + (x ? 3 : 4), at + (x ? 5 : 6));
  }
  return out;
}

const NEGATE_X: readonly number[] = indices('x');
const NEGATE_Y: readonly number[] = indices('y');

/**
 * Mirror augmentation on an encoded cobs_v1 vector: reflects every signed x (and/or y) feature and permutes the
 * previous-move one-hot. An involution; `encodeCombatObservation(s, side, { ...ctx, mirror })` equals
 * `mirrorCombatObservation(encodeCombatObservation(s, side, ctx), mirror)`.
 */
export function mirrorCombatObservation(
  obs: Float32Array,
  mirror: Mirror,
  out?: Float32Array,
): Float32Array {
  if (obs.length !== COBS_DIM) throw new RangeError(`obs must have length ${COBS_DIM}`);
  const o = out ?? new Float32Array(COBS_DIM);
  if (o !== obs) o.set(obs);
  if (mirror.x) for (const i of NEGATE_X) o[i] = o[i] === 0 ? 0 : -o[i]!;
  if (mirror.y) for (const i of NEGATE_Y) o[i] = o[i] === 0 ? 0 : -o[i]!;
  if (mirror.x || mirror.y) {
    const prev = obs.slice(O.gPrevMove, O.gPrevMove + CACT_MOVE_DIM);
    for (let m = 0; m < CACT_MOVE_DIM; m++) o[O.gPrevMove + mirrorMove(m, mirror)] = prev[m]!;
  }
  return o;
}
