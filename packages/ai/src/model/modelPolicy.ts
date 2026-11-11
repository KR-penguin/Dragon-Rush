import type { Action } from '@dragon-rush/engine';
import { createHeuristicBot } from '../bots/heuristic/heuristicBot';
import { ACTION_DIM, decodeAction, maskFromLegal } from '../codec/actions';
import { encodeObservation } from '../obs/encode';
import { OBS_DIM } from '../obs/layout';
import type { DecisionContext, Policy, PolicyModel } from '../policy';

export interface ModelPolicyOptions {
  mode?: 'argmax' | 'sample';
  temperature?: number;
  onFallback?: (reason: string) => void;
}

/** encode -> forward -> mask -> argmax/sample -> decode (docs/ai-interface-spec.md §9). */
export function createModelPolicy(model: PolicyModel, opts: ModelPolicyOptions = {}): Policy {
  const mode = opts.mode ?? 'argmax';
  const temperature = opts.temperature ?? 1;
  const fallback = createHeuristicBot('growth');
  if (model.meta.obsDim !== OBS_DIM || model.meta.actionDim !== ACTION_DIM) {
    throw new RangeError(`model dims ${model.meta.obsDim}/${model.meta.actionDim} != ${OBS_DIM}/${ACTION_DIM}`);
  }
  return {
    id: `model:${model.meta.id}`,
    decide(ctx: DecisionContext): Action {
      const obs = encodeObservation(ctx.view, ctx.seat);
      const out = model.forward(obs);
      const mask = maskFromLegal(ctx.view, ctx.seat, ctx.legal);
      const logits = new Float64Array(ACTION_DIM).fill(-Infinity);
      let valid = out.length === ACTION_DIM;
      for (let i = 0; valid && i < ACTION_DIM; i++) {
        const raw = out[i]!;
        if (Number.isNaN(raw)) valid = false;
        else if (mask[i]) logits[i] = model.meta.output === 'probs' ? Math.log(Math.max(raw, 1e-12)) : raw;
      }
      if (!valid || !logits.some((x) => Number.isFinite(x))) {
        opts.onFallback?.('invalid model output');
        return fallback.decide(ctx);
      }
      let index = 0;
      if (mode === 'argmax') {
        for (let i = 1; i < ACTION_DIM; i++) if (logits[i]! > logits[index]!) index = i;
      } else {
        const max = Math.max(...logits);
        const weights = Array.from(logits, (l) => (Number.isFinite(l) ? Math.exp((l - max) / temperature) : 0));
        const total = weights.reduce((a, b) => a + b, 0);
        let r = ctx.random() * total;
        index = weights.findIndex((w) => (r -= w) < 0);
        if (index < 0) {
          for (let i = ACTION_DIM - 1; i >= 0; i--) {
            if (weights[i]! > 0) {
              index = i;
              break;
            }
          }
        }
      }
      return decodeAction(ctx.view, ctx.seat, index);
    },
  };
}
