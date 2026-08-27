/**
 * Region 6, "Recommendation and approval" (docs/specs/product.md "Workspace
 * layout") -- the approval half. Renders a real `DecisionProposal`
 * (packages/contracts/src/case.ts) with explicit approve/revise/reject
 * controls.
 *
 * Adapted from
 * `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/inline/renderers/ApprovalGateCard.tsx`'s
 * "one clear primary action" idea -- "the approve/reject control itself is
 * the envelope's single `primaryAction`; the card never invents a second
 * one, which is also how 'no self-approval' stays enforceable server-side
 * rather than being a UI convention" (docs/reuse-source-map.md) -- see
 * docs/reuse-attribution.md. Here, Approve is the single visually primary
 * action; Reject and Request revision remain available but secondary,
 * matching product.md's requirement for "explicit approve/revise/reject
 * controls" while keeping one clear default. The settled-state stamp
 * treatment is this task's build of docs/design-system.md's documented
 * "signature element" ("a human stamps the case; the agent never does").
 *
 * HUMAN-ONLY APPROVAL, ENFORCED STRUCTURALLY, NOT BY CONVENTION:
 * architecture.md "Security and authority": "`reviewProposal` rejects
 * requests whose `actor` is not `human`." This component goes further than
 * merely defaulting to `'human'` -- `ApprovalCardProps` has NO `actor`
 * field at all, so there is no prop an integrating caller could pass to
 * override or spoof it, and `onReview`'s own parameter type pins
 * `actor: 'human'` as a literal (not the general `Actor` union from
 * `@pax/contracts`, which also allows `'agent'`). Every call site inside
 * this file constructs that literal directly; grep this file for `actor:`
 * to see there is exactly one value it can ever be. See
 * `ApprovalCard.test.tsx`'s "human-only approval" describe block, which
 * spies on `onReview` and asserts every call across approve/reject/revise
 * carries `actor: 'human'`, plus a compile-time type assertion that
 * `ApprovalCardProps` has no `actor` key at all.
 */
import { useState } from 'react';
import type { DecisionProposal, ReviewProposalDecision } from '@pax/contracts';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

export interface ApprovalCardReview {
  actor: 'human';
  decision: ReviewProposalDecision;
  instructions?: string;
  reason?: string;
}

export interface ApprovalCardProps {
  /** `null` when no proposal is pending review yet. */
  proposal: DecisionProposal | null;
  onReview: (review: ApprovalCardReview) => void;
  /** True while a review submission is in flight; disables all controls. */
  reviewPending?: boolean;
  /** A recoverable error from a failed review submission. The proposal and controls stay visible so the human can retry. */
  error?: string | null;
}

const SETTLED_STATUS_META: Record<
  Exclude<DecisionProposal['status'], 'pending'>,
  { label: string; tone: StatusTone }
> = {
  approved: { label: 'Approved', tone: 'satisfied' },
  rejected: { label: 'Rejected', tone: 'error' },
  revision_requested: { label: 'Revision requested', tone: 'accepted-uncertainty' },
};

interface RevisionFormState {
  open: boolean;
  instructions: string;
}

export function ApprovalCard({
  proposal,
  onReview,
  reviewPending = false,
  error = null,
}: ApprovalCardProps) {
  const [revisionForm, setRevisionForm] = useState<RevisionFormState>({
    open: false,
    instructions: '',
  });

  function submit(
    decision: ReviewProposalDecision,
    details: { instructions?: string; reason?: string } = {},
  ) {
    // The ONLY place `actor` is constructed. Always the literal 'human' --
    // never sourced from a prop, form field, or any other caller-controlled
    // value.
    onReview({ actor: 'human', decision, ...details });
  }

  return (
    <section
      data-testid="approval-card"
      aria-labelledby="approval-card-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-[var(--space-4)]"
    >
      <h2 id="approval-card-heading">Approval</h2>

      {error ? (
        <div
          role="alert"
          data-testid="approval-card-error"
          className="rounded-[var(--radius-md)] border border-[var(--color-status-error-border)] bg-[var(--color-status-error-bg)] p-[var(--space-3)] text-[var(--color-status-error-ink)]"
        >
          {error}
        </div>
      ) : null}

      {proposal === null ? (
        <p
          data-testid="approval-card-empty"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          No proposal is pending review yet.
        </p>
      ) : proposal.status !== 'pending' ? (
        (() => {
          const settledMeta = SETTLED_STATUS_META[proposal.status];
          const meta = STATUS_TONE_META[settledMeta.tone];
          return (
            <div
              data-testid="approval-card-settled"
              className="flex flex-col items-start gap-[var(--space-2)]"
            >
              {/* The "stamp" signature element (docs/design-system.md): a
                  near-square, doubled-border, uppercase, slightly rotated
                  badge -- a human stamps the case, the agent never does. */}
              <div
                data-testid="approval-card-stamp"
                className="label-caps inline-block -rotate-3 rounded-[var(--radius-xs)] px-[var(--space-3)] py-[var(--space-1-5)]"
                style={{
                  color: meta.ink,
                  borderStyle: 'double',
                  borderWidth: '6px',
                  borderColor: meta.ink,
                }}
              >
                {settledMeta.label}
              </div>
              {proposal.revisionInstructions ? (
                <p
                  data-testid="approval-card-revision-instructions"
                  className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
                >
                  {proposal.revisionInstructions}
                </p>
              ) : null}
            </div>
          );
        })()
      ) : (
        <div
          data-testid="approval-card-pending"
          className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border p-[var(--space-3)]"
          style={{
            borderColor: STATUS_TONE_META.ready.border,
            backgroundColor: STATUS_TONE_META.ready.bg,
          }}
        >
          <span
            className="label-caps inline-flex w-fit items-center gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
            style={{ color: STATUS_TONE_META.ready.ink, backgroundColor: 'var(--color-surface)' }}
          >
            Your approval needed
          </span>

          {!revisionForm.open ? (
            <div className="flex flex-col gap-[var(--space-2)]">
              <button
                type="button"
                data-testid="approval-card-approve"
                aria-busy={reviewPending}
                disabled={reviewPending}
                onClick={() => {
                  submit('approve');
                }}
                className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-[var(--space-4)] font-[var(--font-weight-semibold)] text-[var(--color-ink-on-brand)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reviewPending ? 'Submitting…' : 'Approve'}
              </button>

              <div className="flex flex-wrap gap-[var(--space-2)]">
                <button
                  type="button"
                  data-testid="approval-card-reject"
                  disabled={reviewPending}
                  onClick={() => {
                    submit('reject');
                  }}
                  className="min-h-[var(--size-touch-target-min)] flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-[var(--space-3)] text-[length:var(--font-size-sm)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Reject
                </button>
                <button
                  type="button"
                  data-testid="approval-card-request-revision"
                  disabled={reviewPending}
                  onClick={() => {
                    setRevisionForm({ open: true, instructions: '' });
                  }}
                  className="min-h-[var(--size-touch-target-min)] flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-[var(--space-3)] text-[length:var(--font-size-sm)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Request revision
                </button>
              </div>
            </div>
          ) : (
            <form
              data-testid="approval-card-revision-form"
              className="flex flex-col gap-[var(--space-2)]"
              onSubmit={(event) => {
                event.preventDefault();
                if (revisionForm.instructions.trim().length === 0) {
                  return;
                }
                submit('request_revision', { instructions: revisionForm.instructions.trim() });
                setRevisionForm({ open: false, instructions: '' });
              }}
            >
              <label
                htmlFor="approval-card-revision-instructions"
                className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
              >
                What should Pax revise?
              </label>
              <textarea
                id="approval-card-revision-instructions"
                data-testid="approval-card-revision-instructions-input"
                value={revisionForm.instructions}
                onChange={(event) => {
                  setRevisionForm({ open: true, instructions: event.target.value });
                }}
                required
                rows={3}
                className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-2)] text-[length:var(--font-size-base)]"
              />
              <div className="flex flex-wrap gap-[var(--space-2)]">
                <button
                  type="submit"
                  data-testid="approval-card-revision-submit"
                  disabled={reviewPending || revisionForm.instructions.trim().length === 0}
                  className="min-h-[var(--size-touch-target-min)] flex-1 rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-[var(--space-3)] text-[length:var(--font-size-sm)] font-[var(--font-weight-semibold)] text-[var(--color-ink-on-brand)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Submit revision request
                </button>
                <button
                  type="button"
                  data-testid="approval-card-revision-cancel"
                  disabled={reviewPending}
                  onClick={() => {
                    setRevisionForm({ open: false, instructions: '' });
                  }}
                  className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-[var(--space-3)] text-[length:var(--font-size-sm)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
