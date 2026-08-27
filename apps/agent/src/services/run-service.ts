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
}

interface IdempotentRunRecord {
  readonly caseId: string;
  readonly runId: string;
  readonly acceptedSequence: number;
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
}

export interface RunServiceDeps {
  readonly caseStore: CaseStore;
  readonly activityStore: ActivityStore;
  readonly runStore: RunStore;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
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

    return ok({
      commandId,
      caseId: input.caseId,
      acceptedSequence: snapshot.eventSequence,
      runId,
      snapshot,
    });
  }
}
