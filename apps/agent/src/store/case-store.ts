/**
 * `CaseStore`: the sole write/read path for canonical `CaseState`
 * (docs/specs/architecture.md "Command and event flow": "Events append and
 * the derived snapshot updates atomically in SQLite" / "Persistence":
 * "Case-event append and snapshot replacement occur in one transaction.
 * `(case_id, sequence)` and idempotency keys are unique.").
 *
 * Every canonical mutation in Sift flows through `append()`. It is the one
 * place command-service.ts hands a command handler's already-decided
 * `CaseEvent`(s) to durable storage; nothing else in `apps/agent` is allowed
 * to write to the `cases`/`case_events`/`idempotency_keys` tables directly.
 *
 * Two implementations share this exact interface (`memory-case-store.ts` for
 * fast unit tests, `sqlite-case-store.ts` for the real service and HTTP
 * integration tests) so `command-service.ts` and its tests never need to
 * know which backend they are talking to.
 *
 * --- Design notes / judgment calls ---
 *
 * 1. Idempotency lives *inside* `append()`, not as a separate store method or
 *    a command-service-side check. The task instructions ask for "calls
 *    `CaseStore.append` with idempotency-key deduplication (same `commandId`
 *    retried returns the original `CommandReceipt`, does not double-apply)"
 *    — folding the check-and-record into the same call `append()` already
 *    makes transactional lets the SQLite implementation perform the
 *    idempotency-row lookup, the event append, and the idempotency-row
 *    insert in one transaction, closing the race window a separate
 *    check-then-append-then-record sequence would leave open. `append()`
 *    does not persist a full `CommandReceipt` object under the idempotency
 *    key (that HTTP/WebMCP-shaped type is `@sift/contracts`'s concern, not
 *    this store's) — it records just enough (`commandName`, the
 *    `acceptedSequence` the original apply produced) for a duplicate call to
 *    be answered with the *current* snapshot (which is at least as fresh as,
 *    and by construction consistent with, what the original apply produced,
 *    since nothing else could mutate the fields that command's events set
 *    without a newer, distinct commandId). `command-service.ts` reconstructs
 *    the outward-facing `CommandReceipt` from the `DuplicateAppendResult`.
 *
 * 2. `AppendOptions.seedSnapshot` exists to close a real gap between
 *    `applyCaseEvent` and `instantiateCase` (see `reducer.ts`'s own header
 *    comment in `@sift/core`): `CaseEventSchema`'s `case.created` payload
 *    carries only a case's title and pack pin, never the full compiled
 *    pack, so folding a `case.created` event (plus the `criteria.updated`/
 *    `obligation.updated` events a creation command also appends) through
 *    `applyCaseEvent` alone can never populate `attributeDefinitions` --
 *    no `CaseEvent` variant in the current `@sift/contracts` taxonomy ever
 *    touches that field. `reducer.ts` explicitly defers this reconciliation
 *    to "whichever later command-service layer persists case creation".
 *    This store is that layer: when `command-service.ts`'s `startDemo`
 *    computes the true seeded state via `instantiateCase(pack, ...)`, it
 *    passes that full `CaseState` as `seedSnapshot`; `append()` folds the
 *    supplied events as normal (which still gets `pack`/`criteria`/
 *    `obligations`/`status` right) and then patches only the
 *    `attributeDefinitions` field from `seedSnapshot` onto the folded
 *    result before persisting -- the one field `applyCaseEvent` structurally
 *    cannot derive. `entities` needs no such patch: `instantiateCase` itself
 *    always seeds `entities: []`, identical to what folding an empty event
 *    batch onto `null` already produces.
 *
 * 3. `NotFoundAppendResult` vs `ConflictAppendResult`: a mismatched
 *    `expectedSequence` against a case that does not exist at all is
 *    reported as `not_found` (there is nothing to conflict against, and the
 *    HTTP layer should answer `404`, not `409`); a mismatched
 *    `expectedSequence` against a case that *does* exist is `conflict`
 *    (`409`, carrying the real latest snapshot per architecture.md).
 */
import type { CaseEvent, CaseState } from '@sift/contracts';
import { applyCaseEvent } from '@sift/core';

export interface AppendIdempotency {
  readonly commandId: string;
  readonly commandName: string;
}

export interface AppendOptions {
  /** See judgment call #2 above. Only meaningful when this append creates a brand-new case. */
  readonly seedSnapshot?: CaseState;
  /** See judgment call #1 above. */
  readonly idempotency?: AppendIdempotency;
}

export interface AppliedAppendResult {
  readonly status: 'applied';
  readonly snapshot: CaseState;
}

export interface DuplicateAppendResult {
  readonly status: 'duplicate';
  readonly snapshot: CaseState;
  readonly acceptedSequence: number;
  readonly commandName: string;
}

export interface ConflictAppendResult {
  readonly status: 'conflict';
  readonly expectedSequence: number;
  readonly actualSequence: number;
  readonly snapshot: CaseState;
}

export interface NotFoundAppendResult {
  readonly status: 'not_found';
}

export type AppendResult =
  AppliedAppendResult | DuplicateAppendResult | ConflictAppendResult | NotFoundAppendResult;

/**
 * `SelectionPatch`/`updateSelection()`: a narrow, separately-documented
 * escape hatch for `CaseState` fields no `CaseEvent` variant ever touches:
 * `selectedOptionId`/`selectedEvidenceId`/`activeFocus`, and `sources`.
 *
 * Judgment call (real, confirmed gap): unlike `attributeDefinitions` (see
 * `seedSnapshot` above, patched only once at creation),
 * `CaseEventSchema`'s discriminated union (`@sift/contracts`) has *no* event
 * variant that ever touches these fields at all -- `applyCaseEvent`'s
 * `switch` has no case that sets `selectedOptionId`, `selectedEvidenceId`,
 * `activeFocus`, or `sources` for any of its twelve event types.
 * `focusOption`/`focusEvidence` (webmcp.md `sift_focus_option`/
 * `sift_focus_evidence`) and `submitSource`'s source record itself (distinct
 * from the `evidence.accepted` event(s) a submission may *also* produce when
 * it can be linked to an active obligation -- `command-service.ts` calls
 * both `append()` and `updateSelection()` for that case) are real, specified
 * commands/effects with no event to express themselves through.
 *
 * `updateSelection()` patches the field(s) directly and persists the
 * resulting snapshot, but does **not** append any `case_events` row and
 * does **not** advance `eventSequence` -- there is no domain event to
 * record. It still supports the same idempotency-key deduplication
 * `append()` does (sharing the same `idempotency_keys` table/mechanism),
 * since `sources` accumulates (`[...prior, next]`) and is therefore *not*
 * naturally idempotent the way a plain focus-cursor overwrite is; the
 * return type is `AppendResult` unchanged (its `'duplicate'` member fits
 * unmodified: `acceptedSequence` there is simply "whatever the sequence was
 * at the time", which never changes for a selection-only patch).
 */
export interface SelectionPatch {
  readonly selectedOptionId?: string | null;
  readonly selectedEvidenceId?: string | null;
  readonly activeFocus?: CaseState['activeFocus'];
  readonly sources?: readonly CaseState['sources'][number][];
}

export type CaseEventListener = (event: CaseEvent) => void;

export interface CaseSubscription {
  /** Every persisted event with `sequence` strictly greater than `fromSequence` (0 when omitted), in order. */
  readonly replay: readonly CaseEvent[];
  /** Registers `listener` for every event appended after this call. Returns an unsubscribe function. */
  onEvent(listener: CaseEventListener): () => void;
}

/** Result of a non-mutating idempotency-key lookup. See `CaseStore.peekIdempotent`. */
export interface IdempotentRecord {
  readonly caseId: string;
  readonly commandName: string;
  readonly acceptedSequence: number;
}

export interface CaseStore {
  /** The latest durable snapshot for `caseId`, or `undefined` when no case with that id has ever been created. */
  load(caseId: string): CaseState | undefined;

  /**
   * Read-only idempotency-key lookup, with no side effect. `command-service.ts`
   * calls this as the *first* step of every command (before validating
   * `expectedSequence` against the case's *current* sequence) so a retry is
   * detected before that now-necessarily-stale check would otherwise
   * misclassify it as a `conflict` — the mutation this `commandId` already
   * produced is exactly what advanced the sequence past what the retried
   * request still carries as `expectedSequence`. `append()`/
   * `updateSelection()` still perform their own atomic check-and-record
   * inside the same transaction as the actual write; this method exists
   * only to let a caller short-circuit *before* doing any of the work that
   * would otherwise precede that call.
   */
  peekIdempotent(commandId: string): IdempotentRecord | undefined;

  /**
   * Appends `events` (already sequence-numbered starting at
   * `expectedSequence + 1`) to `caseId`, replacing its derived snapshot
   * atomically. See the module comment above for the four possible outcome
   * shapes and the `options` judgment calls.
   */
  append(
    caseId: string,
    events: readonly CaseEvent[],
    expectedSequence: number,
    options?: AppendOptions,
  ): AppendResult;

  /** See `SelectionPatch`'s module comment above for why this exists as a separate, non-event-sourced path. */
  updateSelection(
    caseId: string,
    patch: SelectionPatch,
    expectedSequence: number,
    updatedAt: string,
    idempotency?: AppendIdempotency,
  ): AppendResult;

  /** Replays persisted events after `fromSequence` and registers `listener` for subsequent appends to `caseId` (docs/specs/architecture.md "Real-time event contract"). */
  subscribe(caseId: string, fromSequence?: number): CaseSubscription;

  /** Deletes every durable record (case, events, activity, runs, idempotency keys) for `caseId`. Used by fixture/demo reset flows and test teardown. */
  resetDemo(caseId: string): void;
}

/**
 * Shared fold logic both store implementations use to derive a new snapshot:
 * repeatedly applies `applyCaseEvent` starting from `prior` (`undefined` for
 * a brand-new case). See judgment call #2 above for `seedSnapshot`'s
 * `attributeDefinitions` patch.
 *
 * Validates that `events` is non-empty and sequence-contiguous starting at
 * `expectedSequence + 1` -- a violation is a `command-service.ts` caller
 * bug, not a runtime/user condition, so this throws a plain `Error` rather
 * than a typed domain error.
 */
export function foldEvents(
  prior: CaseState | undefined,
  events: readonly CaseEvent[],
  expectedSequence: number,
  seedSnapshot?: CaseState,
): CaseState {
  if (events.length === 0) {
    throw new Error('CaseStore.append requires at least one event');
  }
  events.forEach((event, index) => {
    const expected = expectedSequence + index + 1;
    if (event.sequence !== expected) {
      throw new Error(
        `CaseStore.append received a non-contiguous event sequence: expected ${expected}, got ${event.sequence} (event index ${index}, type "${event.type}")`,
      );
    }
  });

  let folded: CaseState | null = prior ?? null;
  for (const event of events) {
    folded = applyCaseEvent(folded, event);
  }
  // Unreachable in practice: `events.length > 0` is asserted above, and
  // `applyCaseEvent` always returns a non-null `CaseState` once at least one
  // event (necessarily either `case.created` on a null prior, or any event
  // type on a non-null prior) has been folded.
  if (folded === null) {
    throw new Error('CaseStore.append: folding produced no snapshot');
  }

  if (seedSnapshot !== undefined) {
    folded = { ...folded, attributeDefinitions: seedSnapshot.attributeDefinitions };
  }

  return folded;
}
