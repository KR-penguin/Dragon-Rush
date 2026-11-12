import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const ASSETS_DIR = resolve(fileURLToPath(new URL('.', import.meta.url)), 'public', 'assets');

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory()
      ? listFiles(full)
      : [relative(ASSETS_DIR, full).split(sep).join('/')];
  });
}

/** Exposes the list of files under public/assets so the UI only requests art that exists (no 404s). */
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
      const refresh = (file: string) => {
        if (!resolve(file).startsWith(ASSETS_DIR)) return;
        const mod = server.moduleGraph.getModuleById(resolved);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      // Folders count too: files copied in together with a new folder may not get their own event.
      for (const event of ['add', 'unlink', 'addDir', 'unlinkDir'] as const)
        server.watcher.on(event, refresh);
    },
  };
}

export default defineConfig({
  plugins: [react(), assetManifest()],
  server: {
    port: 5173,
    allowedHosts: ['unmythologically-nondamaging-holli.ngrok-free.dev'],
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': 'http://localhost:3001',
    },
  },
});
