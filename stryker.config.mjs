// @ts-check
/**
 * Minimal Task 1 skeleton. `pnpm test:mutation` does not invoke Stryker yet
 * (it prints "not yet implemented" until Task 13 wires the real mutation
 * gate). This config exists now so the mutation surface is declared early:
 * per docs/specs/testing.md, the targeted mutation gate covers router
 * thresholds, human-only approval, fail-closed evidence, staleness, and
 * readiness — all of which live in packages/core/src and packages/packs/src.
 * Mutation testing is not required for React presentation code.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: {
    fileName: 'artifacts/verification/mutation/index.html',
  },
  jsonReporter: {
    fileName: 'artifacts/verification/mutation/mutation-report.json',
  },
  coverageAnalysis: 'perTest',
  mutate: [
    'packages/core/src/**/*.ts',
    'packages/packs/src/**/*.ts',
    '!packages/core/src/**/*.test.ts',
    '!packages/packs/src/**/*.test.ts',
  ],
  tempDirName: '.stryker-tmp',
  thresholds: {
    high: 90,
    low: 70,
    break: 80,
  },
};

export default config;
