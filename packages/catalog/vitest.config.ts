import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// See packages/packs/vitest.config.ts's identical comment: `root: '.'`
// resolves against the process cwd, not this file's own directory, when
// aggregated via the root config's `test.projects` -- an absolute path
// keeps this project correctly self-scoped regardless of invocation
// directory.
const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'catalog',
    root: packageRoot,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
