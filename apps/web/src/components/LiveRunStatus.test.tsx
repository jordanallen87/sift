import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { PublicActivityEvent } from '@pax/contracts';
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
  it('renders the empty state when no command has been sent yet', () => {
    render(<LiveRunStatus receipt={null} events={[]} />);
    expect(screen.getByTestId('live-run-status-empty')).toBeInTheDocument();
  });

  it('shows "queued" immediately from a real receipt before any event has streamed in', () => {
    render(<LiveRunStatus receipt={{ commandId: 'cmd-1', runId: 'run-1' }} events={[]} />);
    expect(screen.getByTestId('live-run-status-phase')).toHaveTextContent(/queued/i);
    expect(screen.getByTestId('live-run-status-run-id')).toHaveTextContent('run-1');
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
