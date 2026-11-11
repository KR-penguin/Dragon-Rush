import type { ItemId, JobId, TileId } from '@hero-dice/engine';

/** Asset paths are relative to `public/assets/`. */
export const jobImagePath = (job: JobId): string => `images/jobs/${job}.png`;
export const tileImagePath = (tile: TileId): string => `images/tiles/${tile.toLowerCase()}.png`;
export const itemImagePath = (item: ItemId): string => `images/items/${item}.png`;
export const DRAGON_IMAGE_PATH = 'images/dragon/dragon.png';
export const BOARD_BG_PATH = 'images/board/board_bg.png';

export const SFX_NAMES = [
  'dice_roll',
  'move_step',
  'attack_hit',
  'coin',
  'upgrade',
  'item_use',
  'shield',
  'dragon_breath',
  'victory',
  'defeat',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export const BGM_NAMES = ['lobby', 'board', 'dragon_battle'] as const;
export type BgmName = (typeof BGM_NAMES)[number];

export const sfxPath = (name: SfxName): string => `audio/sfx/${name}.mp3`;
export const bgmPath = (name: BgmName): string => `audio/bgm/${name}.mp3`;

/** Normalizes manifest entries (OS separators, leading slashes) and drops dotfiles. */
export function normalizeManifest(files: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    const path = f.replace(/\\/g, '/').replace(/^\/+/, '');
    if (path.split('/').some((part) => part.startsWith('.'))) continue;
    out.add(path);
  }
  return out;
}
