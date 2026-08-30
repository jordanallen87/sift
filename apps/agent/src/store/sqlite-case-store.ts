/**
 * SQLite-backed `CaseStore` (see `case-store.ts`'s module comment for the
 * full interface contract, idempotency, and `seedSnapshot` reasoning).
 *
 * Follows the same raw `better-sqlite3` prepared-statement style already
 * established in `src/db/schema.test.ts`/`src/routes/health.ts` rather than
 * Drizzle's query builder, since `append()`'s read-check-write sequence
 * needs precise, synchronous control inside one `sqlite.transaction()` call
 * (docs/specs/architecture.md "Persistence": "Case-event append and
 * snapshot replacement occur in one transaction").
 *
 * Live event delivery (the second half of `subscribe()`) is an in-process
 * listener registry, not a SQLite polling/trigger mechanism: architecture.md
 * "Deployment" runs "one writable Railway application replica" for the
 * hackathon, so every writer and every subscriber live in the same Node
 * process and an in-memory `Map<caseId, Set<listener>>` is sufficient and
 * far simpler than a durable pub/sub layer.
 */
import { CaseEventSchema, CaseStateSchema, type CaseEvent, type CaseState } from '@sift/contracts';
import type { SiftDatabase } from '../db/connection.js';
import {
  foldEvents,
  type AppendIdempotency,
  type AppendOptions,
  type AppendResult,
  type CaseEventListener,
  type CaseStore,
  type CaseSubscription,
  type SelectionPatch,
} from './case-store.js';

interface CaseRow {
  eventSequence: number;
  snapshot: string;
}

interface CaseEventRow {
  id: string;
  caseId: string;
  sequence: number;
  type: string;
  commandId: string | null;
  createdAt: string;
  payload: string;
}

interface IdempotencyRow {
  caseId: string;
  commandName: string;
  result: string;
}

function parseSnapshot(json: string): CaseState {
  return CaseStateSchema.parse(JSON.parse(json) as unknown);
}

function rowToCaseEvent(row: CaseEventRow): CaseEvent {
  const candidate = {
    eventId: row.id,
    caseId: row.caseId,
    sequence: row.sequence,
    timestamp: row.createdAt,
    type: row.type,
    payload: JSON.parse(row.payload) as unknown,
    ...(row.commandId !== null ? { commandId: row.commandId } : {}),
  };
  return CaseEventSchema.parse(candidate);
}

export class SqliteCaseStore implements CaseStore {
  private readonly listeners = new Map<string, Set<CaseEventListener>>();

  constructor(private readonly database: SiftDatabase) {}

  load(caseId: string): CaseState | undefined {
    const row = this.database.sqlite
      .prepare('SELECT snapshot FROM cases WHERE id = ?')
      .get(caseId) as Pick<CaseRow, 'snapshot'> | undefined;
    return row === undefined ? undefined : parseSnapshot(row.snapshot);
  }

  peekIdempotent(
    commandId: string,
  ): { caseId: string; commandName: string; acceptedSequence: number } | undefined {
    const row = this.database.sqlite
      .prepare(
        'SELECT case_id as caseId, command_name as commandName, result FROM idempotency_keys WHERE id = ?',
      )
      .get(commandId) as IdempotencyRow | undefined;
    if (row === undefined) return undefined;
    const result = JSON.parse(row.result) as { acceptedSequence: number };
    return {
      caseId: row.caseId,
      commandName: row.commandName,
      acceptedSequence: result.acceptedSequence,
    };
  }

  append(
    caseId: string,
    events: readonly CaseEvent[],
    expectedSequence: number,
    options?: AppendOptions,
  ): AppendResult {
    const run = this.database.sqlite.transaction((): AppendResult => {
      if (options?.idempotency !== undefined) {
        const existing = this.database.sqlite
          .prepare(
            'SELECT case_id as caseId, command_name as commandName, result FROM idempotency_keys WHERE id = ?',
          )
          .get(options.idempotency.commandId) as IdempotencyRow | undefined;
        if (existing !== undefined) {
          const snapshotRow = this.database.sqlite
            .prepare('SELECT snapshot FROM cases WHERE id = ?')
            .get(existing.caseId) as Pick<CaseRow, 'snapshot'> | undefined;
          if (snapshotRow === undefined) {
            throw new Error(
              `SqliteCaseStore: idempotency record for commandId "${options.idempotency.commandId}" references case "${existing.caseId}", which no longer exists`,
            );
          }
          const result = JSON.parse(existing.result) as { acceptedSequence: number };
          return {
            status: 'duplicate',
            snapshot: parseSnapshot(snapshotRow.snapshot),
            acceptedSequence: result.acceptedSequence,
            commandName: existing.commandName,
          };
        }
      }

      const caseRow = this.database.sqlite
        .prepare('SELECT event_sequence as eventSequence, snapshot FROM cases WHERE id = ?')
        .get(caseId) as CaseRow | undefined;
      const currentSequence = caseRow?.eventSequence ?? 0;
      const priorSnapshot = caseRow === undefined ? undefined : parseSnapshot(caseRow.snapshot);

      if (currentSequence !== expectedSequence) {
        if (caseRow === undefined) {
          return { status: 'not_found' };
        }
        return {
          status: 'conflict',
          expectedSequence,
          actualSequence: currentSequence,
          // `caseRow !== undefined` was just checked above, so `priorSnapshot` is defined here.
          snapshot: priorSnapshot!,
        };
      }

      const snapshot = foldEvents(priorSnapshot, events, expectedSequence, options?.seedSnapshot);

      // The `cases` row must exist before `case_events` rows referencing it
      // via `case_events.case_id`'s foreign key can be inserted -- write it
      // first (insert for a brand-new case, update otherwise).
      const snapshotJson = JSON.stringify(snapshot);
      if (caseRow === undefined) {
        this.database.sqlite
          .prepare(
            `INSERT INTO cases
              (id, title, status, pack_id, pack_version, pack_compiled_hash, pack_selected_by, event_sequence, snapshot, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            snapshot.id,
            snapshot.title,
            snapshot.status,
            snapshot.pack.id,
            snapshot.pack.version,
            snapshot.pack.compiledHash,
            snapshot.pack.selectedBy,
            snapshot.eventSequence,
            snapshotJson,
            snapshot.createdAt,
            snapshot.updatedAt,
          );
      } else {
        this.database.sqlite
          .prepare(
            `UPDATE cases
             SET title = ?, status = ?, pack_id = ?, pack_version = ?, pack_compiled_hash = ?,
                 pack_selected_by = ?, event_sequence = ?, snapshot = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            snapshot.title,
            snapshot.status,
            snapshot.pack.id,
            snapshot.pack.version,
            snapshot.pack.compiledHash,
            snapshot.pack.selectedBy,
            snapshot.eventSequence,
            snapshotJson,
            snapshot.updatedAt,
            caseId,
          );
      }

      const insertEvent = this.database.sqlite.prepare(
        `INSERT INTO case_events (id, case_id, sequence, type, command_id, created_at, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const event of events) {
        insertEvent.run(
          event.eventId,
          event.caseId,
          event.sequence,
          event.type,
          event.commandId ?? null,
          event.timestamp,
          JSON.stringify(event.payload),
        );
      }

      if (options?.idempotency !== undefined) {
        this.database.sqlite
          .prepare(
            `INSERT INTO idempotency_keys (id, case_id, command_name, result, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            options.idempotency.commandId,
            caseId,
            options.idempotency.commandName,
            JSON.stringify({ acceptedSequence: snapshot.eventSequence }),
            snapshot.updatedAt,
          );
      }

      return { status: 'applied', snapshot };
    });

    const result = run();

    if (result.status === 'applied') {
      const listeners = this.listeners.get(caseId);
      if (listeners !== undefined) {
        for (const listener of listeners) {
          for (const event of events) {
            listener(event);
          }
        }
      }
    }

    return result;
  }

  updateSelection(
    caseId: string,
    patch: SelectionPatch,
    expectedSequence: number,
    updatedAt: string,
    idempotency?: AppendIdempotency,
  ): AppendResult {
    return this.database.sqlite.transaction((): AppendResult => {
      if (idempotency !== undefined) {
        const existing = this.database.sqlite
          .prepare(
            'SELECT case_id as caseId, command_name as commandName, result FROM idempotency_keys WHERE id = ?',
          )
          .get(idempotency.commandId) as IdempotencyRow | undefined;
        if (existing !== undefined) {
          const snapshotRow = this.database.sqlite
            .prepare('SELECT snapshot FROM cases WHERE id = ?')
            .get(existing.caseId) as Pick<CaseRow, 'snapshot'> | undefined;
          if (snapshotRow === undefined) {
            throw new Error(
              `SqliteCaseStore: idempotency record for commandId "${idempotency.commandId}" references case "${existing.caseId}", which no longer exists`,
            );
          }
          const result = JSON.parse(existing.result) as { acceptedSequence: number };
          return {
            status: 'duplicate',
            snapshot: parseSnapshot(snapshotRow.snapshot),
            acceptedSequence: result.acceptedSequence,
            commandName: existing.commandName,
          };
        }
      }

      const caseRow = this.database.sqlite
        .prepare('SELECT event_sequence as eventSequence, snapshot FROM cases WHERE id = ?')
        .get(caseId) as CaseRow | undefined;
      const currentSequence = caseRow?.eventSequence ?? 0;

      if (currentSequence !== expectedSequence) {
        if (caseRow === undefined) {
          return { status: 'not_found' };
        }
        return {
          status: 'conflict',
          expectedSequence,
          actualSequence: currentSequence,
          snapshot: parseSnapshot(caseRow.snapshot),
        };
      }
      if (caseRow === undefined) {
        return { status: 'not_found' };
      }

      const prior = parseSnapshot(caseRow.snapshot);
      const snapshot: CaseState = {
        ...prior,
        ...('selectedOptionId' in patch
          ? { selectedOptionId: patch.selectedOptionId ?? null }
          : {}),
        ...('selectedEvidenceId' in patch
          ? { selectedEvidenceId: patch.selectedEvidenceId ?? null }
          : {}),
        ...('activeFocus' in patch ? { activeFocus: patch.activeFocus ?? null } : {}),
        ...('view' in patch ? { view: patch.view ?? null } : {}),
        ...(patch.sources !== undefined ? { sources: [...patch.sources] } : {}),
        updatedAt,
      };

      this.database.sqlite
        .prepare('UPDATE cases SET snapshot = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(snapshot), updatedAt, caseId);

      if (idempotency !== undefined) {
        this.database.sqlite
          .prepare(
            `INSERT INTO idempotency_keys (id, case_id, command_name, result, created_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            idempotency.commandId,
            caseId,
            idempotency.commandName,
            JSON.stringify({ acceptedSequence: snapshot.eventSequence }),
            updatedAt,
          );
      }

      return { status: 'applied', snapshot };
    })();
  }

  subscribe(caseId: string, fromSequence = 0): CaseSubscription {
    const rows = this.database.sqlite
      .prepare(
        `SELECT id, case_id as caseId, sequence, type, command_id as commandId, created_at as createdAt, payload
         FROM case_events WHERE case_id = ? AND sequence > ? ORDER BY sequence ASC`,
      )
      .all(caseId, fromSequence) as CaseEventRow[];

    return {
      replay: rows.map(rowToCaseEvent),
      onEvent: (listener: CaseEventListener) => {
        let listeners = this.listeners.get(caseId);
        if (listeners === undefined) {
          listeners = new Set();
          this.listeners.set(caseId, listeners);
        }
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  }

  resetDemo(caseId: string): void {
    this.database.sqlite.prepare('DELETE FROM cases WHERE id = ?').run(caseId);
    this.listeners.delete(caseId);
  }
}
