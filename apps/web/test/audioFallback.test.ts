import { describe, expect, it } from 'vitest';
import { soundCuesForEvent } from '../src/animation/eventSfx';
import { PROCEDURAL_SFX, synthesize } from '../src/fx/audio/proceduralSfx';
import {
  SOUND_NAMES,
  SOUND_SPEC,
  VOICE_RULES,
  createRisingSequence,
  createVoiceLimiter,
  parseLoopPoints,
  pickVariant,
  selectSoundSource,
  soundFileCandidates,
  voiceVariation,
} from '../src/fx/audio/soundCatalog';
import { createFxRng } from '../src/fx/core/rng';
import { SFX_NAMES, sfxPath } from '../src/types/assetPaths';

const manifest = (...paths: string[]) => {
  const set = new Set(paths);
  return (p: string) => set.has(p);
};

describe('sound source selection', () => {
  it('uses the procedural fallback only when no file exists', () => {
    expect(selectSoundSource('coin', manifest())).toEqual({ kind: 'procedural' });
    expect(selectSoundSource('coin', manifest('audio/sfx/coin.mp3'))).toEqual({
      kind: 'file',
      paths: ['audio/sfx/coin.mp3'],
    });
    expect(selectSoundSource('dragon_roar', manifest('audio/sfx/dragon_roar.ogg'))).toEqual({
      kind: 'file',
      paths: ['audio/sfx/dragon_roar.ogg'],
    });
  });

  it('collects round-robin variants and skips files that failed to load', () => {
    const has = manifest(
      'audio/sfx/coin.mp3',
      'audio/sfx/coin_2.wav',
      'audio/sfx/coin_3.mp3',
      'audio/sfx/coin_3.ogg',
    );
    expect(selectSoundSource('coin', has)).toEqual({
      kind: 'file',
      paths: ['audio/sfx/coin.mp3', 'audio/sfx/coin_2.wav', 'audio/sfx/coin_3.mp3'],
    });
    const failed = new Set(['audio/sfx/coin_3.mp3']);
    expect(selectSoundSource('coin', has, failed)).toMatchObject({
      paths: ['audio/sfx/coin.mp3', 'audio/sfx/coin_2.wav', 'audio/sfx/coin_3.ogg'],
    });
    const allBroken = new Set(['audio/sfx/shield.mp3']);
    expect(selectSoundSource('shield', manifest('audio/sfx/shield.mp3'), allBroken)).toEqual({
      kind: 'procedural',
    });
  });

  it('keeps the agreed asset file names for the existing sounds', () => {
    for (const name of SFX_NAMES) expect(soundFileCandidates(name)[0]).toBe(sfxPath(name));
    for (const name of SOUND_NAMES) {
      expect(PROCEDURAL_SFX[name], name).toBeTypeOf('function');
      expect(SOUND_SPEC[name].maxVoices).toBeLessThanOrEqual(VOICE_RULES.maxVoices);
    }
  });
});

describe('voice variation and limits', () => {
  it('varies pitch by ±133 cents (≈ ±8%) and volume by 0 to −3 dB, except fixed cues', () => {
    const rng = createFxRng(5);
    for (let i = 0; i < 500; i++) {
      const v = voiceVariation(rng, true);
      expect(v.rate).toBeGreaterThanOrEqual(2 ** (-133 / 1200) - 1e-9);
      expect(v.rate).toBeLessThanOrEqual(2 ** (133 / 1200) + 1e-9);
      expect(v.gain).toBeGreaterThanOrEqual(10 ** (-3 / 20) - 1e-9);
      expect(v.gain).toBeLessThanOrEqual(1);
    }
    expect(voiceVariation(rng, false)).toEqual({ rate: 1, gain: 1 });
    expect(SOUND_SPEC.turn_chime.vary).toBe(false);
    expect(SOUND_SPEC.dice_land.vary).toBe(false);
    expect(SOUND_SPEC.breath_charge.vary).toBe(false);
  });

  it('never picks the same variant twice in a row', () => {
    const rng = createFxRng(9);
    let last = -1;
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const v = pickVariant(4, last, rng);
      expect(v).not.toBe(last);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(4);
      seen.add(v);
      last = v;
    }
    expect(seen.size).toBe(4);
    expect(pickVariant(1, 0, rng)).toBe(0);
  });

  it('caps voices per sound (oldest stolen) and drops retriggers under 40 ms', () => {
    const lim = createVoiceLimiter();
    expect(lim.admit('hit', 0, 500, 1, 4)).toEqual({ ok: true, evict: [] });
    expect(lim.admit('hit', 20, 520, 2, 4).ok).toBe(false);
    expect(lim.admit('hit', 40, 540, 3, 4).ok).toBe(true);
    expect(lim.admit('hit', 80, 580, 4, 4).ok).toBe(true);
    expect(lim.admit('hit', 120, 620, 5, 4).ok).toBe(true);
    expect(lim.admit('hit', 160, 660, 6, 4)).toEqual({ ok: true, evict: [1] });
    expect(lim.activeCount('hit', 170)).toBe(4);
    expect(lim.admit('coin', 165, 300, 7, 4).ok).toBe(true);
    expect(lim.activeCount('hit', 1000)).toBe(0);
  });

  it('rises one semitone per step up to +12, then starts over', () => {
    const seq = createRisingSequence();
    const steps = Array.from({ length: 15 }, () => seq.next());
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 1]);
  });

  it('parses BGM loop points and ignores bad entries', () => {
    expect(
      parseLoopPoints({
        board: { loopStart: 1.5, loopEnd: 90 },
        lobby: { loopStart: 5, loopEnd: 2 },
        x: 3,
      }),
    ).toEqual({ board: { loopStart: 1.5, loopEnd: 90 } });
    expect(parseLoopPoints(null)).toEqual({});
  });
});

/** Minimal Web Audio stand-in that enforces the rules real browsers throw on. */
function fakeAudioContext() {
  const problems: string[] = [];
  const nodes: {
    kind: string;
    connected: boolean;
    started: number | null;
    stopped: number | null;
  }[] = [];
  const param = (label: string) => ({
    value: 0,
    setValueAtTime(v: number, t: number) {
      if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0)
        problems.push(`${label}.setValueAtTime(${v}, ${t})`);
    },
    linearRampToValueAtTime(v: number, t: number) {
      if (!Number.isFinite(v) || !Number.isFinite(t))
        problems.push(`${label}.linearRamp(${v}, ${t})`);
    },
    exponentialRampToValueAtTime(v: number, t: number) {
      if (!(v > 0) || !Number.isFinite(t)) problems.push(`${label}.exponentialRamp(${v}, ${t})`);
    },
    setTargetAtTime() {},
    cancelScheduledValues() {},
  });
  const node = (kind: string, extra: object = {}) => {
    const rec = {
      kind,
      connected: false,
      started: null as number | null,
      stopped: null as number | null,
    };
    nodes.push(rec);
    return {
      ...extra,
      connect(dest: unknown) {
        rec.connected = true;
        return dest;
      },
      disconnect() {},
      start(t = 0) {
        rec.started = t;
      },
      stop(t = 0) {
        if (rec.started === null || t < rec.started) problems.push(`${kind} stopped before start`);
        rec.stopped = t;
      },
    };
  };
  const ac = {
    sampleRate: 8000,
    currentTime: 0,
    createOscillator: () =>
      node('osc', { type: 'sine', frequency: param('osc.frequency'), detune: param('osc.detune') }),
    createGain: () => node('gain', { gain: param('gain') }),
    createBiquadFilter: () =>
      node('filter', {
        type: 'lowpass',
        frequency: param('filter.frequency'),
        Q: param('filter.Q'),
        gain: param('filter.gain'),
      }),
    createBufferSource: () =>
      node('source', { buffer: null, loop: false, playbackRate: param('rate') }),
    createWaveShaper: () => node('shaper', { curve: null, oversample: 'none' }),
    createBuffer: (_ch: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
  };
  return { ac: ac as unknown as BaseAudioContext, problems, nodes };
}

describe('procedural sound recipes', () => {
  it('every sound schedules a valid Web Audio graph with a sensible length', () => {
    for (const name of SOUND_NAMES) {
      for (const rate of [0.92, 1, 1.08, 2]) {
        const { ac, problems, nodes } = fakeAudioContext();
        const out = ac.createGain();
        const length = synthesize(name, ac, out, 0.05, rate, 1);
        expect(problems, name).toEqual([]);
        expect(length, name).toBeGreaterThan(0.03);
        expect(length, name).toBeLessThan(2.5);
        const sources = nodes.filter((n) => n.kind === 'osc' || n.kind === 'source');
        expect(sources.length, name).toBeGreaterThan(0);
        for (const s of sources) {
          expect(s.connected, name).toBe(true);
          expect(s.started, name).not.toBeNull();
          expect(s.stopped, name).not.toBeNull();
        }
      }
    }
  });
});

describe('event sounds', () => {
  it('times sounds against the board animation', () => {
    expect(
      soundCuesForEvent(
        { type: 'TurnStarted', seat: 0, round: 1, resting: false },
        { controllable: [0] },
      ),
    ).toEqual([{ name: 'turn_chime' }]);
    expect(
      soundCuesForEvent(
        { type: 'TurnStarted', seat: 1, round: 1, resting: false },
        { controllable: [0] },
      ),
    ).toEqual([]);
    expect(
      soundCuesForEvent(
        { type: 'TurnStarted', seat: 0, round: 1, resting: true },
        { controllable: [0] },
      ),
    ).toEqual([]);
    const move = soundCuesForEvent(
      { type: 'Moved', seat: 0, from: 0, to: 14, steps: 14, via: 'dice' },
      { controllable: [0], speed: 2 },
    );
    const ticks = move.filter((c) => c.name === 'move_step');
    expect(ticks).toHaveLength(14);
    expect(Math.max(...ticks.map((c) => c.semitones ?? 0))).toBe(12);
    expect(ticks[1]?.delayMs).toBe(80);
    expect(
      soundCuesForEvent(
        { type: 'ItemBought', seat: 0, item: 'shield', price: 5, coinsAfter: 1 },
        { controllable: [] },
      ),
    ).toEqual([{ name: 'buy' }]);
  });
});
