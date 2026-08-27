/**
 * Region 4, "Evidence and comparison" (docs/specs/product.md "Workspace
 * layout") -- the evidence/claims/staleness list itself. Renders a list of
 * `EvidenceCard`s. Option scores, the user's active selection, and
 * pack/case-defined attribute comparison are explicitly out of scope for
 * this task (a later task's option editor/comparison component).
 */
import { EvidenceCard, type EvidenceItemData } from './EvidenceCard.js';

export interface EvidenceListProps {
  /** `null` means no case is open yet (initial/empty). An empty array means a case exists but no evidence has been gathered yet -- a distinct, also-honest empty state. */
  items: EvidenceItemData[] | null;
  loading?: boolean;
  /** A recoverable error fetching/streaming evidence. The last valid `items` still render underneath (product.md "Errors must preserve the last valid case state"). */
  error?: string | null;
}

export function EvidenceList({ items, loading = false, error = null }: EvidenceListProps) {
  return (
    <section
      data-testid="evidence-list"
      aria-labelledby="evidence-list-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-[var(--space-4)]"
    >
      <h2 id="evidence-list-heading">Evidence</h2>

      {error ? (
        <div
          role="alert"
          data-testid="evidence-list-error"
          className="rounded-[var(--radius-md)] border border-[var(--color-status-error-border)] bg-[var(--color-status-error-bg)] p-[var(--space-3)] text-[var(--color-status-error-ink)]"
        >
          {error}
        </div>
      ) : null}

      {items === null ? (
        loading ? (
          <div
            data-testid="evidence-list-loading"
            aria-busy="true"
            aria-live="polite"
            className="flex flex-col gap-[var(--space-2)]"
          >
            <div className="h-[var(--space-10)] animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)]" />
            <div className="h-[var(--space-10)] animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)]" />
            <span className="visually-hidden">Loading evidence…</span>
          </div>
        ) : (
          <p
            data-testid="evidence-list-empty"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            No case is open yet. Evidence will appear here as Pax investigates.
          </p>
        )
      ) : items.length === 0 ? (
        <p
          data-testid="evidence-list-no-items"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          No evidence has been gathered yet.
        </p>
      ) : (
        <ul data-testid="evidence-list-items" className="flex flex-col gap-[var(--space-2)]">
          {items.map((item) => (
            <li key={item.evidenceLink.id}>
              <EvidenceCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
