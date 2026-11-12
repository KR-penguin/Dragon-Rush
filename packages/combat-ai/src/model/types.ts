/** Combat model contract (docs/combat-ai-spec.md §11). Separate from the board PolicyModel. */
export interface CombatModelMeta {
  readonly id: string;
  readonly cobsVersion: string | null;
  readonly cactVersion: string | null;
  /** 'multi' = 9 move + 4 button outputs (13), 'flat' = 36. */
  readonly head: 'multi' | 'flat';
  readonly output: 'logits' | 'probs';
  readonly obsDim: number;
}

export interface CombatPolicyModel {
  readonly meta: CombatModelMeta;
  /** Actor output for one cobs_v1 observation (before masking). */
  forward(obs: Float32Array): Float32Array;
  /** Critic value; optional, only for parity checks. */
  value?(obs: Float32Array): number;
}

/** User weight JSON -> model. Throws CombatModelFormatError on a bad file. */
export type CombatWeightAdapter = (raw: unknown, id: string) => CombatPolicyModel;

export class CombatModelFormatError extends Error {
  override readonly name = 'CombatModelFormatError';
}

export type CombatDifficulty = 'easy' | 'normal' | 'hard';

/** Reaction delay (ticks) and sampling temperature per difficulty (D14 default proposal). */
export const COMBAT_DIFFICULTY: Readonly<
  Record<CombatDifficulty, { readonly delay: number; readonly temperature: number }>
> = {
  easy: { delay: 16, temperature: 1.3 },
  normal: { delay: 10, temperature: 1 },
  hard: { delay: 5, temperature: 0.7 },
};
