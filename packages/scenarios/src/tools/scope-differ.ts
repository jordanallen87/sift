/**
 * Fixture tool: "scope differ"
 * (docs/bid-comparison/plan.md "Specialists and skills": `scope-analyst`
 * tools `bid-reader`/`scope-differ`, obligation `bid.scope_normalization`
 * -- "put all three [bids] on one scope basis").
 *
 * Compares one or more bids against `job.json`'s `requiredScopeLineItems`
 * and reports, per bid, which required items the bid actually prices and
 * which it is silent on. This is the deterministic check the whole demo
 * turns on: Cedar & Sons' bid is missing three required items -- permits
 * and inspections, the shower-valve rough-in, and debris haul-away -- and
 * that silence, not an explicit scope exclusion, is exactly what makes its
 * quoted total misleadingly low (`bid-calculator.ts` prices the gap).
 *
 * Honesty rule (docs/bid-comparison/plan.md's own framing, `job.json`'s own
 * `note`): "A bid that omits an item is not scoping it out explicitly -- it
 * is simply silent on it." A required item is therefore classified into
 * exactly one of three states, never collapsed into a boolean:
 *
 * - `'absent'` -- no line item at all for this `scopeItemId`;
 * - `'priced_at_zero'` -- a line item exists, priced at exactly $0;
 * - `'priced'` -- a line item exists, priced above $0.
 *
 * Collapsing `'priced_at_zero'` into `'absent'` (e.g. by checking
 * `amount.amount` truthiness) would silently misreport a contractor who
 * explicitly included an item at no charge as one who never mentioned it at
 * all -- the opposite of this tool's job. The real fixtures never exercise
 * a $0 line item, so `diffBidScope` is exported as a pure function over
 * plain job/bid facts precisely so this distinction is directly
 * unit-testable against a hand-built bid, the same discipline
 * `bill-feed-gate.ts`'s `evaluateBillFeed` uses for its own
 * otherwise-fixture-unreachable branches.
 *
 * `bid-calculator.ts` imports and reuses `diffBidScope` directly rather
 * than re-deriving "which required items does this bid leave absent" a
 * second time.
 *
 * Evidence-level assignment rule: like `energy-calculator.ts`'s rate-change
 * and weather-normalization computations, this is a domain-specific
 * deterministic check that joins two independently authored documents (the
 * job's required scope and the bid's own line items), so each per-bid
 * result is tagged `E3` ("verified by a domain-specific deterministic
 * check", packs-and-routing.md's evidence-level table) rather than the `E1`
 * a single-document read would earn.
 */
import { isBidFixtureName, type BidFixtureName, type MoneyAmount } from './bid-reader.js';
import { loadFixture } from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const SCOPE_DIFFER_TOOL_ID = 'scope-differ';

export type ScopeItemStatus = 'priced' | 'priced_at_zero' | 'absent';

export interface ScopeItemDiffEntry {
  scopeItemId: string;
  label: string;
  status: ScopeItemStatus;
  /** Present iff `status !== 'absent'` -- an absent item has no line item to carry an amount from. */
  amount?: MoneyAmount;
}

export interface BidScopeDiff {
  bidId: string;
  contractorName: string;
  requiredItemCount: number;
  pricedItemCount: number;
  absentItemCount: number;
  absentItemIds: string[];
  items: ScopeItemDiffEntry[];
}

export interface ScopeDifferResult {
  jobId: string;
  requiredScopeLineItems: { scopeItemId: string; label: string }[];
  bids: BidScopeDiff[];
  evidence: ToolEvidenceItem[];
}

export interface ScopeDifferInput {
  /** Which bids to compare. Defaults to `job.json`'s own `biddersInvited` (all three). */
  bidIds?: string[];
  signal?: AbortSignal;
}

/** The two job fields `diffBidScope` actually reads -- see `BillFeedInput` in `bill-feed-gate.ts` for the same narrowing discipline. A real `BidJob` (from `loadFixture('job')`) satisfies this structurally with no cast. */
export interface ScopeDifferJobInput {
  requiredScopeLineItems: { scopeItemId: string; label: string }[];
}

/** The three bid fields `diffBidScope` actually reads. A real `Bid` (from `loadFixture`) satisfies this structurally with no cast. */
export interface ScopeDifferBidInput {
  bidId: string;
  contractorName: string;
  lineItems: { scopeItemId: string; amount: MoneyAmount }[];
}

/**
 * Pure: no disk I/O, no dependency on which fixtures (or non-fixture
 * job/bid) the caller obtained its arguments from. Every classification
 * branch, including the otherwise fixture-unreachable `'priced_at_zero'`
 * case, is directly unit-testable against hand-built objects.
 */
export function diffBidScope(job: ScopeDifferJobInput, bid: ScopeDifferBidInput): BidScopeDiff {
  const lineItemByScopeId = new Map(bid.lineItems.map((item) => [item.scopeItemId, item]));

  const items: ScopeItemDiffEntry[] = job.requiredScopeLineItems.map((required) => {
    const base = { scopeItemId: required.scopeItemId, label: required.label };
    const lineItem = lineItemByScopeId.get(required.scopeItemId);
    if (!lineItem) {
      return { ...base, status: 'absent' };
    }
    const status: ScopeItemStatus = lineItem.amount.amount === 0 ? 'priced_at_zero' : 'priced';
    return { ...base, status, amount: { ...lineItem.amount } };
  });

  const absentItems = items.filter((item) => item.status === 'absent');
  const pricedItemCount = items.length - absentItems.length;

  return {
    bidId: bid.bidId,
    contractorName: bid.contractorName,
    requiredItemCount: job.requiredScopeLineItems.length,
    pricedItemCount,
    absentItemCount: absentItems.length,
    absentItemIds: absentItems.map((item) => item.scopeItemId),
    items,
  };
}

function scopeDifferSourceId(bidId: string): string {
  return `source-scope-diff-${bidId}`;
}

function toEvidenceItem(diff: BidScopeDiff): ToolEvidenceItem {
  if (diff.absentItemCount === 0) {
    return {
      sourceId: scopeDifferSourceId(diff.bidId),
      level: 'E3',
      verdict: 'pass',
      summary: `${diff.contractorName} (${diff.bidId}) prices all ${diff.requiredItemCount} required scope items -- nothing absent.`,
    };
  }

  const missingLabels = diff.items
    .filter((item) => item.status === 'absent')
    .map((item) => item.label);

  return {
    sourceId: scopeDifferSourceId(diff.bidId),
    level: 'E3',
    verdict: 'degraded',
    summary: `${diff.contractorName} (${diff.bidId}) is missing ${diff.absentItemCount} of ${diff.requiredItemCount} required scope items: ${missingLabels.join('; ')}.`,
  };
}

export function compareBidScope(input: ScopeDifferInput = {}): ToolResult<ScopeDifferResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(SCOPE_DIFFER_TOOL_ID);
  }

  const job = loadFixture('job');
  const bidIds = input.bidIds ?? job.biddersInvited;

  const validatedBidIds: BidFixtureName[] = [];
  for (const bidId of bidIds) {
    if (!isBidFixtureName(bidId)) {
      return notFoundResult(
        SCOPE_DIFFER_TOOL_ID,
        bidId,
        `no bid fixture found for bidId "${bidId}"`,
      );
    }
    validatedBidIds.push(bidId);
  }

  if (isAborted(input.signal)) {
    return cancelledResult(SCOPE_DIFFER_TOOL_ID);
  }

  const diffs = validatedBidIds.map((bidId) => diffBidScope(job, loadFixture(bidId)));

  return okResult(SCOPE_DIFFER_TOOL_ID, {
    jobId: job.jobId,
    requiredScopeLineItems: job.requiredScopeLineItems.map((item) => ({ ...item })),
    bids: diffs,
    evidence: diffs.map(toEvidenceItem),
  });
}
