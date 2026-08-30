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
 * for that run.
 *
 * `onInspectEvent` is the exact-event-level half (plan Task I2b, "a
 * consumer event opens its exact runtime event"): any item that ALSO
 * carries a `debugEventId` (the synthetic id of the precise correlated
 * `runtime_events` row this activity event was derived from -- populated
 * producer-side by `car-purchase-engine.ts`/`home-energy-engine.ts`, see
 * `event-normalizer.ts`) renders a second "Inspect event" button that calls
 * back with both its `runId` and `debugEventId`, letting `App.tsx` open the
 * real Inspector already scrolled to and marking that exact item
 * (`RuntimeInspector`'s `focusEventId` prop). Deliberately gated on
 * `debugEventId` being present, not merely on `onInspectEvent` being
 * provided (global constraint 4, "never render what cannot be true"): an
 * activity event with no correlated runtime event has nothing to jump to,
 * so the button is absent for it entirely rather than present-but-inert.
 *
 * As of Task A5, this component's own real mount point is the developer
 * view (`RuntimeInspector`'s "Activity" tab) rather than the normal
 * consumer workspace -- ADR 0004 item 3/4 moves the raw chronological
 * ledger to developer content; `App.tsx` no longer renders it directly.
 * This component itself is unchanged by that move (it has never known
 * where it is mounted), and `onInspectEvent` is exactly as useful from
 * inside the Inspector's own Activity tab (jumping from one run's activity
 * item to a *different* run's exact Timeline event) as it would be from the
 * old consumer-surface ledger.
 *
 * Adapted from `/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/hq/ActivityView.tsx`'s
 * chronological grouping/label/detail-disclosure information architecture
 * (docs/reuse-source-map.md) -- see docs/reuse-attribution.md. Only the
 * "route every enum through a safe-label table, including an unrecognized
 * fallback" idea and "lead with the human-meaningful fact, keep ids as
 * secondary detail" idea are reused; none of that file's collection-system
 * primitives, entity-detail wiring, or Strata19-specific types are copied.
 */
import type { JsonValue, PublicActivityEvent } from '@sift/contracts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { STATUS_TONE_META, getActivityLabel } from './activity-labels.js';

export interface ActivityTimelineProps {
  /** `null` means no case is open yet (initial/empty). An empty array means a case exists but nothing has happened yet. */
  events: PublicActivityEvent[] | null;
  loading?: boolean;
  /** A recoverable error fetching/streaming activity. The last valid `events` still render underneath. */
  error?: string | null;
  /** When provided, any item carrying a `runId` renders an "Inspect run" button that calls back with it -- the run-level half of "jump from a user-facing activity item to its debug event" this task's Overview + Timeline Inspector supports. Omitted entirely (no button) when absent. */
  onInspectRun?: (runId: string) => void;
  /** When provided, any item carrying BOTH a `runId` and a `debugEventId` renders an "Inspect event" button that calls back with both -- the exact-event-level half of the same navigation (Task I2b). Omitted entirely (no button) when the event has no correlated runtime event to jump to. */
  onInspectEvent?: (runId: string, debugEventId: string) => void;
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
  onInspectEvent,
}: {
  event: PublicActivityEvent;
  onInspectRun?: (runId: string) => void;
  onInspectEvent?: (runId: string, debugEventId: string) => void;
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
      className="list-item-enter flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] p-[var(--space-3)]"
      style={{ backgroundColor: meta.bg }}
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
          <Button
            type="button"
            data-testid={`activity-item-inspect-run-${event.eventId}`}
            onClick={() => onInspectRun(event.runId!)}
            variant="secondary"
            size="xs"
            className="min-h-[var(--size-touch-target-min)]"
          >
            Inspect run
          </Button>
        ) : null}
        {onInspectEvent !== undefined &&
        event.runId !== undefined &&
        event.debugEventId !== undefined ? (
          <Button
            type="button"
            data-testid={`activity-item-inspect-event-${event.eventId}`}
            aria-label={`Inspect exact runtime event for "${event.summary}"`}
            onClick={() => onInspectEvent(event.runId!, event.debugEventId!)}
            variant="secondary"
            size="xs"
            className="min-h-[var(--size-touch-target-min)]"
          >
            Inspect event
          </Button>
        ) : null}
      </div>

      {detailEntries.length > 0 ? (
        <dl
          data-testid="activity-item-details"
          className="flex flex-col gap-[var(--space-0-5)] rounded-[var(--radius-sm)] bg-muted p-[var(--space-2)] font-[family-name:var(--font-mono)] text-[length:var(--font-size-2xs)] text-[var(--color-ink-secondary)]"
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
  onInspectEvent,
}: ActivityTimelineProps) {
  const ordered = events === null ? null : [...events].sort((a, b) => a.sequence - b.sequence);

  return (
    <section
      data-testid="activity-timeline"
      aria-labelledby="activity-timeline-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
    >
      <h2 id="activity-timeline-heading">Sift&apos;s work so far</h2>

      {error ? (
        <Alert role="alert" data-testid="activity-timeline-error" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {ordered === null ? (
        loading ? (
          <div
            data-testid="activity-timeline-loading"
            aria-busy="true"
            aria-live="polite"
            className="flex flex-col gap-[var(--space-2)]"
          >
            <div className="h-[var(--space-10)] animate-pulse rounded-[var(--radius-md)] bg-muted" />
            <div className="h-[var(--space-10)] animate-pulse rounded-[var(--radius-md)] bg-muted" />
            <span className="visually-hidden">Loading activity…</span>
          </div>
        ) : (
          <p
            data-testid="activity-timeline-empty"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            No case is open yet. Activity will appear here as Sift works.
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
              {...(onInspectEvent !== undefined ? { onInspectEvent } : {})}
            />
          ))}
        </ol>
      )}
    </section>
  );
}
