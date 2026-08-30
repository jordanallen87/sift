/**
 * Fixture tool: "listing/offer reader"
 * (docs/specs/packs-and-routing.md "Choose Our Next Car Decision Pack" ->
 * "Skills, specialists, and tools").
 *
 * Given a candidate id (or none, to list every candidate), returns that
 * candidate's listing facts (year/trim/advertised price/mileage/source URL)
 * plus its dealer-offer terms (add-ons/APR/term/true out-the-door total)
 * joined from `candidate-listings.json` and `dealer-offers.json`.
 *
 * Evidence-level assignment rule: each of the two facts this tool returns
 * (the listing, and the dealer offer) comes from exactly one traceable
 * fixture document, so each is individually tagged `E1` ("one traceable
 * source or deterministic extraction", packs-and-routing.md). The listing
 * and the dealer offer are deliberately treated as *independent* sources
 * (distinct `sourceId`s, distinct underlying documents dated `listedAt` vs.
 * `quotedAt`) rather than merged into one fact -- this lets
 * `packages/core`'s `achievedEvidenceLevel` (packages/core/src/evidence.ts)
 * synthesize `E2` for the `car.deal_normalization` obligation (which
 * requires `E2` per packs-and-routing.md's obligation table) from two
 * independent `E1` results, exactly the "two independent sources" rule in
 * the E2 definition, without this tool ever needing to assert `E2` itself.
 *
 * The RAV4's teaser-price conflict is never hidden: when `dealer-offers.json`
 * marks `hasTeaserPriceConflict: true`, the dealer-offer evidence item's
 * `verdict` is `degraded` (packs-and-routing.md: "A non-stale `error` or
 * `degraded` evidence result blocks completion for that obligation") and its
 * `summary` states both the advertised and true out-the-door price and the
 * gap explicitly, so a downstream Strands adapter and the UI both see the
 * conflict rather than a silently normalized number.
 */
import type { EvidenceLevel } from '@sift/contracts';
import { loadFixture, type CandidateListing, type DealerOffer } from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const LISTING_READER_TOOL_ID = 'listing-reader';

const LISTING_EVIDENCE_LEVEL: EvidenceLevel = 'E1';

export interface MoneyAmount {
  amount: number;
  currency: string;
}

export interface CandidateListingFacts {
  candidateId: string;
  make: string;
  model: string;
  modelYear: number;
  trim: string;
  bodyStyle: string;
  drivetrain: string;
  powertrain: string;
  advertisedPrice: MoneyAmount;
  mileage: { value: number; unit: string };
  exteriorColor: string;
  listingSourceUrl: string;
  dealerName: string;
  listedAt: string;
}

export interface CandidateDealerOfferFacts {
  dealerName: string;
  quotedAt: string;
  hasTeaserPriceConflict: boolean;
  advertisedPrice: MoneyAmount;
  mandatoryAddOnsTotal: number;
  trueOutTheDoorPrice: number;
  apr: number;
  termMonths: number;
  teaserGap: {
    gapAmount: number;
    gapPercentOfAdvertised: number;
    exceedsHouseholdMaxBudget: boolean;
    householdMaxBudget: number;
  };
}

export interface CandidateListingResult {
  candidateId: string;
  listing: CandidateListingFacts;
  dealerOffer: CandidateDealerOfferFacts;
  evidence: ToolEvidenceItem[];
}

export interface ListingReaderInput {
  candidateId?: string;
  signal?: AbortSignal;
}

function listingSourceId(candidateId: string): string {
  return `source-listing-${candidateId}`;
}

function dealerOfferSourceId(candidateId: string): string {
  return `source-dealer-offer-${candidateId}`;
}

function toListingFacts(listing: CandidateListing): CandidateListingFacts {
  return {
    candidateId: listing.candidateId,
    make: listing.make,
    model: listing.model,
    modelYear: listing.modelYear,
    trim: listing.trim,
    bodyStyle: listing.bodyStyle,
    drivetrain: listing.drivetrain,
    powertrain: listing.powertrain,
    advertisedPrice: { ...listing.advertisedPrice },
    mileage: { ...listing.mileage },
    exteriorColor: listing.exteriorColor,
    listingSourceUrl: listing.listingSourceUrl,
    dealerName: listing.dealerName,
    listedAt: listing.listedAt,
  };
}

function toDealerOfferFacts(offer: DealerOffer): CandidateDealerOfferFacts {
  return {
    dealerName: offer.dealerName,
    quotedAt: offer.quotedAt,
    hasTeaserPriceConflict: offer.hasTeaserPriceConflict,
    advertisedPrice: { ...offer.advertisedPrice },
    mandatoryAddOnsTotal: offer.priceBreakdown.mandatoryAddOnsTotal,
    trueOutTheDoorPrice: offer.priceBreakdown.trueOutTheDoorPrice,
    apr: offer.actualFinancingOffer.apr,
    termMonths: offer.actualFinancingOffer.termMonths,
    teaserGap: {
      gapAmount: offer.teaserGap.gapAmount,
      gapPercentOfAdvertised: offer.teaserGap.gapPercentOfAdvertised,
      exceedsHouseholdMaxBudget: offer.teaserGap.exceedsHouseholdMaxBudget,
      householdMaxBudget: offer.teaserGap.householdMaxBudget,
    },
  };
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The trailing budget-comparison sentence for a dealer-offer evidence
 * summary. Pulled out as its own pure function (rather than a ternary
 * nested inside the teaser-conflict template literal) so both outcomes are
 * directly unit-testable -- in the real fixture, `exceedsHouseholdMaxBudget`
 * happens to always agree with `hasTeaserPriceConflict` (true only for the
 * RAV4, false for every other candidate), so exercising the "conflict but
 * within budget" combination is only possible by calling this function
 * directly, not by calling `readListing` against the real fixture.
 */
export function budgetComparisonSentence(
  exceedsHouseholdMaxBudget: boolean,
  householdMaxBudget: number,
): string {
  return exceedsHouseholdMaxBudget
    ? ` This exceeds the household's $${formatCurrency(householdMaxBudget)} budget.`
    : ` This is within the household's $${formatCurrency(householdMaxBudget)} budget.`;
}

function buildEvidence(listing: CandidateListing, offer: DealerOffer): ToolEvidenceItem[] {
  const listingItem: ToolEvidenceItem = {
    sourceId: listingSourceId(listing.candidateId),
    level: LISTING_EVIDENCE_LEVEL,
    verdict: 'pass',
    summary: `${listing.modelYear} ${listing.make} ${listing.model} ${listing.trim}, advertised $${formatCurrency(listing.advertisedPrice.amount)} at ${listing.mileage.value.toLocaleString('en-US')} ${listing.mileage.unit} (${listing.listingSourceUrl}).`,
  };

  const budgetSentence = budgetComparisonSentence(
    offer.teaserGap.exceedsHouseholdMaxBudget,
    offer.teaserGap.householdMaxBudget,
  );
  const gapSummary = offer.hasTeaserPriceConflict
    ? `Teaser-price conflict: advertised $${formatCurrency(offer.advertisedPrice.amount)} vs. true out-the-door $${formatCurrency(offer.priceBreakdown.trueOutTheDoorPrice)} (${offer.teaserGap.gapPercentOfAdvertised}% higher, $${formatCurrency(offer.teaserGap.gapAmount)} over the advertised price) after $${formatCurrency(offer.priceBreakdown.mandatoryAddOnsTotal)} in mandatory add-ons.${budgetSentence}`
    : `Advertised $${formatCurrency(offer.advertisedPrice.amount)}; true out-the-door $${formatCurrency(offer.priceBreakdown.trueOutTheDoorPrice)} (${offer.teaserGap.gapPercentOfAdvertised}% higher, ordinary tax/title/doc-fee math -- no mandatory-add-on or financing-term conflict).${budgetSentence}`;

  const dealerOfferItem: ToolEvidenceItem = {
    sourceId: dealerOfferSourceId(listing.candidateId),
    level: LISTING_EVIDENCE_LEVEL,
    verdict: offer.hasTeaserPriceConflict ? 'degraded' : 'pass',
    summary: gapSummary,
  };

  return [listingItem, dealerOfferItem];
}

function buildResultFor(listing: CandidateListing, offer: DealerOffer): CandidateListingResult {
  return {
    candidateId: listing.candidateId,
    listing: toListingFacts(listing),
    dealerOffer: toDealerOfferFacts(offer),
    evidence: buildEvidence(listing, offer),
  };
}

/**
 * Returns `ToolResult<CandidateListingResult>` when `input.candidateId` is
 * given, or `ToolResult<CandidateListingResult[]>` (every candidate) when it
 * is omitted. Modeled as one function over a union return type -- rather than
 * overload signatures -- because both branches share the same `not_found`/
 * `cancelled` envelope shapes; callers narrow on `Array.isArray(result.data)`
 * or simply always pass a `candidateId` when they want exactly one.
 */
export function readListing(
  input: ListingReaderInput = {},
): ToolResult<CandidateListingResult | CandidateListingResult[]> {
  if (isAborted(input.signal)) {
    return cancelledResult(LISTING_READER_TOOL_ID);
  }

  const listings = loadFixture('candidate-listings');
  const offers = loadFixture('dealer-offers');

  if (isAborted(input.signal)) {
    return cancelledResult(LISTING_READER_TOOL_ID);
  }

  const offerByCandidateId = new Map(offers.offers.map((offer) => [offer.candidateId, offer]));

  if (input.candidateId !== undefined) {
    const listing = listings.candidates.find(
      (candidate) => candidate.candidateId === input.candidateId,
    );
    const offer = offerByCandidateId.get(input.candidateId);
    if (!listing || !offer) {
      return notFoundResult(
        LISTING_READER_TOOL_ID,
        input.candidateId,
        `no listing/offer found for candidate "${input.candidateId}"`,
      );
    }
    return okResult(LISTING_READER_TOOL_ID, buildResultFor(listing, offer));
  }

  // Non-null: every real candidate-listings.json entry has a matching
  // dealer-offers.json entry (asserted directly in
  // fixture-loader.test.ts's "the two fixture files describe exactly the
  // same candidate ids" case), so there is no reachable "listing without a
  // matching offer" branch here to defend against for the checked-in
  // fixtures. The single-candidateId path above still returns a real
  // `not_found` result for a genuinely unknown *input* id -- this loop only
  // ever sees ids the fixture itself already produced.
  const results = listings.candidates.map((listing) =>
    buildResultFor(listing, offerByCandidateId.get(listing.candidateId)!),
  );
  return okResult(LISTING_READER_TOOL_ID, results);
}
