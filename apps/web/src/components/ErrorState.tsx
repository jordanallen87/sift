/**
 * The "recoverable error" required visible state (docs/specs/product.md
 * "Required visible states"): "Errors must preserve the last valid case
 * state. A failed model or tool call becomes an event and a blocked or
 * retryable obligation; it must not blank the workspace."
 *
 * Deliberately a small, inline banner rather than a full-page/full-region
 * replacement -- it carries no logic to hide or unmount anything else. Every
 * caller (`App.tsx` for a stream-level error, `EvidenceList`/
 * `ActivityTimeline`/`ApprovalCard`/`OptionEditor`/`CustomConcernForm`/
 * `CaseExtensionReviewCard` for their own narrower recoverable errors) is
 * responsible for rendering this *alongside*, never *instead of*, the last
 * valid data -- exactly the pattern those components already establish
 * locally; this component is the shared, reusable version of that same
 * banner for `App.tsx`'s own workspace-level (e.g. live-stream) errors.
 */
export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  /** Overrides the retry control's label (default: "Try again"). */
  retryLabel?: string;
}

export function ErrorState({ message, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  return (
    <div
      role="alert"
      data-testid="error-state"
      className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-status-error-border)] bg-[var(--color-status-error-bg)] p-[var(--space-3)] text-[var(--color-status-error-ink)]"
    >
      <p data-testid="error-state-message">{message}</p>
      {onRetry ? (
        <button
          type="button"
          data-testid="error-state-retry"
          onClick={onRetry}
          className="min-h-[var(--size-touch-target-min)] self-start rounded-[var(--radius-sm)] border border-[var(--color-status-error-border)] px-[var(--space-3)] text-[length:var(--font-size-sm)]"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
