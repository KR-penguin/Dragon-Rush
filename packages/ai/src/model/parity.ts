import { ACTION_DIM } from '../codec/actions';
import type { PolicyModel } from '../policy';

/** One reference sample produced by the user's numpy implementation. */
export interface ParitySample {
  readonly obs: readonly number[];
  readonly mask?: readonly boolean[];
  /** Raw actor output (before masking), length ACTION_DIM. */
  readonly actor: readonly number[];
  readonly value?: number;
}

export interface ParityTolerance {
  readonly abs: number;
  readonly rel: number;
}

export interface ParityReport {
  readonly samples: number;
  readonly maxAbsError: number;
  readonly argmaxMismatches: number[];
  readonly failures: { index: number; field: 'actor' | 'value'; maxAbsError: number }[];
  readonly ok: boolean;
}

/** Default tolerance from docs/ai-interface-spec.md §11: |ts − ref| ≤ 1e-5 + 1e-5·|ref|. */
export const DEFAULT_PARITY_TOLERANCE: ParityTolerance = { abs: 1e-5, rel: 1e-5 };

const maskedArgmax = (xs: ArrayLike<number>, mask?: readonly boolean[]) => {
  let best = -1;
  for (let i = 0; i < xs.length; i++) {
    if (mask && !mask[i]) continue;
    if (best < 0 || xs[i]! > xs[best]!) best = i;
  }
  return best;
};

/** Compares a TS PolicyModel against reference outputs from the user's numpy model. */
export function checkParity(
  model: PolicyModel,
  samples: readonly ParitySample[],
  tol: ParityTolerance = DEFAULT_PARITY_TOLERANCE,
): ParityReport {
  let maxAbsError = 0;
  const failures: ParityReport['failures'] = [];
  const argmaxMismatches: number[] = [];
  samples.forEach((s, index) => {
    const out = model.forward(Float32Array.from(s.obs));
    if (out.length !== ACTION_DIM || s.actor.length !== ACTION_DIM) {
      failures.push({ index, field: 'actor', maxAbsError: Infinity });
      return;
    }
    let sampleMax = 0;
    let failed = false;
    for (let i = 0; i < ACTION_DIM; i++) {
      const err = Math.abs(out[i]! - s.actor[i]!);
      sampleMax = Math.max(sampleMax, err);
      if (!(err <= tol.abs + tol.rel * Math.abs(s.actor[i]!))) failed = true;
    }
    maxAbsError = Math.max(maxAbsError, sampleMax);
    if (failed) failures.push({ index, field: 'actor', maxAbsError: sampleMax });
    if (maskedArgmax(out, s.mask) !== maskedArgmax(s.actor, s.mask)) argmaxMismatches.push(index);
    if (s.value !== undefined && model.value) {
      const err = Math.abs(model.value(Float32Array.from(s.obs)) - s.value);
      if (!(err <= tol.abs + tol.rel * Math.abs(s.value))) failures.push({ index, field: 'value', maxAbsError: err });
    }
  });
  return {
    samples: samples.length,
    maxAbsError,
    argmaxMismatches,
    failures,
    ok: failures.length === 0 && argmaxMismatches.length === 0,
  };
}
