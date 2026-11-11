import { createFxRng, hashSeed, type FxRng } from '../core/rng';
import { SOUND_NAMES, type SoundName } from './soundCatalog';

/**
 * Placeholder sound design synthesised with Web Audio, used only while a sound has no file under
 * public/assets/audio/sfx. Each recipe schedules nodes from `t0` and returns its length in seconds.
 */
export interface SynthContext {
  readonly ac: BaseAudioContext;
  readonly out: AudioNode;
  readonly t0: number;
  /** Pitch multiplier (variation, rising sequences). */
  readonly rate: number;
  /** Seeded per variant so each variant is stable and recognisable. */
  readonly rng: FxRng;
}

export type SynthRecipe = (c: SynthContext) => number;

const SILENT = 0.0001;

function envelope(p: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  p.setValueAtTime(SILENT, t);
  p.exponentialRampToValueAtTime(Math.max(SILENT, peak), t + Math.max(0.001, attack));
  p.exponentialRampToValueAtTime(SILENT, t + Math.max(0.001, attack) + Math.max(0.005, decay));
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseBuffer(ac: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ac);
  if (!buf) {
    buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = buf.getChannelData(0);
    const rng = createFxRng(0xd1ce);
    for (let i = 0; i < data.length; i++) data[i] = rng.next() * 2 - 1;
    noiseBuffers.set(ac, buf);
  }
  return buf;
}

const shaperCurves = new Map<number, Float32Array<ArrayBuffer>>();
/** Soft clipper: adds punch and harmonics to low thuds without hard digital clipping. */
function shaper(c: SynthContext, drive: number, dest: AudioNode = c.out): WaveShaperNode {
  let curve = shaperCurves.get(drive);
  if (!curve) {
    curve = new Float32Array(new ArrayBuffer(1024 * 4));
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    shaperCurves.set(drive, curve);
  }
  const node = c.ac.createWaveShaper();
  node.curve = curve;
  node.oversample = '2x';
  node.connect(dest);
  return node;
}

function filter(
  c: SynthContext,
  type: BiquadFilterType,
  freq: number,
  q = 0.7,
  dest: AudioNode = c.out,
): BiquadFilterNode {
  const f = c.ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq * c.rate, c.t0);
  f.Q.setValueAtTime(q, c.t0);
  f.connect(dest);
  return f;
}

interface ToneOptions {
  readonly type: OscillatorType;
  readonly f0: number;
  readonly f1?: number;
  readonly at?: number;
  readonly attack?: number;
  readonly decay: number;
  readonly gain: number;
  readonly glide?: number;
  readonly dest?: AudioNode;
}

function tone(c: SynthContext, o: ToneOptions): OscillatorNode {
  const t = c.t0 + (o.at ?? 0);
  const attack = o.attack ?? 0.003;
  const osc = c.ac.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f0 * c.rate, t);
  if (o.f1 !== undefined)
    osc.frequency.exponentialRampToValueAtTime(o.f1 * c.rate, t + (o.glide ?? attack + o.decay));
  const g = c.ac.createGain();
  envelope(g.gain, t, o.gain, attack, o.decay);
  osc.connect(g).connect(o.dest ?? c.out);
  osc.start(t);
  osc.stop(t + attack + o.decay + 0.03);
  return osc;
}

interface NoiseOptions {
  readonly at?: number;
  readonly attack?: number;
  readonly decay: number;
  readonly gain: number;
  readonly type: BiquadFilterType;
  readonly f0: number;
  readonly f1?: number;
  readonly sweep?: number;
  readonly q?: number;
  readonly dest?: AudioNode;
}

function noise(c: SynthContext, o: NoiseOptions): BiquadFilterNode {
  const t = c.t0 + (o.at ?? 0);
  const attack = o.attack ?? 0.002;
  const src = c.ac.createBufferSource();
  src.buffer = noiseBuffer(c.ac);
  src.loop = true;
  const f = c.ac.createBiquadFilter();
  f.type = o.type;
  f.frequency.setValueAtTime(o.f0 * c.rate, t);
  if (o.f1 !== undefined)
    f.frequency.exponentialRampToValueAtTime(o.f1 * c.rate, t + (o.sweep ?? attack + o.decay));
  f.Q.setValueAtTime(o.q ?? 0.7, t);
  const g = c.ac.createGain();
  envelope(g.gain, t, o.gain, attack, o.decay);
  src
    .connect(f)
    .connect(g)
    .connect(o.dest ?? c.out);
  src.start(t, c.rng.next() * 0.5);
  src.stop(t + attack + o.decay + 0.03);
  return f;
}

/** Notes as [frequency, start s, length s]. */
function melody(
  c: SynthContext,
  notes: readonly (readonly [number, number, number])[],
  voices: readonly { type: OscillatorType; mult: number; gain: number }[],
): number {
  let end = 0;
  for (const [f, at, len] of notes) {
    for (const v of voices)
      tone(c, { type: v.type, f0: f * v.mult, at, attack: 0.008, decay: len, gain: v.gain });
    end = Math.max(end, at + len);
  }
  return end + 0.05;
}

const NOTE = {
  C4: 261.63,
  E4: 329.63,
  F4: 349.23,
  Fs4: 369.99,
  G4: 392.0,
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  A6: 1760.0,
  C7: 2093.0,
  E7: 2637.02,
  G7: 3135.96,
} as const;

export const PROCEDURAL_SFX: Readonly<Record<SoundName, SynthRecipe>> = {
  dice_roll(c) {
    let t = 0;
    const hits = c.rng.int(6, 9);
    for (let i = 0; i < hits; i++) {
      const fade = 1 - (i / hits) * 0.45;
      noise(c, {
        at: t,
        decay: 0.02 + c.rng.next() * 0.015,
        gain: 0.45 * fade,
        type: 'bandpass',
        f0: 1800 + c.rng.next() * 2200,
        q: 5,
      });
      tone(c, {
        type: 'triangle',
        f0: 550 + c.rng.next() * 550,
        at: t,
        decay: 0.035,
        gain: 0.1 * fade,
      });
      t += 0.026 + c.rng.next() * 0.04 + i * 0.006;
    }
    return t + 0.06;
  },
  dice_land(c) {
    noise(c, { decay: 0.03, gain: 0.55, type: 'bandpass', f0: 2600, q: 4 });
    tone(c, { type: 'triangle', f0: 900, f1: 700, decay: 0.05, gain: 0.22 });
    tone(c, { type: 'sine', f0: 220, f1: 150, decay: 0.09, gain: 0.3 });
    return 0.14;
  },
  move_step(c) {
    tone(c, { type: 'sine', f0: 520, f1: 330, decay: 0.07, gain: 0.26 });
    noise(c, { decay: 0.012, gain: 0.08, type: 'highpass', f0: 3500 });
    return 0.1;
  },
  land(c) {
    tone(c, { type: 'sine', f0: 150, f1: 55, decay: 0.14, gain: 0.5 });
    noise(c, { decay: 0.1, gain: 0.28, type: 'lowpass', f0: 700, f1: 200 });
    return 0.18;
  },
  attack_hit(c) {
    const drive = shaper(c, 3);
    tone(c, { type: 'sine', f0: 160, f1: 42, glide: 0.18, decay: 0.22, gain: 0.85, dest: drive });
    tone(c, { type: 'square', f0: 90, f1: 40, decay: 0.08, gain: 0.12, dest: drive });
    noise(c, {
      decay: 0.09,
      gain: 0.5,
      type: 'bandpass',
      f0: 1500 + c.rng.next() * 400,
      f1: 400,
      q: 1.2,
    });
    noise(c, { decay: 0.015, gain: 0.28, type: 'highpass', f0: 4000 });
    return 0.28;
  },
  crit(c) {
    tone(c, { type: 'sine', f0: NOTE.C7, decay: 0.3, gain: 0.11 });
    tone(c, { type: 'sine', f0: NOTE.G7, at: 0.005, decay: 0.25, gain: 0.07 });
    tone(c, { type: 'triangle', f0: NOTE.C6, decay: 0.18, gain: 0.09 });
    noise(c, { decay: 0.1, gain: 0.09, type: 'highpass', f0: 6500 });
    return 0.34;
  },
  parry(c) {
    tone(c, { type: 'sine', f0: 1800, decay: 0.35, gain: 0.14 });
    tone(c, { type: 'sine', f0: 2727, decay: 0.3, gain: 0.09 });
    tone(c, { type: 'sine', f0: 4100, decay: 0.2, gain: 0.05 });
    noise(c, { decay: 0.05, gain: 0.18, type: 'bandpass', f0: 5000, q: 8 });
    return 0.4;
  },
  swing(c) {
    const t = c.t0;
    const src = c.ac.createBufferSource();
    src.buffer = noiseBuffer(c.ac);
    src.loop = true;
    const f = c.ac.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.setValueAtTime(2.5, t);
    f.frequency.setValueAtTime(350 * c.rate, t);
    f.frequency.exponentialRampToValueAtTime(2600 * c.rate, t + 0.11);
    f.frequency.exponentialRampToValueAtTime(600 * c.rate, t + 0.26);
    const g = c.ac.createGain();
    envelope(g.gain, t, 0.55, 0.08, 0.18);
    src.connect(f).connect(g).connect(c.out);
    src.start(t, c.rng.next() * 0.5);
    src.stop(t + 0.3);
    return 0.3;
  },
  magic(c) {
    const bp = filter(c, 'bandpass', 1800, 6);
    bp.frequency.exponentialRampToValueAtTime(400 * c.rate, c.t0 + 0.32);
    const osc = tone(c, { type: 'sawtooth', f0: 1600, f1: 280, decay: 0.32, gain: 0.2, dest: bp });
    const lfo = c.ac.createOscillator();
    const depth = c.ac.createGain();
    lfo.frequency.setValueAtTime(24, c.t0);
    depth.gain.setValueAtTime(30 * c.rate, c.t0);
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(c.t0);
    lfo.stop(c.t0 + 0.36);
    for (let i = 0; i < 4; i++) {
      tone(c, {
        type: 'sine',
        f0: 2000 + c.rng.next() * 2200,
        at: 0.03 + i * 0.035,
        decay: 0.12,
        gain: 0.05,
      });
    }
    return 0.4;
  },
  item_use(c) {
    [NOTE.E5, NOTE.A6 / 2, NOTE.E6].forEach((f, i) =>
      tone(c, { type: 'sine', f0: f, at: i * 0.05, decay: 0.2, gain: 0.13 }),
    );
    noise(c, { decay: 0.25, gain: 0.05, type: 'highpass', f0: 2000, f1: 8000 });
    return 0.35;
  },
  shield(c) {
    const ratios = [1, 2.76, 5.4, 8.93];
    const gains = [0.28, 0.15, 0.08, 0.04];
    const decays = [1.0, 0.7, 0.45, 0.3];
    ratios.forEach((r, i) =>
      tone(c, { type: 'sine', f0: 330 * r, decay: decays[i]!, gain: gains[i]! }),
    );
    noise(c, { attack: 0.02, decay: 0.3, gain: 0.1, type: 'lowpass', f0: 500 });
    return 1.05;
  },
  upgrade(c) {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) =>
      tone(c, { type: 'triangle', f0: f, at: i * 0.065, decay: 0.3, gain: 0.17 }),
    );
    tone(c, { type: 'sine', f0: NOTE.C7, at: 0.2, decay: 0.4, gain: 0.05 });
    return 0.65;
  },
  chime(c) {
    tone(c, { type: 'sine', f0: NOTE.E6, decay: 0.35, gain: 0.11 });
    tone(c, { type: 'sine', f0: NOTE.B5 * 2, at: 0.06, decay: 0.4, gain: 0.09 });
    tone(c, { type: 'triangle', f0: NOTE.E5, decay: 0.3, gain: 0.07 });
    return 0.5;
  },
  thud(c) {
    const drive = shaper(c, 4);
    tone(c, { type: 'sine', f0: 110, f1: 45, decay: 0.25, gain: 0.7, dest: drive });
    noise(c, { decay: 0.15, gain: 0.32, type: 'lowpass', f0: 400, f1: 150 });
    return 0.3;
  },
  coin(c) {
    const lp = filter(c, 'lowpass', 5000);
    tone(c, { type: 'square', f0: NOTE.B5, attack: 0.002, decay: 0.07, gain: 0.09, dest: lp });
    tone(c, {
      type: 'square',
      f0: NOTE.E6,
      at: 0.07,
      attack: 0.002,
      decay: 0.3,
      gain: 0.09,
      dest: lp,
    });
    return 0.4;
  },
  clink(c) {
    tone(c, { type: 'triangle', f0: NOTE.E6, attack: 0.001, decay: 0.09, gain: 0.12 });
    tone(c, { type: 'sine', f0: NOTE.E7, attack: 0.001, decay: 0.05, gain: 0.05 });
    return 0.12;
  },
  buy(c) {
    noise(c, { decay: 0.04, gain: 0.32, type: 'bandpass', f0: 1800, q: 3 });
    tone(c, { type: 'sine', f0: 180, f1: 120, decay: 0.08, gain: 0.28 });
    const lp = filter(c, 'lowpass', 6000);
    tone(c, {
      type: 'square',
      f0: NOTE.E6,
      at: 0.05,
      attack: 0.002,
      decay: 0.12,
      gain: 0.07,
      dest: lp,
    });
    tone(c, {
      type: 'square',
      f0: NOTE.A6,
      at: 0.1,
      attack: 0.002,
      decay: 0.3,
      gain: 0.07,
      dest: lp,
    });
    tone(c, { type: 'sine', f0: NOTE.E7, at: 0.1, decay: 0.5, gain: 0.04 });
    return 0.65;
  },
  heal(c) {
    tone(c, { type: 'sine', f0: 420, f1: 880, glide: 0.35, attack: 0.05, decay: 0.4, gain: 0.15 });
    tone(c, {
      type: 'triangle',
      f0: 840,
      f1: 1760,
      glide: 0.35,
      attack: 0.05,
      decay: 0.35,
      gain: 0.04,
    });
    [1568, NOTE.C7, NOTE.E7].forEach((f, i) =>
      tone(c, { type: 'sine', f0: f, at: 0.1 + i * 0.08, decay: 0.2, gain: 0.05 }),
    );
    return 0.55;
  },
  dragon_breath(c) {
    const drive = shaper(c, 2.5);
    const t = c.t0;
    const src = c.ac.createBufferSource();
    src.buffer = noiseBuffer(c.ac);
    src.loop = true;
    const lp = c.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.setValueAtTime(1, t);
    lp.frequency.setValueAtTime(300 * c.rate, t);
    lp.frequency.exponentialRampToValueAtTime(2400 * c.rate, t + 0.25);
    lp.frequency.exponentialRampToValueAtTime(700 * c.rate, t + 0.95);
    const g = c.ac.createGain();
    envelope(g.gain, t, 0.65, 0.08, 0.9);
    src.connect(lp).connect(g).connect(drive);
    src.start(t, c.rng.next() * 0.5);
    src.stop(t + 1.05);
    const growl = filter(c, 'lowpass', 500, 0.7, drive);
    tone(c, {
      type: 'sawtooth',
      f0: 80,
      f1: 60,
      attack: 0.1,
      decay: 0.85,
      gain: 0.22,
      dest: growl,
    });
    return 1.05;
  },
  dragon_roar(c) {
    const t = c.t0;
    const drive = shaper(c, 5);
    const lp = filter(c, 'lowpass', 900, 1.5, drive);
    lp.frequency.exponentialRampToValueAtTime(450 * c.rate, t + 1.1);
    const amp = c.ac.createGain();
    amp.gain.setValueAtTime(0.65, t);
    amp.connect(lp);
    const lfo = c.ac.createOscillator();
    const lfoDepth = c.ac.createGain();
    lfo.frequency.setValueAtTime(31, t);
    lfoDepth.gain.setValueAtTime(0.35, t);
    lfo.connect(lfoDepth).connect(amp.gain);
    lfo.start(t);
    lfo.stop(t + 1.25);
    for (const [type, mult, gain] of [
      ['sawtooth', 1, 0.4],
      ['sawtooth', 1.02, 0.3],
      ['square', 0.5, 0.18],
    ] as const) {
      const osc = c.ac.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(95 * mult * c.rate, t);
      osc.frequency.exponentialRampToValueAtTime(125 * mult * c.rate, t + 0.25);
      osc.frequency.exponentialRampToValueAtTime(55 * mult * c.rate, t + 1.1);
      const g = c.ac.createGain();
      envelope(g.gain, t, gain, 0.12, 1.0);
      osc.connect(g).connect(amp);
      osc.start(t);
      osc.stop(t + 1.2);
    }
    noise(c, {
      attack: 0.1,
      decay: 1.0,
      gain: 0.28,
      type: 'bandpass',
      f0: 700,
      q: 0.8,
      dest: drive,
    });
    return 1.25;
  },
  breath_charge(c) {
    const t = c.t0;
    const src = c.ac.createBufferSource();
    src.buffer = noiseBuffer(c.ac);
    src.loop = true;
    const bp = c.ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.setValueAtTime(2, t);
    bp.frequency.setValueAtTime(300 * c.rate, t);
    bp.frequency.exponentialRampToValueAtTime(2000 * c.rate, t + 0.8);
    const g = c.ac.createGain();
    g.gain.setValueAtTime(SILENT, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.75);
    g.gain.exponentialRampToValueAtTime(SILENT, t + 0.88);
    src.connect(bp).connect(g).connect(c.out);
    src.start(t, c.rng.next() * 0.5);
    src.stop(t + 0.92);
    tone(c, { type: 'sine', f0: 60, f1: 90, glide: 0.8, attack: 0.7, decay: 0.15, gain: 0.2 });
    return 0.92;
  },
  eliminate(c) {
    const lp = filter(c, 'lowpass', 1200);
    lp.frequency.exponentialRampToValueAtTime(300 * c.rate, c.t0 + 0.7);
    tone(c, { type: 'sawtooth', f0: 330, f1: 70, glide: 0.7, decay: 0.75, gain: 0.22, dest: lp });
    noise(c, { attack: 0.01, decay: 0.5, gain: 0.28, type: 'lowpass', f0: 400 });
    tone(c, { type: 'sine', f0: 98, f1: 70, decay: 0.6, gain: 0.25 });
    return 0.85;
  },
  turn_chime(c) {
    tone(c, { type: 'sine', f0: NOTE.G5, decay: 0.5, gain: 0.14 });
    tone(c, { type: 'sine', f0: NOTE.G5 * 2.76, decay: 0.2, gain: 0.03 });
    tone(c, { type: 'sine', f0: NOTE.D6, at: 0.12, decay: 0.6, gain: 0.14 });
    return 0.8;
  },
  ui_click(c) {
    tone(c, { type: 'triangle', f0: 1200, f1: 900, decay: 0.03, gain: 0.14 });
    noise(c, { decay: 0.008, gain: 0.05, type: 'highpass', f0: 5000 });
    return 0.06;
  },
  victory(c) {
    return melody(
      c,
      [
        [NOTE.C5, 0, 0.14],
        [NOTE.E5, 0.14, 0.14],
        [NOTE.G5, 0.28, 0.14],
        [NOTE.C6, 0.42, 0.5],
        [NOTE.G5, 0.95, 0.12],
        [NOTE.C6, 1.08, 0.85],
      ],
      [
        { type: 'square', mult: 1, gain: 0.06 },
        { type: 'triangle', mult: 0.5, gain: 0.1 },
      ],
    );
  },
  defeat(c) {
    const end = melody(
      c,
      [
        [NOTE.G4, 0, 0.28],
        [NOTE.Fs4, 0.3, 0.28],
        [NOTE.F4, 0.6, 0.28],
        [NOTE.E4, 0.9, 1.1],
      ],
      [
        { type: 'triangle', mult: 1, gain: 0.13 },
        { type: 'square', mult: 1, gain: 0.03 },
      ],
    );
    tone(c, { type: 'sine', f0: NOTE.C4 / 2, at: 0.9, decay: 1.1, gain: 0.12 });
    return end;
  },
};

export const PROCEDURAL_VARIANTS = 4;

/** Schedules a procedural sound and returns its length (s). `variant` picks a stable seed. */
export function synthesize(
  name: SoundName,
  ac: BaseAudioContext,
  out: AudioNode,
  t0: number,
  rate: number,
  variant: number,
): number {
  const rng = createFxRng(hashSeed(SOUND_NAMES.indexOf(name), variant));
  return PROCEDURAL_SFX[name]({ ac, out, t0, rate, rng });
}
