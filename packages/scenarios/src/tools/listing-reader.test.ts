import { describe, expect, it } from 'vitest';
import { loadFixture } from './fixture-loader.js';
import {
  LISTING_READER_TOOL_ID,
  budgetComparisonSentence,
  readListing,
  type CandidateListingResult,
} from './listing-reader.js';

const ALL_CANDIDATE_IDS = ['candidate-rav4', 'candidate-crv', 'candidate-cx5', 'candidate-outback'];

/**
 * A fake `AbortSignal` whose `aborted` getter returns `false` for the first
 * `n - 1` reads and `true` from the `n`th read onward. Used to prove a tool
 * honors the abort signal at a *later* checkpoint too (after some work has
 * already started), not only when the signal is already aborted before the
 * call begins.
 */
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

describe('budgetComparisonSentence', () => {
  // In the real fixture, `exceedsHouseholdMaxBudget` happens to always agree
  // with `hasTeaserPriceConflict`, so both outcomes of this sentence are
  // exercised directly here rather than only through `readListing`.
  it('states the budget is exceeded when true', () => {
    expect(budgetComparisonSentence(true, 32000)).toContain(
      "exceeds the household's $32,000.00 budget",
    );
  });

  it('states the price is within budget when false', () => {
    expect(budgetComparisonSentence(false, 32000)).toContain(
      "within the household's $32,000.00 budget",
    );
  });
});

describe('readListing', () => {
  it('surfaces the RAV4 teaser-price conflict explicitly: advertised price, true out-the-door price, and the gap', () => {
    const result = readListing({ candidateId: 'candidate-rav4' });
    expectOk<CandidateListingResult>(result);
    const { data } = result;

    expect(data.dealerOffer.hasTeaserPriceConflict).toBe(true);
    expect(data.listing.advertisedPrice).toEqual({ amount: 27995, currency: 'USD' });
    expect(data.dealerOffer.advertisedPrice).toEqual({ amount: 27995, currency: 'USD' });
    expect(data.dealerOffer.trueOutTheDoorPrice).toBeCloseTo(33291.3, 5);
    expect(data.dealerOffer.teaserGap.gapAmount).toBeCloseTo(5296.3, 5);
    expect(data.dealerOffer.teaserGap.gapPercentOfAdvertised).toBeCloseTo(18.92, 5);
    expect(data.dealerOffer.teaserGap.exceedsHouseholdMaxBudget).toBe(true);
    expect(data.dealerOffer.teaserGap.householdMaxBudget).toBe(32000);

    const dealerOfferEvidence = data.evidence.find((item) =>
      item.sourceId.includes('dealer-offer'),
    );
    expect(dealerOfferEvidence).toBeDefined();
    expect(dealerOfferEvidence?.verdict).toBe('degraded');
    expect(dealerOfferEvidence?.summary).toContain('27,995.00');
    expect(dealerOfferEvidence?.summary).toContain('33,291.30');
    expect(dealerOfferEvidence?.summary).toContain('5,296.30');
  });

  it('does not flag a teaser-price conflict for a candidate whose advertised and actual terms match', () => {
    const result = readListing({ candidateId: 'candidate-crv' });
    expectOk<CandidateListingResult>(result);
    expect(result.data.dealerOffer.hasTeaserPriceConflict).toBe(false);
    const dealerOfferEvidence = result.data.evidence.find((item) =>
      item.sourceId.includes('dealer-offer'),
    );
    expect(dealerOfferEvidence?.verdict).toBe('pass');
  });

  it.each(ALL_CANDIDATE_IDS)(
    'tags both facts E1 with a deterministic sourceId for %s',
    (candidateId) => {
      const result = readListing({ candidateId });
      expectOk<CandidateListingResult>(result);
      expect(result.data.evidence).toHaveLength(2);
      for (const item of result.data.evidence) {
        expect(item.level).toBe('E1');
        expect(item.sourceId).toContain(candidateId);
      }
      const listingItem = result.data.evidence.find((item) => item.sourceId.includes('listing'));
      // The raw listing fact itself is never in conflict -- only the dealer
      // offer's advertised-vs-true-price relationship can be.
      expect(listingItem?.verdict).toBe('pass');
    },
  );

  it('lists every candidate when no candidateId is given, each carrying its own evidence', () => {
    const result = readListing();
    expectOk<CandidateListingResult[]>(result);
    expect(result.data.map((entry) => entry.candidateId).sort()).toEqual(
      [...ALL_CANDIDATE_IDS].sort(),
    );
    for (const entry of result.data) {
      expect(entry.evidence).toHaveLength(2);
    }
  });

  it('returns a deterministic not_found result for an unknown candidate id, without throwing', () => {
    const result = readListing({ candidateId: 'candidate-does-not-exist' });
    if (result.status !== 'not_found') {
      throw new Error(`expected status "not_found", got "${result.status}"`);
    }
    expect(result.toolId).toBe(LISTING_READER_TOOL_ID);
    expect(result.query).toBe('candidate-does-not-exist');
    expect(result.message).toContain('candidate-does-not-exist');
  });

  it('returns a cancelled result when called with an already-aborted signal, before doing any lookup', () => {
    const controller = new AbortController();
    controller.abort();
    const result = readListing({ candidateId: 'candidate-rav4', signal: controller.signal });
    if (result.status !== 'cancelled') {
      throw new Error(`expected status "cancelled", got "${result.status}"`);
    }
    expect(result.toolId).toBe(LISTING_READER_TOOL_ID);
    expect(result.message).toContain('cancelled');
  });

  it('checks the signal again mid-flight, after fixtures are loaded but before returning, and honors a late abort', () => {
    const result = readListing({
      candidateId: 'candidate-rav4',
      signal: signalAbortingOnRead(2),
    });
    if (result.status !== 'cancelled') {
      throw new Error(`expected status "cancelled", got "${result.status}"`);
    }
    expect(result.toolId).toBe(LISTING_READER_TOOL_ID);
    expect(result.message).toContain('cancelled');
  });

  it('returns a cancelled result for the list-all path too', () => {
    const controller = new AbortController();
    controller.abort();
    const result = readListing({ signal: controller.signal });
    expect(result.status).toBe('cancelled');
  });

  it('is idempotent: calling twice with the same input produces deep-equal output', () => {
    const first = readListing({ candidateId: 'candidate-rav4' });
    const second = readListing({ candidateId: 'candidate-rav4' });
    expect(second).toEqual(first);
  });

  it('is idempotent for the list-all path too', () => {
    const first = readListing();
    const second = readListing();
    expect(second).toEqual(first);
  });

  it('sources every fact from the same fixture data loadFixture would return directly', () => {
    const listings = loadFixture('candidate-listings');
    const rav4 = listings.candidates.find(
      (candidate) => candidate.candidateId === 'candidate-rav4',
    );
    const result = readListing({ candidateId: 'candidate-rav4' });
    expectOk<CandidateListingResult>(result);
    expect(result.data.listing.make).toBe(rav4?.make);
    expect(result.data.listing.trim).toBe(rav4?.trim);
    expect(result.data.listing.modelYear).toBe(rav4?.modelYear);
  });
});
