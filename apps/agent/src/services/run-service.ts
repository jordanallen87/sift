/**
 * `RunService`: durable run-record bookkeeping and the `RunReceipt` contract
 * for `requestInvestigation` (docs/specs/architecture.md "Shared command
 * client": `requestInvestigation(input: RequestInvestigationInput):
 * Promise<RunReceipt>`; "Persistence": `runs` -- "execution status, focus,
 * bounds, trace/session IDs").
 *
 * Scope note (task boundary, not a limitation of this module's contract):
 * this does NOT invoke Strands, select a specialist, or run any obligation
 * investigation. It only creates the durable `runs` row a real adapter will
 * later update (`status: 'queued' -> 'running' -> 'completed'|'failed'`,
 * `traceId`/`sessionId`/`result`) and emits the `run.queued` activity event
 * the workspace's real-time stream expects the moment a run is accepted.
 * The Strands adapter that actually executes a run against the selected
 * obligation is a separate, not-yet-built task
 * (docs/specs/strands-runtime.md "Engine loop") that will call into this
 * same `RunStore` to advance a run's status.
 *
 * Unlike `command-service.ts`, `requestInvestigation` never calls
 * `CaseStore.append()` -- no `CaseEvent` variant in `@pax/contracts`
 * represents "a run was requested" (confirmed: `CaseEventSchema`'s
 * discriminated union has no `run.*` member), so creating a run does not
 * mutate `CaseState` or advance its `eventSequence`. `RunService` still
 * enforces the same optimistic-concurrency contract as every other command
 * (docs/specs/architecture.md "Commands use optimistic concurrency"): a
 * `RequestInvestigationInput.expectedSequence` that no longer matches the
 * case's current sequence is rejected as a conflict, since the caller's view
 * of the case (and therefore of which obligation is "next") may be stale.
 *
 * Idempotency uses the same `idempotency_keys` table `CaseStore` uses
 * (`commandName: 'requestInvestigation'`), via this module's own
 * `RunStore.findIdempotent`/`recordIdempotent` rather than going through
 * `CaseStore.append` (which only ever touches `case_events`/`cases`).
 */
import {
  RequestInvestigationInputSchema,
  type RequestInvestigationInput,
  type RunReceipt,
} from '@pax/contracts';
import { selectNextObligation, type Clock, type IdGenerator } from '@pax/core';
import type { PaxDatabase } from '../db/connection.js';
import { RUN_STATUSES, type RunStatus } from '../db/schema.js';
import type { ActivityStore } from '../store/activity-store.js';
import type { CaseStore } from '../store/case-store.js';
import {
  conflict,
  formatZodIssues,
  notFound,
  ok,
  validationFailure,
  type ServiceResult,
} from './service-result.js';

export interface RunRecord {
  readonly id: string;
  readonly caseId: string;
  readonly obligationId: string;
  readonly status: RunStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly traceId?: string;
  readonly sessionId?: string;
  /** A JSON-serializable summary of the run's outcome (e.g. `{ round, favoredOptionId }` on success, `{ error }` on failure). Never the raw `ExecutionResult`/case data itself -- see `car-purchase-engine.ts`. */
  readonly result?: unknown;
}

interface IdempotentRunRecord {
  readonly caseId: string;
  readonly runId: string;
  readonly acceptedSequence: number;
}

/**
 * A lifecycle advancement for an existing run row -- `queued -> running ->
 * completed|failed` (this module's own header comment: "a real adapter will
 * later update ... `status`"). `updatedAt` is always written; `traceId`/
 * `sessionId`/`result` are written only when provided (`undefined` leaves
 * the existing column value alone), since a `running` update typically only
 * has a fresh `traceId`, while a terminal `completed`/`failed` update
 * typically only has a fresh `result`.
 */
export interface RunStatusUpdate {
  readonly status: RunStatus;
  readonly updatedAt: string;
  readonly traceId?: string;
  readonly sessionId?: string;
  readonly result?: unknown;
}

export interface RunStore {
  create(run: RunRecord): void;
  findIdempotent(commandId: string): IdempotentRunRecord | undefined;
  recordIdempotent(
    commandId: string,
    caseId: string,
    runId: string,
    acceptedSequence: number,
    createdAt: string,
  ): void;
  /** Advances `runId`'s lifecycle status. The one mutation path a real Strands adapter (`car-purchase-engine.ts`) uses to report progress. Throws if `runId` was never created. */
  updateStatus(runId: string, update: RunStatusUpdate): void;
  /** The current durable record for `runId`, or `undefined` if it was never created. Read-only introspection (tests, a future run-status route) -- never used by `requestInvestigation` itself. */
  load(runId: string): RunRecord | undefined;
}

/**
 * A pack-scoped adapter that actually executes a queued run against the
 * selected obligation (this module's own header comment: "a separate,
 * not-yet-built task ... that will call into this same `RunStore` to
 * advance a run's status" -- `car-purchase-engine.ts` is that task's real
 * implementation for the `car-purchase` pack).
 *
 * `RunService` looks one up by the case's pinned `pack.id` in `deps.engines`
 * and fires it after durably accepting the run, never awaiting it (the HTTP
 * response has already been promised promptly -- architecture.md "Command
 * and event flow": "The service returns a `CommandReceipt` promptly...").
 * `trigger` returns `void` in this interface even though a real engine's
 * implementation returns a `Promise` internally it tracks per-case
 * completion with -- callers here are never meant to await it; the engine's
 * own contract is that it never lets that promise reject (a genuine
 * failure is reflected through `RunStore.updateStatus`/`ActivityStore`
 * instead, never a swallowed rejection nothing awaits).
 */
export interface InvestigationEngine {
  /**
   * Declared `void | Promise<void>` (not bare `void`) so a real async
   * implementation (`car-purchase-engine.ts`'s `CarPurchaseEngine`, which
   * genuinely returns `Promise<void>` for tests to await deterministically)
   * satisfies this interface without `@typescript-eslint/no-misused-
   * promises` flagging a promise-returning override of a void-typed method.
   * `RunService` itself still never awaits the result either way.
   */
  trigger(params: { caseId: string; runId: string; obligationId: string }): void | Promise<void>;
}

export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>();
  private readonly idempotency = new Map<string, IdempotentRunRecord>();

  create(run: RunRecord): void {
    this.runs.set(run.id, run);
  }

  findIdempotent(commandId: string): IdempotentRunRecord | undefined {
    return this.idempotency.get(commandId);
  }

  recordIdempotent(
    commandId: string,
    caseId: string,
    runId: string,
    acceptedSequence: number,
  ): void {
    this.idempotency.set(commandId, { caseId, runId, acceptedSequence });
  }

  updateStatus(runId: string, update: RunStatusUpdate): void {
    const existing = this.runs.get(runId);
    if (existing === undefined) {
      throw new Error(`MemoryRunStore.updateStatus: run "${runId}" was not found`);
    }
    this.runs.set(runId, {
      ...existing,
      status: update.status,
      updatedAt: update.updatedAt,
      ...(update.traceId !== undefined ? { traceId: update.traceId } : {}),
      ...(update.sessionId !== undefined ? { sessionId: update.sessionId } : {}),
      ...(update.result !== undefined ? { result: update.result } : {}),
    });
  }

  load(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }
}

export class SqliteRunStore implements RunStore {
  constructor(private readonly database: PaxDatabase) {}

  create(run: RunRecord): void {
    this.database.sqlite
      .prepare(
        `INSERT INTO runs (id, case_id, obligation_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(run.id, run.caseId, run.obligationId, run.status, run.createdAt, run.updatedAt);
  }

  findIdempotent(commandId: string): IdempotentRunRecord | undefined {
    const row = this.database.sqlite
      .prepare(
        'SELECT case_id as caseId, command_name as commandName, result FROM idempotency_keys WHERE id = ?',
      )
      .get(commandId) as { caseId: string; commandName: string; result: string } | undefined;
    if (row === undefined) return undefined;
    const parsed = JSON.parse(row.result) as { runId: string; acceptedSequence: number };
    return { caseId: row.caseId, runId: parsed.runId, acceptedSequence: parsed.acceptedSequence };
  }

  recordIdempotent(
    commandId: string,
    caseId: string,
    runId: string,
    acceptedSequence: number,
    createdAt: string,
  ): void {
    this.database.sqlite
      .prepare(
        `INSERT INTO idempotency_keys (id, case_id, command_name, result, created_at)
         VALUES (?, ?, 'requestInvestigation', ?, ?)`,
      )
      .run(commandId, caseId, JSON.stringify({ runId, acceptedSequence }), createdAt);
  }

  updateStatus(runId: string, update: RunStatusUpdate): void {
    this.database.sqlite
      .prepare(
        `UPDATE runs
         SET status = ?,
             updated_at = ?,
             trace_id = COALESCE(?, trace_id),
             session_id = COALESCE(?, session_id),
             result = COALESCE(?, result)
         WHERE id = ?`,
      )
      .run(
        update.status,
        update.updatedAt,
        update.traceId ?? null,
        update.sessionId ?? null,
        update.result !== undefined ? JSON.stringify(update.result) : null,
        runId,
      );
  }

  load(runId: string): RunRecord | undefined {
    const row = this.database.sqlite
      .prepare(
        `SELECT id, case_id as caseId, obligation_id as obligationId, status,
                trace_id as traceId, session_id as sessionId, result,
                created_at as createdAt, updated_at as updatedAt
         FROM runs WHERE id = ?`,
      )
      .get(runId) as
      | {
          id: string;
          caseId: string;
          obligationId: string;
          status: string;
          traceId: string | null;
          sessionId: string | null;
          result: string | null;
          createdAt: string;
          updatedAt: string;
        }
      | undefined;
    if (row === undefined) return undefined;
    return {
      id: row.id,
      caseId: row.caseId,
      obligationId: row.obligationId,
      status: row.status as RunStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ...(row.traceId !== null ? { traceId: row.traceId } : {}),
      ...(row.sessionId !== null ? { sessionId: row.sessionId } : {}),
      ...(row.result !== null ? { result: JSON.parse(row.result) as unknown } : {}),
    };
  }
}

export interface RunServiceDeps {
  readonly caseStore: CaseStore;
  readonly activityStore: ActivityStore;
  readonly runStore: RunStore;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  /**
   * Pack id -> `InvestigationEngine`. Optional so every existing bookkeeping-
   * only test (and any pack with no real engine wired yet) keeps working
   * unchanged; `server.ts`'s real boot wiring supplies `{ 'car-purchase':
   * carPurchaseEngine }`. When the case's pinned `pack.id` has no matching
   * entry, `requestInvestigation` still accepts and durably records the run
   * exactly as before -- it simply has nothing to fire.
   */
  readonly engines?: Readonly<Record<string, InvestigationEngine>>;
}

const QUEUED_STATUS: RunStatus = RUN_STATUSES[0];

export class RunService {
  constructor(private readonly deps: RunServiceDeps) {}

  requestInvestigation(commandId: string, rawInput: unknown): ServiceResult<RunReceipt> {
    const existing = this.deps.runStore.findIdempotent(commandId);
    if (existing !== undefined) {
      const snapshot = this.deps.caseStore.load(existing.caseId);
      if (snapshot === undefined) {
        throw new Error(
          `RunService: idempotency record for commandId "${commandId}" references case "${existing.caseId}", which no longer exists`,
        );
      }
      return ok({
        commandId,
        caseId: existing.caseId,
        acceptedSequence: existing.acceptedSequence,
        runId: existing.runId,
        snapshot,
      });
    }

    const parsed = RequestInvestigationInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return validationFailure(
        'Invalid requestInvestigation input.',
        formatZodIssues(parsed.error.issues),
      );
    }
    const input: RequestInvestigationInput = parsed.data;

    const snapshot = this.deps.caseStore.load(input.caseId);
    if (snapshot === undefined) {
      return notFound(`Case "${input.caseId}" was not found.`);
    }

    if (snapshot.eventSequence !== input.expectedSequence) {
      return conflict(
        'The case has advanced since expectedSequence was read; refresh and retry.',
        input.expectedSequence,
        snapshot.eventSequence,
        snapshot,
      );
    }

    let obligationId: string;
    if (input.obligationId !== undefined) {
      const found = snapshot.obligations.find((obligation) => obligation.id === input.obligationId);
      if (found === undefined) {
        return validationFailure(
          `Obligation "${input.obligationId}" was not found on case "${input.caseId}".`,
        );
      }
      obligationId = found.id;
    } else {
      const selection = selectNextObligation(snapshot);
      if (selection.obligation === null) {
        return validationFailure(
          `No obligation is available to investigate on case "${input.caseId}": ${selection.reason}`,
        );
      }
      obligationId = selection.obligation.id;
    }

    const runId = this.deps.idGenerator.next('run');
    const now = this.deps.clock.now();

    this.deps.runStore.create({
      id: runId,
      caseId: input.caseId,
      obligationId,
      status: QUEUED_STATUS,
      createdAt: now,
      updatedAt: now,
    });
    this.deps.runStore.recordIdempotent(
      commandId,
      input.caseId,
      runId,
      snapshot.eventSequence,
      now,
    );

    this.deps.activityStore.append({
      timestamp: now,
      caseId: input.caseId,
      commandId,
      runId,
      obligationId,
      type: 'run.queued',
      phase: 'queued',
      summary: `Investigation queued for obligation "${obligationId}".`,
    });

    // Fire-and-forget: kick off the real adapter for this case's pinned
    // pack, without ever awaiting it -- the `RunReceipt` below must return
    // promptly regardless of how long the underlying Graph run takes
    // (architecture.md "Command and event flow"). Never fired on the
    // idempotent-replay branch above: that commandId already triggered
    // exactly one run, on its original call. `void`-marked deliberately
    // (`InvestigationEngine.trigger` may return a real `Promise<void>`,
    // e.g. `CarPurchaseEngine`'s) -- an implementation is contractually
    // required to never let that promise reject (see that interface's own
    // doc comment), so there is nothing here to `.catch`.
    void this.deps.engines?.[snapshot.pack.id]?.trigger({
      caseId: input.caseId,
      runId,
      obligationId,
    });

    return ok({
      commandId,
      caseId: input.caseId,
      acceptedSequence: snapshot.eventSequence,
      runId,
      snapshot,
    });
  }
}
