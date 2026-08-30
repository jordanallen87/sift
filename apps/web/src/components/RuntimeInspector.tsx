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
 */
import { useState } from 'react';
import type { RuntimeDebugCategory, RuntimeDebugLevel } from '@sift/contracts';
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
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

export interface RuntimeInspectorApiConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface RuntimeInspectorProps {
  runId: string;
  /** Called whenever the sheet closes -- Escape, an overlay click, or its own close control -- returning to the normal case workspace (debugging-and-observability.md). */
  onClose: () => void;
  apiConfig?: RuntimeInspectorApiConfig;
}

type InspectorView = 'overview' | 'timeline';

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

function TimelineItem({ event }: { event: RuntimeInspectorEvent }) {
  const tone = STATUS_TONE_META[LEVEL_TONE[event.level]];
  return (
    <li
      data-testid={`runtime-inspector-timeline-item-${event.id}`}
      data-run-id={event.runId}
      className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] p-[var(--space-3)]"
      style={{ backgroundColor: tone.bg }}
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
    </li>
  );
}

export function RuntimeInspector({ runId, onClose, apiConfig = {} }: RuntimeInspectorProps) {
  const [view, setView] = useState<InspectorView>('overview');
  const [category, setCategory] = useState<RuntimeDebugCategory | ''>('');
  const [level, setLevel] = useState<RuntimeDebugLevel | ''>('');

  const { overview, events, loading, error, refresh } = useRuntimeInspector({
    runId,
    ...(category !== '' ? { category } : {}),
    ...(level !== '' ? { level } : {}),
    ...(apiConfig.baseUrl !== undefined ? { baseUrl: apiConfig.baseUrl } : {}),
    ...(apiConfig.fetchImpl !== undefined ? { fetchImpl: apiConfig.fetchImpl } : {}),
  });

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
            run: {runId}
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

          {overview === null ? (
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
                      <TimelineItem key={event.id} event={event} />
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
