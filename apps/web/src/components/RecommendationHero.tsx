/**
 * The answer-first hero (`docs/decisions/
 * 0004-consumer-workspace-information-architecture.md`, decision item 1;
 * `docs/change-sets/2026-08-30-generic-decision-workspace.md` §38, §39,
 * §64). This is the ONE region that says what Sift currently thinks and
 * what, if anything, the user needs to do about it -- replacing three
 * previously-separate, previously-adjacent regions that could (and did)
 * disagree with each other in the same glance: the retired
 * `WorkspaceStatusHeader` (a four-stage tracker + next-step banner),
 * `RecommendationCard` ("Our pick: READY FOR REVIEW"), and `ApprovalCard`
 * ("Your decision: No proposal is pending review yet.") rendered as
 * adjacent siblings. ADR 0004 names this exact contradiction as the defect
 * this component exists to close: "Collapsing them into one region removes
 * the seam: there is one place that says what Sift currently thinks and
 * what, if anything, the user needs to do about it, and it cannot disagree
 * with itself because it is one region, not two."
 *
 * `status` (a `WorkspaceStatus` from `workspace-status.ts`) is the single
 * state machine driving what renders below the headline -- this component
 * owns no derivation logic of its own, only the layout and the decision of
 * *which* already-real data to show for a given phase. `RecommendationCard`
 * and `ApprovalCard` are reused verbatim (not reimplemented): both already
 * correctly render their own populated states, and `ApprovalCard` in
 * particular has NO `actor` prop at all -- reusing it here, rather than
 * hand-rolling new approve/reject/revise controls, is what keeps
 * CLAUDE.md's "human approval stays human-only" guarantee intact without
 * this file needing to re-earn it. Per change-set §5 ("Do not render an
 * empty conceptual region merely because CaseState contains a corresponding
 * field"), this component mounts each of the four real Sift regions it
 * composes -- `LiveRunStatus`, `RecommendationCard`, `ApprovalCard`, and the
 * "Review findings" action -- only when there is something real to show:
 * a `null` recommendation with no withheld draft renders no
 * `RecommendationCard` at all rather than its own "No recommendation yet"
 * copy, and a `null` proposal renders no `ApprovalCard` at all rather than
 * its own "No proposal is pending review yet." copy. `LiveRunStatus` now
 * enforces this same rule internally (see its own file header), so it is
 * always safe to mount unconditionally here.
 */
import type {
  DecisionProposal,
  PublicActivityEvent,
  Recommendation,
  Source,
} from '@sift/contracts';
import { Button } from '@/components/ui/button';
import { ApprovalCard, type ApprovalCardReview } from './ApprovalCard.js';
import { RecommendationCard, type RecommendationWithheld } from './RecommendationCard.js';
import { LiveRunStatus, type LiveRunStatusReceipt } from './LiveRunStatus.js';
import type { WorkspaceStatus } from './workspace-status.js';

export interface RecommendationHeroProps {
  status: WorkspaceStatus;
  recommendation: Recommendation | null;
  withheld: RecommendationWithheld | null;
  sources: Record<string, Source>;
  proposal: DecisionProposal | null;
  onReview: (review: ApprovalCardReview) => void;
  reviewPending: boolean;
  reviewError: string | null;
  onRequestInvestigation: () => void;
  requestPending: boolean;
  requestDisabled: boolean;
  requestError: string | null;
  onReviewFindingsClick: () => void;
  liveRunReceipt: LiveRunStatusReceipt | null;
  liveEvents: PublicActivityEvent[];
  onInspectRun: (runId: string) => void;
}

export function RecommendationHero({
  status,
  recommendation,
  withheld,
  sources,
  proposal,
  onReview,
  reviewPending,
  reviewError,
  onRequestInvestigation,
  requestPending,
  requestDisabled,
  requestError,
  onReviewFindingsClick,
  liveRunReceipt,
  liveEvents,
  onInspectRun,
}: RecommendationHeroProps) {
  const showRecommendation = recommendation !== null || withheld !== null;

  return (
    <div
      data-testid="recommendation-hero"
      aria-labelledby="recommendation-hero-headline"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
    >
      {/* Remounts (and replays `.status-change-enter`) whenever the phase
          itself changes -- the same "a real state transition deserves a
          felt moment" convention the retired next-step banner used, now
          applied to the one headline that replaces it. */}
      <div
        key={status.phase}
        data-testid="recommendation-hero-status"
        data-phase={status.phase}
        role="status"
        className="status-change-enter flex flex-col gap-[var(--space-1)]"
      >
        <h2 id="recommendation-hero-headline" data-testid="recommendation-hero-headline">
          {status.headline}
        </h2>
        {status.detail ? (
          <p
            data-testid="recommendation-hero-detail"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            {status.detail}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        <Button
          type="button"
          data-testid="request-investigation"
          aria-busy={requestPending}
          disabled={requestPending || requestDisabled}
          onClick={onRequestInvestigation}
          size="sm"
          // Primary emphasis only while nothing has been looked into yet --
          // once real content exists below, this becomes a secondary,
          // always-available "look again" control rather than competing
          // with the phase's own real next action (Approve/Reject/Revise,
          // or Review findings).
          variant={status.phase === 'not_started' ? 'default' : 'secondary'}
          className="min-h-[var(--size-touch-target-min)]"
        >
          {requestPending ? 'Requesting…' : 'Request investigation'}
        </Button>

        {status.action?.kind === 'review_findings' ? (
          <Button
            type="button"
            data-testid="recommendation-hero-review-findings"
            onClick={onReviewFindingsClick}
            size="sm"
            variant="default"
            className="min-h-[var(--size-touch-target-min)]"
          >
            {status.action.label}
          </Button>
        ) : null}
      </div>

      {requestError ? (
        <p
          role="alert"
          data-testid="request-investigation-error"
          className="text-[length:var(--font-size-sm)]"
          style={{ color: 'var(--color-status-error-ink)' }}
        >
          {requestError}
        </p>
      ) : null}

      <LiveRunStatus receipt={liveRunReceipt} events={liveEvents} />

      {liveRunReceipt?.runId !== undefined ? (
        <Button
          type="button"
          data-testid="open-runtime-inspector"
          onClick={() => onInspectRun(liveRunReceipt.runId!)}
          variant="secondary"
          size="sm"
          className="min-h-[var(--size-touch-target-min)] self-start"
        >
          Inspect run
        </Button>
      ) : null}

      {showRecommendation ? (
        <RecommendationCard recommendation={recommendation} withheld={withheld} sources={sources} />
      ) : null}

      {proposal !== null ? (
        <ApprovalCard
          proposal={proposal}
          onReview={onReview}
          reviewPending={reviewPending}
          error={reviewError}
        />
      ) : null}
    </div>
  );
}
