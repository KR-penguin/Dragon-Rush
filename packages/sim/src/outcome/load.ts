import { readFileSync } from 'node:fs';
import { parseOutcomeModel, type OutcomeModel } from '@dragon-rush/ai';

/** File I/O stays in sim; the predictor itself accepts a validated JSON object. */
export function loadOutcomeModel(path: string): OutcomeModel {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return parseOutcomeModel(raw);
}
