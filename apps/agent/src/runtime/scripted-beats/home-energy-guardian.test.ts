/**
 * Direct unit tests for `fitScore`'s pure arithmetic -- the real formula this
 * file's own module header documents
 * (`fitScore = costWeight*costScore + conservationWeight*conservationScore`,
 * `conservationScore = addressesRootCause ? 1 : 0`). `fitScore` is never
 * actually called by production code (it exists purely so this file's own
 * documented round1/round2 crossover numbers -- monitor-one-cycle 0.80 ->
 * 0.20, request-hvac-inspection 0.47 -> 0.87 -- are genuinely *proven*
 * arithmetic, not merely asserted prose); this proves it directly, exercising
 * both sides of the `addressesRootCause` ternary the module header's crossover
 * claim depends on.
 */
import { describe, expect, it } from 'vitest';
import {
  fitScore,
  RESPONSE_OPTIONS,
  ROUND1_COST_WEIGHT,
  ROUND1_CONSERVATION_WEIGHT,
  ROUND2_COST_WEIGHT,
  ROUND2_CONSERVATION_WEIGHT,
  type ResponseOptionFacts,
} from './home-energy-guardian.js';

function optionFacts(optionId: string): ResponseOptionFacts {
  const option = RESPONSE_OPTIONS.find((entry) => entry.optionId === optionId);
  if (option === undefined) {
    throw new Error(`test setup: unknown response option "${optionId}"`);
  }
  return option;
}

describe('fitScore', () => {
  it("scores a root-cause-addressing option using conservationScore 1 (the true side of the addressesRootCause ternary), reproducing the module header's documented 0.47 -> 0.87 crossover for request-hvac-inspection", () => {
    const hvac = optionFacts('request-hvac-inspection');
    expect(hvac.addressesRootCause).toBe(true);
    expect(fitScore(hvac, ROUND1_COST_WEIGHT, ROUND1_CONSERVATION_WEIGHT)).toBeCloseTo(0.47, 2);
    expect(fitScore(hvac, ROUND2_COST_WEIGHT, ROUND2_CONSERVATION_WEIGHT)).toBeCloseTo(0.87, 2);
  });

  it("scores a non-root-cause option using conservationScore 0 (the false side of the addressesRootCause ternary), reproducing the module header's documented 0.80 -> 0.20 crossover for monitor-one-cycle", () => {
    const monitor = optionFacts('monitor-one-cycle');
    expect(monitor.addressesRootCause).toBe(false);
    expect(fitScore(monitor, ROUND1_COST_WEIGHT, ROUND1_CONSERVATION_WEIGHT)).toBeCloseTo(0.8, 2);
    expect(fitScore(monitor, ROUND2_COST_WEIGHT, ROUND2_CONSERVATION_WEIGHT)).toBeCloseTo(0.2, 2);
  });

  it("proves the required adaptive-moment crossover itself: monitor-one-cycle beats request-hvac-inspection at round1's cost-heavy weighting, and loses to it at round2's conservation-heavy weighting", () => {
    const monitor = optionFacts('monitor-one-cycle');
    const hvac = optionFacts('request-hvac-inspection');
    expect(fitScore(monitor, ROUND1_COST_WEIGHT, ROUND1_CONSERVATION_WEIGHT)).toBeGreaterThan(
      fitScore(hvac, ROUND1_COST_WEIGHT, ROUND1_CONSERVATION_WEIGHT),
    );
    expect(fitScore(hvac, ROUND2_COST_WEIGHT, ROUND2_CONSERVATION_WEIGHT)).toBeGreaterThan(
      fitScore(monitor, ROUND2_COST_WEIGHT, ROUND2_CONSERVATION_WEIGHT),
    );
  });
});
