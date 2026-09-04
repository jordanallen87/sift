/**
 * Drizzle schema for the seven tables required by
 * docs/specs/architecture.md "Persistence": `cases`, `case_events`,
 * `activity_events`, `runs`, `idempotency_keys`, `runtime_events`,
 * `schema_migrations`.
 *
 * Design rule applied throughout (per this task's scope): give every table
 * real, typed columns for the fields needed to index, uniquely constrain, or
 * foreign-key against (ids, sequences, discriminant/status strings, and the
 * correlation ids listed in `RuntimeCorrelation` /
 * docs/specs/debugging-and-observability.md), and store the remaining
 * nested/variant-shaped data (full event payloads, case snapshots, redacted
 * telemetry attributes) as a single JSON-serialized `text` blob column. Any
 * later task that needs a currently-JSON-only field to be independently
 * indexable can promote it to a real column in a follow-up migration; this
 * task does not need to anticipate every future query.
 *
 * `packages/core` (`applyCaseEvent`, `evaluateReadiness`, ...) is a separate,
 * not-yet-landed workstream. This module has no dependency on it — it only
 * needs the stable envelope shapes from `@sift/contracts` for documentation
 * comments; the columns themselves are plain SQLite types.
 */
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

// --- cases ---
// "latest derived snapshot and pinned pack ID/version/hash"
// (architecture.md "Persistence"). Real columns cover everything used for
// identity, status filtering, pack pin lookups, and the optimistic-
// concurrency `expectedSequence` check described in "Command and event
// flow" step 2. The full `CaseState` (entities, criteria, obligations,
// claims, sources, evidenceLinks, recommendation, proposal, activeFocus,
// selection ids) is stored as one JSON snapshot blob in `snapshot` — a
// later command-service task serializes/deserializes it against
// `CaseStateSchema` from `@sift/contracts` at the read/write boundary.
export const cases = sqliteTable('cases', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  status: text('status').notNull(),
  packId: text('pack_id').notNull(),
  packVersion: text('pack_version').notNull(),
  packCompiledHash: text('pack_compiled_hash').notNull(),
  packSelectedBy: text('pack_selected_by').notNull(),
  eventSequence: integer('event_sequence').notNull().default(0),
  snapshot: text('snapshot').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// --- case_events ---
// "append-only canonical domain events" (architecture.md "Persistence").
// Mirrors `CaseEvent`'s base fields (`eventId`, `caseId`, `sequence`,
// `timestamp`, `commandId?`, `type`) as real columns; the twelve
// discriminated `payload` shapes in packages/contracts/src/events.ts stay
// one JSON blob per row since the shape varies by `type`.
export const caseEvents = sqliteTable(
  'case_events',
  {
    id: text('id').primaryKey(),
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    commandId: text('command_id'),
    createdAt: text('created_at').notNull(),
    payload: text('payload').notNull(),
  },
  (t) => [
    // architecture.md "Persistence": "`(case_id, sequence)` ... are unique."
    uniqueIndex('case_events_case_id_sequence_unique').on(t.caseId, t.sequence),
    index('case_events_case_id_idx').on(t.caseId),
  ],
);

// --- activity_events ---
// "append-only sanitized public case stream with per-case sequence"
// (architecture.md "Persistence"), storing `PublicActivityEvent`
// (architecture.md "Real-time event contract"). Every field the normal
// workspace SSE/polling contract filters or correlates on
// (case/run/obligation/agent/command/debug-event ids, `type`, `phase`) is a
// real column; `safeDetails` (a bounded `JsonValue` record) stays JSON in
// `data`.
export const activityEvents = sqliteTable(
  'activity_events',
  {
    id: text('id').primaryKey(),
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    type: text('type').notNull(),
    phase: text('phase').notNull(),
    commandId: text('command_id'),
    runId: text('run_id'),
    obligationId: text('obligation_id'),
    agentId: text('agent_id'),
    debugEventId: text('debug_event_id'),
    summary: text('summary').notNull(),
    createdAt: text('created_at').notNull(),
    data: text('data'),
  },
  (t) => [
    // architecture.md "Persistence": "`activity_events` gives the normal UI
    // one replayable public sequence across commands and runs" — the same
    // per-case-sequence uniqueness rule as `case_events`.
    uniqueIndex('activity_events_case_id_sequence_unique').on(t.caseId, t.sequence),
    index('activity_events_case_id_idx').on(t.caseId),
    index('activity_events_run_id_idx').on(t.runId),
  ],
);

// --- runs ---
// "execution status, focus, bounds, trace/session IDs"
// (architecture.md "Persistence"). `obligationId` is the run's "focus"
// (the obligation an `ExecutionRequest` targets); `traceId`/`sessionId` are
// `RuntimeCorrelation` fields (debugging-and-observability.md); `limits`
// (`ExecutionLimits`) and the eventual `result` (`ExecutionResult`,
// strands-runtime.md) are not filtered/indexed on anywhere in the spec, so
// they stay JSON rather than being expanded into five-plus rarely-queried
// columns each.
//
// `status` vocabulary is inferred: no spec names a `RunStatus` enum
// directly, but `PublicActivityEvent`'s `run.queued` / `run.started` /
// `run.completed` / `run.failed` types (architecture.md "Real-time event
// contract") give an unambiguous run lifecycle — `started` maps to the
// in-progress state, named `running` here to distinguish it from the
// `active` `PublicActivityPhase`.
export const RUN_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const runs = sqliteTable(
  'runs',
  {
    id: text('id').primaryKey(),
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    obligationId: text('obligation_id').notNull(),
    status: text('status').notNull(),
    traceId: text('trace_id'),
    sessionId: text('session_id'),
    limits: text('limits'),
    result: text('result'),
    // I1 (ADR 0006 decision 8; debugging-and-observability.md "WebMCP tool
    // calls"): which transport asked for this run, from the same
    // `X-Sift-Command-Origin` header and closed `COMMAND_ORIGINS`
    // vocabulary `routes/commands.ts` already reads for a command
    // (`@sift/contracts` `CommandOrigin`) — never a second, parallel
    // provenance concept, and never consulted for an authorization
    // decision.
    //
    // Deliberately NULLABLE with no default. NULL means "the caller did not
    // state an origin", which is genuinely different from any origin token;
    // defaulting it to `'user'` would manufacture a claim nobody made, and
    // would silently relabel every run recorded before this column existed.
    origin: text('origin'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('runs_case_id_idx').on(t.caseId)],
);

// --- idempotency_keys ---
// "command result deduplication" (architecture.md "Persistence").
//
// Judgment call: architecture.md's command flow describes a command as
// carrying "an idempotency key and client-generated `commandId`"
// (architecture.md "Command and event flow" step 1), but no schema in
// `@sift/contracts` (`CommandReceipt`, `RunReceipt`, or any `*Input` schema)
// has a field separate from `commandId` for this. Modeled as apposition —
// the client-generated `commandId` *is* the idempotency key — since that is
// the only identifier the contracts actually carry; a later task that finds
// a genuinely distinct idempotency-key field can add a column without
// changing this table's shape. Primary-key `id` gives the "idempotency keys
// are unique" constraint directly.
export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    id: text('id').primaryKey(),
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    commandName: text('command_name').notNull(),
    result: text('result').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idempotency_keys_case_id_idx').on(t.caseId)],
);

// --- runtime_events ---
// "sanitized hooks, spans, logs, diffs, and errors" (architecture.md
// "Persistence"), storing `RuntimeDebugEvent`
// (debugging-and-observability.md "Runtime event contract"). Every field
// the Runtime Inspector filters, correlates, or navigates by (category,
// level, the full `RuntimeCorrelation` id set, `sequence`) is a real
// column; `attributes`/`payload`/`tokenUsage`/`estimatedCostUsd`/
// `stateDiff`/`redactions` stay one JSON blob in `data` since the spec
// itself types several of them as bare `unknown` (runtime.ts) rather than a
// fixed shape.
//
// `RuntimeDebugEvent` has no dedicated "event id" field of its own (only
// `traceId`/`spanId`/... correlation ids), but
// debugging-and-observability.md requires "Every public event with
// `debugEventId` must resolve to exactly one safe debug event" — `id` is
// therefore a synthetic per-row identifier assigned at persistence time,
// which is what `activity_events.debug_event_id` points at.
export const runtimeEvents = sqliteTable(
  'runtime_events',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    category: text('category').notNull(),
    name: text('name').notNull(),
    phase: text('phase').notNull(),
    level: text('level').notNull(),
    traceId: text('trace_id').notNull(),
    spanId: text('span_id'),
    parentSpanId: text('parent_span_id'),
    sessionId: text('session_id'),
    obligationId: text('obligation_id'),
    agentId: text('agent_id'),
    durationMs: integer('duration_ms'),
    summary: text('summary').notNull(),
    createdAt: text('created_at').notNull(),
    data: text('data').notNull(),
  },
  (t) => [
    // Not explicitly required by architecture.md (which only names
    // `(case_id, sequence)` for case/activity events), but
    // debugging-and-observability.md states "`sequence` is monotonic within
    // a run" — the same per-scope-sequence integrity rule, applied here to
    // avoid duplicate/out-of-order telemetry writes going undetected.
    uniqueIndex('runtime_events_run_id_sequence_unique').on(t.runId, t.sequence),
    index('runtime_events_case_id_idx').on(t.caseId),
    index('runtime_events_run_id_idx').on(t.runId),
  ],
);

// --- run_plans ---
// The continuous RunPlan (`runtime/run-plan.ts`), one row per *version*.
//
// Versions are kept rather than overwritten because the plan's central
// claim is historical: "a new concern revised work already under way, and
// here is what was reused." A table that stored only the current plan could
// state the conclusion but never show the change, and a demo beat that can
// only be narrated is exactly the kind of claim this build refuses to make.
//
// `(plan_id, version)` is the primary key, so re-persisting a version is a
// constraint violation rather than a silent overwrite of history. The plan
// body itself stays one JSON blob in `data`: a plan is derived, always
// re-derivable from case state, and never queried by its internal fields --
// the columns promoted out of it are exactly the ones a lookup needs.
export const runPlans = sqliteTable(
  'run_plans',
  {
    planId: text('plan_id').notNull(),
    version: integer('version').notNull(),
    caseId: text('case_id')
      .notNull()
      .references(() => cases.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
    data: text('data').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.planId, t.version] }),
    index('run_plans_case_id_idx').on(t.caseId),
  ],
);

// --- schema_migrations ---
// "applied migration ledger" (architecture.md "Persistence"). Populated by
// `src/db/migrate.ts`'s own idempotent runner (not by
// `drizzle-orm/better-sqlite3/migrator`'s built-in bookkeeping table, so
// this repo controls its exact shape via this schema like every other
// table). `name` is the applied migration file's basename (unique — a
// migration is recorded at most once); `hash` is a content hash of the
// applied SQL, kept so a future run can detect a migration file that was
// edited after being applied instead of silently trusting the filename.
export const schemaMigrations = sqliteTable('schema_migrations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  hash: text('hash').notNull(),
  appliedAt: text('applied_at').notNull(),
});
