import { describe, expect, it } from 'vitest';
import type { CaseEvent } from '@sift/contracts';
import { MemoryCaseStore } from './memory-case-store.js';
import { runCaseStoreContractTests } from '../fixtures/case-store-contract.js';

runCaseStoreContractTests(() => new MemoryCaseStore());

const now = '2026-08-27T00:00:00.000Z';

function caseCreatedEvent(caseId: string): CaseEvent {
  return {
    eventId: `${caseId}-ev-1`,
    caseId,
    sequence: 1,
    timestamp: now,
    type: 'case.created',
    payload: {
      title: 'Test case',
      pack: {
        id: 'car-purchase',
        version: '1.0.0',
        compiledHash: '0'.repeat(64),
        selectedBy: 'user',
        reasons: ['Selected from the launcher'],
      },
    },
  };
}

describe('MemoryCaseStore defensive invariants', () => {
  // `resetDemo()` always deletes a case's idempotency records alongside its
  // case/events data (see that method's own implementation), so this state
  // -- an idempotency record whose target case row no longer exists -- can
  // never arise through this store's real public surface. Reaching into the
  // private `cases` map directly is the only way to construct the exact
  // corrupted state these defensive guards exist to catch, matching
  // `sqlite-case-store.test.ts`'s own "pre-inserting a colliding row
  // directly" technique for its analogous invariant.
  it('append() and updateSelection() both throw if an idempotency record references a case that no longer exists', () => {
    const store = new MemoryCaseStore();
    store.append('case-1', [caseCreatedEvent('case-1')], 0, {
      idempotency: { commandId: 'cmd-1', commandName: 'selectPack' },
    });

    (store as unknown as { cases: Map<string, unknown> }).cases.delete('case-1');

    expect(() =>
      store.append('case-2', [caseCreatedEvent('case-2')], 0, {
        idempotency: { commandId: 'cmd-1', commandName: 'selectPack' },
      }),
    ).toThrow(
      /idempotency record for commandId "cmd-1" references case "case-1", which no longer exists/,
    );

    // The failed append() above must not have mutated the idempotency
    // record, so the same corrupted state still drives updateSelection()'s
    // parallel guard.
    expect(() =>
      store.updateSelection('case-2', { selectedOptionId: 'x' }, 0, now, {
        commandId: 'cmd-1',
        commandName: 'selectPack',
      }),
    ).toThrow(
      /idempotency record for commandId "cmd-1" references case "case-1", which no longer exists/,
    );
  });
});
