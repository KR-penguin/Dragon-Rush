import { SFX_NAMES, type SfxName } from '../../types/assetPaths';
import { centsToRate, dbToGain } from '../core/easing';
import type { FxRng } from '../core/rng';

/**
 * Sound catalogue and the pure decisions around it (which source plays, variation, voice caps).
 * The Web Audio graph itself lives in services/audio.ts.
 */
export const EXTRA_SOUND_NAMES = [
  'swing',
  'magic',
  'buy',
  'dragon_roar',
  'heal',
  'land',
  'eliminate',
  'crit',
  'parry',
  'dice_land',
  'turn_chime',
  'ui_click',
  'breath_charge',
  'thud',
  'chime',
  'clink',
  // Real-time combat
  'dash',
  'shot',
  'telegraph',
  'clash',
] as const;
export type ExtraSoundName = (typeof EXTRA_SOUND_NAMES)[number];
export type SoundName = SfxName | ExtraSoundName;
export const SOUND_NAMES: readonly SoundName[] = [...SFX_NAMES, ...EXTRA_SOUND_NAMES];

export type SfxBus = 'sfx' | 'ui';
export type AudioBus = 'master' | 'music' | 'ambience' | SfxBus;
export const AUDIO_BUSES: readonly AudioBus[] = ['master', 'music', 'sfx', 'ui', 'ambience'];

/** Default bus gains (master feeds a DynamicsCompressor). */
export const BUS_DEFAULTS: Readonly<Record<AudioBus, number>> = {
  master: 1,
  music: 0.6,
  ambience: 0.5,
  sfx: 0.9,
  ui: 0.7,
};

export const COMPRESSOR = {
  thresholdDb: -6,
  ratio: 12,
  attackS: 0.003,
  releaseS: 0.25,
  kneeDb: 6,
} as const;

/** Music ducking: −9 dB with a 5 ms time constant, hold 400 ms, release with a 150 ms constant. */
export const DUCK = { db: -9, attackTc: 0.005, holdMs: 400, releaseTc: 0.15 } as const;

export const VOICE_RULES = {
  maxVoices: 4,
  retriggerGapMs: 40,
  /** ±133 cents ≈ ±8% pitch. */
  detuneCents: 133,
  /** Random attenuation between 0 and −3 dB. */
  minDb: -3,
  variants: 5,
} as const;

export interface SoundSpec {
  readonly bus: SfxBus;
  readonly volume: number;
  readonly maxVoices: number;
  /** False keeps the sound identical every time (recognition cues). */
  readonly vary: boolean;
  /** Ducks the music while it plays. */
  readonly duck: boolean;
  /** Caption shown when captions are on (critical sounds only). */
  readonly caption?: string;
}

const spec = (o: Partial<SoundSpec> = {}): SoundSpec => ({
  bus: 'sfx',
  volume: 1,
  maxVoices: VOICE_RULES.maxVoices,
  vary: true,
  duck: false,
  ...o,
});

export const SOUND_SPEC: Readonly<Record<SoundName, SoundSpec>> = {
  dice_roll: spec({ maxVoices: 2 }),
  move_step: spec({ volume: 0.6 }),
  attack_hit: spec(),
  coin: spec({ volume: 0.7 }),
  upgrade: spec(),
  item_use: spec(),
  shield: spec(),
  dragon_breath: spec({ duck: true, caption: '화염 브레스!' }),
  victory: spec({ maxVoices: 1, vary: false }),
  defeat: spec({ maxVoices: 1, vary: false }),
  swing: spec({ volume: 0.7 }),
  magic: spec({ volume: 0.8 }),
  buy: spec(),
  dragon_roar: spec({ maxVoices: 1, duck: true, caption: '용이 포효한다!' }),
  heal: spec({ volume: 0.8 }),
  land: spec({ volume: 0.8 }),
  eliminate: spec({ maxVoices: 1, duck: true }),
  crit: spec({ volume: 0.8 }),
  parry: spec(),
  dice_land: spec({ vary: false, maxVoices: 2 }),
  turn_chime: spec({ bus: 'ui', vary: false, maxVoices: 1 }),
  ui_click: spec({ bus: 'ui', volume: 0.6 }),
  breath_charge: spec({ vary: false, maxVoices: 1, caption: '용이 숨을 들이쉰다!' }),
  thud: spec(),
  chime: spec({ volume: 0.8 }),
  clink: spec({ volume: 0.55 }),
  dash: spec({ volume: 0.6 }),
  shot: spec({ volume: 0.7 }),
  // Recognition cue: identical every time, like the breath charge.
  telegraph: spec({ vary: false, maxVoices: 2 }),
  clash: spec({ maxVoices: 1, duck: true }),
};

export const SOUND_EXTENSIONS = ['mp3', 'ogg', 'wav'] as const;

/** `audio/sfx/coin.mp3` is variant 1; `coin_2.mp3` … `coin_5.mp3` are round-robin variants. */
export function soundFileCandidates(name: SoundName, variant = 1): string[] {
  const base = variant <= 1 ? name : `${name}_${variant}`;
  return SOUND_EXTENSIONS.map((ext) => `audio/sfx/${base}.${ext}`);
}

export type SoundSource =
  { readonly kind: 'file'; readonly paths: readonly string[] } | { readonly kind: 'procedural' };

/**
 * Real files always win: any variant present in the asset manifest makes the sound file-backed.
 * Files that failed to load are skipped so a broken file falls back to the synthesiser.
 */
export function selectSoundSource(
  name: SoundName,
  hasAsset: (path: string) => boolean,
  failed: ReadonlySet<string> = new Set(),
): SoundSource {
  const paths: string[] = [];
  for (let v = 1; v <= VOICE_RULES.variants; v++) {
    const found = soundFileCandidates(name, v).find((p) => hasAsset(p) && !failed.has(p));
    if (found) paths.push(found);
  }
  return paths.length > 0 ? { kind: 'file', paths } : { kind: 'procedural' };
}

/** Round-robin pick that never repeats the previous variant. */
export function pickVariant(count: number, last: number, rng: FxRng): number {
  if (count <= 1) return 0;
  const k = rng.int(0, count - 2);
  return last >= 0 && last < count && k >= last ? k + 1 : k;
}

export interface VoiceVariation {
  readonly rate: number;
  readonly gain: number;
}

export function voiceVariation(rng: FxRng, vary: boolean): VoiceVariation {
  if (!vary) return { rate: 1, gain: 1 };
  const cents = (rng.next() * 2 - 1) * VOICE_RULES.detuneCents;
  return { rate: centsToRate(cents), gain: dbToGain(rng.next() * VOICE_RULES.minDb) };
}

export interface VoiceAdmission {
  readonly ok: boolean;
  /** Voice ids to stop to make room (oldest first). */
  readonly evict: readonly number[];
}

/** Caps simultaneous voices per sound and drops retriggers closer than the gap. */
export function createVoiceLimiter(gapMs: number = VOICE_RULES.retriggerGapMs) {
  const active = new Map<string, { id: number; end: number }[]>();
  const lastStart = new Map<string, number>();
  return {
    admit(
      name: string,
      nowMs: number,
      endMs: number,
      id: number,
      maxVoices: number,
    ): VoiceAdmission {
      const prev = lastStart.get(name);
      if (prev !== undefined && nowMs - prev < gapMs) return { ok: false, evict: [] };
      const list = (active.get(name) ?? []).filter((v) => v.end > nowMs);
      const evict: number[] = [];
      while (list.length >= Math.max(1, maxVoices)) evict.push(list.shift()!.id);
      list.push({ id, end: endMs });
      active.set(name, list);
      lastStart.set(name, nowMs);
      return { ok: true, evict };
    },
    release(name: string, id: number): void {
      const list = active.get(name);
      if (list)
        active.set(
          name,
          list.filter((v) => v.id !== id),
        );
    },
    activeCount(name: string, nowMs: number): number {
      return (active.get(name) ?? []).filter((v) => v.end > nowMs).length;
    },
  };
}

/** +1 semitone per step, capped at +12, then it starts over. */
export function createRisingSequence(cap = 12) {
  let step = 0;
  return {
    next(): number {
      const s = step;
      step = step >= cap ? 0 : step + 1;
      return s;
    },
    reset(): void {
      step = 0;
    },
  };
}

export interface LoopPoints {
  readonly loopStart: number;
  readonly loopEnd: number;
}

/** Parses `audio/bgm/loops.json` (`{ "board": { "loopStart": 1.2, "loopEnd": 95.4 } }`), dropping bad entries. */
export function parseLoopPoints(raw: unknown): Record<string, LoopPoints> {
  const out: Record<string, LoopPoints> = {};
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) continue;
    const { loopStart, loopEnd } = value as Record<string, unknown>;
    if (
      typeof loopStart === 'number' &&
      typeof loopEnd === 'number' &&
      loopStart >= 0 &&
      loopEnd > loopStart
    ) {
      out[key] = { loopStart, loopEnd };
    }
  }
  return out;
}
