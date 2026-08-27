import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'agent',
    root: '.',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      // Mirrors the root `vitest.config.ts`'s coverage `exclude` so a
      // package-scoped `pnpm --filter @pax/agent test --coverage` run
      // reports the same meaningful percentages as the aggregated
      // `pnpm test:unit` run: test-support code under `src/fixtures/`
      // (synthetic packs, HTTP test harnesses, shared contract-test
      // helpers) is exercised incidentally by every test file that imports
      // it, not directly tested, and its own TypeScript-narrowing
      // `if (...) throw` guards are never taken in a passing run --
      // counting those against coverage would be misleading, exactly like
      // excluding `*.test.ts` files' own bodies already is.
      exclude: ['**/dist/**', '**/*.config.*', '**/*.test.ts', '**/fixtures/**'],
    },
  },
});
