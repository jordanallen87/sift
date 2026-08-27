/**
 * Direct unit tests for `foldEvents`, the shared fold logic both
 * `CaseStore` implementations delegate to (see `fixtures/case-store-contract.ts`
 * for the full behavioral contract exercised through each real store).
 * Covers the two defensive-programming checks that guard against a
 * `command-service.ts` caller bug, which neither store implementation's own
 * `append()` can trigger on its own (both always call `foldEvents` with a
 * non-empty, contiguous event batch).
 */
import { describe, expect, it } from 'vitest';
import type { CaseEvent } from '@pax/contracts';
import { foldEvents } from './case-store.js';

const now = '2026-08-27T00:00:00.000Z';

function caseCreatedEvent(sequence: number): CaseEvent {
  return {
    eventId: `ev-${sequence}`,
    caseId: 'case-1',
    sequence,
    timestamp: now,
    type: 'case.created',
    payload: {
      title: 'Test case',
      pack: {
        id: 'car-purchase',
        version: '1.0.0',
        compiledHash: '0'.repeat(64),
        selectedBy: 'user',
        reasons: [],
      },
    },
  };
}

describe('foldEvents', () => {
  it('throws when given an empty events array', () => {
    expect(() => foldEvents(undefined, [], 0)).toThrow(/at least one event/);
  });

  it('throws when the first event sequence does not equal expectedSequence + 1', () => {
    expect(() => foldEvents(undefined, [caseCreatedEvent(5)], 0)).toThrow(/non-contiguous/);
  });

  it('throws when a later event in the batch is non-contiguous', () => {
    const secondEvent: CaseEvent = {
      eventId: 'ev-2',
      caseId: 'case-1',
      sequence: 9,
      timestamp: now,
      type: 'criteria.updated',
      payload: { criteria: [] },
    };
    expect(() => foldEvents(undefined, [caseCreatedEvent(1), secondEvent], 0)).toThrow(
      /non-contiguous/,
    );
  });
});
