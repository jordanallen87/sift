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
  ROUND1_RECOMMENDED_OPTION_ID,
  type ResponseOptionFacts,
} from './home-energy-guardian.js';
import { HOME_ENERGY_GUARDIAN_MANIFEST } from '@sift/packs';

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

/**
 * The crossover above is real arithmetic, but it only reaches a viewer if the
 * *case* a person actually starts is weighted the way round 1's narration
 * says it is.
 *
 * It was not. The pack shipped a 50/50 cost/conservation default while
 * `DECISION_TEXT_ROUND1` narrated "energy.cost weight 80, energy.conservation
 * weight 20" and quoted the scores that weighting produces (0.80 vs 0.47). At
 * the real 50/50 default the deterministic scorer puts
 * `request-hvac-inspection` first (0.67) and `monitor-one-cycle` second
 * (0.50) -- so a freshly started case recommended the option its own
 * criteria ranked *second*, and the recommendation card rendered two
 * contradictory sets of numbers at once: the scripted "0.80 versus 0.47" in
 * the rationale, and the computed "67% to 50%" in the limitation immediately
 * below it.
 *
 * Sift is a tool for not overstating what you know. A hero card that
 * disagrees with itself about arithmetic is the most expensive possible bug
 * for it to ship, and no test caught it because every existing test asserted
 * the scripted numbers and the pack default *separately*, and both were
 * internally consistent.
 *
 * This test is the join: whatever weighting the pack ships as its default,
 * the option round 1 recommends must be the option that weighting actually
 * ranks first.
 */
describe('the pack default weighting and round 1 narration agree', () => {
  it("ranks the option round 1 recommends first under the pack's own default criterion weights", () => {
    const costCriterion = HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults.find(
      (criterion) => criterion.id === 'energy.cost',
    );
    const conservationCriterion = HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults.find(
      (criterion) => criterion.id === 'energy.conservation',
    );
    if (costCriterion === undefined || conservationCriterion === undefined) {
      throw new Error('test setup: the pack no longer declares both scoring criteria');
    }

    const ranked = [...RESPONSE_OPTIONS]
      .map((option) => ({
        optionId: option.optionId,
        score: fitScore(option, costCriterion.weight, conservationCriterion.weight),
      }))
      .sort((a, b) => b.score - a.score);

    expect(ranked[0]?.optionId).toBe(ROUND1_RECOMMENDED_OPTION_ID);
  });

  it('narrates the weighting the pack actually ships, so the rationale and the computed limitation cannot contradict each other', () => {
    const costCriterion = HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults.find(
      (criterion) => criterion.id === 'energy.cost',
    );
    const conservationCriterion = HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults.find(
      (criterion) => criterion.id === 'energy.conservation',
    );

    expect(costCriterion?.weight).toBe(ROUND1_COST_WEIGHT);
    expect(conservationCriterion?.weight).toBe(ROUND1_CONSERVATION_WEIGHT);
  });
});
