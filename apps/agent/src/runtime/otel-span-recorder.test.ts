/**
 * Behavioral proof that the OpenTelemetry spans `@strands-agents/sdk@1.14.0`
 * already emits are now captured into Sift's own `runtime_events` store,
 * with real parent/child structure, real durations, honest run attribution,
 * and the same redaction every other runtime event goes through.
 *
 * Nothing here asserts that a function was called. The Graph test drives the
 * real six-node `car-purchase` Strands `Graph` through the real
 * `RunService`/`CarPurchaseEngine`/SQLite stack -- the same live path
 * `car-purchase-engine.test.ts` exercises -- and then reads the persisted
 * rows back out of the database and reconstructs the span tree from
 * `spanId`/`parentSpanId` alone.
 *
 * Span ids are random by construction (the OTel SDK's `RandomIdGenerator`),
 * so every assertion here is on *structure and relationships* -- which span
 * is whose parent, how deep the tree is, which operations appear -- never on
 * a literal id.
 *
 * `installSiftTracing` registers a process-global tracer provider (the OTel
 * API is global), so every test that installs it tears it down in a
 * `finally`/`afterEach`, exactly as `server.test.ts` now does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import type { CaseEvent, CaseState, CommandReceipt, RunReceipt } from '@sift/contracts';
import type { Clock, IdGenerator } from '@sift/core';
import { compileCarPurchasePack, PackRegistry } from '@sift/packs';
import { buildCarPurchaseCandidateEntities } from '@sift/scenarios';
import { createTestDatabase, type TestDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrate.js';
import { CommandService } from '../services/command-service.js';
import { RunService, SqliteRunStore, type RunRecord } from '../services/run-service.js';
import { SqliteActivityStore } from '../store/activity-store.js';
import { SqliteCaseStore } from '../store/sqlite-case-store.js';
import {
  InMemoryRuntimeEventStore,
  SqliteRuntimeEventStore,
  type PersistedRuntimeEvent,
} from '../store/runtime-event-store.js';
import { createCarPurchaseEngine } from './car-purchase-engine.js';
import { carPurchaseCapabilityCatalog } from './car-purchase-scenario.js';
import {
  installSiftTracing,
  runInSpanScope,
  MAX_ATTRIBUTE_VALUE_CHARS,
  SPAN_SEQUENCE_BASE,
  type SiftTracingHandle,
  type SpanRunLookup,
} from './otel-span-recorder.js';

const SKILLS_ROOT_DIR = fileURLToPath(new URL('../../skills', import.meta.url));
const FIXED_CLOCK: Clock = { now: () => '2026-08-27T00:00:00.000Z' };
/** Long enough for two full real Graph runs on a loaded machine; `car-purchase-engine.test.ts` uses the same order of magnitude. */
const REAL_GRAPH_TIMEOUT_MS = 90_000;

function fixedIdGenerator(): IdGenerator {
  let counter = 0;
  return { next: (prefix) => `${prefix ?? 'id'}-${++counter}` };
}

let openDatabase: TestDatabase | undefined;
let installedTracing: SiftTracingHandle | undefined;

afterEach(async () => {
  await installedTracing?.shutdown();
  installedTracing = undefined;
  openDatabase?.cleanup();
  openDatabase = undefined;
});

// --- A minimal, real run lookup for the unit-level tests, so they can drive
// the recorder against real OTel spans without paying for a Graph run. It
// returns exactly what `SqliteRunStore.load` returns for the fields this
// module reads. ---
function runLookup(
  records: Record<string, { caseId: string; obligationId: string; traceId?: string }>,
): SpanRunLookup {
  return { load: (runId) => records[runId] };
}

describe('SiftSpanRecorder (real OTel spans, no Graph)', () => {
  function install(store: InMemoryRuntimeEventStore, runStore: SpanRunLookup): SiftTracingHandle {
    installedTracing = installSiftTracing({
      runtimeEventStore: store,
      runStore,
      // `otlpEndpoint: undefined` explicitly, so an ambient
      // OTEL_EXPORTER_OTLP_ENDPOINT in the developer's shell can never make
      // these tests attach a real network exporter.
      otlpEndpoint: undefined,
    });
    return installedTracing;
  }

  it('persists a parent/child span pair with real, matching span ids and no fabricated parent link', async () => {
    const store = new InMemoryRuntimeEventStore();
    const handle = install(
      store,
      runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-run-1' } }),
    );
    const tracer = trace.getTracer('test');

    runInSpanScope('run-1', () => {
      const parent = tracer.startSpan('invoke_graph car-purchase-graph', {
        attributes: { 'gen_ai.operation.name': 'invoke_graph' },
      });
      // Exactly how the SDK's own `Tracer.withSpanContext` nests a node span
      // under its orchestrator span.
      context.with(trace.setSpan(context.active(), parent), () => {
        tracer
          .startSpan('node deal-analyst', {
            attributes: {
              'gen_ai.operation.name': 'execute_node',
              'gen_ai.agent.id': 'deal-analyst',
            },
          })
          .end();
      });
      parent.end();
    });
    await handle.recorder.forceFlush();

    const events = store.listByRun('run-1');
    expect(events).toHaveLength(2);

    const parentRow = events.find((event) => event.name === 'span.invoke_graph');
    const childRow = events.find((event) => event.name === 'span.execute_node');
    expect(parentRow?.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(childRow?.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(childRow?.parentSpanId).toBe(parentRow?.spanId);
    // The root has no parent at all rather than a placeholder.
    expect(parentRow?.parentSpanId).toBeUndefined();
    expect(childRow?.agentId).toBe('deal-analyst');
  });

  it("carries the run's own trace id on every span row, and the OTel trace id alongside it", async () => {
    const store = new InMemoryRuntimeEventStore();
    const handle = install(
      store,
      runLookup({ 'run-1': { caseId: 'case-9', obligationId: 'ob-9', traceId: 'trace-9' } }),
    );
    const tracer = trace.getTracer('test');

    runInSpanScope('run-1', () => {
      tracer.startSpan('invoke_agent x').end();
      tracer.startSpan('invoke_agent y').end();
    });
    await handle.recorder.forceFlush();

    const events = store.listByRun('run-1');
    expect(events).toHaveLength(2);
    // debugging-and-observability.md: "One run has exactly one traceId ...
    // the same value every runtime_events row for that run carries."
    expect(new Set(events.map((event) => event.traceId))).toEqual(new Set(['trace-9']));
    expect(events.every((event) => event.caseId === 'case-9')).toBe(true);
    expect(events.every((event) => event.obligationId === 'ob-9')).toBe(true);
    // The real OTel trace id is recorded too, under its own name, never
    // conflated with Sift's.
    for (const event of events) {
      expect(event.attributes['otel.trace_id']).toMatch(/^[0-9a-f]{32}$/);
      expect(event.attributes['otel.trace_id']).not.toBe(event.traceId);
    }
  });

  it('drops a span started outside any run scope rather than guessing a runId', async () => {
    const store = new InMemoryRuntimeEventStore();
    const handle = install(
      store,
      runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' } }),
    );
    const tracer = trace.getTracer('test');

    tracer.startSpan('invoke_agent orphan').end();
    runInSpanScope('run-1', () => {
      tracer.startSpan('invoke_agent attributed').end();
    });
    await handle.recorder.forceFlush();

    const events = store.listByRun('run-1');
    expect(events).toHaveLength(1);
    expect(events[0]?.attributes['otel.span_name']).toBe('invoke_agent attributed');
  });

  it('holds spans back until the run genuinely has a trace id, then writes them all', async () => {
    const store = new InMemoryRuntimeEventStore();
    const records: Record<string, { caseId: string; obligationId: string; traceId?: string }> = {
      'run-1': { caseId: 'case-1', obligationId: 'ob-1' },
    };
    const handle = install(store, runLookup(records));
    const tracer = trace.getTracer('test');

    runInSpanScope('run-1', () => {
      tracer.startSpan('invoke_agent early').end();
    });
    await handle.recorder.forceFlush();
    // The Graph mints the run's trace id internally and the engine only
    // records it on the `runs` row after `graph.invoke()` returns -- i.e.
    // after every span has ended. Nothing may be written before then.
    expect(store.listByRun('run-1')).toHaveLength(0);

    records['run-1'] = { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-late' };
    await handle.recorder.forceFlush();

    const events = store.listByRun('run-1');
    expect(events).toHaveLength(1);
    expect(events[0]?.traceId).toBe('trace-late');
  });

  it('records a real duration measured by the OTel SDK, not a hook timestamp', async () => {
    const store = new InMemoryRuntimeEventStore();
    const handle = install(
      store,
      runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' } }),
    );
    const tracer = trace.getTracer('test');

    await runInSpanScope('run-1', async () => {
      const span = tracer.startSpan('invoke_agent slow');
      await new Promise((resolve) => setTimeout(resolve, 25));
      span.end();
    });
    await handle.recorder.forceFlush();

    const [event] = store.listByRun('run-1');
    expect(event?.durationMs).toBeGreaterThanOrEqual(20);
    expect(event?.durationMs).toBeLessThan(5_000);
  });

  it('marks an errored span as an error-level event and keeps its status message', async () => {
    const store = new InMemoryRuntimeEventStore();
    const handle = install(
      store,
      runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' } }),
    );
    const tracer = trace.getTracer('test');

    runInSpanScope('run-1', () => {
      const span = tracer.startSpan('execute_tool broken', {
        attributes: { 'gen_ai.operation.name': 'execute_tool' },
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'tool exploded' });
      span.end();
    });
    await handle.recorder.forceFlush();

    const [event] = store.listByRun('run-1');
    expect(event?.level).toBe('error');
    expect(event?.phase).toBe('error');
    expect(event?.category).toBe('tool');
    expect(event?.attributes['otel.status_message']).toBe('tool exploded');
  });

  it('numbers span rows in their own disjoint sequence band so they never collide with the normalized stream', async () => {
    const store = new InMemoryRuntimeEventStore();
    const handle = install(
      store,
      runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' } }),
    );
    const tracer = trace.getTracer('test');

    // A normalized event already occupies sequence 0, exactly as a real run's
    // `event-normalizer.ts` counter would.
    store.append({
      schemaVersion: '1.0',
      sequence: 0,
      timestamp: '2026-08-27T00:00:00.000Z',
      traceId: 'trace-1',
      caseId: 'case-1',
      runId: 'run-1',
      category: 'tool',
      name: 'tool.listing_reader',
      phase: 'start',
      level: 'info',
      summary: 'Calling tool "listing_reader".',
      attributes: {},
      redactions: [],
    });

    runInSpanScope('run-1', () => {
      tracer.startSpan('invoke_agent a').end();
      tracer.startSpan('invoke_agent b').end();
    });
    await handle.recorder.forceFlush();

    const sequences = store.listByRun('run-1').map((event) => event.sequence);
    expect(sequences).toEqual([0, SPAN_SEQUENCE_BASE, SPAN_SEQUENCE_BASE + 1]);
  });

  describe('redaction', () => {
    it("redacts a secret-shaped span attribute through the store's existing Redactor stage", async () => {
      const store = new InMemoryRuntimeEventStore();
      const handle = install(
        store,
        runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' } }),
      );
      const tracer = trace.getTracer('test');

      runInSpanScope('run-1', () => {
        tracer
          .startSpan('invoke_agent leaky', {
            attributes: { 'sift.note': 'creds are SIFT_TEST_SECRET_ABC123' },
          })
          .end();
      });
      await handle.recorder.forceFlush();

      const [event] = store.listByRun('run-1');
      expect(event?.attributes['sift.note']).toBe('creds are [REDACTED]');
      expect(event?.redactions.some((r) => r.path === 'sift.note')).toBe(true);
    });

    it('never persists a content-shaped attribute verbatim, recording its length and digest instead', async () => {
      const store = new InMemoryRuntimeEventStore();
      const handle = install(
        store,
        runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' } }),
      );
      const tracer = trace.getTracer('test');
      const prompt = 'You are the deal analyst. The household note says: we hate the red one.';

      runInSpanScope('run-1', () => {
        tracer
          .startSpan('invoke_agent deal-analyst', {
            attributes: {
              system_prompt: prompt,
              'gen_ai.agent.input': '{"messages":[{"role":"user"}]}',
              'gen_ai.usage.input_tokens': 42,
              'gen_ai.request.model': 'global.anthropic.claude-sonnet-4-6',
            },
          })
          .end();
      });
      await handle.recorder.forceFlush();

      const [event] = store.listByRun('run-1');
      const digested = event?.attributes['system_prompt'] as
        { chars: number; sha256: string } | undefined;
      expect(digested?.chars).toBe(prompt.length);
      expect(digested?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(event?.attributes)).not.toContain('we hate the red one');
      expect(event?.attributes['gen_ai.agent.input']).not.toBe('{"messages":[{"role":"user"}]}');
      expect(event?.redactions.some((r) => r.path === 'attributes.system_prompt')).toBe(true);
      // Metadata is untouched -- `input_tokens` is not `input`.
      expect(event?.attributes['gen_ai.usage.input_tokens']).toBe(42);
      expect(event?.attributes['gen_ai.request.model']).toBe('global.anthropic.claude-sonnet-4-6');
    });

    it('digests an oversized non-content attribute rather than persisting the whole string', async () => {
      const store = new InMemoryRuntimeEventStore();
      const handle = install(
        store,
        runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' } }),
      );
      const tracer = trace.getTracer('test');
      const long = 'x'.repeat(MAX_ATTRIBUTE_VALUE_CHARS + 1);

      runInSpanScope('run-1', () => {
        tracer.startSpan('invoke_agent bulky', { attributes: { 'sift.blob': long } }).end();
      });
      await handle.recorder.forceFlush();

      const [event] = store.listByRun('run-1');
      expect(event?.attributes['sift.blob']).toMatchObject({ chars: long.length });
      expect(event?.redactions.some((r) => r.path === 'attributes.sift.blob')).toBe(true);
    });

    it('never persists span events or links, only their counts (span events carry message bodies verbatim)', async () => {
      const store = new InMemoryRuntimeEventStore();
      const handle = install(
        store,
        runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' } }),
      );
      const tracer = trace.getTracer('test');

      runInSpanScope('run-1', () => {
        const span = tracer.startSpan('chat model', {
          attributes: { 'gen_ai.operation.name': 'chat' },
        });
        span.addEvent('gen_ai.user.message', { content: 'my private household note' });
        span.end();
      });
      await handle.recorder.forceFlush();

      const [event] = store.listByRun('run-1');
      expect(event?.attributes['otel.event_count']).toBe(1);
      expect(JSON.stringify(event)).not.toContain('my private household note');
    });

    it('leaves tokenUsage and estimatedCostUsd unset so the Overview never double-counts the normalized model events', async () => {
      const store = new InMemoryRuntimeEventStore();
      const handle = install(
        store,
        runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' } }),
      );
      const tracer = trace.getTracer('test');

      runInSpanScope('run-1', () => {
        tracer
          .startSpan('chat model', {
            attributes: {
              'gen_ai.operation.name': 'chat',
              'gen_ai.usage.input_tokens': 100,
              'gen_ai.usage.output_tokens': 20,
            },
          })
          .end();
      });
      await handle.recorder.forceFlush();

      const [event] = store.listByRun('run-1');
      expect(event?.tokenUsage).toBeUndefined();
      expect(event?.estimatedCostUsd).toBeUndefined();
      expect(event?.attributes['gen_ai.usage.input_tokens']).toBe(100);
    });
  });

  it('never lets a persistence failure escape into the run', () => {
    const failures: unknown[] = [];
    const throwingStore = {
      append: () => {
        throw new Error('append should not be used by the recorder');
      },
      appendMany: () => {
        throw new Error('database is closed');
      },
      listByRun: () => [] as readonly PersistedRuntimeEvent[],
    };
    installedTracing = installSiftTracing({
      runtimeEventStore: throwingStore,
      runStore: runLookup({
        'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' },
      }),
      onError: (error) => failures.push(error),
      otlpEndpoint: undefined,
    });
    const tracer = trace.getTracer('test');

    expect(() => {
      runInSpanScope('run-1', () => {
        tracer.startSpan('invoke_agent a').end();
      });
    }).not.toThrow();
    expect(failures).toHaveLength(1);
  });

  it('flushes a run whose scoped function threw, and rethrows the original error', async () => {
    const store = new InMemoryRuntimeEventStore();
    const handle = install(
      store,
      runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' } }),
    );
    const tracer = trace.getTracer('test');

    expect(() =>
      runInSpanScope('run-1', () => {
        tracer.startSpan('invoke_agent a').end();
        throw new Error('engine blew up');
      }),
    ).toThrow('engine blew up');

    expect(store.listByRun('run-1')).toHaveLength(1);
    await handle.recorder.forceFlush();
  });

  it('reports a persistence failure through console.warn when no onError handler is supplied', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      installedTracing = installSiftTracing({
        runtimeEventStore: {
          append: () => {
            throw new Error('append should not be used by the recorder');
          },
          appendMany: () => {
            throw new Error('database is closed');
          },
          listByRun: () => [] as readonly PersistedRuntimeEvent[],
        },
        runStore: runLookup({
          'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' },
        }),
        otlpEndpoint: undefined,
      });
      const tracer = trace.getTracer('test');
      runInSpanScope('run-1', () => {
        tracer.startSpan('invoke_agent a').end();
      });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('database is closed'));
    } finally {
      warn.mockRestore();
    }
  });

  it('reports, and does not rethrow, a failure to read the run record', () => {
    const failures: unknown[] = [];
    const store = new InMemoryRuntimeEventStore();
    installedTracing = installSiftTracing({
      runtimeEventStore: store,
      runStore: {
        load: () => {
          throw new Error('run store is closed');
        },
      },
      onError: (error) => failures.push(error),
      otlpEndpoint: undefined,
    });
    const tracer = trace.getTracer('test');

    expect(() => {
      runInSpanScope('run-1', () => {
        tracer.startSpan('invoke_agent a').end();
      });
    }).not.toThrow();
    expect(failures.length).toBeGreaterThan(0);
    expect(store.listByRun('run-1')).toHaveLength(0);
  });

  it('bounds persisted attributes per span and reports how many it dropped', async () => {
    const store = new InMemoryRuntimeEventStore();
    installedTracing = installSiftTracing({
      runtimeEventStore: store,
      runStore: runLookup({
        'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' },
      }),
      // The nine `otel.*` attributes this module always records already
      // exceed a limit of 4, so every span attribute below is overflow.
      limits: { maxPersistedAttributes: 4 },
      otlpEndpoint: undefined,
    });
    const tracer = trace.getTracer('test');

    runInSpanScope('run-1', () => {
      tracer
        .startSpan('invoke_agent wide', {
          attributes: { 'sift.a': 1, 'sift.b': 2, 'sift.c': 3 },
        })
        .end();
    });
    await installedTracing.recorder.forceFlush();

    const [event] = store.listByRun('run-1');
    expect(event?.attributes['otel.attributes_dropped']).toBe(3);
    expect(event?.attributes['sift.a']).toBeUndefined();
    // The correlation attributes this module authors are never the ones dropped.
    expect(event?.attributes['otel.span_name']).toBe('invoke_agent wide');
  });

  it('bounds buffered spans per run and records the overflow count on the next written row', async () => {
    const store = new InMemoryRuntimeEventStore();
    const records: Record<string, { caseId: string; obligationId: string; traceId?: string }> = {
      'run-1': { caseId: 'case-1', obligationId: 'ob-1' },
    };
    installedTracing = installSiftTracing({
      runtimeEventStore: store,
      runStore: runLookup(records),
      limits: { maxBufferedSpansPerRun: 2 },
      otlpEndpoint: undefined,
    });
    const tracer = trace.getTracer('test');

    // No trace id yet, so nothing can flush and the buffer genuinely fills.
    runInSpanScope('run-1', () => {
      for (let index = 0; index < 5; index += 1) {
        tracer.startSpan(`invoke_agent s${index}`).end();
      }
    });
    expect(store.listByRun('run-1')).toHaveLength(0);

    records['run-1'] = { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' };
    await installedTracing.recorder.forceFlush();

    const events = store.listByRun('run-1');
    expect(events).toHaveLength(2);
    // Three spans genuinely did not fit, and the row says so rather than
    // silently under-reporting the run.
    expect(events[0]?.attributes['otel.spans_dropped']).toBe(3);
  });

  it('stops recording after shutdown', async () => {
    const store = new InMemoryRuntimeEventStore();
    const handle = install(
      store,
      runLookup({ 'run-1': { caseId: 'case-1', obligationId: 'ob-1', traceId: 'trace-1' } }),
    );
    const tracer = trace.getTracer('test');
    const beforeShutdown = tracer.startSpan('invoke_agent live');

    await handle.recorder.shutdown();
    runInSpanScope('run-1', () => {
      beforeShutdown.end();
      tracer.startSpan('invoke_agent after').end();
    });

    expect(store.listByRun('run-1')).toHaveLength(0);
  });

  it('attaches no OTLP exporter unless OTEL_EXPORTER_OTLP_ENDPOINT is set', () => {
    const store = new InMemoryRuntimeEventStore();
    const runStore = runLookup({});
    installedTracing = installSiftTracing({
      runtimeEventStore: store,
      runStore,
      otlpEndpoint: undefined,
    });
    expect(installedTracing.otlpExportEnabled).toBe(false);
  });

  it('attaches an OTLP exporter when OTEL_EXPORTER_OTLP_ENDPOINT is configured', () => {
    const store = new InMemoryRuntimeEventStore();
    installedTracing = installSiftTracing({
      runtimeEventStore: store,
      runStore: runLookup({}),
      otlpEndpoint: 'http://127.0.0.1:4318',
    });
    expect(installedTracing.otlpExportEnabled).toBe(true);
  });
});

describe('runInSpanScope with tracing disabled', () => {
  it('is a transparent passthrough that records nothing and changes nothing', () => {
    // No `installSiftTracing` call in this test at all -- exactly the
    // `SIFT_TRACING_ENABLED=false` deployment.
    const tracer = trace.getTracer('test');
    const observed: string[] = [];

    const returned = runInSpanScope('run-1', () => {
      const span = tracer.startSpan('invoke_agent a');
      observed.push('ran');
      span.end();
      return 'the original return value';
    });

    expect(returned).toBe('the original return value');
    expect(observed).toEqual(['ran']);
  });
});

// --- The real Graph, end to end ---

function requireOkCommand(result: {
  status: string;
}): asserts result is { status: 'ok'; value: CommandReceipt } {
  if (result.status !== 'ok') {
    throw new Error(`expected ok, got ${result.status}: ${JSON.stringify(result)}`);
  }
}

function requireOkRun(result: {
  status: string;
}): asserts result is { status: 'ok'; value: RunReceipt } {
  if (result.status !== 'ok') {
    throw new Error(`expected ok, got ${result.status}: ${JSON.stringify(result)}`);
  }
}

function requireSnapshot(receipt: CommandReceipt): CaseState {
  if (receipt.snapshot === undefined) throw new Error('receipt has no snapshot');
  return receipt.snapshot;
}

/** Seeds the four real candidates onto a started demo case; see `car-purchase-engine.test.ts`'s identical helper for why a direct `option.upserted` append is the only expressible path. */
function seedRealCandidates(
  caseStore: SqliteCaseStore,
  caseId: string,
  snapshot: CaseState,
  clock: Clock,
  idGenerator: IdGenerator,
): CaseState {
  const entities = buildCarPurchaseCandidateEntities(clock);
  const events: CaseEvent[] = entities.map((entity, index) => ({
    eventId: idGenerator.next('event'),
    caseId,
    sequence: snapshot.eventSequence + 1 + index,
    timestamp: clock.now(),
    type: 'option.upserted',
    payload: { entity },
  }));
  const result = caseStore.append(caseId, events, snapshot.eventSequence);
  if (result.status !== 'applied') {
    throw new Error(`test setup: failed to seed real candidates: status "${result.status}"`);
  }
  return result.snapshot;
}

async function waitForRunSettled(
  runStore: SqliteRunStore,
  runId: string,
  timeoutMs = 60_000,
): Promise<RunRecord> {
  const start = Date.now();
  for (;;) {
    const record = runStore.load(runId);
    if (record !== undefined && (record.status === 'completed' || record.status === 'failed')) {
      return record;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `waitForRunSettled: run "${runId}" did not settle within ${timeoutMs}ms (status: ${record?.status ?? 'unknown'})`,
      );
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 15));
  }
}

interface LiveStack {
  caseStore: SqliteCaseStore;
  runStore: SqliteRunStore;
  runtimeEventStore: SqliteRuntimeEventStore;
  commandService: CommandService;
  runService: RunService;
  idGenerator: IdGenerator;
}

function buildLiveStack(): LiveStack {
  const database = createTestDatabase();
  openDatabase = database;
  applyMigrations(database.sqlite);

  const registry = new PackRegistry();
  const pack = compileCarPurchasePack(carPurchaseCapabilityCatalog(), FIXED_CLOCK);
  registry.register(pack);

  const caseStore = new SqliteCaseStore(database);
  const activityStore = new SqliteActivityStore(database);
  const runStore = new SqliteRunStore(database);
  const runtimeEventStore = new SqliteRuntimeEventStore(database);
  const idGenerator = fixedIdGenerator();

  const engine = createCarPurchaseEngine({
    caseStore,
    activityStore,
    runStore,
    runtimeEventStore,
    registry,
    clock: FIXED_CLOCK,
    idGenerator,
    skillsRootDir: SKILLS_ROOT_DIR,
  });

  const commandService = new CommandService({
    caseStore,
    activityStore,
    registry,
    clock: FIXED_CLOCK,
    idGenerator,
  });
  const runService = new RunService({
    caseStore,
    activityStore,
    runStore,
    clock: FIXED_CLOCK,
    idGenerator,
    engines: { [pack.identity.id]: engine },
  });

  return { caseStore, runStore, runtimeEventStore, commandService, runService, idGenerator };
}

/** Drives one real round-1 investigation through the real `RunService` and returns the settled run. */
async function runRealRound1(stack: LiveStack): Promise<{ runId: string; caseId: string }> {
  const startResult = stack.commandService.startDemo('cmd-start', { demoId: 'car-purchase' });
  requireOkCommand(startResult);
  let snapshot = requireSnapshot(startResult.value);
  const caseId = snapshot.id;

  snapshot = seedRealCandidates(stack.caseStore, caseId, snapshot, FIXED_CLOCK, stack.idGenerator);

  const focusResult = stack.commandService.focusOption('cmd-focus', {
    caseId,
    optionId: 'candidate-rav4',
    expectedSequence: snapshot.eventSequence,
  });
  requireOkCommand(focusResult);
  snapshot = requireSnapshot(focusResult.value);

  const runResult = stack.runService.requestInvestigation('cmd-run-1', {
    caseId,
    obligationId: 'car.deal_normalization',
    expectedSequence: snapshot.eventSequence,
  });
  requireOkRun(runResult);
  const runId = runResult.value.runId;

  const settled = await waitForRunSettled(stack.runStore, runId);
  if (settled.status !== 'completed') {
    process.stderr.write(`RUN FAILED: ${JSON.stringify(settled.result)}\n`);
  }
  expect(settled.status).toBe('completed');
  return { runId, caseId };
}

/** Only the rows this module wrote: the normalized stream never uses `spanId`. */
function spanRows(events: readonly PersistedRuntimeEvent[]): PersistedRuntimeEvent[] {
  return events.filter((event) => event.spanId !== undefined);
}

describe('car-purchase Strands Graph (real run, real SQLite) with tracing installed', () => {
  it(
    'persists the real span tree the SDK emits, with correct parent/child links and real durations',
    async () => {
      const stack = buildLiveStack();
      installedTracing = installSiftTracing({
        runtimeEventStore: stack.runtimeEventStore,
        runStore: stack.runStore,
        otlpEndpoint: undefined,
      });

      const { runId, caseId } = await runRealRound1(stack);
      // The run's spans are flushed when its trigger settles; force one here
      // so the assertions below never race that microtask.
      await installedTracing.recorder.forceFlush();

      const all = stack.runtimeEventStore.listByRun(runId);
      const spans = spanRows(all);

      // --- Spans genuinely landed, alongside (never replacing) the normalized stream ---
      expect(spans.length).toBeGreaterThan(0);
      expect(all.length).toBeGreaterThan(spans.length);
      expect(spans.every((span) => /^[0-9a-f]{16}$/.test(span.spanId ?? ''))).toBe(true);

      // --- Every span belongs to this real run, and to this real case ---
      expect(spans.every((span) => span.runId === runId)).toBe(true);
      expect(spans.every((span) => span.caseId === caseId)).toBe(true);
      const runRecord = stack.runStore.load(runId);
      expect(spans.every((span) => span.traceId === runRecord?.traceId)).toBe(true);
      // The whole-run invariant the spec states and both engines assert still
      // holds now that span rows share the table.
      expect(new Set(all.map((event) => event.traceId)).size).toBe(1);

      // --- The tree: exactly one root, every other span's parent present ---
      const byId = new Map(spans.map((span) => [span.spanId, span]));
      const roots = spans.filter((span) => span.parentSpanId === undefined);
      expect(roots).toHaveLength(1);
      expect(roots[0]?.name).toBe('span.invoke_graph');
      expect(roots[0]?.category).toBe('graph');
      for (const span of spans) {
        if (span.parentSpanId === undefined) continue;
        expect(byId.has(span.parentSpanId)).toBe(true);
        expect(span.parentSpanId).not.toBe(span.spanId);
      }

      // --- The Graph's own topology, read purely from the persisted tree ---
      const rootId = roots[0]?.spanId;
      const nodeSpans = spans.filter((span) => span.name === 'span.execute_node');
      expect(nodeSpans.every((span) => span.parentSpanId === rootId)).toBe(true);
      expect(new Set(nodeSpans.map((span) => span.agentId))).toEqual(
        new Set([
          'deal-analyst',
          'ownership-cost-analyst',
          'safety-reliability-analyst',
          'household-fit-analyst',
          'source-challenger',
          'decision-synthesizer',
        ]),
      );

      // --- Real nesting below a node: agent -> loop cycle -> model/tool ---
      const depthOf = (span: PersistedRuntimeEvent): number => {
        let depth = 0;
        let current: PersistedRuntimeEvent | undefined = span;
        while (current?.parentSpanId !== undefined) {
          current = byId.get(current.parentSpanId);
          depth += 1;
          if (depth > 20) break;
        }
        return depth;
      };
      const modelSpans = spans.filter((span) => span.name === 'span.chat');
      const toolSpans = spans.filter((span) => span.name === 'span.execute_tool');
      expect(modelSpans.length).toBeGreaterThan(0);
      expect(toolSpans.length).toBeGreaterThan(0);
      // graph -> node -> agent -> loop cycle -> model/tool is five levels, so a
      // model or tool span sits at depth 4 or deeper.
      expect(Math.max(...modelSpans.map(depthOf))).toBeGreaterThanOrEqual(4);
      expect(Math.max(...toolSpans.map(depthOf))).toBeGreaterThanOrEqual(4);

      // --- Categories the Runtime Inspector can filter by ---
      expect(new Set(spans.map((span) => span.category))).toEqual(
        new Set(['graph', 'agent', 'model', 'tool']),
      );

      // --- Real durations, and a parent that spans at least as long as its child ---
      expect(spans.every((span) => typeof span.durationMs === 'number')).toBe(true);
      expect(roots[0]?.durationMs).toBeGreaterThan(0);
      for (const node of nodeSpans) {
        expect(roots[0]?.durationMs ?? 0).toBeGreaterThanOrEqual(node.durationMs ?? 0);
      }

      // --- Sequences: disjoint band, monotonic, never colliding with the stream ---
      const spanSequences = spans.map((span) => span.sequence);
      expect(Math.min(...spanSequences)).toBe(SPAN_SEQUENCE_BASE);
      expect(spanSequences).toEqual([...spanSequences].sort((a, b) => a - b));
      const normalizedSequences = all
        .filter((event) => event.spanId === undefined)
        .map((event) => event.sequence);
      expect(Math.max(...normalizedSequences)).toBeLessThan(SPAN_SEQUENCE_BASE);

      // --- No model or tool content escaped into a persisted span row ---
      const serialized = JSON.stringify(spans);
      expect(serialized).not.toContain('You are the ');
      for (const span of spans) {
        expect(span.attributes['system_prompt']).not.toBeTypeOf('string');
        expect(span.attributes['gen_ai.agent.input']).not.toBeTypeOf('string');
      }
    },
    REAL_GRAPH_TIMEOUT_MS,
  );

  it(
    'records no spans and changes nothing when tracing is disabled',
    async () => {
      const stack = buildLiveStack();
      // Deliberately no `installSiftTracing` -- SIFT_TRACING_ENABLED=false.
      const { runId } = await runRealRound1(stack);

      const all = stack.runtimeEventStore.listByRun(runId);
      expect(spanRows(all)).toHaveLength(0);
      // The run still produced its full normalized stream and completed.
      expect(all.length).toBeGreaterThan(0);
      expect(
        all.some((event) => event.category === 'graph' && event.name === 'graph.node_completed'),
      ).toBe(true);
    },
    REAL_GRAPH_TIMEOUT_MS,
  );
});
