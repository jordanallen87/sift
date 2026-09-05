/**
 * The Home Energy Guardian **case-creation gate**: a real, deterministic
 * decision over whether a bill is materially abnormal enough to open a
 * case at all -- not merely a computation that runs *inside* an
 * already-created case.
 *
 * This closes a real gap between the product's own claims
 * (docs/specs/demos-and-submission.md: "A deterministic watcher creates a
 * case after detecting the 42% anomaly.") and what the shipped code
 * actually did: `startDemo({ demoId: 'home-energy-guardian' })` used to
 * create a case unconditionally, with no code path that could ever decline
 * because a bill turned out to be normal. `evaluateBillFeed`/
 * `loadAndEvaluateBillFeed` are that missing decision, and
 * `CommandService.checkEnergyBillFeed` (`apps/agent/src/services/
 * command-service.ts`) routes real case creation through them.
 *
 * Deliberately reuses `energy-calculator.ts`'s `determineAnomaly` and
 * `DEFAULT_ANOMALY_THRESHOLD_PERCENT` rather than re-deriving "percent
 * above baseline" and the 15% threshold a second time -- the arithmetic
 * and the threshold each have exactly one definition in the codebase. This
 * module is intentionally narrower than `calculateEnergyAnalysis`: a
 * case-creation decision only needs the bill's own `currentAmount`/
 * `baseline.amount` (the two fields `determineAnomaly` reads), not the
 * rate-schedule/weather-history join `calculateEnergyAnalysis` also
 * performs -- so a second bill feed (`current-bill-normal.json`) can prove
 * the gate declines correctly without needing a matching weather-history
 * cycle or rate-schedule entry to exist for it.
 */
import {
  DEFAULT_ANOMALY_THRESHOLD_PERCENT,
  determineAnomaly,
  type MoneyAmount,
} from './energy-calculator.js';
import { loadFixture, type LoadFixtureOptions } from './fixture-loader.js';

/**
 * The gate's decision for one bill feed: whether a case should be opened,
 * the computed figures that decision rests on, and a human-readable reason
 * -- honest either way, so a person told "no case was opened" is told
 * *why*, not left staring at a dead button (docs/engineering-principles.md
 * "state honestly").
 */
export interface BillFeedGateDecision {
  readonly caseShouldOpen: boolean;
  readonly percentAboveBaseline: number;
  readonly thresholdPercent: number;
  readonly currentAmount: MoneyAmount;
  readonly baselineAmount: MoneyAmount;
  readonly reason: string;
}

function formatMoney(amount: MoneyAmount): string {
  return `$${amount.amount.toFixed(2)} ${amount.currency}`;
}

/**
 * The two fields this gate actually reads off a bill -- deliberately
 * narrower than `Pick<CurrentBill, 'currentAmount' | 'baseline'>` would be:
 * `CurrentBill.baseline` also carries `usage`/`methodology`/`computedBy`
 * this gate never looks at, so requiring the full shape at the type level
 * would overstate what the function actually needs. A real `CurrentBill`
 * (from `loadFixture`) satisfies this structurally with no cast.
 */
export interface BillFeedInput {
  readonly currentAmount: MoneyAmount;
  readonly baseline: { readonly amount: MoneyAmount };
}

/**
 * Pure: no disk I/O, no dependency on which fixture (or non-fixture bill)
 * the caller obtained `bill` from. Every branch is directly unit-testable
 * against a hand-built bill object, matching this codebase's discipline of
 * separating pure decision logic from the fixture-loading that feeds it in
 * production (see `energy-calculator.ts`'s own `CalculateEnergyAnalysisInput`
 * vs. its fixture reads).
 */
export function evaluateBillFeed(
  bill: BillFeedInput,
  thresholdPercent: number = DEFAULT_ANOMALY_THRESHOLD_PERCENT,
): BillFeedGateDecision {
  const anomaly = determineAnomaly(bill.currentAmount, bill.baseline.amount, thresholdPercent);
  const reason = anomaly.isMateriallyAbnormal
    ? `${formatMoney(anomaly.currentAmount)} is ${anomaly.percentAboveBaseline}% above the normalized baseline of ${formatMoney(anomaly.baselineAmount)} (threshold ${anomaly.thresholdPercent}%) -- materially abnormal. Opening a case.`
    : `${formatMoney(anomaly.currentAmount)} is ${anomaly.percentAboveBaseline}% above the normalized baseline of ${formatMoney(anomaly.baselineAmount)} (threshold ${anomaly.thresholdPercent}%) -- within the normal range. Your bill looks normal this month; no case opened.`;

  return {
    caseShouldOpen: anomaly.isMateriallyAbnormal,
    percentAboveBaseline: anomaly.percentAboveBaseline,
    thresholdPercent: anomaly.thresholdPercent,
    currentAmount: anomaly.currentAmount,
    baselineAmount: anomaly.baselineAmount,
    reason,
  };
}

/** The two bill feeds this gate can be pointed at -- see each fixture's own file header/comment for what it represents. */
export type BillFeedFixtureName = 'current-bill' | 'current-bill-normal';

export interface LoadAndEvaluateBillFeedOptions extends LoadFixtureOptions {
  readonly thresholdPercent?: number;
}

/**
 * Real-usage entry point: loads and Zod-validates the named bill fixture
 * from disk (`fixture-loader.ts`, cached exactly like every other fixture
 * read) and evaluates it. `CommandService.checkEnergyBillFeed` calls this
 * directly rather than loading the fixture itself and re-deriving the
 * decision inline.
 */
export function loadAndEvaluateBillFeed(
  fixtureName: BillFeedFixtureName,
  options: LoadAndEvaluateBillFeedOptions = {},
): BillFeedGateDecision {
  const { thresholdPercent, ...loadOptions } = options;
  const bill = loadFixture(fixtureName, loadOptions);
  return evaluateBillFeed(bill, thresholdPercent);
}
