/**
 * Behavioral tests for `RunGraphView`.
 *
 * Every fixture below mirrors a REAL persisted `runtime_events` row shape,
 * not an idealized one: the graph fixtures reproduce the exact sequence
 * numbers, node ids, event `name`s, and `summary` strings a real
 * car-purchase run writes (`apps/agent/src/runtime/car-purchase-graph.ts`'s
 * `emitGraphNodeEvent` -- note that BOTH the start and the finish event are
 * named `graph.node_completed` and are told apart only by `phase`), and the
 * swarm fixtures reproduce `home-energy-swarm.ts`'s `emitSwarmNodeEvent` /
 * `emitSwarmHandoffEvent` / `emitSwarmCycleDetectedEvent` output.
 *
 * The point of the component is that the run's *shape* is derived, so the
 * assertions are about derived structure -- which nodes share a stage, what
 * order the stages fall in, what a node that never finished is reported as,
 * which handoff carries which reason -- never "it rendered".
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import type { RuntimeInspectorEvent } from '../hooks/use-runtime-inspector.js';
import { RunGraphView } from './RunGraphView.js';
import { renderAtNarrowWidth } from '../test/narrow-viewport.js';

const RUN_ID = 'run-car-purchase-1';

function buildEvent(
  sequence: number,
  overrides: Partial<RuntimeInspectorEvent> &
    Pick<RuntimeInspectorEvent, 'category' | 'name' | 'phase' | 'summary'>,
): RuntimeInspectorEvent {
  return {
    id: `evt-${sequence}`,
    schemaVersion: '1.0',
    traceId: 'trace-1',
    caseId: 'case-1',
    runId: RUN_ID,
    sequence,
    timestamp: '2026-09-03T10:00:00.000Z',
    level: 'info',
    attributes: {},
    redactions: [],
    ...overrides,
  };
}

/** Mirrors `car-purchase-graph.ts`'s `emitGraphNodeEvent({ phase: 'start' })`. */
function graphNodeStarted(sequence: number, nodeId: string): RuntimeInspectorEvent {
  return buildEvent(sequence, {
    category: 'graph',
    name: 'graph.node_completed',
    phase: 'start',
    agentId: nodeId,
    summary: `Graph node "${nodeId}" started.`,
    attributes: { nodeId },
  });
}

/** Mirrors `car-purchase-graph.ts`'s `emitGraphNodeEvent({ phase: 'finish', status })`. */
function graphNodeFinished(
  sequence: number,
  nodeId: string,
  status = 'COMPLETED',
): RuntimeInspectorEvent {
  return buildEvent(sequence, {
    category: 'graph',
    name: 'graph.node_completed',
    phase: 'finish',
    agentId: nodeId,
    summary: `Graph node "${nodeId}" completed with status "${status}".`,
    attributes: { nodeId, status },
  });
}

/** Mirrors `home-energy-swarm.ts`'s `emitSwarmNodeEvent`. */
function swarmNodeStarted(sequence: number, nodeId: string): RuntimeInspectorEvent {
  return buildEvent(sequence, {
    category: 'swarm',
    name: 'swarm.node_started',
    phase: 'start',
    agentId: nodeId,
    summary: `Swarm node "${nodeId}" started.`,
    attributes: { nodeId },
  });
}

function swarmNodeCompleted(
  sequence: number,
  nodeId: string,
  status = 'COMPLETED',
): RuntimeInspectorEvent {
  return buildEvent(sequence, {
    category: 'swarm',
    name: 'swarm.node_completed',
    phase: 'finish',
    agentId: nodeId,
    summary: `Swarm node "${nodeId}" completed with status "${status}".`,
    attributes: { nodeId, status },
  });
}

/** Mirrors `home-energy-swarm.ts`'s `emitSwarmHandoffEvent`. */
function swarmHandoff(
  sequence: number,
  from: string,
  to: string,
  reason: string,
  evidenceDelta = 0,
): RuntimeInspectorEvent {
  return buildEvent(sequence, {
    category: 'swarm',
    name: 'swarm.handoff',
    phase: 'finish',
    summary: `Swarm handoff: "${from}" -> "${to}" (${reason}).`,
    attributes: { from, to, reason, evidenceDelta },
  });
}

/**
 * The real car-purchase Graph trajectory, at its real sequence numbers:
 * four analysts fan out in parallel (#0-#3) and all four complete (#80-#196)
 * before `source-challenger` (#197) and then `decision-synthesizer` (#229)
 * run in sequence. 12 `graph`-category events, exactly as persisted.
 */
const CAR_GRAPH_EVENTS: RuntimeInspectorEvent[] = [
  graphNodeStarted(0, 'deal-analyst'),
  graphNodeStarted(1, 'ownership-cost-analyst'),
  graphNodeStarted(2, 'safety-reliability-analyst'),
  graphNodeStarted(3, 'household-fit-analyst'),
  graphNodeFinished(80, 'safety-reliability-analyst'),
  graphNodeFinished(121, 'ownership-cost-analyst'),
  graphNodeFinished(162, 'household-fit-analyst'),
  graphNodeFinished(196, 'deal-analyst'),
  graphNodeStarted(197, 'source-challenger'),
  graphNodeFinished(228, 'source-challenger'),
  graphNodeStarted(229, 'decision-synthesizer'),
  graphNodeFinished(243, 'decision-synthesizer'),
];

const LONG_HANDOFF_REASON =
  'The current bill totals $248.50, 42% above the weather- and tree-cover-adjusted baseline, and the utility changed its rate schedule mid-cycle.';

const SWARM_EVENTS: RuntimeInspectorEvent[] = [
  swarmNodeStarted(0, 'anomaly-investigator'),
  swarmNodeCompleted(41, 'anomaly-investigator'),
  swarmHandoff(42, 'anomaly-investigator', 'rate-analyst', LONG_HANDOFF_REASON, 2),
  swarmNodeStarted(43, 'rate-analyst'),
  swarmNodeCompleted(88, 'rate-analyst'),
  swarmHandoff(
    89,
    'rate-analyst',
    'weather-analyst',
    'Rate change explains only $61 of the gap.',
    1,
  ),
  swarmNodeStarted(90, 'weather-analyst'),
  swarmNodeCompleted(124, 'weather-analyst'),
];

function nodeIdsIn(stageTestId: string): string[] {
  return within(screen.getByTestId(stageTestId))
    .getAllByTestId(/^run-graph-node-/)
    .map((node) => node.getAttribute('data-node-id') ?? '');
}

describe('RunGraphView', () => {
  it('groups the four analysts that started before any of them completed into one parallel stage', () => {
    render(<RunGraphView events={CAR_GRAPH_EVENTS} />);

    expect(nodeIdsIn('run-graph-stage-1')).toEqual([
      'deal-analyst',
      'ownership-cost-analyst',
      'safety-reliability-analyst',
      'household-fit-analyst',
    ]);
    expect(screen.getByTestId('run-graph-stage-1-parallel')).toHaveTextContent('4 in parallel');
  });

  it('places the challenger and synthesizer in their own later stages rather than the fan-out', () => {
    render(<RunGraphView events={CAR_GRAPH_EVENTS} />);

    const stages = within(screen.getByTestId('run-graph-stages')).getAllByRole('listitem');
    expect(nodeIdsIn('run-graph-stage-2')).toEqual(['source-challenger']);
    expect(nodeIdsIn('run-graph-stage-3')).toEqual(['decision-synthesizer']);
    expect(screen.queryByTestId('run-graph-stage-4')).not.toBeInTheDocument();

    // The stages render in execution order, so the challenger's stage
    // precedes the synthesizer's in document order. Only stage <li>s carry
    // `data-stage-index`; the node <li>s nested inside them do not.
    const stageIndexes = stages
      .map((node) => node.getAttribute('data-stage-index'))
      .filter((value): value is string => value !== null);
    expect(stageIndexes).toEqual(['1', '2', '3']);

    // A single-node stage is not mislabeled as parallel work.
    expect(screen.queryByTestId('run-graph-stage-2-parallel')).not.toBeInTheDocument();
    expect(screen.getByTestId('run-graph-view-summary')).toHaveTextContent('6 nodes · 3 stages');
  });

  it('derives stages from each event sequence, not from the order the array happened to arrive in', () => {
    render(<RunGraphView events={[...CAR_GRAPH_EVENTS].reverse()} />);

    expect(nodeIdsIn('run-graph-stage-1')).toEqual([
      'deal-analyst',
      'ownership-cost-analyst',
      'safety-reliability-analyst',
      'household-fit-analyst',
    ]);
    expect(nodeIdsIn('run-graph-stage-3')).toEqual(['decision-synthesizer']);
  });

  it('reports a node that started and never completed as still running, keeping it in its stage', () => {
    const stillRunning = CAR_GRAPH_EVENTS.filter(
      (event) => !(event.sequence === 196 && event.phase === 'finish'),
    );
    render(<RunGraphView events={stillRunning} />);

    // The node is not dropped just because no completion was ever recorded.
    expect(nodeIdsIn('run-graph-stage-1')).toContain('deal-analyst');

    const dealAnalyst = within(screen.getByTestId('run-graph-stage-1')).getByTestId(
      'run-graph-node-deal-analyst',
    );
    expect(dealAnalyst).toHaveAttribute('data-node-status', 'running');
    expect(dealAnalyst).toHaveTextContent(/running/i);

    const completed = within(screen.getByTestId('run-graph-stage-1')).getByTestId(
      'run-graph-node-safety-reliability-analyst',
    );
    expect(completed).toHaveAttribute('data-node-status', 'completed');
    expect(completed).toHaveTextContent(/completed/i);
  });

  it('distinguishes a failed node from a completed one in the same stage', () => {
    const withFailure = CAR_GRAPH_EVENTS.map((event) =>
      event.sequence === 162 ? graphNodeFinished(162, 'household-fit-analyst', 'FAILED') : event,
    );
    render(<RunGraphView events={withFailure} />);

    const failed = within(screen.getByTestId('run-graph-stage-1')).getByTestId(
      'run-graph-node-household-fit-analyst',
    );
    expect(failed).toHaveAttribute('data-node-status', 'failed');
    expect(failed).toHaveTextContent(/failed/i);

    const ok = within(screen.getByTestId('run-graph-stage-1')).getByTestId(
      'run-graph-node-deal-analyst',
    );
    expect(ok).toHaveAttribute('data-node-status', 'completed');
    expect(ok).not.toHaveTextContent(/failed/i);
  });

  it('reports a finish status that is neither COMPLETED nor FAILED using the status the run actually recorded', () => {
    const cancelled = CAR_GRAPH_EVENTS.map((event) =>
      event.sequence === 243 ? graphNodeFinished(243, 'decision-synthesizer', 'CANCELLED') : event,
    );
    render(<RunGraphView events={cancelled} />);

    const node = screen.getByTestId('run-graph-node-decision-synthesizer');
    expect(node).toHaveAttribute('data-node-status', 'ended');
    expect(node).toHaveTextContent(/cancelled/i);
  });

  it('renders the swarm handoff chain in sequence order with each real reason and evidence delta', () => {
    render(<RunGraphView events={SWARM_EVENTS} />);

    const handoffs = within(screen.getByTestId('run-graph-handoffs')).getAllByRole('listitem');
    expect(handoffs).toHaveLength(2);

    expect(handoffs[0]).toHaveAttribute('data-handoff-from', 'anomaly-investigator');
    expect(handoffs[0]).toHaveAttribute('data-handoff-to', 'rate-analyst');
    expect(handoffs[1]).toHaveAttribute('data-handoff-from', 'rate-analyst');
    expect(handoffs[1]).toHaveAttribute('data-handoff-to', 'weather-analyst');

    // A long reason is shortened for the 390px pane, but the full text is
    // still present and reachable -- never silently thrown away.
    const firstSummary = screen.getByTestId('run-graph-handoff-0-reason-summary');
    expect(firstSummary.textContent ?? '').toMatch(/^The current bill totals \$248\.50,.*…$/);
    expect((firstSummary.textContent ?? '').length).toBeLessThan(LONG_HANDOFF_REASON.length);
    expect(screen.getByTestId('run-graph-handoff-0-reason-full')).toHaveTextContent(
      LONG_HANDOFF_REASON,
    );

    // A reason short enough to read in full needs no disclosure at all.
    expect(screen.getByTestId('run-graph-handoff-1-reason')).toHaveTextContent(
      'Rate change explains only $61 of the gap.',
    );
    expect(screen.queryByTestId('run-graph-handoff-1-reason-summary')).not.toBeInTheDocument();

    expect(screen.getByTestId('run-graph-handoff-0')).toHaveTextContent(
      /\+2 passing evidence items/i,
    );
    expect(screen.getByTestId('run-graph-handoff-1')).toHaveTextContent(
      /\+1 passing evidence item\b/i,
    );
  });

  it('renders sequential swarm specialists as one stage each and names the run a Swarm', () => {
    render(<RunGraphView events={SWARM_EVENTS} />);

    expect(nodeIdsIn('run-graph-stage-1')).toEqual(['anomaly-investigator']);
    expect(nodeIdsIn('run-graph-stage-2')).toEqual(['rate-analyst']);
    expect(nodeIdsIn('run-graph-stage-3')).toEqual(['weather-analyst']);
    expect(screen.getByRole('heading', { name: 'Strands Swarm' })).toBeInTheDocument();
    expect(screen.getByTestId('run-graph-view-summary')).toHaveTextContent('2 handoffs');
  });

  it('gives a node the swarm revisited a second, later stage instead of merging the two visits', () => {
    const revisit: RuntimeInspectorEvent[] = [
      ...SWARM_EVENTS,
      swarmHandoff(125, 'weather-analyst', 'rate-analyst', 'Weather explains none of the gap.', 0),
      swarmNodeStarted(126, 'rate-analyst'),
      swarmNodeCompleted(170, 'rate-analyst'),
    ];
    render(<RunGraphView events={revisit} />);

    expect(nodeIdsIn('run-graph-stage-2')).toEqual(['rate-analyst']);
    expect(nodeIdsIn('run-graph-stage-4')).toEqual(['rate-analyst']);
    // Both visits are complete: the second visit must not be reported as
    // still running just because a node of that name finished earlier.
    const secondVisit = within(screen.getByTestId('run-graph-stage-4')).getByTestId(
      'run-graph-node-rate-analyst',
    );
    expect(secondVisit).toHaveAttribute('data-node-status', 'completed');

    // A handoff that carried no newly passing evidence must not claim any.
    expect(screen.getByTestId('run-graph-handoff-2')).not.toHaveTextContent(/passing evidence/i);
  });

  it('surfaces a swarm safety-net event that belongs to no single node', () => {
    const tripped: RuntimeInspectorEvent[] = [
      ...SWARM_EVENTS,
      buildEvent(125, {
        category: 'swarm',
        name: 'swarm.cycle_detected',
        phase: 'error',
        level: 'warn',
        summary:
          'Swarm repetitive-handoff safety net tripped: rate-analyst handed off to weather-analyst 3 times.',
        attributes: {},
      }),
    ];
    render(<RunGraphView events={tripped} />);

    expect(screen.getByTestId('run-graph-notice-0')).toHaveTextContent(
      /repetitive-handoff safety net tripped/i,
    );
  });

  it('states plainly that a run recorded no orchestration shape instead of drawing an empty diagram', () => {
    const singleAgentRun: RuntimeInspectorEvent[] = [
      buildEvent(0, {
        category: 'model',
        name: 'model.call',
        phase: 'start',
        summary: 'Calling the model.',
      }),
      buildEvent(1, {
        category: 'tool',
        name: 'tool.search_listings',
        phase: 'finish',
        summary: 'Tool "search_listings" completed.',
      }),
    ];
    render(<RunGraphView events={singleAgentRun} />);

    const empty = screen.getByTestId('run-graph-view-empty');
    expect(empty).toHaveTextContent(/no graph or swarm structure/i);
    // The honest pointer to where those events DO live.
    expect(empty).toHaveTextContent('2 runtime events');
    expect(screen.queryByTestId('run-graph-stages')).not.toBeInTheDocument();
  });

  it('distinguishes "this run has no events yet" from "this run has no orchestration shape"', () => {
    render(<RunGraphView events={[]} />);

    const empty = screen.getByTestId('run-graph-view-empty');
    expect(empty).toHaveTextContent(/no runtime events/i);
    expect(empty).not.toHaveTextContent(/no graph or swarm structure/i);
  });

  it('has no axe violations in the graph, swarm, and empty states', async () => {
    const { container: graph } = render(<RunGraphView events={CAR_GRAPH_EVENTS} />);
    expect(await axe(graph)).toHaveNoViolations();

    const { container: swarm } = render(<RunGraphView events={SWARM_EVENTS} />);
    expect(await axe(swarm)).toHaveNoViolations();

    const { container: empty } = render(<RunGraphView events={[]} />);
    expect(await axe(empty)).toHaveNoViolations();
  });

  it('renders at 390px width with no fixed-width overflow risk', () => {
    expect(renderAtNarrowWidth(<RunGraphView events={CAR_GRAPH_EVENTS} />).overflowRisks).toEqual(
      [],
    );
    expect(renderAtNarrowWidth(<RunGraphView events={SWARM_EVENTS} />).overflowRisks).toEqual([]);
  });

  it('ignores OTel span rows, which share the graph category but are not nodes', () => {
    // Real regression, found by driving the product: `span.invoke_graph` is
    // `category: 'graph'` with no `nodeId`, so `nodeIdOf` fell through to
    // `agentId` and the graph's own root span rendered as an extra
    // specialist named after the graph, in a stage of its own, labelled
    // ENDED because a span carries no COMPLETED status. On screen that is
    // indistinguishable from a seventh agent that failed.
    render(
      <RunGraphView
        events={[
          graphNodeStarted(0, 'deal-analyst'),
          graphNodeFinished(1, 'deal-analyst'),
          buildEvent(1_000_074, {
            category: 'graph',
            name: 'span.invoke_graph',
            phase: 'finish',
            agentId: 'car-purchase-graph',
            summary: 'Strands OTEL span "invoke_graph car-purchase-graph" finished.',
          }),
        ]}
      />,
    );

    expect(screen.queryByText('car-purchase-graph')).toBeNull();
    expect(screen.getByTestId('run-graph-node-deal-analyst')).toBeInTheDocument();
    expect(screen.getByTestId('run-graph-view-summary')).toHaveTextContent('1 node');
  });
});
