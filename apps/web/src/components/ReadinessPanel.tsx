/**
 * Region 3, "Readiness" (docs/specs/product.md "Workspace layout"):
 * "required obligations grouped by satisfied, active, blocked, accepted
 * uncertainty, and open."
 *
 * `evaluateReadiness(caseState): ReadinessResult`
 * (`packages/core/src/readiness.ts`) is "the single most safety-critical
 * function" in Pax -- CLAUDE.md: "The deterministic core, not an LLM, owns
 * case state, evidence validity, readiness, and human authority." This
 * component only ever *renders* an already-computed `ReadinessResult`-shaped
 * prop; it recomputes nothing and owns no readiness logic of its own.
 *
 * `ReadinessPanelData` is a deliberate structural duplicate of
 * `packages/core/src/readiness.ts`'s `ReadinessResult` interface, not an
 * import of it: `apps/web` depends only on `@pax/contracts` today (see
 * `CaseHeader.tsx`/`DemoLauncher.tsx`), and this task's brief frames the
 * prop as "`ReadinessResult`-shaped", not as the real core type. Because
 * both are structural interfaces built from the same `ObligationState`
 * shape, a real `ReadinessResult` value from `@pax/core` is assignable here
 * without adaptation the moment a later task wires it in.
 *
 * Adapted from `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/inline/renderers/ReadinessStateCard.tsx`'s
 * fail-closed, non-vacuous-measurement principle ("`ready === false` with an
 * empty `blockers` array is a real and important case ... it renders as
 * 'Not ready' with the check fraction rather than as a blocker list that
 * appears to be loading forever") and from
 * `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/orchestration/ReadinessPanel.tsx`'s
 * blocker taxonomy/bucket breakdown idea -- see docs/reuse-attribution.md
 * for the recorded entry. Only the information architecture is reused;
 * Praetor's `shadcn` primitives, scoring model, and desktop assumptions are
 * not.
 */
import type { ReactNode } from 'react';
import type { ObligationState } from '@pax/contracts';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

/** Structural mirror of `packages/core/src/readiness.ts`'s `ReadinessResult` -- see the file header comment above for why this is not a direct import. */
export interface ReadinessPanelData {
  ready: boolean;
  satisfied: ObligationState[];
  active: ObligationState[];
  blocked: ObligationState[];
  acceptedUncertainty: ObligationState[];
  open: ObligationState[];
  blockers: string[];
}

export interface ReadinessPanelProps {
  /** `null` means no case is open yet (initial/empty state) -- distinct from a loaded case with zero obligations, which is `ReadinessPanelData` with every bucket empty and `ready: true`. */
  readiness: ReadinessPanelData | null;
  /** True while a fresh readiness computation is in flight. When `readiness` is already present, the last valid data stays rendered underneath a small "Updating" note rather than being blanked (product.md "Required visible states": "Errors must preserve the last valid case state"). */
  loading?: boolean;
}

interface BucketMeta {
  key: keyof Pick<
    ReadinessPanelData,
    'satisfied' | 'active' | 'blocked' | 'acceptedUncertainty' | 'open'
  >;
  heading: string;
  tone: StatusTone;
  testId: string;
}

// Bucket names copied verbatim from product.md's Readiness region
// description ("grouped by satisfied, active, blocked, accepted
// uncertainty, and open") -- no bucket-level renaming is defined in the
// terminology table, so these are literal, not invented labels.
const BUCKETS: readonly BucketMeta[] = [
  { key: 'satisfied', heading: 'Satisfied questions', tone: 'satisfied', testId: 'satisfied' },
  { key: 'active', heading: 'Active questions', tone: 'active', testId: 'active' },
  { key: 'blocked', heading: 'Blocked questions', tone: 'blocked', testId: 'blocked' },
  {
    key: 'acceptedUncertainty',
    heading: 'Accepted uncertainty',
    tone: 'accepted-uncertainty',
    testId: 'accepted-uncertainty',
  },
  { key: 'open', heading: 'Open questions', tone: 'open', testId: 'open' },
];

function totalObligationCount(readiness: ReadinessPanelData): number {
  return (
    readiness.satisfied.length +
    readiness.active.length +
    readiness.blocked.length +
    readiness.acceptedUncertainty.length +
    readiness.open.length
  );
}

function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const meta = STATUS_TONE_META[tone];
  return (
    <span
      className="label-caps inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
      style={{ color: meta.ink, backgroundColor: meta.bg }}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {children}
    </span>
  );
}

function BucketSection({
  bucket,
  obligations,
}: {
  bucket: BucketMeta;
  obligations: ObligationState[];
}) {
  const meta = STATUS_TONE_META[bucket.tone];
  return (
    <div
      data-testid={`readiness-panel-bucket-${bucket.testId}`}
      className="flex flex-col gap-[var(--space-1-5)] rounded-[var(--radius-md)] border p-[var(--space-3)]"
      style={{ borderColor: meta.border, backgroundColor: meta.bg }}
    >
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <h3 className="text-[length:var(--font-size-sm)]" style={{ color: meta.ink }}>
          {bucket.heading}
        </h3>
        <span
          data-testid={`readiness-panel-bucket-${bucket.testId}-count`}
          className="tabular-nums text-[length:var(--font-size-sm)] font-[var(--font-weight-semibold)]"
          style={{ color: meta.ink }}
        >
          {obligations.length}
        </span>
      </div>
      {obligations.length === 0 ? (
        <p className="text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]">
          None right now.
        </p>
      ) : (
        <ul className="flex flex-col gap-[var(--space-1)]">
          {obligations.map((obligation) => (
            <li
              key={obligation.id}
              data-testid={`readiness-panel-obligation-${obligation.id}`}
              className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
            >
              {obligation.label}
              {obligation.required ? (
                <span className="ml-[var(--space-1)] text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]">
                  (required)
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ReadinessPanel({ readiness, loading = false }: ReadinessPanelProps) {
  if (readiness === null) {
    return (
      <section
        data-testid="readiness-panel"
        aria-labelledby="readiness-panel-heading"
        className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-[var(--space-4)]"
      >
        <h2 id="readiness-panel-heading">Readiness</h2>
        {loading ? (
          <div
            data-testid="readiness-panel-loading"
            aria-busy="true"
            aria-live="polite"
            className="flex flex-col gap-[var(--space-2)]"
          >
            <div className="h-[var(--space-6)] animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)]" />
            <div className="h-[var(--space-6)] animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)]" />
            <span className="visually-hidden">Loading readiness…</span>
          </div>
        ) : (
          <p
            data-testid="readiness-panel-empty"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            No case is open yet. Start a demo to see which questions need to be resolved before a
            decision is ready.
          </p>
        )}
      </section>
    );
  }

  const total = totalObligationCount(readiness);
  const resolvedCount = readiness.satisfied.length + readiness.acceptedUncertainty.length;

  return (
    <section
      data-testid="readiness-panel"
      aria-labelledby="readiness-panel-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-[var(--space-4)]"
    >
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <h2 id="readiness-panel-heading">Readiness</h2>
        {loading ? (
          <span
            data-testid="readiness-panel-updating"
            role="status"
            className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
          >
            Updating…
          </span>
        ) : null}
      </div>

      <div
        data-testid="readiness-panel-status"
        className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] border p-[var(--space-3)]"
        style={{
          borderColor: STATUS_TONE_META[readiness.ready ? 'ready' : 'blocked'].border,
          backgroundColor: STATUS_TONE_META[readiness.ready ? 'ready' : 'blocked'].bg,
        }}
      >
        <StatusBadge tone={readiness.ready ? 'ready' : 'blocked'}>
          {readiness.ready ? 'Ready for decision' : 'Not ready for decision'}
        </StatusBadge>
        {/*
          Non-vacuous copy even in the zero-obligation "ready" case: a case
          with no required questions is honestly described as having none,
          never rendered as a bare "Ready" with no context (this task's
          brief, adapting ReadinessStateCard.tsx's "absent-measurement"
          safeguard).
        */}
        <p
          data-testid="readiness-panel-status-detail"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          {total === 0
            ? 'This case has no required questions to resolve yet.'
            : `${resolvedCount} of ${total} question${total === 1 ? '' : 's'} resolved.`}
        </p>
      </div>

      {!readiness.ready && readiness.blockers.length > 0 ? (
        <div
          data-testid="readiness-panel-blockers"
          role="alert"
          className="flex flex-col gap-[var(--space-1-5)] rounded-[var(--radius-md)] border p-[var(--space-3)]"
          style={{
            borderColor: STATUS_TONE_META.blocked.border,
            backgroundColor: STATUS_TONE_META.blocked.bg,
          }}
        >
          <h3
            className="text-[length:var(--font-size-sm)]"
            style={{ color: STATUS_TONE_META.blocked.ink }}
          >
            Why this case isn&apos;t ready yet
          </h3>
          <ul className="flex flex-col gap-[var(--space-1)]">
            {readiness.blockers.map((blocker) => (
              <li
                key={blocker}
                className="text-[length:var(--font-size-sm)]"
                style={{ color: STATUS_TONE_META.blocked.ink }}
              >
                {blocker}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-[var(--space-2)]">
        {BUCKETS.map((bucket) => (
          <BucketSection key={bucket.key} bucket={bucket} obligations={readiness[bucket.key]} />
        ))}
      </div>
    </section>
  );
}
