/**
 * Composition root tying together a real Strands `Agent`, the vended
 * plugins (`AgentSkills`, `ContextInjector`), the six ordered
 * `InterventionHandler`s, and the event normalizer.
 *
 * Scope for this pass (docs/superpowers/plans/2026-08-26-pax-hackathon-build.md
 * Task 6, distinct from Task 7's real car-purchase Graph): `execute()` runs
 * a single real Strands `Agent` -- not yet a full Graph -- configured with
 * every plugin/intervention below against either a real `BedrockModel` or
 * the deterministic `ScriptedModelProvider`, proving each plugin and
 * intervention genuinely fires and produces its normalized event. The
 * agent targets a real `ExecutionResultSchema` structured output (Strands's
 * own `strands_structured_output` tool mechanism -- see `model-provider.ts`
 * for how the scripted model drives it), so the adapter's returned
 * `ExecutionResult` is genuinely validated by the installed SDK, not
 * hand-parsed from free text.
 *
 * `execute()` collects every hook-driven `RuntimeEvent` into a buffer
 * during the single `await agent.invoke(...)` call, then yields them in
 * order followed by the `ExecutionResult`. True incrementally-interleaved
 * streaming (yielding each event the instant its hook fires, before
 * `invoke()` resolves) is deferred to whichever later task builds the
 * multi-node car-purchase Graph, where a real cross-node streaming need
 * actually arises -- documented explicitly in the dated docs/build-log.md
 * entry for this task.
 */
import { z } from 'zod';
import {
  Agent,
  AfterModelCallEvent,
  AfterToolCallEvent,
  BeforeModelCallEvent,
  BeforeToolCallEvent,
  tool,
  type AgentResult,
  type BaseModelConfig,
  type InterventionHandler,
  type InvokeOptions,
  type JSONValue,
  type Model,
  type SessionManager,
  type ToolList,
} from '@strands-agents/sdk';
import type { Clock, IdGenerator } from '@sift/core';
import {
  ExecutionResultSchema,
  type ExecutionRequest,
  type ExecutionResult,
} from '@sift/contracts';
import {
  HOUSEHOLD_FIT_MATRIX_TOOL_ID,
  LISTING_READER_TOOL_ID,
  OWNERSHIP_CALCULATOR_TOOL_ID,
  SAFETY_RELIABILITY_LOOKUP_TOOL_ID,
  calculateOwnershipCost,
  lookupHouseholdFit,
  lookupSafetyReliability,
  readListing,
} from '@sift/scenarios';
import {
  createSequenceCounter,
  normalizeAfterModelCall,
  normalizeAfterToolCall,
  normalizeBeforeModelCall,
  normalizeBeforeToolCall,
  normalizeIntervention,
  normalizeRunError,
  normalizeSkillActivation,
  type NormalizerContext,
  type RuntimeEvent,
} from './event-normalizer.js';
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
import { buildContextInjector, buildSkillsPlugin } from './plugins.js';
import { restoreCaseSnapshot, saveCaseSnapshot } from './session-adapter.js';

/** `propose_recommendation`'s tool id -- the car pack's one consequential effect (packages/packs/src/car-purchase.ts). Declared here (not imported from `@sift/packs`) because this adapter's fixture-tool wiring is pack-agnostic; the compiled pack is what actually declares which tool ids are consequential, supplied by the caller via `StrandsAdapterDeps.consequentialToolIds`. */
export const PROPOSE_RECOMMENDATION_TOOL_ID = 'propose_recommendation';

/** Tool names the SDK/plugins register automatically and that are never part of a compiled pack's declared tool set -- exempt from `ScopeAuthorization`'s allowlist and `BudgetGuard`'s tool-call budget. */
export const SDK_INTERNAL_TOOL_NAMES = ['strands_structured_output', 'skills'] as const;

// --- Real fixture tools, wrapped as real Strands `Tool`s via `tool()` ---
// packages/scenarios/src/tools/index.ts's exact functions/ids, per this
// task's brief.

function buildListingReaderTool() {
  return tool({
    name: LISTING_READER_TOOL_ID,
    description:
      'Reads normalized candidate listing and dealer-offer terms (advertised price, mileage, standard features, mandatory add-ons, financing terms). Omit candidateId to list every candidate.',
    inputSchema: z.object({ candidateId: z.string().optional() }),
    callback: (input, context) =>
      readListing({
        ...(input.candidateId !== undefined ? { candidateId: input.candidateId } : {}),
        ...(context?.cancelSignal !== undefined ? { signal: context.cancelSignal } : {}),
      }),
  });
}

function buildOwnershipCalculatorTool() {
  return tool({
    name: OWNERSHIP_CALCULATOR_TOOL_ID,
    description:
      'Computes a five-year total ownership cost estimate (fuel, maintenance, insurance, depreciation, financing) for one candidate.',
    inputSchema: z.object({ candidateId: z.string() }),
    callback: (input, context) =>
      calculateOwnershipCost({
        candidateId: input.candidateId,
        ...(context?.cancelSignal !== undefined ? { signal: context.cancelSignal } : {}),
      }),
  });
}

function buildSafetyReliabilityLookupTool() {
  return tool({
    name: SAFETY_RELIABILITY_LOOKUP_TOOL_ID,
    description:
      'Retrieves crash-safety, driver-assistance, and reliability findings for one candidate from independent published sources.',
    inputSchema: z.object({ candidateId: z.string() }),
    callback: (input, context) =>
      lookupSafetyReliability({
        candidateId: input.candidateId,
        ...(context?.cancelSignal !== undefined ? { signal: context.cancelSignal } : {}),
      }),
  });
}

function buildHouseholdFitMatrixTool() {
  return tool({
    name: HOUSEHOLD_FIT_MATRIX_TOOL_ID,
    description:
      "Compares one candidate's cargo and rear-seat specifications against the household's stated needs, returning explicit unknowns where physical measurement or a test drive is required.",
    inputSchema: z.object({ candidateId: z.string() }),
    callback: (input, context) =>
      lookupHouseholdFit({
        candidateId: input.candidateId,
        ...(context?.cancelSignal !== undefined ? { signal: context.cancelSignal } : {}),
      }),
  });
}

function buildProposeRecommendationTool() {
  return tool({
    name: PROPOSE_RECOMMENDATION_TOOL_ID,
    description:
      "Creates the consequential proposal to advance one or more candidates to the household's test-drive shortlist. Requires explicit human confirmation before the call proceeds.",
    inputSchema: z.object({
      candidateIds: z.array(z.string()).min(1),
      rationale: z.string(),
    }),
    callback: (input) => ({
      status: 'proposed',
      candidateIds: input.candidateIds,
      rationale: input.rationale,
    }),
  });
}

/** Every real fixture tool this pack's specialists use, wrapped as real Strands `Tool`s, plus the gated `propose_recommendation` consequential tool. */
export function buildCarPurchaseFixtureTools(): ToolList {
  return [
    buildListingReaderTool(),
    buildOwnershipCalculatorTool(),
    buildSafetyReliabilityLookupTool(),
    buildHouseholdFitMatrixTool(),
    buildProposeRecommendationTool(),
  ];
}

// --- Composition root ---

export interface StrandsAdapterDeps {
  model: Model<BaseModelConfig> | string;
  skillsRootDir: string;
  clock: Clock;
  idGenerator: IdGenerator;
  sessionManager?: SessionManager;
  sessionId?: string;
  agentId?: string;
  consequentialToolIds?: readonly string[];
  forbiddenToolIds?: readonly string[];
  resolveConfirmation?: (toolName: string, input: JSONValue) => JSONValue | undefined;
  alternativeTechniqueHint?: string;
  additionalTools?: ToolList;
}

function buildOrchestratorSystemPrompt(request: ExecutionRequest): string {
  return [
    `You are the Sift case orchestrator investigating one obligation for Decision Pack "${request.pack.id}@${request.pack.version}".`,
    `Active obligation: "${request.obligation.id}" -- ${request.obligation.question}`,
    'Use only the tools and skills made available to you. Cite a source id for every claim.',
    'When you have gathered enough evidence, call the structured output tool with a complete result.',
  ].join('\n');
}

function buildInvokePrompt(request: ExecutionRequest): string {
  return `Investigate obligation "${request.obligation.id}": ${request.obligation.question}`;
}

/** Safely describes a caught `unknown` error without risking `Object.prototype.toString`'s `"[object Object]"` for a non-`Error` throw. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown error';
  }
}

function extractSkillName(input: JSONValue): string | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return undefined;
  }
  const value = (input as Record<string, JSONValue>)['skill_name'];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Runs one bounded investigation move for `request.obligation` through a
 * real Strands `Agent`. Yields every normalized `RuntimeEvent` the run
 * produced, followed by the validated `ExecutionResult` on success (or
 * nothing further, after a final `error`-category `RuntimeEvent`, on
 * failure).
 */
export async function* execute(
  deps: StrandsAdapterDeps,
  request: ExecutionRequest,
  signal?: AbortSignal,
): AsyncGenerator<RuntimeEvent | ExecutionResult, void, undefined> {
  const agentId = deps.agentId ?? 'case-orchestrator';
  const ctx: NormalizerContext = {
    traceId: deps.idGenerator.next('trace'),
    runId: request.runId,
    caseId: request.caseId,
    obligationId: request.obligation.id,
    agentId,
    ...(deps.sessionId !== undefined ? { sessionId: deps.sessionId } : {}),
  };
  const sequence = createSequenceCounter();
  const events: RuntimeEvent[] = [];
  const emit = (event: RuntimeEvent): void => {
    events.push(event);
  };
  const emitIntervention = (event: InterventionEvent): void => {
    emit(normalizeIntervention(event, ctx, sequence()));
  };

  const allowedTools = [...request.allowedTools, ...SDK_INTERNAL_TOOL_NAMES];
  const ledger = new ToolLedger();
  const interventions: InterventionHandler[] = [
    new ScopeAuthorization({
      runId: request.runId,
      obligationId: request.obligation.id,
      clock: deps.clock,
      emit: emitIntervention,
      allowedTools,
    }),
    new ConsequenceGuard({
      runId: request.runId,
      obligationId: request.obligation.id,
      clock: deps.clock,
      emit: emitIntervention,
      consequentialToolIds: deps.consequentialToolIds ?? [],
      ...(deps.forbiddenToolIds !== undefined ? { forbiddenToolIds: deps.forbiddenToolIds } : {}),
      ...(deps.resolveConfirmation !== undefined
        ? { resolveConfirmation: deps.resolveConfirmation }
        : {}),
    }),
    new BudgetGuard({
      runId: request.runId,
      obligationId: request.obligation.id,
      clock: deps.clock,
      emit: emitIntervention,
      maxToolCallsPerRun: request.limits.maxToolCallsPerRun,
      excludedToolNames: SDK_INTERNAL_TOOL_NAMES,
    }),
    new RetrySteering({
      runId: request.runId,
      obligationId: request.obligation.id,
      clock: deps.clock,
      emit: emitIntervention,
      ledger,
      attemptsUsedForObligation: request.priorAttempts.length,
      maxAttemptsPerObligation: request.limits.maxAttemptsPerObligation,
      ...(deps.alternativeTechniqueHint !== undefined
        ? { alternativeTechniqueHint: deps.alternativeTechniqueHint }
        : {}),
    }),
    new EvidenceQualitySteering({
      runId: request.runId,
      obligationId: request.obligation.id,
      clock: deps.clock,
      emit: emitIntervention,
    }),
    new OutputSanitizer({
      runId: request.runId,
      obligationId: request.obligation.id,
      clock: deps.clock,
      emit: emitIntervention,
    }),
  ];

  const skillsPlugin = buildSkillsPlugin(deps.skillsRootDir);
  const contextInjector = buildContextInjector(request, { ctx, sequence, emit });

  const agent = new Agent({
    id: agentId,
    name: agentId,
    model: deps.model,
    // The server never wants the SDK's console text/tool-use printer
    // interleaving with structured server logs; the normalized RuntimeEvent
    // stream is this adapter's actual output channel.
    printer: false,
    systemPrompt: buildOrchestratorSystemPrompt(request),
    tools: [...buildCarPurchaseFixtureTools(), ...(deps.additionalTools ?? [])],
    plugins: [skillsPlugin, contextInjector],
    interventions,
    structuredOutputSchema: ExecutionResultSchema,
    ...(deps.sessionManager !== undefined ? { sessionManager: deps.sessionManager } : {}),
  });

  const cleanups = [
    agent.addHook(BeforeToolCallEvent, (event) => {
      emit(normalizeBeforeToolCall(event, ctx, sequence()));
    }),
    agent.addHook(AfterToolCallEvent, (event) => {
      emit(normalizeAfterToolCall(event, ctx, sequence()));
      if (event.toolUse.name === 'skills' && event.result.status === 'success') {
        const skillId = extractSkillName(event.toolUse.input);
        if (skillId !== undefined) {
          emit(
            normalizeSkillActivation(
              { skillId, reason: 'activated via the skills tool', agentId },
              ctx,
              sequence(),
            ),
          );
        }
      }
    }),
    agent.addHook(BeforeModelCallEvent, (event) => {
      emit(normalizeBeforeModelCall(event, ctx, sequence()));
    }),
    agent.addHook(AfterModelCallEvent, (event) => {
      emit(normalizeAfterModelCall(event, ctx, sequence()));
    }),
  ];

  let result: AgentResult | undefined;
  let invokeError: unknown;
  try {
    if (deps.sessionManager !== undefined) {
      await restoreCaseSnapshot(deps.sessionManager, agent, { ctx, sequence, emit });
    }
    const invokeOptions: InvokeOptions = {};
    if (signal !== undefined) {
      invokeOptions.cancelSignal = signal;
    }
    result = await agent.invoke(buildInvokePrompt(request), invokeOptions);
    if (deps.sessionManager !== undefined) {
      await saveCaseSnapshot(deps.sessionManager, agent, { ctx, sequence, emit });
    }
  } catch (error) {
    invokeError = error;
  } finally {
    for (const cleanup of cleanups) cleanup();
  }

  for (const event of events) {
    yield event;
  }

  if (invokeError !== undefined) {
    yield normalizeRunError(
      `agent invocation failed: ${describeError(invokeError)}`,
      ctx,
      sequence(),
    );
    return;
  }

  const parsed = ExecutionResultSchema.safeParse(result?.structuredOutput);
  if (!parsed.success) {
    yield normalizeRunError(
      `the model did not produce a valid ExecutionResult: ${parsed.error.message}`,
      ctx,
      sequence(),
    );
    return;
  }

  yield parsed.data;
}
