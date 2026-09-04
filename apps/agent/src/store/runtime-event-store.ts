/**
 * `RuntimeEventStore`: persists and queries `RuntimeDebugEvent`s
 * (docs/specs/debugging-and-observability.md "Runtime event contract") into
 * the `runtime_events` table `db/schema.ts` already declares -- the table
 * that had no writer anywhere in this codebase before this task (confirmed
 * by grep before starting).
 *
 * Mirrors `activity-store.ts`'s two-implementation pattern exactly
 * (`InMemoryRuntimeEventStore` for fast unit tests, `SqliteRuntimeEventStore`
 * for the real service and integration tests), and the same `(run_id,
 * sequence)` per-run monotonic-sequence discipline the schema's own unique
 * index already enforces. Unlike `ActivityStore.append` (which *assigns*
 * `sequence` itself), `RuntimeEventStore.append` accepts an already-fully-
 * formed `RuntimeDebugEvent` whose `sequence` was assigned by the caller's
 * own per-run `createSequenceCounter()` (`event-normalizer.ts`) -- the same
 * counter that already numbers every event in a run's normalized stream,
 * public and debug alike. A duplicate `(runId, sequence)` append is a
 * genuine caller bug (never expected in normal operation, since that counter
 * is monotonic for the lifetime of one run) and is left to surface as a real
 * thrown error -- a SQLite `UNIQUE` constraint violation for the SQLite
 * implementation, an explicit throw for the in-memory one, for symmetry --
 * rather than silently ignored.
 *
 * `id` is a synthetic per-row identifier minted here at persistence time
 * (schema.ts's own comment on `runtimeEvents.id`: "`RuntimeDebugEvent` has
 * no dedicated 'event id' field of its own ... `id` is therefore a synthetic
 * per-row identifier assigned at persistence time, which is what
 * `activity_events.debug_event_id` points at").
 *
 * --- The "Redactor" stage (architecture diagram, verbatim) ---
 *
 * debugging-and-observability.md's "Instrumentation architecture" diagram
 * names an explicit `Redactor` stage between the `TelemetryNormalizer`
 * (`event-normalizer.ts`, which already redacts tool/model *payloads* at
 * construction time via its own `redactValue`) and `runtime_events`
 * persistence itself:
 *
 * ```text
 * ... ─> TelemetryNormalizer ─> Redactor ─> runtime_events
 * ```
 *
 * This store is that `Redactor` boundary. `append()` re-applies
 * `event-normalizer.ts`'s exact same `redactValue` (not a second, drifted
 * reimplementation) to `attributes`/`payload`/`stateDiff` immediately before
 * writing, and merges any newly-found redactions into the persisted
 * `redactions` manifest. In normal operation this is a defensive no-op for
 * `payload` -- every event reaching this store today came from
 * `event-normalizer.ts`, which already redacted the one field genuinely
 * capable of carrying arbitrary tool/model content -- but it is the one
 * place this codebase can honestly claim CLAUDE.md's "Never persist
 * credentials, authorization headers, cookies, secret canaries, raw private
 * reasoning, or unredacted user-entered notes in runtime telemetry" for
 * *every* field that reaches durable `runtime_events` storage, including
 * `attributes`, which upstream normalizers populate with small structured
 * metadata today (tool names, stop reasons) but are not contractually
 * forbidden from carrying more in a future normalizer.
 */
import { randomUUID } from 'node:crypto';
import {
  RuntimeDebugEventSchema,
  type Redaction,
  type RuntimeDebugCategory,
  type RuntimeDebugEvent,
  type RuntimeDebugLevel,
} from '@sift/contracts';
import type { SiftDatabase } from '../db/connection.js';
import { redactValue } from '../runtime/event-normalizer.js';

/** A persisted `RuntimeDebugEvent` plus the synthetic `id` minted at write time. See this module's header comment. */
export interface PersistedRuntimeEvent extends RuntimeDebugEvent {
  readonly id: string;
}

export interface RuntimeEventListFilter {
  category?: RuntimeDebugCategory;
  level?: RuntimeDebugLevel;
}

export interface RuntimeEventStore {
  /** Redacts (the "Redactor" stage, see header comment), durably persists, and returns one `RuntimeDebugEvent` with its synthetic `id` attached. Throws on a duplicate `(runId, sequence)`. */
  append(event: RuntimeDebugEvent): PersistedRuntimeEvent;
  /**
   * `append` for a whole batch, applied atomically. Every event goes through
   * the identical validation and Redactor stage; the batch either lands
   * whole or not at all, so a mid-batch duplicate `(runId, sequence)` never
   * leaves a partially written group behind.
   *
   * Exists because `runtime/otel-span-recorder.ts` flushes a run's whole
   * buffered span batch at once (roughly one span per model call, tool call,
   * agent loop cycle, Graph/Swarm node, and orchestrator invocation), and one
   * `INSERT` per span would be one WAL commit per span.
   */
  appendMany(events: readonly RuntimeDebugEvent[]): readonly PersistedRuntimeEvent[];
  /** Every persisted event for `runId`, in `sequence` order, optionally narrowed by `category`/`level`. Empty array for an unknown `runId`. */
  listByRun(runId: string, filter?: RuntimeEventListFilter): readonly PersistedRuntimeEvent[];
}

/** Re-applies `redactValue` (event-normalizer.ts) to every field capable of carrying arbitrary content, merging any newly-found redactions into the returned event's `redactions` manifest. See this module's header comment ("The Redactor stage"). */
function redactRuntimeEvent(event: RuntimeDebugEvent): RuntimeDebugEvent {
  const { value: attributes, redactions: attributeRedactions } = redactValue(event.attributes);
  const payloadResult = event.payload !== undefined ? redactValue(event.payload) : undefined;
  const stateDiffResult = event.stateDiff !== undefined ? redactValue(event.stateDiff) : undefined;

  const redactions: Redaction[] = [
    ...event.redactions,
    ...attributeRedactions,
    ...(payloadResult?.redactions ?? []),
    ...(stateDiffResult?.redactions ?? []),
  ];

  return {
    ...event,
    attributes: attributes as Record<string, unknown>,
    ...(payloadResult !== undefined ? { payload: payloadResult.value } : {}),
    ...(stateDiffResult !== undefined
      ? { stateDiff: stateDiffResult.value as RuntimeDebugEvent['stateDiff'] }
      : {}),
    redactions,
  };
}

function matchesFilter(
  event: RuntimeDebugEvent,
  filter: RuntimeEventListFilter | undefined,
): boolean {
  if (filter?.category !== undefined && event.category !== filter.category) return false;
  if (filter?.level !== undefined && event.level !== filter.level) return false;
  return true;
}

export class InMemoryRuntimeEventStore implements RuntimeEventStore {
  private readonly byRun = new Map<string, PersistedRuntimeEvent[]>();

  append(event: RuntimeDebugEvent): PersistedRuntimeEvent {
    const validated = RuntimeDebugEventSchema.parse(redactRuntimeEvent(event));
    const existing = this.byRun.get(validated.runId) ?? [];
    if (existing.some((entry) => entry.sequence === validated.sequence)) {
      throw new Error(
        `InMemoryRuntimeEventStore: duplicate sequence ${validated.sequence} for run "${validated.runId}"`,
      );
    }
    const persisted: PersistedRuntimeEvent = { id: randomUUID(), ...validated };
    this.byRun.set(validated.runId, [...existing, persisted]);
    return persisted;
  }

  /** Atomic by construction: every event is validated and staged before any of them is visible, so a rejected event leaves the store untouched. */
  appendMany(events: readonly RuntimeDebugEvent[]): readonly PersistedRuntimeEvent[] {
    const staged = new Map<string, PersistedRuntimeEvent[]>();
    const persisted: PersistedRuntimeEvent[] = [];
    for (const event of events) {
      const validated = RuntimeDebugEventSchema.parse(redactRuntimeEvent(event));
      const forRun = staged.get(validated.runId) ?? [...(this.byRun.get(validated.runId) ?? [])];
      if (forRun.some((entry) => entry.sequence === validated.sequence)) {
        throw new Error(
          `InMemoryRuntimeEventStore: duplicate sequence ${validated.sequence} for run "${validated.runId}"`,
        );
      }
      const row: PersistedRuntimeEvent = { id: randomUUID(), ...validated };
      forRun.push(row);
      staged.set(validated.runId, forRun);
      persisted.push(row);
    }
    for (const [runId, rows] of staged) this.byRun.set(runId, rows);
    return persisted;
  }

  listByRun(runId: string, filter?: RuntimeEventListFilter): readonly PersistedRuntimeEvent[] {
    return (this.byRun.get(runId) ?? [])
      .filter((event) => matchesFilter(event, filter))
      .sort((a, b) => a.sequence - b.sequence);
  }
}

/** The subset of `RuntimeDebugEvent` not promoted to a real `runtime_events` column -- serialized as one JSON blob in `data` (schema.ts's own rationale: several of these fields are themselves typed `unknown`/`Record<string, unknown>` in the spec). */
interface RuntimeEventDataBlob {
  schemaVersion: RuntimeDebugEvent['schemaVersion'];
  requestId?: string;
  attributes: Record<string, unknown>;
  payload?: unknown;
  tokenUsage?: RuntimeDebugEvent['tokenUsage'];
  estimatedCostUsd?: number;
  stateDiff?: RuntimeDebugEvent['stateDiff'];
  redactions: Redaction[];
}

function toDataBlob(event: RuntimeDebugEvent): RuntimeEventDataBlob {
  return {
    schemaVersion: event.schemaVersion,
    ...(event.requestId !== undefined ? { requestId: event.requestId } : {}),
    attributes: event.attributes,
    ...(event.payload !== undefined ? { payload: event.payload } : {}),
    ...(event.tokenUsage !== undefined ? { tokenUsage: event.tokenUsage } : {}),
    ...(event.estimatedCostUsd !== undefined ? { estimatedCostUsd: event.estimatedCostUsd } : {}),
    ...(event.stateDiff !== undefined ? { stateDiff: event.stateDiff } : {}),
    redactions: event.redactions,
  };
}

interface RuntimeEventRow {
  id: string;
  runId: string;
  caseId: string;
  sequence: number;
  category: string;
  name: string;
  phase: string;
  level: string;
  traceId: string;
  spanId: string | null;
  parentSpanId: string | null;
  sessionId: string | null;
  obligationId: string | null;
  agentId: string | null;
  durationMs: number | null;
  summary: string;
  createdAt: string;
  data: string;
}

function rowToEvent(row: RuntimeEventRow): PersistedRuntimeEvent {
  const blob = JSON.parse(row.data) as RuntimeEventDataBlob;
  const validated = RuntimeDebugEventSchema.parse({
    schemaVersion: blob.schemaVersion,
    sequence: row.sequence,
    timestamp: row.createdAt,
    traceId: row.traceId,
    ...(row.spanId !== null ? { spanId: row.spanId } : {}),
    ...(row.parentSpanId !== null ? { parentSpanId: row.parentSpanId } : {}),
    ...(blob.requestId !== undefined ? { requestId: blob.requestId } : {}),
    caseId: row.caseId,
    runId: row.runId,
    ...(row.sessionId !== null ? { sessionId: row.sessionId } : {}),
    ...(row.obligationId !== null ? { obligationId: row.obligationId } : {}),
    ...(row.agentId !== null ? { agentId: row.agentId } : {}),
    category: row.category,
    name: row.name,
    phase: row.phase,
    level: row.level,
    ...(row.durationMs !== null ? { durationMs: row.durationMs } : {}),
    ...(blob.tokenUsage !== undefined ? { tokenUsage: blob.tokenUsage } : {}),
    ...(blob.estimatedCostUsd !== undefined ? { estimatedCostUsd: blob.estimatedCostUsd } : {}),
    summary: row.summary,
    attributes: blob.attributes,
    ...(blob.payload !== undefined ? { payload: blob.payload } : {}),
    ...(blob.stateDiff !== undefined ? { stateDiff: blob.stateDiff } : {}),
    redactions: blob.redactions,
  });
  return { id: row.id, ...validated };
}

const INSERT_RUNTIME_EVENT_SQL = `INSERT INTO runtime_events
          (id, run_id, case_id, sequence, category, name, phase, level, trace_id, span_id, parent_span_id, session_id, obligation_id, agent_id, duration_ms, summary, created_at, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** The positional bind values for `INSERT_RUNTIME_EVENT_SQL`, in column order. */
function insertParameters(id: string, event: RuntimeDebugEvent): unknown[] {
  return [
    id,
    event.runId,
    event.caseId,
    event.sequence,
    event.category,
    event.name,
    event.phase,
    event.level,
    event.traceId,
    event.spanId ?? null,
    event.parentSpanId ?? null,
    event.sessionId ?? null,
    event.obligationId ?? null,
    event.agentId ?? null,
    event.durationMs ?? null,
    event.summary,
    event.timestamp,
    JSON.stringify(toDataBlob(event)),
  ];
}

export class SqliteRuntimeEventStore implements RuntimeEventStore {
  constructor(private readonly database: SiftDatabase) {}

  append(event: RuntimeDebugEvent): PersistedRuntimeEvent {
    const validated = RuntimeDebugEventSchema.parse(redactRuntimeEvent(event));
    const id = randomUUID();
    this.database.sqlite.prepare(INSERT_RUNTIME_EVENT_SQL).run(...insertParameters(id, validated));
    return { id, ...validated };
  }

  /**
   * One prepared statement, one `better-sqlite3` transaction, one WAL
   * commit for the whole batch. Validation and redaction run *before* the
   * transaction opens so a malformed event fails without ever having taken
   * a write lock; a constraint violation inside the transaction rolls the
   * whole batch back.
   */
  appendMany(events: readonly RuntimeDebugEvent[]): readonly PersistedRuntimeEvent[] {
    const prepared = events.map((event) => ({
      id: randomUUID(),
      event: RuntimeDebugEventSchema.parse(redactRuntimeEvent(event)),
    }));
    if (prepared.length === 0) return [];

    const statement = this.database.sqlite.prepare(INSERT_RUNTIME_EVENT_SQL);
    const insertAll = this.database.sqlite.transaction(() => {
      for (const { id, event } of prepared) {
        statement.run(...insertParameters(id, event));
      }
    });
    insertAll();
    return prepared.map(({ id, event }) => ({ id, ...event }));
  }

  listByRun(runId: string, filter?: RuntimeEventListFilter): readonly PersistedRuntimeEvent[] {
    const conditions = ['run_id = ?'];
    const params: unknown[] = [runId];
    if (filter?.category !== undefined) {
      conditions.push('category = ?');
      params.push(filter.category);
    }
    if (filter?.level !== undefined) {
      conditions.push('level = ?');
      params.push(filter.level);
    }
    const rows = this.database.sqlite
      .prepare(
        `SELECT id, run_id as runId, case_id as caseId, sequence, category, name, phase, level,
                trace_id as traceId, span_id as spanId, parent_span_id as parentSpanId,
                session_id as sessionId, obligation_id as obligationId, agent_id as agentId,
                duration_ms as durationMs, summary, created_at as createdAt, data
         FROM runtime_events WHERE ${conditions.join(' AND ')} ORDER BY sequence ASC`,
      )
      .all(...params) as RuntimeEventRow[];
    return rows.map(rowToEvent);
  }
}
