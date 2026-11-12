import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';

const victoryPath = 'audio/bgm/triumph_of_the_hero.mp3';
const victoryFile = fileURLToPath(new URL(`../public/assets/${victoryPath}`, import.meta.url));
const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url));

vi.mock('virtual:asset-manifest', () => ({
  default: { [victoryPath]: 'replacement-sha256' },
}));

describe('versioned public assets', () => {
  let server: ViteDevServer;

  beforeAll(async () => {
    server = await createServer({
      configFile,
      root: fileURLToPath(new URL('../', import.meta.url)),
      logLevel: 'silent',
      server: { middlewareMode: true },
    });
  });

  afterAll(async () => {
    await server?.close();
  });

  it('publishes the current file content hash for victory music', async () => {
    const resolved = await server.pluginContainer.resolveId('virtual:asset-manifest');
    expect(resolved?.id).toBe('\0virtual:asset-manifest');
    const loaded = await server.pluginContainer.load(resolved!.id);
    expect(typeof loaded).toBe('string');
    const manifest = JSON.parse(
      (loaded as string).replace(/^export default /, '').replace(/;$/, ''),
    ) as Record<string, string>;
    const digest = createHash('sha256').update(readFileSync(victoryFile)).digest('hex');
    expect(manifest[victoryPath]).toBe(digest);
  });

  it('reloads when an existing music file changes', async () => {
    const mod = await server.moduleGraph.ensureEntryFromUrl('virtual:asset-manifest');
    const invalidate = vi.spyOn(server.moduleGraph, 'invalidateModule');
    const send = vi.spyOn(server.ws, 'send');
    server.watcher.emit('change', victoryFile);
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'full-reload' }));
    expect(invalidate).toHaveBeenCalledWith(mod);
    invalidate.mockRestore();
    send.mockRestore();
  });

  it('uses the manifest digest in the browser URL', async () => {
    const { assetUrl, hasAsset, resolveAsset } = await import('../src/services/assets');
    expect(hasAsset(victoryPath)).toBe(true);
    expect(assetUrl(victoryPath)).toBe(`/assets/${victoryPath}?v=replacement-sha256`);
    expect(resolveAsset(victoryPath)).toBe(`/assets/${victoryPath}?v=replacement-sha256`);
    expect(resolveAsset('audio/bgm/missing.mp3')).toBeNull();
  });
});
