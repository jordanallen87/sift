import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// See apps/web/vitest.config.ts's comment: `root: '.'` resolves against the
// process cwd, not this file's own directory, when aggregated via the root
// config's `test.projects` -- an absolute path keeps this project correctly
// self-scoped regardless of invocation directory.
const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'ui',
    root: packageRoot,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
