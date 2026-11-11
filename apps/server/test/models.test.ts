import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ACTION_DIM, ModelFormatError, OBS_DIM, type WeightAdapter } from '@hero-dice/ai';
import { C2S, PROTOCOL_VERSION, S2C, type Ack, type GameUpdateMsg, type RoomStateMsg } from '@hero-dice/protocol';
import { io as connectClient } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { loadModelRegistry } from '../src/ai/modelRegistry';
import { startServer } from '../src/app';

/** Test-only adapter: `{ "bias": number[47] }` -> constant logits. Not the user's format. */
const fakeAdapter: WeightAdapter = (raw, id) => {
  const bias = (raw as { bias?: unknown }).bias;
  if (!Array.isArray(bias) || bias.length !== ACTION_DIM) throw new ModelFormatError('bias must have 47 numbers');
  const meta = (raw as { meta?: { obs_version?: string } }).meta;
  return {
    meta: { id, obsVersion: meta?.obs_version ?? null, actVersion: null, output: 'logits', obsDim: OBS_DIM, actionDim: ACTION_DIM },
    forward: () => Float32Array.from(bias as number[]),
  };
};

function modelsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hero-models-'));
  const bias = Array.from({ length: ACTION_DIM }, (_, i) => (i === 2 ? -100 : i === 0 ? 5 : 0));
  writeFileSync(join(dir, 'roller.json'), JSON.stringify({ bias }));
  writeFileSync(join(dir, 'broken.json'), JSON.stringify({ bias: [1, 2] }));
  writeFileSync(join(dir, 'old-version.json'), JSON.stringify({ bias, meta: { obs_version: 'obs_v0' } }));
  writeFileSync(join(dir, 'Bad Name.json'), JSON.stringify({ bias }));
  return dir;
}

describe('model registry', () => {
  it('loads only valid, allow-listed, version-compatible files', () => {
    const skipped: string[] = [];
    const registry = loadModelRegistry(modelsDir(), fakeAdapter, (m) => skipped.push(m));
    expect(registry.list().map((m) => m.id)).toEqual(['roller']);
    expect(skipped.join('\n')).toContain('broken.json');
    expect(skipped.join('\n')).toContain('old-version.json');
  });

  it('registers nothing without an adapter', () => {
    expect(loadModelRegistry(modelsDir(), null).list()).toEqual([]);
  });

  it('plays an online game with a model seat', async () => {
    const server = await startServer(
      {
        port: 0,
        host: '127.0.0.1',
        turnTimeoutMs: 5000,
        reconnectGraceMs: 2000,
        botActionDelayMs: 0,
        maxConsecutiveTimeouts: 3,
        modelsDir: 'unused',
        webDistDir: null,
        roomTtlMs: 60_000,
        messagesPerSecond: 1000,
      },
      { quiet: true, models: loadModelRegistry(modelsDir(), fakeAdapter) },
    );
    const socket = connectClient(server.url, { transports: ['websocket'], auth: { protocolVersion: PROTOCOL_VERSION }, forceNew: true });
    const call = (event: string, payload: unknown = {}) => socket.timeout(5000).emitWithAck(event, payload) as Promise<Ack<unknown>>;
    let room: RoomStateMsg | null = null;
    socket.on(S2C.roomState, (r: RoomStateMsg) => (room = r));
    socket.on(S2C.gameUpdate, (u: GameUpdateMsg) => {
      if (u.legalActions?.length) {
        const action = u.legalActions.find((a) => a.type !== 'CHALLENGE_DRAGON') ?? u.legalActions[0]!;
        void call(C2S.gameAction, { action, stateVersion: u.version });
      }
    });
    await new Promise((r) => socket.once(S2C.sessionWelcome, r));
    await call(C2S.roomCreate, { nickname: 'Host' });
    expect(await call(C2S.roomConfigureSeat, { seat: 1, kind: 'model', modelId: 'missing' })).toMatchObject({ ok: false, error: { code: 'MODEL_NOT_FOUND' } });
    expect((await call(C2S.roomConfigureSeat, { seat: 1, kind: 'model', modelId: 'roller' })).ok).toBe(true);
    await call(C2S.roomConfigure, { maxRounds: 6 });
    await call(C2S.roomSelectJob, { job: 'berserker' });
    expect((await call(C2S.roomStart)).ok).toBe(true);
    const start = Date.now();
    while ((room as RoomStateMsg | null)?.status !== 'finished' && Date.now() - start < 20_000) await new Promise((r) => setTimeout(r, 20));
    expect((room as RoomStateMsg | null)?.status).toBe('finished');
    socket.disconnect();
    await server.close();
  });
});
