import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createModelPolicy, getWeightAdapter, type Policy } from '@hero-dice/ai';

const cache = new Map<string, Policy>();

/** Loads `models/<id>.json` through the user's weight adapter (bots name: `model:<id>`). */
export function loadModelPolicy(id: string, modelsDir = process.env.MODELS_DIR ?? resolve(process.cwd(), 'models')): Policy {
  const hit = cache.get(id);
  if (hit) return hit;
  const adapter = getWeightAdapter();
  if (!adapter) {
    throw new Error('No weight adapter yet: share your weight JSON format so packages/ai/src/model/adapters can read it.');
  }
  if (!/^[a-z0-9_-]+$/.test(id)) throw new Error(`invalid model id ${id}`);
  const raw = JSON.parse(readFileSync(resolve(modelsDir, `${id}.json`), 'utf8')) as unknown;
  const policy = createModelPolicy(adapter(raw, id));
  cache.set(id, policy);
  return policy;
}
