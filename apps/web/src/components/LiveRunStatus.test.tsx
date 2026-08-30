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

  it('bounds a long-running breadcrumb history to a small fixed number of entries, always ending in the current phase, with a truncation indicator', () => {
    // Regression test: a real home-energy-guardian Swarm run alternates
    // active/completed across ~35 sub-steps (each tool call, skill
    // activation, or handoff is its own active->completed pair). Since the
    // breadcrumb only deduped *immediate consecutive* repeats, alternating
    // phases defeated that entirely -- a live investigation counted 42
    // rendered <li> entries for a single run, pushing the rest of the
    // workspace down by a large, growing amount while conveying no real
    // information beyond "it alternated a lot."
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

    // Bounded to a small, fixed number of entries regardless of how many
    // distinct phase transitions the real run actually reached (41 here).
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
