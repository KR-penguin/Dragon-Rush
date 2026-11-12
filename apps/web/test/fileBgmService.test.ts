import { beforeEach, describe, expect, it, vi } from 'vitest';

const MENU_PATH = 'audio/bgm/menu.mp3';
const BATTLE_PATH = 'audio/bgm/battle.mp3';

vi.mock('../src/services/assets', () => ({
  hasAsset: (path: string) =>
    path === MENU_PATH || path === BATTLE_PATH || path.startsWith('audio/bgm/result_'),
  assetUrl: (path: string) => `/assets/${path}`,
}));
vi.mock('../src/services/storage', () => ({
  readStorage: () => null,
  writeStorage: vi.fn(),
}));

interface FakeNode {
  readonly connections: FakeNode[];
  disconnected: boolean;
  connect(dest: FakeNode): FakeNode;
  disconnect(): void;
}

function node(): FakeNode {
  return {
    connections: [],
    disconnected: false,
    connect(dest) {
      this.connections.push(dest);
      return dest;
    },
    disconnect() {
      this.disconnected = true;
    },
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
  startAt: number;
  stopAt: number;
  start(at: number): void;
  stop(at: number): void;
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
      startAt: -1,
      stopAt: -1,
      start(at: number) {
        this.started = true;
        this.startAt = at;
      },
      stop(at: number) {
        this.stopped = true;
        this.stopAt = at;
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
  it('replaces board music with the selected result file without overlap and obeys mute', async () => {
    const audio = await import('../src/services/audio');
    audio.playBgm('board');
    audio.unlockAudio();
    await vi.waitFor(() => expect(sources).toHaveLength(1));

    audio.playBgm('result_victory');
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[0]!.stopped).toBe(true);
    expect(sources[1]!.startAt).toBeGreaterThanOrEqual(sources[0]!.stopAt);
    expect(fetch).toHaveBeenCalledWith('/assets/audio/bgm/result_victory.mp3');
    expect(sources[1]!.loop).toBe(true);

    audio.setMuted(true);
    expect(sources[1]!.stopped).toBe(true);
    audio.setMuted(false);
    await vi.waitFor(() => expect(sources).toHaveLength(3));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('discards a late board decode after the result track is requested', async () => {
    let releaseBoard: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        arrayBuffer: () =>
          url.endsWith(MENU_PATH)
            ? new Promise<ArrayBuffer>((resolve) => {
                releaseBoard = () => resolve(new ArrayBuffer(8));
              })
            : Promise.resolve(new ArrayBuffer(8)),
      })),
    );
    const audio = await import('../src/services/audio');
    audio.playBgm('board');
    audio.unlockAudio();
    await vi.waitFor(() => expect(releaseBoard).toBeDefined());
    audio.playBgm('result_defeat');
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    releaseBoard!();
    await vi.waitFor(() => expect(decodeCount).toBe(2));
    expect(sources).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith('/assets/audio/bgm/result_defeat.mp3');
  });

  it('keeps menu playing while battle decodes, then switches without overlap', async () => {
    let releaseBattle: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        arrayBuffer: () =>
          url.endsWith(BATTLE_PATH)
            ? new Promise<ArrayBuffer>((resolve) => {
                releaseBattle = () => resolve(new ArrayBuffer(8));
              })
            : Promise.resolve(new ArrayBuffer(8)),
      })),
    );
    const audio = await import('../src/services/audio');
    audio.playBgm('board');
    audio.unlockAudio();
    await vi.waitFor(() => expect(sources).toHaveLength(1));

    audio.playBgm('dragon_battle');
    await vi.waitFor(() => expect(releaseBattle).toBeDefined());
    expect(sources[0]!.stopped).toBe(false);
    releaseBattle!();
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[0]!.stopped).toBe(true);
    expect(sources[1]!.startAt).toBeGreaterThanOrEqual(sources[0]!.stopAt);
  });

  it('starts on unlock, shares menu for lobby and board, and switches to battle', async () => {
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
    expect(sources).toHaveLength(1);
    expect(sources[0]!.stopped).toBe(false);
    audio.playBgm('dragon_battle');
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[0]!.stopped).toBe(true);
    expect(sources[1]!.startAt).toBeGreaterThanOrEqual(sources[0]!.stopAt);
    expect(sources[1]!.buffer).toBe(fileBuffer);
    await vi.waitFor(() => expect(sources[0]!.disconnected).toBe(true), { timeout: 2000 });
    expect(sources[0]!.connections[0]!.disconnected).toBe(true);
    expect(decodeCount).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(`/assets/${MENU_PATH}`);
    expect(fetch).toHaveBeenCalledWith(`/assets/${BATTLE_PATH}`);

    audio.setMuted(true);
    expect(sources[1]!.stopped).toBe(true);
    audio.setMuted(false);
    await vi.waitFor(() => expect(sources).toHaveLength(3));
    audio.playBgm(null);
    expect(sources[2]!.stopped).toBe(true);
  });

  it('returns from battle to the menu without playing both tracks together', async () => {
    const audio = await import('../src/services/audio');
    audio.playBgm('dragon_battle');
    audio.unlockAudio();
    await vi.waitFor(() => expect(sources).toHaveLength(1));

    audio.playBgm('lobby');
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[1]!.startAt).toBeGreaterThanOrEqual(sources[0]!.stopAt);
    audio.playBgm('board');
    expect(sources).toHaveLength(2);
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
    expect(elements[0]!.src).toBe(`/assets/${MENU_PATH}`);
    expect(elements[0]!.loop).toBe(true);
    audio.unlockAudio();
    expect(elements).toHaveLength(1);
    audio.playBgm('board');
    expect(elements).toHaveLength(1);
    expect(elements[0]!.pause).not.toHaveBeenCalled();
    audio.playBgm('result_draw');
    expect(elements).toHaveLength(2);
    expect(elements[0]!.pause).toHaveBeenCalledOnce();
    expect(elements[1]!.src).toBe('/assets/audio/bgm/result_draw.mp3');
    audio.setVolume('music', 0.3);
    expect(elements[1]!.volume).toBe(0.3);
    audio.setMuted(true);
    expect(elements[1]!.pause).toHaveBeenCalledOnce();
  });
});
