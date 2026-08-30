/**
 * Region 7, "Runtime Inspector" (docs/specs/product.md "Workspace layout";
 * docs/specs/debugging-and-observability.md "Runtime Inspector UI") --
 * the minimum-viable slice for this task: **Overview** and **Timeline**
 * only, not the full six-view spec (Execution/State/Context/Errors are
 * later Tier-2 work). Backed by the real `GET /api/debug/runs/:runId` route
 * (`apps/agent/src/routes/debug.ts`) via `useRuntimeInspector`, which reads
 * genuinely persisted `runtime_events` rows -- never mocked or fabricated.
 *
 * Renders as a bottom sheet (`components/ui/sheet.tsx`) that slides up over
 * the workspace rather than swapping out the case body on its own page --
 * "Inspect run" is a still-visible, non-navigating trigger (ADR 0002
 * follow-up: "Inspect run becomes the same sheet mechanism, not a new
 * page"). `App.tsx` still owns mount/unmount via `inspectingRunId !== null`;
 * this component only owns the Sheet's `open` state once mounted, and
 * Escape, an overlay click, and the sheet's own close control all route
 * through `onOpenChange` to the same `onClose` prop that "Return to case"
 * called before.
 * "The 390 px layout uses a single view selector and stacked event details.
 * It must not rely on a side-by-side trace tree and payload panel" -- the
 * Overview/Timeline toggle below is exactly that one selector, and every
 * region stacks vertically at any width.
 *
 * Out of scope for this pass (see this task's brief): Graph/Swarm
 * visualization, the State/Context/Errors views, `pause/resume live event
 * following`, export, copy-to-clipboard, and the full filter set --
 * Timeline supports only the required "category, agent, level" filters
 * minus `agent` (deferred; category+level already exercise the real
 * server-side filter end-to-end) plus free-text is deferred too.
 *
 * Two later gap-closing additions (plan task I2/I3, see this task's own
 * `docs/build-log.md` entry and report):
 *
 * - Every Timeline item now surfaces its real `redactions` manifest --
 *   "this field was withheld, and here is why" -- directly and always
 *   visible when non-empty, never behind a click (`redactValue`,
 *   `event-normalizer.ts`, already populates this; it was silently never
 *   rendered anywhere before). Never the redacted value itself -- `Redaction`
 *   never carries one, so there is nothing to leak.
 * - A Timeline item carrying a real `stateDiff` (`event-normalizer.ts`'s
 *   `normalizeCaseStateChange`, this task's own genuine producer -- a
 *   whole-run before/after `CaseState` diff, `category: 'case'`) renders it
 *   in a collapsible `<details>` disclosure listing each JSON Patch
 *   operation -- "Selecting an event opens its structured safe payload."
 * - `focusEventId` (I2, "a consumer-visible activity event should open its
 *   exact corresponding runtime event"): when supplied, the Inspector opens
 *   directly to the Timeline view and scrolls to/marks the matching item
 *   `data-focused="true"`.
 *
 * Task A5 ("a real developer-mode entry point") and Task I2b (the trigger
 * half of I2 above) extend this component further, per §34's own
 * instruction to reuse it rather than build a second debug system:
 *
 * - `runId` is now `string | null`: the new developer-view entry point
 *   (`CaseHeader`'s "Developer view" control, via `App.tsx`) can open this
 *   Inspector with no specific run in hand at all, not only from a
 *   run-scoped "Inspect run" trigger. `useRuntimeInspector` already treats
 *   `runId: null` as "fetch nothing, report empty state" (unchanged here).
 * - A third **Activity** tab reuses `ActivityTimeline.tsx` verbatim (not a
 *   parallel ledger) to render the case's full chronological activity feed
 *   (`events` prop) -- this is where ADR 0004 item 3/4's "the activity
 *   ledger moves here" actually lands: `App.tsx` no longer mounts
 *   `ActivityTimeline` on the consumer surface at all, only inside this
 *   Inspector. It is independent of `runId`/the Overview+Timeline fetch, so
 *   it works even when the Inspector was opened with no run at all; the
 *   Inspector opens directly to it in that case (no Overview/Timeline data
 *   exists yet to default to).
 * - `onInspectEvent`, threaded straight into the embedded `ActivityTimeline`
 *   as its own `onInspectEvent` prop (Task I2b's trigger): clicking
 *   "Inspect event" on any Activity-tab item calls back up to `App.tsx`
 *   with that item's `runId`/`debugEventId`, which flows back down as new
 *   `runId`/`focusEventId` props -- the effect below reacts to a later
 *   `focusEventId` change (not just the initial mount) by switching to the
 *   Timeline view, so jumping from one run's activity item to a *different*
 *   run's exact Timeline event works without unmounting/remounting this
 *   Inspector. Deliberately NOT also wired for "Inspect run" inside this
 *   embedded copy (own `runId`-only navigation would need the same
 *   controlled-prop round trip for no requirement this pass names) --
 *   omitted from scope rather than half-built.
 */
import { useEffect, useRef, useState, type Ref } from 'react';
import type {
  JsonPatchOperation,
  PublicActivityEvent,
  Redaction,
  RuntimeDebugCategory,
  RuntimeDebugLevel,
} from '@sift/contracts';
import {
  RUNTIME_DEBUG_CATEGORIES,
  RUNTIME_DEBUG_LEVELS,
  useRuntimeInspector,
  type RuntimeInspectorEvent,
} from '../hooks/use-runtime-inspector.js';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ActivityTimeline } from './ActivityTimeline.js';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

export interface RuntimeInspectorApiConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface RuntimeInspectorProps {
  /** The run to inspect, or `null` when opened generally (Task A5's "Developer view" entry point, with no specific run in hand yet). */
  runId: string | null;
  /** Called whenever the sheet closes -- Escape, an overlay click, or its own close control -- returning to the normal case workspace (debugging-and-observability.md). */
  onClose: () => void;
  apiConfig?: RuntimeInspectorApiConfig;
  /** The exact debug event (its synthetic `id`) to jump straight to -- a consumer activity item's `debugEventId` (I2). When set, the Inspector opens directly to the Timeline view and scrolls to/marks the matching item, once loaded, rather than defaulting to Overview. */
  focusEventId?: string;
  /** The case's full chronological activity feed, rendered on the Activity tab (ADR 0004 item 3/4, Task A5). Defaults to an empty list -- a case with genuinely no activity yet is a real, honest state, not an error. */
  events?: PublicActivityEvent[];
  /** Threaded into the embedded `ActivityTimeline`'s own `onInspectEvent` (Task I2b): jumps this same Inspector to a different run's exact Timeline event. Omitted entirely (no "Inspect event" buttons) when absent. */
  onInspectEvent?: (runId: string, debugEventId: string) => void;
}

type InspectorView = 'overview' | 'timeline' | 'activity';

const LEVEL_TONE: Record<RuntimeDebugLevel, StatusTone> = {
  debug: 'neutral',
  info: 'active',
  warn: 'accepted-uncertainty',
  error: 'error',
};

function formatDuration(ms: number | null): string {
  if (ms === null) return 'In progress';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function CountsList({ testId, counts }: { testId: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) {
    return (
      <p className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]">None yet.</p>
    );
  }
  return (
    <dl
      data-testid={testId}
      className="flex flex-wrap gap-[var(--space-2)] text-[length:var(--font-size-xs)]"
    >
      {entries.map(([key, count]) => (
        <div
          key={key}
          className="flex items-center gap-[var(--space-1)] rounded-[var(--radius-pill)] bg-muted px-[var(--space-2)] py-[var(--space-0-5)]"
        >
          <dt className="font-[family-name:var(--font-mono)] text-[var(--color-ink-secondary)]">
            {key}
          </dt>
          <dd className="font-[var(--font-weight-semibold)] text-[var(--color-ink)]">{count}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Bounded, safe preview of one JSON Patch operation's `value` -- the store already redacted anything credential-shaped before this ever reaches the client (`runtime-event-store.ts`'s "Redactor" stage), so this is display truncation only, never a second redaction pass. */
function formatDiffValue(op: JsonPatchOperation): string {
  if (!('value' in op) || op.value === undefined) return '(none)';
  let json: string | undefined;
  try {
    json = JSON.stringify(op.value);
  } catch {
    json = undefined;
  }
  if (json === undefined) return '(unserializable value)';
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
}

function RedactionList({ eventId, redactions }: { eventId: string; redactions: Redaction[] }) {
  if (redactions.length === 0) return null;
  return (
    <ul
      data-testid={`runtime-inspector-timeline-item-${eventId}-redactions`}
      className="flex flex-col gap-[var(--space-0-5)] rounded-[var(--radius-sm)] bg-muted p-[var(--space-2)] font-[family-name:var(--font-mono)] text-[length:var(--font-size-2xs)] text-[var(--color-ink-secondary)]"
    >
      {redactions.map((redaction, index) => (
        <li key={`${redaction.path}-${index}`}>
          <span className="text-[var(--color-ink-muted)]">{redaction.path}</span>: withheld (
          {redaction.reason})
        </li>
      ))}
    </ul>
  );
}

function StateDiffDisclosure({
  eventId,
  stateDiff,
}: {
  eventId: string;
  stateDiff: JsonPatchOperation[];
}) {
  if (stateDiff.length === 0) return null;
  return (
    <details
      data-testid={`runtime-inspector-timeline-item-${eventId}-state-diff`}
      className="rounded-[var(--radius-sm)] bg-muted p-[var(--space-2)] text-[length:var(--font-size-2xs)]"
    >
      <summary className="label-caps cursor-pointer text-[var(--color-ink-secondary)]">
        State diff ({stateDiff.length})
      </summary>
      <ul className="mt-[var(--space-1)] flex flex-col gap-[var(--space-0-5)] font-[family-name:var(--font-mono)] text-[var(--color-ink-secondary)]">
        {stateDiff.map((op, index) => (
          <li key={`${op.path}-${index}`}>
            {op.op} {op.path} {formatDiffValue(op)}
          </li>
        ))}
      </ul>
    </details>
  );
}

function TimelineItem({
  event,
  focused,
  itemRef,
}: {
  event: RuntimeInspectorEvent;
  focused: boolean;
  itemRef?: Ref<HTMLLIElement>;
}) {
  const tone = STATUS_TONE_META[LEVEL_TONE[event.level]];
  return (
    <li
      ref={itemRef}
      data-testid={`runtime-inspector-timeline-item-${event.id}`}
      data-run-id={event.runId}
      {...(focused ? { 'data-focused': 'true' } : {})}
      className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] p-[var(--space-3)]"
      style={{
        backgroundColor: tone.bg,
        ...(focused ? { outline: '2px solid var(--color-brand)', outlineOffset: '2px' } : {}),
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
        <span
          className="label-caps inline-flex items-center gap-[var(--space-1)]"
          style={{ color: tone.ink }}
        >
          <span aria-hidden="true">{tone.icon}</span>
          {event.category} · {event.level}
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]">
          #{event.sequence}
        </span>
      </div>
      <p className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]">{event.summary}</p>
      <div className="flex flex-wrap items-center gap-[var(--space-2)] text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]">
        <time dateTime={event.timestamp}>{formatTimestamp(event.timestamp)}</time>
        <span className="font-[family-name:var(--font-mono)]">{event.name}</span>
        {event.agentId !== undefined ? <span>agent: {event.agentId}</span> : null}
      </div>
      <RedactionList eventId={event.id} redactions={event.redactions} />
      {event.stateDiff !== undefined ? (
        <StateDiffDisclosure eventId={event.id} stateDiff={event.stateDiff} />
      ) : null}
    </li>
  );
}

export function RuntimeInspector({
  runId,
  onClose,
  apiConfig = {},
  focusEventId,
  events: activityEvents = [],
  onInspectEvent,
}: RuntimeInspectorProps) {
  // A focusEventId opens straight to Timeline -- the whole point of "jump
  // from an activity item to its exact debug event" is landing on it without
  // an extra click (I2). Absent that, an Inspector opened with no run in
  // hand at all (Task A5's "Developer view" entry point) has nothing to show
  // on Overview/Timeline yet, so it opens to Activity instead -- the one tab
  // that needs no `runId` at all.
  const [view, setView] = useState<InspectorView>(
    focusEventId !== undefined ? 'timeline' : runId === null ? 'activity' : 'overview',
  );
  const [category, setCategory] = useState<RuntimeDebugCategory | ''>('');
  const [level, setLevel] = useState<RuntimeDebugLevel | ''>('');
  const focusedItemRef = useRef<HTMLLIElement | null>(null);

  const { overview, events, loading, error, refresh } = useRuntimeInspector({
    runId,
    ...(category !== '' ? { category } : {}),
    ...(level !== '' ? { level } : {}),
    ...(apiConfig.baseUrl !== undefined ? { baseUrl: apiConfig.baseUrl } : {}),
    ...(apiConfig.fetchImpl !== undefined ? { fetchImpl: apiConfig.fetchImpl } : {}),
  });

  // Reacts to a LATER `focusEventId` change too, not just the initial
  // mount -- Task I2b's "Inspect event" trigger inside the embedded
  // Activity tab changes `runId`/`focusEventId` via controlled props while
  // this Inspector stays mounted (`onInspectEvent` bubbles up to `App.tsx`
  // and back down), so a `useState` initializer alone would miss it.
  useEffect(() => {
    if (focusEventId !== undefined) {
      setView('timeline');
    }
  }, [focusEventId]);

  // Scrolls the focused item into view once it has actually rendered.
  // `scrollIntoView` is optional-chained because jsdom (the test
  // environment) does not implement it.
  useEffect(() => {
    if (focusEventId === undefined) return;
    focusedItemRef.current?.scrollIntoView?.({ block: 'center' });
  }, [focusEventId, events]);

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent data-testid="runtime-inspector">
        <SheetHeader>
          <SheetTitle>Run details</SheetTitle>
          <span
            data-testid="runtime-inspector-run-id"
            className="font-[family-name:var(--font-mono)] text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
          >
            {runId !== null ? `run: ${runId}` : 'No run selected -- browsing case activity'}
          </span>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-[var(--space-3)]">
          <div className="flex items-center gap-[var(--space-2)]">
            <div
              role="tablist"
              aria-label="Runtime Inspector view"
              className="flex gap-[var(--space-2)]"
            >
              <Button
                type="button"
                role="tab"
                aria-selected={view === 'overview'}
                data-testid="runtime-inspector-tab-overview"
                onClick={() => setView('overview')}
                variant="ghost"
                size="sm"
                className="min-h-[var(--size-touch-target-min)]"
                style={
                  view === 'overview' ? { backgroundColor: 'var(--color-brand-tint)' } : undefined
                }
              >
                Overview
              </Button>
              <Button
                type="button"
                role="tab"
                aria-selected={view === 'timeline'}
                data-testid="runtime-inspector-tab-timeline"
                onClick={() => setView('timeline')}
                variant="ghost"
                size="sm"
                className="min-h-[var(--size-touch-target-min)]"
                style={
                  view === 'timeline' ? { backgroundColor: 'var(--color-brand-tint)' } : undefined
                }
              >
                Timeline
              </Button>
              <Button
                type="button"
                role="tab"
                aria-selected={view === 'activity'}
                data-testid="runtime-inspector-tab-activity"
                onClick={() => setView('activity')}
                variant="ghost"
                size="sm"
                className="min-h-[var(--size-touch-target-min)]"
                style={
                  view === 'activity' ? { backgroundColor: 'var(--color-brand-tint)' } : undefined
                }
              >
                Activity
              </Button>
            </div>
            <Button
              type="button"
              data-testid="runtime-inspector-refresh"
              onClick={refresh}
              aria-busy={loading}
              variant="ghost"
              size="sm"
              className="min-h-[var(--size-touch-target-min)] ml-auto"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>

          {error ? (
            <Alert role="alert" data-testid="runtime-inspector-error" variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {view === 'activity' ? (
            <div data-testid="runtime-inspector-activity">
              <ActivityTimeline
                events={activityEvents}
                {...(onInspectEvent !== undefined ? { onInspectEvent } : {})}
              />
            </div>
          ) : overview === null ? (
            loading ? (
              <div
                data-testid="runtime-inspector-loading"
                aria-busy="true"
                aria-live="polite"
                className="flex flex-col gap-[var(--space-2)]"
              >
                <div className="h-[var(--space-10)] animate-pulse rounded-[var(--radius-md)] bg-muted" />
                <span className="visually-hidden">Loading run…</span>
              </div>
            ) : !error ? (
              <p
                data-testid="runtime-inspector-empty"
                className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
              >
                No run data yet.
              </p>
            ) : null
          ) : view === 'overview' ? (
            <div
              data-testid="runtime-inspector-overview"
              className="flex flex-col gap-[var(--space-3)]"
            >
              <div className="flex flex-wrap gap-[var(--space-2)]">
                <Badge
                  data-testid="runtime-inspector-status"
                  className="label-caps rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
                  style={{
                    color: 'var(--color-status-active-ink)',
                    backgroundColor: 'var(--color-status-active-bg)',
                  }}
                >
                  {overview.status}
                </Badge>
                <span
                  data-testid="runtime-inspector-duration"
                  className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
                >
                  Duration: {formatDuration(overview.durationMs)}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-[var(--space-2)] text-[length:var(--font-size-sm)]">
                <div>
                  <dt className="text-[var(--color-ink-muted)]">Obligation</dt>
                  <dd data-testid="runtime-inspector-obligation-id">{overview.obligationId}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-ink-muted)]">Case</dt>
                  <dd data-testid="runtime-inspector-case-id">{overview.caseId}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-ink-muted)]">Trace</dt>
                  <dd
                    data-testid="runtime-inspector-trace-id"
                    className="font-[family-name:var(--font-mono)]"
                  >
                    {overview.traceId ?? '(none)'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--color-ink-muted)]">Session</dt>
                  <dd
                    data-testid="runtime-inspector-session-id"
                    className="font-[family-name:var(--font-mono)]"
                  >
                    {overview.sessionId ?? '(none)'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--color-ink-muted)]">Events</dt>
                  <dd data-testid="runtime-inspector-event-count">{overview.eventCount}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-ink-muted)]">Errors</dt>
                  <dd data-testid="runtime-inspector-error-count">{overview.errorCount}</dd>
                </div>
              </dl>

              {overview.tokenUsage !== null || overview.estimatedCostUsd !== null ? (
                <div className="flex flex-wrap gap-[var(--space-3)] text-[length:var(--font-size-sm)]">
                  {overview.tokenUsage !== null ? (
                    <span data-testid="runtime-inspector-token-usage">
                      Tokens: {overview.tokenUsage.input} in / {overview.tokenUsage.output} out /{' '}
                      {overview.tokenUsage.total} total
                    </span>
                  ) : null}
                  {overview.estimatedCostUsd !== null ? (
                    <span data-testid="runtime-inspector-estimated-cost">
                      Est. cost: ${overview.estimatedCostUsd.toFixed(4)}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-col gap-[var(--space-1)]">
                <h3 className="label-caps text-[var(--color-ink-secondary)]">By category</h3>
                <CountsList
                  testId="runtime-inspector-category-counts"
                  counts={overview.countsByCategory}
                />
              </div>
              <Separator />
              <div className="flex flex-col gap-[var(--space-1)]">
                <h3 className="label-caps text-[var(--color-ink-secondary)]">By level</h3>
                <CountsList
                  testId="runtime-inspector-level-counts"
                  counts={overview.countsByLevel}
                />
              </div>
            </div>
          ) : (
            <div
              data-testid="runtime-inspector-timeline"
              className="flex flex-col gap-[var(--space-3)]"
            >
              <div className="flex flex-wrap gap-[var(--space-2)]">
                <label className="flex flex-col gap-[var(--space-0-5)] text-[length:var(--font-size-xs)]">
                  Category
                  <select
                    data-testid="runtime-inspector-filter-category"
                    value={category}
                    onChange={(event) =>
                      setCategory(event.target.value as RuntimeDebugCategory | '')
                    }
                    className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] bg-muted px-[var(--space-2)] text-[length:var(--font-size-sm)]"
                  >
                    <option value="">All</option>
                    {RUNTIME_DEBUG_CATEGORIES.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-[var(--space-0-5)] text-[length:var(--font-size-xs)]">
                  Level
                  <select
                    data-testid="runtime-inspector-filter-level"
                    value={level}
                    onChange={(event) => setLevel(event.target.value as RuntimeDebugLevel | '')}
                    className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] bg-muted px-[var(--space-2)] text-[length:var(--font-size-sm)]"
                  >
                    <option value="">All</option>
                    {RUNTIME_DEBUG_LEVELS.map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {events.length === 0 ? (
                <p
                  data-testid="runtime-inspector-timeline-empty"
                  className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
                >
                  No events match this filter.
                </p>
              ) : (
                <ol
                  data-testid="runtime-inspector-timeline-list"
                  className="flex flex-col gap-[var(--space-2)]"
                >
                  {[...events]
                    .sort((a, b) => a.sequence - b.sequence)
                    .map((event) => (
                      <TimelineItem
                        key={event.id}
                        event={event}
                        focused={event.id === focusEventId}
                        {...(event.id === focusEventId ? { itemRef: focusedItemRef } : {})}
                      />
                    ))}
                </ol>
              )}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
