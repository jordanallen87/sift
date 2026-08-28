/**
 * A closed-by-default disclosure row for regions 4-8 of the workspace
 * layout (docs/specs/product.md "Workspace layout", ADR 0002): "Compare
 * the options," "What Pax found," "Still checking," "Pax's work so far,"
 * and "Add something Pax should check." Wraps the region's existing,
 * unchanged component -- this file owns no case logic of its own, only the
 * open/closed disclosure chrome and the live one-line summary a closed row
 * must always show (ADR 0002: "nothing is hidden -- every row's live state
 * is visible without opening it").
 *
 * Built on the native `<details>`/`<summary>` element rather than a custom
 * widget: keyboard and screen-reader disclosure semantics (Enter/Space to
 * toggle, `aria-expanded` state) come from the platform for free, with no
 * risk of drifting from them.
 */
import type { ReactNode } from 'react';

export interface DisclosureSectionProps {
  /** Combined with a fixed prefix for every `data-testid` this component renders, e.g. `testId="findings"` -> `disclosure-findings`. */
  testId: string;
  title: string;
  /** A live one-line summary shown in the closed `<summary>` row (e.g. "4 options", "3 findings"). Omit (or pass `undefined`) to render no meta line at all. */
  meta?: string | undefined;
  /** Shows a small pulsing indicator next to the title while work behind this row is genuinely in progress. */
  live?: boolean;
  /** Renders the row already open. Used only for the one state ADR 0002 calls out as requiring attention rather than passive information (an agent-proposed case extension awaiting confirmation). */
  defaultOpen?: boolean;
  children: ReactNode;
}

export function DisclosureSection({
  testId,
  title,
  meta,
  live = false,
  defaultOpen = false,
  children,
}: DisclosureSectionProps) {
  return (
    <details
      data-testid={`disclosure-${testId}`}
      open={defaultOpen}
      className="group rounded-[var(--radius-md)] bg-card"
    >
      <summary
        data-testid={`disclosure-${testId}-summary`}
        className="flex min-h-[var(--size-touch-target-min)] cursor-pointer list-none items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-4)] py-[var(--space-3)] font-[var(--font-weight-semibold)] text-[var(--color-ink)] [&::-webkit-details-marker]:hidden"
      >
        <span className="flex items-center gap-[var(--space-2)]">
          {title}
          {live ? (
            <span
              aria-hidden="true"
              data-testid={`disclosure-${testId}-live`}
              className="h-[6px] w-[6px] shrink-0 rounded-full"
              style={{ backgroundColor: 'var(--color-status-active-ink)' }}
            />
          ) : null}
        </span>
        <span className="flex items-center gap-[var(--space-2)]">
          {meta !== undefined ? (
            <span
              data-testid={`disclosure-${testId}-meta`}
              className="font-[family-name:var(--font-mono)] text-[length:var(--font-size-2xs)] font-normal text-[var(--color-ink-muted)]"
            >
              {meta}
            </span>
          ) : null}
          <span
            aria-hidden="true"
            className="shrink-0 text-[var(--color-ink-muted)] transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)] group-open:rotate-90"
          >
            ›
          </span>
        </span>
      </summary>
      <div
        data-testid={`disclosure-${testId}-content`}
        className="flex flex-col gap-[var(--space-3)] px-[var(--space-4)] pb-[var(--space-4)]"
      >
        {children}
      </div>
    </details>
  );
}
