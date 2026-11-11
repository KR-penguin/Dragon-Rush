import { resolveAsset } from '../services/assets';

/** URL of an art file when it exists under public/assets, else null (callers show their emoji fallback). */
export function useAssetUrl(path: string): string | null {
  return resolveAsset(path);
}
