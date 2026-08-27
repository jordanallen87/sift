/**
 * Human confirm/reject review of one agent-proposed `CaseExtension`
 * (`packages/contracts/src/extensions.ts`). webmcp.md `pax_define_case_attribute`:
 * "an extension autonomously proposed by a runtime agent uses an internal
 * proposal event and remains pending until the user confirms it through the
 * visible UI" -- this card *is* that visible UI. `packages/core/src/
 * readiness.ts` will not count a case-extension-derived obligation toward
 * readiness until this confirmation happens (architecture.md "Security and
 * authority": "Agent-proposed case extensions remain explicitly unconfirmed
 * until a human accepts them").
 *
 * Calls `commands.reviewCaseExtension` on the shared `PaxCommands` instance
 * (CLAUDE.md "Visible UI controls and WebMCP callbacks use the same command
 * implementation"). There is no separate agent-side confirmation path --
 * `docs/specs/architecture.md`'s human-only authority boundary applies here
 * exactly as it does to `ApprovalCard.tsx`'s proposal review.
 */
import { useState } from 'react';
import type { CaseExtension } from '@pax/contracts';
import { usePaxCommands } from '../app/AppProviders.js';

export interface CaseExtensionReviewCardProps {
  caseId: string;
  expectedSequence: number;
  /** `null` when no agent-proposed extension is pending review. */
  extension: CaseExtension | null;
}

const CONFIRMATION_LABEL: Record<CaseExtension['definition']['confirmation'], string> = {
  pending: 'Pending your review',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
};

export function CaseExtensionReviewCard({
  caseId,
  expectedSequence,
  extension,
}: CaseExtensionReviewCardProps) {
  const commands = usePaxCommands();
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(decision: 'confirm' | 'reject') {
    if (extension === null || pending) return;
    setPending(true);
    setError(null);
    const reason = note.trim();

    commands
      .reviewCaseExtension({
        caseId,
        extensionId: extension.id,
        decision,
        expectedSequence,
        ...(reason.length > 0 ? { reason } : {}),
      })
      .then(() => {
        setPending(false);
        setNote('');
      })
      .catch((caught: unknown) => {
        setPending(false);
        setError(caught instanceof Error ? caught.message : 'Could not record this review.');
      });
  }

  return (
    <section
      data-testid="case-extension-review-card"
      aria-labelledby="case-extension-review-card-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-[var(--space-4)]"
    >
      <h2 id="case-extension-review-card-heading">Proposed concern</h2>

      {extension === null ? (
        <p
          data-testid="case-extension-review-card-empty"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          No agent-proposed concern is pending review.
        </p>
      ) : extension.definition.confirmation !== 'pending' ? (
        <div
          data-testid="case-extension-review-card-settled"
          role="status"
          className="label-caps inline-flex w-fit items-center rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
          style={{
            color:
              extension.definition.confirmation === 'confirmed'
                ? 'var(--color-status-satisfied-ink)'
                : 'var(--color-status-error-ink)',
            backgroundColor:
              extension.definition.confirmation === 'confirmed'
                ? 'var(--color-status-satisfied-bg)'
                : 'var(--color-status-error-bg)',
          }}
        >
          {CONFIRMATION_LABEL[extension.definition.confirmation]}
        </div>
      ) : (
        <div
          data-testid="case-extension-review-card-pending"
          className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border p-[var(--space-3)]"
          style={{
            borderColor: 'var(--color-status-ready-border)',
            backgroundColor: 'var(--color-status-ready-bg)',
          }}
        >
          <p
            data-testid="case-extension-review-card-label"
            className="font-[var(--font-weight-semibold)] text-[var(--color-ink)]"
          >
            {extension.definition.label}
          </p>
          <p
            data-testid="case-extension-review-card-reason"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
          >
            {extension.definition.reason}
          </p>
          <p
            data-testid="case-extension-review-card-proposed-by"
            className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
          >
            Proposed by {extension.definition.proposedBy}
          </p>

          <label
            htmlFor="case-extension-review-card-note-input"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            Note (optional)
          </label>
          <textarea
            id="case-extension-review-card-note-input"
            data-testid="case-extension-review-card-note"
            value={note}
            disabled={pending}
            rows={2}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[var(--space-2)] text-[length:var(--font-size-base)] disabled:cursor-not-allowed disabled:opacity-60"
          />

          {error ? (
            <div
              role="alert"
              data-testid="case-extension-review-card-error"
              className="rounded-[var(--radius-md)] border border-[var(--color-status-error-border)] bg-[var(--color-status-error-bg)] p-[var(--space-3)] text-[var(--color-status-error-ink)]"
            >
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-[var(--space-2)]">
            <button
              type="button"
              data-testid="case-extension-review-card-confirm"
              aria-busy={pending}
              disabled={pending}
              onClick={() => {
                submit('confirm');
              }}
              className="min-h-[var(--size-touch-target-min)] flex-1 rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-[var(--space-3)] font-[var(--font-weight-semibold)] text-[var(--color-ink-on-brand)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Submitting…' : 'Confirm'}
            </button>
            <button
              type="button"
              data-testid="case-extension-review-card-reject"
              disabled={pending}
              onClick={() => {
                submit('reject');
              }}
              className="min-h-[var(--size-touch-target-min)] flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-[var(--space-3)] text-[length:var(--font-size-sm)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
