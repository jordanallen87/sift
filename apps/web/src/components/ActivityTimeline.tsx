/**
 * Region 5, "Activity" (docs/specs/product.md "Workspace layout"): "a
 * chronological event ledger including tool calls, skill changes, steering,
 * evidence writes, budget decisions, and pauses."
 *
 * Renders a chronological list of real `PublicActivityEvent`s
 * (docs/specs/architecture.md "Real-time event contract",
 * `packages/contracts/src/events.ts`). Every event's `type` is looked up
 * through `activity-labels.ts`'s exhaustive registry -- this component never
 * renders a raw internal `type` string.
 *
 * Each item exposes its `debugEventId`/`eventId` as both a stable
 * `data-testid` and explicit `data-*` attributes, so the Runtime Inspector's
 * "activity-to-trace navigation" (docs/specs/debugging-and-observability.md)
 * can wire "click to open the exact correlated Runtime Inspector event"
 * without this component needing to know anything about the Inspector -- it
 * exposes the correlation surface, not the navigation behavior. The optional
 * `onInspectRun` prop is the coarse, run-level half of that navigation this
 * task's minimum-viable (Overview + Timeline only) Inspector actually
 * supports: any item carrying a `runId` renders a small "Inspect run"
 * button that calls back with it, letting `App.tsx` open the real Inspector
 * for that run -- event-level jump-to-exact-debug-event stays out of scope
 * for this pass (a later task, once the Inspector's own Timeline gains
 * per-event deep linking).
 *
 * Adapted from `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/hq/ActivityView.tsx`'s
 * chronological grouping/label/detail-disclosure information architecture
 * (docs/reuse-source-map.md) -- see docs/reuse-attribution.md. Only the
 * "route every enum through a safe-label table, including an unrecognized
 * fallback" idea and "lead with the human-meaningful fact, keep ids as
 * secondary detail" idea are reused; none of that file's collection-system
 * primitives, entity-detail wiring, or Strata19-specific types are copied.
 */
import type { JsonValue, PublicActivityEvent } from '@pax/contracts';
import { STATUS_TONE_META, getActivityLabel } from './activity-labels.js';

export interface ActivityTimelineProps {
  /** `null` means no case is open yet (initial/empty). An empty array means a case exists but nothing has happened yet. */
  events: PublicActivityEvent[] | null;
  loading?: boolean;
  /** A recoverable error fetching/streaming activity. The last valid `events` still render underneath. */
  error?: string | null;
  /** When provided, any item carrying a `runId` renders an "Inspect run" button that calls back with it -- the run-level half of "jump from a user-facing activity item to its debug event" this task's Overview + Timeline Inspector supports. Omitted entirely (no button) when absent. */
  onInspectRun?: (runId: string) => void;
}

const PHASE_LABEL: Record<PublicActivityEvent['phase'], string> = {
  queued: 'Queued',
  active: 'In progress',
  waiting: 'Waiting for confirmation',
  completed: 'Completed',
  failed: 'Failed',
};

function formatJsonValue(value: JsonValue): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function ActivityItem({
  event,
  onInspectRun,
}: {
  event: PublicActivityEvent;
  onInspectRun?: (runId: string) => void;
}) {
  const { label, tone } = getActivityLabel(event.type);
  const meta = STATUS_TONE_META[tone];
  const correlationId = event.debugEventId ?? event.eventId;
  const detailEntries = event.safeDetails ? Object.entries(event.safeDetails) : [];

  return (
    <li
      data-testid={`activity-item-${correlationId}`}
      data-event-id={event.eventId}
      data-debug-event-id={event.debugEventId ?? ''}
      className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] border p-[var(--space-3)]"
      style={{ borderColor: meta.border, backgroundColor: meta.bg }}
    >
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
        <span
          className="label-caps inline-flex items-center gap-[var(--space-1)]"
          style={{ color: meta.ink }}
        >
          <span aria-hidden="true">{meta.icon}</span>
          {label}
        </span>
        <span
          data-testid="activity-item-phase"
          className="label-caps text-[var(--color-ink-muted)]"
        >
          {PHASE_LABEL[event.phase]}
        </span>
      </div>

      <p className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]">{event.summary}</p>

      <div className="flex flex-wrap items-center gap-[var(--space-2)] text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]">
        <time dateTime={event.timestamp}>{formatTimestamp(event.timestamp)}</time>
        <span className="font-[family-name:var(--font-mono)]">#{event.sequence}</span>
        {onInspectRun !== undefined && event.runId !== undefined ? (
          <button
            type="button"
            data-testid={`activity-item-inspect-run-${event.eventId}`}
            onClick={() => onInspectRun(event.runId!)}
            className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] border border-[var(--color-border-subtle)] px-[var(--space-2)] text-[length:var(--font-size-2xs)] text-[var(--color-ink-secondary)]"
          >
            Inspect run
          </button>
        ) : null}
      </div>

      {detailEntries.length > 0 ? (
        <dl
          data-testid="activity-item-details"
          className="flex flex-col gap-[var(--space-0-5)] rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)] p-[var(--space-2)] font-[family-name:var(--font-mono)] text-[length:var(--font-size-2xs)] text-[var(--color-ink-secondary)]"
        >
          {detailEntries.map(([key, value]) => (
            <div key={key} className="flex gap-[var(--space-1)]">
              <dt className="text-[var(--color-ink-muted)]">{key}:</dt>
              <dd className="min-w-0 break-words">{formatJsonValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </li>
  );
}

export function ActivityTimeline({
  events,
  loading = false,
  error = null,
  onInspectRun,
}: ActivityTimelineProps) {
  const ordered = events === null ? null : [...events].sort((a, b) => a.sequence - b.sequence);

  return (
    <section
      data-testid="activity-timeline"
      aria-labelledby="activity-timeline-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-[var(--space-4)]"
    >
      <h2 id="activity-timeline-heading">Activity</h2>

      {error ? (
        <div
          role="alert"
          data-testid="activity-timeline-error"
          className="rounded-[var(--radius-md)] border border-[var(--color-status-error-border)] bg-[var(--color-status-error-bg)] p-[var(--space-3)] text-[var(--color-status-error-ink)]"
        >
          {error}
        </div>
      ) : null}

      {ordered === null ? (
        loading ? (
          <div
            data-testid="activity-timeline-loading"
            aria-busy="true"
            aria-live="polite"
            className="flex flex-col gap-[var(--space-2)]"
          >
            <div className="h-[var(--space-10)] animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)]" />
            <div className="h-[var(--space-10)] animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)]" />
            <span className="visually-hidden">Loading activity…</span>
          </div>
        ) : (
          <p
            data-testid="activity-timeline-empty"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            No case is open yet. Activity will appear here as Pax works.
          </p>
        )
      ) : ordered.length === 0 ? (
        <p
          data-testid="activity-timeline-no-items"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          Nothing has happened in this case yet.
        </p>
      ) : (
        <ol data-testid="activity-timeline-list" className="flex flex-col gap-[var(--space-2)]">
          {ordered.map((event) => (
            <ActivityItem
              key={event.eventId}
              event={event}
              {...(onInspectRun !== undefined ? { onInspectRun } : {})}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
