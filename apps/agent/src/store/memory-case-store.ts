/**
 * In-memory `CaseStore` (see `case-store.ts`'s module comment for the full
 * interface contract, idempotency, and `seedSnapshot` reasoning). Backs fast
 * `command-service.ts` unit tests that do not need a real SQLite database;
 * `sqlite-case-store.ts` is the durable implementation the real service and
 * HTTP integration tests use.
 *
 * Node's synchronous, single-threaded event loop means there is no real
 * concurrent-writer race to defend against here the way
 * `sqlite-case-store.ts` must with a transaction -- every method below runs
 * to completion before another can start. `structuredClone` on read/write
 * still guards against a caller mutating a snapshot object after receiving
 * it, keeping this store's aliasing behavior consistent with the SQLite
 * implementation (which round-trips every snapshot through JSON).
 */
import type { CaseEvent, CaseState } from '@sift/contracts';
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

interface CaseRecord {
  snapshot: CaseState;
  events: CaseEvent[];
}

interface IdempotencyRecord {
  caseId: string;
  commandName: string;
  acceptedSequence: number;
}

export class MemoryCaseStore implements CaseStore {
  private readonly cases = new Map<string, CaseRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly listeners = new Map<string, Set<CaseEventListener>>();

  load(caseId: string): CaseState | undefined {
    const record = this.cases.get(caseId);
    return record === undefined ? undefined : structuredClone(record.snapshot);
  }

  peekIdempotent(commandId: string): IdempotencyRecord | undefined {
    const existing = this.idempotency.get(commandId);
    return existing === undefined ? undefined : { ...existing };
  }

  append(
    caseId: string,
    events: readonly CaseEvent[],
    expectedSequence: number,
    options?: AppendOptions,
  ): AppendResult {
    if (options?.idempotency !== undefined) {
      const existing = this.idempotency.get(options.idempotency.commandId);
      if (existing !== undefined) {
        const snapshot = this.load(existing.caseId);
        if (snapshot === undefined) {
          throw new Error(
            `MemoryCaseStore: idempotency record for commandId "${options.idempotency.commandId}" references case "${existing.caseId}", which no longer exists`,
          );
        }
        return {
          status: 'duplicate',
          snapshot,
          acceptedSequence: existing.acceptedSequence,
          commandName: existing.commandName,
        };
      }
    }

    const record = this.cases.get(caseId);
    const currentSequence = record?.snapshot.eventSequence ?? 0;

    if (currentSequence !== expectedSequence) {
      if (record === undefined) {
        return { status: 'not_found' };
      }
      return {
        status: 'conflict',
        expectedSequence,
        actualSequence: currentSequence,
        snapshot: structuredClone(record.snapshot),
      };
    }

    const snapshot = foldEvents(record?.snapshot, events, expectedSequence, options?.seedSnapshot);
    const nextRecord: CaseRecord = {
      snapshot,
      events: [...(record?.events ?? []), ...events],
    };
    this.cases.set(caseId, nextRecord);

    if (options?.idempotency !== undefined) {
      this.idempotency.set(options.idempotency.commandId, {
        caseId,
        commandName: options.idempotency.commandName,
        acceptedSequence: snapshot.eventSequence,
      });
    }

    const listeners = this.listeners.get(caseId);
    if (listeners !== undefined) {
      for (const listener of listeners) {
        for (const event of events) {
          listener(event);
        }
      }
    }

    return { status: 'applied', snapshot: structuredClone(snapshot) };
  }

  updateSelection(
    caseId: string,
    patch: SelectionPatch,
    expectedSequence: number,
    updatedAt: string,
    idempotency?: AppendIdempotency,
  ): AppendResult {
    if (idempotency !== undefined) {
      const existing = this.idempotency.get(idempotency.commandId);
      if (existing !== undefined) {
        const snapshot = this.load(existing.caseId);
        if (snapshot === undefined) {
          throw new Error(
            `MemoryCaseStore: idempotency record for commandId "${idempotency.commandId}" references case "${existing.caseId}", which no longer exists`,
          );
        }
        return {
          status: 'duplicate',
          snapshot,
          acceptedSequence: existing.acceptedSequence,
          commandName: existing.commandName,
        };
      }
    }

    const record = this.cases.get(caseId);
    const currentSequence = record?.snapshot.eventSequence ?? 0;

    if (currentSequence !== expectedSequence) {
      if (record === undefined) {
        return { status: 'not_found' };
      }
      return {
        status: 'conflict',
        expectedSequence,
        actualSequence: currentSequence,
        snapshot: structuredClone(record.snapshot),
      };
    }
    if (record === undefined) {
      return { status: 'not_found' };
    }

    const snapshot: CaseState = {
      ...record.snapshot,
      ...('selectedOptionId' in patch ? { selectedOptionId: patch.selectedOptionId ?? null } : {}),
      ...('selectedEvidenceId' in patch
        ? { selectedEvidenceId: patch.selectedEvidenceId ?? null }
        : {}),
      ...('activeFocus' in patch ? { activeFocus: patch.activeFocus ?? null } : {}),
      ...(patch.sources !== undefined ? { sources: [...patch.sources] } : {}),
      updatedAt,
    };
    this.cases.set(caseId, { snapshot, events: record.events });

    if (idempotency !== undefined) {
      this.idempotency.set(idempotency.commandId, {
        caseId,
        commandName: idempotency.commandName,
        acceptedSequence: snapshot.eventSequence,
      });
    }

    return { status: 'applied', snapshot: structuredClone(snapshot) };
  }

  subscribe(caseId: string, fromSequence = 0): CaseSubscription {
    const record = this.cases.get(caseId);
    const replay = (record?.events ?? []).filter((event) => event.sequence > fromSequence);

    return {
      replay: structuredClone(replay),
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
    this.cases.delete(caseId);
    this.listeners.delete(caseId);
    for (const [key, value] of this.idempotency) {
      if (value.caseId === caseId) {
        this.idempotency.delete(key);
      }
    }
  }
}
