import type { Action } from '@dragon-rush/engine';
import type { DecisionContext, Policy } from '../policy';

const pick = <T>(xs: readonly T[], random: () => number): T => xs[Math.floor(random() * xs.length)] as T;

/** Picks an action type uniformly (dragon heavily down-weighted), then its argument uniformly. */
export function createRandomBot(opts: { dragonWeight?: number; uniform?: boolean } = {}): Policy {
  const dragonWeight = opts.dragonWeight ?? 0.01;
  return {
    id: opts.uniform ? 'random:uniform' : 'random',
    decide(ctx: DecisionContext): Action {
      if (opts.uniform) return pick(ctx.legal, ctx.random);
      const byType = new Map<string, Action[]>();
      for (const a of ctx.legal) byType.set(a.type, [...(byType.get(a.type) ?? []), a]);
      const types = [...byType.keys()];
      const weights = types.map((t) => (t === 'CHALLENGE_DRAGON' ? dragonWeight : 1));
      const total = weights.reduce((x, y) => x + y, 0);
      let r = ctx.random() * total;
      for (let i = 0; i < types.length; i++) {
        r -= weights[i]!;
        if (r < 0) return pick(byType.get(types[i]!)!, ctx.random);
      }
      return pick(ctx.legal, ctx.random);
    },
  };
}
