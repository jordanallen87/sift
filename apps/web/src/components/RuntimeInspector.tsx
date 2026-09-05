/**
 * Region 7, "Runtime Inspector" (docs/specs/product.md "Workspace layout";
 * docs/specs/debugging-and-observability.md "Runtime Inspector UI") --
 * **Overview**, **Timeline**, **Execution** and **Activity** -- four of the
 * six views the spec names (State and Context remain unbuilt). Backed by the
 * real `GET /api/debug/runs/:runId` route
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
 * Still unbuilt: the State/Context/Errors views, `pause/resume live event
 * following`, and copy-to-clipboard. Graph/Swarm structure is no longer
 * among them -- it has its own Execution tab, rendered by `RunGraphView`,
 * which derives node stages and parallelism from the same events the
 * Timeline lists.
 *
 * --- The complete Timeline filter set, and why the DOM stays small ---
 *
 * Timeline now offers all four filters the spec names -- "category, agent,
 * level, and free-text" -- plus the WebMCP origin filter/badge that section
 * requires "once the WebMCP origin marker ... is implemented". Every one of
 * them is a query parameter on the real `GET /api/debug/runs/:runId` route
 * and re-fetches; none is a client-side `.filter()` over an already-loaded
 * array, which would disagree with the whole-run `overview` beside it.
 *
 * The agent and origin controls are rendered only when the *run itself*
 * offers values (`overview.agentIds`, `overview.countsByOrigin`). Origin
 * propagation onto runtime events is arriving separately from this UI, so
 * this surface must degrade honestly: no marker on any event means no
 * badge, no control, and no invented "user" origin -- an absent marker
 * means "the caller stated no origin", which is deliberately not the same
 * fact as a human click (`debug.ts`, ADR 0006 decision 8).
 *
 * A single real car run is ~245 runtime events, and the spec caps a run at
 * 10,000. Rendering that into a 390 px pane is unreadable and unbounded, so
 * the Timeline renders a fixed-size WINDOW of the ordered events
 * (`TIMELINE_WINDOW_SIZE`) with explicit earlier/later paging, keeping the
 * DOM node count constant no matter how large the run is -- the property
 * the spec's "virtualized chronological events" is actually asking for.
 * Deliberately paging rather than scroll-position-driven windowing: item
 * heights here are genuinely variable (a redaction manifest and a stateDiff
 * disclosure both grow an item), measured heights are the one thing jsdom
 * cannot provide, and a scroll-driven implementation would therefore ship
 * with only pixel-blind tests behind it. Paging is keyboard-reachable,
 * announceable, and honestly testable.
 *
 * The window follows `focusEventId` rather than fighting it: jumping from
 * an activity item to its exact debug event moves the window to the page
 * containing that event, so the `data-focused="true"` item is always
 * genuinely in the DOM. And when a filter would hide the focused event
 * entirely, the Timeline says so and offers to clear the filters instead of
 * silently showing an unrelated list.
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
import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import {
  CommandOriginSchema,
  type CommandOrigin,
  type JsonPatchOperation,
  type PublicActivityEvent,
  type Redaction,
  type RuntimeDebugCategory,
  type RuntimeDebugLevel,
} from '@sift/contracts';
import {
  COMMAND_ORIGINS,
  RUNTIME_DEBUG_CATEGORIES,
  RUNTIME_DEBUG_LEVELS,
  useRuntimeInspector,
  type RuntimeInspectorEvent,
} from '../hooks/use-runtime-inspector.js';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ActivityTimeline } from './ActivityTimeline.js';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';
import { RunGraphView } from './RunGraphView.js';

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

type InspectorView = 'overview' | 'timeline' | 'execution' | 'activity';

const LEVEL_TONE: Record<RuntimeDebugLevel, StatusTone> = {
  debug: 'neutral',
  info: 'active',
  warn: 'accepted-uncertainty',
  error: 'error',
};

/** How many Timeline items exist in the DOM at once, regardless of run size. See this module's header comment. */
const TIMELINE_WINDOW_SIZE = 50;

/** Waits out a burst of typing before asking the server again -- one request per phrase, not one per keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

/** The start of the window containing `index`, page-aligned so paging by hand and jumping to a focused event always land on the same boundaries. */
function windowStartFor(index: number): number {
  return Math.max(0, Math.floor(index / TIMELINE_WINDOW_SIZE) * TIMELINE_WINDOW_SIZE);
}

/** Consumer-legible names for the closed `COMMAND_ORIGINS` vocabulary. Exhaustive by type, so a future origin cannot be rendered as a raw token. */
const ORIGIN_LABELS: Record<CommandOrigin, string> = {
  webmcp: 'WebMCP',
};

/**
 * The WebMCP provenance marker, read the same way `debug.ts` reads it:
 * `attributes.origin`, validated against the closed vocabulary. Returns
 * `undefined` both when no marker is present and when the value is not a
 * recognized origin -- this surface never invents provenance, and an event
 * that states nothing renders no badge at all.
 */
function readEventOrigin(event: RuntimeInspectorEvent): CommandOrigin | undefined {
  const parsed = CommandOriginSchema.safeParse(event.attributes['origin']);
  return parsed.success ? parsed.data : undefined;
}

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
  const origin = readEventOrigin(event);
  return (
    <li
      ref={itemRef}
      data-testid={`runtime-inspector-timeline-item-${event.id}`}
      data-run-id={event.runId}
      {...(origin !== undefined ? { 'data-origin': origin } : {})}
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
        <span className="flex items-center gap-[var(--space-2)]">
          {/* Rendered only for an event that genuinely carries the marker:
              "a command issued through a registered WebMCP tool is visibly
              distinguishable from an identical command issued through its
              matching UI control" (debugging-and-observability.md
              "Acceptance requirements"). A direct UI click states no
              origin and correctly gets no badge -- absence of a badge is
              not a claim that a human clicked, only that nothing was
              stated. */}
          {origin !== undefined ? (
            <Badge
              data-testid={`runtime-inspector-timeline-item-${event.id}-origin`}
              className="label-caps rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
              style={{
                color: 'var(--color-status-active-ink)',
                backgroundColor: 'var(--color-status-active-bg)',
              }}
            >
              {ORIGIN_LABELS[origin]}
            </Badge>
          ) : null}
          <span className="font-[family-name:var(--font-mono)] text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]">
            #{event.sequence}
          </span>
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

/**
 * Hands an already-downloaded bundle to the browser as a saved file.
 *
 * The save step is deliberately the LAST thing that happens and is
 * feature-detected: the fetch, the contract check, the redaction the server
 * already applied, and the reported event count are the parts that carry
 * the behavior, and they must not depend on an environment that can write
 * files. jsdom does implement `createObjectURL`, but has no download
 * support, so a component test clicking Export logs one harmless
 * "Not implemented: navigation to another Document" from jsdom's virtual
 * console -- that is jsdom declining to save the file, not a defect here,
 * and the assertions above it are unaffected.
 */
function saveExportedBundle(filename: string, body: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const objectUrl = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
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
  const [agent, setAgent] = useState('');
  const [origin, setOrigin] = useState<CommandOrigin | ''>('');
  // Two pieces of state on purpose: `searchInput` is what the field shows
  // (immediate, so typing never feels laggy), `search` is what the server
  // has been asked for. They converge after SEARCH_DEBOUNCE_MS.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [windowStart, setWindowStart] = useState(0);
  const [exportStatus, setExportStatus] = useState<
    { state: 'idle' } | { state: 'working' } | { state: 'done'; message: string }
  >({ state: 'idle' });
  const [exportError, setExportError] = useState<string | null>(null);
  const focusedItemRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (searchInput === search) return;
    const timer = setTimeout(() => setSearch(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const { overview, events, loading, error, refresh, exportRun } = useRuntimeInspector({
    runId,
    ...(category !== '' ? { category } : {}),
    ...(level !== '' ? { level } : {}),
    ...(agent !== '' ? { agent } : {}),
    ...(origin !== '' ? { origin } : {}),
    ...(search !== '' ? { search } : {}),
    ...(apiConfig.baseUrl !== undefined ? { baseUrl: apiConfig.baseUrl } : {}),
    ...(apiConfig.fetchImpl !== undefined ? { fetchImpl: apiConfig.fetchImpl } : {}),
  });

  const filtersActive =
    category !== '' || level !== '' || agent !== '' || origin !== '' || search !== '';

  function clearFilters(): void {
    setCategory('');
    setLevel('');
    setAgent('');
    setOrigin('');
    setSearchInput('');
    setSearch('');
  }

  // One ordering for the whole Timeline, computed once per fetch rather than
  // per render: `sequence` is monotonic within a run, so this is the run's
  // true chronology even when the server returned rows in another order.
  const orderedEvents = useMemo(
    () => [...events].sort((a, b) => a.sequence - b.sequence),
    [events],
  );
  const focusIndex =
    focusEventId === undefined ? -1 : orderedEvents.findIndex((event) => event.id === focusEventId);
  // The focused event exists, but the active filters excluded it from the
  // list -- the one case where staying silent would be a lie, because the
  // Inspector was opened specifically to show that event.
  const focusHiddenByFilter = focusEventId !== undefined && focusIndex === -1 && filtersActive;

  // The Overview's "Obligation" field names the ONE obligation a run was
  // launched to investigate (`overview.obligationId`) -- accurate for a
  // Graph round, which genuinely targets one obligation at a time, but not
  // the whole truth for a Swarm round: Home Energy Guardian's Swarm runs
  // every specialist every round and its events carry as many as five
  // distinct `obligationId` values (confirmed directly against a real run's
  // exported bundle -- `energy.anomaly`, `energy.rate_change`,
  // `energy.weather`, `energy.household_change`, `energy.response_options`
  // all appear on one run's events). Left as a single field, "Obligation"
  // silently understates what a Swarm run did -- a Graph-shaped assumption
  // (one round, one obligation) applied to a Swarm. This is derived from
  // the run's own loaded events, never hardcoded to either pack, so a
  // Graph run -- whose events genuinely name only its one obligation --
  // renders no extra note at all.
  //
  // Deliberately gated on `!filtersActive`: `events` is the SAME
  // server-filtered array the Timeline renders (see this hook's own header
  // comment -- category/level/agent/search/origin are real query
  // parameters, not a client-side `.filter()`), so a filter left active on
  // the Timeline tab would make this list silently partial if it were
  // computed while filtered. Saying nothing is honest here; asserting
  // partial coverage as if it were total would not be.
  const obligationIdsFromEvents = useMemo(() => {
    const ids = new Set<string>();
    for (const event of orderedEvents) {
      if (typeof event.obligationId === 'string' && event.obligationId.length > 0) {
        ids.add(event.obligationId);
      }
    }
    return [...ids].sort();
  }, [orderedEvents]);
  const otherObligationIds =
    overview !== null && !filtersActive
      ? obligationIdsFromEvents.filter((id) => id !== overview.obligationId)
      : [];

  // Every new result set re-anchors the window: to the page holding the
  // focused event when there is one, otherwise back to the start of the run.
  // Paging within an unchanged result set does not re-run this, so "Later
  // events" is not undone on the next render.
  useEffect(() => {
    setWindowStart(focusIndex >= 0 ? windowStartFor(focusIndex) : 0);
  }, [orderedEvents, focusIndex]);

  const windowedEvents = orderedEvents.slice(windowStart, windowStart + TIMELINE_WINDOW_SIZE);
  const hasEarlier = windowStart > 0;
  const hasLater = windowStart + TIMELINE_WINDOW_SIZE < orderedEvents.length;

  async function handleExport(): Promise<void> {
    setExportStatus({ state: 'working' });
    setExportError(null);
    try {
      const result = await exportRun();
      saveExportedBundle(result.filename, result.body);
      setExportStatus({
        state: 'done',
        message: `Exported ${result.exportedEventCount} events to ${result.filename}.`,
      });
    } catch (caught: unknown) {
      setExportStatus({ state: 'idle' });
      setExportError(caught instanceof Error ? caught.message : 'The export failed.');
    }
  }

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
          {/* Wraps rather than compressing: at 390 px the view selector plus
              the two global actions do not fit on one line, and a second
              row is preferable to shrinking controls below the 44 px touch
              target. */}
          <div className="flex flex-wrap items-center gap-[var(--space-2)]">
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
              {/*
                The Timeline answers "what happened, in order". This answers
                "what shape did the run have" -- which nodes ran at once, and
                what followed them. That structure is present in the same
                events and invisible in a flat list.
              */}
              <Button
                type="button"
                role="tab"
                aria-selected={view === 'execution'}
                data-testid="runtime-inspector-tab-execution"
                onClick={() => setView('execution')}
                variant="ghost"
                size="sm"
                className="min-h-[var(--size-touch-target-min)]"
                style={
                  view === 'execution' ? { backgroundColor: 'var(--color-brand-tint)' } : undefined
                }
              >
                Execution
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
            {/* "Download a sanitized sift-run-<runId>.json bundle"
                (debugging-and-observability.md "Global inspector actions").
                Only offered when there is a run to export -- the developer
                entry point can open with none at all. */}
            {runId !== null ? (
              <Button
                type="button"
                data-testid="runtime-inspector-export"
                onClick={() => void handleExport()}
                disabled={exportStatus.state === 'working'}
                aria-busy={exportStatus.state === 'working'}
                variant="ghost"
                size="sm"
                className="min-h-[var(--size-touch-target-min)]"
              >
                {exportStatus.state === 'working' ? 'Exporting…' : 'Export'}
              </Button>
            ) : null}
          </div>

          {error ? (
            <Alert role="alert" data-testid="runtime-inspector-error" variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {exportError !== null ? (
            <Alert role="alert" data-testid="runtime-inspector-export-error" variant="destructive">
              <AlertDescription>{exportError}</AlertDescription>
            </Alert>
          ) : null}

          {exportStatus.state === 'done' ? (
            <p
              data-testid="runtime-inspector-export-status"
              role="status"
              className="text-[length:var(--font-size-xs)] text-[var(--color-ink-secondary)]"
            >
              {exportStatus.message}
            </p>
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
          ) : view === 'execution' ? (
            <div data-testid="runtime-inspector-execution">
              <RunGraphView events={events} />
            </div>
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
                  {/* A Swarm round can genuinely resolve several obligations
                      at once -- see this component's own header comment on
                      `otherObligationIds` for why this is derived from the
                      run's real events rather than assumed, and why it says
                      nothing while a Timeline filter is narrowing them. */}
                  {otherObligationIds.length > 0 ? (
                    <p
                      data-testid="runtime-inspector-obligation-coverage"
                      className="text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]"
                    >
                      {`This run's events also name ${otherObligationIds.length === 1 ? 'one other obligation' : `${otherObligationIds.length} other obligations`}: ${otherObligationIds.join(', ')}.`}
                    </p>
                  ) : null}
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
              {/* Shown only for a run that genuinely carries origin markers.
                  A run whose events state no origin gets no section at all,
                  rather than a misleading "0 WebMCP" that would read as a
                  claim about how the run was driven. */}
              {Object.keys(overview.countsByOrigin).length > 0 ? (
                <>
                  <Separator />
                  <div className="flex flex-col gap-[var(--space-1)]">
                    <h3 className="label-caps text-[var(--color-ink-secondary)]">By origin</h3>
                    <CountsList
                      testId="runtime-inspector-origin-counts"
                      counts={overview.countsByOrigin}
                    />
                  </div>
                </>
              ) : null}
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
                {/* Offered only over the agents this run's events actually
                    name, from the whole-run `overview` -- a free-text agent
                    box would invite ids that match nothing, and a list
                    built from the *filtered* events would collapse to the
                    one agent already chosen. */}
                {overview !== null && overview.agentIds.length > 0 ? (
                  <label className="flex flex-col gap-[var(--space-0-5)] text-[length:var(--font-size-xs)]">
                    Agent
                    <select
                      data-testid="runtime-inspector-filter-agent"
                      value={agent}
                      onChange={(event) => setAgent(event.target.value)}
                      className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] bg-muted px-[var(--space-2)] text-[length:var(--font-size-sm)]"
                    >
                      <option value="">All</option>
                      {overview.agentIds.map((entry) => (
                        <option key={entry} value={entry}>
                          {entry}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {/* Same rule for provenance: no marker anywhere in the run
                    means no control, because every value it could offer
                    would return nothing. See the header comment. */}
                {overview !== null && Object.keys(overview.countsByOrigin).length > 0 ? (
                  <label className="flex flex-col gap-[var(--space-0-5)] text-[length:var(--font-size-xs)]">
                    Origin
                    <select
                      data-testid="runtime-inspector-filter-origin"
                      value={origin}
                      onChange={(event) => setOrigin(event.target.value as CommandOrigin | '')}
                      className="min-h-[var(--size-touch-target-min)] rounded-[var(--radius-sm)] bg-muted px-[var(--space-2)] text-[length:var(--font-size-sm)]"
                    >
                      <option value="">All</option>
                      {COMMAND_ORIGINS.filter(
                        (entry) => overview.countsByOrigin[entry] !== undefined,
                      ).map((entry) => (
                        <option key={entry} value={entry}>
                          {ORIGIN_LABELS[entry]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="flex min-w-0 flex-1 flex-col gap-[var(--space-0-5)] text-[length:var(--font-size-xs)]">
                  Find
                  <Input
                    data-testid="runtime-inspector-filter-search"
                    type="search"
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search events"
                    className="min-h-[var(--size-touch-target-min)] text-[length:var(--font-size-sm)]"
                  />
                </label>
                {filtersActive ? (
                  <Button
                    type="button"
                    data-testid="runtime-inspector-clear-filters"
                    onClick={clearFilters}
                    variant="ghost"
                    size="sm"
                    className="min-h-[var(--size-touch-target-min)] self-end"
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>

              {/* The Inspector was opened to show one specific event and the
                  active filters exclude it. Saying nothing would look like
                  the jump simply failed. */}
              {focusHiddenByFilter ? (
                <Alert role="alert" data-testid="runtime-inspector-focus-hidden">
                  <AlertDescription>
                    The event you jumped to is hidden by the current filters.
                  </AlertDescription>
                </Alert>
              ) : null}

              {orderedEvents.length === 0 ? (
                <p
                  data-testid="runtime-inspector-timeline-empty"
                  className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
                >
                  No events match this filter.
                </p>
              ) : (
                <>
                  <ol
                    data-testid="runtime-inspector-timeline-list"
                    className="flex flex-col gap-[var(--space-2)]"
                  >
                    {windowedEvents.map((event) => (
                      <TimelineItem
                        key={event.id}
                        event={event}
                        focused={event.id === focusEventId}
                        {...(event.id === focusEventId ? { itemRef: focusedItemRef } : {})}
                      />
                    ))}
                  </ol>

                  {/* Only worth showing once a run outgrows one window --
                      most runs do, and the count is the honest answer to
                      "am I looking at all of it?". */}
                  {orderedEvents.length > TIMELINE_WINDOW_SIZE ? (
                    <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                      <Button
                        type="button"
                        data-testid="runtime-inspector-timeline-earlier"
                        onClick={() =>
                          setWindowStart((start) => Math.max(0, start - TIMELINE_WINDOW_SIZE))
                        }
                        disabled={!hasEarlier}
                        variant="ghost"
                        size="sm"
                        className="min-h-[var(--size-touch-target-min)]"
                      >
                        Earlier
                      </Button>
                      <Button
                        type="button"
                        data-testid="runtime-inspector-timeline-later"
                        onClick={() =>
                          setWindowStart((start) =>
                            Math.min(
                              start + TIMELINE_WINDOW_SIZE,
                              windowStartFor(orderedEvents.length - 1),
                            ),
                          )
                        }
                        disabled={!hasLater}
                        variant="ghost"
                        size="sm"
                        className="min-h-[var(--size-touch-target-min)]"
                      >
                        Later
                      </Button>
                      <span
                        data-testid="runtime-inspector-timeline-window"
                        aria-live="polite"
                        className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
                      >
                        Showing {windowStart + 1}–{windowStart + windowedEvents.length} of{' '}
                        {orderedEvents.length} events
                      </span>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
