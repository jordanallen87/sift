import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Root-level scenario tests (docs/specs/testing.md "Scenario tests"),
// mirroring `scripts/vitest.config.ts`'s own pattern for a non-package
// top-level directory: `root: '.'` resolves against the process cwd (the
// monorepo root), not this file's own directory, when loaded as one of the
// root config's `test.projects` (the normal `pnpm test:unit` path) -- an
// absolute path derived from this file's own location keeps this project
// correctly self-scoped regardless of invocation directory.
const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'tests',
    root: packageRoot,
    environment: 'node',
    // Scenario tests drive a real Strands Graph end to end (six agent
    // nodes, two full rounds); the default test timeout is too tight.
    testTimeout: 30_000,
    include: ['**/*.test.ts'],
    passWithNoTests: true,
  },
});
