import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const ASSETS_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), 'public', 'assets');

function listFiles(dir: string): Record<string, string> {
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory()
        ? Object.entries(listFiles(full))
        : [
            [
              relative(ASSETS_DIR, full).split(sep).join('/'),
              createHash('sha256').update(readFileSync(full)).digest('hex'),
            ],
          ];
    }),
  );
}

/** Exposes existing public assets and their content digests for stable cache-busted URLs. */
function assetManifest(): Plugin {
  const id = 'virtual:asset-manifest';
  const resolved = `\0${id}`;
  return {
    name: 'dragon-rush-asset-manifest',
    resolveId: (source) => (source === id ? resolved : null),
    load: (source) =>
      source === resolved ? `export default ${JSON.stringify(listFiles(ASSETS_DIR))};` : null,
    configureServer(server) {
      server.watcher.add(ASSETS_DIR);
      let reloadTimer: ReturnType<typeof setTimeout> | undefined;
      const refresh = (file: string) => {
        const path = relative(ASSETS_DIR, resolve(file));
        if (path.startsWith('..') || isAbsolute(path)) return;
        if (reloadTimer) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          const mod = server.moduleGraph.getModuleById(resolved);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }, 100);
      };
      // Folders count too: files copied in together with a new folder may not get their own event.
      for (const event of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const)
        server.watcher.on(event, refresh);
    },
  };
}

export default defineConfig({
  plugins: [react(), assetManifest()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['unmythologically-nondamaging-holli.ngrok-free.dev'],
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': 'http://localhost:3001',
    },
  },
});
