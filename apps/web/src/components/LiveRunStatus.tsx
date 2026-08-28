/**
 * Correlated queued/active/completed/failed status for the most recent
 * command or run, driven strictly by a real `CommandReceipt`/`RunReceipt`
 * plus real streamed `PublicActivityEvent`s -- never a fabricated timer
 * (product.md "Real-time experience contract": "The initiating control
 * becomes correlated queued/active state without blocking the rest of the
 * case" and "Loading copy or timers cannot fabricate an event that did not
 * occur.").
 *
 * The instant a receipt is returned, this component honestly renders
 * "Queued" -- that is not a fabricated state, it is the documented,
 * synchronous meaning of a `CommandReceipt` having been accepted (product.md
 * step 2-3 of the real-time contract) before any asynchronous event has had
 * a chance to stream in. Every state after that comes only from a real
 * `PublicActivityEvent` correlated to this receipt by `runId` (preferred) or
 * `commandId` (fallback, for the brief window before a run-starting command
 * has an established `runId` on its own events).
 */
import { getActivityLabel, STATUS_TONE_META } from './activity-labels.js';
import type { PublicActivityEvent, PublicActivityPhase } from '@pax/contracts';
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
    return (
      <section
        data-testid="live-run-status"
        aria-labelledby="live-run-status-heading"
        // bg-muted, not bg-card: App.tsx always nests this section inside
        // the "Current focus" card (itself bg-card) -- a second bg-card fill
        // here would be visually indistinguishable from its own parent now
        // that both are flat/borderless, so this reaches for the same
        // muted-fill-inside-a-card contrast mechanism ui/input.tsx uses.
        className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] bg-muted p-[var(--space-3)]"
      >
        <h2 id="live-run-status-heading" className="label-caps text-[var(--color-ink-secondary)]">
          Latest command
        </h2>
        <p
          data-testid="live-run-status-empty"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          No command has been sent yet.
        </p>
      </section>
    );
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

  // Bound the breadcrumb to a small, fixed number of entries -- a real
  // Swarm run can reach dozens of distinct phase transitions (each
  // tool call/skill activation/handoff alternates active<->completed, so
  // consecutive-only deduping above does nothing to bound it), and
  // rendering all of them conveys no real information beyond "it
  // alternated a lot" while pushing the rest of the workspace down by a
  // large, growing amount. The most recent phase is always kept (a `slice`
  // from the end never drops the last element), and a leading truncation
  // indicator appears whenever entries were actually dropped, so the
  // breadcrumb never silently pretends a long run was short.
  const MAX_VISIBLE_PHASE_STEPS = 4;
  const historyTruncated = phaseSequence.length > MAX_VISIBLE_PHASE_STEPS;
  const visiblePhaseSequence = historyTruncated
    ? phaseSequence.slice(phaseSequence.length - MAX_VISIBLE_PHASE_STEPS)
    : phaseSequence;

  return (
    <section
      data-testid="live-run-status"
      aria-labelledby="live-run-status-heading"
      className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] bg-card p-[var(--space-3)]"
    >
      <h2 id="live-run-status-heading" className="label-caps text-[var(--color-ink-secondary)]">
        Latest command
      </h2>

      <Badge
        data-testid="live-run-status-phase"
        className="label-caps gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
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
            …
          </li>
        ) : null}
        {visiblePhaseSequence.map((step, index) => (
          <li key={`${step}-${index}`} className="flex items-center gap-[var(--space-1)]">
            {historyTruncated || index > 0 ? <span aria-hidden="true">→</span> : null}
            {PHASE_LABEL[step]}
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-[var(--space-2)] text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]">
        <span
          data-testid="live-run-status-command-id"
          className="font-[family-name:var(--font-mono)]"
        >
          command: {receipt.commandId}
        </span>
        {receipt.runId !== undefined ? (
          <span
            data-testid="live-run-status-run-id"
            className="font-[family-name:var(--font-mono)]"
          >
            run: {receipt.runId}
          </span>
        ) : null}
      </div>

      {latest ? (
        <p className="text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]">
          {getActivityLabel(latest.type).label}
        </p>
      ) : null}
    </section>
  );
}
