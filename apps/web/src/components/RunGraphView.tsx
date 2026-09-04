/**
 * The Runtime Inspector's execution-shape view: what actually ran, in what
 * order, and what ran *at the same time*.
 *
 * The Inspector's Timeline (`RuntimeInspector.tsx`) is a flat chronological
 * list, which is the right shape for "what happened at #121" and the wrong
 * shape for "four analysts fanned out in parallel, then a challenger, then a
 * synthesizer." That structure is genuinely present in the persisted
 * `runtime_events` rows and was previously invisible: a real car-purchase run
 * writes twelve `category: 'graph'` events, and a real home-energy run writes
 * `category: 'swarm'` node and handoff events. This component reads those and
 * nothing else.
 *
 * **Derived, never assumed.** No pack topology, specialist roster, or node
 * ordering is hard-coded here. Stages come out of the event stream itself:
 * nodes that started before any node in the current wave had finished belong
 * to the same stage; the first start *after* a finish opens the next one.
 * Applied to the real trajectory (`#0-#3` start, `#80-#196` finish, `#197`
 * `source-challenger`, `#229` `decision-synthesizer`) that yields exactly the
 * fan-out, challenger, synthesizer shape the run really had -- and if a pack
 * changes its graph tomorrow, this view changes with it rather than lying.
 *
 * Consequences of taking the events literally, all deliberate:
 *
 * - A node that started and never recorded a completion renders as **still
 *   running**, in its stage. Dropping it would hide the single most
 *   diagnostically useful state a run can be in (a hung or crashed node).
 * - A finish whose recorded status is neither `COMPLETED` nor `FAILED`
 *   (`CANCELLED`, `INTERRUPTED` -- the other two members of the Strands SDK's
 *   `ResultStatus`) is reported using the status the run actually wrote,
 *   never rounded up to "completed".
 * - A node the Swarm revisits gets a second, later stage rather than being
 *   merged into its first visit. The revisit is real work and the cycle is
 *   the interesting part.
 * - `swarm.cycle_detected`/`swarm.timeout` belong to no single node, so they
 *   render as run-level notices instead of being silently discarded.
 *
 * Both hero packs are handled by one derivation because both emit the same
 * lifecycle shape under different names: `car-purchase-graph.ts` emits
 * `graph.node_completed` for BOTH ends of a node (`phase` is what separates
 * them, not `name`), while `home-energy-swarm.ts` emits
 * `swarm.node_started`/`swarm.node_completed`. Keying on `phase` plus a
 * `nodeId` attribute, rather than on either event `name`, is what lets one
 * component serve both without a per-pack branch.
 *
 * Layout is semantic HTML and CSS grid, not SVG. At the canonical 390px pane
 * an auto-fitting grid puts a parallel stage's nodes side by side (two
 * columns at 390px, more as the pane widens) while every node stays a real
 * list item with real text -- so the parallelism is visible to a person
 * looking at it and legible to a screen reader reading it, with no
 * `<svg>`-shaped text alternative to keep in sync. Colour repeats the
 * Inspector's existing status tokens (docs/design-system.md, "Runtime
 * Inspector density vs. the calm workspace") and is never the only signal:
 * every node carries its status as words.
 */
import type { RuntimeDebugLevel } from '@sift/contracts';
import type { RuntimeInspectorEvent } from '../hooks/use-runtime-inspector.js';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

export interface RunGraphViewProps {
  /** The run's runtime events exactly as `useRuntimeInspector` returns them. Order-insensitive: the shape is derived from each event's `sequence`, so a filtered, resynced, or out-of-order array still projects correctly. Events from other categories are ignored, not an error. */
  events: readonly RuntimeInspectorEvent[];
}

/** `running` = started with no completion recorded yet; `ended` = finished with a status that is neither `COMPLETED` nor `FAILED`, reported verbatim rather than rounded up. */
type RunGraphNodeStatus = 'running' | 'completed' | 'failed' | 'ended';

interface RunGraphNode {
  nodeId: string;
  status: RunGraphNodeStatus;
  /** Human-facing status word, derived from the run's own recorded status string (`Completed`, `Failed`, `Cancelled`, ...). */
  statusLabel: string;
  /** The sequence this node's own occurrence began at -- part of its React key, so a revisited node's two occurrences stay distinct. */
  startSequence: number;
}

interface RunGraphStage {
  /** 1-based, for display and `data-stage-index`. */
  index: number;
  nodes: RunGraphNode[];
}

interface RunGraphHandoff {
  eventId: string;
  from: string;
  to: string;
  reason: string;
  evidenceDelta: number;
}

/** A real orchestration event that belongs to no single node (`swarm.cycle_detected`, `swarm.timeout`). */
interface RunGraphNotice {
  eventId: string;
  summary: string;
  level: RuntimeDebugLevel;
}

interface RunGraphModel {
  kind: 'graph' | 'swarm' | 'none';
  stages: RunGraphStage[];
  handoffs: RunGraphHandoff[];
  notices: RunGraphNotice[];
  nodeCount: number;
}

const NODE_TONE: Record<RunGraphNodeStatus, StatusTone> = {
  running: 'active',
  completed: 'satisfied',
  failed: 'error',
  ended: 'accepted-uncertainty',
};

const NOTICE_TONE: Record<RuntimeDebugLevel, StatusTone> = {
  debug: 'neutral',
  info: 'neutral',
  warn: 'accepted-uncertainty',
  error: 'error',
};

/**
 * How much of a handoff reason fits on one comfortable line-and-a-bit at
 * 390px. Longer reasons are previewed and disclosed rather than clipped by
 * CSS: a clipped reason is unreadable and a wrapped 200-character paragraph
 * buries the chain it is annotating.
 */
const REASON_PREVIEW_LIMIT = 96;

function readString(attributes: Record<string, unknown>, key: string): string | undefined {
  const value = attributes[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(attributes: Record<string, unknown>, key: string): number | undefined {
  const value = attributes[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Both emitters set `attributes.nodeId` and mirror it into the correlation's
 * `agentId`; the attribute is preferred because it is the field the emitters
 * treat as the node's identity, with `agentId` as the fallback for any
 * producer that only stamped the correlation.
 */
function nodeIdOf(event: RuntimeInspectorEvent): string | undefined {
  return readString(event.attributes, 'nodeId') ?? event.agentId;
}

function humanizeStatus(raw: string): string {
  const lower = raw.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
}

/** Maps one finish/error event onto a node status. `phase: 'error'` is a failure regardless of what `attributes.status` says, because an error phase is the emitter's own strongest statement about the outcome. */
function resolveFinishStatus(event: RuntimeInspectorEvent): {
  status: RunGraphNodeStatus;
  label: string;
} {
  if (event.phase === 'error') return { status: 'failed', label: 'Failed' };
  const raw = readString(event.attributes, 'status');
  if (raw === undefined) return { status: 'ended', label: 'Ended' };
  const normalized = raw.toUpperCase();
  if (normalized === 'COMPLETED') return { status: 'completed', label: 'Completed' };
  if (normalized === 'FAILED') return { status: 'failed', label: 'Failed' };
  return { status: 'ended', label: humanizeStatus(raw) };
}

/**
 * The most recent still-running occurrence of `nodeId`, searched backwards.
 * Matching the *latest* open occurrence rather than the first one of that
 * name is what makes a Swarm revisit come out right: when `rate-analyst` runs
 * twice, its second completion must close its second visit, not resurrect the
 * first.
 */
function findOpenOccurrence(nodes: RunGraphNode[], nodeId: string): RunGraphNode | undefined {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node?.nodeId === nodeId && node.status === 'running') return node;
  }
  return undefined;
}

function buildRunGraph(events: readonly RuntimeInspectorEvent[]): RunGraphModel {
  const orchestration = events
    .filter(
      (event) =>
        (event.category === 'graph' || event.category === 'swarm') &&
        // OTel span rows share these categories -- `span.invoke_graph` is
        // `category: 'graph'` -- but they describe the run's TIMING tree, not
        // its node lifecycle, and they carry no `nodeId`. Left in, `nodeIdOf`
        // falls through to `agentId` and the graph's own root span renders as
        // a seventh "specialist" called `car-purchase-graph`, in a stage of
        // its own, labelled ENDED because a span has no COMPLETED status. On
        // screen that reads as a failed extra agent. Spans have their own
        // parent/child tree via `spanId`/`parentSpanId`; this view is only
        // ever about which node ran when.
        !event.name.startsWith('span.'),
    )
    .sort((a, b) => a.sequence - b.sequence);

  if (orchestration.length === 0) {
    return { kind: 'none', stages: [], handoffs: [], notices: [], nodeCount: 0 };
  }

  const stages: RunGraphNode[][] = [];
  const occurrences: RunGraphNode[] = [];
  const handoffs: RunGraphHandoff[] = [];
  const notices: RunGraphNotice[] = [];

  let current: RunGraphNode[] = [];
  // The stage-boundary rule in one flag: once anything in the current wave
  // has finished, the next node to start is no longer parallel with it.
  let currentHasFinished = false;

  const closeStage = (): void => {
    if (current.length > 0) stages.push(current);
    current = [];
    currentHasFinished = false;
  };

  // Every node occurrence is tracked twice on purpose: once in the stage it
  // belongs to (for rendering) and once in a flat, run-wide list (so a
  // completion can find its own open occurrence even after its stage closed).
  const openNode = (node: RunGraphNode): void => {
    current.push(node);
    occurrences.push(node);
  };

  for (const event of orchestration) {
    const from = readString(event.attributes, 'from');
    const to = readString(event.attributes, 'to');
    if (from !== undefined && to !== undefined) {
      handoffs.push({
        eventId: event.id,
        from,
        to,
        reason: readString(event.attributes, 'reason') ?? '',
        evidenceDelta: readNumber(event.attributes, 'evidenceDelta') ?? 0,
      });
      continue;
    }

    const nodeId = nodeIdOf(event);
    if (nodeId === undefined) {
      // Real, run-level orchestration events with no node of their own. A
      // handoff whose `from`/`to` are not both strings also lands here rather
      // than being drawn as an edge between unknowns.
      notices.push({ eventId: event.id, summary: event.summary, level: event.level });
      continue;
    }

    if (event.phase === 'start') {
      if (currentHasFinished) closeStage();
      openNode({
        nodeId,
        status: 'running',
        statusLabel: 'Running',
        startSequence: event.sequence,
      });
      continue;
    }

    // `phase: 'update'` is a progress ping: it changes nothing about which
    // nodes are open, so it must not be allowed to close one.
    if (event.phase !== 'finish' && event.phase !== 'error') continue;

    const { status, label } = resolveFinishStatus(event);
    const open = findOpenOccurrence(occurrences, nodeId);
    if (open !== undefined) {
      open.status = status;
      open.statusLabel = label;
      if (current.includes(open)) currentHasFinished = true;
      continue;
    }

    // A completion whose start was never observed -- a filtered or truncated
    // stream. Shown with the status the run recorded, in its own stage,
    // rather than dropped for not fitting the expected pairing.
    if (currentHasFinished) closeStage();
    openNode({ nodeId, status, statusLabel: label, startSequence: event.sequence });
    currentHasFinished = true;
  }
  closeStage();

  return {
    kind: orchestration.some((event) => event.category === 'swarm') ? 'swarm' : 'graph',
    stages: stages.map((nodes, index) => ({ index: index + 1, nodes })),
    handoffs,
    notices,
    nodeCount: occurrences.length,
  };
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** Preview text for a long handoff reason, cut at a word boundary where one is close enough to the limit to be worth keeping. */
function previewReason(reason: string): string {
  if (reason.length <= REASON_PREVIEW_LIMIT) return reason;
  const head = reason.slice(0, REASON_PREVIEW_LIMIT);
  const lastSpace = head.lastIndexOf(' ');
  const cut = lastSpace > REASON_PREVIEW_LIMIT / 2 ? head.slice(0, lastSpace) : head;
  return `${cut.trimEnd()}…`;
}

function StageNode({ node }: { node: RunGraphNode }) {
  const tone = STATUS_TONE_META[NODE_TONE[node.status]];
  return (
    <li
      data-testid={`run-graph-node-${node.nodeId}`}
      data-node-id={node.nodeId}
      data-node-status={node.status}
      className="flex min-w-0 flex-col gap-[var(--space-0-5)] rounded-[var(--radius-sm)] p-[var(--space-2)]"
      style={{ backgroundColor: tone.bg }}
    >
      <span className="min-w-0 font-[family-name:var(--font-mono)] text-[length:var(--font-size-xs)] break-words text-[var(--color-ink)]">
        {node.nodeId}
      </span>
      <span
        className="label-caps inline-flex min-w-0 items-center gap-[var(--space-1)] break-words"
        style={{ color: tone.ink }}
      >
        <span aria-hidden="true">{tone.icon}</span>
        {node.statusLabel}
      </span>
    </li>
  );
}

function HandoffReason({ testIdBase, reason }: { testIdBase: string; reason: string }) {
  if (reason.length === 0) return null;
  const preview = previewReason(reason);
  if (preview === reason) {
    return (
      <p
        data-testid={`${testIdBase}-reason`}
        className="min-w-0 text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] break-words text-[var(--color-ink-secondary)]"
      >
        {reason}
      </p>
    );
  }
  return (
    <details data-testid={`${testIdBase}-reason`} title={reason} className="min-w-0">
      <summary
        data-testid={`${testIdBase}-reason-summary`}
        className="flex min-h-[var(--size-touch-target-min)] cursor-pointer items-center text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] break-words text-[var(--color-ink-secondary)]"
      >
        {preview}
      </summary>
      <p
        data-testid={`${testIdBase}-reason-full`}
        className="min-w-0 pt-[var(--space-1)] text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] break-words text-[var(--color-ink-secondary)]"
      >
        {reason}
      </p>
    </details>
  );
}

function HandoffItem({ handoff, index }: { handoff: RunGraphHandoff; index: number }) {
  const testIdBase = `run-graph-handoff-${index}`;
  return (
    <li
      data-testid={testIdBase}
      data-handoff-from={handoff.from}
      data-handoff-to={handoff.to}
      className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-sm)] bg-muted p-[var(--space-2)]"
    >
      <p className="flex min-w-0 flex-wrap items-center gap-[var(--space-1)] font-[family-name:var(--font-mono)] text-[length:var(--font-size-xs)] break-words text-[var(--color-ink)]">
        <span className="min-w-0 break-words">{handoff.from}</span>
        {/* The arrow is decoration; the relationship itself is spoken. */}
        <span aria-hidden="true">→</span>
        <span className="visually-hidden">hands off to</span>
        <span className="min-w-0 break-words">{handoff.to}</span>
      </p>
      <HandoffReason testIdBase={testIdBase} reason={handoff.reason} />
      {/* Only claimed when the handoff genuinely carried newly passing evidence. */}
      {handoff.evidenceDelta > 0 ? (
        <p className="text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]">
          {`+${plural(handoff.evidenceDelta, 'passing evidence item')}`}
        </p>
      ) : null}
    </li>
  );
}

export function RunGraphView({ events }: RunGraphViewProps) {
  const model = buildRunGraph(events);

  if (model.kind === 'none') {
    return (
      <section
        data-testid="run-graph-view"
        aria-labelledby="run-graph-view-heading"
        className="flex flex-col gap-[var(--space-2)]"
      >
        <h2
          id="run-graph-view-heading"
          className="font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] font-[var(--font-weight-medium)] text-[var(--color-ink)]"
        >
          Execution shape
        </h2>
        {/* Two genuinely different facts, told apart rather than blurred into
            one "nothing here": a run with no events yet may still produce a
            shape, a run with events but no orchestration never will. */}
        <p
          data-testid="run-graph-view-empty"
          className="text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] text-[var(--color-ink-secondary)]"
        >
          {events.length === 0
            ? 'No runtime events for this run yet.'
            : `No Graph or Swarm structure was recorded for this run. Its ${plural(events.length, 'runtime event')} ${events.length === 1 ? 'is' : 'are all'} on the Timeline.`}
        </p>
      </section>
    );
  }

  const heading = model.kind === 'swarm' ? 'Strands Swarm' : 'Strands Graph';
  const summaryParts = [
    plural(model.nodeCount, 'node'),
    plural(model.stages.length, 'stage'),
    ...(model.handoffs.length > 0 ? [plural(model.handoffs.length, 'handoff')] : []),
  ];

  return (
    <section
      data-testid="run-graph-view"
      aria-labelledby="run-graph-view-heading"
      className="flex flex-col gap-[var(--space-3)]"
    >
      <div className="flex flex-col gap-[var(--space-0-5)]">
        <h2
          id="run-graph-view-heading"
          className="font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] font-[var(--font-weight-medium)] text-[var(--color-ink)]"
        >
          {heading}
        </h2>
        <p
          data-testid="run-graph-view-summary"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          {summaryParts.join(' · ')}
        </p>
      </div>

      {/* The stage grid reflows rather than needing to be wide, but a run with
          an unusually long node id must scroll here and never make the pane
          itself scroll -- the same self-contained pattern OptionBoardView and
          FindingsSheet use, including its keyboard-reachable region. */}
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Run stages -- scroll horizontally if a stage is wider than the pane"
      >
        <ol data-testid="run-graph-stages" className="flex flex-col gap-[var(--space-2)]">
          {model.stages.map((stage) => (
            <li
              key={stage.index}
              data-testid={`run-graph-stage-${stage.index}`}
              data-stage-index={String(stage.index)}
              className="flex flex-col gap-[var(--space-1)]"
            >
              <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                <span className="label-caps text-[var(--color-ink-muted)]">
                  {`Stage ${stage.index}`}
                </span>
                {/* The fan-out, stated in words as well as shown in the grid. */}
                {stage.nodes.length > 1 ? (
                  <span
                    data-testid={`run-graph-stage-${stage.index}-parallel`}
                    className="label-caps rounded-[var(--radius-pill)] px-[var(--space-2)] py-[var(--space-0-5)]"
                    style={{
                      color: 'var(--color-status-active-ink)',
                      backgroundColor: 'var(--color-status-active-bg)',
                    }}
                  >
                    {`${stage.nodes.length} in parallel`}
                  </span>
                ) : null}
              </div>
              {/* `min(100%, ...)` so the track can never be wider than the
                  pane itself: parallel nodes sit two-up at 390px and spread
                  further as the pane widens, but a very narrow container
                  collapses them to one column instead of overflowing. */}
              <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-[var(--space-1)]">
                {stage.nodes.map((node) => (
                  <StageNode key={`${node.nodeId}-${node.startSequence}`} node={node} />
                ))}
              </ul>
              {stage.index < model.stages.length ? (
                <span
                  aria-hidden="true"
                  className="text-center text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
                >
                  ↓
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>

      {model.handoffs.length > 0 ? (
        <div className="flex flex-col gap-[var(--space-1)]">
          <h3 className="label-caps text-[var(--color-ink-secondary)]">Handoffs</h3>
          <ol data-testid="run-graph-handoffs" className="flex flex-col gap-[var(--space-1)]">
            {model.handoffs.map((handoff, index) => (
              <HandoffItem key={handoff.eventId} handoff={handoff} index={index} />
            ))}
          </ol>
        </div>
      ) : null}

      {model.notices.length > 0 ? (
        <div className="flex flex-col gap-[var(--space-1)]">
          <h3 className="label-caps text-[var(--color-ink-secondary)]">Run-level events</h3>
          <ul data-testid="run-graph-notices" className="flex flex-col gap-[var(--space-1)]">
            {model.notices.map((notice, index) => {
              const tone = STATUS_TONE_META[NOTICE_TONE[notice.level]];
              return (
                <li
                  key={notice.eventId}
                  data-testid={`run-graph-notice-${index}`}
                  className="flex min-w-0 items-start gap-[var(--space-1)] rounded-[var(--radius-sm)] p-[var(--space-2)] text-[length:var(--font-size-sm)] leading-[var(--line-height-normal)] break-words"
                  style={{ backgroundColor: tone.bg, color: tone.ink }}
                >
                  <span aria-hidden="true">{tone.icon}</span>
                  <span className="min-w-0 break-words">{notice.summary}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
