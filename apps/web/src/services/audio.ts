import { PROCEDURAL_VARIANTS, synthesize } from '../fx/audio/proceduralSfx';
import {
  AUDIO_BUSES,
  BUS_DEFAULTS,
  COMPRESSOR,
  DUCK,
  SOUND_NAMES,
  SOUND_SPEC,
  createVoiceLimiter,
  parseLoopPoints,
  pickVariant,
  selectSoundSource,
  voiceVariation,
  type AudioBus,
  type LoopPoints,
  type SoundName,
} from '../fx/audio/soundCatalog';
import { dbToGain, semitonesToRate } from '../fx/core/easing';
import { createFxRng } from '../fx/core/rng';
import { bgmFile, bgmPath, type BgmName } from '../types/assetPaths';
import { assetUrl, hasAsset } from './assets';
import { readStorage, writeStorage } from './storage';

/**
 * Audio engine: one AudioContext (latencyHint interactive) created and resumed on the first user
 * gesture; sfx/ui/music/ambience buses → master → DynamicsCompressor. Sound files under
 * public/assets/audio provide BGM and override procedural SFX placeholders.
 */
const MUTE_KEY = 'dragon-rush:muted';
const volumeKey = (bus: AudioBus) => `dragon-rush:volume:${bus}`;
const LOOPS_PATH = 'audio/bgm/loops.json';
/** A file that is still decoding plays late only within this window; later it is dropped. */
const LATE_START_MS = 120;

export type { AudioBus, SoundName };

export interface AudioSettings {
  readonly muted: boolean;
  readonly volumes: Readonly<Record<AudioBus, number>>;
  /** True once a user gesture has started the AudioContext. */
  readonly unlocked: boolean;
}

export interface PlayOptions {
  /** Extra gain on top of the catalogue volume. */
  readonly volume?: number;
  /** Pitch offset for rising sequences. */
  readonly semitones?: number;
  readonly delayMs?: number;
}

const clampVolume = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

function loadVolumes(): Record<AudioBus, number> {
  const out = { ...BUS_DEFAULTS };
  for (const bus of AUDIO_BUSES) {
    const raw = readStorage(volumeKey(bus));
    if (raw !== null && raw.trim() !== '' && Number.isFinite(Number(raw)))
      out[bus] = clampVolume(Number(raw));
  }
  return out;
}

let muted = readStorage(MUTE_KEY) === '1';
let volumes = loadVolumes();
const listeners = new Set<() => void>();
const playedListeners = new Set<(name: SoundName) => void>();

interface Graph {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly duck: GainNode;
  readonly buses: Readonly<Record<Exclude<AudioBus, 'master'>, GainNode>>;
}

let graph: Graph | null = null;
let graphUnavailable = false;

const makeSnapshot = (): AudioSettings => ({
  muted,
  volumes: { ...volumes },
  unlocked: graph?.ctx.state === 'running',
});
let snapshot = makeSnapshot();

function notify(): void {
  snapshot = makeSnapshot();
  for (const l of listeners) l();
}

function createGraph(): Graph | null {
  if (graph || graphUnavailable) return graph;
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    graphUnavailable = true;
    return null;
  }
  try {
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = COMPRESSOR.thresholdDb;
    comp.ratio.value = COMPRESSOR.ratio;
    comp.attack.value = COMPRESSOR.attackS;
    comp.release.value = COMPRESSOR.releaseS;
    comp.knee.value = COMPRESSOR.kneeDb;
    comp.connect(ctx.destination);
    const master = ctx.createGain();
    master.connect(comp);
    const bus = (dest: AudioNode) => {
      const g = ctx.createGain();
      g.connect(dest);
      return g;
    };
    const duck = bus(master);
    graph = {
      ctx,
      master,
      duck,
      buses: { music: bus(duck), ambience: bus(master), sfx: bus(master), ui: bus(master) },
    };
    ctx.addEventListener('statechange', notify);
    applyVolumes(true);
  } catch {
    graphUnavailable = true;
  }
  return graph;
}

function applyVolumes(immediate = false): void {
  if (graph) {
    const t = graph.ctx.currentTime;
    const set = (node: GainNode, v: number) =>
      immediate ? node.gain.setValueAtTime(v, t) : node.gain.setTargetAtTime(v, t, 0.03);
    set(graph.master, muted ? 0 : volumes.master);
    for (const b of ['music', 'ambience', 'sfx', 'ui'] as const) set(graph.buses[b], volumes[b]);
  }
  if (bgm?.kind === 'element') bgm.el.volume = muted ? 0 : volumes.master * volumes.music;
}

// --- Unlock -------------------------------------------------------------------------------

let unlockArmed = false;
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

function onGesture(): void {
  unlockAudio();
}

function armUnlock(): void {
  if (unlockArmed || typeof window === 'undefined') return;
  unlockArmed = true;
  for (const e of UNLOCK_EVENTS) window.addEventListener(e, onGesture, { capture: true });
}

function disarmUnlock(): void {
  if (!unlockArmed || typeof window === 'undefined') return;
  unlockArmed = false;
  for (const e of UNLOCK_EVENTS) window.removeEventListener(e, onGesture, { capture: true });
}

/** Call from a user gesture (any click works; listeners are installed automatically). */
export function unlockAudio(): void {
  const g = createGraph();
  if (!g) {
    disarmUnlock();
    if (bgm?.kind === 'element') bgm.el.play().catch(armUnlock);
    else syncBgm(true);
    return;
  }
  if (g.ctx.state === 'running') {
    disarmUnlock();
    preloadSounds();
    syncBgm(bgm?.kind === 'element');
    notify();
    return;
  }
  g.ctx
    .resume()
    .then(() => {
      disarmUnlock();
      preloadSounds();
      syncBgm(true);
      notify();
    })
    .catch(() => undefined);
}

export const isAudioUnlocked = (): boolean => graph?.ctx.state === 'running';

// --- Buffers ------------------------------------------------------------------------------

const buffers = new Map<string, AudioBuffer>();
const bufferLoads = new Map<string, Promise<AudioBuffer | null>>();
const failedFiles = new Set<string>();
// Long decoded music tracks have their own bounded cache; SFX stay preloaded.
const bgmBuffers = new Map<string, AudioBuffer>();
const bgmBufferLoads = new Map<string, Promise<AudioBuffer | null>>();
const BGM_BUFFER_LIMIT = 2;

function fetchBuffer(g: Graph, path: string): Promise<AudioBuffer> {
  return fetch(assetUrl(path))
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((data) => g.ctx.decodeAudioData(data));
}

function loadBuffer(path: string): Promise<AudioBuffer | null> {
  const g = graph;
  if (!g) return Promise.resolve(null);
  let p = bufferLoads.get(path);
  if (!p) {
    p = fetchBuffer(g, path)
      .then((buf) => {
        buffers.set(path, buf);
        return buf;
      })
      .catch(() => {
        failedFiles.add(path);
        return null;
      });
    bufferLoads.set(path, p);
  }
  return p;
}

function loadBgmBuffer(path: string): Promise<AudioBuffer | null> {
  const g = graph;
  if (!g || failedFiles.has(path)) return Promise.resolve(null);
  const cached = bgmBuffers.get(path);
  if (cached) {
    bgmBuffers.delete(path);
    bgmBuffers.set(path, cached);
    return Promise.resolve(cached);
  }
  let pending = bgmBufferLoads.get(path);
  if (!pending) {
    pending = fetchBuffer(g, path)
      .then((buf) => {
        if (graph === g) {
          bgmBuffers.set(path, buf);
          const active = bgm?.kind === 'buffer' ? `audio/bgm/${bgm.file}` : null;
          for (const key of bgmBuffers.keys()) {
            if (bgmBuffers.size <= BGM_BUFFER_LIMIT) break;
            if (key !== active) bgmBuffers.delete(key);
          }
        }
        return buf;
      })
      .catch(() => {
        failedFiles.add(path);
        return null;
      })
      .finally(() => {
        if (bgmBufferLoads.get(path) === pending) bgmBufferLoads.delete(path);
      });
    bgmBufferLoads.set(path, pending);
  }
  return pending;
}

/** Fetches and decodes every sound file in the manifest (runs after unlock). */
export function preloadSounds(): void {
  for (const name of SOUND_NAMES) {
    const src = selectSoundSource(name, hasAsset, failedFiles);
    if (src.kind === 'file') for (const p of src.paths) void loadBuffer(p);
  }
}

// --- Voices -------------------------------------------------------------------------------

const rng = createFxRng(0xa0d10);
const limiter = createVoiceLimiter();
const lastVariant = new Map<SoundName, number>();
const voices = new Map<number, GainNode>();
let nextVoiceId = 1;

function stopVoice(id: number): void {
  const v = voices.get(id);
  if (!v || !graph) return;
  const t = graph.ctx.currentTime;
  v.gain.cancelScheduledValues(t);
  v.gain.setTargetAtTime(0, t, 0.01);
  voices.delete(id);
  setTimeout(() => v.disconnect(), 120);
}

function startVoice(
  g: Graph,
  name: SoundName,
  startAt: number,
  gain: number,
  build: (out: GainNode) => number,
): void {
  const spec = SOUND_SPEC[name];
  const id = nextVoiceId++;
  const voice = g.ctx.createGain();
  voice.gain.value = gain;
  voice.connect(g.buses[spec.bus]);
  const length = build(voice);
  const nowMs = g.ctx.currentTime * 1000;
  const admission = limiter.admit(
    name,
    startAt * 1000,
    (startAt + length) * 1000,
    id,
    spec.maxVoices,
  );
  if (!admission.ok) {
    voice.disconnect();
    return;
  }
  for (const old of admission.evict) stopVoice(old);
  voices.set(id, voice);
  setTimeout(
    () => {
      if (voices.get(id) === voice) {
        voices.delete(id);
        voice.disconnect();
      }
    },
    Math.max(0, startAt * 1000 - nowMs) + length * 1000 + 200,
  );
  if (spec.duck) duckMusic(startAt);
  for (const l of playedListeners) l(name);
}

function playProcedural(
  g: Graph,
  name: SoundName,
  startAt: number,
  rate: number,
  gain: number,
): void {
  const spec = SOUND_SPEC[name];
  const variant = spec.vary
    ? pickVariant(PROCEDURAL_VARIANTS, lastVariant.get(name) ?? -1, rng)
    : 0;
  lastVariant.set(name, variant);
  startVoice(g, name, startAt, gain, (out) => synthesize(name, g.ctx, out, startAt, rate, variant));
}

function playBuffer(
  g: Graph,
  name: SoundName,
  buf: AudioBuffer,
  startAt: number,
  rate: number,
  gain: number,
): void {
  startVoice(g, name, startAt, gain, (out) => {
    const src = g.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.connect(out);
    src.start(startAt);
    return buf.duration / rate;
  });
}

/** Plays a sound effect: a file when one exists, otherwise the procedural placeholder. */
export function playSound(name: SoundName, opts: PlayOptions = {}): void {
  armUnlockIfLocked();
  if (muted) return;
  const g = graph;
  const source = selectSoundSource(name, hasAsset, failedFiles);
  if (!g || g.ctx.state !== 'running') {
    // No Web Audio at all: fall back to a plain element for real files.
    if (graphUnavailable && source.kind === 'file' && typeof Audio !== 'undefined') {
      const el = new Audio(assetUrl(source.paths[0]!));
      el.volume = clampVolume(volumes.master * volumes[SOUND_SPEC[name].bus] * (opts.volume ?? 1));
      el.play().catch(() => undefined);
    }
    return;
  }
  const spec = SOUND_SPEC[name];
  const variation = voiceVariation(rng, spec.vary);
  const rate = variation.rate * semitonesToRate(opts.semitones ?? 0);
  const gain = variation.gain * spec.volume * (opts.volume ?? 1);
  const startAt = g.ctx.currentTime + Math.max(0, opts.delayMs ?? 0) / 1000;
  if (source.kind === 'procedural') {
    playProcedural(g, name, startAt, rate, gain);
    return;
  }
  const v = spec.vary ? pickVariant(source.paths.length, lastVariant.get(name) ?? -1, rng) : 0;
  lastVariant.set(name, v);
  const path = source.paths[v] ?? source.paths[0]!;
  const buf = buffers.get(path);
  if (buf) {
    playBuffer(g, name, buf, startAt, rate, gain);
    return;
  }
  const requested = g.ctx.currentTime;
  void loadBuffer(path).then((loaded) => {
    const lateMs = (g.ctx.currentTime - requested) * 1000;
    if (loaded && lateMs <= LATE_START_MS)
      playBuffer(g, name, loaded, Math.max(startAt, g.ctx.currentTime), rate, gain);
    else if (!loaded) playProcedural(g, name, Math.max(startAt, g.ctx.currentTime), rate, gain);
  });
}

/** Music drops to −9 dB, holds 400 ms, then recovers. */
export function duckMusic(at?: number): void {
  const g = graph;
  if (!g) return;
  const t = Math.max(g.ctx.currentTime, at ?? 0);
  const p = g.duck.gain;
  p.cancelScheduledValues(t);
  p.setTargetAtTime(dbToGain(DUCK.db), t, DUCK.attackTc);
  p.setTargetAtTime(1, t + DUCK.holdMs / 1000, DUCK.releaseTc);
}

/** Listens to every sound that actually starts (captions, debug HUD). */
export function onSoundPlayed(listener: (name: SoundName) => void): () => void {
  playedListeners.add(listener);
  return () => playedListeners.delete(listener);
}

function armUnlockIfLocked(): void {
  if (!isAudioUnlocked()) armUnlock();
}

// --- Music --------------------------------------------------------------------------------

type BgmPlayer =
  | {
      readonly kind: 'buffer';
      readonly file: string;
      readonly src: AudioBufferSourceNode;
      readonly gain: GainNode;
    }
  | { readonly kind: 'element'; readonly file: string; readonly el: HTMLAudioElement };

let wantedBgm: BgmName | null = null;
let playingBgm: BgmName | null = null;
let bgm: BgmPlayer | null = null;
let loopPoints: Promise<Record<string, LoopPoints>> | null = null;
let bgmRequest = 0;

function loadLoopPoints(): Promise<Record<string, LoopPoints>> {
  if (!loopPoints) {
    loopPoints = hasAsset(LOOPS_PATH)
      ? fetch(assetUrl(LOOPS_PATH))
          .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
          .then(parseLoopPoints)
          .catch(() => ({}))
      : Promise.resolve({});
  }
  return loopPoints;
}

function stopBgm(forResult = false): number {
  const cur = bgm;
  bgm = null;
  playingBgm = null;
  if (!cur) return graph?.ctx.currentTime ?? 0;
  if (cur.kind === 'element') {
    cur.el.pause();
    return graph?.ctx.currentTime ?? 0;
  }
  const g = graph;
  if (!g) return 0;
  const t = g.ctx.currentTime;
  cur.gain.gain.cancelScheduledValues(t);
  cur.gain.gain.setTargetAtTime(0, t, forResult ? 0.01 : 0.02);
  const stopAt = t + (forResult ? 0.06 : 0.08);
  cur.src.stop(stopAt);
  setTimeout(() => {
    cur.src.disconnect();
    cur.gain.disconnect();
  }, 120);
  return stopAt;
}

function startBgmBuffer(
  g: Graph,
  file: string,
  buf: AudioBuffer,
  startAt: number,
  lp?: LoopPoints,
): void {
  const src = g.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  if (lp && lp.loopEnd <= buf.duration) {
    src.loopStart = lp.loopStart;
    src.loopEnd = lp.loopEnd;
  }
  const gain = g.ctx.createGain();
  const t = Math.max(g.ctx.currentTime, startAt);
  gain.gain.setValueAtTime(0, t);
  gain.gain.setTargetAtTime(1, t, 0.15);
  src.connect(gain).connect(g.buses.music);
  src.start(t);
  bgm = { kind: 'buffer', file, src, gain };
}

function syncBgm(force = false): void {
  const target = muted ? null : wantedBgm;
  if (target === playingBgm && !force) return;
  if (!force && target && playingBgm && bgmFile(target) === bgmFile(playingBgm)) {
    playingBgm = target;
    return;
  }
  if (!force && target && bgm?.file === bgmFile(target)) {
    ++bgmRequest;
    playingBgm = target;
    return;
  }
  const request = ++bgmRequest;
  if (!target) {
    stopBgm();
    return;
  }
  const g = graph;
  if (g && g.ctx.state === 'running') {
    playingBgm = target;
    if (!hasAsset(bgmPath(target))) {
      stopBgm();
      playingBgm = target;
      return;
    }
    void Promise.all([loadBgmBuffer(bgmPath(target)), loadLoopPoints()]).then(([buf, loops]) => {
      if (request !== bgmRequest || !playingBgm || bgmFile(playingBgm) !== bgmFile(target)) return;
      const startAt = stopBgm(target.startsWith('result_'));
      playingBgm = target;
      if (buf) startBgmBuffer(g, bgmFile(target), buf, startAt, loops[bgmFile(target)]);
    });
    return;
  }
  stopBgm();
  if (!graphUnavailable || !hasAsset(bgmPath(target)) || typeof Audio === 'undefined') return;
  // Browsers without Web Audio use a plain element after the unlock gesture.
  const el = new Audio(assetUrl(bgmPath(target)));
  el.loop = true;
  el.volume = volumes.master * volumes.music;
  el.play().catch(armUnlock);
  playingBgm = target;
  bgm = { kind: 'element', file: bgmFile(target), el };
}

export function playBgm(name: BgmName | null): void {
  armUnlockIfLocked();
  wantedBgm = name;
  syncBgm();
}

// --- Settings -----------------------------------------------------------------------------

export const isMuted = (): boolean => muted;

export function setMuted(value: boolean): void {
  if (value === muted) return;
  muted = value;
  writeStorage(MUTE_KEY, value ? '1' : '0');
  applyVolumes();
  syncBgm();
  notify();
}

export function setVolume(bus: AudioBus, value: number): void {
  const v = clampVolume(value);
  if (volumes[bus] === v) return;
  volumes = { ...volumes, [bus]: v };
  writeStorage(volumeKey(bus), String(v));
  applyVolumes();
  notify();
}

export const getAudioSettings = (): AudioSettings => snapshot;

export function subscribeAudio(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Vite replaces modules without unloading the page, so old AudioContexts must be closed. */
export function disposeAudio(): void {
  ++bgmRequest;
  wantedBgm = null;
  if (bgm?.kind === 'element') bgm.el.pause();
  if (bgm?.kind === 'buffer') {
    bgm.src.stop();
    bgm.src.disconnect();
    bgm.gain.disconnect();
  }
  bgm = null;
  playingBgm = null;
  bgmBuffers.clear();
  bgmBufferLoads.clear();
  disarmUnlock();
  if (graph) {
    void graph.ctx.close();
    graph = null;
  }
  listeners.clear();
  playedListeners.clear();
}

if (import.meta.hot) import.meta.hot.dispose(disposeAudio);
