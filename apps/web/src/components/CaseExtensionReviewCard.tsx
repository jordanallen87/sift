/**
 * Human confirm/reject review of one agent-proposed `CaseExtension`
 * (`packages/contracts/src/extensions.ts`). webmcp.md `sift_define_case_attribute`:
 * "an extension autonomously proposed by a runtime agent uses an internal
 * proposal event and remains pending until the user confirms it through the
 * visible UI" -- this card *is* that visible UI. `packages/core/src/
 * readiness.ts` will not count a case-extension-derived obligation toward
 * readiness until this confirmation happens (architecture.md "Security and
 * authority": "Agent-proposed case extensions remain explicitly unconfirmed
 * until a human accepts them").
 *
 * Calls `commands.reviewCaseExtension` on the shared `SiftCommands` instance
 * (CLAUDE.md "Visible UI controls and WebMCP callbacks use the same command
 * implementation"). There is no separate agent-side confirmation path --
 * `docs/specs/architecture.md`'s human-only authority boundary applies here
 * exactly as it does to `ApprovalCard.tsx`'s proposal review.
 */
import { useState } from 'react';
import type { CaseExtension } from '@sift/contracts';
import { useSiftCommands } from '../app/AppProviders.js';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

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
  const commands = useSiftCommands();
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
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] bg-card p-[var(--space-4)]"
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
        <Badge
          data-testid="case-extension-review-card-settled"
          role="status"
          className="status-change-enter label-caps w-fit rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
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
        </Badge>
      ) : (
        <div
          data-testid="case-extension-review-card-pending"
          className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] p-[var(--space-3)]"
          style={{ backgroundColor: 'var(--color-status-ready-bg)' }}
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

          <Label
            htmlFor="case-extension-review-card-note-input"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            Note (optional)
          </Label>
          <Textarea
            id="case-extension-review-card-note-input"
            data-testid="case-extension-review-card-note"
            value={note}
            disabled={pending}
            rows={2}
            onChange={(event) => {
              setNote(event.target.value);
            }}
            className="min-h-[var(--size-touch-target-min)] border-0"
          />

          {error ? (
            <Alert variant="destructive" data-testid="case-extension-review-card-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-[var(--space-2)]">
            <Button
              type="button"
              data-testid="case-extension-review-card-confirm"
              aria-busy={pending}
              disabled={pending}
              onClick={() => {
                submit('confirm');
              }}
              variant="default"
              className="min-h-[var(--size-touch-target-min)] flex-1"
            >
              {pending ? 'Submitting…' : 'Confirm'}
            </Button>
            <Button
              type="button"
              data-testid="case-extension-review-card-reject"
              disabled={pending}
              onClick={() => {
                submit('reject');
              }}
              variant="destructive"
              className="min-h-[var(--size-touch-target-min)] flex-1"
            >
              Reject
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
