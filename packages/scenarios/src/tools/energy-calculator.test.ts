import { describe, expect, it } from 'vitest';
import {
  ENERGY_CALCULATOR_TOOL_ID,
  calculateEnergyAnalysis,
  evaluateResponseOptions,
  type EnergyAnalysisResult,
  type ResponseOptionsEvaluationResult,
} from './energy-calculator.js';

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
