/**
 * `applyCaseEvent(caseState, event): CaseState` -- docs/specs/architecture.md
 * "Deterministic core". The single integration point every canonical case
 * mutation flows through; nothing else in the product may change
 * `CaseState`.
 *
 * Every `CaseEvent` (`@sift/contracts`) already carries the FULL new value of
 * whatever it changes (the complete new `criteria` array, the complete new
 * `ObligationState`, ...) rather than a delta -- computing that new value
 * (calling `addCriterion`, `deriveObligations`, `evaluateReadiness`, etc.) is
 * the job of the command-handling layer that constructs the event
 * (`apps/agent`, not built yet). This function's job is narrower and purely
 * mechanical: fold one already-decided event onto a `CaseState`, advance
 * `eventSequence`/`updatedAt`, and do nothing else. It is deliberately
 * "dumb" so that every actual business rule (evidence levels, readiness,
 * human-only approval, ...) lives in exactly one place -- the specific
 * `packages/core` module that owns it -- rather than being re-decided here.
 *
 * Signature note: architecture.md types this as `applyCaseEvent(caseState,
 * event): CaseState`, i.e. an existing case. `case.created` is the one event
 * that has no existing case to fold onto -- it constructs the very first
 * `CaseState` from nothing. This function accepts `null` for `caseState` and
 * requires the event to be `case.created` when it is; every other event type
 * requires a real `CaseState`. This is a strict superset of the documented
 * signature (every caller passing a real `CaseState` still works exactly as
 * specified) and lets a store rebuild a case purely by replaying its
 * `case_events` in order from an empty start, which is the entire point of
 * event sourcing.
 *
 * Deliberately NOT shared with `instantiateCase` (`create-case.ts`):
 * `CaseCreatedEventSchema.payload` (`@sift/contracts`) is `{ title,
 * pack: CasePackPin }` -- the pin only (id/version/hash/reasons), not the
 * full `CompiledDecisionPack`. This function can therefore only ever produce
 * a *minimal* skeleton from a `case.created` event alone: empty obligations,
 * criteria, and attribute definitions, since deriving them (via
 * `deriveObligations` and the pack's own `criteria.defaults`/`attributes`)
 * needs the full compiled pack the event does not carry. `instantiateCase`
 * has the full pack as a direct argument and derives the real seeded state
 * from it without going through this function at all -- see that file's
 * header comment for the full reasoning. The two are reconciled by whichever
 * later command-service layer persists case creation: it is expected to
 * follow `case.created` with the `obligation.updated`/`criteria.updated`
 * events needed to bring a pure event-log replay to the same state
 * `instantiateCase` produces directly, not to rely on this minimal skeleton
 * alone as if it were a complete snapshot.
 */
import type { CaseState, CaseEvent } from '@sift/contracts';
import { reviewCaseExtension } from './extensions.js';
import { ValidationFailedError } from './errors.js';

function upsertById<T extends { id: string }>(items: readonly T[], next: T): T[] {
  const index = items.findIndex((item) => item.id === next.id);
  if (index === -1) return [...items, next];
  return items.map((item, i) => (i === index ? next : item));
}

function instantiateFromCaseCreated(
  event: Extract<CaseEvent, { type: 'case.created' }>,
): CaseState {
  return {
    schemaVersion: '1.0',
    id: event.caseId,
    title: event.payload.title,
    status: 'draft',
    pack: event.payload.pack,
    attributeDefinitions: [],
    entities: [],
    criteria: [],
    obligations: [],
    caseExtensions: [],
    claims: [],
    sources: [],
    evidenceLinks: [],
    recommendation: null,
    proposal: null,
    activeFocus: null,
    selectedOptionId: null,
    selectedEvidenceId: null,
    eventSequence: event.sequence,
    createdAt: event.timestamp,
    updatedAt: event.timestamp,
  };
}

export function applyCaseEvent(caseState: CaseState | null, event: CaseEvent): CaseState {
  if (event.type === 'case.created') {
    return instantiateFromCaseCreated(event);
  }

  if (caseState === null) {
    throw new ValidationFailedError(
      `applyCaseEvent received a null caseState for event type "${event.type}"; only "case.created" may fold onto a null case.`,
      { details: { eventType: event.type, eventId: event.eventId } },
    );
  }

  if (event.caseId !== caseState.id) {
    throw new ValidationFailedError(
      `Event "${event.eventId}" targets case "${event.caseId}" but was applied to case "${caseState.id}".`,
      { details: { eventCaseId: event.caseId, caseStateId: caseState.id } },
    );
  }

  const base = { updatedAt: event.timestamp, eventSequence: event.sequence };

  switch (event.type) {
    case 'case.pack_selected':
      return { ...caseState, ...base, pack: event.payload.pack };

    case 'option.upserted':
      return {
        ...caseState,
        ...base,
        entities: upsertById(caseState.entities, event.payload.entity),
      };

    case 'criteria.updated':
      return { ...caseState, ...base, criteria: event.payload.criteria };

    case 'evidence.accepted':
      return {
        ...caseState,
        ...base,
        evidenceLinks: upsertById(caseState.evidenceLinks, event.payload.evidenceLink),
        claims:
          event.payload.claim !== undefined
            ? upsertById(caseState.claims, event.payload.claim)
            : caseState.claims,
      };

    case 'evidence.conflicted':
      // `conflictingEvidenceIds` is informational for the activity/debug
      // stream (which evidence this conflicts with); the canonical effect on
      // CaseState is the evidence link's own updated verdict/staleness,
      // already computed by the caller and carried in `evidenceLink` itself.
      return {
        ...caseState,
        ...base,
        evidenceLinks: upsertById(caseState.evidenceLinks, event.payload.evidenceLink),
      };

    case 'obligation.updated':
      return {
        ...caseState,
        ...base,
        obligations: upsertById(caseState.obligations, event.payload.obligation),
      };

    case 'extension.defined':
      return {
        ...caseState,
        ...base,
        caseExtensions: upsertById(caseState.caseExtensions, event.payload.extension),
      };

    case 'extension.confirmed': {
      const target = caseState.caseExtensions.find((ext) => ext.id === event.payload.extensionId);
      if (target === undefined) {
        throw new ValidationFailedError(
          `Case "${caseState.id}" has no case extension "${event.payload.extensionId}" to confirm.`,
          { details: { caseId: caseState.id, extensionId: event.payload.extensionId } },
        );
      }
      const result = reviewCaseExtension(target, event.payload.decision);
      if (!result.ok) {
        throw new ValidationFailedError(result.errors.join('; '), {
          details: { caseId: caseState.id, extensionId: event.payload.extensionId },
        });
      }
      return {
        ...caseState,
        ...base,
        caseExtensions: upsertById(caseState.caseExtensions, result.value),
      };
    }

    case 'recommendation.invalidated':
      if (caseState.recommendation?.id !== event.payload.recommendationId) {
        // Already stale, already gone, or already superseded -- applying an
        // invalidation for a recommendation that is no longer the current
        // one is a no-op rather than an error, since replay/at-least-once
        // delivery of an already-applied event must stay idempotent.
        return { ...caseState, ...base };
      }
      return {
        ...caseState,
        ...base,
        recommendation: { ...caseState.recommendation, status: 'stale' },
      };

    case 'recommendation.ready':
      return { ...caseState, ...base, recommendation: event.payload.recommendation };

    case 'proposal.proposed':
      return { ...caseState, ...base, proposal: event.payload.proposal };

    case 'proposal.reviewed':
      return {
        ...caseState,
        ...base,
        proposal: event.payload.proposal,
        status: event.payload.proposal.status === 'approved' ? 'decided' : caseState.status,
      };
  }
}
