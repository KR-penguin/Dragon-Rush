import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/env-server.ts', 'src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  noExternal: [/^@hero-dice\//],
});
