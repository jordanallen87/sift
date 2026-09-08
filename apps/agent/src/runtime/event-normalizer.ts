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
    summary: input.summary,
    attributes: input.attributes,
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
    redactions: input.redactions ?? [],
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

/** Normalizes a real `AfterToolCallEvent` into a `tool.<name>` finish/error event. */
export function normalizeAfterToolCall(
  event: AfterToolCallEvent,
  ctx: NormalizerContext,
  sequence: number,
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

/** Normalizes a real `AfterModelCallEvent` into a `model.call` finish/error event. Never persists model reasoning or message text -- only stop reason, attempt count, and token usage when the provider returned it (debugging-and-observability.md: "Private model reasoning is never requested or stored"). */
export function normalizeAfterModelCall(
  event: AfterModelCallEvent,
  ctx: NormalizerContext,
  sequence: number,
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

/** Normalizes one `InterventionEvent` (strands-runtime.md "Interventions and steering") into a `RuntimeDebugEvent`. */
export function normalizeIntervention(
  event: InterventionEvent,
  ctx: NormalizerContext,
  sequence: number,
): RuntimeDebugEvent {
  const level = event.type === 'intervention.deny' ? 'warn' : 'info';
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
