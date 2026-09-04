/**
 * Captures the OpenTelemetry spans the Strands TypeScript SDK **already
 * emits** into Sift's own `runtime_events` store, closing CLAUDE.md's
 * "native Strands OpenTelemetry tracing ... feeding the Sift Runtime
 * Inspector" requirement and docs/specs/debugging-and-observability.md's
 * "OpenTelemetry and AgentCore" section.
 *
 * Nothing here instruments Strands. `@strands-agents/sdk@1.14.0` is already
 * instrumented: `dist/src/multiagent/graph.js` and `swarm.js` call
 * `tracer.startMultiAgentSpan()` / `startNodeSpan()` / `endNodeSpan()` /
 * `withSpanContext()` on every run, and `Agent` does the same for agent,
 * agent-loop, model, and tool spans. Those spans were created and then
 * discarded, because no `TracerProvider` was ever registered with the global
 * OTel API. `installSiftTracing()` registers one.
 *
 * --- How a span is attributed to a Sift run (the honest mechanism) ---
 *
 * Neither hero pack's orchestration file can pass `traceAttributes` to its
 * `Graph`/`Swarm` (both are owned elsewhere), and a span carries no Sift
 * identifier of its own, so a run id is taken from the **active OTel
 * context**, never guessed:
 *
 *  - `RunService.requestInvestigation` wraps its `engine.trigger(...)` call
 *    in `runInSpanScope(runId, ...)`, which does `context.with(...)` with
 *    the run id stored under one private `createContextKey` value.
 *  - `NodeTracerProvider.register()` installs the real
 *    `AsyncLocalStorageContextManager`, so every span the SDK starts inside
 *    that engine's async call tree -- including the ones started deep inside
 *    `graph.invoke()` -- receives that context as its `parentContext` in
 *    `SpanProcessor.onStart`.
 *  - A span whose `parentContext` carries no run id is **dropped**. That is
 *    the correct outcome for spans produced outside a durable run (the
 *    scenario runners in `car-purchase-scenario.ts`/
 *    `home-energy-guardian-scenario.ts`, or any future detached/root span):
 *    `runtime_events.run_id` is a real foreign key against `runs.id`, and
 *    there is no honest value to invent.
 *
 * --- Why spans are buffered, and what `trace_id` holds ---
 *
 * docs/specs/debugging-and-observability.md is explicit: "One run has
 * exactly one `traceId`. The value stored on the `runs` row -- what the
 * Overview renders under 'Trace' -- is the same value every `runtime_events`
 * row for that run carries." Both hero engines assert exactly that
 * (`new Set(events.map((e) => e.traceId)).size === 1`). A span row therefore
 * carries the **run's** trace id in `trace_id`, and the real OTel trace id
 * verbatim in `attributes['otel.trace_id']`. Nothing is fabricated; the two
 * identifier spaces are simply both recorded, each under its own name.
 *
 * That id is minted inside the Graph/Swarm and only reaches the `runs` row
 * once the engine drains the first normalized event -- which happens *after*
 * `graph.invoke()` returns, i.e. after every span has already ended. Spans
 * are therefore buffered per run and flushed once the run's trace id is
 * resolvable (checked cheaply on each span end, and unconditionally when the
 * run scope's promise settles). One flush writes the whole batch inside a
 * single `RuntimeEventStore.appendMany` transaction rather than one
 * statement per span.
 *
 * --- Sequence numbers ---
 *
 * `runtime_events` has a `UNIQUE (run_id, sequence)` index, and the
 * normalized stream's sequences are assigned by a per-run counter this
 * module cannot see or share (`event-normalizer.ts`'s
 * `createSequenceCounter`, instantiated inside each orchestration file).
 * Span rows are therefore numbered in their own disjoint band starting at
 * `SPAN_SEQUENCE_BASE`, monotonic among themselves in span-end order. They
 * sort after the normalized stream in `listByRun`, which is exactly right:
 * the span view is a parallel, structurally-linked projection of the same
 * run, read through `spanId`/`parentSpanId`, not a second interleaving of
 * the timeline.
 *
 * --- Durations are real ---
 *
 * `durationMs` comes from `ReadableSpan.duration`, the OTel SDK's own
 * `HrTime` delta between span start and span end. Unlike the SDK hook
 * timestamps this repo documents as untrusted for timing (see
 * `event-normalizer.ts`'s `createRuntimeMetricsTracker`), that value is
 * measured by the tracer itself around the operation it names, so it is
 * populated on every span row.
 *
 * --- What is never persisted ---
 *
 * Span attributes can carry model input and output verbatim
 * (`startAgentSpan` sets `system_prompt` and `gen_ai.agent.input`;
 * `startModelInvokeSpan`/`startToolCallSpan` add message and argument
 * content as span *events*). The existing normalizers "never persist the
 * system prompt or message bodies -- only the projected token count"
 * (`event-normalizer.ts`), and this module holds the same line:
 *
 *  - span **events** and **links** are never persisted at all, only counted;
 *  - a content-shaped attribute key, and any string value over
 *    `MAX_ATTRIBUTE_VALUE_CHARS`, is replaced by `{ chars, sha256 }` using
 *    `event-normalizer.ts`'s own `hashContent`, with a `Redaction` recorded;
 *  - everything that survives still goes through the store's existing
 *    Redactor stage (`runtime-event-store.ts` re-applies
 *    `event-normalizer.ts`'s `redactValue` to `attributes` before the
 *    insert), so credentials, authorization headers, cookies, and the seeded
 *    secret canary are redacted by the same one implementation as every
 *    other runtime event.
 *
 * `tokenUsage`/`estimatedCostUsd` are deliberately left unset on span rows
 * even though model spans carry `gen_ai.usage.*` attributes:
 * `routes/debug.ts`'s `buildRuntimeOverview` *sums* those fields across a
 * run's events, and the normalized `model.call` events already report them.
 * Setting them here would silently double-count a real metric. The raw
 * attribute values are still persisted inside `attributes`.
 *
 * --- OTLP export ---
 *
 * Setting the standard `OTEL_EXPORTER_OTLP_ENDPOINT` additionally attaches a
 * `BatchSpanProcessor(new OTLPTraceExporter())` -- the same spans, sent
 * onward (this is what would point at AWS X-Ray via the ADOT collector).
 * Unset, no exporter exists and no socket is ever opened, so a fixture run
 * is fully offline. The exporter reads the endpoint and
 * `OTEL_EXPORTER_OTLP_HEADERS` itself, through OTel's own standard
 * variables; Sift never reinterprets them.
 */
import {
  context,
  createContextKey,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type AttributeValue,
  type Context,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type Span,
  type SpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { setupTracer } from '@strands-agents/sdk/telemetry';
import type { Redaction, RuntimeDebugCategory, RuntimeDebugEvent } from '@sift/contracts';
import type { RuntimeEventStore } from '../store/runtime-event-store.js';
import { hashContent } from './event-normalizer.js';

/**
 * A run record this module needs in order to write a span row: the case the
 * run belongs to, the obligation it is investigating, and the run's own
 * trace id. Structurally satisfied by `services/run-service.ts`'s `RunStore`
 * (both the SQLite and in-memory implementations) without importing it, so
 * this module stays a leaf of the runtime layer.
 */
export interface SpanRunLookup {
  load(runId: string): { caseId: string; obligationId: string; traceId?: string } | undefined;
}

/**
 * First `sequence` a span row may use. `runtime_events` enforces
 * `UNIQUE (run_id, sequence)` and the normalized stream owns `[0, n)`; a car
 * run emits roughly 245 normalized events, so a base six orders of magnitude
 * above that can never be reached by the counter this module cannot see.
 * See the module header ("Sequence numbers").
 */
export const SPAN_SEQUENCE_BASE = 1_000_000;

/** Strings longer than this are stored as `{ chars, sha256 }` instead of verbatim. Comfortably above every identifier, status, model id, and ISO timestamp the SDK sets, and far below a prompt or a serialized message list. */
export const MAX_ATTRIBUTE_VALUE_CHARS = 256;

/** Hard ceiling on persisted attributes per span row, so one pathological span cannot blow past the spec's 64 KiB persisted-payload cap. Overflow is reported as `otel.attributes_dropped`, never silently discarded. */
export const MAX_PERSISTED_ATTRIBUTES = 64;

/** Ceiling on buffered spans for one run. A run that somehow exceeds it records `otel.spans_dropped` on the next flushed row rather than growing without bound. */
export const MAX_BUFFERED_SPANS_PER_RUN = 5_000;

/**
 * The final dot-separated segment of an attribute key that marks it as
 * carrying model or user content rather than metadata. Deliberately a small,
 * explicit list rather than a substring match: `gen_ai.usage.input_tokens`
 * must keep its real number, while `gen_ai.agent.input` must not keep its
 * real text.
 */
const CONTENT_KEY_SEGMENTS = new Set([
  'system_prompt',
  'prompt',
  'input',
  'output',
  'content',
  'message',
  'messages',
  'definitions',
  'arguments',
  'result',
  'response',
  'text',
  'body',
]);

/** One private context key. Not exported: a run id enters the OTel context only through `runInSpanScope`. */
const RUN_ID_KEY = createContextKey('sift.runtime.runId');

/** `SpanKind` is a numeric enum in the OTel API; persisted rows carry the readable name. */
const SPAN_KIND_NAMES: Readonly<Record<number, string>> = {
  [SpanKind.INTERNAL]: 'internal',
  [SpanKind.SERVER]: 'server',
  [SpanKind.CLIENT]: 'client',
  [SpanKind.PRODUCER]: 'producer',
  [SpanKind.CONSUMER]: 'consumer',
};

/**
 * `gen_ai.operation.name` (set by the SDK's own `_getCommonAttributes`) to a
 * `RuntimeDebugCategory`. `execute_node` maps to `agent` rather than to
 * `graph`/`swarm` because a node span alone does not say which orchestrator
 * produced it, and a node execution genuinely *is* one agent invocation --
 * the orchestrator's own span (`invoke_graph`/`invoke_swarm`) is the row
 * that carries that fact, and `parentSpanId` links the two. Every span's
 * exact operation and name are preserved in `attributes` regardless.
 */
const OPERATION_CATEGORIES: Readonly<Record<string, RuntimeDebugCategory>> = {
  invoke_graph: 'graph',
  invoke_swarm: 'swarm',
  invoke_agent: 'agent',
  execute_node: 'agent',
  chat: 'model',
  execute_tool: 'tool',
};

/** Operation name used when a span sets no `gen_ai.operation.name` (the SDK's agent-loop-cycle span is the one such span today). */
const UNCLASSIFIED_OPERATION = 'unclassified';

function operationNameOf(span: ReadableSpan): string {
  const operation = span.attributes['gen_ai.operation.name'];
  if (typeof operation === 'string' && operation.length > 0) return operation;
  if (typeof span.attributes['agent_loop.cycle_id'] === 'string') return 'execute_agent_loop_cycle';
  return UNCLASSIFIED_OPERATION;
}

/** `RUNTIME_DEBUG_CATEGORIES` has no "unknown" member; an unmapped Strands span is still agent-runtime activity, and its real operation stays in `attributes['otel.operation']`. */
function categoryFor(operation: string): RuntimeDebugCategory {
  return OPERATION_CATEGORIES[operation] ?? 'agent';
}

function isContentKey(key: string): boolean {
  const segments = key.split('.');
  const last = segments[segments.length - 1];
  return last !== undefined && CONTENT_KEY_SEGMENTS.has(last);
}

/** `HrTime` (`[seconds, nanoseconds]`) to whole milliseconds since the epoch. */
function hrTimeToEpochMs(time: readonly [number, number]): number {
  return time[0] * 1000 + time[1] / 1e6;
}

/** A real measured duration, rounded to microsecond precision so a float artefact never reaches the column. */
function durationMsOf(span: ReadableSpan): number {
  return Math.max(0, Math.round(hrTimeToEpochMs(span.duration) * 1000) / 1000);
}

interface SafeAttributes {
  attributes: Record<string, unknown>;
  redactions: Redaction[];
}

/** A content-shaped or oversized value, recorded as its size and digest instead of its text. See the module header ("What is never persisted"). */
function digestOf(value: string): { chars: number; sha256: string } {
  return { chars: value.length, sha256: hashContent(value) };
}

/**
 * Projects one span's raw OTel attributes into the bounded, content-free
 * shape persisted in `runtime_events.data`. Keys are sorted so a row is
 * byte-stable for a given span regardless of attribute insertion order.
 */
function safeSpanAttributes(
  span: ReadableSpan,
  operation: string,
  maxPersistedAttributes: number,
): SafeAttributes {
  const redactions: Redaction[] = [];
  const attributes: Record<string, unknown> = {
    'otel.span_name': span.name,
    'otel.operation': operation,
    'otel.trace_id': span.spanContext().traceId,
    'otel.span_id': span.spanContext().spanId,
    'otel.span_kind': SPAN_KIND_NAMES[span.kind] ?? String(span.kind),
    'otel.status_code': span.status.code === SpanStatusCode.ERROR ? 'error' : 'ok',
    'otel.scope': span.instrumentationScope.name,
    // Counted, never persisted: span events carry `gen_ai.*.message` bodies
    // verbatim, and links carry only other spans' ids.
    'otel.event_count': span.events.length,
    'otel.link_count': span.links.length,
  };
  const parentSpanId = span.parentSpanContext?.spanId;
  if (parentSpanId !== undefined) attributes['otel.parent_span_id'] = parentSpanId;
  if (span.status.message !== undefined && span.status.message.length > 0) {
    attributes['otel.status_message'] = span.status.message.slice(0, MAX_ATTRIBUTE_VALUE_CHARS);
  }

  let dropped = 0;
  for (const key of Object.keys(span.attributes).sort()) {
    const value: AttributeValue | undefined = span.attributes[key];
    if (value === undefined) continue;
    if (Object.keys(attributes).length >= maxPersistedAttributes) {
      dropped += 1;
      continue;
    }
    if (
      typeof value === 'string' &&
      (isContentKey(key) || value.length > MAX_ATTRIBUTE_VALUE_CHARS)
    ) {
      attributes[key] = digestOf(value);
      redactions.push({
        path: `attributes.${key}`,
        reason: isContentKey(key)
          ? 'model or user content is persisted as a length and digest, never verbatim'
          : 'value exceeded the persisted span-attribute length cap',
      });
      continue;
    }
    attributes[key] = value;
  }
  if (dropped > 0) attributes['otel.attributes_dropped'] = dropped;

  return { attributes, redactions };
}

/** The run facts every span row for one run shares, resolved once from the `runs` row and then cached. */
interface ResolvedRun {
  readonly caseId: string;
  readonly obligationId: string;
  readonly traceId: string;
}

interface RunBuffer {
  /** Ended spans held until this run's trace id is known. See the module header ("Why spans are buffered"). */
  spans: ReadableSpan[];
  resolved?: ResolvedRun;
  nextSequence: number;
  droppedSpans: number;
}

export interface SiftSpanRecorderDeps {
  readonly runtimeEventStore: RuntimeEventStore;
  readonly runStore: SpanRunLookup;
  /**
   * Reports a persistence failure. Telemetry must never break a run, so a
   * failed span write is swallowed and reported here instead of thrown.
   * Defaults to one `console.warn`, matching how `car-purchase-engine.ts`
   * reports a last-resort failure.
   */
  readonly onError?: (error: unknown) => void;
  /**
   * Overrides the two bounds this module enforces so a test can reach them
   * without constructing 5,000 spans or 64 attributes. Production always
   * uses the exported defaults; nothing outside a test ever passes this.
   */
  readonly limits?: {
    readonly maxPersistedAttributes?: number;
    readonly maxBufferedSpansPerRun?: number;
  };
}

/**
 * The `SpanProcessor` that turns real Strands spans into real
 * `RuntimeDebugEvent` rows. See the module header for the correlation,
 * buffering, sequencing, duration, and redaction rules it implements.
 */
export class SiftSpanRecorder implements SpanProcessor {
  private readonly maxPersistedAttributes: number;
  private readonly maxBufferedSpansPerRun: number;
  private readonly buffers = new Map<string, RunBuffer>();
  private readonly runIdBySpan = new WeakMap<object, string>();
  private stopped = false;

  constructor(private readonly deps: SiftSpanRecorderDeps) {
    this.maxPersistedAttributes = deps.limits?.maxPersistedAttributes ?? MAX_PERSISTED_ATTRIBUTES;
    this.maxBufferedSpansPerRun = deps.limits?.maxBufferedSpansPerRun ?? MAX_BUFFERED_SPANS_PER_RUN;
  }

  onStart(span: Span, parentContext: Context): void {
    if (this.stopped) return;
    const runId = parentContext.getValue(RUN_ID_KEY);
    if (typeof runId !== 'string') return;
    this.runIdBySpan.set(span, runId);
  }

  onEnd(span: ReadableSpan): void {
    if (this.stopped) return;
    const runId = this.runIdBySpan.get(span);
    // No run scope was active when this span started: it belongs to no
    // durable run, and `runtime_events.run_id` has nothing honest to point
    // at. Dropped deliberately -- never guessed.
    if (runId === undefined) return;

    const buffer = this.bufferFor(runId);
    if (buffer.spans.length >= this.maxBufferedSpansPerRun) {
      buffer.droppedSpans += 1;
      return;
    }
    buffer.spans.push(span);
    this.flushRun(runId);
  }

  /**
   * Writes every buffered span for `runId` that can now be attributed,
   * in one transaction. A no-op while the run's trace id is still unknown
   * (see the module header): the spans stay buffered until it is.
   */
  flushRun(runId: string): void {
    const buffer = this.buffers.get(runId);
    if (buffer === undefined || buffer.spans.length === 0) return;

    const resolved = this.resolveRun(runId, buffer);
    if (resolved === undefined) return;

    const pending = buffer.spans;
    buffer.spans = [];
    const events: RuntimeDebugEvent[] = pending.map((span) =>
      this.toRuntimeEvent(span, runId, resolved, buffer),
    );
    try {
      this.deps.runtimeEventStore.appendMany(events);
    } catch (error) {
      this.reportError(error);
    }
  }

  /** Flushes every run this recorder is still holding spans for. */
  async forceFlush(): Promise<void> {
    for (const runId of [...this.buffers.keys()]) this.flushRun(runId);
    return Promise.resolve();
  }

  async shutdown(): Promise<void> {
    await this.forceFlush();
    this.stopped = true;
    this.buffers.clear();
    return Promise.resolve();
  }

  private bufferFor(runId: string): RunBuffer {
    const existing = this.buffers.get(runId);
    if (existing !== undefined) return existing;
    const created: RunBuffer = {
      spans: [],
      nextSequence: SPAN_SEQUENCE_BASE,
      droppedSpans: 0,
    };
    this.buffers.set(runId, created);
    return created;
  }

  /** The run's real `{ caseId, obligationId, traceId }`, or `undefined` while the `runs` row has no trace id yet. Cached after the first successful read. */
  private resolveRun(runId: string, buffer: RunBuffer): ResolvedRun | undefined {
    if (buffer.resolved !== undefined) return buffer.resolved;
    let record: ReturnType<SpanRunLookup['load']>;
    try {
      record = this.deps.runStore.load(runId);
    } catch (error) {
      this.reportError(error);
      return undefined;
    }
    if (record?.traceId === undefined) return undefined;
    buffer.resolved = {
      caseId: record.caseId,
      obligationId: record.obligationId,
      traceId: record.traceId,
    };
    return buffer.resolved;
  }

  private toRuntimeEvent(
    span: ReadableSpan,
    runId: string,
    run: ResolvedRun,
    buffer: RunBuffer,
  ): RuntimeDebugEvent {
    const operation = operationNameOf(span);
    const failed = span.status.code === SpanStatusCode.ERROR;
    const { attributes, redactions } = safeSpanAttributes(
      span,
      operation,
      this.maxPersistedAttributes,
    );
    if (buffer.droppedSpans > 0) {
      attributes['otel.spans_dropped'] = buffer.droppedSpans;
    }
    const agentId = span.attributes['gen_ai.agent.id'];
    const parentSpanId = span.parentSpanContext?.spanId;

    return {
      schemaVersion: '1.0',
      sequence: buffer.nextSequence++,
      timestamp: new Date(hrTimeToEpochMs(span.startTime)).toISOString(),
      traceId: run.traceId,
      spanId: span.spanContext().spanId,
      ...(parentSpanId !== undefined ? { parentSpanId } : {}),
      caseId: run.caseId,
      runId,
      obligationId: run.obligationId,
      ...(typeof agentId === 'string' ? { agentId } : {}),
      category: categoryFor(operation),
      name: `span.${operation}`,
      phase: failed ? 'error' : 'finish',
      level: failed ? 'error' : 'debug',
      durationMs: durationMsOf(span),
      summary: `Strands OTEL span "${span.name}" ${failed ? 'failed' : 'completed'}.`,
      attributes,
      redactions,
    };
  }

  private reportError(error: unknown): void {
    if (this.deps.onError !== undefined) {
      this.deps.onError(error);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[sift] otel-span-recorder: failed to persist spans: ${message}`);
  }
}

/** The process-wide recorder `runInSpanScope` consults. Mirrors the global-ness of the OTel API itself: one process registers one `TracerProvider`. */
let activeRecorder: SiftSpanRecorder | undefined;

export interface SiftTracingHandle {
  readonly recorder: SiftSpanRecorder;
  readonly provider: NodeTracerProvider;
  /** True when `OTEL_EXPORTER_OTLP_ENDPOINT` was set and an OTLP exporter is attached. */
  readonly otlpExportEnabled: boolean;
  /** Flushes every buffered span, shuts the provider down, and unregisters the global OTel API so a later `installSiftTracing()` can register cleanly. */
  shutdown(): Promise<void>;
}

export interface InstallSiftTracingOptions extends SiftSpanRecorderDeps {
  /** Read from `process.env` when omitted. Presence -- not the value -- decides whether the OTLP exporter is attached; the exporter reads the endpoint itself. */
  readonly otlpEndpoint?: string | undefined;
}

/** Set once per process: `setupTracer` keeps module-level singleton state and warns when called twice, so Sift calls the SDK's own entry point exactly once. */
let strandsTracerConfigured = false;

/**
 * Registers Sift's `TracerProvider` with the global OTel API so the Strands
 * SDK's existing spans are recorded instead of discarded.
 *
 * `provider.register()` is what installs the `AsyncLocalStorageContextManager`
 * that makes `runInSpanScope`'s run attribution work at all, and is exactly
 * what the SDK's own telemetry module documents for a caller-supplied
 * provider ("Set up your own provider ... provider.register() ... Agent
 * automatically uses your provider via the global OTel API"). The SDK's
 * `setupTracer({ provider })` is then called so the Strands telemetry module
 * itself holds the same provider -- its own docstring notes that with a
 * custom provider "the caller is responsible for their own context manager /
 * propagator setup (e.g. via provider.register())".
 */
export function installSiftTracing(options: InstallSiftTracingOptions): SiftTracingHandle {
  const recorder = new SiftSpanRecorder(options);
  const endpoint = options.otlpEndpoint ?? process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  const otlpExportEnabled = endpoint !== undefined && endpoint !== '';

  const spanProcessors: SpanProcessor[] = [recorder];
  if (otlpExportEnabled) {
    spanProcessors.push(new BatchSpanProcessor(new OTLPTraceExporter()));
  }

  const provider = new NodeTracerProvider({ spanProcessors });
  provider.register();
  if (!strandsTracerConfigured) {
    setupTracer({ provider });
    strandsTracerConfigured = true;
  }
  activeRecorder = recorder;

  return {
    recorder,
    provider,
    otlpExportEnabled,
    shutdown: async () => {
      if (activeRecorder === recorder) activeRecorder = undefined;
      await recorder.shutdown();
      await provider.shutdown();
      // `provider.register()` installed three globals; a shut-down provider
      // left registered would silently swallow every later span (the OTel
      // API refuses to overwrite an already-registered global), so all three
      // are released here. This is what makes a later `installSiftTracing()`
      // -- a second `startServer` in one process, or the next test -- take
      // effect at all.
      trace.disable();
      context.disable();
      propagation.disable();
    },
  };
}

/**
 * Runs `fn` with `runId` attached to the active OpenTelemetry context, so
 * every Strands span started inside it is attributable to that Sift run, and
 * flushes that run's buffered spans once `fn` settles.
 *
 * A transparent passthrough when tracing is not installed: same return
 * value, same synchronous/asynchronous shape, no context manipulation.
 */
export function runInSpanScope<T>(runId: string, fn: () => T): T {
  const recorder = activeRecorder;
  if (recorder === undefined) return fn();

  return context.with(context.active().setValue(RUN_ID_KEY, runId), () => {
    let result: T;
    try {
      result = fn();
    } catch (error) {
      recorder.flushRun(runId);
      throw error;
    }
    if (isPromiseLike(result)) {
      const flush = (): void => {
        recorder.flushRun(runId);
      };
      void Promise.resolve(result).then(flush, flush);
    } else {
      recorder.flushRun(runId);
    }
    return result;
  });
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
