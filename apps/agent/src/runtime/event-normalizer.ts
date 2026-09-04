/**
 * Converts real Strands TypeScript SDK hook events (`BeforeToolCallEvent`,
 * `AfterToolCallEvent`, `BeforeModelCallEvent`, `AfterModelCallEvent`) and
 * Sift's own runtime-layer moments (skill activation, context injection,
 * intervention decisions, GoalLoop validation, session snapshot save/
 * restore) into the normalized `RuntimeDebugEvent` shape defined in
 * docs/specs/debugging-and-observability.md ("Runtime event contract").
 *
 * `RuntimeEvent` (docs/superpowers/plans/2026-08-26-pax-hackathon-build.md
 * Task 6: `execute(...): AsyncIterable<RuntimeEvent | ExecutionResult>`) is
 * not separately defined anywhere in the spec set beyond that one signature
 * reference. debugging-and-observability.md's "Required captured behavior"
 * list (skill activation, context injection, intervention decisions,
 * GoalLoop attempts, session save/restore, tool/model start-finish-error)
 * maps one-to-one onto `RuntimeDebugEvent.category`/`.name` (the
 * `RUNTIME_DEBUG_CATEGORIES` union already includes `skill`/`context`/
 * `intervention`/`goal`/`session`/`tool`/`model`). `RuntimeEvent` is
 * therefore modeled here as a plain alias of `RuntimeDebugEvent` -- the
 * single normalized event shape that flows through `strands-adapter.ts`'s
 * `execute()` stream -- rather than inventing a second, narrower type.
 *
 * OTEL span correlation itself (calling Strands's real `setupTracer()` /
 * `AgentTrace` and threading live span IDs through `RuntimeCorrelation`) is
 * explicitly a later observability task's responsibility
 * (docs/specs/debugging-and-observability.md "OpenTelemetry and
 * AgentCore"); `NormalizerContext` carries `spanId`/`parentSpanId` fields
 * for forward compatibility, but this pass populates `RuntimeCorrelation`
 * only from run/case/session/obligation/agent identifiers actually
 * available to the runtime layer today, never a fabricated span ID.
 */
import { createHash } from 'node:crypto';
import type {
  AfterModelCallEvent,
  AfterToolCallEvent,
  BeforeModelCallEvent,
  BeforeToolCallEvent,
} from '@strands-agents/sdk';
import type {
  JsonPatchOperation,
  Redaction,
  RuntimeCorrelation,
  RuntimeDebugEvent,
  TokenUsage,
} from '@sift/contracts';
import type { InterventionEvent } from './interventions.js';

/** The single normalized event shape `strands-adapter.ts`'s `execute()` yields alongside `ExecutionResult`. See module header. */
export type RuntimeEvent = RuntimeDebugEvent;

/** Everything a normalizer needs to stamp `RuntimeCorrelation` onto one event. `spanId`/`parentSpanId`/`requestId` are accepted but unused until a later OTEL integration task populates them (see module header). */
export interface NormalizerContext {
  traceId: string;
  runId: string;
  caseId: string;
  sessionId?: string;
  obligationId?: string;
  agentId?: string;
  spanId?: string;
  parentSpanId?: string;
  requestId?: string;
}

/** Returns a monotonically increasing sequence number generator, scoped to one run (debugging-and-observability.md: "`sequence` is monotonic within a run"). */
export function createSequenceCounter(start = 0): () => number {
  let next = start;
  return () => next++;
}

/** Deterministic SHA-256 hex digest, used for `context.injected`'s content hash (never the raw injected text itself -- strands-runtime.md "Context injection": "a content hash, never private source bodies"). */
export function hashContent(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const REDACTED_PLACEHOLDER = '[REDACTED]';

/** Object/record keys that are always redacted regardless of value shape (debugging-and-observability.md: "Environment variables, authorization headers, cookies, credentials, account identifiers ... are always removed before persistence"). Deliberately excludes Sift's own correlation fields (`sessionId`, `caseId`, `runId`, ...), which are legitimate, non-secret identifiers. */
const SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|set-cookie|password|secret|token|refresh[-_]?token|api[-_]?key|access[-_]?key|private[-_]?key|credential(s)?|aws[-_]?secret[-_]?access[-_]?key)$/i;

/**
 * Value-shaped secret patterns scanned in every string leaf regardless of
 * key name -- "configured secret patterns" (debugging-and-observability.md).
 * Bounded to a small, deliberate default set rather than a speculative
 * catch-all: AWS access key IDs, bearer tokens, OpenAI/Anthropic-style
 * `sk-...` API keys, and a seeded test canary
 * (`SIFT_TEST_SECRET_...`) so redaction is directly assertable in tests
 * without depending on a real-looking credential ("Secrets and seeded
 * redaction canaries never appear ...", debugging-and-observability.md
 * "Acceptance requirements").
 */
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bSIFT_TEST_SECRET_[A-Za-z0-9]+\b/g,
];

const MAX_REDACTION_DEPTH = 6;

function redactString(value: string, path: string, redactions: Redaction[]): string {
  let result = value;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    if (pattern.test(result)) {
      redactions.push({ path, reason: 'matched a configured secret pattern' });
    }
    // Reset lastIndex for the global-flag patterns before reuse.
    pattern.lastIndex = 0;
    result = result.replace(pattern, REDACTED_PLACEHOLDER);
  }
  return result;
}

function redactAt(value: unknown, path: string, depth: number, redactions: Redaction[]): unknown {
  if (depth > MAX_REDACTION_DEPTH) {
    return '[TRUNCATED]';
  }
  if (typeof value === 'string') {
    return redactString(value, path, redactions);
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => redactAt(entry, `${path}[${index}]`, depth + 1, redactions));
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      const childPath = path.length > 0 ? `${path}.${key}` : key;
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = REDACTED_PLACEHOLDER;
        redactions.push({ path: childPath, reason: 'key matches a credential/secret field name' });
        continue;
      }
      out[key] = redactAt(source[key], childPath, depth + 1, redactions);
    }
    return out;
  }
  return value;
}

/** Walks `value`, replacing anything credential-shaped (by key name or value pattern) with `[REDACTED]`, and returns the sanitized value plus a manifest of what was redacted and why. Safe to call on `undefined`/primitives. */
export function redactValue(value: unknown): { value: unknown; redactions: Redaction[] } {
  const redactions: Redaction[] = [];
  const redacted = redactAt(value, '', 0, redactions);
  return { value: redacted, redactions };
}

function buildCorrelation(ctx: NormalizerContext): RuntimeCorrelation {
  return {
    traceId: ctx.traceId,
    caseId: ctx.caseId,
    runId: ctx.runId,
    ...(ctx.spanId !== undefined ? { spanId: ctx.spanId } : {}),
    ...(ctx.parentSpanId !== undefined ? { parentSpanId: ctx.parentSpanId } : {}),
    ...(ctx.requestId !== undefined ? { requestId: ctx.requestId } : {}),
    ...(ctx.sessionId !== undefined ? { sessionId: ctx.sessionId } : {}),
    ...(ctx.obligationId !== undefined ? { obligationId: ctx.obligationId } : {}),
    ...(ctx.agentId !== undefined ? { agentId: ctx.agentId } : {}),
  };
}

interface BuildEventInput {
  category: RuntimeDebugEvent['category'];
  name: string;
  phase: RuntimeDebugEvent['phase'];
  level: RuntimeDebugEvent['level'];
  summary: string;
  attributes: Record<string, unknown>;
  payload?: unknown;
  redactions?: Redaction[];
  /** Real measured/reported duration of the call this event closes. Omitted -- never `0` -- when nothing genuinely measured it (see `createRuntimeMetricsTracker`). */
  durationMs?: number;
  /** Real provider-reported token usage for the call this event closes. Omitted -- never zeros -- when the provider reported none (see `createRuntimeMetricsTracker`). */
  tokenUsage?: TokenUsage;
}

function buildEvent(
  ctx: NormalizerContext,
  sequence: number,
  input: BuildEventInput,
): RuntimeDebugEvent {
  return {
    ...buildCorrelation(ctx),
    schemaVersion: '1.0',
    sequence,
    timestamp: new Date().toISOString(),
    category: input.category,
    name: input.name,
    phase: input.phase,
    level: input.level,
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
    ...(input.tokenUsage !== undefined ? { tokenUsage: input.tokenUsage } : {}),
    summary: input.summary,
    attributes: input.attributes,
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
    redactions: input.redactions ?? [],
  };
}

/**
 * `RuntimeDebugEvent.estimatedCostUsd` is deliberately never populated by any
 * normalizer in this module, and deliberately has no producer anywhere in
 * Sift.
 *
 * A cost figure needs a price per input/output token for the exact model
 * that served the call. `@strands-agents/sdk@1.14.0` publishes no price
 * table (`Usage` in `models/streaming.d.ts` counts tokens only; `Meter`
 * accumulates those counts and model latency, and nothing else), Sift
 * carries no pricing configuration, and Bedrock's own per-model rates are
 * neither installed nor reachable from a fixture-mode run. Multiplying a
 * real token count by a remembered rate would produce a number that *looks*
 * sourced and is not, which CLAUDE.md's "Never fabricate telemetry" rule
 * forbids more strongly than it minds a blank field.
 *
 * `routes/debug.ts` already treats the field as genuinely optional -- its
 * run overview reports `estimatedCostUsd: null` unless at least one event
 * carried one -- so the Inspector renders a token line with no cost line,
 * which is the honest state. If a sourced price table is ever added to Sift
 * config, the one place to compute this is here, from the `tokenUsage`
 * delta below plus `event.model.modelId`.
 */

// --- Per-call duration and token usage (RuntimeDebugEvent.durationMs / .tokenUsage producers) ---

/**
 * Real, per-call measurements stamped onto a `tool.<name>`/`model.call`
 * finish event. Every field is optional and is *omitted* rather than
 * defaulted: an absent `tokenUsage` means "this model provider reported no
 * usage", which is a different and more honest statement than a zeroed one.
 *
 * These deliberately do not pass through `redactValue`. Both are closed
 * numeric shapes derived from counters and clock readings -- three integer
 * token counts and one elapsed millisecond figure -- with no string leaf a
 * credential, header, cookie, note, or model reasoning could ever reach.
 * `payload`/`attributes`, which do carry provider- and user-shaped content,
 * remain redacted exactly as before.
 */
export interface CallMetrics {
  durationMs?: number;
  tokenUsage?: TokenUsage;
}

/**
 * Turns what the real Strands SDK actually exposes into the per-call
 * `durationMs`/`tokenUsage` `RuntimeDebugEvent` declares. One tracker
 * instance belongs to one `Agent` (Graph/Swarm nodes are separate `Agent`s
 * with separate `Meter`s, so a shared tracker would mix their totals).
 *
 * What the SDK gives us, verified against the installed
 * `@strands-agents/sdk@1.14.0` sources rather than remembered:
 *
 * - **Token usage.** `AfterModelCallEvent` itself carries only `agent`,
 *   `model`, `stopData` (message + stop reason + guardrail redaction),
 *   `error`, `attemptCount` and `invocationState` -- no usage field at all
 *   (`hooks/events.d.ts`). Usage lives on the agent's `Meter`, fed from the
 *   provider's own `ModelMetadataEvent`: `agent/agent.js` calls
 *   `this._meter.updateCycle(result.metadata)` immediately *before* it
 *   yields `AfterModelCallEvent`, so by the time this tracker runs,
 *   `event.agent.metrics.accumulatedUsage` already includes the call that
 *   just finished. That figure is cumulative for the whole agent, and
 *   `routes/debug.ts` *sums* `tokenUsage` across events for its run
 *   overview, so what is stamped on each event is the delta since the
 *   previous model call on the same agent -- the real cost of that one
 *   call, summing back to the real run total.
 *
 * - **Nothing, when the provider reports nothing.** A provider that emits
 *   no `ModelMetadataEvent.usage` leaves `accumulatedUsage` at its zeroed
 *   initial value, so every delta is `0/0/0`. A zero-token model call does
 *   not exist, so an all-zero delta is read as "not reported" and
 *   `tokenUsage` is left off the event entirely.
 *
 * - **Duration.** Neither hook event carries a timestamp or an elapsed
 *   time. The SDK does measure both model latency
 *   (`Metrics.latencyMs`, only when the provider supplies it in metadata)
 *   and tool execution time (`Meter.endToolCall`, keyed by tool *name*),
 *   but the tool figure cannot be attributed to one call when the
 *   concurrent tool executor runs two calls to the same tool at once. So
 *   duration here is a genuinely measured wall-clock interval between the
 *   real `Before*` and `After*` hook firings, keyed by `toolUseId` for
 *   tools, and omitted entirely when no matching start was observed. It is
 *   measured, never assumed, and never a constant.
 *
 * `now` is injectable purely so tests can assert an exact interval; it
 * defaults to real wall-clock time.
 */
export interface RuntimeMetricsTracker {
  noteModelCallStart(event: BeforeModelCallEvent): void;
  measureModelCall(event: AfterModelCallEvent): CallMetrics;
  noteToolCallStart(event: BeforeToolCallEvent): void;
  measureToolCall(event: AfterToolCallEvent): CallMetrics;
}

/** Strands's cumulative `Usage` shape (`models/streaming.d.ts`), read off `agent.metrics.accumulatedUsage`. */
interface CumulativeUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const ZERO_USAGE: CumulativeUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/**
 * The delta between two cumulative `Usage` readings, or `undefined` when
 * there is nothing real to report: an all-zero delta (the provider sent no
 * usage metadata) or a negative one (a reading that cannot be trusted).
 * Counts are rounded because `TokenUsage` is integral by contract; a real
 * provider never reports fractional tokens.
 */
function usageDelta(previous: CumulativeUsage, current: CumulativeUsage): TokenUsage | undefined {
  const input = Math.round(current.inputTokens - previous.inputTokens);
  const output = Math.round(current.outputTokens - previous.outputTokens);
  const total = Math.round(current.totalTokens - previous.totalTokens);
  if (input < 0 || output < 0 || total < 0) return undefined;
  if (input === 0 && output === 0 && total === 0) return undefined;
  return { input, output, total };
}

function readAccumulatedUsage(agent: {
  metrics?: { accumulatedUsage?: CumulativeUsage };
}): CumulativeUsage {
  const usage = agent.metrics?.accumulatedUsage;
  if (usage === undefined) return ZERO_USAGE;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

/** Builds a per-`Agent` duration/token tracker. See `RuntimeMetricsTracker`. */
export function createRuntimeMetricsTracker(
  now: () => number = () => Date.now(),
): RuntimeMetricsTracker {
  let modelCallStartedAt: number | undefined;
  let lastAccumulatedUsage: CumulativeUsage = ZERO_USAGE;
  const toolCallStartedAt = new Map<string, number>();

  const elapsedSince = (startedAt: number | undefined): number | undefined =>
    startedAt === undefined ? undefined : Math.max(0, Math.round(now() - startedAt));

  return {
    noteModelCallStart(): void {
      modelCallStartedAt = now();
    },
    measureModelCall(event: AfterModelCallEvent): CallMetrics {
      const durationMs = elapsedSince(modelCallStartedAt);
      modelCallStartedAt = undefined;
      const current = readAccumulatedUsage(event.agent);
      const tokenUsage = usageDelta(lastAccumulatedUsage, current);
      lastAccumulatedUsage = current;
      return {
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(tokenUsage !== undefined ? { tokenUsage } : {}),
      };
    },
    noteToolCallStart(event: BeforeToolCallEvent): void {
      // Keyed by the model-issued tool-use id, so two concurrent calls to
      // the same tool (the SDK's ConcurrentToolExecutor genuinely does
      // this) never take each other's start time.
      toolCallStartedAt.set(event.toolUse.toolUseId, now());
    },
    measureToolCall(event: AfterToolCallEvent): CallMetrics {
      const startedAt = toolCallStartedAt.get(event.toolUse.toolUseId);
      toolCallStartedAt.delete(event.toolUse.toolUseId);
      const durationMs = elapsedSince(startedAt);
      return durationMs !== undefined ? { durationMs } : {};
    },
  };
}

/**
 * `timestamp` above uses wall-clock `new Date().toISOString()` rather than
 * an injected `Clock`, deliberately: every other Sift subsystem threads a
 * `Clock` port for reproducible business timestamps
 * (case events, run records), but `RuntimeDebugEvent.timestamp` stamps
 * *telemetry* emitted from inside real Strands hook callbacks that this
 * module does not control the invocation of -- `strands-adapter.ts` and its
 * tests hold `Clock`-driven identifiers (`runId`, `caseId`) constant and
 * assert on event *ordering* (`sequence`) and *content*, not on exact
 * telemetry timestamps, matching how `redactions`/`payload` are asserted
 * elsewhere in this codebase's Strands-adjacent tests.
 */

function toolPhaseName(toolName: string): string {
  return `tool.${toolName}`;
}

/** Normalizes a real `BeforeToolCallEvent` into a `tool.<name>` start event. */
export function normalizeBeforeToolCall(
  event: BeforeToolCallEvent,
  ctx: NormalizerContext,
  sequence: number,
): RuntimeDebugEvent {
  const { value: safeInput, redactions } = redactValue(event.toolUse.input);
  return buildEvent(ctx, sequence, {
    category: 'tool',
    name: toolPhaseName(event.toolUse.name),
    phase: 'start',
    level: 'info',
    summary: `Calling tool "${event.toolUse.name}".`,
    attributes: { toolName: event.toolUse.name, toolUseId: event.toolUse.toolUseId },
    payload: safeInput,
    redactions,
  });
}

/** Normalizes a real `AfterToolCallEvent` into a `tool.<name>` finish/error event. `metrics` carries the real measured call duration when a `createRuntimeMetricsTracker` observed this call's start; omitting it leaves `durationMs` off the event rather than defaulting it. */
export function normalizeAfterToolCall(
  event: AfterToolCallEvent,
  ctx: NormalizerContext,
  sequence: number,
  metrics: CallMetrics = {},
): RuntimeDebugEvent {
  const failed = event.error !== undefined || event.result.status === 'error';
  const { value: safeResult, redactions } = redactValue({
    status: event.result.status,
    content: event.result.content,
  });
  return buildEvent(ctx, sequence, {
    category: 'tool',
    name: toolPhaseName(event.toolUse.name),
    phase: failed ? 'error' : 'finish',
    level: failed ? 'error' : 'info',
    summary: failed
      ? `Tool "${event.toolUse.name}" failed.`
      : `Tool "${event.toolUse.name}" completed.`,
    attributes: {
      toolName: event.toolUse.name,
      toolUseId: event.toolUse.toolUseId,
      status: event.result.status,
    },
    payload: safeResult,
    redactions,
    ...(metrics.durationMs !== undefined ? { durationMs: metrics.durationMs } : {}),
  });
}

/** Normalizes a real `BeforeModelCallEvent` into a `model.call` start event. Never persists the system prompt or message bodies -- only the projected token count, per debugging-and-observability.md's "hash and safe summary by default" default posture. */
export function normalizeBeforeModelCall(
  event: BeforeModelCallEvent,
  ctx: NormalizerContext,
  sequence: number,
): RuntimeDebugEvent {
  return buildEvent(ctx, sequence, {
    category: 'model',
    name: 'model.call',
    phase: 'start',
    level: 'info',
    summary: 'Calling the model.',
    attributes: {
      modelId: event.model.modelId ?? 'unknown',
      ...(event.projectedInputTokens !== undefined
        ? { projectedInputTokens: event.projectedInputTokens }
        : {}),
    },
  });
}

/**
 * Normalizes a real `AfterModelCallEvent` into a `model.call` finish/error
 * event. Never persists model reasoning or message text -- only stop
 * reason, attempt count, and the real per-call duration/token usage
 * `metrics` supplies (debugging-and-observability.md: "Private model
 * reasoning is never requested or stored").
 *
 * `metrics` comes from a `createRuntimeMetricsTracker` bound to the same
 * `Agent`; see that function for exactly what the installed SDK does and
 * does not report. Passing nothing leaves both fields off the event, which
 * is the correct representation of "not measured" -- they are never
 * defaulted to zero.
 */
export function normalizeAfterModelCall(
  event: AfterModelCallEvent,
  ctx: NormalizerContext,
  sequence: number,
  metrics: CallMetrics = {},
): RuntimeDebugEvent {
  const failed = event.error !== undefined;
  return buildEvent(ctx, sequence, {
    category: 'model',
    name: 'model.call',
    phase: failed ? 'error' : 'finish',
    level: failed ? 'error' : 'info',
    summary: failed ? 'Model call failed.' : 'Model call completed.',
    attributes: {
      attemptCount: event.attemptCount,
      ...(event.stopData !== undefined ? { stopReason: event.stopData.stopReason } : {}),
    },
    ...(metrics.durationMs !== undefined ? { durationMs: metrics.durationMs } : {}),
    ...(metrics.tokenUsage !== undefined ? { tokenUsage: metrics.tokenUsage } : {}),
  });
}

/** Normalizes an `AgentSkills` activation into `skill.activated` (strands-runtime.md "Skills": "Every skill activation emits `skill.activated` with skill ID, obligation ID, agent ID, and reason"). */
export function normalizeSkillActivation(
  params: { skillId: string; reason: string; agentId?: string },
  ctx: NormalizerContext,
  sequence: number,
): RuntimeDebugEvent {
  return buildEvent(ctx, sequence, {
    category: 'skill',
    name: 'skill.activated',
    phase: 'finish',
    level: 'info',
    summary: `Activated skill "${params.skillId}".`,
    attributes: {
      skillId: params.skillId,
      ...(ctx.obligationId !== undefined ? { obligationId: ctx.obligationId } : {}),
      ...(params.agentId !== undefined ? { agentId: params.agentId } : {}),
      reason: params.reason,
    },
  });
}

/** Normalizes one Context Injector call into `context.injected` -- field names and a content hash only, never the rendered text (strands-runtime.md "Context injection"). */
export function normalizeContextInjection(
  params: { fields: readonly string[]; contentHash: string },
  ctx: NormalizerContext,
  sequence: number,
): RuntimeDebugEvent {
  return buildEvent(ctx, sequence, {
    category: 'context',
    name: 'context.injected',
    phase: 'finish',
    level: 'debug',
    summary: `Injected case context (${params.fields.length} field(s)).`,
    attributes: { fields: [...params.fields], contentHash: params.contentHash },
  });
}

const INTERVENTION_NAME: Record<InterventionEvent['type'], string> = {
  'intervention.proceed': 'intervention.proceed',
  'intervention.guide': 'intervention.guide',
  'intervention.confirm': 'intervention.confirm',
  'intervention.deny': 'intervention.deny',
  'intervention.transform': 'intervention.transform',
};

/**
 * The `RuntimeDebugEvent.level` each intervention outcome is recorded at.
 *
 * `intervention.proceed` is the "a policy handler evaluated this and had no
 * objection" outcome. Six handlers run on every single tool call, and most
 * of them proceed, so proceed events genuinely dominate the stream: one
 * real car run recorded 122 `BudgetGuard: tool is excluded from the run
 * tool-call budget` proceeds out of 245 total events, which buries the
 * handoffs, steering, and denials a judge or an operator is actually
 * reading for.
 *
 * They are still recorded, in full, with handler/stage/subject attributes:
 * they are the audit trail proving each guard genuinely ran on each call,
 * and `debugging-and-observability.md` asks for intervention decisions --
 * not only the ones that changed something. Deleting them would destroy
 * real evidence to make a list shorter. Recording them at `debug` instead
 * demotes them below the `info` stream the Inspector's existing
 * `?level=` filter (routes/debug.ts) and `countsByLevel` breakdown act on,
 * exactly as `context.injected` above is already recorded at `debug` for
 * the same reason -- nothing is lost, and the outcomes that changed the
 * run's course (`guide`/`confirm`/`transform` at `info`, `deny` at `warn`)
 * are no longer outnumbered four to one by decisions to do nothing.
 */
const INTERVENTION_LEVEL: Record<InterventionEvent['type'], RuntimeDebugEvent['level']> = {
  'intervention.proceed': 'debug',
  'intervention.guide': 'info',
  'intervention.confirm': 'info',
  'intervention.transform': 'info',
  'intervention.deny': 'warn',
};

/** Normalizes one `InterventionEvent` (strands-runtime.md "Interventions and steering") into a `RuntimeDebugEvent`. */
export function normalizeIntervention(
  event: InterventionEvent,
  ctx: NormalizerContext,
  sequence: number,
): RuntimeDebugEvent {
  const level = INTERVENTION_LEVEL[event.type];
  return buildEvent(ctx, sequence, {
    category: 'intervention',
    name: INTERVENTION_NAME[event.type],
    phase: 'finish',
    level,
    summary: `${event.handler}: ${event.reason}`,
    attributes: {
      handler: event.handler,
      stage: event.stage,
      subject: event.subject,
    },
  });
}

/** Normalizes one GoalLoop validation attempt into `goal.validation_failed` (on failure) or a passing `goal.validated` finish event. strands-runtime.md "GoalLoop output validation": "A rejection emits `goal.validation_failed` with machine-readable reasons and a visible `Draft withheld` activity item." */
export function normalizeGoalValidation(
  params: { attempt: number; passed: boolean; feedback?: string; exhausted: boolean },
  ctx: NormalizerContext,
  sequence: number,
): RuntimeDebugEvent {
  const name = params.passed ? 'goal.validated' : 'goal.validation_failed';
  return buildEvent(ctx, sequence, {
    category: 'goal',
    name,
    phase: params.passed ? 'finish' : params.exhausted ? 'error' : 'update',
    level: params.passed ? 'info' : 'warn',
    summary: params.passed
      ? `Recommendation draft validated on attempt ${params.attempt}.`
      : `Recommendation draft rejected on attempt ${params.attempt}${params.exhausted ? ' (attempts exhausted)' : ''}.`,
    attributes: {
      attempt: params.attempt,
      exhausted: params.exhausted,
      ...(params.feedback !== undefined ? { feedback: params.feedback } : {}),
    },
  });
}

/** Normalizes an `execute()`-level failure (a thrown model/tool/validation error, or a structured output that failed `ExecutionResultSchema` validation) into an `error`-category event. */
export function normalizeRunError(
  message: string,
  ctx: NormalizerContext,
  sequence: number,
): RuntimeDebugEvent {
  return buildEvent(ctx, sequence, {
    category: 'error',
    name: 'run.failed',
    phase: 'error',
    level: 'error',
    summary: message,
    attributes: {},
  });
}

/** Normalizes a real `SessionManager` snapshot save/restore into `session.snapshot_saved`/`session.snapshot_restored` (strands-runtime.md "Sessions and snapshots"). */
export function normalizeSessionEvent(
  params: { kind: 'snapshot_saved' | 'snapshot_restored'; snapshotId?: string; restored?: boolean },
  ctx: NormalizerContext,
  sequence: number,
): RuntimeDebugEvent {
  return buildEvent(ctx, sequence, {
    category: 'session',
    name: `session.${params.kind}`,
    phase: 'finish',
    level: 'info',
    summary:
      params.kind === 'snapshot_saved'
        ? 'Saved a session snapshot.'
        : params.restored === false
          ? 'No prior session snapshot to restore.'
          : 'Restored a session snapshot.',
    attributes: {
      ...(params.snapshotId !== undefined ? { snapshotId: params.snapshotId } : {}),
      ...(params.restored !== undefined ? { restored: params.restored } : {}),
    },
  });
}

// --- Case-state diff (RuntimeDebugEvent.stateDiff's one genuine producer) ---

const MAX_DIFF_DEPTH = 10;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((entry, index) => deepEqual(entry, b[index]))
    );
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return (
      keysA.length === keysB.length &&
      keysA.every(
        (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]),
      )
    );
  }
  return false;
}

function diffAt(
  before: unknown,
  after: unknown,
  path: string,
  depth: number,
  ops: JsonPatchOperation[],
): void {
  if (depth < MAX_DIFF_DEPTH && isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const childPath = `${path}/${escapePointerSegment(key)}`;
      const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
      const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
      if (hasBefore && !hasAfter) {
        ops.push({ op: 'remove', path: childPath });
      } else if (!hasBefore && hasAfter) {
        ops.push({ op: 'add', path: childPath, value: after[key] });
      } else {
        diffAt(before[key], after[key], childPath, depth + 1, ops);
      }
    }
    return;
  }
  if (!deepEqual(before, after)) {
    ops.push({ op: 'replace', path, value: after });
  }
}

/**
 * A bounded, honest RFC 6902-shaped diff between two real, already-observed
 * plain-JSON values -- built for exactly one caller, `normalizeCaseStateChange`
 * below, diffing a real `CaseState` snapshot taken before a Strands run
 * against the real snapshot taken after it completed. Never a reconstructed
 * guess: every emitted operation, applied to `before`, reproduces `after`
 * exactly.
 *
 * Recurses into plain objects key-by-key (reporting `add`/`remove` for keys
 * whose presence changed, and recursing further for a key present on both
 * sides); arrays and primitives are compared by full deep equality and, when
 * different, replaced wholesale at their own path -- deliberately never
 * diffed element-by-element. RFC 6902 array-index operations shift on every
 * insertion/removal; getting that shifting wrong would silently produce a
 * patch that does not actually reproduce `after` when applied to `before`,
 * which is worse than a coarser but always-correct whole-array replace.
 */
export function diffJsonValues(before: unknown, after: unknown): JsonPatchOperation[] {
  const ops: JsonPatchOperation[] = [];
  diffAt(before, after, '', 0, ops);
  return ops;
}

/**
 * Normalizes one real before/after `CaseState` diff into a `category: 'case'`
 * `RuntimeDebugEvent` -- `RuntimeDebugEvent.stateDiff`'s one genuine producer
 * in this codebase (debugging-and-observability.md "Domain and persistence":
 * "canonical case events and JSON Patch-compatible before/after state
 * diff"). `car-purchase-engine.ts`/`home-energy-engine.ts` each call this
 * once per completed live run, diffing the real `CaseState` snapshot loaded
 * at the start of `runOneInvestigation` against the real snapshot returned
 * by `foldRound1`/`foldRound2` (or their Home Energy Guardian equivalents)
 * at the end -- a whole-run diff, not a per-`CaseEvent` one.
 *
 * This is deliberately narrower than "every canonical `CaseEvent` gets a
 * state diff": that fully general producer belongs in `command-service.ts`
 * (which already loads a before-snapshot and produces an after-snapshot for
 * *every* command, run-triggered or not), a file this task does not own --
 * see the dated `docs/build-log.md` entry for this task and this task's own
 * report. What this function *does* cover is real and non-fabricated for
 * every completed hero-pack run, which is the trajectory
 * debugging-and-observability.md's acceptance requirements actually name.
 */
export function normalizeCaseStateChange(
  params: { stateDiff: JsonPatchOperation[] },
  ctx: NormalizerContext,
  sequence: number,
): RuntimeDebugEvent {
  return {
    ...buildEvent(ctx, sequence, {
      category: 'case',
      name: 'case.state_changed',
      phase: 'finish',
      level: 'info',
      summary: `Case state changed (${params.stateDiff.length} field${params.stateDiff.length === 1 ? '' : 's'}).`,
      attributes: { fieldCount: params.stateDiff.length },
    }),
    stateDiff: params.stateDiff,
  };
}
