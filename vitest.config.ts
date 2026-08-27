import { defineConfig } from 'vitest/config';

// Root Vitest configuration. Pax uses Vitest's `test.projects` (the current
// replacement for the deprecated `vitest.workspace.ts` file — see
// https://vitest.dev/guide/projects and the installed vitest@4 type
// declarations, which no longer export `defineWorkspace`) to run every
// package/app test suite plus the root `scripts/` guard-script tests from a
// single `pnpm test:unit` invocation.
//
// Package projects are discovered by glob rather than hand-listed so new
// workspace packages are picked up automatically. Packages without a
// `vitest.config.ts` yet are simply not matched by the glob.
export default defineConfig({
  test: {
    projects: [
      'apps/*/vitest.config.ts',
      'packages/*/vitest.config.ts',
      'scripts/vitest.config.ts',
      'tests/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './artifacts/verification/coverage',
      thresholds: {
        branches: 90,
        functions: 95,
        lines: 95,
        statements: 95,
      },
      exclude: [
        '**/dist/**',
        '**/*.config.*',
        '**/*.test.ts',
        '**/test/**',
        '**/fixtures/**',
        'scripts/**',
      ],
    },
  },
});
