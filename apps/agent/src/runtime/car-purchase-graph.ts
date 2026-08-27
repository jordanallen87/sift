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
import type { Clock, IdGenerator } from '@pax/core';
import {
  ExecutionResultSchema,
  type CompiledDecisionPack,
  type ExecutionRequest,
  type ExecutionResult,
  type RuntimeDebugEvent,
} from '@pax/contracts';
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
  createSequenceCounter,
  normalizeAfterModelCall,
  normalizeAfterToolCall,
  normalizeBeforeModelCall,
  normalizeBeforeToolCall,
  normalizeIntervention,
  normalizeSkillActivation,
  type NormalizerContext,
  type RuntimeEvent,
} from './event-normalizer.js';

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
}

/** `goalLoop.lastResult(agent)`'s shape, re-declared narrowly here so this module does not need to import the SDK's own (unexported-by-name) GoalLoop result type. */
export interface CarPurchaseGoalLoopResult {
  readonly passed: boolean;
  readonly stopReason: string;
  readonly attempts: readonly { passed: boolean; feedback?: string }[];
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
    `You are "${nodeId}", a Pax Strands specialist in the "${request.pack.id}@${request.pack.version}" Graph. ${roleDescription}`,
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
 * across every node's hooks -- one run, one shared buffer, one shared
 * monotonic `sequence` (matching `strands-adapter.ts`'s single-agent
 * `execute()`, now multiplied across nodes: "a real cross-node streaming
 * need actually arises" here, exactly as that file's header comment
 * anticipated).
 */
interface RunAccumulator {
  events: RuntimeEvent[];
  sequence: () => number;
  traceId: string;
  runId: string;
  caseId: string;
  sessionId?: string;
}

function emitGraphNodeEvent(
  acc: RunAccumulator,
  params: { nodeId: string; phase: 'start' | 'finish'; status?: string },
): void {
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
  acc.events.push(event);
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
  const cleanups = [
    agent.addHook(BeforeToolCallEvent, (event) => {
      acc.events.push(normalizeBeforeToolCall(event, ctx, acc.sequence()));
    }),
    agent.addHook(AfterToolCallEvent, (event) => {
      acc.events.push(normalizeAfterToolCall(event, ctx, acc.sequence()));
      if (event.toolUse.name === 'skills' && event.result.status === 'success') {
        const input = event.toolUse.input;
        const skillId =
          input !== null && typeof input === 'object' && !Array.isArray(input)
            ? (input as Record<string, unknown>)['skill_name']
            : undefined;
        if (typeof skillId === 'string') {
          acc.events.push(
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
      acc.events.push(normalizeBeforeModelCall(event, ctx, acc.sequence()));
    }),
    agent.addHook(AfterModelCallEvent, (event) => {
      acc.events.push(normalizeAfterModelCall(event, ctx, acc.sequence()));
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
    acc.events.push(normalizeIntervention(event, ctx, acc.sequence()));
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
    emit: (event) => acc.events.push(event),
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
 * normalized `RuntimeEvent` the run produced (tool/model calls, skill
 * activation, context injection, interventions, and one `graph.
 * node_completed` event per node lifecycle transition), then returns the
 * full `CarPurchaseGraphResult`.
 */
export async function* executeCarPurchaseGraph(
  deps: CarPurchaseGraphDeps,
): AsyncGenerator<RuntimeEvent, CarPurchaseGraphResult, undefined> {
  assertSkillsRootDirExists(deps.skillsRootDir);

  const acc: RunAccumulator = {
    events: [],
    sequence: createSequenceCounter(),
    traceId: deps.idGenerator.next('trace'),
    runId: deps.shortlistRequest.runId,
    caseId: deps.shortlistRequest.caseId,
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
    acc.events.push(normalizeIntervention(event, synthesizerCtx, acc.sequence()));
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

  let multiAgentResult: MultiAgentResult;
  try {
    multiAgentResult = await graph.invoke(
      deps.invokePrompt ?? buildInvokePrompt(deps.shortlistRequest),
    );
  } finally {
    for (const cleanup of graphCleanups) cleanup();
    for (const cleanup of unwireCleanups) cleanup();
  }

  for (const event of acc.events) {
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

  const rawGoalResult = goalLoop.lastResult(synthesizerAgent) as
    | { passed: boolean; stopReason: string; attempts: { passed: boolean; feedback?: string }[] }
    | undefined;
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
