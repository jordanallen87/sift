import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { PublicActivityEvent } from '@sift/contracts';
import { LiveRunStatus } from './LiveRunStatus.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildEvent(overrides: Partial<PublicActivityEvent> = {}): PublicActivityEvent {
  return {
    schemaVersion: '1.0',
    eventId: 'evt-1',
    sequence: 1,
    timestamp: '2026-08-27T00:00:00.000Z',
    caseId: 'case-1',
    runId: 'run-1',
    type: 'run.queued',
    phase: 'queued',
    summary: 'Investigation queued.',
    ...overrides,
  };
}

describe('LiveRunStatus', () => {
  // ADR 0004 decision item 2 / audit §2: an empty conceptual region must be
  // ABSENT, not a card announcing its own emptiness. This component used to
  // render a full "Latest command / No command has been sent yet." card;
  // it now renders nothing at all until a real command has actually been
  // sent.
  it('renders nothing before any command has been sent', () => {
    const { container } = render(<LiveRunStatus receipt={null} events={[]} />);
    expect(screen.queryByTestId('live-run-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-run-status-empty')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "queued" immediately from a real receipt before any event has streamed in', () => {
    render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={[]} />);
    expect(screen.getByTestId('live-run-status-phase')).toHaveTextContent(/queued/i);
  });

  // Task A9: this block reports the status of the last COMMAND, not
  // specifically an investigation -- a genuinely real (non-seed) commandId-
  // only receipt can reach this component for a command that was never an
  // investigation run at all (e.g. a real, distinct manual action taken
  // before any investigation), and "Investigation status" would misdescribe
  // that just as it did the fixture-seed case ADR 0004 caught live. The
  // heading must say what this block actually is: a command status report.
  it('labels the heading as command status, never "investigation status"', () => {
    render(<LiveRunStatus receipt={{ commandId: 'cmd-1' }} events={[]} />);
    const heading = screen.getByTestId('live-run-status').querySelector('h3');
    expect(heading).toHaveTextContent(/command/i);
    expect(heading).not.toHaveTextContent(/investigation/i);
  });

  // ADR 0004 decision item 3: `commandId`/`runId` move to the
  // developer/inspect projection and are never rendered as raw text on the
  // consumer surface anymore (change-set §4's terminology table:
  // "commandId/runId -> Developer view only").
  it('never renders the raw commandId or runId as visible text', () => {
    render(
      <LiveRunStatus receipt={{ commandId: 'cmd-secret-1', runId: 'run-secret-1' }} events={[]} />,
    );
    expect(screen.queryByTestId('live-run-status-command-id')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-run-status-run-id')).not.toBeInTheDocument();
    expect(screen.queryByText('cmd-secret-1')).not.toBeInTheDocument();
    expect(screen.queryByText('run-secret-1')).not.toBeInTheDocument();
  });

  it('reflects the latest phase from a real event correlated by runId', () => {
    const events = [
      buildEvent({ eventId: 'e1', sequence: 1, type: 'run.queued', phase: 'queued' }),
      buildEvent({
        eventId: 'e2',
        sequence: 2,
        type: 'specialist.started',
        phase: 'active',
        summary: 'Deal analyst started working.',
      }),
    ];
    render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={events} />);

    expect(screen.getByTestId('live-run-status-phase')).toHaveTextContent(/in progress/i);
    expect(screen.getByTestId('live-run-status-summary')).toHaveTextContent(
      'Deal analyst started working.',
    );
  });

  it('ignores events correlated to a different run or command', () => {
    const events = [
      buildEvent({
        eventId: 'other',
        sequence: 5,
        runId: 'run-other',
        phase: 'completed',
        summary: 'Unrelated run finished.',
      }),
    ];
    render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={events} />);
    expect(screen.getByTestId('live-run-status-phase')).toHaveTextContent(/queued/i);
  });

  it('renders a breadcrumb history of every distinct phase reached, in order, from real events only', () => {
    const events = [
      buildEvent({ eventId: 'e1', sequence: 1, type: 'run.queued', phase: 'queued' }),
      buildEvent({ eventId: 'e2', sequence: 2, type: 'run.started', phase: 'active' }),
      buildEvent({ eventId: 'e3', sequence: 3, type: 'run.completed', phase: 'completed' }),
    ];
    render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={events} />);

    const history = screen.getByTestId('live-run-status-history');
    expect(history).toHaveTextContent('Queued');
    expect(history).toHaveTextContent('In progress');
    expect(history).toHaveTextContent('Completed');
  });

  it('deduplicates consecutive correlated events that share the same phase in the breadcrumb history', () => {
    const events = [
      buildEvent({
        eventId: 'e1',
        sequence: 1,
        type: 'run.started',
        phase: 'active',
        summary: 'First specialist started.',
      }),
      buildEvent({
        eventId: 'e2',
        sequence: 2,
        type: 'specialist.started',
        phase: 'active',
        summary: 'Second specialist started.',
      }),
      buildEvent({
        eventId: 'e3',
        sequence: 3,
        type: 'run.completed',
        phase: 'completed',
        summary: 'Done.',
      }),
    ];
    render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={events} />);

    const history = screen.getByTestId('live-run-status-history');
    // Two consecutive real events both reporting the "active" phase collapse
    // into a single breadcrumb step, not two -- the breadcrumb tracks
    // distinct phases reached, not a raw one-per-event tally.
    expect(within(history).getAllByText('In progress')).toHaveLength(1);
    expect(within(history).getAllByText('Completed')).toHaveLength(1);
  });

  // DELIBERATE UPDATE (see this task's report). This test previously fed the
  // same 40 alternating sub-step events below and asserted that the
  // breadcrumb TRUNCATED -- because the breadcrumb was built from raw event
  // phases, so a run whose sub-steps alternate active/completed produced ~41
  // distinct steps and a truncation indicator. That was never the run's
  // lifecycle; it was the sub-steps' bookkeeping rendered as if it were.
  // Building each step from the run's own phase removes the cause rather
  // than capping the symptom, so the truncation assertion moved to the test
  // below it, which exercises a run whose *own* lifecycle genuinely has more
  // steps than the cap. The bound and the indicator are both still covered.
  it('collapses a long alternating sub-step run to the run lifecycle itself, with nothing to truncate', () => {
    // A real home-energy-guardian Swarm run alternates active/completed
    // across ~35 sub-steps (each tool call, skill activation, or handoff is
    // its own active->completed pair). None of those `completed`s ends the
    // run, so none of them belongs in a report of where the run is.
    const events: PublicActivityEvent[] = [];
    for (let i = 0; i < 40; i += 1) {
      events.push(
        buildEvent({
          eventId: `e${i}`,
          sequence: i + 1,
          type: i % 2 === 0 ? 'specialist.started' : 'specialist.completed',
          phase: i % 2 === 0 ? 'active' : 'completed',
          summary: `Step ${i}`,
        }),
      );
    }
    // The real, final phase this run reached -- the breadcrumb must never
    // drop this, no matter how it bounds everything before it.
    events.push(
      buildEvent({
        eventId: 'e-final',
        sequence: 41,
        type: 'run.completed',
        phase: 'completed',
        summary: 'Investigation completed.',
      }),
    );

    render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={events} />);

    const history = screen.getByTestId('live-run-status-history');
    const items = within(history).getAllByRole('listitem');

    // Exactly the run's own lifecycle: it started working, then it finished.
    expect(items.map((item) => item.textContent?.replace(/^→\s*/, ''))).toEqual([
      'In progress',
      'Completed',
    ]);
    // Nothing was dropped, so the breadcrumb must not claim it was.
    expect(screen.queryByTestId('live-run-status-history-truncated')).not.toBeInTheDocument();
  });

  it('bounds a long run lifecycle to a small fixed number of entries, always ending in the current phase, with a truncation indicator', () => {
    // The run's own lifecycle is short but not fixed-length: every
    // confirmation gate it opens and closes is a real active -> waiting ->
    // active pair, so a run that pauses for the human several times still
    // grows without a ceiling. This is the case the cap exists for now.
    const events: PublicActivityEvent[] = [
      buildEvent({ eventId: 'e0', sequence: 1, type: 'run.queued', phase: 'queued' }),
      buildEvent({ eventId: 'e1', sequence: 2, type: 'run.started', phase: 'active' }),
    ];
    for (let gate = 0; gate < 4; gate += 1) {
      events.push(
        buildEvent({
          eventId: `gate-${gate}`,
          sequence: events.length + 1,
          type: 'intervention.confirmation_required',
          phase: 'waiting',
          summary: `Confirm consequential tool call ${gate}.`,
        }),
        buildEvent({
          eventId: `resume-${gate}`,
          sequence: events.length + 2,
          type: 'tool.completed',
          phase: 'completed',
          summary: `Consequential tool call ${gate} completed.`,
        }),
        buildEvent({
          eventId: `work-${gate}`,
          sequence: events.length + 3,
          type: 'specialist.started',
          phase: 'active',
          summary: `Specialist resumed after gate ${gate}.`,
        }),
      );
    }
    events.push(
      buildEvent({
        eventId: 'e-final',
        sequence: events.length + 1,
        type: 'run.completed',
        phase: 'completed',
        summary: 'Investigation completed.',
      }),
    );

    render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={events} />);

    const history = screen.getByTestId('live-run-status-history');
    const items = within(history).getAllByRole('listitem');

    // Bounded to a small, fixed number of entries regardless of how many
    // distinct run-level transitions the run actually reached (10 here).
    expect(items.length).toBeLessThan(10);
    // The most recent/current phase is always the last visible entry --
    // the breadcrumb never drops the current state to make room for older
    // history.
    expect(items.at(-1)).toHaveTextContent('Completed');
    // A truncation was actually performed, so the breadcrumb says so rather
    // than silently pretending this run only had a handful of steps.
    expect(screen.getByTestId('live-run-status-history-truncated')).toBeInTheDocument();
  });

  it('does not show a truncation indicator when the breadcrumb history is already short', () => {
    const events = [
      buildEvent({ eventId: 'e1', sequence: 1, type: 'run.queued', phase: 'queued' }),
      buildEvent({ eventId: 'e2', sequence: 2, type: 'run.started', phase: 'active' }),
      buildEvent({ eventId: 'e3', sequence: 3, type: 'run.completed', phase: 'completed' }),
    ];
    render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={events} />);

    const history = screen.getByTestId('live-run-status-history');
    const items = within(history).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.at(-1)).toHaveTextContent('Completed');
    expect(screen.queryByTestId('live-run-status-history-truncated')).not.toBeInTheDocument();
  });

  it('renders a failed run with an error tone', () => {
    const events = [
      buildEvent({
        eventId: 'e1',
        sequence: 1,
        type: 'run.failed',
        phase: 'failed',
        summary: 'Tool timed out.',
      }),
    ];
    render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={events} />);
    expect(screen.getByTestId('live-run-status-phase')).toHaveTextContent(/failed/i);
  });

  it('correlates by commandId when the receipt has no runId yet', () => {
    const events = [
      buildEvent({
        eventId: 'e1',
        sequence: 1,
        commandId: 'cmd-1',
        runId: undefined,
        type: 'command.accepted',
        phase: 'queued',
        summary: 'Command accepted.',
      }),
    ];
    render(<LiveRunStatus receipt={{ commandId: 'cmd-1' }} events={events} />);
    expect(screen.getByTestId('live-run-status-summary')).toHaveTextContent('Command accepted.');
  });

  // --- The badge reports the RUN's phase, not the newest event's phase ---
  //
  // Until the runtime started streaming, `car-purchase-graph.ts` and
  // `home-energy-swarm.ts` buffered every event and drained them in one
  // ~70 ms burst after the graph had already finished, so a badge derived
  // from `history.at(-1).phase` alternated inside a single frame and settled
  // on the right answer by luck of ordering. Events now arrive as the graph
  // runs, and roughly half of them (`tool.completed`, `skill.activated`,
  // `specialist.completed`) carry `phase: 'completed'` mid-run.
  //
  // Every test in this block asserts at EVERY PREFIX of the stream, not just
  // at the end. An end-state-only assertion passes on the old per-event
  // derivation (whose last event is also `run.completed`) and proves
  // nothing about what a person watching the pane actually sees.
  describe('run-level phase derivation', () => {
    /** The badge text for the first `length` events of `events`, rendered and torn down in isolation so prefixes cannot leak into each other. */
    function badgeAtPrefix(events: PublicActivityEvent[], length: number): string {
      const { unmount } = render(
        <LiveRunStatus
          receipt={{ commandId: 'cmd-1', runId: 'run-1' }}
          events={events.slice(0, length)}
        />,
      );
      const text = screen.getByTestId('live-run-status-phase').textContent ?? '';
      unmount();
      return text;
    }

    /** A realistic ordered run: queued, started, then interleaved sub-steps that alternate `active` and `completed`, then the run's own terminal event. */
    function buildStreamedRun(terminal: PublicActivityEvent): PublicActivityEvent[] {
      const events: PublicActivityEvent[] = [
        buildEvent({ eventId: 'e1', sequence: 1, type: 'run.queued', phase: 'queued' }),
        buildEvent({
          eventId: 'e2',
          sequence: 2,
          type: 'run.started',
          phase: 'active',
          summary: 'Investigation started (initial pass).',
        }),
      ];
      const subSteps: Pick<PublicActivityEvent, 'type' | 'phase' | 'summary'>[] = [
        { type: 'specialist.started', phase: 'active', summary: 'Deal analyst started working.' },
        { type: 'skill.activated', phase: 'completed', summary: 'Activated skill "price-check".' },
        { type: 'tool.started', phase: 'active', summary: 'Checking listing history.' },
        { type: 'tool.completed', phase: 'completed', summary: 'Listing history checked.' },
        { type: 'specialist.started', phase: 'active', summary: 'Safety analyst started working.' },
        { type: 'specialist.completed', phase: 'completed', summary: 'Safety analyst finished.' },
        { type: 'tool.started', phase: 'active', summary: 'Checking recall notices.' },
        { type: 'tool.completed', phase: 'completed', summary: 'Recall notices checked.' },
      ];
      for (const [index, step] of subSteps.entries()) {
        events.push(buildEvent({ eventId: `s${index}`, sequence: index + 3, ...step }));
      }
      events.push({ ...terminal, sequence: events.length + 1 });
      return events;
    }

    it('never reads "Completed" at any prefix before the run\'s own terminal event', () => {
      const events = buildStreamedRun(
        buildEvent({
          eventId: 'e-final',
          type: 'run.completed',
          phase: 'completed',
          summary: 'Investigation completed (initial pass).',
        }),
      );

      for (let length = 1; length < events.length; length += 1) {
        const badge = badgeAtPrefix(events, length);
        expect(
          badge,
          `badge read "${badge}" after ${length} of ${events.length} events, before the run ended`,
        ).not.toMatch(/completed/i);
        // ...and it is not merely blank: it reports a real, honest
        // non-terminal state the whole way through.
        expect(badge).toMatch(/queued|in progress/i);
      }

      // Only the run's own terminal event settles it.
      expect(badgeAtPrefix(events, events.length)).toMatch(/completed/i);
    });

    it('reads "Queued" until real work starts, then stays "In progress" across every completed sub-step', () => {
      const events = buildStreamedRun(
        buildEvent({
          eventId: 'e-final',
          type: 'run.completed',
          phase: 'completed',
          summary: 'Investigation completed (initial pass).',
        }),
      );

      // Only `run.queued` has landed: the run has not claimed to be working
      // yet, because it is not.
      expect(badgeAtPrefix(events, 1)).toMatch(/queued/i);
      // Every prefix from `run.started` up to (not including) the terminal
      // event reports in-progress, including the ones ending on a
      // `completed` sub-step.
      for (let length = 2; length < events.length; length += 1) {
        expect(badgeAtPrefix(events, length), `prefix of ${length} events`).toMatch(/in progress/i);
      }
    });

    it('keeps the per-event summary moving while the badge holds the run phase', () => {
      const events = buildStreamedRun(
        buildEvent({
          eventId: 'e-final',
          type: 'run.completed',
          phase: 'completed',
          summary: 'Investigation completed (initial pass).',
        }),
      );
      // A prefix whose newest event is a `completed` sub-step: the exact
      // shape that used to flip the badge to "Completed" mid-run.
      const prefix = events.slice(0, 6);
      expect(prefix.at(-1)?.phase).toBe('completed');

      render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={prefix} />);

      expect(screen.getByTestId('live-run-status-phase')).toHaveTextContent(/in progress/i);
      // The summary is the one genuinely per-event part of this block and
      // must keep tracking the newest event.
      expect(screen.getByTestId('live-run-status-summary')).toHaveTextContent(
        'Listing history checked.',
      );
    });

    it('surfaces an unanswered confirmation gate, and returns to "In progress" once the run moves past it', () => {
      // `waiting` outranks in-progress while the run is active: it is the
      // one phase that is a claim on the human, and it cannot flicker the
      // way `completed` does, because the next correlated event for the run
      // IS the gate being answered.
      const events: PublicActivityEvent[] = [
        buildEvent({ eventId: 'e1', sequence: 1, type: 'run.queued', phase: 'queued' }),
        buildEvent({ eventId: 'e2', sequence: 2, type: 'run.started', phase: 'active' }),
        buildEvent({
          eventId: 'e3',
          sequence: 3,
          type: 'tool.started',
          phase: 'active',
          summary: 'Proposing a recommendation.',
        }),
        buildEvent({
          eventId: 'e4',
          sequence: 4,
          type: 'intervention.confirmation_required',
          phase: 'waiting',
          summary: 'Tool "propose_recommendation" requires human confirmation.',
        }),
        buildEvent({
          eventId: 'e5',
          sequence: 5,
          type: 'tool.completed',
          phase: 'completed',
          summary: 'Recommendation proposed.',
        }),
        buildEvent({
          eventId: 'e6',
          sequence: 6,
          type: 'run.completed',
          phase: 'completed',
          summary: 'Investigation completed.',
        }),
      ];

      expect(badgeAtPrefix(events, 3)).toMatch(/in progress/i);
      // The gate is open and unanswered -- the newest thing that happened.
      expect(badgeAtPrefix(events, 4)).toMatch(/waiting for confirmation/i);
      // Answered: the run moved on, so the badge must not keep asking.
      expect(badgeAtPrefix(events, 5)).toMatch(/in progress/i);
      expect(badgeAtPrefix(events, 6)).toMatch(/completed/i);

      // The breadcrumb records the gate as the real lifecycle step it was.
      // Five distinct run phases exceeds `MAX_VISIBLE_PHASE_STEPS`, so the
      // oldest ("Queued") is dropped behind the truncation indicator rather
      // than silently disappearing.
      render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={events} />);
      const history = screen.getByTestId('live-run-status-history');
      expect(
        within(history)
          .getAllByRole('listitem')
          .map((item) => item.textContent?.replace(/^→\s*/, '')),
      ).toEqual([
        '…Earlier steps omitted',
        'In progress',
        'Waiting for confirmation',
        'In progress',
        'Completed',
      ]);
      expect(screen.getByTestId('live-run-status-history-truncated')).toBeInTheDocument();
    });

    it('settles on "Failed" only at a terminal run event, never at a recovered mid-run tool failure', () => {
      const events = buildStreamedRun(
        buildEvent({
          eventId: 'e-final',
          type: 'run.failed',
          phase: 'failed',
          summary: 'Investigation failed: the model provider timed out.',
        }),
      );
      // Splice a real mid-run tool failure that `RetrySteering` recovers
      // from, immediately before the terminal event. A run that survives a
      // failed tool call is not a failed run.
      events.splice(
        events.length - 1,
        0,
        buildEvent({
          eventId: 'e-tool-failed',
          sequence: events.length,
          type: 'tool.failed',
          phase: 'failed',
          summary: 'Recall lookup failed; retrying.',
        }),
      );
      events[events.length - 1] = { ...events[events.length - 1]!, sequence: events.length };

      for (let length = 1; length < events.length; length += 1) {
        const badge = badgeAtPrefix(events, length);
        expect(badge, `prefix of ${length} events`).not.toMatch(/failed/i);
        expect(badge).not.toMatch(/completed/i);
      }
      expect(badgeAtPrefix(events, events.length)).toMatch(/failed/i);
    });

    it('reports a run that failed straight out of the queue, with no run.started in between', () => {
      const events = [
        buildEvent({ eventId: 'e1', sequence: 1, type: 'run.queued', phase: 'queued' }),
        buildEvent({
          eventId: 'e2',
          sequence: 2,
          type: 'run.failed',
          phase: 'failed',
          summary: 'Investigation refused: the pinned pack is not registered.',
        }),
      ];
      expect(badgeAtPrefix(events, 1)).toMatch(/queued/i);
      expect(badgeAtPrefix(events, 2)).toMatch(/failed/i);
    });

    it('does not let a post-terminal straggler carrying the same runId reopen a finished run', () => {
      // Duplicate delivery / replayed backlog: `deriveActiveRunId` is
      // order-independent, and the outcome is read from the newest TERMINAL
      // event rather than the newest event, so neither can drag a finished
      // run back to "In progress".
      const events = [
        buildEvent({ eventId: 'e1', sequence: 1, type: 'run.queued', phase: 'queued' }),
        buildEvent({ eventId: 'e2', sequence: 2, type: 'run.started', phase: 'active' }),
        buildEvent({
          eventId: 'e3',
          sequence: 3,
          type: 'run.completed',
          phase: 'completed',
          summary: 'Investigation completed.',
        }),
        buildEvent({
          eventId: 'e4',
          sequence: 4,
          type: 'specialist.started',
          phase: 'active',
          summary: 'A duplicate late delivery.',
        }),
      ];
      render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={events} />);
      expect(screen.getByTestId('live-run-status-phase')).toHaveTextContent(/completed/i);
    });
  });

  it('has no axe violations in the empty and populated states', async () => {
    const { container: empty } = render(<LiveRunStatus receipt={null} events={[]} />);
    expect(await axe(empty)).toHaveNoViolations();

    const { container: populated } = render(
      <LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={[buildEvent()]} />,
    );
    expect(await axe(populated)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={[buildEvent()]} />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
