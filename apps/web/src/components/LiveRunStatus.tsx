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
 *    text on the consumer surface anymore.
 *
 * Every state after the instant-"Queued" moment comes only from a real
 * `PublicActivityEvent` correlated to this receipt by `runId` (preferred)
 * or `commandId` (fallback, for the brief window before a run-starting
 * command has an established `runId` on its own events).
 *
 * **Heading text (Task A9, `docs/planning/plans/
 * 2026-08-30-generic-decision-workspace.md` Phase A).** A prior revision of
 * this component renamed the heading from "Latest command" to
 * "Investigation status," reasoning that "command" was engine vocabulary.
 * Live inspection at 430px found the real cost of that framing directly:
 * the hero could render "Nothing's been looked into yet." immediately above
 * a heading reading "Investigation status -- Completed" describing
 * `Added option "2022 Subaru Outback Premium AWD"` -- individually true,
 * contradictory together, because this block can correctly show the status
 * of a completed *command* that was never an investigation at all (fixture/
 * demo seeding, or -- once `App.tsx`'s `deriveReceiptFromEvents` stops
 * suppressing seed-only receipts entirely -- any other real, distinct,
 * non-investigation command). "Investigation status" over-claimed what this
 * block actually reports. It reports the status of the last *command*, so
 * it is labeled "Latest command," matching what it has always actually
 * derived its content from (`LiveRunStatusReceipt.commandId`/`runId` and
 * their correlated `PublicActivityEvent`s) rather than a broader claim about
 * investigation the underlying data cannot support.
 *
 * **The badge reports the RUN's phase, not the newest event's phase.** This
 * component used to read `history.at(-1).phase` straight into the badge,
 * which is not a question about the run at all: roughly half of a real
 * run's correlated events (`tool.completed`, `skill.activated`,
 * `specialist.completed`) legitimately carry `phase: 'completed'` while the
 * run is still very much in flight, interleaved with the `active` ones. That
 * was invisible only for as long as the runtime buffered the whole stream
 * and drained it in one ~70 ms burst after the graph had already finished --
 * the badge alternated, but it alternated inside a single frame and settled
 * on whatever the last event happened to be. `car-purchase-graph.ts` and
 * `home-energy-swarm.ts` now stream events as the graph runs (first event at
 * ~6.5 ms rather than ~55.6 ms, delivery spread across the run), so the same
 * derivation would now visibly flip "In progress" -> "Completed" ->
 * "In progress" on camera mid-run and reach the right answer only by luck of
 * ordering.
 *
 * `deriveRunPhase` below answers the run-level question instead, delegating
 * the "is this run still going" half of it to `workspace-status.ts`'s
 * `deriveActiveRunId` -- the same derivation the hero headline uses, so the
 * badge and the headline cannot disagree about whether Sift is still working.
 * The per-event *summary* line is deliberately left as-is: that one genuinely
 * is "the latest thing that happened," and it is the part a person watches to
 * see the run move.
 */
import { getActivityLabel, STATUS_TONE_META } from './activity-labels.js';
import { deriveActiveRunId } from './workspace-status.js';
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

// Bound the phase breadcrumb to a small, fixed number of entries. Deriving
// each step from the RUN's phase rather than each event's phase already
// removes the pathological case this bound was originally written for (a
// Swarm run alternating active<->completed across ~35 sub-steps produced 42
// rendered <li> entries, because consecutive-only deduping cannot collapse
// an alternation). The bound stays because the run-level lifecycle is small
// but not fixed-length: every confirmation gate the run opens and closes is
// a real active -> waiting -> active pair, so a run that pauses for the
// human several times still grows without a ceiling. A fixed module-scope
// constant, not recomputed per render.
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

/**
 * The phase of the run (or, for a receipt that never started one, of the
 * command) that `history` describes -- NOT the phase of its newest event.
 * `history` must already be correlated to one receipt and sorted by
 * `sequence`, exactly as `correlatedEvents` returns it.
 *
 * Four cases, in the order they are decided:
 *
 * 1. **Nothing has streamed back yet.** A real receipt exists, so something
 *    was genuinely accepted; `queued` is the honest report until the first
 *    correlated event lands. (Unchanged behaviour.)
 *
 * 2. **The run is still in flight** (`deriveActiveRunId` returns an id).
 *    The badge reports a non-terminal phase no matter what the last
 *    individual sub-step reported, which is the whole point of this
 *    function. Within that, it reports the strongest state the run has
 *    actually reached: `waiting` if a gate is currently open (see below),
 *    otherwise `active` once any correlated event has reported real work
 *    starting, otherwise still `queued` -- a run that has only been queued
 *    should not claim to be in progress.
 *
 *    **Why `waiting` outranks `active` here.** Every other phase describes
 *    what Sift is doing; `waiting` is the one phase that is a claim on the
 *    *human*, and a pane reading "In progress" while the run cannot proceed
 *    without an answer is a worse lie than the one this function exists to
 *    fix. Promoting it is safe precisely because it is not the `completed`
 *    situation in disguise: dozens of sub-steps reach `completed` on their
 *    way through a healthy run, but there is at most one unanswered gate at
 *    a time, and the very next correlated event for the run *is* the gate
 *    being answered (`interventions.ts` `ConsequenceGuard` resolves a
 *    `Confirm` and the run continues). So "the newest correlated event
 *    reports `waiting`" means "unanswered gate," and any later event means
 *    "answered" -- it cannot flicker the way a raw per-event read does.
 *
 * 3. **No run was ever involved** -- a presentation-only or otherwise
 *    non-run command, whose only correlated event is its own
 *    `command.accepted`. There is no interleaving to be confused by, and
 *    that event's phase *is* the command's status.
 *
 * 4. **The run is over.** Report the outcome it actually reached, taken
 *    from the newest correlated event carrying a terminal phase -- which is
 *    the run's own `run.completed`/`run.failed`, since nothing else is
 *    appended after it. Deliberately not "did any event fail?": a run can
 *    survive a `tool.failed` that `RetrySteering` recovers from, and
 *    calling that whole run Failed would be the same class of defect in the
 *    other direction. Reading the newest terminal event rather than simply
 *    the newest event also keeps a post-terminal straggler that still
 *    carries the run id (a duplicate delivery, a replayed backlog) from
 *    dragging a finished run back to "In progress".
 */
function deriveRunPhase(history: readonly PublicActivityEvent[]): PublicActivityPhase {
  const latest = history.at(-1);
  if (latest === undefined) {
    return 'queued';
  }

  if (deriveActiveRunId(history) !== null) {
    if (latest.phase === 'waiting') {
      return 'waiting';
    }
    return history.some((event) => event.phase === 'active') ? 'active' : 'queued';
  }

  if (!history.some((event) => event.runId !== undefined)) {
    return latest.phase;
  }

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const phase = history[index]?.phase;
    if (phase === 'completed' || phase === 'failed') {
      return phase;
    }
  }
  return latest.phase;
}

export function LiveRunStatus({ receipt, events }: LiveRunStatusProps) {
  if (receipt === null) {
    return null;
  }

  const history = correlatedEvents(events, receipt);
  const latest = history.at(-1) ?? null;

  // A distinct, ordered breadcrumb of every phase this block actually
  // *displayed*, in order: `deriveRunPhase` is re-evaluated over each prefix
  // of the correlated history, and a step is recorded only where that
  // answer changed. Two properties follow, both of which the previous
  // per-event breadcrumb lacked:
  //
  // - It cannot disagree with the badge. The badge is literally the last
  //   entry (`phaseSequence.at(-1)` below), so "Queued -> In progress ->
  //   Completed" always ends in the state the badge is showing.
  // - It says something. Fed raw event phases, a streamed run now reads
  //   "In progress -> Completed -> In progress -> Completed -> ..." forever,
  //   which describes the sub-steps' bookkeeping rather than the run and
  //   conveys nothing beyond "it alternated a lot." Fed run phases, the
  //   same run reads "Queued -> In progress -> Completed" -- the lifecycle a
  //   person is actually watching for.
  //
  // Derived from the sorted history rather than from arrival order, so a
  // replayed backlog, a duplicate delivery, or an out-of-order SSE frame all
  // produce the same breadcrumb -- it is a function of the event set, not of
  // how it happened to arrive.
  const phaseSequence: PublicActivityPhase[] = [];
  for (let index = 0; index < history.length; index += 1) {
    const step = deriveRunPhase(history.slice(0, index + 1));
    if (phaseSequence.at(-1) !== step) {
      phaseSequence.push(step);
    }
  }
  if (phaseSequence.length === 0) {
    phaseSequence.push(deriveRunPhase(history));
  }

  const phase: PublicActivityPhase = phaseSequence[phaseSequence.length - 1] ?? 'queued';
  const tone = STATUS_TONE_META[PHASE_TONE[phase]];

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
        Latest command
      </h3>

      <Badge
        // Remounts (replaying `.status-change-enter`) on every real phase
        // transition (queued -> active -> completed/failed) -- a live run
        // progressing should read as a felt moment, not a silent label
        // swap. Now that `phase` is the run's phase, those remounts are the
        // handful of genuine lifecycle transitions rather than one animation
        // per streamed sub-step.
        key={phase}
        data-testid="live-run-status-phase"
        className="status-change-enter label-caps gap-[var(--space-1)] rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
        style={{ color: tone.ink, backgroundColor: tone.bg }}
      >
        <span aria-hidden="true">{tone.icon}</span>
        {PHASE_LABEL[phase]}
      </Badge>

      {/*
        The one genuinely per-event part of this block, and deliberately
        left that way. The badge above answers "where is this run," which
        the newest event cannot answer; this line answers "what just
        happened," which is exactly what the newest event is for. It is also
        the only thing here that moves while a run streams, so it is what
        makes the block read as live rather than as a static label.
      */}
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
