/**
 * Behavioral tests for the investigation-team panel.
 *
 * Every fixture below is built from the REAL event shapes that reach this
 * component in production, not from a convenient invention:
 *
 *   - `car-purchase-graph.ts`'s `emitGraphNodeEvent` writes
 *     `Graph node "deal-analyst" started.` and `Graph node "deal-analyst"
 *     completed with status "COMPLETED".`, with `agentId` set to the node id
 *     and `category: 'graph'`.
 *   - `home-energy-swarm.ts`'s equivalent writes the same two sentences with
 *     "Swarm node" in place of "Graph node".
 *   - `car-purchase-engine.ts`'s `appendActivityForRuntimeEvent` is what
 *     turns both into `PublicActivityEvent`s: `graph.node_completed` with
 *     `phase: 'start'` becomes `specialist.started`/`phase: 'active'`, and
 *     the finish becomes `specialist.completed`/`phase: 'completed'`,
 *     carrying `runId`, `agentId` and `debugEventId` through unchanged.
 *   - The status words are Strands' real `ResultStatus` union
 *     (`@strands-agents/sdk`'s `multiagent/state`): `COMPLETED`, `FAILED`,
 *     `CANCELLED`, `INTERRUPTED`.
 *
 * That matters more than usual here: the panel derives a specialist's real
 * outcome from those exact strings, so a test using a made-up summary would
 * prove nothing about the product.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import type { PublicActivityEvent } from '@sift/contracts';
import { SpecialistActivityPanel } from './SpecialistActivityPanel.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const CASE_ID = 'case-car-1';
const RUN_ID = 'run-car-shortlist-1';

/** Base timestamp for fixtures. Deltas are expressed in ms from here so a duration assertion is a real, computed elapsed time. */
const T0 = Date.parse('2026-09-03T10:00:00.000Z');

function at(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

function buildEvent(overrides: Partial<PublicActivityEvent> & { sequence: number }) {
  const event: PublicActivityEvent = {
    schemaVersion: '1.0',
    eventId: `evt-${overrides.sequence}`,
    timestamp: at(0),
    caseId: CASE_ID,
    runId: RUN_ID,
    type: 'specialist.started',
    phase: 'active',
    summary: '',
    ...overrides,
  };
  return event;
}

/** The exact `PublicActivityEvent` a real Graph node start produces. */
function graphStarted(
  agentId: string,
  sequence: number,
  offsetMs = 0,
  extra: Partial<PublicActivityEvent> = {},
): PublicActivityEvent {
  return buildEvent({
    sequence,
    agentId,
    timestamp: at(offsetMs),
    type: 'specialist.started',
    phase: 'active',
    summary: `Graph node "${agentId}" started.`,
    debugEventId: `dbg-${sequence}`,
    ...extra,
  });
}

/** The exact `PublicActivityEvent` a real Graph node finish produces, carrying Strands' own `ResultStatus` word. */
function graphFinished(
  agentId: string,
  sequence: number,
  offsetMs = 0,
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED' = 'COMPLETED',
  extra: Partial<PublicActivityEvent> = {},
): PublicActivityEvent {
  return buildEvent({
    sequence,
    agentId,
    timestamp: at(offsetMs),
    type: 'specialist.completed',
    phase: 'completed',
    summary: `Graph node "${agentId}" completed with status "${status}".`,
    debugEventId: `dbg-${sequence}`,
    ...extra,
  });
}

function swarmStarted(agentId: string, sequence: number, offsetMs = 0): PublicActivityEvent {
  return buildEvent({
    sequence,
    agentId,
    timestamp: at(offsetMs),
    type: 'specialist.started',
    phase: 'active',
    summary: `Swarm node "${agentId}" started.`,
  });
}

function swarmFinished(agentId: string, sequence: number, offsetMs = 0): PublicActivityEvent {
  return buildEvent({
    sequence,
    agentId,
    timestamp: at(offsetMs),
    type: 'specialist.completed',
    phase: 'completed',
    summary: `Swarm node "${agentId}" completed with status "COMPLETED".`,
  });
}

/**
 * The real four-wide parallel branch of the car Graph: all four nodes start
 * before any of them finishes, which is how genuinely concurrent execution
 * reaches this component (`car-purchase-graph.ts` streams each hook's event
 * the moment it fires rather than draining the queue at the end).
 */
const PARALLEL_BRANCH_IDS = [
  'deal-analyst',
  'ownership-cost-analyst',
  'safety-reliability-analyst',
  'household-fit-analyst',
] as const;

function parallelBranchEvents(): PublicActivityEvent[] {
  const starts = PARALLEL_BRANCH_IDS.map((id, index) => graphStarted(id, index + 1, index));
  const finishes = PARALLEL_BRANCH_IDS.map((id, index) =>
    graphFinished(id, PARALLEL_BRANCH_IDS.length + index + 1, 100 + index * 10),
  );
  return [...starts, ...finishes];
}

/** The Home Energy Swarm's real shape: strictly sequential, one node finishing before the next starts. */
function sequentialSwarmEvents(): PublicActivityEvent[] {
  const ids = ['anomaly-investigator', 'rate-analyst', 'weather-analyst'] as const;
  return ids.flatMap((id, index) => [
    swarmStarted(id, index * 2 + 1, index * 100),
    swarmFinished(id, index * 2 + 2, index * 100 + 60),
  ]);
}

function rowFor(agentId: string): HTMLElement {
  const row = document.querySelector<HTMLElement>(`[data-specialist-id="${agentId}"]`);
  if (row === null) {
    throw new Error(`no rendered row for specialist "${agentId}"`);
  }
  return row;
}

function visibleSpecialistIds(): string[] {
  return screen
    .queryAllByTestId('specialist-row')
    .map((row) => row.getAttribute('data-specialist-id') ?? '');
}

describe('SpecialistActivityPanel', () => {
  // --- The core job: six specialists become six legible rows -------------

  it('renders one named row per specialist the run actually reported', () => {
    render(<SpecialistActivityPanel events={parallelBranchEvents()} />);

    expect(visibleSpecialistIds()).toEqual([...PARALLEL_BRANCH_IDS]);
    expect(within(rowFor('deal-analyst')).getByTestId('specialist-row-name')).toHaveTextContent(
      'Deal and price',
    );
    expect(
      within(rowFor('ownership-cost-analyst')).getByTestId('specialist-row-name'),
    ).toHaveTextContent('Cost to own');
    expect(
      within(rowFor('safety-reliability-analyst')).getByTestId('specialist-row-name'),
    ).toHaveTextContent('Safety and reliability');
    expect(
      within(rowFor('household-fit-analyst')).getByTestId('specialist-row-name'),
    ).toHaveTextContent('Household fit');
  });

  // Design rule 8. The summaries on these events are written for the Runtime
  // Inspector; putting them on the consumer surface is the exact defect this
  // component exists to fix, so it is asserted rather than assumed.
  it('never shows the developer phrasing or the raw specialist ids the events carry', () => {
    render(<SpecialistActivityPanel events={parallelBranchEvents()} />);

    expect(screen.queryByText(/Graph node/)).not.toBeInTheDocument();
    expect(screen.queryByText(/completed with status/i)).not.toBeInTheDocument();
    for (const id of PARALLEL_BRANCH_IDS) {
      expect(screen.queryByText(id)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(RUN_ID)).not.toBeInTheDocument();
    expect(screen.queryByText(CASE_ID)).not.toBeInTheDocument();
  });

  it('humanizes an unknown specialist id rather than rendering it raw', () => {
    render(
      <SpecialistActivityPanel
        events={[graphStarted('custom_tax-analyst', 1), graphFinished('custom_tax-analyst', 2)]}
      />,
    );

    expect(
      within(rowFor('custom_tax-analyst')).getByTestId('specialist-row-name'),
    ).toHaveTextContent('Custom tax analyst');
    expect(screen.queryByText('custom_tax-analyst')).not.toBeInTheDocument();
    // No role line is invented for a specialist this build does not know.
    expect(
      within(rowFor('custom_tax-analyst')).queryByTestId('specialist-row-detail'),
    ).not.toBeInTheDocument();
  });

  // --- Design rule 5: the state is a WORD, not only a colour ------------

  it('separates a running specialist from a completed one by word, not only by style', () => {
    render(
      <SpecialistActivityPanel
        events={[
          graphStarted('deal-analyst', 1, 0),
          graphStarted('ownership-cost-analyst', 2, 0),
          graphFinished('deal-analyst', 3, 120),
        ]}
      />,
    );

    const finished = within(rowFor('deal-analyst')).getByTestId('specialist-row-state');
    const running = within(rowFor('ownership-cost-analyst')).getByTestId('specialist-row-state');

    expect(finished).toHaveTextContent('Completed');
    expect(running).toHaveTextContent('Running');
    expect(finished.textContent).not.toBe(running.textContent);
    // The word must survive even with every colour stripped: a state that is
    // only a tone is unreadable to anyone who cannot see it.
    expect(rowFor('deal-analyst').textContent).toMatch(/Completed/);
    expect(rowFor('ownership-cost-analyst').textContent).toMatch(/Running/);
  });

  it('reports a failed node as Error, a cancelled one as Skipped, and a gated one as Denied', () => {
    render(
      <SpecialistActivityPanel
        events={[
          graphStarted('deal-analyst', 1),
          graphFinished('deal-analyst', 2, 50, 'FAILED'),
          graphStarted('ownership-cost-analyst', 3),
          graphFinished('ownership-cost-analyst', 4, 50, 'CANCELLED'),
          graphStarted('household-fit-analyst', 5),
          graphFinished('household-fit-analyst', 6, 50, 'INTERRUPTED'),
        ]}
      />,
    );

    expect(within(rowFor('deal-analyst')).getByTestId('specialist-row-state')).toHaveTextContent(
      'Error',
    );
    expect(rowFor('deal-analyst')).toHaveAttribute('data-state', 'error');
    expect(
      within(rowFor('ownership-cost-analyst')).getByTestId('specialist-row-state'),
    ).toHaveTextContent('Skipped');
    // Strands' INTERRUPTED means a hook gated the node -- refused, not
    // broken. The AI Elements vocabulary keeps those apart on purpose.
    expect(
      within(rowFor('household-fit-analyst')).getByTestId('specialist-row-state'),
    ).toHaveTextContent('Denied');
    expect(
      within(rowFor('household-fit-analyst')).getByTestId('specialist-row-state'),
    ).not.toHaveTextContent('Error');
  });

  it('shows an outstanding approval as Awaiting approval and drops it once the node finishes past it', () => {
    const awaiting = [
      graphStarted('decision-synthesizer', 1),
      buildEvent({
        sequence: 2,
        agentId: 'decision-synthesizer',
        type: 'intervention.confirmation_required',
        phase: 'waiting',
        summary: 'ConsequenceGuard: propose_recommendation requires human confirmation.',
      }),
    ];
    const { rerender } = render(<SpecialistActivityPanel events={awaiting} />);
    expect(
      within(rowFor('decision-synthesizer')).getByTestId('specialist-row-state'),
    ).toHaveTextContent('Awaiting approval');

    rerender(
      <SpecialistActivityPanel
        events={[...awaiting, graphFinished('decision-synthesizer', 3, 90)]}
      />,
    );
    expect(
      within(rowFor('decision-synthesizer')).getByTestId('specialist-row-state'),
    ).toHaveTextContent('Completed');
  });

  // --- Design rule 3: real durations, frozen, never fabricated -----------

  it('reports the real elapsed time of a finished specialist and freezes it', () => {
    const events = [graphStarted('deal-analyst', 1, 0), graphFinished('deal-analyst', 2, 320)];
    const { rerender } = render(<SpecialistActivityPanel events={events} />);
    expect(within(rowFor('deal-analyst')).getByTestId('specialist-row-duration')).toHaveTextContent(
      '320ms',
    );

    // Later, unrelated activity keeps streaming in. A finished row's age
    // freezes at how long the run took -- it must not creep upward.
    rerender(
      <SpecialistActivityPanel
        events={[
          ...events,
          graphStarted('source-challenger', 3, 400),
          graphFinished('source-challenger', 4, 900),
        ]}
      />,
    );
    expect(within(rowFor('deal-analyst')).getByTestId('specialist-row-duration')).toHaveTextContent(
      '320ms',
    );
  });

  it('prefers a real measured durationMs over the observed gap between events', () => {
    render(
      <SpecialistActivityPanel
        events={[
          graphStarted('deal-analyst', 1, 0),
          graphFinished('deal-analyst', 2, 5_000, 'COMPLETED', {
            safeDetails: { durationMs: 1_400 },
          }),
        ]}
      />,
    );

    const duration = within(rowFor('deal-analyst')).getByTestId('specialist-row-duration');
    expect(duration).toHaveTextContent('1.4s');
    expect(duration).not.toHaveTextContent('5.0s');
  });

  it('shows no duration at all when nothing measured one', () => {
    render(
      <SpecialistActivityPanel
        events={[
          // Still running: there is no end yet, and a live ticker on a
          // ~300ms run would be the loading affordance rule 2 forbids.
          graphStarted('deal-analyst', 1, 0),
          // Finished, but every event carries the identical timestamp -- a
          // deterministic fixture clock. An unmeasurable gap must read as
          // absent, never as a real "0ms".
          graphStarted('ownership-cost-analyst', 2, 0),
          graphFinished('ownership-cost-analyst', 3, 0),
        ]}
      />,
    );

    expect(
      within(rowFor('deal-analyst')).queryByTestId('specialist-row-duration'),
    ).not.toBeInTheDocument();
    expect(
      within(rowFor('ownership-cost-analyst')).queryByTestId('specialist-row-duration'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/0ms/)).not.toBeInTheDocument();
  });

  // --- Design rule 6: the parallelism line is gated ----------------------

  it('reports the real concurrent wave for the parallel Graph', () => {
    render(
      <SpecialistActivityPanel
        events={[
          ...PARALLEL_BRANCH_IDS.map((id, index) => graphStarted(id, index + 1, index)),
          // Only one has finished, so three are genuinely still working.
          graphFinished('deal-analyst', 5, 120),
        ]}
      />,
    );

    expect(screen.getByTestId('specialist-activity-parallelism')).toHaveTextContent(
      '4 working at once',
    );
  });

  it('states the concurrent wave in the past tense once nobody is still working', () => {
    render(<SpecialistActivityPanel events={parallelBranchEvents()} />);

    const line = screen.getByTestId('specialist-activity-parallelism');
    expect(line).toHaveTextContent('4 worked at once');
    expect(line).not.toHaveTextContent('working at once');
  });

  // The Home Energy Swarm is Sequential & Autonomous: its story is handoffs,
  // not fan-out, and claiming concurrency it never had would be a straight
  // falsehood about the runtime.
  it('never claims concurrency for the strictly sequential Swarm', () => {
    render(<SpecialistActivityPanel events={sequentialSwarmEvents()} />);

    expect(screen.getAllByTestId('specialist-row')).toHaveLength(3);
    expect(screen.queryByTestId('specialist-activity-parallelism')).not.toBeInTheDocument();
    expect(screen.queryByText(/at once/)).not.toBeInTheDocument();
  });

  // --- Design rule 4: collapse the routine, never the exceptional --------

  it('keeps every specialist of a full six-strong run visible by default', () => {
    const ids = [...PARALLEL_BRANCH_IDS, 'source-challenger', 'decision-synthesizer'];
    const events = ids.flatMap((id, index) => [
      graphStarted(id, index * 2 + 1, index * 10),
      graphFinished(id, index * 2 + 2, index * 10 + 60),
    ]);

    render(<SpecialistActivityPanel events={events} />);

    expect(screen.getAllByTestId('specialist-row')).toHaveLength(6);
    expect(screen.queryByTestId('specialist-activity-more')).not.toBeInTheDocument();
  });

  it('folds routine completions into +N more while a failed specialist keeps its own row', async () => {
    const user = userEvent.setup();
    render(
      <SpecialistActivityPanel
        maxVisibleCompleted={2}
        events={[
          graphStarted('deal-analyst', 1, 0),
          graphFinished('deal-analyst', 2, 60),
          graphStarted('ownership-cost-analyst', 3, 0),
          graphFinished('ownership-cost-analyst', 4, 70),
          graphStarted('safety-reliability-analyst', 5, 0),
          graphFinished('safety-reliability-analyst', 6, 80, 'FAILED'),
          graphStarted('household-fit-analyst', 7, 0),
          graphFinished('household-fit-analyst', 8, 90),
        ]}
      />,
    );

    // The oldest routine completion folds; the failure never does.
    expect(visibleSpecialistIds()).toEqual([
      'ownership-cost-analyst',
      'safety-reliability-analyst',
      'household-fit-analyst',
    ]);
    expect(
      within(rowFor('safety-reliability-analyst')).getByTestId('specialist-row-state'),
    ).toHaveTextContent('Error');

    const toggle = screen.getByTestId('specialist-activity-more');
    expect(toggle).toHaveTextContent('+1 more');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(visibleSpecialistIds()).toEqual([
      'deal-analyst',
      'ownership-cost-analyst',
      'safety-reliability-analyst',
      'household-fit-analyst',
    ]);
    expect(screen.getByTestId('specialist-activity-more')).toHaveAttribute('aria-expanded', 'true');
  });

  it('never folds a specialist that is awaiting approval, was skipped, or found a conflict', () => {
    render(
      <SpecialistActivityPanel
        maxVisibleCompleted={1}
        events={[
          // Completed cleanly, but its sources disagree -- exceptional.
          graphStarted('source-challenger', 1, 0),
          buildEvent({
            sequence: 2,
            agentId: 'source-challenger',
            type: 'evidence.conflicted',
            phase: 'completed',
            summary: 'Two independent safety sources disagree for this candidate.',
          }),
          graphFinished('source-challenger', 3, 60),
          // Bypassed by an edge condition.
          graphStarted('household-fit-analyst', 4, 0),
          graphFinished('household-fit-analyst', 5, 10, 'CANCELLED'),
          // Blocked on a human.
          graphStarted('decision-synthesizer', 6, 0),
          buildEvent({
            sequence: 7,
            agentId: 'decision-synthesizer',
            type: 'intervention.confirmation_required',
            phase: 'waiting',
            summary: 'ConsequenceGuard: propose_recommendation requires human confirmation.',
          }),
          // Two routine completions, one of which must fold.
          graphStarted('deal-analyst', 8, 0),
          graphFinished('deal-analyst', 9, 60),
          graphStarted('ownership-cost-analyst', 10, 0),
          graphFinished('ownership-cost-analyst', 11, 70),
        ]}
      />,
    );

    expect(visibleSpecialistIds()).toContain('source-challenger');
    expect(visibleSpecialistIds()).toContain('household-fit-analyst');
    expect(visibleSpecialistIds()).toContain('decision-synthesizer');
    expect(visibleSpecialistIds()).not.toContain('deal-analyst');
    expect(
      within(rowFor('source-challenger')).getByTestId('specialist-row-detail'),
    ).toHaveTextContent('Sources disagree');
    expect(screen.getByTestId('specialist-activity-more')).toHaveTextContent('+1 more');
  });

  // --- Design rule 2: absolutely no loading affordance -------------------

  // This is the crux of the design and the thing most likely to be
  // "fixed" later by someone adding a spinner. A whole run is ~300ms:
  // Primer ("Less than 1 second: Don't show a loading state"), NN/g and
  // Material 3 all forbid one at that duration. If this test fails because
  // an animated affordance was added, the affordance is the defect.
  it('renders no spinner, shimmer, or pulse for a sub-second run', () => {
    const { container } = render(
      <SpecialistActivityPanel
        events={[
          ...PARALLEL_BRANCH_IDS.map((id, index) => graphStarted(id, index + 1, index)),
          graphFinished('deal-analyst', 5, 300),
        ]}
      />,
    );

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(
      /animate-spin|animate-pulse|animate-bounce|loading-pulse|spinner|shimmer|skeleton/i,
    );
    // Design rule 7: no fabricated process narration, ever.
    expect(container.textContent).not.toMatch(/thinking|analyz|thought for/i);
  });

  // --- Empty, scoping, accessibility, and the 390px pane -----------------

  // ADR 0004: an empty conceptual region is ABSENT, not a card announcing
  // its own emptiness. Events with no specialist attribution cannot invent
  // a team, either.
  it('renders nothing at all when no specialist has reported', () => {
    const { container } = render(
      <SpecialistActivityPanel
        events={[
          buildEvent({ sequence: 1, type: 'run.queued', phase: 'queued', summary: 'Queued.' }),
          buildEvent({
            sequence: 2,
            type: 'command.accepted',
            phase: 'completed',
            summary: 'Added option "2022 Subaru Outback Premium AWD".',
          }),
        ]}
      />,
    );

    expect(screen.queryByTestId('specialist-activity-panel')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('scopes the team to one run when a runId is given', () => {
    render(
      <SpecialistActivityPanel
        runId={RUN_ID}
        events={[
          graphStarted('deal-analyst', 1, 0),
          graphFinished('deal-analyst', 2, 60),
          buildEvent({
            ...graphStarted('rate-analyst', 3, 0),
            runId: 'run-some-other-1',
          }),
        ]}
      />,
    );

    expect(visibleSpecialistIds()).toEqual(['deal-analyst']);
  });

  it('announces team progress once, politely, instead of per row', () => {
    render(
      <SpecialistActivityPanel
        events={[
          graphStarted('deal-analyst', 1, 0),
          graphStarted('ownership-cost-analyst', 2, 0),
          graphFinished('deal-analyst', 3, 60),
        ]}
      />,
    );

    const live = screen.getByTestId('specialist-activity-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('1 specialists finished, 1 still working.');
    // Six rows finishing inside 300ms must not each be their own live region.
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('gives the fold toggle a real 44px touch target', () => {
    render(
      <SpecialistActivityPanel
        maxVisibleCompleted={1}
        events={[
          graphStarted('deal-analyst', 1, 0),
          graphFinished('deal-analyst', 2, 60),
          graphStarted('ownership-cost-analyst', 3, 0),
          graphFinished('ownership-cost-analyst', 4, 70),
        ]}
      />,
    );

    expect(screen.getByTestId('specialist-activity-more').style.minHeight).toBe(
      'var(--size-touch-target-min)',
    );
  });

  it('has no axe violations while a run is mid-flight', async () => {
    const { container } = render(
      <SpecialistActivityPanel
        maxVisibleCompleted={1}
        events={[
          ...PARALLEL_BRANCH_IDS.map((id, index) => graphStarted(id, index + 1, index)),
          graphFinished('deal-analyst', 5, 120),
          graphFinished('ownership-cost-analyst', 6, 130),
          graphFinished('safety-reliability-analyst', 7, 140, 'FAILED'),
        ]}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('introduces no fixed width that would overflow the 390px pane', () => {
    const { overflowRisks } = renderAtNarrowWidth(
      <SpecialistActivityPanel maxVisibleCompleted={1} events={parallelBranchEvents()} />,
    );

    expect(overflowRisks).toEqual([]);
  });
});
