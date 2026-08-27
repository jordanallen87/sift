// @ts-check
/**
 * `pnpm test:mutation` runs `stryker run` against this config. Per
 * docs/specs/testing.md, the targeted mutation gate covers router
 * thresholds, human-only approval, fail-closed evidence, staleness, and
 * readiness — all of which live in packages/core/src and packages/packs/src.
 * Mutation testing is not required for React presentation code.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  packageManager: 'pnpm',
  testRunner: 'vitest',
  // Stryker's default `plugins: ['@stryker-mutator/*']` resolves plugin
  // packages by reading the directory next to wherever `@stryker-mutator/core`
  // itself physically lives (see `PluginLoader#globPluginModules`). Under
  // pnpm's isolated store that directory is
  // `node_modules/.pnpm/@stryker-mutator+core@*/node_modules/@stryker-mutator`,
  // which does not contain the sibling `@stryker-mutator/vitest-runner`
  // package — so the glob silently finds nothing and every worker process
  // fails with "Cannot find TestRunner plugin \"vitest\"". Naming the plugin
  // as a bare specifier instead makes Stryker `import()` it directly, which
  // pnpm's normal node_modules resolution (from the project root) satisfies.
  plugins: ['@stryker-mutator/vitest-runner'],
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
