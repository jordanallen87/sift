// @ts-check
/**
 * `pnpm test:mutation` runs `stryker run` against this config. Per
 * docs/specs/testing.md, the targeted mutation gate covers router
 * thresholds, human-only approval, fail-closed evidence, staleness, and
 * readiness — all of which live in packages/core/src and packages/packs/src.
 * Mutation testing is not required for React presentation code. Further
 * decision rules -- the Home Energy Guardian case-creation gate and the
 * bid-comparison pack's scope-diff and bid-economics arithmetic -- live
 * outside those two packages and are named explicitly in `mutate` below;
 * see the comment at each entry.
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
    // The Home Energy Guardian case-creation gate is a decision rule of
    // exactly the kind named above -- it decides whether a case is opened
    // at all -- but it lives in packages/scenarios, so the two globs above
    // never covered it. Scoping Stryker at this one file on 2026-09-05
    // scored it 71.43% (under the break threshold of 80): `formatMoney`
    // could be mutated to return "" and every test still passed, because
    // nothing asserted that the dollar amounts a person actually reads
    // appear in the decision's `reason` string. The tests were strengthened
    // to pin those amounts (100%, 7/7 killed). Naming the file here is what
    // keeps `pnpm test:mutation` covering it from now on, rather than
    // relying on someone remembering to scope a run by hand.
    'packages/scenarios/src/tools/bill-feed-gate.ts',
    // Same reasoning, same day: `energy-calculator.ts` owns the Home Energy
    // hero's actual arithmetic -- baseline/anomaly, weather attribution,
    // rate-change attribution, and response-option scoring -- and was
    // likewise never mutated. Scoped it scored 81.62%: the weighted
    // fit-score's `/ totalWeight` could become `* totalWeight`,
    // `findPriorTariff`'s date filter could be deleted outright, a
    // `<=` budget bound could become `<`, and every evidence-item summary
    // could be emptied to "" -- all with the suite green. Tests were
    // strengthened for each; the file now scores 88.65%.
    'packages/scenarios/src/tools/energy-calculator.ts',
    // Same reasoning again, bid-comparison pack, 2026-09-07: `scope-differ.ts`
    // owns the three-way `'absent' | 'priced_at_zero' | 'priced'`
    // classification that the whole demo turns on -- Cedar & Sons' bid
    // looking cheap only because it is silent on three required items, not
    // because it scoped them out. Scoped it scored 84.72%, 11 survivors, all
    // real: the evidence `sourceId`/`level` were untested on several
    // branches, the missing-item filter and its `'; '` join separator could
    // each be deleted with every existing `toContain` check still passing
    // (nothing pinned the exact joined string), the `not_found` message
    // could be emptied, the tool id constant could collapse to `""` (only
    // ever compared to itself), an untested `requiredScopeLineItems` map
    // could return blank objects, and the first abort check could be
    // skipped entirely -- an aborted call with an also-invalid bidId would
    // silently return `not_found` instead of `cancelled`. Tests were
    // strengthened for each; the file now scores 100% (72/72 killed).
    'packages/scenarios/src/tools/scope-differ.ts',
    // `bid-calculator.ts` owns the arithmetic and, more importantly, the
    // honesty contract this pack exists to prove: an absent required item
    // with no supplied plug number must make `adjustedTotal` an explicit
    // `{ status: 'unknown', ... }`, never a silently-optimistic number and
    // never a bid treated as if the missing item cost $0. Scoped it scored
    // 90.76%, 11 survivors -- none let `unknown` collapse into `known` or
    // emptied `missingPlugNumberForScopeItemIds` outright (those exact
    // mutants were already dead), but several adjacent gaps were real: the
    // reason string's id list could lose its `', '` separator, several
    // evidence items' `level`/`verdict` were never asserted, the tool id
    // constant collapsed to `""` the same self-comparison way as
    // `scope-differ.ts`'s, the `not_found` message could be emptied, the
    // first abort check could be skipped (same "cancelled silently becomes
    // not_found" gap), and the zero-absent-items fast path (which returns
    // the quoted total untouched by `round2`) was unreachable through any
    // real fixture, since every checked-in bid's total is a whole dollar
    // amount. That last one is why `computeAdjustedTotal` is now exported
    // and directly unit-tested against a hand-built sub-cent total, the
    // same discipline `scope-differ.ts`'s `diffBidScope` already followed.
    // Tests were strengthened for each; the file now scores 100% (119/119
    // killed).
    'packages/scenarios/src/tools/bid-calculator.ts',
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
