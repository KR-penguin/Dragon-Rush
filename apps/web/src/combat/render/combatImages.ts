import type { JobId } from '@dragon-rush/engine';
import { resolveAsset } from '../../services/assets';
import { combatDragonImagePath, combatJobImagePath } from '../../types/assetPaths';

interface ImageEntry {
  readonly image: HTMLImageElement;
  ready: boolean;
}

const images = new Map<string, ImageEntry>();

function combatImage(path: string): HTMLImageElement | null {
  let entry = images.get(path);
  if (!entry) {
    const url = resolveAsset(path);
    if (!url) return null;
    const image = new Image();
    entry = { image, ready: false };
    images.set(path, entry);
    const pending = entry;
    image.onload = () => {
      pending.ready = image.naturalWidth > 0 && image.naturalHeight > 0;
    };
    image.onerror = () => {
      pending.ready = false;
    };
    image.src = url;
  }
  return entry.ready ? entry.image : null;
}

export const combatJobImage = (job: JobId): HTMLImageElement | null =>
  combatImage(combatJobImagePath(job));

export const combatDragonImage = (): HTMLImageElement | null => combatImage(combatDragonImagePath);

export function preloadCombatImages(jobs: readonly JobId[], dragon: boolean): void {
  for (const job of jobs) combatJobImage(job);
  if (dragon) combatDragonImage();
}
