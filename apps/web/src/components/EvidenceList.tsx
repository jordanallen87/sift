/**
 * Region 4, "Evidence and comparison" (docs/specs/product.md "Workspace
 * layout") -- the evidence/claims/staleness list itself. Renders a list of
 * `EvidenceCard`s. Option comparison lives in the sibling `OptionComparison`/
 * `OptionEditor` components.
 *
 * `onSetDisposition`/`dispositionPendingId` (live-wiring pass, see
 * `docs/build-log.md`'s dated entry): thread `EvidenceCard`'s own optional
 * disposition-control prop through to every item, correlated by
 * `evidenceLink.id` -- `dispositionPendingId` marks only the one item
 * currently being changed as busy, not the whole list.
 */
import { EvidenceCard, type EvidenceItemData } from './EvidenceCard.js';
import type { EvidenceDisposition } from '@pax/contracts';

export interface EvidenceListProps {
  /** `null` means no case is open yet (initial/empty). An empty array means a case exists but no evidence has been gathered yet -- a distinct, also-honest empty state. */
  items: EvidenceItemData[] | null;
  loading?: boolean;
  /** A recoverable error fetching/streaming evidence. The last valid `items` still render underneath (product.md "Errors must preserve the last valid case state"). */
  error?: string | null;
  /** Reports the human's chosen disposition and reason for one item, identified by `evidenceId`. Omit to render every item read-only. */
  onSetDisposition?: (evidenceId: string, disposition: EvidenceDisposition, reason: string) => void;
  /** The `evidenceLink.id` of the item currently being changed, if any -- only that item's controls render as busy. */
  dispositionPendingId?: string | null;
}

export function EvidenceList({
  items,
  loading = false,
  error = null,
  onSetDisposition,
  dispositionPendingId = null,
}: EvidenceListProps) {
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
              <EvidenceCard
                item={item}
                dispositionPending={dispositionPendingId === item.evidenceLink.id}
                {...(onSetDisposition
                  ? {
                      onSetDisposition: (disposition: EvidenceDisposition, reason: string) => {
                        onSetDisposition(item.evidenceLink.id, disposition, reason);
                      },
                    }
                  : {})}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
