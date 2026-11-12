import type { ItemId, JobId, TileId } from '@dragon-rush/engine';

/** Asset paths are relative to `public/assets/`. */
export const jobImagePath = (job: JobId): string => `images/jobs/${job}.png`;
export const combatJobImagePath = (job: JobId): string => `images/combat/${job}.png`;
export const combatDragonImagePath = 'images/combat/dragon.png';
export const combatDragonAttackImagePath = (name: string): string =>
  `images/combat/dragon-attacks/${name}.png`;
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

export const BGM_NAMES = [
  'lobby',
  'board',
  'dragon_battle',
  'result_victory',
  'result_defeat',
  'result_draw',
] as const;
export type BgmName = (typeof BGM_NAMES)[number];
const BGM_FILES: Readonly<Record<BgmName, string>> = {
  lobby: 'menu.mp3',
  board: 'menu.mp3',
  dragon_battle: 'battle.mp3',
  result_victory: 'result_victory.mp3',
  result_defeat: 'result_defeat.mp3',
  result_draw: 'result_draw.mp3',
};

export const sfxPath = (name: SfxName): string => `audio/sfx/${name}.mp3`;
export const bgmFile = (name: BgmName): string => BGM_FILES[name];
export const bgmPath = (name: BgmName): string => `audio/bgm/${bgmFile(name)}`;

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
