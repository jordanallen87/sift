import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// `root: '.'` resolves against the process cwd (the monorepo root), not this
// file's own directory, when loaded as one of the root config's
// `test.projects` (the normal `pnpm test:unit` path). Before this fix, that
// meant a bare `include: ['**/*.test.ts']` matched every `.test.ts` file in
// the entire workspace and ran each one a second time under this project's
// `node` environment -- silently passing for any file that never touched a
// DOM global, and failing with `ReferenceError: document is not defined`
// for the first one that did (`apps/web/src/model-context/adapter.test.ts`,
// a real 2026-08-27 bug, not a hypothetical one -- see docs/build-log.md's
// dated entry, which also covers the mirror-image bug this same root cause
// caused in every *other* project: each one resolving `src/**/*.test.ts`
// against the repo root instead of its own package, finding zero of its own
// tests). An absolute path derived from this file's own location keeps this
// project correctly self-scoped regardless of invocation directory, exactly
// like every other package's `vitest.config.ts` now does.
const packageRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    name: 'scripts',
    root: packageRoot,
    environment: 'node',
    include: ['**/*.test.ts'],
    passWithNoTests: true,
  },
});
