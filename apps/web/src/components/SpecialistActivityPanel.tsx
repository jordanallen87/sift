/**
 * The consumer-facing view of the investigation *team*.
 *
 * `LiveRunStatus.tsx` reports the single most recent event of the latest
 * command, which is correct for what it claims but structurally cannot show
 * that six named specialists ran -- four of them genuinely at the same time.
 * A real Graph run finishes in roughly 300ms, so that one line shows each
 * specialist for about a millisecond and the multi-agent story, which is
 * real, stays invisible. This panel is the surface that makes it legible:
 * one durable row per specialist, each keeping its identity and its own
 * final state for the whole life of the run.
 *
 * ---------------------------------------------------------------------
 * The design rules this file implements, and where they come from. Please
 * read these before "improving" anything below -- several of the choices
 * look like omissions and are not.
 * ---------------------------------------------------------------------
 *
 * **1. Row grammar: state icon (left) - specialist name - one-line detail -
 * elapsed time (right-aligned).** Borrowed from Claude Code's own agent view
 * (code.claude.com/docs/en/agent-view), whose rows carry exactly this
 * information; Material 3's list guidance independently endorses trailing
 * text for "supplemental details, like a price, count, or date", which is
 * why the duration is right-aligned rather than inline after the name.
 *
 * At 390px -- the canonical narrow end of the ChatGPT right pane -- name +
 * state word + detail + duration does not fit on one physical line, so the
 * grammar is laid out over two: `[icon] name .......... duration` above
 * `[    ] State word - detail`. Every element of the grammar is present and
 * in order; only the wrap point differs.
 *
 * **2. NO LOADING AFFORDANCE. This is deliberate and load-bearing.** There
 * is no spinner, no shimmer, no pulse and no progress bar anywhere in this
 * file, and one must not be added. GitHub Primer states the rule directly:
 * "Less than 1 second: Don't show a loading state. Seeing a loading
 * indicator flash on the screen could be distracting and make the product
 * feel slower than it is." NN/g agrees ("For anything that takes less than 1
 * second to load, it is distracting to use a looped animation") and Material
 * 3 puts the instant threshold lower still ("Instant (under 200ms): Display
 * the content immediately"). A real run here is ~300ms end to end, so every
 * specialist row would flash an animation for a third of a second and then
 * throw it away. Rows appear and settle instead.
 *
 * Above 1s an indeterminate affordance would become allowed, and between
 * 3-10s a determinate one; neither threshold is reachable by these packs
 * today, so neither is built. `global.css`'s `.loading-pulse` exists for the
 * genuinely slow, network-bound waits elsewhere in the product and is
 * deliberately not used here.
 *
 * **3. Duration freezes on completion.** Anthropic's shipped rule for the
 * same surface: "a finished session's age freezes at how long the run took."
 * A finished row keeps its identity and reports its REAL measured duration
 * rather than animating or continuing to count. That falls out of the design
 * rather than being enforced: this component is pure, holds no timer, and
 * derives every duration from real events, so a completed row cannot change
 * unless the events do.
 *
 * A row that is still running shows NO elapsed time at all. There is nothing
 * real to report until the completion event arrives, and a live ticking
 * counter on a 300ms run would be precisely the loading affordance rule 2
 * forbids.
 *
 * **4. Collapse the routine, never the exceptional.** Clean completions may
 * fold into a `+N more` row; a specialist that failed, needs approval, was
 * denied, was skipped, is still running, or found a source conflict always
 * keeps its own row. Claude Code again: five idle teammates collapse to "2
 * idle agents", but "Working teammates, failed teammates... always keep
 * their own rows", and "Failures... always stay visible."
 *
 * **5. State is always a WORD.** The vocabulary is AI Elements' shipped
 * `Tool` component `statusLabels` -- `Running`, `Completed`, `Awaiting
 * Approval`, `Denied`, `Error` -- which crucially splits Denied (refused by
 * a policy or a person) from Error (it broke), plus `Skipped` for a node an
 * edge condition bypassed. Colour and icon are supplementary only; the word
 * is always rendered.
 *
 * **6. The parallelism line is gated.** "4 working at once" renders ONLY
 * when the largest genuinely concurrent wave this panel observed is >= 2.
 * The Choose Our Next Car Graph fans out four specialists at once, so it
 * earns the line. The Home Energy Guardian Swarm is strictly sequential
 * (`home-energy-swarm.ts` contains no concurrency primitive; Strands' own
 * docs describe Graph as "Deterministic & Parallel" and Swarm as
 * "Sequential & Autonomous"), so for that pack the line must never appear --
 * its story is handoffs, not fan-out. The gate is computed from the real
 * event stream rather than from a pack id, so it stays true if either
 * topology ever changes.
 *
 * **7. No private chain-of-thought, ever.** docs/engineering-principles.md: "Do not display
 * private chain-of-thought. Display actions, source-linked outputs,
 * validation reasons, handoffs, intervention reasons, and state changes."
 * Nothing here renders or invents reasoning text. There is deliberately no
 * "Thinking...", "Analyzing..." or "Thought for N seconds" treatment; Apple's
 * HIG independently forbids labelling an indicator with vague process words.
 * The detail line is either a fixed, factual description of what that
 * specialist's job *is* or a plain statement of a real state change.
 *
 * **8. Consumer phrasing, not developer phrasing.** The raw summaries on
 * these events are developer-phrased by design -- `car-purchase-graph.ts`'s
 * `emitGraphNodeEvent` writes `Graph node "safety-reliability-analyst"
 * started.` and `event-normalizer.ts` writes `Calling tool "listing_reader".`
 * -- because their first reader is the Runtime Inspector. None of them is
 * ever rendered here. `activity-labels.ts` is this codebase's designated
 * mapping layer for that boundary and its tone/icon vocabulary is reused
 * verbatim below (`STATUS_TONE_META`), but its table is keyed by
 * `PublicActivityEventType` while this panel needs one keyed by SPECIALIST
 * -- a different axis -- so the specialist names live here rather than being
 * bolted onto a shared file this panel is only one consumer of.
 */
import { useState, type ReactNode } from 'react';
import type { PublicActivityEvent } from '@sift/contracts';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

/**
 * AI Elements' `Tool` `statusLabels` vocabulary (`Running`, `Completed`,
 * `Awaiting Approval`, `Denied`, `Error`) plus `skipped`. The Denied/Error
 * split is the point of borrowing this particular vocabulary: "a safeguard
 * refused this" and "this broke" are different facts and a person acts on
 * them differently.
 *
 * `skipped` is added for a node an edge condition bypassed. Strands reports
 * that as `CANCELLED` (`@strands-agents/sdk`'s `ResultStatus`), and GitHub
 * Actions treats `skipped` as a real, first-class conclusion rather than a
 * flavour of success -- so it gets a word of its own instead of being
 * flattened into "Completed", which would claim work that never happened.
 */
export type SpecialistState =
  'running' | 'completed' | 'awaiting-approval' | 'denied' | 'skipped' | 'error';

/**
 * This live region is the whole of what a screen-reader user is told about
 * the panel, so "All 1 specialists finished." is not a cosmetic slip -- it
 * is the entire sentence, wrong. Home Energy Guardian's round 2 re-runs a
 * single specialist after a reweight and hit it every time.
 */
function pluraliseSpecialists(count: number): string {
  return count === 1 ? 'specialist' : 'specialists';
}

/** The always-rendered word for each state (design rule 5). */
const STATE_LABEL: Record<SpecialistState, string> = {
  running: 'Running',
  completed: 'Completed',
  'awaiting-approval': 'Awaiting approval',
  denied: 'Denied',
  skipped: 'Skipped',
  error: 'Error',
};

/**
 * Each state reuses one of `docs/design-system.md`'s nine existing status
 * tones through `activity-labels.ts`'s `STATUS_TONE_META`, rather than
 * inventing a tenth colour vocabulary for this one panel. The pairings
 * follow the ones `activity-labels.ts` already makes for the same real
 * events: `intervention.confirmation_required` is `ready`, `draft.withheld`
 * is `blocked`, a live step is `active`, a finished one is `satisfied`.
 * `skipped` takes `neutral` -- design-system.md's "no status color --
 * nothing has happened yet" row -- because nothing did.
 */
const STATE_TONE: Record<SpecialistState, StatusTone> = {
  running: 'active',
  completed: 'satisfied',
  'awaiting-approval': 'ready',
  denied: 'blocked',
  skipped: 'neutral',
  error: 'error',
};

/** States that must never fold into `+N more` (design rule 4). A clean completion is the only routine outcome. */
const ALWAYS_VISIBLE_STATES: ReadonlySet<SpecialistState> = new Set<SpecialistState>([
  'running',
  'awaiting-approval',
  'denied',
  'skipped',
  'error',
]);

interface SpecialistIdentity {
  /** What a person calls this specialist. Short enough to sit beside a duration at 390px. */
  readonly name: string;
  /** One factual line about what this specialist's job is -- never what it is "thinking" (design rule 7). */
  readonly role: string;
}

/**
 * Consumer names for every specialist both hero packs actually run, derived
 * from each one's real declared role: `car-purchase-graph.ts`'s
 * `SPECIALIST_ROLE_DESCRIPTIONS` / `buildSourceChallengerRoleDescription` /
 * `buildDecisionSynthesizerSystemPrompt`, and `home-energy-swarm.ts`'s
 * `SWARM_ROLE_FALLBACK`. Each name still names the real specialist -- a
 * person reading "Cost to own" and a developer reading
 * `ownership-cost-analyst` are looking at the same node -- but drops the
 * `-analyst` engine suffix and the internal hyphenation.
 *
 * `decision-synthesizer` is deliberately "Recommendation", never "Decision"
 * or "Final call": the deterministic core and the human own the decision
 * (docs/engineering-principles.md: "The model may propose candidate events and recommendations.
 * It may never approve a consequential decision."), so a row title claiming
 * otherwise would be a false claim about authority, not just a wording
 * choice.
 */
const SPECIALIST_IDENTITIES: Record<string, SpecialistIdentity> = {
  // --- Choose Our Next Car (Strands Graph: four in parallel, then challenge, then synthesis) ---
  'deal-analyst': { name: 'Deal and price', role: 'Out-the-door price and dealer terms' },
  'ownership-cost-analyst': { name: 'Cost to own', role: 'Five-year running costs' },
  'safety-reliability-analyst': {
    name: 'Safety and reliability',
    role: 'Ratings from independent sources',
  },
  'household-fit-analyst': { name: 'Household fit', role: 'Cargo, rear seats and comfort' },
  // --- Home Energy Guardian (Strands Swarm: strictly sequential handoffs) ---
  'anomaly-investigator': { name: 'Bill anomaly', role: 'Whether this bill is genuinely unusual' },
  'rate-analyst': { name: 'Rate change', role: 'How much the new tariff explains' },
  'weather-analyst': { name: 'Weather', role: 'How much the weather explains' },
  'home-systems-analyst': { name: 'Home systems', role: 'Appliance and household events' },
  // --- Shared by both packs ---
  'source-challenger': { name: 'Source check', role: 'Challenges weak or conflicting sources' },
  'decision-synthesizer': { name: 'Recommendation', role: 'Brings every finding into one answer' },
};

/**
 * A specialist this build has no entry for -- a user-authored pack's own
 * node, or one added after this build shipped. The id is humanized (hyphens
 * and underscores to spaces, first letter capitalized) rather than rendered
 * raw, so `custom-tax-analyst` reads as "Custom tax analyst" instead of a
 * dotted internal token. No role line is invented: this build genuinely does
 * not know what that specialist does, and guessing would be exactly the
 * fabrication rule 7 forbids.
 */
function identityFor(agentId: string): SpecialistIdentity {
  const known = SPECIALIST_IDENTITIES[agentId];
  if (known !== undefined) {
    return known;
  }
  const humanized = agentId.replace(/[-_]+/g, ' ').trim();
  const initial = humanized.slice(0, 1).toUpperCase();
  return { name: initial.length > 0 ? initial + humanized.slice(1) : agentId, role: '' };
}

/**
 * Plain statements of a real state change, used in place of the role line
 * when something exceptional happened. Every one describes an action, an
 * intervention outcome or a state change -- never reasoning. "Draft
 * withheld" is the exact required copy from
 * `docs/specs/value-proposition.md`, matching `activity-labels.ts`'s own
 * label for the same real event.
 */
const EXCEPTION_DETAIL: Partial<Record<SpecialistState, string>> = {
  'awaiting-approval': 'Needs your go-ahead before it continues',
  denied: 'Draft withheld',
  skipped: 'Not needed for this run',
  error: 'Stopped before it finished',
};

/**
 * Strands' real `ResultStatus` values (`@strands-agents/sdk`'s
 * `multiagent/state`: `COMPLETED | FAILED | CANCELLED | INTERRUPTED`)
 * mapped onto the state vocabulary above.
 *
 * `INTERRUPTED` maps to `denied`, not `error`: the SDK returns it when "a
 * hook gates the node" (`multiagent/graph.d.ts`), which in this codebase is
 * an intervention refusing to let the node proceed. That is exactly the
 * distinction the AI Elements vocabulary exists to preserve -- refused is
 * not broken -- so collapsing it into `error` would throw away the reason we
 * borrowed a vocabulary carrying both words.
 */
const NODE_STATUS_STATE: Record<string, SpecialistState> = {
  COMPLETED: 'completed',
  FAILED: 'error',
  CANCELLED: 'skipped',
  INTERRUPTED: 'denied',
};

/**
 * Reads the node's real result status off a `specialist.completed` event.
 *
 * `safeDetails.status` is preferred and is where a structured value belongs.
 * The fallback parses the literal summary template
 * `car-purchase-graph.ts`/`home-energy-swarm.ts` emit today -- `Graph node
 * "deal-analyst" completed with status "COMPLETED".` -- because that string
 * is currently the ONLY carrier of the distinction between a node that
 * finished, one that failed and one an edge condition skipped. Parsing a
 * summary is not something to be proud of; it is chosen over the alternative
 * of silently reporting a failed node as "Completed", which would be a false
 * claim on the consumer surface. If the template ever stops matching, the
 * row degrades to the plain completion the event itself asserts rather than
 * guessing.
 */
function readNodeStatus(event: PublicActivityEvent): string | undefined {
  const structured = event.safeDetails?.['status'];
  if (typeof structured === 'string' && structured.length > 0) {
    return structured.toUpperCase();
  }
  const parsed = /completed with status "([^"]+)"/i.exec(event.summary);
  const captured = parsed?.[1];
  return captured === undefined ? undefined : captured.toUpperCase();
}

/**
 * The node's real measured duration, or `undefined` when nothing genuinely
 * measured it.
 *
 * `safeDetails.durationMs` is authoritative when present. When it is absent
 * -- which it is on node events in the current build -- the observed gap
 * between this specialist's own real start and completion events is used
 * instead. That gap is a real streamed measurement (`car-purchase-graph.ts`
 * hands each event to the consumer the moment its hook fires rather than
 * draining the queue after the invocation resolves), not a fabricated timer.
 *
 * A non-positive result returns `undefined` rather than "0ms": under a
 * deterministic fixture clock every event in a run can carry the identical
 * timestamp, and a zero gap there means "not measurable", not "instant".
 * Reporting an unknown as a real zero is the specific dishonesty this guard
 * exists to prevent.
 */
function readDurationMs(
  startedEvent: PublicActivityEvent | undefined,
  finishedEvent: PublicActivityEvent | undefined,
): number | undefined {
  if (finishedEvent === undefined) {
    return undefined;
  }
  const structured = finishedEvent.safeDetails?.['durationMs'];
  if (typeof structured === 'number' && Number.isFinite(structured) && structured > 0) {
    return structured;
  }
  if (startedEvent === undefined) {
    return undefined;
  }
  const startedAt = Date.parse(startedEvent.timestamp);
  const finishedAt = Date.parse(finishedEvent.timestamp);
  if (Number.isNaN(startedAt) || Number.isNaN(finishedAt)) {
    return undefined;
  }
  const elapsed = finishedAt - startedAt;
  return elapsed > 0 ? elapsed : undefined;
}

/** Sub-second durations are the normal case here (a whole run is ~300ms), so milliseconds are the base unit rather than an edge case. */
export function formatSpecialistDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  if (durationMs < 60_000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  const totalSeconds = Math.round(durationMs / 1000);
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

/** One specialist's whole story, derived from real events only. */
export interface SpecialistRow {
  readonly agentId: string;
  readonly name: string;
  readonly state: SpecialistState;
  /** The one-line detail: a real state change when something exceptional happened, otherwise this specialist's factual role. */
  readonly detail: string;
  /** True when a real `evidence.conflicted` event was attributed to this specialist. Pins the row open regardless of state (design rule 4). */
  readonly foundConflict: boolean;
  /** Real measured duration. Absent when nothing measured it, or while the row is still running. */
  readonly durationMs?: number;
  /** How many lookups this specialist actually started (`tool.started`). Zero when it made none. */
  readonly lookupCount: number;
  /** `sequence` of this specialist's first event. Used only for stable run-order sorting. */
  readonly firstSequence: number;
}

interface SpecialistAccumulator {
  agentId: string;
  started?: PublicActivityEvent;
  finished?: PublicActivityEvent;
  lastConfirmationSequence?: number;
  denied: boolean;
  errored: boolean;
  foundConflict: boolean;
  lookupCount: number;
  /** How many `Guide` interventions redirected this specialist mid-run. */
  redirectCount: number;
  firstSequence: number;
}

export interface SpecialistActivityDerivation {
  readonly rows: readonly SpecialistRow[];
  /**
   * The largest number of specialists observed running at the same moment:
   * `1` for a sequential Swarm, `4` for the car Graph's parallel branch.
   * Gates the parallelism line (design rule 6).
   */
  readonly maxConcurrency: number;
}

/**
 * Turns a real `PublicActivityEvent` stream into one row per specialist.
 * Pure: same events in, same panel out, no clock and no fetching.
 *
 * Only an event carrying an `agentId` can be attributed to a specialist, and
 * a row is created only by a real `specialist.started`/`specialist.completed`
 * event. Everything else (a tool call, an intervention, a conflict) attaches
 * to a row that already exists. That rule is what keeps this panel honest:
 * it lists the specialists the run actually reported and never conjures one
 * out of an adjacent event.
 */
export function deriveSpecialistActivity(
  events: readonly PublicActivityEvent[],
  runId?: string,
): SpecialistActivityDerivation {
  const scoped = events
    .filter((event) => runId === undefined || event.runId === runId)
    .slice()
    .sort((a, b) => a.sequence - b.sequence);

  const byAgent = new Map<string, SpecialistAccumulator>();
  const ensure = (agentId: string, sequence: number): SpecialistAccumulator => {
    const existing = byAgent.get(agentId);
    if (existing !== undefined) {
      return existing;
    }
    const created: SpecialistAccumulator = {
      agentId,
      denied: false,
      errored: false,
      foundConflict: false,
      lookupCount: 0,
      redirectCount: 0,
      firstSequence: sequence,
    };
    byAgent.set(agentId, created);
    return created;
  };

  for (const event of scoped) {
    const agentId = event.agentId;
    if (agentId === undefined) {
      continue;
    }
    // Only the two node events may CREATE a row (see doc comment); every
    // other type attaches to one that already exists.
    if (event.type === 'specialist.started') {
      const row = ensure(agentId, event.sequence);
      row.started ??= event;
      continue;
    }
    if (event.type === 'specialist.completed') {
      ensure(agentId, event.sequence).finished = event;
      continue;
    }
    const row = byAgent.get(agentId);
    if (row === undefined) {
      continue;
    }
    switch (event.type) {
      case 'tool.started':
        row.lookupCount += 1;
        break;
      case 'tool.failed':
      case 'run.failed':
        row.errored = true;
        break;
      case 'intervention.confirmation_required':
        row.lastConfirmationSequence = event.sequence;
        break;
      case 'intervention.guided':
        row.redirectCount += 1;
        break;
      case 'draft.withheld':
        row.denied = true;
        break;
      case 'evidence.conflicted':
        row.foundConflict = true;
        break;
      default:
        break;
    }
  }

  const rows: SpecialistRow[] = [...byAgent.values()]
    .filter((row) => row.started !== undefined || row.finished !== undefined)
    .map((row) => {
      const nodeStatus = row.finished === undefined ? undefined : readNodeStatus(row.finished);
      const statusState =
        nodeStatus === undefined ? undefined : (NODE_STATUS_STATE[nodeStatus] ?? 'completed');

      // An outstanding approval only outranks a completion while it is
      // genuinely still outstanding: a confirmation the node then finished
      // past has already been answered.
      const approvalOutstanding =
        row.lastConfirmationSequence !== undefined &&
        (row.finished === undefined || row.lastConfirmationSequence > row.finished.sequence);

      // Worst news first, so a row never reports a milder state than the
      // real events support -- with one exception, which the node itself
      // settles.
      //
      // A `tool.failed` inside a specialist that then finished is a
      // RECOVERED failure, not a broken specialist. Home Energy Guardian
      // does this on every run: a `RetrySteering` intervention catches
      // `weather-analyst` repeating a query family, the redirected lookup
      // fails as a direct result, and the node then recovers and completes.
      // Reporting that as "Error -- Stopped before it finished" told a
      // viewer the product had fallen over at the exact moment it was
      // demonstrating governance working, and it was also just false: the
      // specialist did finish.
      //
      // So a failed tool only decides the row's state while the node has
      // not reported one of its own. Once it has, Strands' own `ResultStatus`
      // is the authority on whether that node failed.
      const nodeFailed = statusState === 'error';
      const unresolvedToolFailure = row.errored && row.finished === undefined;
      // A withheld draft is recoverable in exactly the way a failed tool
      // call is: `GoalLoop` refuses an unsupported draft, the specialist
      // retries with citations, and the corrected one is accepted. Leaving
      // the row on "Denied" afterwards described the specialist by the
      // attempt it abandoned rather than the answer it delivered -- with
      // the accepted recommendation rendered directly above it.
      const unresolvedDenial = row.denied && row.finished === undefined;

      let state: SpecialistState;
      if (nodeFailed || unresolvedToolFailure) {
        state = 'error';
      } else if (approvalOutstanding) {
        state = 'awaiting-approval';
      } else if (unresolvedDenial || statusState === 'denied') {
        state = 'denied';
      } else if (statusState === 'skipped') {
        state = 'skipped';
      } else if (row.finished !== undefined) {
        state = 'completed';
      } else {
        state = 'running';
      }

      const identity = identityFor(row.agentId);
      const exception = EXCEPTION_DETAIL[state];
      const detailParts: string[] = [];
      if (exception !== undefined) {
        detailParts.push(exception);
      } else if (identity.role.length > 0) {
        detailParts.push(identity.role);
      }
      if (row.foundConflict) {
        detailParts.push('Sources disagree');
      } else if (exception === undefined && row.redirectCount > 0) {
        // A `Guide` intervention redirected this specialist mid-run. That is
        // strictly more interesting than how many lookups it made, and
        // saying it plainly is what turns a recovered failure from something
        // that looks like a fault into what it is: the supervision working.
        detailParts.push(
          row.redirectCount === 1
            ? 'Redirected once'
            : `Redirected ${String(row.redirectCount)} times`,
        );
      } else if (exception === undefined && row.lookupCount > 0) {
        // Only on an otherwise unremarkable row: on an exceptional one the
        // reason matters more than the tally, and three clauses do not fit
        // at 390px. `tool.started` is the same real event
        // `activity-labels.ts` labels "Looking something up", so the noun
        // matches what the timeline calls the same moment.
        detailParts.push(row.lookupCount === 1 ? '1 lookup' : `${row.lookupCount} lookups`);
      }

      const durationMs = readDurationMs(row.started, row.finished);
      return {
        agentId: row.agentId,
        name: identity.name,
        state,
        detail: detailParts.join(' · '),
        foundConflict: row.foundConflict,
        ...(durationMs !== undefined ? { durationMs } : {}),
        lookupCount: row.lookupCount,
        firstSequence: row.firstSequence,
      };
    })
    .sort((a, b) => a.firstSequence - b.firstSequence);

  // --- Largest concurrent wave (design rule 6) ---
  // A sweep over the real start/finish events in sequence order. Sequence is
  // monotonic within a run and parallel nodes genuinely interleave their
  // events, so overlapping intervals here mean overlapping execution -- and
  // a strictly sequential Swarm (start, finish, start, finish) can never
  // exceed 1, which is exactly why the line stays off for Home Energy.
  let concurrent = 0;
  let maxConcurrency = 0;
  for (const event of scoped) {
    if (event.agentId === undefined) {
      continue;
    }
    if (event.type === 'specialist.started') {
      concurrent += 1;
      maxConcurrency = Math.max(maxConcurrency, concurrent);
    } else if (event.type === 'specialist.completed') {
      concurrent = Math.max(0, concurrent - 1);
    }
  }

  return { rows, maxConcurrency };
}

export interface SpecialistActivityPanelProps {
  /** Every `PublicActivityEvent` streamed this session -- the same type `LiveRunStatus` consumes. The panel selects the specialist-attributed ones itself. */
  events: PublicActivityEvent[];
  /** Restrict the panel to a single run. Omit to show every specialist across every run present in `events`. */
  runId?: string;
  /**
   * How many cleanly-completed rows stay expanded before the rest fold into
   * `+N more`. Defaults to 6, which is exactly the team size of both hero
   * packs -- so in the demo nothing collapses and the whole team stays
   * legible, which is the entire point of this panel. The fold is a real
   * safety valve for a pack reporting more specialists than that, not a
   * default state.
   */
  maxVisibleCompleted?: number;
}

const DEFAULT_MAX_VISIBLE_COMPLETED = 6;

export function SpecialistActivityPanel({
  events,
  runId,
  maxVisibleCompleted = DEFAULT_MAX_VISIBLE_COMPLETED,
}: SpecialistActivityPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const { rows, maxConcurrency } = deriveSpecialistActivity(events, runId);

  // ADR 0004 / the audit's "eleven regions that rendered a full card whose
  // only content was an announcement of its own emptiness": an empty
  // conceptual region is ABSENT, not a card saying it is empty. The caller
  // mounts this unconditionally and lets it decide its own visibility -- the
  // same contract `LiveRunStatus`/`ApprovalCard`/`RecommendationCard` use.
  if (rows.length === 0) {
    return null;
  }

  // Folding keeps the MOST RECENT clean completions and folds the oldest:
  // in both hero topologies the later specialists (source check, then the
  // recommendation) are the ones the earlier ones feed into, so their
  // outcome is what a person is still catching up on.
  const foldable = rows.filter(
    (row) => !ALWAYS_VISIBLE_STATES.has(row.state) && !row.foundConflict,
  );
  const foldedIds = new Set(
    foldable.slice(0, Math.max(0, foldable.length - maxVisibleCompleted)).map((row) => row.agentId),
  );
  const firstFoldedIndex = rows.findIndex((row) => foldedIds.has(row.agentId));

  const runningCount = rows.filter((row) => row.state === 'running').length;
  const finishedCount = rows.length - runningCount;
  const showParallelism = maxConcurrency >= 2;

  const items: ReactNode[] = [];
  rows.forEach((row, index) => {
    if (index === firstFoldedIndex && foldedIds.size > 0) {
      items.push(
        <li key="specialist-activity-more">
          <button
            type="button"
            data-testid="specialist-activity-more"
            aria-expanded={expanded}
            aria-controls="specialist-activity-rows"
            onClick={() => {
              setExpanded((current) => !current);
            }}
            // A real 44px hit area (docs/design-system.md "Touch targets",
            // `--size-touch-target-min`) even though the label itself is
            // small type. Expressed through the token rather than a fixed
            // class so the number has one source.
            style={{ minHeight: 'var(--size-touch-target-min)' }}
            className="flex w-full items-center rounded-[var(--radius-sm)] px-[var(--space-1)] text-left text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
          >
            <span aria-hidden="true">{expanded ? 'Show fewer' : `+${foldedIds.size} more`}</span>
            <span className="visually-hidden">
              {expanded
                ? 'Show fewer specialists'
                : `Show ${foldedIds.size} more specialists that finished cleanly`}
            </span>
          </button>
        </li>,
      );
    }
    if (foldedIds.has(row.agentId) && !expanded) {
      return;
    }
    const tone = STATUS_TONE_META[STATE_TONE[row.state]];
    items.push(
      <li
        key={row.agentId}
        data-testid="specialist-row"
        data-specialist-id={row.agentId}
        data-state={row.state}
        className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-[var(--space-2)] gap-y-[var(--space-0-5)] rounded-[var(--radius-sm)] px-[var(--space-1)] py-[var(--space-1)]"
      >
        {/* Decorative only. The state is carried by the word below and by
            `data-state`; the icon never carries it alone (rule 5), and it is
            a static glyph, never an animated one (rule 2). */}
        <span
          aria-hidden="true"
          className="row-span-2 text-[length:var(--font-size-sm)]"
          style={{ color: tone.ink }}
        >
          {tone.icon}
        </span>
        <span
          data-testid="specialist-row-name"
          className="min-w-0 text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
        >
          {row.name}
        </span>
        {row.durationMs === undefined ? null : (
          <span
            data-testid="specialist-row-duration"
            className="justify-self-end text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)] tabular-nums"
          >
            <span className="visually-hidden">Took </span>
            {formatSpecialistDuration(row.durationMs)}
          </span>
        )}
        <p className="col-span-2 col-start-2 min-w-0 text-[length:var(--font-size-2xs)] text-[var(--color-ink-muted)]">
          <span data-testid="specialist-row-state" style={{ color: tone.ink }}>
            {STATE_LABEL[row.state]}
          </span>
          {row.detail.length > 0 ? (
            <span data-testid="specialist-row-detail"> · {row.detail}</span>
          ) : null}
        </p>
      </li>,
    );
  });

  return (
    <section
      data-testid="specialist-activity-panel"
      aria-labelledby="specialist-activity-heading"
      className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] bg-muted p-[var(--space-3)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-[var(--space-2)]">
        <h3
          id="specialist-activity-heading"
          className="label-caps text-[var(--color-ink-secondary)]"
        >
          Investigation team
        </h3>
        {showParallelism ? (
          <p
            data-testid="specialist-activity-parallelism"
            className="text-[length:var(--font-size-xs)] tabular-nums text-[var(--color-ink-muted)]"
          >
            {/* Present tense only while somebody genuinely still is. Once the
                run is over the same fact is true in the past tense, and
                leaving it in the present would be a small live lie on a
                surface whose entire claim is that it reports real state. */}
            {runningCount > 0
              ? `${maxConcurrency} working at once`
              : `${maxConcurrency} worked at once`}
          </p>
        ) : null}
      </div>

      {/* The only announcement channel for this panel. Individual rows are
          NOT live regions: six specialists finishing inside ~300ms would
          machine-gun a screen reader with interruptions nobody can follow,
          so one polite, atomic summary coalesces them instead. It states
          only counts it actually observed -- never "N of 6", since the panel
          cannot know the team's full size until every member has reported. */}
      <p
        data-testid="specialist-activity-live"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="visually-hidden"
      >
        {runningCount > 0
          ? `${finishedCount} ${pluraliseSpecialists(finishedCount)} finished, ${runningCount} still working.`
          : `All ${finishedCount} ${pluraliseSpecialists(finishedCount)} finished.`}
      </p>

      <ol
        id="specialist-activity-rows"
        data-testid="specialist-activity-rows"
        className="flex flex-col gap-[var(--space-1)]"
      >
        {items}
      </ol>
    </section>
  );
}
