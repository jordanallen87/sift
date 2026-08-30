/**
 * A quiet, honest live indicator for the most recent command/run, driven
 * strictly by a real `CommandReceipt`/`RunReceipt` plus real streamed
 * `PublicActivityEvent`s -- never a fabricated timer (product.md "Real-time
 * experience contract": "The initiating control becomes correlated
 * queued/active state without blocking the rest of the case" and "Loading
 * copy or timers cannot fabricate an event that did not occur.").
 *
 * Two behavior changes from this component's previous version, both
 * required by `docs/decisions/
 * 0004-consumer-workspace-information-architecture.md`:
 *
 * 1. **Renders nothing at all before any command has been sent.** Audit §2
 *    named this file's old "Latest command / No command has been sent
 *    yet." card as one of eleven regions that rendered a full card whose
 *    only content was an announcement of its own emptiness (change-set §5:
 *    "Do not render an empty conceptual region merely because CaseState
 *    contains a corresponding field."). `receipt === null` now returns
 *    `null` outright -- the caller (`RecommendationHero.tsx`) mounts this
 *    component unconditionally and lets it decide its own visibility,
 *    exactly the pattern `ApprovalCard`/`RecommendationCard` already use
 *    for their own `null` inputs.
 * 2. **No longer renders `receipt.commandId`/`receipt.runId` as raw text.**
 *    ADR 0004 decision item 3 moves `commandId`/`runId` to the
 *    developer/inspect projection (change-set §4's terminology table:
 *    "commandId/runId -> Developer view only"; §34 lists both explicitly as
 *    Developer view content). The real run id is still tracked internally
 *    (the caller still needs it to enable/target the "Inspect run"
 *    control, which opens the real `RuntimeInspector` developer view -- see
 *    `RecommendationHero.tsx`) -- it is simply never rendered as visible
 *    text on the consumer surface anymore. The heading also drops "Latest
 *    command" (engine vocabulary -- "command" describes how Sift
 *    implemented this, not what it means for the decision) for
 *    "Investigation status," matching change-set §4's guiding rule:
 *    "Consumer UI should explain what something means for the decision,
 *    not how Pax implemented it."
 *
 * Every state after the instant-"Queued" moment comes only from a real
 * `PublicActivityEvent` correlated to this receipt by `runId` (preferred)
 * or `commandId` (fallback, for the brief window before a run-starting
 * command has an established `runId` on its own events).
 */
import { getActivityLabel, STATUS_TONE_META } from './activity-labels.js';
import type { PublicActivityEvent, PublicActivityPhase } from '@sift/contracts';
import { Badge } from '@/components/ui/badge';

export interface LiveRunStatusReceipt {
  commandId: string;
  runId?: string;
}

export interface LiveRunStatusProps {
  /** The most recent command/run receipt from a visible control or WebMCP call, or `null` before any command has been sent this session. */
  receipt: LiveRunStatusReceipt | null;
  events: PublicActivityEvent[];
}

const PHASE_LABEL: Record<PublicActivityPhase, string> = {
  queued: 'Queued',
  active: 'In progress',
  waiting: 'Waiting for confirmation',
  completed: 'Completed',
  failed: 'Failed',
};

const PHASE_TONE: Record<PublicActivityPhase, keyof typeof STATUS_TONE_META> = {
  queued: 'open',
  active: 'active',
  waiting: 'accepted-uncertainty',
  completed: 'satisfied',
  failed: 'error',
};

// Bound the phase breadcrumb to a small, fixed number of entries -- a real
// Swarm run can reach dozens of distinct phase transitions (each tool
// call/skill activation/handoff alternates active<->completed, so
// consecutive-only deduping below does nothing to bound it), and rendering
// all of them conveys no real information beyond "it alternated a lot"
// while pushing the rest of the workspace down by a large, growing amount.
// A fixed module-scope constant, not recomputed per render.
const MAX_VISIBLE_PHASE_STEPS = 4;

function correlatedEvents(
  events: PublicActivityEvent[],
  receipt: LiveRunStatusReceipt,
): PublicActivityEvent[] {
  return events
    .filter((event) =>
      receipt.runId !== undefined
        ? event.runId === receipt.runId
        : event.commandId === receipt.commandId,
    )
    .sort((a, b) => a.sequence - b.sequence);
}

export function LiveRunStatus({ receipt, events }: LiveRunStatusProps) {
  if (receipt === null) {
    return null;
  }

  const history = correlatedEvents(events, receipt);
  const latest = history.at(-1) ?? null;
  const phase: PublicActivityPhase = latest?.phase ?? 'queued';
  const tone = STATUS_TONE_META[PHASE_TONE[phase]];

  // A distinct, ordered breadcrumb of every phase actually reached, deduping
  // consecutive repeats of the same phase -- never inventing an
  // intermediate phase the real event stream did not report.
  const phaseSequence: PublicActivityPhase[] = [];
  for (const event of history) {
    if (phaseSequence.at(-1) !== event.phase) {
      phaseSequence.push(event.phase);
    }
  }
  if (phaseSequence.length === 0) {
    phaseSequence.push('queued');
  }

  // The most recent phase is always kept (a `slice` from the end never
  // drops the last element), and a leading truncation indicator appears
  // whenever entries were actually dropped, so the breadcrumb never
  // silently pretends a long run was short. See `MAX_VISIBLE_PHASE_STEPS`
  // above for why the count is bounded at all.
  const historyTruncated = phaseSequence.length > MAX_VISIBLE_PHASE_STEPS;
  const visiblePhaseSequence = historyTruncated
    ? phaseSequence.slice(phaseSequence.length - MAX_VISIBLE_PHASE_STEPS)
    : phaseSequence;

  return (
    <section
      data-testid="live-run-status"
      aria-labelledby="live-run-status-heading"
      className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] bg-muted p-[var(--space-3)]"
    >
      <h3 id="live-run-status-heading" className="label-caps text-[var(--color-ink-secondary)]">
        Investigation status
      </h3>

      <Badge
        // Remounts (replaying `.status-change-enter`) on every real phase
        // transition (queued -> active -> completed/failed) -- a live run
        // progressing should read as a felt moment, not a silent label
        // swap.
        key={phase}
        data-testid="live-run-status-phase"
        className="status-change-enter label-caps gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
        style={{ color: tone.ink, backgroundColor: tone.bg }}
      >
        <span aria-hidden="true">{tone.icon}</span>
        {PHASE_LABEL[phase]}
      </Badge>

      {latest ? (
        <p
          data-testid="live-run-status-summary"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
        >
          {latest.summary}
        </p>
      ) : null}

      <ol
        data-testid="live-run-status-history"
        className="flex flex-wrap items-center gap-[var(--space-1)] text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
      >
        {historyTruncated ? (
          <li
            data-testid="live-run-status-history-truncated"
            className="flex items-center gap-[var(--space-1)]"
          >
            <span aria-hidden="true">…</span>
            <span className="visually-hidden">Earlier steps omitted</span>
          </li>
        ) : null}
        {visiblePhaseSequence.map((step, index) => (
          <li key={`${step}-${index}`} className="flex items-center gap-[var(--space-1)]">
            {historyTruncated || index > 0 ? <span aria-hidden="true">→</span> : null}
            {PHASE_LABEL[step]}
          </li>
        ))}
      </ol>

      {latest ? (
        <p className="text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]">
          {getActivityLabel(latest.type).label}
        </p>
      ) : null}
    </section>
  );
}
