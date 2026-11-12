import type { BgmName } from '../../types/assetPaths';

const TAU = Math.PI * 2;

interface Score {
  readonly bpm: number;
  readonly roots: readonly number[];
  readonly melody: readonly (number | null)[];
  readonly minor: boolean;
  readonly drive: number;
}

const SCORES: Readonly<Record<BgmName, Score>> = {
  lobby: {
    bpm: 96,
    roots: [48, 53, 55, 50],
    melody: [72, 76, 79, 76, 72, 77, 79, 77, 74, 79, 81, 79, 74, 77, 76, 72],
    minor: false,
    drive: 0.35,
  },
  board: {
    bpm: 104,
    roots: [50, 55, 57, 52],
    melody: [74, 77, 81, 77, 74, 79, 81, 79, 76, 81, 83, 81, 76, 79, 77, 74],
    minor: false,
    drive: 0.6,
  },
  dragon_battle: {
    bpm: 138,
    roots: [45, 46, 48, 43],
    melody: [69, null, 72, 74, 70, 72, 74, null, 72, null, 75, 77, 67, 70, 72, null],
    minor: true,
    drive: 1,
  },
};

const frequency = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
const wave = (hz: number, time: number): number =>
  Math.sin(TAU * hz * time) + 0.22 * Math.sin(TAU * hz * 2 * time);
const attack = (time: number, seconds: number): number => Math.min(1, time / seconds);

/** A four-bar, deterministic PCM loop. Notes are synthesized directly, so no audio assets are needed. */
export function renderBgmSamples(name: BgmName, sampleRate: number): Float32Array {
  const score = SCORES[name];
  const beatDuration = 60 / score.bpm;
  const barDuration = beatDuration * 4;
  const length = Math.round(barDuration * 4 * sampleRate);
  const samples = new Float32Array(length);
  const third = score.minor ? 15 : 16;

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const beat = Math.floor(t / beatDuration);
    const bar = Math.min(3, Math.floor(beat / 4));
    const root = score.roots[bar]!;
    const inBeat = t % beatDuration;
    const inBar = t % barDuration;
    const melody = score.melody[beat];

    const padEnvelope =
      attack(inBar, 0.12) * (0.72 + 0.28 * Math.cos((inBar / barDuration) * Math.PI));
    const pad =
      (wave(frequency(root + 12), t) +
        wave(frequency(root + third), t) +
        wave(frequency(root + 19), t)) *
      0.065 *
      padEnvelope;

    const bassEnvelope = attack(inBeat, 0.012) * Math.exp(-inBeat * 4.5);
    const bass = wave(frequency(root), t) * 0.19 * bassEnvelope;

    const leadEnvelope = attack(inBeat, 0.015) * Math.exp(-inBeat * 3.6);
    const lead =
      melody === null || melody === undefined
        ? 0
        : wave(frequency(melody), t) * 0.12 * leadEnvelope;

    const halfBeat = beatDuration / 2;
    const inHat = t % halfBeat;
    const noise = (((i * 1103515245 + 12345) >>> 10) & 1023) / 512 - 1;
    const hat = noise * Math.exp(-inHat * 85) * 0.035 * score.drive;
    const kick =
      beat % 2 === 0
        ? Math.sin(TAU * (78 * inBeat - 28 * inBeat * inBeat)) *
          Math.exp(-inBeat * 25) *
          0.14 *
          score.drive
        : 0;

    const edge = Math.min(1, t / 0.025, (length - 1 - i) / (sampleRate * 0.025));
    samples[i] = (pad + bass + lead + hat + kick) * Math.max(0, edge);
  }

  return samples;
}
