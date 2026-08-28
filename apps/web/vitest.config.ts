import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// `root: '.'` resolves against the process cwd (the monorepo root), not this
// file's own directory, when loaded as one of the root config's
// `test.projects` -- an absolute path derived from this file's own location
// keeps this project correctly self-scoped regardless of where `vitest` is
// invoked from. See docs/build-log.md's dated entry for the real bug this
// fixes (every project silently finding zero of its own tests via the
// aggregated `pnpm test:unit`/`pnpm verify` path).
const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    name: 'web',
    root: packageRoot,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    passWithNoTests: true,
  },
});
