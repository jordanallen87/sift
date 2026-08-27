/**
 * The real, code-driven Home Energy Guardian Strands `Swarm`
 * (docs/specs/strands-runtime.md "Energy Swarm": "The Energy demo uses a
 * bounded Strands Swarm because the next specialist depends on what rate,
 * weather, and household evidence explains"; docs/specs/packs-and-routing.md
 * "Home Energy Guardian Decision Pack": "Orchestration: bounded Strands
 * Swarm with deterministic readiness outside the Swarm.").
 *
 * Topology (docs/specs/strands-runtime.md "Energy Swarm"): the six specialists
 * `anomaly-investigator`, `rate-analyst`, `weather-analyst`,
 * `home-systems-analyst`, `source-challenger`, `decision-synthesizer` --
 * matching `home-energy-guardian.ts`'s compiled pack `specialists[]` order
 * exactly -- with sequential, model-decided handoffs (not the Graph's fixed
 * AND-semantics edges): `energy.anomaly` runs first (nothing else can be
 * attributed before an anomaly is confirmed), `energy.rate_change` and
 * `energy.weather` each depend only on `energy.anomaly` (either order),
 * `energy.household_change` depends specifically on `energy.weather`, and
 * `energy.response_options` (owned jointly by `source-challenger` and
 * `decision-synthesizer`, mirroring `car-purchase-graph.ts`'s
 * `shortlistRequest` reuse) depends on all four.
 *
 * This is standalone construction only -- a later task wires it live into
 * the run service, exactly mirroring how `car-purchase-graph.ts` (Graph
 * construction) landed before `car-purchase-engine.ts` (live wiring) did.
 * Every node is a real Strands `Agent`, wired through the same composition
 * `strands-adapter.ts`'s single-agent `execute()` and `car-purchase-graph.ts`
 * use (`AgentSkills`, a per-node `ContextInjector`, the same six ordered
 * `InterventionHandler`s) -- multiplied across six real `Agent` instances
 * inside one real `Swarm`. `decision-synthesizer` reuses `plugins.ts`'s
 * already-built, isolated `Agent` + `GoalLoop` pair verbatim
 * (`buildDecisionSynthesizerAgent`), per strands-runtime.md's "GoalLoop
 * output validation": "only one `GoalLoop` is supported per agent ...
 * `decision-synthesizer` is therefore constructed as its own distinct
 * `Agent`, invoked as an agent-tool from the Graph or Swarm, carrying its
 * own `GoalLoop` instance."
 *
 * `wireAgentHooks`/`buildInterventions`/`assertSkillsRootDirExists`/
 * `filterToolsByName` below are deliberately re-implemented locally rather
 * than imported: `car-purchase-graph.ts` (this file's direct structural
 * precedent) does not export them either -- each Graph/Swarm construction
 * file composes the same *exported* building blocks
 * (`interventions.ts`/`plugins.ts`/`event-normalizer.ts`) into its own
 * topology-specific wiring, exactly as `car-purchase-graph.ts`'s own header
 * comment describes ("the same composition `strands-adapter.ts`'s
 * single-agent `execute()` uses").
 *
 * Documented, verified, real API differences from `car-purchase-graph.ts`
 * (installed `@strands-agents/sdk@1.14.0`; see the dated docs/build-log.md
 * entry for this task for the full trace):
 *
 * 1. **No per-node `structuredOutputSchema` on the `Agent` config.** A real
 *    Swarm's `_streamNode` (`dist/src/multiagent/swarm.js`) *always* passes
 *    its own dynamically built handoff schema
 *    (`{ agentId?: enum(otherNodeIds), message: string, context?:
 *    record(string, unknown) }`) as the per-invocation
 *    `structuredOutputSchema` to every node's `agent.stream()` call
 *    (`nodes.js`'s `AgentNode.handle`: `...(options?.structuredOutputSchema
 *    && { structuredOutputSchema: options.structuredOutputSchema })`),
 *    unconditionally overriding whatever the `Agent` was constructed with.
 *    Setting `ExecutionResultSchema` on a Swarm node's `Agent` config (the
 *    way `car-purchase-graph.ts`'s Graph nodes do) would therefore be
 *    silently ineffective every single invocation, so no Swarm node here
 *    sets one. Specialists communicate obligation evidence (claims,
 *    evidenceResults, limitations, suggestedStatus -- the exact
 *    `ExecutionResult` vocabulary) through the handoff schema's
 *    `context: Record<string, unknown>` field instead, matching
 *    strands-runtime.md verbatim: "Pax's evidence delta, obligation ID, and
 *    limitations travel inside the serialized JSON `context` field of that
 *    handoff schema; the event normalizer reads `context` to emit
 *    `swarm.handoff` with `from`, `to`, `reason`, and `evidenceDelta`."
 *    `extractHandoffContext` below parses that `context` value against the
 *    real, already-validated `ExecutionResultSchema` (read-only import from
 *    `@pax/contracts`) even though the Swarm itself never enforces that
 *    shape -- Pax's own event normalizer is what holds specialists to the
 *    spec's evidence vocabulary.
 *
 * 2. **`decision-synthesizer`'s `GoalLoop` validator must read a tool-call
 *    message, not free text.** Because of (1), `decision-synthesizer`'s
 *    final answer is *always* produced via the `strands_structured_output`
 *    tool (never a plain end-turn assistant text message) once it decides
 *    not to hand off further. `agent.js`'s structured-output capture path
 *    returns `lastMessage: assistantMessage` -- the message containing the
 *    `ToolUseBlock` for `strands_structured_output`, not a `TextBlock`.
 *    `car-purchase-graph.ts`'s `DEFAULT_VALIDATOR` (which filters
 *    `response.content` for `TextBlock`s) would therefore find no text and
 *    fail every attempt in a Swarm. `DEFAULT_SYNTHESIZER_VALIDATOR` below
 *    instead extracts the `strands_structured_output` `ToolUseBlock`'s
 *    `input.message` directly and validates that.
 *
 * 3. **The compiled pack's `calculator` tool id does not match the fixture
 *    module's own exported constant.** `packages/scenarios/src/tools/
 *    energy-calculator.ts` exports `ENERGY_CALCULATOR_TOOL_ID =
 *    'energy-calculator'`, but `home-energy-guardian.ts`'s manifest
 *    declares this tool as `id: 'calculator'` (and every specialist's
 *    `allowedTools` names it `'calculator'` too) -- unlike every other tool
 *    in this pack, where the fixture module's own constant and the pack's
 *    declared id are identical (`car-purchase.ts` follows the same
 *    identical-id convention for `ownership-calculator`, etc). Since
 *    `ScopeAuthorization` and tool-name filtering are driven entirely by
 *    the *compiled pack's* declared tool id (strands-runtime.md: "Pax
 *    intersects: compiled-pack-declared tools ∩ specialist-declared tools
 *    ∩ server registry tools ∩ current policy allowance"), this Strands
 *    `tool()` wrapper is named `'calculator'` (the pack's id), not
 *    `'energy-calculator'` (the fixture module's own constant) -- a
 *    documented judgment call, not an invented tool.
 *
 * 4. **`evaluateResponseOptions` has no specialist grant in the manifest and
 *    is not wired here.** The pack's `calculator` tool description is
 *    explicitly scoped to "the deterministic arithmetic behind baseline,
 *    anomaly, weather-attribution, and rate-change-attribution figures" --
 *    `calculateEnergyAnalysis` only. `evaluateResponseOptions` (the second
 *    function `energy-calculator.ts` exports, scoring `response-
 *    options.json` against cost/conservation weights) is never listed in
 *    any specialist's `allowedTools`: `anomaly-investigator`/`rate-analyst`/
 *    `weather-analyst` have `calculator` but no `energy.response_options`
 *    obligation; `source-challenger`/`decision-synthesizer` (the two
 *    `energy.response_options` `preferredSpecialists`) have no `calculator`
 *    grant at all. Wiring it onto any specialist here would violate the
 *    code-driven-from-compiled-pack allowedTools discipline
 *    `specialistAllowedTools` enforces (the same discipline
 *    `car-purchase-graph.ts`'s own `specialistAllowedTools` documents and
 *    its "denies a tool call outside allowlist" test proves). Matching
 *    `car-purchase-graph.ts`'s own documented, real API-limitation
 *    workaround for `decision-synthesizer` (no `ContextInjector` available
 *    to it, so case-summary facts are baked into its system prompt
 *    instead), `buildDecisionSynthesizerSystemPrompt` below bakes the
 *    static `response-options.json` facts (cost, effort, whether an option
 *    addresses the confirmed root cause) directly into
 *    `decision-synthesizer`'s system prompt as the closest honest
 *    substitute -- it still reasons over real, source-attributable facts,
 *    it just does not independently recompute a fit score via a tool call
 *    in this pass. This is a genuine manifest gap (recorded in the dated
 *    docs/build-log.md entry for this task) for the manifest-owning task to
 *    reconcile -- either granting a response-options-reading tool to one of
 *    the two `energy.response_options` specialists, or confirming that
 *    response-option ranking is intentionally a deterministic-core, not
 *    Strands, computation.
 */
import { join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { z } from 'zod';
import {
  Agent,
  AfterModelCallEvent,
  AfterToolCallEvent,
  BeforeModelCallEvent,
  BeforeToolCallEvent,
  tool,
  type BaseModelConfig,
  type InterventionHandler,
  type JSONValue,
  type Message,
  type Model,
  type ToolList,
  type ToolUseBlock,
} from '@strands-agents/sdk';
import {
  Swarm,
  BeforeNodeCallEvent,
  NodeResultEvent,
  MultiAgentHandoffEvent,
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
  BILL_READER_TOOL_ID,
  HOUSEHOLD_EVENT_LOOKUP_TOOL_ID,
  TARIFF_LOOKUP_TOOL_ID,
  USAGE_HISTORY_QUERY_TOOL_ID,
  WEATHER_LOOKUP_TOOL_ID,
  calculateEnergyAnalysis,
  lookupHouseholdEvents,
  lookupTariff,
  lookupWeather,
  queryUsageHistory,
  readCurrentBill,
} from '@pax/scenarios';
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
import { SDK_INTERNAL_TOOL_NAMES } from './strands-adapter.js';
import {
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

// --- Tool ids (see module header, judgment call 3) ---

/** The pack's declared tool id for the deterministic calculator (see module header, judgment call 3: the fixture module's own `ENERGY_CALCULATOR_TOOL_ID` constant is `'energy-calculator'`, but the compiled pack and every specialist's `allowedTools` name it `'calculator'`). */
export const CALCULATOR_TOOL_ID = 'calculator';

/** `propose_inspection`'s tool id -- the pack's one consequential effect (packages/packs/src/home-energy-guardian.ts). */
export const PROPOSE_INSPECTION_TOOL_ID = 'propose_inspection';

// --- Node ids ---

/** The four sequential, obligation-owning specialists the Swarm always visits before the response-options synthesis pair (docs/specs/packs-and-routing.md's `dependsOn` causal chain: anomaly -> {rate_change, weather} -> household_change). */
export const HOME_ENERGY_SEQUENTIAL_SPECIALIST_IDS = [
  'anomaly-investigator',
  'rate-analyst',
  'weather-analyst',
  'home-systems-analyst',
] as const;
export type HomeEnergySequentialSpecialistId =
  (typeof HOME_ENERGY_SEQUENTIAL_SPECIALIST_IDS)[number];

/** Every node id in this Swarm, in the compiled home-energy-guardian pack's `specialists[]` declaration order (strands-runtime.md "Energy Swarm"). */
export const HOME_ENERGY_SWARM_NODE_IDS = [
  ...HOME_ENERGY_SEQUENTIAL_SPECIALIST_IDS,
  'source-challenger',
  'decision-synthesizer',
] as const;
export type HomeEnergySwarmNodeId = (typeof HOME_ENERGY_SWARM_NODE_IDS)[number];

// --- Real fixture tools, wrapped as real Strands `Tool`s via `tool()` ---
// packages/scenarios/src/tools/*.ts's exact functions, per this task's
// brief. `evaluateResponseOptions` is deliberately not wired -- see module
// header, judgment call 4.

function buildBillReaderTool() {
  return tool({
    name: BILL_READER_TOOL_ID,
    description:
      'Reads the current billing cycle (billing period, tariff, usage, charges, and the fixture-reported baseline/anomaly figures) from fixture utility-account sources.',
    inputSchema: z.object({}),
    callback: (_input, context) =>
      readCurrentBill({
        ...(context?.cancelSignal !== undefined ? { signal: context.cancelSignal } : {}),
      }),
  });
}

function buildUsageHistoryQueryTool() {
  return tool({
    name: USAGE_HISTORY_QUERY_TOOL_ID,
    description:
      "Reads the household's prior billing-cycle usage history. Omit cycleLabel to list every cycle.",
    inputSchema: z.object({ cycleLabel: z.string().optional() }),
    callback: (input, context) =>
      queryUsageHistory({
        ...(input.cycleLabel !== undefined ? { cycleLabel: input.cycleLabel } : {}),
        ...(context?.cancelSignal !== undefined ? { signal: context.cancelSignal } : {}),
      }),
  });
}

function buildTariffLookupTool() {
  return tool({
    name: TARIFF_LOOKUP_TOOL_ID,
    description:
      "Reads current and historical tariff schedules for the household's utility. Omit tariffId to list both tariffs.",
    inputSchema: z.object({ tariffId: z.string().optional() }),
    callback: (input, context) =>
      lookupTariff({
        ...(input.tariffId !== undefined ? { tariffId: input.tariffId } : {}),
        ...(context?.cancelSignal !== undefined ? { signal: context.cancelSignal } : {}),
      }),
  });
}

function buildWeatherLookupTool() {
  return tool({
    name: WEATHER_LOOKUP_TOOL_ID,
    description:
      "Reads heating/cooling degree-day history for the household's weather station. Omit cycleLabel to list every cycle.",
    inputSchema: z.object({ cycleLabel: z.string().optional() }),
    callback: (input, context) =>
      lookupWeather({
        ...(input.cycleLabel !== undefined ? { cycleLabel: input.cycleLabel } : {}),
        ...(context?.cancelSignal !== undefined ? { signal: context.cancelSignal } : {}),
      }),
  });
}

function buildHouseholdEventLookupTool() {
  return tool({
    name: HOUSEHOLD_EVENT_LOOKUP_TOOL_ID,
    description:
      "Reads the household's logged appliance and household events. Omit both filters to list every event.",
    inputSchema: z.object({ eventId: z.string().optional(), type: z.string().optional() }),
    callback: (input, context) =>
      lookupHouseholdEvents({
        ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(context?.cancelSignal !== undefined ? { signal: context.cancelSignal } : {}),
      }),
  });
}

function buildCalculatorTool() {
  return tool({
    name: CALCULATOR_TOOL_ID,
    description:
      'Performs the deterministic arithmetic behind baseline, anomaly, weather-attribution, and rate-change-attribution figures.',
    inputSchema: z.object({ thresholdPercent: z.number().optional() }),
    callback: (input, context) =>
      calculateEnergyAnalysis({
        ...(input.thresholdPercent !== undefined
          ? { thresholdPercent: input.thresholdPercent }
          : {}),
        ...(context?.cancelSignal !== undefined ? { signal: context.cancelSignal } : {}),
      }),
  });
}

function buildProposeInspectionTool() {
  return tool({
    name: PROPOSE_INSPECTION_TOOL_ID,
    description:
      'Creates the consequential proposal to request an HVAC/thermostat inspection. Requires explicit human confirmation before the call proceeds. Does not schedule an actual appointment.',
    inputSchema: z.object({
      optionId: z.string(),
      rationale: z.string(),
    }),
    callback: (input) => ({
      status: 'proposed',
      optionId: input.optionId,
      rationale: input.rationale,
    }),
  });
}

/** Every real fixture tool this pack's specialists use, wrapped as real Strands `Tool`s, plus the gated `propose_inspection` consequential tool. */
export function buildHomeEnergyFixtureTools(): ToolList {
  return [
    buildBillReaderTool(),
    buildUsageHistoryQueryTool(),
    buildTariffLookupTool(),
    buildWeatherLookupTool(),
    buildHouseholdEventLookupTool(),
    buildCalculatorTool(),
    buildProposeInspectionTool(),
  ];
}

function filterToolsByName(tools: ToolList, allowedNames: readonly string[]): ToolList {
  return tools.filter((entry) => 'name' in entry && allowedNames.includes(entry.name));
}

/** `pack.specialists[].allowedTools` for `nodeId`, code-driven from the compiled pack (never hand-duplicated) -- strands-runtime.md "Orchestration": "Graph construction is code-driven from validated compiled pack declarations," applied identically to Swarm construction. */
function specialistAllowedTools(pack: CompiledDecisionPack, nodeId: string): string[] {
  const specialist = pack.specialists.find((entry) => entry.id === nodeId);
  if (specialist === undefined) {
    throw new Error(
      `home-energy-swarm: compiled pack "${pack.identity.id}@${pack.identity.version}" declares no specialist "${nodeId}"`,
    );
  }
  return [...specialist.allowedTools];
}

/** `pack.specialists[].description` for `nodeId`, used both for the Swarm's own handoff-routing schema text (`AgentNode`'s `config.description`, derived from `Agent.description`) and this node's system prompt. */
function specialistDescription(pack: CompiledDecisionPack, nodeId: string): string {
  const specialist = pack.specialists.find((entry) => entry.id === nodeId);
  if (specialist === undefined) {
    throw new Error(
      `home-energy-swarm: compiled pack "${pack.identity.id}@${pack.identity.version}" declares no specialist "${nodeId}"`,
    );
  }
  return specialist.description;
}

export interface HomeEnergySwarmDeps {
  /** The validated, compiled `home-energy-guardian` pack. Node tool grants come from `pack.specialists[].allowedTools` -- code-driven, never hand-duplicated. */
  pack: CompiledDecisionPack;
  /** Selects the model each node's `Agent` uses. A distinct `ScriptedModelProvider` instance per node is required for deterministic tests -- see `CarPurchaseGraphDeps.modelFor`'s identical rationale in `car-purchase-graph.ts` (per-node isolation, no shared mutable "current beat"). */
  modelFor: (nodeId: HomeEnergySwarmNodeId) => Model<BaseModelConfig> | string;
  skillsRootDir: string;
  clock: Clock;
  idGenerator: IdGenerator;
  /** One `ExecutionRequest` per sequential specialist, each carrying that specialist's own active obligation (energy.anomaly / energy.rate_change / energy.weather / energy.household_change). */
  specialistRequests: Record<HomeEnergySequentialSpecialistId, ExecutionRequest>;
  /** `source-challenger` and `decision-synthesizer`'s shared `ExecutionRequest` (obligation `energy.response_options`), mirroring `car-purchase-graph.ts`'s `shortlistRequest` reuse across `source-challenger`/`decision-synthesizer`. */
  responseOptionsRequest: ExecutionRequest;
  /** The node the Swarm starts at. Defaults to `'anomaly-investigator'` (packs-and-routing.md: "The engine investigates the anomaly in the background before creating a human action"). Overridable so a focused test can start mid-chain (e.g. at `'weather-analyst'` to exercise the steering handoff, or at `'decision-synthesizer'` to exercise a criteria reweight) without re-scripting every upstream specialist. */
  start?: HomeEnergySwarmNodeId;
  /** Defaults to `[PROPOSE_INSPECTION_TOOL_ID]` -- the pack's one consequential effect. */
  consequentialToolIds?: readonly string[];
  forbiddenToolIds?: readonly string[];
  /** Deterministic fixture-mode confirmation resolver for `ConsequenceGuard`. See `strands-adapter.ts`. */
  resolveConfirmation?: (toolName: string, input: JSONValue) => JSONValue | undefined;
  /** Overrides `decision-synthesizer`'s system prompt. Defaults to a prompt built from `responseOptionsRequest` plus the static response-options facts (see module header, judgment call 4). */
  decisionSynthesizerSystemPrompt?: string;
  /** Overrides `decision-synthesizer`'s `GoalLoop` validator. Defaults to `DEFAULT_SYNTHESIZER_VALIDATOR` (see module header, judgment call 2). */
  decisionSynthesizerValidator?: Validator;
  /** Overrides the Swarm's `invoke()` input. Every node builds its own instructions from its own `ExecutionRequest`'s injected context, so this text only needs to identify the run at a high level. Defaults to a prompt built from the starting node's own request. */
  invokePrompt?: string;
  /** Overrides `GoalLoop.maxAttempts`. Defaults to `2` (strands-runtime.md "GoalLoop output validation"). */
  goalLoopMaxAttempts?: number;
  /** Per-node `RetrySteering` alternative-technique hint (strands-runtime.md: "The guidance identifies an allowed alternative technique from the active skill."). */
  alternativeTechniqueHints?: Partial<Record<HomeEnergySwarmNodeId, string>>;
}

/** One real Swarm handoff, normalized from the SDK's `MultiAgentHandoffEvent` plus the completed source node's parsed `context` (strands-runtime.md "Energy Swarm": "A handoff emits `swarm.handoff`"; debugging-and-observability.md: "Swarm handoff source, target, reason, evidence delta, and cycle counter"). */
export interface HomeEnergySwarmHandoff {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  readonly evidenceDelta: number;
}

/** `goalLoop.lastResult(agent)`'s shape, re-declared narrowly here so this module does not need to import the SDK's own (unexported-by-name) GoalLoop result type -- identical rationale to `car-purchase-graph.ts`'s `CarPurchaseGoalLoopResult`. */
export interface HomeEnergySwarmGoalLoopResult {
  readonly passed: boolean;
  readonly stopReason: string;
  readonly attempts: readonly { passed: boolean; feedback?: string }[];
}

export interface HomeEnergySwarmResult {
  readonly multiAgentResult: MultiAgentResult;
  /** Node ids in the order their `BeforeNodeCallEvent` fired (real Swarm scheduling order). */
  readonly nodeStartOrder: string[];
  /** Node ids in the order their `NodeResultEvent` fired (real Swarm completion order). */
  readonly nodeFinishOrder: string[];
  /** Every real handoff the Swarm made, in order. */
  readonly handoffs: readonly HomeEnergySwarmHandoff[];
  /** The validated `context` (`ExecutionResult`-shaped) each node's handoff structured output carried, keyed by node id. */
  readonly contexts: Partial<Record<HomeEnergySwarmNodeId, ExecutionResult>>;
  /** `decision-synthesizer`'s final GoalLoop-validated handoff `message`. */
  readonly decisionSynthesizerText: string;
  /** The `propose_inspection` tool call `decision-synthesizer` made, captured from its `beforeToolCall` hook -- undefined if it never called the tool. */
  readonly proposedInspection: { optionId: string; rationale: string } | undefined;
  readonly goalLoopResult: HomeEnergySwarmGoalLoopResult | undefined;
  /** `true` when the Swarm's own hard repetitive-handoff safety net tripped (strands-runtime.md: "returns a `FAILED` multi-agent result when tripped; it does not redirect gracefully"). Should never be `true` in the deterministic demo trajectory -- Pax's own `RetrySteering` must trip first. */
  readonly repetitiveHandoffDetected: boolean;
}

/** The handoff schema shape every Swarm node's `strands_structured_output` call produces (docs/specs/strands-runtime.md "Energy Swarm"). Matches the real, dynamically-built Zod schema `Swarm._buildHandoffSchema` constructs per node (verified against the installed `@strands-agents/sdk@1.14.0` package; see module header). */
interface SwarmHandoffOutput {
  agentId?: string;
  message: string;
  context?: Record<string, unknown>;
}

function extractHandoffContext(structuredOutput: unknown): ExecutionResult | undefined {
  if (
    structuredOutput === null ||
    typeof structuredOutput !== 'object' ||
    !('context' in structuredOutput)
  ) {
    return undefined;
  }
  const context = (structuredOutput as { context?: unknown }).context;
  if (context === undefined) return undefined;
  const parsed = ExecutionResultSchema.safeParse(context);
  return parsed.success ? parsed.data : undefined;
}

/** Derives a human-readable `swarm.handoff` reason from the source node's parsed context. Not spec-mandated verbatim (strands-runtime.md names the fields a `swarm.handoff` event must carry, not an exact derivation algorithm) -- a documented judgment call: prefer the first limitation (an open question the next specialist should address), then the first claim, then the suggested status. */
function deriveHandoffReason(context: ExecutionResult | undefined): string {
  if (context === undefined) return 'handoff (no structured context provided)';
  if (context.limitations.length > 0) return context.limitations[0]!;
  if (context.claims.length > 0) return context.claims[0]!.statement;
  return `disposition: ${context.disposition}`;
}

/** Evidence delta for a `swarm.handoff` event: the count of newly passing evidence items the source node's context carried (strands-runtime.md "Retry steering rules"' own evidence-delta vocabulary, applied to a whole node's handoff rather than one tool call). */
function deriveEvidenceDelta(context: ExecutionResult | undefined): number {
  return context?.evidenceResults.filter((result) => result.verdict === 'pass').length ?? 0;
}

/**
 * Collected mutable state one call to `executeHomeEnergySwarm` accumulates
 * across every node's hooks -- one run, one shared buffer, one shared
 * monotonic `sequence`, identical rationale to `car-purchase-graph.ts`'s
 * `RunAccumulator`.
 */
interface RunAccumulator {
  events: RuntimeEvent[];
  sequence: () => number;
  traceId: string;
  runId: string;
  caseId: string;
  sessionId?: string;
}

function emitSwarmNodeEvent(
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
    category: 'swarm',
    name: params.phase === 'start' ? 'swarm.node_started' : 'swarm.node_completed',
    phase: params.phase === 'start' ? 'start' : 'finish',
    level: 'info',
    summary:
      params.phase === 'start'
        ? `Swarm node "${params.nodeId}" started.`
        : `Swarm node "${params.nodeId}" completed with status "${params.status ?? 'unknown'}".`,
    attributes: {
      nodeId: params.nodeId,
      ...(params.status !== undefined ? { status: params.status } : {}),
    },
    redactions: [],
  };
  acc.events.push(event);
}

function emitSwarmHandoffEvent(acc: RunAccumulator, handoff: HomeEnergySwarmHandoff): void {
  const event: RuntimeDebugEvent = {
    schemaVersion: '1.0',
    sequence: acc.sequence(),
    timestamp: new Date().toISOString(),
    traceId: acc.traceId,
    caseId: acc.caseId,
    runId: acc.runId,
    ...(acc.sessionId !== undefined ? { sessionId: acc.sessionId } : {}),
    category: 'swarm',
    name: 'swarm.handoff',
    phase: 'finish',
    level: 'info',
    summary: `Swarm handoff: "${handoff.from}" -> "${handoff.to}" (${handoff.reason}).`,
    attributes: {
      from: handoff.from,
      to: handoff.to,
      reason: handoff.reason,
      evidenceDelta: handoff.evidenceDelta,
    },
    redactions: [],
  };
  acc.events.push(event);
}

function emitSwarmCycleDetectedEvent(acc: RunAccumulator, message: string): void {
  const event: RuntimeDebugEvent = {
    schemaVersion: '1.0',
    sequence: acc.sequence(),
    timestamp: new Date().toISOString(),
    traceId: acc.traceId,
    caseId: acc.caseId,
    runId: acc.runId,
    ...(acc.sessionId !== undefined ? { sessionId: acc.sessionId } : {}),
    category: 'swarm',
    name: 'swarm.cycle_detected',
    phase: 'error',
    level: 'warn',
    summary: `Swarm repetitive-handoff safety net tripped: ${message}`,
    attributes: {},
    redactions: [],
  };
  acc.events.push(event);
}

function emitSwarmTimeoutEvent(acc: RunAccumulator, message: string): void {
  const event: RuntimeDebugEvent = {
    schemaVersion: '1.0',
    sequence: acc.sequence(),
    timestamp: new Date().toISOString(),
    traceId: acc.traceId,
    caseId: acc.caseId,
    runId: acc.runId,
    ...(acc.sessionId !== undefined ? { sessionId: acc.sessionId } : {}),
    category: 'swarm',
    name: 'swarm.timeout',
    phase: 'error',
    level: 'error',
    summary: `Swarm exceeded its configured wall-clock budget: ${message}`,
    attributes: {},
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
    alternativeTechniqueHint?: string;
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
      ...(deps.alternativeTechniqueHint !== undefined
        ? { alternativeTechniqueHint: deps.alternativeTechniqueHint }
        : {}),
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

/** Sanity guard, identical to `car-purchase-graph.ts`'s `assertSkillsRootDirExists`: confirms `skillsRootDir` really is a directory of skill subdirectories. */
function assertSkillsRootDirExists(skillsRootDir: string): void {
  const entries = readdirSync(skillsRootDir);
  if (!entries.some((entry) => statSync(join(skillsRootDir, entry)).isDirectory())) {
    throw new Error(
      `home-energy-swarm: skillsRootDir "${skillsRootDir}" has no skill subdirectories`,
    );
  }
}

function buildInvokePrompt(request: ExecutionRequest): string {
  return `Investigate obligation "${request.obligation.id}" for case "${request.caseId}": ${request.obligation.question}`;
}

function buildSystemPrompt(
  nodeId: string,
  request: ExecutionRequest,
  roleDescription: string,
): string {
  return [
    `You are "${nodeId}", a Pax Strands specialist in the "${request.pack.id}@${request.pack.version}" Swarm. ${roleDescription}`,
    `Active obligation: "${request.obligation.id}" -- ${request.obligation.question}`,
    'Use only the tools made available to you. Cite a source id for every claim.',
    'When you have gathered enough evidence for this obligation, call the structured output tool. Set agentId to the specialist who should investigate next (omit it only if you are ending the run), a message describing what you found and why that specialist should go next, and a context object carrying obligationId, disposition, claims, evidenceResults, limitations, and suggestedStatus.',
  ].join('\n');
}

/** Builds `decision-synthesizer`'s system prompt, baking in the static `response-options.json` facts a Context Injector would otherwise have supplied -- see module header, judgment call 4. */
function buildDecisionSynthesizerSystemPrompt(request: ExecutionRequest): string {
  const criteriaText = request.caseSummary.criteria
    .map((criterion) => `${criterion.id} (weight ${criterion.weight}, ${criterion.direction})`)
    .join('; ');
  const extensionsText = request.caseExtensions
    .filter((extension) => extension.confirmation === 'confirmed')
    .map((extension) => extension.label)
    .join('; ');
  return [
    'You are "decision-synthesizer", synthesizing resolved evidence across every prior home-energy-guardian obligation into a source-linked response-options ranking.',
    `Active obligation: "${request.obligation.id}" -- ${request.obligation.question}`,
    `Current criteria: ${criteriaText || '(none)'}.`,
    extensionsText.length > 0 ? `Confirmed case-specific concerns: ${extensionsText}.` : '',
    'Known response options (response-options.json): monitor-one-cycle ($0, low effort, does not address the root cause), change-rate-plan ($0, low effort, does not address the root cause), request-energy-audit ($250, medium effort, does not address the root cause, consequential), request-hvac-inspection ($165, medium effort, addresses the confirmed thermostat-sensor-drift root cause, consequential -- requires human confirmation via propose_inspection before it is recorded).',
    'Cite a source id for every factual claim. Call propose_inspection only when the household should be asked to confirm requesting an inspection -- it requires human confirmation before it proceeds and never schedules an actual appointment. When you are done, call the structured output tool with agentId omitted (ending the run) and a message giving your final recommendation.',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

function extractHandoffToolUse(response: Message): SwarmHandoffOutput | undefined {
  const block = response.content.find(
    (entry): entry is ToolUseBlock =>
      entry.type === 'toolUseBlock' && entry.name === 'strands_structured_output',
  );
  if (block === undefined) return undefined;
  return block.input as unknown as SwarmHandoffOutput;
}

/**
 * Default `decision-synthesizer` `GoalLoop` validator -- see module header,
 * judgment call 2: unlike `car-purchase-graph.ts`'s `DEFAULT_VALIDATOR`
 * (which reads free-text `TextBlock`s), a Swarm node's final answer is
 * always produced via the `strands_structured_output` tool call, so this
 * validator extracts and checks the handoff schema's `message` field
 * directly from the raw assistant `Message`'s tool-use content block.
 */
export const DEFAULT_SYNTHESIZER_VALIDATOR: Validator = (response) => {
  const handoff = extractHandoffToolUse(response);
  const text = handoff?.message ?? '';
  if (text.trim().length === 0) {
    return {
      passed: false,
      feedback: 'The recommendation must include a message explaining the decision.',
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

const SWARM_ROLE_FALLBACK: Record<HomeEnergySwarmNodeId, string> = {
  'anomaly-investigator':
    'Compute the normalized baseline for the current billing cycle and determine whether the current bill is materially abnormal relative to it.',
  'rate-analyst':
    'Compare current and prior tariff terms to isolate how much of the anomaly is attributable to the rate change.',
  'weather-analyst':
    'Compare actual and typical heating/cooling degree days to estimate how much of the anomaly is attributable to weather.',
  'home-systems-analyst':
    'Correlate household and appliance events against the anomalous billing cycle to identify a plausible non-weather, non-rate explanation for remaining usage.',
  'source-challenger':
    'Evaluate provenance, recency, and contradictions across submitted evidence before it can satisfy an obligation.',
  'decision-synthesizer':
    'Synthesize resolved evidence across all prior obligations into a source-linked response-options ranking.',
};

function requestFor(nodeId: HomeEnergySwarmNodeId, deps: HomeEnergySwarmDeps): ExecutionRequest {
  if (nodeId === 'source-challenger' || nodeId === 'decision-synthesizer') {
    return deps.responseOptionsRequest;
  }
  return deps.specialistRequests[nodeId];
}

/** Builds one non-synthesizer node's `Agent`, fully wired with skills/context/interventions -- the same composition as `strands-adapter.ts`'s single-agent `execute()` and `car-purchase-graph.ts`'s `buildSpecialistAgent`, minus the (Swarm-ineffective, see module header) `structuredOutputSchema`. */
function buildSwarmSpecialistAgent(
  nodeId: HomeEnergySequentialSpecialistId | 'source-challenger',
  request: ExecutionRequest,
  deps: HomeEnergySwarmDeps,
  acc: RunAccumulator,
): { agent: Agent; unwireHooks: () => void } {
  const allowedTools = specialistAllowedTools(deps.pack, nodeId);
  const allowedToolsWithInternals = [...allowedTools, ...SDK_INTERNAL_TOOL_NAMES];
  const roleDescription = specialistDescription(deps.pack, nodeId) || SWARM_ROLE_FALLBACK[nodeId];
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
      ...(deps.alternativeTechniqueHints?.[nodeId] !== undefined
        ? { alternativeTechniqueHint: deps.alternativeTechniqueHints[nodeId] }
        : {}),
    },
    emitIntervention,
  );

  const skillsPlugin = buildSkillsPlugin(deps.skillsRootDir);
  const contextInjector = buildContextInjector(request, {
    ctx,
    sequence: acc.sequence,
    emit: (event) => acc.events.push(event),
  });

  const tools = filterToolsByName(buildHomeEnergyFixtureTools(), allowedTools);
  const agent = new Agent({
    id: nodeId,
    name: nodeId,
    description: roleDescription,
    model: deps.modelFor(nodeId),
    printer: false,
    systemPrompt: buildSystemPrompt(nodeId, request, roleDescription),
    tools,
    plugins: [skillsPlugin, contextInjector],
    interventions,
  });

  const unwireHooks = wireAgentHooks(agent, ctx, acc);
  return { agent, unwireHooks };
}

/**
 * Runs the real bounded Home Energy Guardian Strands `Swarm` once. Yields
 * every normalized `RuntimeEvent` the run produced (tool/model calls, skill
 * activation, context injection, interventions, GoalLoop attempts, and
 * `swarm.node_started`/`swarm.node_completed`/`swarm.handoff`/
 * `swarm.cycle_detected`/`swarm.timeout` events), then returns the full
 * `HomeEnergySwarmResult`.
 */
export async function* executeHomeEnergySwarm(
  deps: HomeEnergySwarmDeps,
): AsyncGenerator<RuntimeEvent, HomeEnergySwarmResult, undefined> {
  assertSkillsRootDirExists(deps.skillsRootDir);

  const startNodeId: HomeEnergySwarmNodeId = deps.start ?? 'anomaly-investigator';
  const startRequest = requestFor(startNodeId, deps);

  const acc: RunAccumulator = {
    events: [],
    sequence: createSequenceCounter(),
    traceId: deps.idGenerator.next('trace'),
    runId: startRequest.runId,
    caseId: startRequest.caseId,
  };

  const unwireCleanups: (() => void)[] = [];
  const agents: Record<HomeEnergySwarmNodeId, Agent> = {} as never;

  for (const nodeId of [...HOME_ENERGY_SEQUENTIAL_SPECIALIST_IDS, 'source-challenger'] as const) {
    const built = buildSwarmSpecialistAgent(nodeId, requestFor(nodeId, deps), deps, acc);
    agents[nodeId] = built.agent;
    unwireCleanups.push(built.unwireHooks);
  }

  // --- decision-synthesizer: reuse plugins.ts's isolated Agent+GoalLoop pair verbatim ---
  const synthesizerRequest = deps.responseOptionsRequest;
  const proposeInspectionTool = filterToolsByName(buildHomeEnergyFixtureTools(), [
    PROPOSE_INSPECTION_TOOL_ID,
  ]);
  const synthesizerCtx: NormalizerContext = {
    traceId: acc.traceId,
    runId: acc.runId,
    caseId: acc.caseId,
    obligationId: synthesizerRequest.obligation.id,
    agentId: 'decision-synthesizer',
    ...(acc.sessionId !== undefined ? { sessionId: acc.sessionId } : {}),
  };
  const emitSynthesizerIntervention = (event: InterventionEvent): void => {
    acc.events.push(normalizeIntervention(event, synthesizerCtx, acc.sequence()));
  };
  const synthesizerInterventions = buildInterventions(
    {
      runId: acc.runId,
      obligationId: synthesizerRequest.obligation.id,
      clock: deps.clock,
      allowedTools: [PROPOSE_INSPECTION_TOOL_ID, ...SDK_INTERNAL_TOOL_NAMES],
      consequentialToolIds: deps.consequentialToolIds ?? [PROPOSE_INSPECTION_TOOL_ID],
      forbiddenToolIds: deps.forbiddenToolIds ?? [],
      ...(deps.resolveConfirmation !== undefined
        ? { resolveConfirmation: deps.resolveConfirmation }
        : {}),
      maxToolCallsPerRun: synthesizerRequest.limits.maxToolCallsPerRun,
      attemptsUsedForObligation: synthesizerRequest.priorAttempts.length,
      maxAttemptsPerObligation: synthesizerRequest.limits.maxAttemptsPerObligation,
    },
    emitSynthesizerIntervention,
  );

  const { agent: synthesizerAgent, goalLoop } = buildDecisionSynthesizerAgent({
    model: deps.modelFor('decision-synthesizer'),
    systemPrompt:
      deps.decisionSynthesizerSystemPrompt ??
      buildDecisionSynthesizerSystemPrompt(synthesizerRequest),
    validator: deps.decisionSynthesizerValidator ?? DEFAULT_SYNTHESIZER_VALIDATOR,
    tools: proposeInspectionTool,
    interventions: synthesizerInterventions,
    ...(deps.goalLoopMaxAttempts !== undefined ? { maxAttempts: deps.goalLoopMaxAttempts } : {}),
  });
  // `decision-synthesizer`'s `description` (used for Swarm handoff-routing
  // text) is set via `Agent.description`, unlike the other five nodes
  // (which get it through `buildSwarmSpecialistAgent`) -- mirrored
  // separately here because `DecisionSynthesizerConfig` (`plugins.ts`,
  // read-only) has no `description` field, matching `car-purchase-graph.ts`'s
  // identical constraint for the same function. `Agent.description` is
  // assignable post-construction is not supported by the SDK, so this node's
  // handoff routing text falls back to the SDK's own "no description"
  // rendering (`- decision-synthesizer` with no trailing description) --
  // documented here rather than silently absent.
  agents['decision-synthesizer'] = synthesizerAgent;
  unwireCleanups.push(wireAgentHooks(synthesizerAgent, synthesizerCtx, acc));

  let proposedInspection: HomeEnergySwarmResult['proposedInspection'];
  const captureProposal = synthesizerAgent.addHook(BeforeToolCallEvent, (event) => {
    if (event.toolUse.name !== PROPOSE_INSPECTION_TOOL_ID) return;
    const input = event.toolUse.input as { optionId?: unknown; rationale?: unknown };
    if (typeof input.optionId === 'string' && typeof input.rationale === 'string') {
      proposedInspection = { optionId: input.optionId, rationale: input.rationale };
    }
  });
  unwireCleanups.push(captureProposal);

  // --- Swarm construction: code-driven from the compiled pack's declared orchestration bounds ---
  const swarm = new Swarm({
    id: 'home-energy-swarm',
    nodes: HOME_ENERGY_SWARM_NODE_IDS.map((id) => agents[id]),
    start: startNodeId,
    maxSteps: deps.pack.orchestration.maxSteps,
    nodeTimeout: deps.pack.orchestration.nodeTimeoutMs,
    timeout: deps.pack.orchestration.totalTimeoutMs,
    repetitiveHandoffDetectionWindow: deps.pack.orchestration.repetitiveHandoffDetectionWindow ?? 0,
    repetitiveHandoffMinUniqueAgents: deps.pack.orchestration.repetitiveHandoffMinUniqueAgents ?? 0,
  });

  const nodeStartOrder: string[] = [];
  const nodeFinishOrder: string[] = [];
  const handoffs: HomeEnergySwarmHandoff[] = [];
  const contexts: HomeEnergySwarmResult['contexts'] = {};
  let lastCompleted: { nodeId: string; context: ExecutionResult | undefined } | undefined;

  const swarmCleanups = [
    swarm.addHook(BeforeNodeCallEvent, (event) => {
      nodeStartOrder.push(event.nodeId);
      emitSwarmNodeEvent(acc, { nodeId: event.nodeId, phase: 'start' });
    }),
    swarm.addHook(NodeResultEvent, (event) => {
      nodeFinishOrder.push(event.nodeId);
      const context = extractHandoffContext(event.result.structuredOutput);
      if (event.nodeId in agents && context !== undefined) {
        contexts[event.nodeId as HomeEnergySwarmNodeId] = context;
      }
      lastCompleted = { nodeId: event.nodeId, context };
      emitSwarmNodeEvent(acc, {
        nodeId: event.nodeId,
        phase: 'finish',
        status: event.result.status,
      });
    }),
    swarm.addHook(MultiAgentHandoffEvent, (event) => {
      const target = event.targets[0] ?? 'unknown';
      const context = lastCompleted?.nodeId === event.source ? lastCompleted.context : undefined;
      const handoff: HomeEnergySwarmHandoff = {
        from: event.source,
        to: target,
        reason: deriveHandoffReason(context),
        evidenceDelta: deriveEvidenceDelta(context),
      };
      handoffs.push(handoff);
      emitSwarmHandoffEvent(acc, handoff);
    }),
  ];

  let multiAgentResult: MultiAgentResult;
  try {
    multiAgentResult = await swarm.invoke(deps.invokePrompt ?? buildInvokePrompt(startRequest));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('exceeded wall-clock budget')) {
      emitSwarmTimeoutEvent(acc, message);
      for (const event of acc.events) yield event;
    }
    throw error;
  } finally {
    for (const cleanup of swarmCleanups) cleanup();
    for (const cleanup of unwireCleanups) cleanup();
  }

  const repetitiveHandoffDetected =
    multiAgentResult.status === 'FAILED' &&
    (multiAgentResult.error?.message.includes('Repetitive handoff') ?? false);
  if (repetitiveHandoffDetected) {
    emitSwarmCycleDetectedEvent(acc, multiAgentResult.error?.message ?? 'repetitive handoff');
  }

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
      acc.events.push(
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

  for (const event of acc.events) {
    yield event;
  }

  const synthesizerNodeResult = multiAgentResult.results.find(
    (entry) => entry.nodeId === 'decision-synthesizer',
  );
  const synthesizerOutput = synthesizerNodeResult?.structuredOutput as
    SwarmHandoffOutput | undefined;
  const decisionSynthesizerText = synthesizerOutput?.message ?? '';

  const goalLoopResult: HomeEnergySwarmGoalLoopResult | undefined =
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
    handoffs,
    contexts,
    decisionSynthesizerText,
    proposedInspection,
    goalLoopResult,
    repetitiveHandoffDetected,
  };
}
