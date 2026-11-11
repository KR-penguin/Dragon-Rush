import { createRng, nextFloat, type Action, type PublicGameState, type RngState, type SeatId } from '@dragon-rush/engine';

export interface DecisionContext {
  readonly view: PublicGameState;
  readonly seat: SeatId;
  readonly legal: readonly Action[];
  /** Policy-private randomness in [0, 1). Never the game RNG. */
  readonly random: () => number;
}

/** Strategy interface shared by bots and model-backed policies. */
export interface Policy {
  readonly id: string;
  decide(ctx: DecisionContext): Action;
}

export interface ModelMeta {
  readonly id: string;
  readonly obsVersion: string | null;
  readonly actVersion: string | null;
  readonly output: 'logits' | 'probs';
  readonly obsDim: number;
  readonly actionDim: number;
}

export interface PolicyModel {
  readonly meta: ModelMeta;
  /** Actor output for one observation: ACTION_DIM logits or probabilities (see meta.output). */
  forward(obs: Float32Array): Float32Array;
  /** Critic value; optional, only used by parity checks. */
  value?(obs: Float32Array): number;
}

export type WeightAdapter = (raw: unknown, id: string) => PolicyModel;

export class ModelFormatError extends Error {
  override readonly name = 'ModelFormatError';
}

/** Deterministic [0, 1) stream for policies, seeded independently from the game RNG. */
export function createPolicyRandom(seed: number): () => number {
  let state: RngState = createRng(seed);
  return () => {
    const [f, next] = nextFloat(state);
    state = next;
    return f;
  };
}

export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
