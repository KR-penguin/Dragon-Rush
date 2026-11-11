import { describe, expect, it } from 'vitest';
import { ACTION_DIM, checkParity, OBS_DIM, type PolicyModel } from '../src/index';

/** Synthetic linear model standing in for the user's adapter until their format arrives. */
function linearModel(scale: number): PolicyModel {
  return {
    meta: { id: 'linear', obsVersion: 'obs_v1', actVersion: 'act_v1', output: 'logits', obsDim: OBS_DIM, actionDim: ACTION_DIM },
    forward: (obs) => Float32Array.from({ length: ACTION_DIM }, (_, i) => scale * (obs[i] ?? 0) + i * 0.01),
    value: (obs) => scale * obs[0]!,
  };
}

const sample = (k: number) => {
  const obs = Array.from({ length: OBS_DIM }, (_, i) => ((i * 7 + k) % 11) / 10);
  return { obs, actor: Array.from({ length: ACTION_DIM }, (_, i) => obs[i]! + i * 0.01), value: obs[0]! };
};

describe('model parity check', () => {
  it('passes when the TS model matches the reference outputs', () => {
    const report = checkParity(linearModel(1), [sample(1), sample(2), sample(3)]);
    expect(report.ok).toBe(true);
    expect(report.maxAbsError).toBeLessThan(1e-6);
  });

  it('reports actor and critic mismatches', () => {
    const report = checkParity(linearModel(1.01), [sample(1)]);
    expect(report.ok).toBe(false);
    expect(report.failures.map((f) => f.field)).toContain('actor');
  });
});
