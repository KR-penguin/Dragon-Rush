import manifest from 'virtual:asset-manifest';
import { normalizeManifest } from '../types/assetPaths';

const available = normalizeManifest(Object.keys(manifest));

/** True only for files that exist under public/assets, so missing art never causes a 404. */
export const hasAsset = (path: string): boolean => available.has(path);

export const assetUrl = (path: string): string => {
  const url = `${import.meta.env.BASE_URL}assets/${path}`;
  const digest = manifest[path];
  return digest ? `${url}?v=${digest}` : url;
};

export const resolveAsset = (path: string): string | null =>
  hasAsset(path) ? assetUrl(path) : null;
