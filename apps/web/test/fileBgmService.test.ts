import { beforeEach, describe, expect, it, vi } from 'vitest';

const BGM_PATH = 'audio/bgm/dragon_foothills.mp3';

vi.mock('../src/services/assets', () => ({
  hasAsset: (path: string) => path === BGM_PATH,
  assetUrl: (path: string) => `/assets/${path}`,
}));
vi.mock('../src/services/storage', () => ({
  readStorage: () => null,
  writeStorage: vi.fn(),
}));

interface FakeNode {
  readonly connections: FakeNode[];
  connect(dest: FakeNode): FakeNode;
  disconnect(): void;
}

function node(): FakeNode {
  return {
    connections: [],
    connect(dest) {
      this.connections.push(dest);
      return dest;
    },
    disconnect() {},
  };
}

function param() {
  return {
    value: 1,
    targets: [] as number[],
    setValueAtTime(value: number) {
      this.value = value;
    },
    setTargetAtTime(value: number) {
      this.value = value;
      this.targets.push(value);
    },
    cancelScheduledValues() {},
  };
}

const fileBuffer = { duration: 120 } as AudioBuffer;
const sources: (FakeNode & {
  buffer: AudioBuffer | null;
  loop: boolean;
  started: boolean;
  stopped: boolean;
  start(): void;
  stop(): void;
})[] = [];
const gains: (FakeNode & { gain: ReturnType<typeof param> })[] = [];
let decodeFails = false;
let decodeCount = 0;

class FakeAudioContext {
  static initialState: AudioContextState = 'suspended';
  currentTime = 0;
  state: AudioContextState = FakeAudioContext.initialState;
  destination = node();
  createDynamicsCompressor() {
    return Object.assign(node(), {
      threshold: param(),
      ratio: param(),
      attack: param(),
      release: param(),
      knee: param(),
    });
  }
  createGain() {
    const gain = Object.assign(node(), { gain: param() });
    gains.push(gain);
    return gain;
  }
  createBuffer() {
    throw new Error('Procedural BGM must not be rendered');
  }
  decodeAudioData() {
    decodeCount++;
    return decodeFails ? Promise.reject(new Error('bad MP3')) : Promise.resolve(fileBuffer);
  }
  createBufferSource() {
    const source = Object.assign(node(), {
      buffer: null as AudioBuffer | null,
      loop: false,
      started: false,
      stopped: false,
      start() {
        this.started = true;
      },
      stop() {
        this.stopped = true;
      },
    });
    sources.push(source);
    return source;
  }
  addEventListener() {}
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  sources.length = 0;
  gains.length = 0;
  decodeFails = false;
  decodeCount = 0;
  FakeAudioContext.initialState = 'suspended';
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })),
  );
});

describe('file BGM through the audio bus', () => {
  it('starts on unlock, shares one decoded file, restarts for scenes, and follows volume and mute', async () => {
    const audio = await import('../src/services/audio');
    audio.playBgm('lobby');
    expect(sources).toHaveLength(0);

    audio.unlockAudio();
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(sources[0]!.buffer).toBe(fileBuffer);
    expect(sources[0]!.loop).toBe(true);
    const music = sources[0]!.connections[0]!.connections[0] as FakeNode & {
      gain: ReturnType<typeof param>;
    };
    expect(gains).toContain(music);
    audio.setVolume('music', 0.23);
    expect(music.gain.targets.at(-1)).toBe(0.23);
    const master = music.connections[0]!.connections[0] as FakeNode & {
      gain: ReturnType<typeof param>;
    };
    audio.setVolume('master', 0.8);
    expect(master.gain.targets.at(-1)).toBe(0.8);

    audio.playBgm('board');
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[0]!.stopped).toBe(true);
    expect(sources[1]!.buffer).toBe(fileBuffer);
    audio.playBgm('dragon_battle');
    await vi.waitFor(() => expect(sources).toHaveLength(3));
    expect(sources[1]!.stopped).toBe(true);
    expect(sources[2]!.buffer).toBe(fileBuffer);
    expect(decodeCount).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`/assets/${BGM_PATH}`);

    audio.setMuted(true);
    expect(sources[2]!.stopped).toBe(true);
    audio.setMuted(false);
    await vi.waitFor(() => expect(sources).toHaveLength(4));
    audio.playBgm(null);
    expect(sources[3]!.stopped).toBe(true);
  });

  it('does not synthesize music when a listed file cannot be decoded', async () => {
    decodeFails = true;
    const audio = await import('../src/services/audio');
    audio.playBgm('board');
    audio.unlockAudio();
    await vi.waitFor(() => expect(decodeCount).toBe(1));
    await Promise.resolve();
    expect(sources).toHaveLength(0);
  });

  it('uses the file after a gesture when Web Audio is unavailable', async () => {
    const elements: FakeAudio[] = [];
    class FakeAudio {
      loop = false;
      volume = 1;
      readonly play = vi.fn(async () => undefined);
      readonly pause = vi.fn();
      constructor(readonly src: string) {
        elements.push(this);
      }
    }
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('Audio', FakeAudio);
    const audio = await import('../src/services/audio');
    audio.playBgm('lobby');
    expect(elements).toHaveLength(0);
    audio.unlockAudio();
    expect(elements).toHaveLength(1);
    expect(elements[0]!.src).toBe(`/assets/${BGM_PATH}`);
    expect(elements[0]!.loop).toBe(true);
    audio.unlockAudio();
    expect(elements).toHaveLength(1);
    audio.playBgm('board');
    expect(elements).toHaveLength(2);
    expect(elements[0]!.pause).toHaveBeenCalledOnce();
  });
});
