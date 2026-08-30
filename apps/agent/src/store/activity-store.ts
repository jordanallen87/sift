/**
 * `ActivityStore`: the append-only `PublicActivityEvent` projection per case
 * that powers `GET /api/cases/:caseId/events` (docs/specs/architecture.md
 * "Real-time event contract" / "Persistence": "`activity_events` gives the
 * normal UI one replayable public sequence across commands and runs; it is
 * derived from committed domain or normalized runtime activity and cannot
 * mutate the case.").
 *
 * Two implementations, both in this one file (unlike `CaseStore`, the task
 * scope names a single `activity-store.ts` path): `InMemoryActivityStore`
 * for fast `command-service.ts`/`run-service.ts` unit tests, and
 * `SqliteActivityStore` for the real service and HTTP/SSE integration
 * tests. Both implement the same `ActivityStore` interface: durable
 * append/replay plus a live in-process pub/sub `subscribe()` (the same
 * single-writable-replica reasoning as `sqlite-case-store.ts`'s listener
 * registry applies here).
 *
 * `append()` assigns `sequence` itself (the next integer after the highest
 * already persisted for that case, starting at 1), unlike
 * `CaseStore.append()` where the *caller* pre-assigns `CaseEvent.sequence`.
 * `PublicActivityEvent.sequence` is a wholly separate monotonic counter from
 * `CaseEvent.sequence` (architecture.md: "Event sequence is monotonic within
 * the case" for the case stream; the activity stream has its own), and
 * unlike a `CaseEvent` (whose count and identity are dictated by exactly how
 * many domain events a command produced), `command-service.ts`/
 * `run-service.ts` derive activity events as a secondary, best-effort
 * narration and should not need to separately track "what's the next
 * activity sequence" bookkeeping themselves.
 *
 * This store deliberately does *not* implement the bounded-queue/
 * `stream.resync_required` slow-consumer behavior itself (architecture.md
 * "Slow-consumer buffering is bounded. When replay is no longer available,
 * the service emits a resync instruction and the client reloads the
 * canonical snapshot."). Delivery to a `subscribe()` listener here is a
 * plain synchronous callback with no queueing of its own — there is nothing
 * for *this* layer to genuinely back up on. The actual place backpressure
 * can occur is the SSE HTTP connection's outbound network write, which only
 * `routes/events.ts` can observe and bound; that route owns the
 * per-connection queue and resync decision, using this store purely for
 * durable append/replay/live-subscribe.
 */
import { randomUUID } from 'node:crypto';
import { PublicActivityEventSchema, type PublicActivityEvent } from '@sift/contracts';
import type { SiftDatabase } from '../db/connection.js';

export interface ActivitySubscription {
  readonly replay: readonly PublicActivityEvent[];
  unsubscribe(): void;
}

export type ActivityListener = (event: PublicActivityEvent) => void;

export interface ActivityStore {
  /** Appends one `PublicActivityEvent`, assigning its `sequence`/`eventId`/`schemaVersion` (all caller-omitted). Returns the persisted event. */
  append(
    event: Omit<PublicActivityEvent, 'sequence' | 'eventId' | 'schemaVersion'>,
  ): PublicActivityEvent;
  /** Every persisted event for `caseId` with `sequence` strictly greater than `afterSequence`, in order. */
  replayFrom(caseId: string, afterSequence: number): readonly PublicActivityEvent[];
  /** Registers `listener` for every event appended to `caseId` after this call, delivered live and synchronously. Returns `{ replay, unsubscribe }`. */
  subscribe(caseId: string, listener: ActivityListener): ActivitySubscription;
  /** The highest persisted `sequence` for `caseId`, or 0 when none exist yet. */
  latestSequence(caseId: string): number;
}

export class InMemoryActivityStore implements ActivityStore {
  private readonly byCase = new Map<string, PublicActivityEvent[]>();
  private readonly listeners = new Map<string, Set<ActivityListener>>();

  append(
    event: Omit<PublicActivityEvent, 'sequence' | 'eventId' | 'schemaVersion'>,
  ): PublicActivityEvent {
    const existing = this.byCase.get(event.caseId) ?? [];
    const sequence = (existing.at(-1)?.sequence ?? 0) + 1;
    const persisted = PublicActivityEventSchema.parse({
      ...event,
      schemaVersion: '1.0',
      eventId: randomUUID(),
      sequence,
    });
    this.byCase.set(event.caseId, [...existing, persisted]);

    const listeners = this.listeners.get(event.caseId);
    if (listeners !== undefined) {
      for (const listener of listeners) {
        listener(persisted);
      }
    }

    return persisted;
  }

  replayFrom(caseId: string, afterSequence: number): readonly PublicActivityEvent[] {
    return (this.byCase.get(caseId) ?? []).filter((event) => event.sequence > afterSequence);
  }

  latestSequence(caseId: string): number {
    return this.byCase.get(caseId)?.at(-1)?.sequence ?? 0;
  }

  subscribe(caseId: string, listener: ActivityListener): ActivitySubscription {
    const replay = this.replayFrom(caseId, 0);
    let listeners = this.listeners.get(caseId);
    if (listeners === undefined) {
      listeners = new Set();
      this.listeners.set(caseId, listeners);
    }
    listeners.add(listener);

    return {
      replay,
      unsubscribe: () => {
        listeners?.delete(listener);
      },
    };
  }
}

interface ActivityRow {
  id: string;
  caseId: string;
  sequence: number;
  type: string;
  phase: string;
  commandId: string | null;
  runId: string | null;
  obligationId: string | null;
  agentId: string | null;
  debugEventId: string | null;
  summary: string;
  createdAt: string;
  data: string | null;
}

function rowToEvent(row: ActivityRow): PublicActivityEvent {
  return PublicActivityEventSchema.parse({
    schemaVersion: '1.0',
    eventId: row.id,
    sequence: row.sequence,
    timestamp: row.createdAt,
    caseId: row.caseId,
    type: row.type,
    phase: row.phase,
    summary: row.summary,
    ...(row.commandId !== null ? { commandId: row.commandId } : {}),
    ...(row.runId !== null ? { runId: row.runId } : {}),
    ...(row.obligationId !== null ? { obligationId: row.obligationId } : {}),
    ...(row.agentId !== null ? { agentId: row.agentId } : {}),
    ...(row.debugEventId !== null ? { debugEventId: row.debugEventId } : {}),
    ...(row.data !== null ? { safeDetails: JSON.parse(row.data) as Record<string, unknown> } : {}),
  });
}

export class SqliteActivityStore implements ActivityStore {
  private readonly listeners = new Map<string, Set<ActivityListener>>();

  constructor(private readonly database: SiftDatabase) {}

  append(
    event: Omit<PublicActivityEvent, 'sequence' | 'eventId' | 'schemaVersion'>,
  ): PublicActivityEvent {
    const persisted = this.database.sqlite.transaction((): PublicActivityEvent => {
      const row = this.database.sqlite
        .prepare('SELECT MAX(sequence) as maxSequence FROM activity_events WHERE case_id = ?')
        .get(event.caseId) as { maxSequence: number | null };
      const sequence = (row.maxSequence ?? 0) + 1;
      const candidate = PublicActivityEventSchema.parse({
        ...event,
        schemaVersion: '1.0',
        eventId: randomUUID(),
        sequence,
      });
      this.insertRow(candidate);
      return candidate;
    })();

    const listeners = this.listeners.get(event.caseId);
    if (listeners !== undefined) {
      for (const listener of listeners) {
        listener(persisted);
      }
    }

    return persisted;
  }

  private insertRow(event: PublicActivityEvent): void {
    this.database.sqlite
      .prepare(
        `INSERT INTO activity_events
          (id, case_id, sequence, type, phase, command_id, run_id, obligation_id, agent_id, debug_event_id, summary, created_at, data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.eventId,
        event.caseId,
        event.sequence,
        event.type,
        event.phase,
        event.commandId ?? null,
        event.runId ?? null,
        event.obligationId ?? null,
        event.agentId ?? null,
        event.debugEventId ?? null,
        event.summary,
        event.timestamp,
        event.safeDetails !== undefined ? JSON.stringify(event.safeDetails) : null,
      );
  }

  replayFrom(caseId: string, afterSequence: number): readonly PublicActivityEvent[] {
    const rows = this.database.sqlite
      .prepare(
        `SELECT id, case_id as caseId, sequence, type, phase, command_id as commandId, run_id as runId,
                obligation_id as obligationId, agent_id as agentId, debug_event_id as debugEventId,
                summary, created_at as createdAt, data
         FROM activity_events WHERE case_id = ? AND sequence > ? ORDER BY sequence ASC`,
      )
      .all(caseId, afterSequence) as ActivityRow[];
    return rows.map(rowToEvent);
  }

  latestSequence(caseId: string): number {
    const row = this.database.sqlite
      .prepare('SELECT MAX(sequence) as maxSequence FROM activity_events WHERE case_id = ?')
      .get(caseId) as { maxSequence: number | null };
    return row.maxSequence ?? 0;
  }

  subscribe(caseId: string, listener: ActivityListener): ActivitySubscription {
    const replay = this.replayFrom(caseId, 0);
    let listeners = this.listeners.get(caseId);
    if (listeners === undefined) {
      listeners = new Set();
      this.listeners.set(caseId, listeners);
    }
    listeners.add(listener);

    return {
      replay,
      unsubscribe: () => {
        listeners?.delete(listener);
      },
    };
  }
}
