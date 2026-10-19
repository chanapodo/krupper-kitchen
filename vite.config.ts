import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Short commit sha, shown in settings and compared against dist/version.json to spot a newer deploy.
const VERSION = (process.env.GITHUB_SHA || (() => {
  try { return execSync('git rev-parse HEAD').toString(); } catch { return 'dev'; }
})()).trim().slice(0, 7);

/** version.json for the update check, and a per-deploy cache name in sw.js so old assets are dropped. */
const stampVersion = (): Plugin => ({
  name: 'stamp-version',
  apply: 'build',
  writeBundle({ dir }) {
    writeFileSync(`${dir}/version.json`, JSON.stringify({ version: VERSION }));
    const sw = `${dir}/sw.js`;
    writeFileSync(sw, readFileSync(sw, 'utf8').replace('__VERSION__', VERSION));
  },
});

// BASE_PATH is set by the GitHub Pages workflow ("/<repo>/"); "/" locally.
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  plugins: [react(), stampVersion()],
  build: { chunkSizeWarningLimit: 700 },
  test: { include: ['tests/**/*.test.ts'] },
} as never);
