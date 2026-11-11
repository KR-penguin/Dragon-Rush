import { bgmPath, sfxPath, type BgmName, type SfxName } from '../types/assetPaths';
import { assetUrl, hasAsset } from './assets';
import { readStorage, writeStorage } from './storage';

const MUTE_KEY = 'hero-dice:muted';
const SFX_VOLUME = 0.7;
const BGM_VOLUME = 0.35;

let muted = readStorage(MUTE_KEY) === '1';
let wantedBgm: BgmName | null = null;
let playingBgm: BgmName | null = null;
let bgmElement: HTMLAudioElement | null = null;
let unlockArmed = false;
const listeners = new Set<() => void>();

const canPlay = (): boolean => typeof Audio !== 'undefined';

/** Browsers block autoplay until a user gesture; retry the music on the first one. */
function armUnlock(): void {
  if (unlockArmed || typeof window === 'undefined') return;
  unlockArmed = true;
  const retry = () => {
    unlockArmed = false;
    window.removeEventListener('pointerdown', retry);
    window.removeEventListener('keydown', retry);
    bgmElement?.play().catch(() => undefined);
  };
  window.addEventListener('pointerdown', retry);
  window.addEventListener('keydown', retry);
}

function syncBgm(): void {
  const target = !muted && wantedBgm && hasAsset(bgmPath(wantedBgm)) ? wantedBgm : null;
  if (target === playingBgm) return;
  bgmElement?.pause();
  bgmElement = null;
  playingBgm = null;
  if (!target || !canPlay()) return;
  const el = new Audio(assetUrl(bgmPath(target)));
  el.loop = true;
  el.volume = BGM_VOLUME;
  el.play().catch(armUnlock);
  bgmElement = el;
  playingBgm = target;
}

export function playSfx(name: SfxName): void {
  const path = sfxPath(name);
  if (muted || !canPlay() || !hasAsset(path)) return;
  const el = new Audio(assetUrl(path));
  el.volume = SFX_VOLUME;
  el.play().catch(() => undefined);
}

export function playBgm(name: BgmName | null): void {
  wantedBgm = name;
  syncBgm();
}

export const isMuted = (): boolean => muted;

export function setMuted(value: boolean): void {
  if (value === muted) return;
  muted = value;
  writeStorage(MUTE_KEY, value ? '1' : '0');
  syncBgm();
  for (const l of listeners) l();
}

export function subscribeAudio(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
