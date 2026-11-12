import { createStore } from 'zustand/vanilla';
import { readStorage, writeStorage } from '../../services/storage';

/** Effect channels that the juice debug panel can switch individually. */
export const FX_CHANNELS = [
  'shake',
  'hitStop',
  'slowMo',
  'particles',
  'text',
  'flash',
  'vignette',
  'punch',
  'sound',
] as const;
export type FxChannel = (typeof FX_CHANNELS)[number];

export interface FxSettings {
  /** Global A/B switch: off disables every visual effect channel. */
  readonly juice: boolean;
  /** Shake slider, 0..1 (default 1). */
  readonly shakeIntensity: number;
  /** null follows the system `prefers-reduced-motion`. */
  readonly reduceMotion: boolean | null;
  /** No full-screen flashes at all. */
  readonly photosensitive: boolean;
  readonly captions: boolean;
  /** Read by the board redesign (lair loops, landmarks). */
  readonly animateBackground: boolean;
  readonly channels: Readonly<Record<FxChannel, boolean>>;
  /** Debug multipliers, 0..2. */
  readonly particleAmount: number;
  readonly hitStopScale: number;
}

export const DEFAULT_FX_SETTINGS: FxSettings = {
  juice: true,
  shakeIntensity: 1,
  reduceMotion: null,
  photosensitive: false,
  captions: true,
  animateBackground: true,
  channels: Object.fromEntries(FX_CHANNELS.map((c) => [c, true])) as Record<FxChannel, boolean>,
  particleAmount: 1,
  hitStopScale: 1,
};

/** What the runtime actually applies after accessibility rules and debug toggles. */
export interface FxPolicy {
  readonly shakeScale: number;
  readonly hitStopScale: number;
  readonly slowMo: boolean;
  readonly particleScale: number;
  readonly text: boolean;
  /** Damage numbers fade in place instead of popping and rising. */
  readonly textInPlace: boolean;
  readonly flash: boolean;
  readonly vignette: boolean;
  readonly punch: boolean;
  readonly sound: boolean;
  readonly captions: boolean;
  readonly reduceMotion: boolean;
}

/**
 * Accessibility (decision sheet §1.10): reduced motion removes shake, kick, zoom punch and slow-mo,
 * halves particles and keeps hit-stop; damage numbers fade in place. Photosensitive mode removes
 * full-screen flashes.
 */
export function resolveFxPolicy(s: FxSettings, systemReducedMotion: boolean): FxPolicy {
  const reduce = s.reduceMotion ?? systemReducedMotion;
  const on = (c: FxChannel) => s.juice && s.channels[c];
  return {
    shakeScale: on('shake') && !reduce ? clamp(s.shakeIntensity, 0, 1) : 0,
    hitStopScale: on('hitStop') ? clamp(s.hitStopScale, 0, 2) : 0,
    slowMo: on('slowMo') && !reduce,
    particleScale: on('particles') ? clamp(s.particleAmount, 0, 2) * (reduce ? 0.5 : 1) : 0,
    text: on('text'),
    textInPlace: reduce,
    flash: on('flash') && !s.photosensitive,
    vignette: on('vignette'),
    punch: on('punch') && !reduce,
    sound: s.channels.sound,
    captions: s.captions,
    reduceMotion: reduce,
  };
}

const clamp = (v: number, lo: number, hi: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;

const STORAGE_KEY = 'dragon-rush:fx-settings';

/** Parses persisted settings, keeping defaults for anything missing or malformed. */
export function parseFxSettings(raw: string | null): FxSettings {
  if (!raw) return DEFAULT_FX_SETTINGS;
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return DEFAULT_FX_SETTINGS;
  }
  if (typeof data !== 'object' || data === null) return DEFAULT_FX_SETTINGS;
  const d = data as Record<string, unknown>;
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const num = (v: unknown, fallback: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, hi) : fallback;
  const channels = { ...DEFAULT_FX_SETTINGS.channels };
  if (typeof d.channels === 'object' && d.channels !== null) {
    const c = d.channels as Record<string, unknown>;
    for (const ch of FX_CHANNELS) channels[ch] = bool(c[ch], true);
  }
  return {
    juice: bool(d.juice, true),
    shakeIntensity: num(d.shakeIntensity, 1, 1),
    reduceMotion: typeof d.reduceMotion === 'boolean' ? d.reduceMotion : null,
    photosensitive: bool(d.photosensitive, false),
    captions: bool(d.captions, true),
    animateBackground: bool(d.animateBackground, true),
    channels,
    particleAmount: num(d.particleAmount, 1, 2),
    hitStopScale: num(d.hitStopScale, 1, 2),
  };
}

export interface FxSettingsState extends FxSettings {
  update(patch: Partial<FxSettings>): void;
  setChannel(channel: FxChannel, on: boolean): void;
  reset(): void;
}

const pick = (s: FxSettingsState): FxSettings => ({
  juice: s.juice,
  shakeIntensity: s.shakeIntensity,
  reduceMotion: s.reduceMotion,
  photosensitive: s.photosensitive,
  captions: s.captions,
  animateBackground: s.animateBackground,
  channels: s.channels,
  particleAmount: s.particleAmount,
  hitStopScale: s.hitStopScale,
});

export function createFxSettingsStore(
  initial: FxSettings = parseFxSettings(readStorage(STORAGE_KEY)),
) {
  const store = createStore<FxSettingsState>()((set, get) => ({
    ...initial,
    update(patch) {
      set(patch);
    },
    setChannel(channel, on) {
      set({ channels: { ...get().channels, [channel]: on } });
    },
    reset() {
      set(DEFAULT_FX_SETTINGS);
    },
  }));
  store.subscribe((s) => writeStorage(STORAGE_KEY, JSON.stringify(pick(s))));
  return store;
}

export type FxSettingsStore = ReturnType<typeof createFxSettingsStore>;

export const fxSettings: FxSettingsStore = createFxSettingsStore();

export function systemPrefersReducedMotion(): boolean {
  try {
    return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}
