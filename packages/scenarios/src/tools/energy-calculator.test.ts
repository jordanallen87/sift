import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadFixture } from './fixture-loader.js';
import {
  DEFAULT_ANOMALY_THRESHOLD_PERCENT,
  ENERGY_CALCULATOR_TOOL_ID,
  calculateEnergyAnalysis,
  determineAnomaly,
  evaluateResponseOptions,
  type EnergyAnalysisResult,
  type ResponseOptionsEvaluationResult,
} from './energy-calculator.js';

/** Matches `energy-calculator.ts`'s own (unexported) `round2` exactly, so test-authored fixture values land on the same cent boundary the production code will independently recompute. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** See listing-reader.test.ts for the full rationale. */
function signalAbortingOnRead(n: number): AbortSignal {
  let reads = 0;
  return {
    get aborted() {
      reads += 1;
      return reads >= n;
    },
  } as unknown as AbortSignal;
}

function expectOk<T>(result: { status: string }): asserts result is { status: 'ok'; data: T } {
  expect(result.status).toBe('ok');
}

describe('determineAnomaly', () => {
  // Extracted out of `calculateEnergyAnalysis` so a case-creation gate
  // (`bill-feed-gate.ts`) can reuse the exact same threshold arithmetic
  // instead of duplicating it -- the 15% default threshold must have
  // exactly one definition in the codebase.
  it('independently recomputes percentAboveBaseline and flags it materially abnormal against the default threshold, matching calculateEnergyAnalysis on the real 42% fixture', () => {
    const anomaly = determineAnomaly(
      { amount: 248.5, currency: 'USD' },
      { amount: 175.0, currency: 'USD' },
    );
    expect(anomaly.percentAboveBaseline).toBe(42);
    expect(anomaly.thresholdPercent).toBe(DEFAULT_ANOMALY_THRESHOLD_PERCENT);
    expect(anomaly.isMateriallyAbnormal).toBe(true);
    expect(anomaly.currentAmount).toEqual({ amount: 248.5, currency: 'USD' });
    expect(anomaly.baselineAmount).toEqual({ amount: 175.0, currency: 'USD' });
  });

  it('does not flag a bill within the threshold as materially abnormal', () => {
    // 5% above baseline, well under the default 15% threshold.
    const anomaly = determineAnomaly(
      { amount: 183.75, currency: 'USD' },
      { amount: 175.0, currency: 'USD' },
    );
    expect(anomaly.percentAboveBaseline).toBe(5);
    expect(anomaly.isMateriallyAbnormal).toBe(false);
  });

  it('flags a bill exactly at the threshold as materially abnormal (>=, not >)', () => {
    const anomaly = determineAnomaly(
      { amount: 115, currency: 'USD' },
      { amount: 100, currency: 'USD' },
      15,
    );
    expect(anomaly.percentAboveBaseline).toBe(15);
    expect(anomaly.isMateriallyAbnormal).toBe(true);
  });

  it('honors a caller-supplied threshold override', () => {
    const anomaly = determineAnomaly(
      { amount: 248.5, currency: 'USD' },
      { amount: 175.0, currency: 'USD' },
      50,
    );
    expect(anomaly.thresholdPercent).toBe(50);
    expect(anomaly.isMateriallyAbnormal).toBe(false);
  });
});

describe('calculateEnergyAnalysis', () => {
  it('independently recomputes percentAboveBaseline matching the fixture-documented 42% and flags it materially abnormal', () => {
    const result = calculateEnergyAnalysis();
    expectOk<EnergyAnalysisResult>(result);
    expect(result.data.anomaly.percentAboveBaseline).toBe(42);
    expect(result.data.anomaly.isMateriallyAbnormal).toBe(true);
    expect(result.data.anomaly.currentAmount).toEqual({ amount: 248.5, currency: 'USD' });
    expect(result.data.anomaly.baselineAmount).toEqual({ amount: 175.0, currency: 'USD' });
  });

  it('does not flag a bill within the threshold as materially abnormal', () => {
    // A bill only 5% above baseline, well under the default threshold.
    const result = calculateEnergyAnalysis({ thresholdPercent: 50 });
    expectOk<EnergyAnalysisResult>(result);
    expect(result.data.anomaly.isMateriallyAbnormal).toBe(false);
  });

  it('independently recomputes the rate-change-attributable amount matching rate-schedules.json arithmeticNote: 18.62 (20.21% of the 92.12 total gap)', () => {
    const result = calculateEnergyAnalysis();
    expectOk<EnergyAnalysisResult>(result);
    const { rateChange } = result.data;
    expect(rateChange.priorTariffId).toBe('tariff-standard-2024');
    expect(rateChange.currentTariffId).toBe('tariff-standard-2026');
    expect(rateChange.billUnderPriorTariffAtBaselineUsage.amount).toBeCloseTo(156.38, 2);
    expect(rateChange.billUnderCurrentTariffAtBaselineUsage.amount).toBeCloseTo(175.0, 2);
    expect(rateChange.rateChangeAttributableAmount.amount).toBeCloseTo(18.62, 2);
    expect(rateChange.totalGapVsPriorTariffAtActualUsage.amount).toBeCloseTo(92.12, 2);
    expect(rateChange.rateChangeAttributablePercentOfTotalGap).toBeCloseTo(20.21, 2);
  });

  it('independently recomputes weather-normalized usage matching weather-history.json arithmeticNote: 80 excess CDD * 2.625 kWh/CDD = 210 kWh', () => {
    const result = calculateEnergyAnalysis();
    expectOk<EnergyAnalysisResult>(result);
    const { weather } = result.data;
    expect(weather.typicalCdd).toBe(380);
    expect(weather.actualCdd).toBe(460);
    expect(weather.excessCdd).toBe(80);
    expect(weather.weatherSensitivityKwhPerCdd).toBeCloseTo(2.625, 5);
    expect(weather.usageExplainedByWeatherKwh).toBe(210);
    expect(weather.dollarEquivalent.amount).toBeCloseTo(31.5, 2);
  });

  it('computes the unexplained (household-change) residual: 490 - 210 = 280 kWh', () => {
    const result = calculateEnergyAnalysis();
    expectOk<EnergyAnalysisResult>(result);
    const { unexplainedUsageGap } = result.data;
    expect(unexplainedUsageGap.usageGapAboveBaselineKwh).toBe(490);
    expect(unexplainedUsageGap.usageExplainedByWeatherKwh).toBe(210);
    expect(unexplainedUsageGap.unexplainedUsageKwh).toBe(280);
  });

  it('produces one E3 deterministic-check evidence item per computation', () => {
    const result = calculateEnergyAnalysis();
    expectOk<EnergyAnalysisResult>(result);
    expect(result.data.evidence).toHaveLength(4);
    for (const item of result.data.evidence) {
      expect(item.level).toBe('E3');
      expect(item.verdict).toBe('pass');
      expect(item.sourceId).toMatch(/^source-energy-calculator-/);
    }
  });

  it('is deterministic and reproducible: identical input twice produces deep-equal output', () => {
    const first = calculateEnergyAnalysis();
    const second = calculateEnergyAnalysis();
    expect(second).toEqual(first);
  });

  it('returns a cancelled result when called with an already-aborted signal, before computing anything', () => {
    const controller = new AbortController();
    controller.abort();
    const result = calculateEnergyAnalysis({ signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(ENERGY_CALCULATOR_TOOL_ID);
  });

  it('checks the signal again mid-flight and honors a late abort', () => {
    const result = calculateEnergyAnalysis({ signal: signalAbortingOnRead(2) });
    expect(result.status).toBe('cancelled');
  });
});

describe('calculateEnergyAnalysis -- rate-schedules edge case with no tariff effective before the current one (via fixtureBaseDir test seam)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sift-energy-calculator-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('falls back to the current tariff as its own "prior" tariff (rateChangeAttributableAmount $0, 0% of a $0 total gap) when rate-schedules.json declares no tariff effective before the current one and the bill exactly matches the current-tariff baseline bill', () => {
    // Real, checked-in fixtures as the starting point -- only the pieces
    // needed to construct this otherwise-unreachable-with-real-data edge
    // case are overridden; the weather-history fixture is copied verbatim
    // so the current cycle's weatherAttribution lookup (billingPeriod join)
    // keeps working unchanged.
    const realBill = loadFixture('current-bill');
    const realRateSchedules = loadFixture('rate-schedules');
    const realWeatherHistory = loadFixture('weather-history');

    const currentTariff = realRateSchedules.tariffs.find(
      (tariff) => tariff.tariffId === realBill.tariffId,
    );
    if (!currentTariff) {
      throw new Error(
        'fixture invariant broken: current-bill.tariffId must resolve to a real tariff',
      );
    }

    // Only the current tariff remains -- findPriorTariff has nothing earlier
    // to find.
    const noPriorTariffRateSchedules = {
      ...realRateSchedules,
      tariffs: realRateSchedules.tariffs.filter(
        (tariff) => tariff.tariffId === currentTariff.tariffId,
      ),
    };

    // The bill's actual amount is set to exactly what the current tariff
    // would produce at baseline usage, so the total gap vs. the (fallback)
    // "prior" tariff at baseline usage is exactly $0.
    const billUnderCurrentTariffAtBaselineUsage = round2(
      currentTariff.fixedMonthlyCustomerCharge.amount +
        currentTariff.volumetricRatePerKwh.amount * realBill.baseline.usage.value,
    );
    const zeroGapBill = {
      ...realBill,
      currentAmount: {
        amount: billUnderCurrentTariffAtBaselineUsage,
        currency: realBill.currentAmount.currency,
      },
    };

    writeFileSync(join(tempDir, 'current-bill.json'), JSON.stringify(zeroGapBill));
    writeFileSync(join(tempDir, 'rate-schedules.json'), JSON.stringify(noPriorTariffRateSchedules));
    writeFileSync(join(tempDir, 'weather-history.json'), JSON.stringify(realWeatherHistory));

    const result = calculateEnergyAnalysis({ fixtureBaseDir: tempDir });
    expectOk<EnergyAnalysisResult>(result);
    const { rateChange } = result.data;
    expect(rateChange.priorTariffId).toBe(currentTariff.tariffId);
    expect(rateChange.currentTariffId).toBe(currentTariff.tariffId);
    expect(rateChange.billUnderPriorTariffAtBaselineUsage.amount).toBe(
      rateChange.billUnderCurrentTariffAtBaselineUsage.amount,
    );
    expect(rateChange.rateChangeAttributableAmount.amount).toBe(0);
    expect(rateChange.totalGapVsPriorTariffAtActualUsage.amount).toBe(0);
    expect(rateChange.rateChangeAttributablePercentOfTotalGap).toBe(0);
  });
});

describe('evaluateResponseOptions', () => {
  it('scores all four real options, ranked by fitScore descending with the documented cost/root-cause formula (default equal weights)', () => {
    const result = evaluateResponseOptions();
    expectOk<ResponseOptionsEvaluationResult>(result);
    expect(result.data.costWeight).toBe(0.5);
    expect(result.data.conservationWeight).toBe(0.5);
    expect(result.data.maxRoughCostAmongOptions).toBe(250);

    const byId = new Map(result.data.options.map((option) => [option.optionId, option]));
    expect(byId.get('request-hvac-inspection')?.costScore).toBeCloseTo(0.34, 4);
    expect(byId.get('request-hvac-inspection')?.conservationScore).toBe(1);
    expect(byId.get('request-hvac-inspection')?.fitScore).toBeCloseTo(0.67, 4);
    expect(byId.get('monitor-one-cycle')?.costScore).toBe(1);
    expect(byId.get('monitor-one-cycle')?.fitScore).toBeCloseTo(0.5, 4);
    expect(byId.get('request-energy-audit')?.fitScore).toBe(0);

    // Ranked highest fitScore first; ties broken by optionId ascending.
    expect(result.data.options.map((option) => option.optionId)).toEqual([
      'request-hvac-inspection',
      'change-rate-plan',
      'monitor-one-cycle',
      'request-energy-audit',
    ]);
  });

  it('re-ranks options toward the cheapest when conservationWeight is 0 (cost-only priority)', () => {
    const result = evaluateResponseOptions({ costWeight: 1, conservationWeight: 0 });
    expectOk<ResponseOptionsEvaluationResult>(result);
    expect(result.data.options[0]?.fitScore).toBe(1);
    expect(['monitor-one-cycle', 'change-rate-plan']).toContain(result.data.options[0]?.optionId);
    expect(result.data.options.at(-1)?.optionId).toBe('request-energy-audit');
  });

  it('re-ranks options toward the root-cause fix when costWeight is 0 (conservation-only priority)', () => {
    const result = evaluateResponseOptions({ costWeight: 0, conservationWeight: 1 });
    expectOk<ResponseOptionsEvaluationResult>(result);
    expect(result.data.options[0]?.optionId).toBe('request-hvac-inspection');
    expect(result.data.options[0]?.fitScore).toBe(1);
  });

  it('blends costScore and conservationScore with an equal (costScore + conservationScore) / 2 average -- not a weighted formula that would divide by zero -- when both costWeight and conservationWeight are 0', () => {
    const result = evaluateResponseOptions({ costWeight: 0, conservationWeight: 0 });
    expectOk<ResponseOptionsEvaluationResult>(result);
    const byId = new Map(result.data.options.map((option) => [option.optionId, option]));
    // request-hvac-inspection: costScore ~0.34, conservationScore 1 -> (0.34 + 1) / 2 = 0.67
    expect(byId.get('request-hvac-inspection')?.fitScore).toBeCloseTo(0.67, 4);
    // request-energy-audit: costScore 0, conservationScore 0 -> 0
    expect(byId.get('request-energy-audit')?.fitScore).toBe(0);
    // monitor-one-cycle: costScore 1, conservationScore 0 -> 0.5
    expect(byId.get('monitor-one-cycle')?.fitScore).toBeCloseTo(0.5, 4);
  });

  it('flags withinBudget only when maxRoughCost is given, without dropping any option', () => {
    const result = evaluateResponseOptions({ maxRoughCost: 200 });
    expectOk<ResponseOptionsEvaluationResult>(result);
    expect(result.data.options).toHaveLength(4);
    const byId = new Map(result.data.options.map((option) => [option.optionId, option]));
    expect(byId.get('request-hvac-inspection')?.withinBudget).toBe(true);
    expect(byId.get('request-energy-audit')?.withinBudget).toBe(false);
    expect(byId.get('monitor-one-cycle')?.withinBudget).toBe(true);
  });

  it('omits withinBudget when no maxRoughCost is given', () => {
    const result = evaluateResponseOptions();
    expectOk<ResponseOptionsEvaluationResult>(result);
    for (const option of result.data.options) {
      expect('withinBudget' in option).toBe(false);
    }
  });

  it('filters to a single option when optionId is given', () => {
    const result = evaluateResponseOptions({ optionId: 'request-hvac-inspection' });
    expectOk<ResponseOptionsEvaluationResult>(result);
    expect(result.data.options).toHaveLength(1);
    expect(result.data.options[0]?.optionId).toBe('request-hvac-inspection');
    expect(result.data.options[0]?.requiresConsequentialAction).toBe(true);
  });

  it('produces one E3 deterministic-check evidence item per scored option', () => {
    const result = evaluateResponseOptions();
    expectOk<ResponseOptionsEvaluationResult>(result);
    expect(result.data.evidence).toHaveLength(4);
    for (const item of result.data.evidence) {
      expect(item.level).toBe('E3');
      expect(item.verdict).toBe('pass');
    }
  });

  it('returns a deterministic not_found result for an unknown optionId, without throwing', () => {
    const result = evaluateResponseOptions({ optionId: 'option-does-not-exist' });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.toolId).toBe(ENERGY_CALCULATOR_TOOL_ID);
    expect(result.query).toBe('option-does-not-exist');
  });

  it('is deterministic: identical input twice produces deep-equal output', () => {
    const first = evaluateResponseOptions({ costWeight: 0.3, conservationWeight: 0.7 });
    const second = evaluateResponseOptions({ costWeight: 0.3, conservationWeight: 0.7 });
    expect(second).toEqual(first);
  });

  it('returns a cancelled result when called with an already-aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    const result = evaluateResponseOptions({ signal: controller.signal });
    expect(result.status).toBe('cancelled');
    expect((result as { toolId: string }).toolId).toBe(ENERGY_CALCULATOR_TOOL_ID);
  });

  it('checks the signal again mid-flight and honors a late abort', () => {
    const result = evaluateResponseOptions({ signal: signalAbortingOnRead(2) });
    expect(result.status).toBe('cancelled');
  });
});

describe('evaluateResponseOptions -- maxRoughCostAmongOptions 0 edge case (via fixtureBaseDir test seam)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sift-energy-calculator-response-options-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('scores every option a perfect 1.0 costScore instead of dividing by zero when every option in response-options.json is free (maxRoughCostAmongOptions 0)', () => {
    const realResponseOptions = loadFixture('response-options');
    const freeResponseOptions = {
      ...realResponseOptions,
      options: realResponseOptions.options.map((option) => ({
        ...option,
        roughCost: { amount: 0, currency: option.roughCost.currency },
      })),
    };
    writeFileSync(join(tempDir, 'response-options.json'), JSON.stringify(freeResponseOptions));

    const result = evaluateResponseOptions({ fixtureBaseDir: tempDir });
    expectOk<ResponseOptionsEvaluationResult>(result);
    expect(result.data.maxRoughCostAmongOptions).toBe(0);
    expect(result.data.options.length).toBeGreaterThan(0);
    for (const score of result.data.options) {
      expect(score.costScore).toBe(1);
    }
  });
});
