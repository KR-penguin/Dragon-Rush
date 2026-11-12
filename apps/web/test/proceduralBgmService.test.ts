import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/assets', () => ({
  hasAsset: () => false,
  assetUrl: (path: string) => path,
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

const sources: (FakeNode & {
  buffer: AudioBuffer | null;
  loop: boolean;
  started: boolean;
  stopped: boolean;
  start(): void;
  stop(): void;
})[] = [];
const gains: (FakeNode & { gain: ReturnType<typeof param> })[] = [];

class FakeAudioContext {
  static initialState: AudioContextState = 'suspended';
  sampleRate = 8000;
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
  createBuffer(_channels: number, length: number, sampleRate: number) {
    const data = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => data } as unknown as AudioBuffer;
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
  sources.length = 0;
  gains.length = 0;
  FakeAudioContext.initialState = 'suspended';
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

describe('procedural BGM through the audio bus', () => {
  it('waits for unlock, loops through music gain, follows volume and mute, and changes scenes', async () => {
    const audio = await import('../src/services/audio');
    audio.playBgm('board');
    expect(sources).toHaveLength(0);

    audio.unlockAudio();
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    const board = sources[0]!;
    expect(board.started).toBe(true);
    expect(board.loop).toBe(true);
    expect(board.buffer?.getChannelData(0).some((sample) => Math.abs(sample) > 0.05)).toBe(true);
    const fade = board.connections[0]!;
    const music = fade.connections[0] as FakeNode & { gain: ReturnType<typeof param> };
    expect(gains).toContain(music);
    audio.setVolume('music', 0.23);
    expect(music.gain.targets.at(-1)).toBe(0.23);
    const master = music.connections[0]!.connections[0] as FakeNode & {
      gain: ReturnType<typeof param>;
    };
    audio.setVolume('master', 0.8);
    expect(master.gain.targets.at(-1)).toBe(0.8);

    audio.setMuted(true);
    expect(board.stopped).toBe(true);
    expect(sources).toHaveLength(1);
    audio.setMuted(false);
    expect(sources).toHaveLength(2);
    expect(sources[1]!.loop).toBe(true);

    audio.playBgm('dragon_battle');
    expect(sources[1]!.stopped).toBe(true);
    expect(sources).toHaveLength(3);
    audio.playBgm(null);
    expect(sources[2]!.stopped).toBe(true);
  });

  it('starts the pending loop when the context is already running on creation', async () => {
    FakeAudioContext.initialState = 'running';
    const audio = await import('../src/services/audio');
    audio.playBgm('lobby');
    expect(sources).toHaveLength(0);
    audio.unlockAudio();
    expect(sources).toHaveLength(1);
    expect(sources[0]!.loop).toBe(true);
  });
});
