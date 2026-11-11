import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACT_VERSION, OBS_VERSION, type PolicyModel, type WeightAdapter } from '@dragon-rush/ai';
import type { ModelInfo } from '@dragon-rush/protocol';

const FILE_PATTERN = /^[a-z0-9_-]+\.json$/;
const MAX_BYTES = 20 * 1024 * 1024;

export interface ModelRegistry {
  list(): ModelInfo[];
  get(id: string): PolicyModel | null;
}

/**
 * Loads allow-listed model JSON files from `dir` (top level only) through the given adapter.
 * Without an adapter (user weight format not received yet) no model is registered.
 */
export function loadModelRegistry(dir: string, adapter: WeightAdapter | null, log: (msg: string) => void = () => {}): ModelRegistry {
  const models = new Map<string, PolicyModel>();
  if (adapter && existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!FILE_PATTERN.test(file)) continue;
      const path = join(dir, file);
      try {
        if (statSync(path).size > MAX_BYTES) throw new Error('file too large');
        const id = file.replace(/\.json$/, '');
        const model = adapter(JSON.parse(readFileSync(path, 'utf8')) as unknown, id);
        const { obsVersion, actVersion } = model.meta;
        if ((obsVersion && obsVersion !== OBS_VERSION) || (actVersion && actVersion !== ACT_VERSION)) {
          throw new Error(`version mismatch ${obsVersion}/${actVersion}`);
        }
        models.set(id, model);
      } catch (e) {
        log(`model ${file} skipped: ${(e as Error).message}`);
      }
    }
  }
  return {
    list: () => [...models.values()].map((m) => ({ id: m.meta.id, obsVersion: m.meta.obsVersion, actVersion: m.meta.actVersion })),
    get: (id) => models.get(id) ?? null,
  };
}
