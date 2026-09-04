/**
 * The real, code-driven car-purchase Strands `Graph`
 * (docs/specs/strands-runtime.md "Orchestration": "The two synthesis
 * moments use a programmatically constructed Strands Graph ... Graph
 * construction is code-driven from validated compiled pack declarations.
 * The model does not generate executable graph definitions."):
 *
 * ```text
 * deal-analyst + ownership-cost-analyst ─┐
 *                                        ├─> source-challenger ─> decision-synthesizer
 * safety-reliability-analyst + household-fit-analyst ┘
 * ```
 *
 * Every node is a real Strands `Agent`. The four parallel specialists and
 * `source-challenger` are each wired through the exact same composition
 * `strands-adapter.ts`'s single-agent `execute()` uses for one obligation
 * move (`AgentSkills`, a per-node `ContextInjector`, the same six ordered
 * `InterventionHandler`s, and `structuredOutputSchema: ExecutionResultSchema`
 * so each node's final answer is a genuinely SDK-validated `ExecutionResult`,
 * not hand-parsed text) -- multiplied across six real `Agent` instances
 * inside one real `Graph` instead of one. `decision-synthesizer` reuses
 * `plugins.ts`'s already-built, isolated `Agent` + `GoalLoop` pair verbatim
 * (`buildDecisionSynthesizerAgent`), per this task's explicit instruction
 * and strands-runtime.md's "GoalLoop output validation": "only one
 * `GoalLoop` is supported per agent ... `decision-synthesizer` is therefore
 * constructed as its own distinct `Agent` instance."
 *
 * Real `Graph` dependency resolution is AND-semantics (verified directly
 * against the installed `@strands-agents/sdk@1.14.0` package -- see this
 * task's dated docs/build-log.md entry): `source-challenger` only becomes
 * eligible to start once every one of its four incoming edges' sources has
 * genuinely COMPLETED, which is exactly what proves "the Graph runs deal,
 * ownership-cost, safety/reliability, and household-fit specialists before
 * source challenge and synthesis" (docs/specs/demos-and-submission.md).
 * `car-purchase-graph.test.ts` asserts this real ordering from the Graph's
 * own `BeforeNodeCallEvent`/`NodeResultEvent` hooks, not merely a final
 * result.
 *
 * Documented, real API limitation this file works around (see
 * `buildDecisionSynthesizerAgent`'s own signature in `plugins.ts`, read-only
 * reference): `DecisionSynthesizerConfig` has no `plugins` field -- the
 * function always hardcodes `plugins: [goalLoop]` internally, so
 * `decision-synthesizer` cannot also receive `AgentSkills`/`ContextInjector`
 * through it. `decision-synthesizer` therefore emits no `skill.activated` or
 * `context.injected` event in this Graph (the four parallel specialists and
 * `source-challenger` all do); its `systemPrompt` bakes in the case-summary
 * facts a Context Injector would otherwise have supplied, as the closest
 * honest substitute available without modifying the read-only file.
 */
import { join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import {
  Agent,
  AfterModelCallEvent,
  AfterToolCallEvent,
  BeforeModelCallEvent,
  BeforeToolCallEvent,
  type BaseModelConfig,
  type InterventionHandler,
  type JSONValue,
  type Model,
  type TextBlock,
  type ToolList,
} from '@strands-agents/sdk';
import {
  Graph,
  BeforeNodeCallEvent,
  NodeResultEvent,
  type MultiAgentResult,
} from '@strands-agents/sdk/multiagent';
import type { Validator } from '@strands-agents/sdk/vended-plugins/goal';
import type { Clock, IdGenerator } from '@sift/core';
import {
  ExecutionResultSchema,
  type CompiledDecisionPack,
  type ExecutionRequest,
  type ExecutionResult,
  type RuntimeDebugEvent,
} from '@sift/contracts';
import {
  buildCarPurchaseFixtureTools,
  PROPOSE_RECOMMENDATION_TOOL_ID,
  SDK_INTERNAL_TOOL_NAMES,
} from './strands-adapter.js';
import {
  BudgetGuard,
  ConsequenceGuard,
  EvidenceQualitySteering,
  OutputSanitizer,
  RetrySteering,
  ScopeAuthorization,
  ToolLedger,
  type InterventionEvent,
} from './interventions.js';
import {
  buildContextInjector,
  buildDecisionSynthesizerAgent,
  buildSkillsPlugin,
} from './plugins.js';
import {
  createRuntimeMetricsTracker,
  createSequenceCounter,
  normalizeAfterModelCall,
  normalizeAfterToolCall,
  normalizeBeforeModelCall,
  normalizeBeforeToolCall,
  normalizeGoalValidation,
  normalizeIntervention,
  normalizeSkillActivation,
  type NormalizerContext,
  type RuntimeEvent,
} from './event-normalizer.js';
import { RuntimeEventQueue } from './runtime-event-queue.js';

/** Every specialist id the four-wide parallel branch of the Graph runs before `source-challenger` (strands-runtime.md "Orchestration" topology). */
export const CAR_PURCHASE_PARALLEL_SPECIALIST_IDS = [
  'deal-analyst',
  'ownership-cost-analyst',
  'safety-reliability-analyst',
  'household-fit-analyst',
] as const;
export type CarPurchaseParallelSpecialistId = (typeof CAR_PURCHASE_PARALLEL_SPECIALIST_IDS)[number];

/** Every node id in this Graph, in the compiled car-purchase pack's `specialists[]` declaration order. */
export const CAR_PURCHASE_GRAPH_NODE_IDS = [
  ...CAR_PURCHASE_PARALLEL_SPECIALIST_IDS,
  'source-challenger',
  'decision-synthesizer',
] as const;
export type CarPurchaseGraphNodeId = (typeof CAR_PURCHASE_GRAPH_NODE_IDS)[number];

export interface CarPurchaseGraphDeps {
  /** The validated, compiled `car-purchase` pack. Node tool grants come from `pack.specialists[].allowedTools` -- code-driven, never hand-duplicated. */
  pack: CompiledDecisionPack;
  /**
   * Selects the model each node's `Agent` uses. A distinct
   * `ScriptedModelProvider` instance per node (rather than one shared
   * instance with a single mutable "current beat") is required for
   * deterministic tests: the Graph runs the four parallel specialists
   * concurrently (`maxConcurrency` up to 4), and `ScriptedModelProvider`'s
   * `setBeat` is one mutable field on the instance -- concurrent nodes
   * sharing one instance would race. Per-node isolation sidesteps this
   * entirely regardless of concurrency.
   */
  modelFor: (nodeId: CarPurchaseGraphNodeId) => Model<BaseModelConfig> | string;
  skillsRootDir: string;
  clock: Clock;
  idGenerator: IdGenerator;
  /** One `ExecutionRequest` per parallel specialist, each carrying that specialist's own active obligation (car.deal_normalization / car.ownership_cost / car.safety_reliability / car.household_fit). */
  specialistRequests: Record<CarPurchaseParallelSpecialistId, ExecutionRequest>;
  /** `source-challenger`'s Context Injector request, and the case-summary facts baked into `decision-synthesizer`'s system prompt (see module header). Obligation is normally `car.shortlist`. */
  shortlistRequest: ExecutionRequest;
  /** Defaults to `[PROPOSE_RECOMMENDATION_TOOL_ID]` -- the pack's one consequential effect. */
  consequentialToolIds?: readonly string[];
  forbiddenToolIds?: readonly string[];
  /** Deterministic fixture-mode confirmation resolver for `ConsequenceGuard`. See `strands-adapter.ts`. */
  resolveConfirmation?: (toolName: string, input: JSONValue) => JSONValue | undefined;
  /** Overrides `decision-synthesizer`'s system prompt. Defaults to a prompt built from `shortlistRequest`. */
  decisionSynthesizerSystemPrompt?: string;
  /** Overrides `decision-synthesizer`'s `GoalLoop` validator. Defaults to requiring a non-empty, source-cited response (the same shape `STUB_RECOMMENDATION_VALIDATOR` checks, duplicated here as a documented default rather than importing a name explicitly called a "stub" into production graph-building code). */
  decisionSynthesizerValidator?: Validator;
  /** Overrides the shared `graph.invoke()` input. Every node builds its own instructions from its own `ExecutionRequest`'s injected context, so this text only needs to identify the run at a high level. */
  invokePrompt?: string;
  /** Overrides `GoalLoop.maxAttempts`. Defaults to `2` (strands-runtime.md "GoalLoop output validation"). */
  goalLoopMaxAttempts?: number;
  /**
   * Elapsed-millisecond source used only to measure real model/tool call
   * and per-node durations for `RuntimeDebugEvent.durationMs`. Defaults to
   * wall-clock `Date.now`. `Clock` is not reused here: it returns ISO
   * business timestamps for case events, while this is a monotonic interval
   * source for telemetry that a test can advance deterministically.
   */
  nowMs?: () => number;
}

/** `goalLoop.lastResult(agent)`'s shape, re-declared narrowly here so this module does not need to import the SDK's own (unexported-by-name) GoalLoop result type. `attempt` is the real plugin's 1-indexed `GoalAttempt.attempt` (`vended-plugins/goal/plugin.d.ts`), previously omitted from this declaration even though the SDK always supplies it. */
export interface CarPurchaseGoalLoopResult {
  readonly passed: boolean;
  readonly stopReason: string;
  readonly attempts: readonly { attempt: number; passed: boolean; feedback?: string }[];
}

export interface CarPurchaseGraphResult {
  readonly multiAgentResult: MultiAgentResult;
  /** Node ids in the order their `BeforeNodeCallEvent` fired (real Graph scheduling order). */
  readonly nodeStartOrder: string[];
  /** Node ids in the order their `NodeResultEvent` fired (real Graph completion order). */
  readonly nodeFinishOrder: string[];
  /** The validated `ExecutionResult` each of the five `ExecutionResultSchema`-producing nodes (four parallel specialists + `source-challenger`) returned. */
  readonly executionResults: Partial<Record<string, ExecutionResult>>;
  /** `decision-synthesizer`'s final GoalLoop-validated response text. */
  readonly decisionSynthesizerText: string;
  /** The `propose_recommendation` tool call `decision-synthesizer` made, captured from its `beforeToolCall` hook -- undefined if it never called the tool. */
  readonly proposedRecommendation: { candidateIds: string[]; rationale: string } | undefined;
  readonly goalLoopResult: CarPurchaseGoalLoopResult | undefined;
}

const DEFAULT_VALIDATOR: Validator = (response) => {
  const text = response.content
    .filter((block): block is TextBlock => block.type === 'textBlock')
    .map((block) => block.text)
    .join('\n');
  if (text.trim().length === 0) {
    return {
      passed: false,
      feedback: 'The recommendation must include text explaining the decision.',
    };
  }
  if (!/\bsource-[a-z0-9-]+\b/i.test(text)) {
    return {
      passed: false,
      feedback: 'The recommendation must cite at least one source id (e.g. "source-...").',
    };
  }
  return { passed: true };
};

function filterToolsByName(tools: ToolList, allowedNames: readonly string[]): ToolList {
  return tools.filter((entry) => 'name' in entry && allowedNames.includes(entry.name));
}

/** `pack.specialists[].allowedTools` for `nodeId`, code-driven from the compiled pack (never hand-duplicated) -- strands-runtime.md "Orchestration": "Graph construction is code-driven from validated compiled pack declarations." */
function specialistAllowedTools(pack: CompiledDecisionPack, nodeId: string): string[] {
  const specialist = pack.specialists.find((entry) => entry.id === nodeId);
  if (specialist === undefined) {
    throw new Error(
      `car-purchase-graph: compiled pack "${pack.identity.id}@${pack.identity.version}" declares no specialist "${nodeId}"`,
    );
  }
  return [...specialist.allowedTools];
}

function buildSystemPrompt(
  nodeId: string,
  request: ExecutionRequest,
  roleDescription: string,
): string {
  return [
    `You are "${nodeId}", a Sift Strands specialist in the "${request.pack.id}@${request.pack.version}" Graph. ${roleDescription}`,
    `Active obligation: "${request.obligation.id}" -- ${request.obligation.question}`,
    'Use only the tools made available to you. Cite a source id for every claim.',
    'When you have gathered enough evidence, call the structured output tool with a complete ExecutionResult.',
  ].join('\n');
}

function buildInvokePrompt(request: ExecutionRequest): string {
  return `Investigate obligation "${request.obligation.id}" for case "${request.caseId}": ${request.obligation.question}`;
}

const SPECIALIST_ROLE_DESCRIPTIONS: Record<CarPurchaseParallelSpecialistId, string> = {
  'deal-analyst':
    'Analyze normalized listing and dealer-offer terms to compute comparable out-the-door price and evaluate hard-constraint and teaser-price conflicts.',
  'ownership-cost-analyst':
    'Compute five-year ownership cost estimates from shared assumptions and per-candidate specification data.',
  'safety-reliability-analyst':
    'Retrieve and compare safety and reliability ratings across independent sources for each candidate.',
  'household-fit-analyst':
    'Compare candidate specifications against household cargo, rear-seat, and comfort needs, and surface explicit unknowns requiring a test drive or physical measurement.',
};

/**
 * Collected mutable state one call to `executeCarPurchaseGraph` accumulates
 * across every node's hooks -- one run, one shared queue, one shared
 * monotonic `sequence` (matching `strands-adapter.ts`'s single-agent
 * `execute()`, now multiplied across nodes: "a real cross-node streaming
 * need actually arises" here, exactly as that file's header comment
 * anticipated).
 *
 * `queue` is a `RuntimeEventQueue`, not a plain array, precisely because the
 * SDK hooks that fill it are synchronous while the consumer draining it is
 * asynchronous: the queue is what lets each node's events reach that
 * consumer while later nodes are still running, rather than in one burst
 * after `graph.invoke` resolves. See `runtime-event-queue.ts`.
 */
interface RunAccumulator {
  queue: RuntimeEventQueue<RuntimeEvent>;
  sequence: () => number;
  traceId: string;
  runId: string;
  caseId: string;
  sessionId?: string;
  /** Elapsed-time source every node's `RuntimeMetricsTracker` measures real model/tool call durations with. Wall-clock unless `CarPurchaseGraphDeps.nowMs` overrides it. */
  now: () => number;
  /** Per-node elapsed-time measurement behind `graph.node_completed`'s `durationMs`. See `createNodeDurationTracker`. */
  nodeDurations: NodeDurationTracker;
}

// --- Per-node duration (RuntimeDebugEvent.durationMs on graph node events) ---

/** Records one node's real start reading and closes it into an elapsed interval. See `createNodeDurationTracker`. */
export interface NodeDurationTracker {
  /** Called from the node's real `BeforeNodeCallEvent` hook, synchronously, before the node runs. */
  noteNodeStart(nodeId: string): void;
  /**
   * Called from the node's real `NodeResultEvent` hook. Returns the elapsed
   * milliseconds since that node's own recorded start, or `undefined` when no
   * start was ever observed for it -- never a zero standing in for "unknown".
   */
  measureNode(nodeId: string): number | undefined;
}

/**
 * Measures how long each Graph node genuinely took, as the interval between
 * that node's own real `BeforeNodeCallEvent` and `NodeResultEvent` hook
 * firings, read from `RunAccumulator.now`.
 *
 * **Keyed by node id, deliberately.** The four parallel specialists are
 * genuinely in flight at once (`maxConcurrency` up to 4, and the real Graph
 * starts every ready node before any of them completes), so a single
 * "last node start" variable would anchor all four finishes to whichever
 * node happened to start last and silently misattribute three of the four
 * durations. This mirrors `createRuntimeMetricsTracker`'s identical
 * `toolUseId`-keyed map for the SDK's concurrent tool executor.
 *
 * **Why this interval and not `NodeResult.duration`.** The installed
 * `@strands-agents/sdk@1.14.0` does measure a per-node duration of its own:
 * `multiagent/state.d.ts`'s `NodeResult.duration` ("Execution time in
 * milliseconds"), computed in `multiagent/nodes.js` as
 * `Date.now() - nodeState.startTime` around the node's own `handle()` call.
 * That number is real, is correctly per-node, and is *not* discarded --
 * every `NodeResult` on the returned `CarPurchaseGraphResult.
 * multiAgentResult.results` still carries it verbatim. What is emitted on
 * the runtime event is Sift's own interval instead, for three reasons:
 *
 * 1. it is the interval a consumer actually observes -- a surface that
 *    starts a node's elapsed timer on `graph.node_completed`/`phase: start`
 *    and freezes it on `phase: finish` is measuring exactly this span, so
 *    the frozen number matches what the reader watched tick, whereas the
 *    SDK's strictly-inner span would freeze slightly below it;
 * 2. it comes from the same single time source as every other `durationMs`
 *    in the run (`createRuntimeMetricsTracker` reads the same `now`), so a
 *    node's duration and its own model/tool call durations are comparable
 *    rather than drawn from two different clocks;
 * 3. it is injectable, which is what lets the offline fixture suites assert
 *    an exact measured number instead of a wall-clock value that changes
 *    every run. `Date.now()` inside the SDK is reachable only by mocking a
 *    global.
 *
 * Both readings are same-process wall clock taken microseconds apart on one
 * event loop, which is precisely the timing docs/specs/
 * debugging-and-observability.md treats as trustworthy -- unlike a
 * *cross-process* hook timestamp comparison, which it does not.
 */
export function createNodeDurationTracker(
  now: () => number = () => Date.now(),
): NodeDurationTracker {
  const startedAt = new Map<string, number>();
  return {
    noteNodeStart(nodeId: string): void {
      startedAt.set(nodeId, now());
    },
    measureNode(nodeId: string): number | undefined {
      const started = startedAt.get(nodeId);
      startedAt.delete(nodeId);
      return started === undefined ? undefined : Math.max(0, Math.round(now() - started));
    },
  };
}

function emitGraphNodeEvent(
  acc: RunAccumulator,
  params: { nodeId: string; phase: 'start' | 'finish'; status?: string },
): void {
  // Timing is captured here, inside the synchronous hook callback -- not
  // when a consumer later drains the queue. The generator streams events
  // while the Graph is still running (`RuntimeEventQueue.streamWhile`), so a
  // reading taken at drain time would measure the consumer's own pace, not
  // the node's.
  if (params.phase === 'start') {
    acc.nodeDurations.noteNodeStart(params.nodeId);
  }
  const durationMs =
    params.phase === 'start' ? undefined : acc.nodeDurations.measureNode(params.nodeId);
  const event: RuntimeDebugEvent = {
    schemaVersion: '1.0',
    sequence: acc.sequence(),
    timestamp: new Date().toISOString(),
    traceId: acc.traceId,
    caseId: acc.caseId,
    runId: acc.runId,
    ...(acc.sessionId !== undefined ? { sessionId: acc.sessionId } : {}),
    agentId: params.nodeId,
    category: 'graph',
    name: 'graph.node_completed',
    phase: params.phase === 'start' ? 'start' : 'finish',
    level: 'info',
    // Omitted, never defaulted: a node whose start was never observed
    // reports no duration at all rather than a fabricated `0`.
    ...(durationMs !== undefined ? { durationMs } : {}),
    summary:
      params.phase === 'start'
        ? `Graph node "${params.nodeId}" started.`
        : `Graph node "${params.nodeId}" completed with status "${params.status ?? 'unknown'}".`,
    attributes: {
      nodeId: params.nodeId,
      ...(params.status !== undefined ? { status: params.status } : {}),
    },
    redactions: [],
  };
  acc.queue.push(event);
}

function buildInterventions(
  deps: {
    runId: string;
    obligationId: string;
    clock: Clock;
    allowedTools: readonly string[];
    consequentialToolIds: readonly string[];
    forbiddenToolIds: readonly string[];
    resolveConfirmation?: (toolName: string, input: JSONValue) => JSONValue | undefined;
    maxToolCallsPerRun: number;
    attemptsUsedForObligation: number;
    maxAttemptsPerObligation: number;
  },
  emit: (event: InterventionEvent) => void,
): InterventionHandler[] {
  const ledger = new ToolLedger();
  return [
    new ScopeAuthorization({
      runId: deps.runId,
      obligationId: deps.obligationId,
      clock: deps.clock,
      emit,
      allowedTools: deps.allowedTools,
    }),
    new ConsequenceGuard({
      runId: deps.runId,
      obligationId: deps.obligationId,
      clock: deps.clock,
      emit,
      consequentialToolIds: deps.consequentialToolIds,
      forbiddenToolIds: deps.forbiddenToolIds,
      ...(deps.resolveConfirmation !== undefined
        ? { resolveConfirmation: deps.resolveConfirmation }
        : {}),
    }),
    new BudgetGuard({
      runId: deps.runId,
      obligationId: deps.obligationId,
      clock: deps.clock,
      emit,
      maxToolCallsPerRun: deps.maxToolCallsPerRun,
      excludedToolNames: SDK_INTERNAL_TOOL_NAMES,
    }),
    new RetrySteering({
      runId: deps.runId,
      obligationId: deps.obligationId,
      clock: deps.clock,
      emit,
      ledger,
      attemptsUsedForObligation: deps.attemptsUsedForObligation,
      maxAttemptsPerObligation: deps.maxAttemptsPerObligation,
    }),
    new EvidenceQualitySteering({
      runId: deps.runId,
      obligationId: deps.obligationId,
      clock: deps.clock,
      emit,
    }),
    new OutputSanitizer({
      runId: deps.runId,
      obligationId: deps.obligationId,
      clock: deps.clock,
      emit,
    }),
  ];
}

function wireAgentHooks(agent: Agent, ctx: NormalizerContext, acc: RunAccumulator): () => void {
  // One tracker per `Agent`: each Graph node has its own Strands `Meter`,
  // so a shared tracker would mix six nodes' cumulative token totals into
  // one meaningless delta. See `createRuntimeMetricsTracker`.
  const metrics = createRuntimeMetricsTracker(acc.now);
  const cleanups = [
    agent.addHook(BeforeToolCallEvent, (event) => {
      metrics.noteToolCallStart(event);
      acc.queue.push(normalizeBeforeToolCall(event, ctx, acc.sequence()));
    }),
    agent.addHook(AfterToolCallEvent, (event) => {
      acc.queue.push(
        normalizeAfterToolCall(event, ctx, acc.sequence(), metrics.measureToolCall(event)),
      );
      if (event.toolUse.name === 'skills' && event.result.status === 'success') {
        const input = event.toolUse.input;
        const skillId =
          input !== null && typeof input === 'object' && !Array.isArray(input)
            ? (input as Record<string, unknown>)['skill_name']
            : undefined;
        if (typeof skillId === 'string') {
          acc.queue.push(
            normalizeSkillActivation(
              {
                skillId,
                reason: 'activated via the skills tool',
                ...(ctx.agentId !== undefined ? { agentId: ctx.agentId } : {}),
              },
              ctx,
              acc.sequence(),
            ),
          );
        }
      }
    }),
    agent.addHook(BeforeModelCallEvent, (event) => {
      metrics.noteModelCallStart(event);
      acc.queue.push(normalizeBeforeModelCall(event, ctx, acc.sequence()));
    }),
    agent.addHook(AfterModelCallEvent, (event) => {
      acc.queue.push(
        normalizeAfterModelCall(event, ctx, acc.sequence(), metrics.measureModelCall(event)),
      );
    }),
  ];
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}

/** Builds one parallel-branch or source-challenger specialist `Agent`, fully wired with skills/context/interventions -- the same composition as `strands-adapter.ts`'s single-agent `execute()`. */
function buildSpecialistAgent(
  nodeId: CarPurchaseParallelSpecialistId | 'source-challenger',
  request: ExecutionRequest,
  deps: CarPurchaseGraphDeps,
  acc: RunAccumulator,
  roleDescription: string,
): { agent: Agent; unwireHooks: () => void } {
  const allowedTools = specialistAllowedTools(deps.pack, nodeId);
  const allowedToolsWithInternals = [...allowedTools, ...SDK_INTERNAL_TOOL_NAMES];
  const ctx: NormalizerContext = {
    traceId: acc.traceId,
    runId: acc.runId,
    caseId: acc.caseId,
    obligationId: request.obligation.id,
    agentId: nodeId,
    ...(acc.sessionId !== undefined ? { sessionId: acc.sessionId } : {}),
  };
  const emitIntervention = (event: InterventionEvent): void => {
    acc.queue.push(normalizeIntervention(event, ctx, acc.sequence()));
  };
  const interventions = buildInterventions(
    {
      runId: acc.runId,
      obligationId: request.obligation.id,
      clock: deps.clock,
      allowedTools: allowedToolsWithInternals,
      consequentialToolIds: [],
      forbiddenToolIds: deps.forbiddenToolIds ?? [],
      ...(deps.resolveConfirmation !== undefined
        ? { resolveConfirmation: deps.resolveConfirmation }
        : {}),
      maxToolCallsPerRun: request.limits.maxToolCallsPerRun,
      attemptsUsedForObligation: request.priorAttempts.length,
      maxAttemptsPerObligation: request.limits.maxAttemptsPerObligation,
    },
    emitIntervention,
  );

  const skillsPlugin = buildSkillsPlugin(deps.skillsRootDir);
  const contextInjector = buildContextInjector(request, {
    ctx,
    sequence: acc.sequence,
    emit: (event) => acc.queue.push(event),
  });

  const tools = filterToolsByName(buildCarPurchaseFixtureTools(), allowedTools);
  const agent = new Agent({
    id: nodeId,
    name: nodeId,
    model: deps.modelFor(nodeId),
    printer: false,
    systemPrompt: buildSystemPrompt(nodeId, request, roleDescription),
    tools,
    plugins: [skillsPlugin, contextInjector],
    interventions,
    structuredOutputSchema: ExecutionResultSchema,
  });

  const unwireHooks = wireAgentHooks(agent, ctx, acc);
  return { agent, unwireHooks };
}

function buildSourceChallengerRoleDescription(): string {
  return 'Evaluate provenance, recency, and contradictions across the four specialists’ submitted evidence -- including any teaser-price/mandatory-add-on conflicts and safety/reliability source disagreements -- before it can satisfy an obligation.';
}

function buildDecisionSynthesizerSystemPrompt(request: ExecutionRequest): string {
  const criteriaText = request.caseSummary.criteria
    .map((criterion) => `${criterion.id} (weight ${criterion.weight}, ${criterion.direction})`)
    .join('; ');
  const extensionsText = request.caseExtensions
    .filter((extension) => extension.confirmation === 'confirmed')
    .map((extension) => extension.label)
    .join('; ');
  return [
    'You are "decision-synthesizer", synthesizing resolved evidence across every prior car-purchase obligation into a source-linked shortlist recommendation.',
    `Active obligation: "${request.obligation.id}" -- ${request.obligation.question}`,
    `Current criteria: ${criteriaText || '(none)'}.`,
    extensionsText.length > 0 ? `Confirmed case-specific concerns: ${extensionsText}.` : '',
    'Cite a source id for every factual claim. Call propose_recommendation to advance candidates once you have a defensible answer -- it requires human confirmation before it proceeds.',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

function extractExecutionResult(structuredOutput: unknown, nodeId: string): ExecutionResult {
  const parsed = ExecutionResultSchema.safeParse(structuredOutput);
  if (!parsed.success) {
    throw new Error(
      `car-purchase-graph: node "${nodeId}" did not produce a valid ExecutionResult: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

/** Sanity guard the test suite relies on implicitly: confirms `skillsRootDir` really is a directory of skill subdirectories (fails loudly and early rather than deep inside a Strands plugin if misconfigured). */
function assertSkillsRootDirExists(skillsRootDir: string): void {
  const entries = readdirSync(skillsRootDir);
  if (!entries.some((entry) => statSync(join(skillsRootDir, entry)).isDirectory())) {
    throw new Error(
      `car-purchase-graph: skillsRootDir "${skillsRootDir}" has no skill subdirectories`,
    );
  }
}

/**
 * Runs the real six-node car-purchase Strands `Graph` once. Yields every
 * normalized `RuntimeEvent` the run produces (tool/model calls, skill
 * activation, context injection, interventions, and one `graph.
 * node_completed` event per node lifecycle transition) *as the Graph
 * produces it* -- a consumer receives `deal-analyst`'s events while
 * `source-challenger` is still running -- then returns the full
 * `CarPurchaseGraphResult`.
 *
 * Guarantees a consumer can rely on:
 *
 * - events arrive in the run's own monotonic `sequence` order, with no gaps;
 * - no event is dropped, including the `goal.*` events that can only be
 *   read after `graph.invoke` resolves;
 * - a mid-run failure rethrows the Graph's original error, but only after
 *   every event produced before it has been yielded;
 * - nothing is paced or delayed: a run that genuinely takes 300 ms still
 *   takes 300 ms.
 */
export async function* executeCarPurchaseGraph(
  deps: CarPurchaseGraphDeps,
): AsyncGenerator<RuntimeEvent, CarPurchaseGraphResult, undefined> {
  assertSkillsRootDirExists(deps.skillsRootDir);

  const now = deps.nowMs ?? ((): number => Date.now());
  const acc: RunAccumulator = {
    queue: new RuntimeEventQueue<RuntimeEvent>(),
    sequence: createSequenceCounter(),
    traceId: deps.idGenerator.next('trace'),
    runId: deps.shortlistRequest.runId,
    caseId: deps.shortlistRequest.caseId,
    now,
    nodeDurations: createNodeDurationTracker(now),
  };

  const unwireCleanups: (() => void)[] = [];
  const specialistAgents: Record<CarPurchaseParallelSpecialistId | 'source-challenger', Agent> =
    {} as never;

  for (const specialistId of CAR_PURCHASE_PARALLEL_SPECIALIST_IDS) {
    const built = buildSpecialistAgent(
      specialistId,
      deps.specialistRequests[specialistId],
      deps,
      acc,
      SPECIALIST_ROLE_DESCRIPTIONS[specialistId],
    );
    specialistAgents[specialistId] = built.agent;
    unwireCleanups.push(built.unwireHooks);
  }
  const challengerBuilt = buildSpecialistAgent(
    'source-challenger',
    deps.shortlistRequest,
    deps,
    acc,
    buildSourceChallengerRoleDescription(),
  );
  specialistAgents['source-challenger'] = challengerBuilt.agent;
  unwireCleanups.push(challengerBuilt.unwireHooks);

  // --- decision-synthesizer: reuse plugins.ts's isolated Agent+GoalLoop pair verbatim ---
  const proposeRecommendationTool = filterToolsByName(buildCarPurchaseFixtureTools(), [
    PROPOSE_RECOMMENDATION_TOOL_ID,
  ]);
  const synthesizerCtx: NormalizerContext = {
    traceId: acc.traceId,
    runId: acc.runId,
    caseId: acc.caseId,
    obligationId: deps.shortlistRequest.obligation.id,
    agentId: 'decision-synthesizer',
    ...(acc.sessionId !== undefined ? { sessionId: acc.sessionId } : {}),
  };
  const emitSynthesizerIntervention = (event: InterventionEvent): void => {
    acc.queue.push(normalizeIntervention(event, synthesizerCtx, acc.sequence()));
  };
  const synthesizerInterventions = buildInterventions(
    {
      runId: acc.runId,
      obligationId: deps.shortlistRequest.obligation.id,
      clock: deps.clock,
      allowedTools: [PROPOSE_RECOMMENDATION_TOOL_ID, ...SDK_INTERNAL_TOOL_NAMES],
      consequentialToolIds: deps.consequentialToolIds ?? [PROPOSE_RECOMMENDATION_TOOL_ID],
      forbiddenToolIds: deps.forbiddenToolIds ?? [],
      ...(deps.resolveConfirmation !== undefined
        ? { resolveConfirmation: deps.resolveConfirmation }
        : {}),
      maxToolCallsPerRun: deps.shortlistRequest.limits.maxToolCallsPerRun,
      attemptsUsedForObligation: deps.shortlistRequest.priorAttempts.length,
      maxAttemptsPerObligation: deps.shortlistRequest.limits.maxAttemptsPerObligation,
    },
    emitSynthesizerIntervention,
  );

  const { agent: synthesizerAgent, goalLoop } = buildDecisionSynthesizerAgent({
    model: deps.modelFor('decision-synthesizer'),
    systemPrompt:
      deps.decisionSynthesizerSystemPrompt ??
      buildDecisionSynthesizerSystemPrompt(deps.shortlistRequest),
    validator: deps.decisionSynthesizerValidator ?? DEFAULT_VALIDATOR,
    tools: proposeRecommendationTool,
    interventions: synthesizerInterventions,
    ...(deps.goalLoopMaxAttempts !== undefined ? { maxAttempts: deps.goalLoopMaxAttempts } : {}),
  });
  unwireCleanups.push(wireAgentHooks(synthesizerAgent, synthesizerCtx, acc));

  let proposedRecommendation: CarPurchaseGraphResult['proposedRecommendation'];
  const captureProposal = synthesizerAgent.addHook(BeforeToolCallEvent, (event) => {
    if (event.toolUse.name !== PROPOSE_RECOMMENDATION_TOOL_ID) return;
    const input = event.toolUse.input as { candidateIds?: unknown; rationale?: unknown };
    if (Array.isArray(input.candidateIds) && typeof input.rationale === 'string') {
      proposedRecommendation = {
        candidateIds: input.candidateIds.filter((id): id is string => typeof id === 'string'),
        rationale: input.rationale,
      };
    }
  });
  unwireCleanups.push(captureProposal);

  // --- Graph construction: code-driven from the compiled pack's declared specialists/orchestration bounds ---
  const graph = new Graph({
    id: 'car-purchase-graph',
    nodes: [
      ...CAR_PURCHASE_PARALLEL_SPECIALIST_IDS.map((id) => specialistAgents[id]),
      specialistAgents['source-challenger'],
      synthesizerAgent,
    ],
    edges: [
      ...CAR_PURCHASE_PARALLEL_SPECIALIST_IDS.map((id): [string, string] => [
        id,
        'source-challenger',
      ]),
      ['source-challenger', 'decision-synthesizer'],
    ],
    maxSteps: deps.pack.orchestration.maxSteps,
    nodeTimeout: deps.pack.orchestration.nodeTimeoutMs,
    timeout: deps.pack.orchestration.totalTimeoutMs,
    ...(deps.pack.orchestration.maxConcurrency !== undefined
      ? { maxConcurrency: deps.pack.orchestration.maxConcurrency }
      : {}),
  });

  const nodeStartOrder: string[] = [];
  const nodeFinishOrder: string[] = [];
  const graphCleanups = [
    graph.addHook(BeforeNodeCallEvent, (event) => {
      nodeStartOrder.push(event.nodeId);
      emitGraphNodeEvent(acc, { nodeId: event.nodeId, phase: 'start' });
    }),
    graph.addHook(NodeResultEvent, (event) => {
      nodeFinishOrder.push(event.nodeId);
      emitGraphNodeEvent(acc, {
        nodeId: event.nodeId,
        phase: 'finish',
        status: event.result.status,
      });
    }),
  ];

  // --- The run and the streaming of its events are genuinely concurrent.
  //
  // `graph.invoke` is started here and its promise handed to
  // `queue.streamWhile`, which yields each `RuntimeEvent` the SDK's hooks
  // push while the Graph is still working. Awaiting the invocation first and
  // draining afterwards would deliver an identical final list -- and be a
  // lie: the six specialists genuinely execute over the whole run, and a
  // consumer rendering them one at a time would receive all of them in the
  // instant after the last node finished. Nothing here paces or delays
  // anything; an event is handed over the moment the consumer asks for it.
  //
  // Ordering is push order, which is sequence order (every emitter allocates
  // `acc.sequence()` and pushes in one synchronous statement), so downstream
  // ordered-sequence replay and duplicate suppression are unaffected. On a
  // mid-run failure, everything already queued is yielded before the error
  // is rethrown. ---
  const invocation = graph.invoke(deps.invokePrompt ?? buildInvokePrompt(deps.shortlistRequest));

  let multiAgentResult: MultiAgentResult;
  try {
    multiAgentResult = yield* acc.queue.streamWhile(invocation);
  } finally {
    for (const cleanup of graphCleanups) cleanup();
    for (const cleanup of unwireCleanups) cleanup();
  }

  // --- GoalLoop validation attempts, read from the real plugin's own
  // `lastResult` (`@strands-agents/sdk/vended-plugins/goal`'s `GoalResult`,
  // whose `attempts` are 1-indexed `GoalAttempt`s) and emitted as real
  // `goal.*` runtime events. These are necessarily produced *after* the
  // streaming loop above has ended: `lastResult` is only populated once
  // `graph.invoke` has driven `decision-synthesizer` to completion. They are
  // pushed onto the same queue and drained by the explicit final drain
  // below, so a run's last events are delivered rather than stranded in a
  // queue nobody reads again.
  //
  // strands-runtime.md "GoalLoop output validation" requires a rejection to
  // emit `goal.validation_failed` with machine-readable reasons; without
  // this the car pack ran a genuine GoalLoop and recorded nothing about it,
  // leaving `goal` the one required category with no producer on the
  // WebMCP hero pack. `home-energy-swarm.ts` emits the same shape from the
  // same `lastResult` read.
  const rawGoalResult = goalLoop.lastResult(synthesizerAgent) as
    | {
        passed: boolean;
        stopReason: string;
        attempts: { attempt: number; passed: boolean; feedback?: string }[];
      }
    | undefined;
  if (rawGoalResult !== undefined) {
    const lastAttemptIndex = rawGoalResult.attempts.length - 1;
    rawGoalResult.attempts.forEach((attempt, index) => {
      const exhausted = !rawGoalResult.passed && index === lastAttemptIndex;
      acc.queue.push(
        normalizeGoalValidation(
          {
            attempt: attempt.attempt,
            passed: attempt.passed,
            ...(attempt.feedback !== undefined ? { feedback: attempt.feedback } : {}),
            exhausted,
          },
          synthesizerCtx,
          acc.sequence(),
        ),
      );
    });
  }

  // Everything produced after the Graph resolved (the GoalLoop attempts
  // above). The streaming loop has already delivered the rest, so this
  // drain is normally short -- but it is what guarantees no event is left
  // behind when the generator returns.
  for (const event of acc.queue.drain()) {
    yield event;
  }

  const executionResults: Partial<Record<string, ExecutionResult>> = {};
  for (const nodeId of [...CAR_PURCHASE_PARALLEL_SPECIALIST_IDS, 'source-challenger'] as const) {
    const nodeResult = multiAgentResult.results.find((entry) => entry.nodeId === nodeId);
    if (nodeResult?.structuredOutput !== undefined) {
      executionResults[nodeId] = extractExecutionResult(nodeResult.structuredOutput, nodeId);
    }
  }

  const synthesizerNodeResult = multiAgentResult.results.find(
    (entry) => entry.nodeId === 'decision-synthesizer',
  );
  const decisionSynthesizerText =
    synthesizerNodeResult?.content
      .filter((block): block is TextBlock => block.type === 'textBlock')
      .map((block) => block.text)
      .join('\n') ?? '';

  const goalLoopResult: CarPurchaseGoalLoopResult | undefined =
    rawGoalResult === undefined
      ? undefined
      : {
          passed: rawGoalResult.passed,
          stopReason: rawGoalResult.stopReason,
          attempts: rawGoalResult.attempts,
        };

  return {
    multiAgentResult,
    nodeStartOrder,
    nodeFinishOrder,
    executionResults,
    decisionSynthesizerText,
    proposedRecommendation,
    goalLoopResult,
  };
}
