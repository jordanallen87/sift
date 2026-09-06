/**
 * Direct unit tests for `scoreBids`'s pure arithmetic -- the real,
 * fixture-derived scoring this file's own module header documents.
 * `scoreBids` is never actually called by production code (it exists purely
 * so this file's own documented round1/round2 beats -- Northgate Plumbing's
 * round1 award, and round2's hard-constraint refusal of a higher-scoring
 * Two Rivers Mechanical -- are genuinely *proven* arithmetic against the
 * real fixture numbers, not merely asserted prose), mirroring
 * `home-energy-guardian.test.ts`'s identical `fitScore` unit suite for this
 * codebase's other Swarm-orchestrated pack.
 */
import { describe, expect, it } from 'vitest';
import { BID_COMPARISON_MANIFEST } from '@sift/packs';
import {
  BID_FACTS,
  ROUND1_CRITERIA_WEIGHTS,
  ROUND2_CRITERIA_WEIGHTS,
  ROUND1_RECOMMENDED_BID_ID,
  ROUND2_RECOMMENDED_BID_ID,
  scoreBids,
  type BidComparisonCriteriaWeights,
} from './bid-comparison.js';

describe('scoreBids: hard-constraint semantics (packages/core/src/scoring.ts rule 4)', () => {
  it('scores bid-tworivers and keeps it on the board -- a hard constraint flags, it never removes an option from consideration', () => {
    expect(BID_FACTS.find((bid) => bid.bidId === 'bid-tworivers')?.credentialsValid).toBe(false);
    for (const weights of [ROUND1_CRITERIA_WEIGHTS, ROUND2_CRITERIA_WEIGHTS]) {
      const ranked = scoreBids(weights);
      expect(ranked).toHaveLength(3);
      expect(ranked.map((entry) => entry.bidId)).toContain('bid-tworivers');
      expect(ranked.find((entry) => entry.bidId === 'bid-tworivers')?.constraintViolated).toBe(
        true,
      );
    }
  });

  it('never lets bid-tworivers outrank a compliant bid, even at a perfect 1.00 raw score under a weighting built entirely to favor it (bid.warranty + bid.payment_risk, 50/50, zero elsewhere)', () => {
    // The most generous plausible case for Two Rivers Mechanical: every
    // point of weight on the two criteria it leads (36-month warranty,
    // 20% deposit), none anywhere else.
    const allInOnTwoRivers: BidComparisonCriteriaWeights = {
      adjustedTotal: 0,
      scopeCompleteness: 0,
      paymentRisk: 50,
      scheduleFit: 0,
      warranty: 50,
    };
    const ranked = scoreBids(allInOnTwoRivers);
    const tworivers = ranked.find((entry) => entry.bidId === 'bid-tworivers');
    expect(tworivers?.score).toBe(1);
    // A perfect raw score and it still sorts last -- rule 4, not a scoring
    // coincidence: "Constraint violations dominate everything ... ranked
    // last, never removed, then score."
    expect(ranked[ranked.length - 1]?.bidId).toBe('bid-tworivers');
    expect(ranked[0]?.bidId).not.toBe('bid-tworivers');
    expect(ranked[1]?.bidId).not.toBe('bid-tworivers');
  });

  it('bid-tworivers cannot rank first under any of a wide sweep of weightings, because a hard-constraint violation is not a matter of degree', () => {
    const sweep: BidComparisonCriteriaWeights[] = [
      { adjustedTotal: 100, scopeCompleteness: 0, paymentRisk: 0, scheduleFit: 0, warranty: 0 },
      { adjustedTotal: 0, scopeCompleteness: 100, paymentRisk: 0, scheduleFit: 0, warranty: 0 },
      { adjustedTotal: 0, scopeCompleteness: 0, paymentRisk: 100, scheduleFit: 0, warranty: 0 },
      { adjustedTotal: 0, scopeCompleteness: 0, paymentRisk: 0, scheduleFit: 100, warranty: 0 },
      { adjustedTotal: 0, scopeCompleteness: 0, paymentRisk: 0, scheduleFit: 0, warranty: 100 },
      { adjustedTotal: 20, scopeCompleteness: 20, paymentRisk: 20, scheduleFit: 20, warranty: 20 },
      ROUND1_CRITERIA_WEIGHTS,
      ROUND2_CRITERIA_WEIGHTS,
    ];
    for (const weights of sweep) {
      expect(scoreBids(weights)[0]?.bidId).not.toBe('bid-tworivers');
    }
  });
});

describe('scoreBids: round2 hard-constraint beat (Two Rivers Mechanical scores highest, is still refused)', () => {
  it('gives Two Rivers Mechanical the top RAW score of all three bids under ROUND2_CRITERIA_WEIGHTS, flagged as a constraint violator, while Northgate Plumbing -- the highest-scoring COMPLIANT bid -- is what the sorted board (and the recommended award) actually leads with; both facts come from the scorer, not an assertion', () => {
    const ranked = scoreBids(ROUND2_CRITERIA_WEIGHTS);

    // Fact 1: by raw score alone (ignoring the sort's constraint-first
    // tiebreak), bid-tworivers is the highest scorer of the three.
    const byRawScore = [...ranked].sort((a, b) => b.score - a.score);
    expect(byRawScore[0]?.bidId).toBe('bid-tworivers');
    expect(byRawScore[0]?.constraintViolated).toBe(true);

    // Fact 2: the actual recommended award -- ranked[0] after the real
    // hard-constraint sort -- is Northgate Plumbing, compliant.
    expect(ranked[0]?.bidId).toBe('bid-northgate');
    expect(ranked[0]?.constraintViolated).toBe(false);
    expect(ranked[0]?.bidId).toBe(ROUND2_RECOMMENDED_BID_ID);

    // The exact scored totals this task's report cites.
    expect(ranked.find((entry) => entry.bidId === 'bid-tworivers')?.score).toBe(0.81);
    expect(ranked.find((entry) => entry.bidId === 'bid-northgate')?.score).toBe(0.58);
    expect(ranked.find((entry) => entry.bidId === 'bid-cedar')?.score).toBe(0.31);
  });

  it('reweighting toward bid.warranty + bid.payment_risk gives Two Rivers Mechanical the lead over both compliant bids on raw score, unlike round 1 where it trails Cedar & Sons too', () => {
    const round1 = scoreBids(ROUND1_CRITERIA_WEIGHTS);
    const round2 = scoreBids(ROUND2_CRITERIA_WEIGHTS);

    const tworiversRound1 = round1.find((entry) => entry.bidId === 'bid-tworivers')?.score ?? -1;
    const cedarRound1 = round1.find((entry) => entry.bidId === 'bid-cedar')?.score ?? -1;
    expect(tworiversRound1).toBeLessThan(cedarRound1);

    const tworiversRound2 = round2.find((entry) => entry.bidId === 'bid-tworivers')?.score ?? -1;
    const northgateRound2 = round2.find((entry) => entry.bidId === 'bid-northgate')?.score ?? -1;
    const cedarRound2 = round2.find((entry) => entry.bidId === 'bid-cedar')?.score ?? -1;
    expect(tworiversRound2).toBeGreaterThan(northgateRound2);
    expect(tworiversRound2).toBeGreaterThan(cedarRound2);
  });
});

describe('scoreBids: the schedule-urgency direction, tried and rejected on narrative grounds', () => {
  it("scores Cedar & Sons first under a schedule-heavy weighting (schedule fit 60), despite its higher adjusted total and worse scope completeness and payment risk -- documented here as the one lever that CAN move the award off Northgate Plumbing, and NOT what round2 ships (see this file's module header)", () => {
    const scheduleHeavy: BidComparisonCriteriaWeights = {
      adjustedTotal: 10,
      scopeCompleteness: 15,
      paymentRisk: 10,
      scheduleFit: 60,
      warranty: 5,
    };
    const ranked = scoreBids(scheduleHeavy);
    expect(ranked[0]?.bidId).toBe('bid-cedar');
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  it("reweighting toward bid.warranty + bid.payment_risk (ROUND2_CRITERIA_WEIGHTS' own direction) never lets Cedar & Sons catch Northgate Plumbing, at any tested intensity -- confirming that direction cannot produce an award-level crossover either", () => {
    const moderate = ROUND2_CRITERIA_WEIGHTS;
    const extreme: BidComparisonCriteriaWeights = {
      adjustedTotal: 0,
      scopeCompleteness: 0,
      paymentRisk: 50,
      scheduleFit: 0,
      warranty: 50,
    };
    for (const weights of [moderate, extreme]) {
      const ranked = scoreBids(weights);
      const northgate = ranked.find((entry) => entry.bidId === 'bid-northgate')?.score ?? -1;
      const cedar = ranked.find((entry) => entry.bidId === 'bid-cedar')?.score ?? -1;
      expect(northgate).toBeGreaterThan(cedar);
    }
  });
});

describe('scoreBids: round 1 arithmetic and shared normalization rules', () => {
  it("scores Northgate Plumbing first under round 1's cost-heavy default weighting (adjusted total 45 / scope completeness 20 / payment risk 15 -- three of the criteria Northgate leads on)", () => {
    const ranked = scoreBids(ROUND1_CRITERIA_WEIGHTS);
    expect(ranked[0]?.bidId).toBe('bid-northgate');
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 0);
  });

  it('treats an explicit-unknown warranty term (Cedar & Sons) as neutral -- 0.5, strictly between the worst (0) and best (1) KNOWN warranty scores in the three-bid pool -- never as a 0-month warranty', () => {
    const cedar = BID_FACTS.find((bid) => bid.bidId === 'bid-cedar');
    expect(cedar?.warrantyMonths).toBeNull();
    const allWarrantyWeight: BidComparisonCriteriaWeights = {
      adjustedTotal: 0,
      scopeCompleteness: 0,
      paymentRisk: 0,
      scheduleFit: 0,
      warranty: 100,
    };
    const ranked = scoreBids(allWarrantyWeight);
    const cedarScore = ranked.find((entry) => entry.bidId === 'bid-cedar')?.score;
    // Normalized against the FULL three-bid pool (bid-tworivers included,
    // per packages/core/src/scoring.ts's own buildScale), Northgate's
    // 24-month term is the WORSE of the two known terms (bid-tworivers'
    // 36-month term is the better one) -- so isolated to warranty alone,
    // Northgate scores 0 and bid-tworivers scores 1. Cedar & Sons' neutral
    // 0.5 sits strictly between both real, known figures.
    const northgateScore = ranked.find((entry) => entry.bidId === 'bid-northgate')?.score;
    const tworiversScore = ranked.find((entry) => entry.bidId === 'bid-tworivers')?.score;
    expect(northgateScore).toBe(0);
    expect(tworiversScore).toBe(1);
    expect(cedarScore).toBe(0.5);
  });
});

/**
 * The crossover above is real arithmetic, but it only reaches a viewer if
 * the *case* a person actually starts is weighted the way round 1's
 * narration says it is -- `home-energy-guardian.test.ts`'s own module
 * header explains exactly why this join matters and what it once caught.
 * This is the same join for this pack.
 */
describe('the pack default weighting and round 1 narration agree', () => {
  function defaultWeight(criterionId: string): number {
    const criterion = BID_COMPARISON_MANIFEST.criteria.defaults.find(
      (entry) => entry.id === criterionId,
    );
    if (criterion === undefined) {
      throw new Error(`test setup: the pack no longer declares criterion "${criterionId}"`);
    }
    return criterion.weight;
  }

  it("narrates the weighting the pack actually ships as ROUND1_CRITERIA_WEIGHTS, so this file's round1 beat and the pack default cannot silently drift apart", () => {
    expect(ROUND1_CRITERIA_WEIGHTS).toEqual({
      adjustedTotal: defaultWeight('bid.adjusted_total'),
      scopeCompleteness: defaultWeight('bid.scope_completeness'),
      paymentRisk: defaultWeight('bid.payment_risk'),
      scheduleFit: defaultWeight('bid.schedule_fit'),
      warranty: defaultWeight('bid.warranty'),
    });
  });

  it("ranks the bid round 1 recommends first under the pack's own default criterion weights", () => {
    const ranked = scoreBids({
      adjustedTotal: defaultWeight('bid.adjusted_total'),
      scopeCompleteness: defaultWeight('bid.scope_completeness'),
      paymentRisk: defaultWeight('bid.payment_risk'),
      scheduleFit: defaultWeight('bid.schedule_fit'),
      warranty: defaultWeight('bid.warranty'),
    });
    expect(ranked[0]?.bidId).toBe(ROUND1_RECOMMENDED_BID_ID);
  });

  it('ranks the bid round 2 actually recommends first under its own reweighted criteria', () => {
    const ranked = scoreBids(ROUND2_CRITERIA_WEIGHTS);
    expect(ranked[0]?.bidId).toBe(ROUND2_RECOMMENDED_BID_ID);
  });
});
