import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The game's version comes from package.json (bump it with `npm version patch|minor|major`).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Short commit hash of the build, so a bug report can name the exact build. Empty if unknown. */
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  // Relative base so the build works from any static host (GitHub Pages, itch.io, Tauri).
  base: './',
  server: { port: 5173 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit()),
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
