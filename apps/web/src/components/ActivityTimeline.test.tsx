import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { PublicActivityEvent } from '@sift/contracts';
import { ActivityTimeline } from './ActivityTimeline.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

function buildEvent(overrides: Partial<PublicActivityEvent> = {}): PublicActivityEvent {
  return {
    schemaVersion: '1.0',
    eventId: 'event-1',
    sequence: 1,
    timestamp: '2026-08-27T12:00:00.000Z',
    caseId: 'case-1',
    type: 'tool.started',
    phase: 'active',
    summary: 'Looking up dealer inventory.',
    ...overrides,
  };
}

describe('ActivityTimeline', () => {
  it('renders the initial/empty state when no case is open (events is null)', () => {
    render(<ActivityTimeline events={null} />);
    expect(screen.getByTestId('activity-timeline-empty')).toHaveTextContent(/no case is open yet/i);
  });

  it('renders a loading state before any activity has arrived', () => {
    render(<ActivityTimeline events={null} loading />);
    expect(screen.getByTestId('activity-timeline-loading')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders a distinct message for an open case with zero activity yet', () => {
    render(<ActivityTimeline events={[]} />);
    expect(screen.getByTestId('activity-timeline-no-items')).toHaveTextContent(
      /nothing has happened in this case yet/i,
    );
  });

  it('renders events in chronological (sequence) order regardless of input order', () => {
    render(
      <ActivityTimeline
        events={[
          buildEvent({ eventId: 'event-2', sequence: 2, summary: 'second' }),
          buildEvent({ eventId: 'event-1', sequence: 1, summary: 'first' }),
        ]}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('first');
    expect(items[1]).toHaveTextContent('second');
  });

  it('never renders the raw internal type string, only the safe mapped label', () => {
    render(<ActivityTimeline events={[buildEvent({ type: 'evidence.conflicted' })]} />);

    const item = screen.getByTestId('activity-item-event-1');
    // Label text refined per `docs/decisions/
    // 0004-consumer-workspace-information-architecture.md` decision item 3
    // and Task A6 (activity-labels.ts extended toward the literal
    // change-set §48 example pairing -- "Research disagrees" <->
    // `evidence.conflicted`) -- still a safe, non-raw label, just no longer
    // using "Evidence"/"Conflicting" verbatim.
    expect(item).toHaveTextContent('Research disagrees');
    expect(item).not.toHaveTextContent('evidence.conflicted');
  });

  it('renders the exact required "Draft withheld" label for a draft.withheld event', () => {
    render(<ActivityTimeline events={[buildEvent({ type: 'draft.withheld' })]} />);
    expect(screen.getByTestId('activity-item-event-1')).toHaveTextContent('Draft withheld');
  });

  it('keys the correlation data-testid by debugEventId when present, falling back to eventId', () => {
    render(
      <ActivityTimeline
        events={[
          buildEvent({ eventId: 'event-1', debugEventId: 'debug-42' }),
          buildEvent({ eventId: 'event-2', sequence: 2, debugEventId: undefined }),
        ]}
      />,
    );

    const withDebugId = screen.getByTestId('activity-item-debug-42');
    expect(withDebugId).toHaveAttribute('data-event-id', 'event-1');
    expect(withDebugId).toHaveAttribute('data-debug-event-id', 'debug-42');

    const withoutDebugId = screen.getByTestId('activity-item-event-2');
    expect(withoutDebugId).toHaveAttribute('data-debug-event-id', '');
  });

  it('falls back to the raw timestamp string if it cannot be parsed as a date', () => {
    render(<ActivityTimeline events={[buildEvent({ timestamp: 'not-a-real-timestamp' })]} />);
    expect(screen.getByText('not-a-real-timestamp')).toBeInTheDocument();
  });

  it('renders phase and timestamp for each item', () => {
    render(<ActivityTimeline events={[buildEvent({ phase: 'waiting' })]} />);
    const item = screen.getByTestId('activity-item-event-1');
    expect(within(item).getByTestId('activity-item-phase')).toHaveTextContent(
      'Waiting for confirmation',
    );
  });

  it('renders safeDetails as key/value pairs without needing Inspector access', () => {
    render(
      <ActivityTimeline
        events={[
          buildEvent({
            safeDetails: { toolId: 'dealer-lookup', durationMs: 420 },
          }),
        ]}
      />,
    );

    const details = screen.getByTestId('activity-item-details');
    expect(details).toHaveTextContent('toolId:');
    expect(details).toHaveTextContent('dealer-lookup');
    expect(details).toHaveTextContent('durationMs:');
    expect(details).toHaveTextContent('420');
  });

  it('formats null and object/array safeDetails values without crashing', () => {
    render(
      <ActivityTimeline
        events={[
          buildEvent({
            safeDetails: { missing: null, tags: ['fee', 'confirmed'], meta: { retries: 1 } },
          }),
        ]}
      />,
    );

    const details = screen.getByTestId('activity-item-details');
    expect(details).toHaveTextContent('missing:');
    expect(details).toHaveTextContent('null');
    expect(details).toHaveTextContent('tags:');
    expect(details).toHaveTextContent('["fee","confirmed"]');
    expect(details).toHaveTextContent('meta:');
  });

  it('does not render a details block when safeDetails is absent', () => {
    render(<ActivityTimeline events={[buildEvent({ safeDetails: undefined })]} />);
    expect(screen.queryByTestId('activity-item-details')).not.toBeInTheDocument();
  });

  it('does not render an "Inspect run" button when onInspectRun is not provided', () => {
    render(<ActivityTimeline events={[buildEvent({ runId: 'run-1' })]} />);
    expect(screen.queryByTestId('activity-item-inspect-run-event-1')).not.toBeInTheDocument();
  });

  it('does not render an "Inspect run" button for an event with no runId, even when onInspectRun is provided', () => {
    render(
      <ActivityTimeline
        events={[buildEvent({ runId: undefined })]}
        onInspectRun={() => undefined}
      />,
    );
    expect(screen.queryByTestId('activity-item-inspect-run-event-1')).not.toBeInTheDocument();
  });

  it('renders an "Inspect run" button for a correlated event and calls back with its runId', async () => {
    const onInspectRun = vi.fn();
    const user = userEvent.setup();
    render(
      <ActivityTimeline events={[buildEvent({ runId: 'run-42' })]} onInspectRun={onInspectRun} />,
    );

    const button = screen.getByTestId('activity-item-inspect-run-event-1');
    await user.click(button);

    expect(onInspectRun).toHaveBeenCalledWith('run-42');
  });

  // Task I2b: the exact-event-level half of "a consumer event opens its
  // exact runtime event" -- distinct from "Inspect run" above, which only
  // jumps to the run's Overview, not a specific correlated event.
  it('does not render an "Inspect event" button when onInspectEvent is not provided', () => {
    render(
      <ActivityTimeline events={[buildEvent({ runId: 'run-1', debugEventId: 'debug-1' })]} />,
    );
    expect(screen.queryByTestId('activity-item-inspect-event-event-1')).not.toBeInTheDocument();
  });

  it('does not render an "Inspect event" button for an event with no debugEventId, even when onInspectEvent is provided (global constraint 4: never render what cannot be true)', () => {
    render(
      <ActivityTimeline
        events={[buildEvent({ runId: 'run-1', debugEventId: undefined })]}
        onInspectEvent={() => undefined}
      />,
    );
    expect(screen.queryByTestId('activity-item-inspect-event-event-1')).not.toBeInTheDocument();
  });

  it('does not render an "Inspect event" button for an event with a debugEventId but no runId, even when onInspectEvent is provided', () => {
    render(
      <ActivityTimeline
        events={[buildEvent({ runId: undefined, debugEventId: 'debug-1' })]}
        onInspectEvent={() => undefined}
      />,
    );
    expect(screen.queryByTestId('activity-item-inspect-event-event-1')).not.toBeInTheDocument();
  });

  it('renders an "Inspect event" button for a fully correlated event and calls back with its runId and debugEventId', async () => {
    const onInspectEvent = vi.fn();
    const user = userEvent.setup();
    render(
      <ActivityTimeline
        events={[buildEvent({ runId: 'run-42', debugEventId: 'debug-99' })]}
        onInspectEvent={onInspectEvent}
      />,
    );

    const button = screen.getByTestId('activity-item-inspect-event-event-1');
    expect(button).toHaveAccessibleName();
    await user.click(button);

    expect(onInspectEvent).toHaveBeenCalledWith('run-42', 'debug-99');
  });

  it('renders a recoverable error while preserving the last valid events underneath', () => {
    render(
      <ActivityTimeline
        events={[buildEvent()]}
        error="Lost connection. Showing the last known activity."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/lost connection/i);
    expect(screen.getByTestId('activity-item-event-1')).toBeInTheDocument();
  });

  it('has no axe violations across empty, loading, populated, and error states', async () => {
    const { container: empty } = render(<ActivityTimeline events={null} />);
    expect(await axe(empty)).toHaveNoViolations();

    const { container: loading } = render(<ActivityTimeline events={null} loading />);
    expect(await axe(loading)).toHaveNoViolations();

    const { container: populated } = render(<ActivityTimeline events={[buildEvent()]} />);
    expect(await axe(populated)).toHaveNoViolations();

    const { container: withInspectButtons } = render(
      <ActivityTimeline
        events={[buildEvent({ runId: 'run-1', debugEventId: 'debug-1' })]}
        onInspectRun={() => undefined}
        onInspectEvent={() => undefined}
      />,
    );
    expect(await axe(withInspectButtons)).toHaveNoViolations();

    const { container: errored } = render(
      <ActivityTimeline events={[buildEvent()]} error="Lost connection." />,
    );
    expect(await axe(errored)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <ActivityTimeline events={[buildEvent({ safeDetails: { toolId: 'dealer-lookup' } })]} />,
    );
    expect(overflowRisks).toEqual([]);
  });
});
