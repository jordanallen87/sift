/**
 * Shared behavioral contract both `CaseStore` implementations must satisfy.
 * `memory-case-store.test.ts` and `sqlite-case-store.test.ts` each call
 * `runCaseStoreContractTests` with their own store factory so the two
 * backends are proven to have identical semantics from one test source,
 * instead of duplicating ~20 assertions twice. Lives under `src/fixtures/`
 * (matching the root `vitest.config.ts` coverage `exclude: ['**\/fixtures/**']`
 * pattern, the same reason `packages/packs/src/fixtures/manifest.ts` lives
 * there) both so Vitest's `src/**\/*.test.ts` include pattern does not try to
 * run this file directly (it has no top-level `describe` of its own that
 * executes without a factory) and so its own type-narrowing `if (...)
 * throw` guards (`if (result.status !== 'applied') throw ...`, present
 * throughout — necessary for TypeScript to narrow `AppendResult`'s union
 * after each assertion, and never actually taken in a passing run) do not
 * count against real coverage the way they correctly don't for any other
 * `*.test.ts` file.
 */
import { describe, expect, it } from 'vitest';
import type { CaseEvent, CaseState } from '@sift/contracts';
import type { CaseStore } from '../store/case-store.js';

const now = '2026-08-27T00:00:00.000Z';

function caseCreatedEvent(caseId: string, sequence = 1): CaseEvent {
  return {
    eventId: `${caseId}-ev-${sequence}`,
    caseId,
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
        reasons: ['Selected from the launcher'],
      },
    },
  };
}

function criteriaUpdatedEvent(caseId: string, sequence: number): CaseEvent {
  return {
    eventId: `${caseId}-ev-${sequence}`,
    caseId,
    sequence,
    timestamp: now,
    type: 'criteria.updated',
    payload: {
      criteria: [
        {
          id: 'price',
          label: 'Price',
          kind: 'hard_constraint',
          weight: 100,
          direction: 'lower_better',
          origin: 'pack',
          status: 'active',
        },
      ],
    },
  };
}

function recommendationReadyEvent(caseId: string, sequence: number): CaseEvent {
  return {
    eventId: `${caseId}-ev-${sequence}`,
    caseId,
    sequence,
    timestamp: now,
    type: 'recommendation.ready',
    payload: {
      recommendation: {
        id: 'rec-1',
        status: 'ready',
        favoredOptionId: 'option-1',
        rationale: 'Best fit given current evidence.',
        facts: [],
        hypotheses: [],
        confidence: 0.8,
        limitations: [],
        sourceIds: [],
        resolvedObligationIds: [],
        acceptedUncertaintyObligationIds: [],
        generatedAt: now,
      },
    },
  };
}

function seedSnapshotFor(caseId: string): CaseState {
  return {
    schemaVersion: '1.0',
    id: caseId,
    title: 'Test case',
    status: 'draft',
    pack: {
      id: 'car-purchase',
      version: '1.0.0',
      compiledHash: '0'.repeat(64),
      selectedBy: 'user',
      reasons: ['Selected from the launcher'],
    },
    attributeDefinitions: [
      {
        id: 'car.price',
        label: 'Price',
        valueType: 'money',
        required: true,
        appliesTo: ['car'],
        evidenceExpectation: 'source',
        comparison: 'lower_better',
        sensitive: false,
      },
    ],
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
    eventSequence: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function runCaseStoreContractTests(createStore: () => CaseStore): void {
  describe('CaseStore contract', () => {
    it('load() returns undefined for a case that was never created', () => {
      const store = createStore();
      expect(store.load('missing')).toBeUndefined();
    });

    it('append() creates a new case from expectedSequence 0 and returns the folded snapshot', () => {
      const store = createStore();
      const result = store.append('case-1', [caseCreatedEvent('case-1')], 0);

      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('expected applied');
      expect(result.snapshot.id).toBe('case-1');
      expect(result.snapshot.eventSequence).toBe(1);
      expect(result.snapshot.title).toBe('Test case');
      expect(store.load('case-1')).toEqual(result.snapshot);
    });

    it('patches attributeDefinitions from seedSnapshot on creation (applyCaseEvent cannot derive it)', () => {
      const store = createStore();
      const seed = seedSnapshotFor('case-1');
      const result = store.append('case-1', [caseCreatedEvent('case-1')], 0, {
        seedSnapshot: seed,
      });

      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('expected applied');
      expect(result.snapshot.attributeDefinitions).toEqual(seed.attributeDefinitions);
      // Fields applyCaseEvent *can* derive are not blindly overwritten by the seed.
      expect(result.snapshot.eventSequence).toBe(1);
    });

    it('append() folds multiple events in one call in order', () => {
      const store = createStore();
      const result = store.append(
        'case-1',
        [caseCreatedEvent('case-1', 1), criteriaUpdatedEvent('case-1', 2)],
        0,
      );

      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('expected applied');
      expect(result.snapshot.eventSequence).toBe(2);
      expect(result.snapshot.criteria).toHaveLength(1);
      expect(result.snapshot.criteria[0]?.id).toBe('price');
    });

    it('append() onto an existing case advances the sequence and preserves prior fields', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);
      const result = store.append('case-1', [criteriaUpdatedEvent('case-1', 2)], 1);

      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('expected applied');
      expect(result.snapshot.eventSequence).toBe(2);
      expect(result.snapshot.title).toBe('Test case');
      expect(result.snapshot.criteria).toHaveLength(1);
    });

    it('append() returns not_found for a stale expectedSequence against a case that does not exist', () => {
      const store = createStore();
      const result = store.append('missing', [criteriaUpdatedEvent('missing', 5)], 4);
      expect(result.status).toBe('not_found');
    });

    it('append() returns conflict (with the real latest snapshot) for a stale expectedSequence against an existing case', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);
      const result = store.append('case-1', [criteriaUpdatedEvent('case-1', 5)], 4);

      expect(result.status).toBe('conflict');
      if (result.status !== 'conflict') throw new Error('expected conflict');
      expect(result.expectedSequence).toBe(4);
      expect(result.actualSequence).toBe(1);
      expect(result.snapshot.eventSequence).toBe(1);
      // The conflicting mutation was never applied.
      expect(store.load('case-1')?.eventSequence).toBe(1);
    });

    it('append() with an already-used idempotency commandId returns duplicate without double-applying', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0, {
        idempotency: { commandId: 'cmd-1', commandName: 'selectPack' },
      });
      const before = store.load('case-1');

      const result = store.append(
        'case-1',
        // A deliberately different (and would-be-invalid, since it targets
        // sequence 2 while the case is already at 1) event batch, to prove
        // this is never folded -- the duplicate short-circuit must win.
        [criteriaUpdatedEvent('case-1', 2)],
        1,
        { idempotency: { commandId: 'cmd-1', commandName: 'selectPack' } },
      );

      expect(result.status).toBe('duplicate');
      if (result.status !== 'duplicate') throw new Error('expected duplicate');
      expect(result.acceptedSequence).toBe(1);
      expect(result.commandName).toBe('selectPack');
      expect(store.load('case-1')).toEqual(before);
    });

    it('peekIdempotent() returns undefined for an unused commandId, and the recorded fields for a used one, without any side effect', () => {
      const store = createStore();
      expect(store.peekIdempotent('cmd-1')).toBeUndefined();

      store.append('case-1', [caseCreatedEvent('case-1')], 0, {
        idempotency: { commandId: 'cmd-1', commandName: 'startDemo' },
      });

      const peeked = store.peekIdempotent('cmd-1');
      expect(peeked).toEqual({ caseId: 'case-1', commandName: 'startDemo', acceptedSequence: 1 });
      // Read-only: peeking again must not change anything.
      expect(store.peekIdempotent('cmd-1')).toEqual(peeked);
    });

    it('subscribe() replays persisted events after fromSequence', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1', 1), criteriaUpdatedEvent('case-1', 2)], 0);

      const subscription = store.subscribe('case-1', 1);
      expect(subscription.replay).toHaveLength(1);
      expect(subscription.replay[0]?.sequence).toBe(2);
    });

    it('subscribe() delivers events appended after registration to a live listener', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);

      const received: CaseEvent[] = [];
      const subscription = store.subscribe('case-1', 1);
      const unsubscribe = subscription.onEvent((event) => received.push(event));

      store.append('case-1', [criteriaUpdatedEvent('case-1', 2)], 1);
      expect(received).toHaveLength(1);
      expect(received[0]?.sequence).toBe(2);

      unsubscribe();
      store.append('case-1', [criteriaUpdatedEvent('case-1', 3)], 2);
      expect(received).toHaveLength(1);
    });

    it('updateSelection() patches selectedOptionId without advancing eventSequence or appending an event', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);

      const result = store.updateSelection(
        'case-1',
        { selectedOptionId: 'option-1' },
        1,
        '2026-08-27T01:00:00.000Z',
      );

      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('expected applied');
      expect(result.snapshot.selectedOptionId).toBe('option-1');
      expect(result.snapshot.eventSequence).toBe(1);
      expect(result.snapshot.updatedAt).toBe('2026-08-27T01:00:00.000Z');
      expect(store.subscribe('case-1', 0).replay).toHaveLength(1); // still just case.created
    });

    it('updateSelection() returns not_found for a case that does not exist', () => {
      const store = createStore();
      expect(store.updateSelection('missing', { selectedOptionId: 'x' }, 0, now).status).toBe(
        'not_found',
      );
    });

    it('updateSelection() returns conflict for a stale expectedSequence against an existing case', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);
      const result = store.updateSelection('case-1', { selectedOptionId: 'x' }, 0, now);
      expect(result.status).toBe('conflict');
    });

    it('updateSelection() can append to sources (full replace) since it accumulates rather than overwrites', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);
      const source = {
        id: 'source-1',
        url: 'https://example.com/review',
        title: 'Review',
        retrievedAt: now,
        origin: 'user_submitted' as const,
        verification: 'unverified' as const,
        createdAt: now,
      };

      const result = store.updateSelection('case-1', { sources: [source] }, 1, now);
      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('expected applied');
      expect(result.snapshot.sources).toEqual([source]);
    });

    it('updateSelection() with an already-used idempotency commandId returns duplicate without double-applying', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);

      const first = store.updateSelection('case-1', { selectedOptionId: 'option-1' }, 1, now, {
        commandId: 'cmd-focus-1',
        commandName: 'focusOption',
      });
      expect(first.status).toBe('applied');

      const second = store.updateSelection('case-1', { selectedOptionId: 'option-2' }, 1, now, {
        commandId: 'cmd-focus-1',
        commandName: 'focusOption',
      });
      expect(second.status).toBe('duplicate');
      // The second call's different target must never have been applied.
      expect(store.load('case-1')?.selectedOptionId).toBe('option-1');
    });

    it('resetDemo() removes the case so load() and append(expectedSequence: 0) both behave as if it never existed', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);

      store.resetDemo('case-1');

      expect(store.load('case-1')).toBeUndefined();
      const result = store.append('case-1', [caseCreatedEvent('case-1')], 0);
      expect(result.status).toBe('applied');
    });

    it("resetDemo() only removes idempotency records scoped to the reset case, leaving another case's record intact", () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0, {
        idempotency: { commandId: 'cmd-1', commandName: 'startDemo' },
      });
      store.append('case-2', [caseCreatedEvent('case-2')], 0, {
        idempotency: { commandId: 'cmd-2', commandName: 'startDemo' },
      });

      store.resetDemo('case-1');

      expect(store.peekIdempotent('cmd-1')).toBeUndefined();
      expect(store.peekIdempotent('cmd-2')).toEqual({
        caseId: 'case-2',
        commandName: 'startDemo',
        acceptedSequence: 1,
      });
    });

    it('updateSelection() returns not_found (via the sequence-mismatch branch, not just the record check) when a non-zero expectedSequence is given for a case that does not exist', () => {
      const store = createStore();
      const result = store.updateSelection('missing', { selectedOptionId: 'x' }, 5, now);
      expect(result.status).toBe('not_found');
    });

    it('updateSelection() sets selectedOptionId/selectedEvidenceId to an explicit null, and can set selectedEvidenceId/activeFocus to real values', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);

      const withOptionAndEvidence = store.updateSelection(
        'case-1',
        { selectedOptionId: 'option-1', selectedEvidenceId: 'evidence-1' },
        1,
        now,
      );
      expect(withOptionAndEvidence.status).toBe('applied');
      if (withOptionAndEvidence.status !== 'applied') throw new Error('expected applied');
      expect(withOptionAndEvidence.snapshot.selectedOptionId).toBe('option-1');
      expect(withOptionAndEvidence.snapshot.selectedEvidenceId).toBe('evidence-1');

      const withActiveFocus = store.updateSelection(
        'case-1',
        {
          activeFocus: {
            obligationId: 'obligation-1',
            reason: 'Investigating price evidence.',
            since: now,
          },
        },
        1,
        now,
      );
      expect(withActiveFocus.status).toBe('applied');
      if (withActiveFocus.status !== 'applied') throw new Error('expected applied');
      expect(withActiveFocus.snapshot.activeFocus).toEqual({
        obligationId: 'obligation-1',
        reason: 'Investigating price evidence.',
        since: now,
      });

      const clearedToNull = store.updateSelection(
        'case-1',
        { selectedOptionId: null, selectedEvidenceId: null, activeFocus: null },
        1,
        now,
      );
      expect(clearedToNull.status).toBe('applied');
      if (clearedToNull.status !== 'applied') throw new Error('expected applied');
      expect(clearedToNull.snapshot.selectedOptionId).toBeNull();
      expect(clearedToNull.snapshot.selectedEvidenceId).toBeNull();
      expect(clearedToNull.snapshot.activeFocus).toBeNull();
    });

    it('updateSelection() patches view and it is readable back without advancing eventSequence or appending a case_events row', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);

      const view = {
        mode: 'compare' as const,
        compare: { optionIds: ['option-1', 'option-2'] },
        visibleAttributeIds: ['car.price'],
      };
      const result = store.updateSelection('case-1', { view }, 1, now);

      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('expected applied');
      expect(result.snapshot.view).toEqual(view);
      expect(result.snapshot.eventSequence).toBe(1); // unchanged: still just case.created's sequence
      expect(store.load('case-1')?.view).toEqual(view);
      expect(store.subscribe('case-1', 0).replay).toHaveLength(1); // still just case.created -- no view event appended
    });

    it('updateSelection() patching view does not clear or alter an existing recommendation (presentation cannot invalidate a decision -- ADR 0005)', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);
      const withRecommendation = store.append('case-1', [recommendationReadyEvent('case-1', 2)], 1);
      expect(withRecommendation.status).toBe('applied');
      if (withRecommendation.status !== 'applied') throw new Error('expected applied');
      const recommendationBefore = withRecommendation.snapshot.recommendation;
      expect(recommendationBefore).not.toBeNull();

      const result = store.updateSelection(
        'case-1',
        { view: { mode: 'board', board: { columns: [] } } },
        2,
        now,
      );

      expect(result.status).toBe('applied');
      if (result.status !== 'applied') throw new Error('expected applied');
      expect(result.snapshot.recommendation).toEqual(recommendationBefore);
      expect(result.snapshot.eventSequence).toBe(2); // still the recommendation.ready sequence
    });

    it('updateSelection() sets view to an explicit null (clearing it)', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);
      const withView = store.updateSelection('case-1', { view: { mode: 'list' } }, 1, now);
      expect(withView.status).toBe('applied');
      if (withView.status !== 'applied') throw new Error('expected applied');
      expect(withView.snapshot.view).toEqual({ mode: 'list' });

      const cleared = store.updateSelection('case-1', { view: null }, 1, now);
      expect(cleared.status).toBe('applied');
      if (cleared.status !== 'applied') throw new Error('expected applied');
      expect(cleared.snapshot.view).toBeNull();
    });

    it('subscribe() returns an empty replay (not a crash) for a case that was never created', () => {
      const store = createStore();
      const subscription = store.subscribe('missing');
      expect(subscription.replay).toEqual([]);
    });

    it('subscribe().onEvent() registers a second listener for a case that already has one, and delivers a subsequent append to both', () => {
      const store = createStore();
      store.append('case-1', [caseCreatedEvent('case-1')], 0);

      const firstReceived: CaseEvent[] = [];
      const secondReceived: CaseEvent[] = [];
      const subscription = store.subscribe('case-1', 1);
      subscription.onEvent((event) => firstReceived.push(event));
      subscription.onEvent((event) => secondReceived.push(event));

      store.append('case-1', [criteriaUpdatedEvent('case-1', 2)], 1);

      expect(firstReceived).toHaveLength(1);
      expect(secondReceived).toHaveLength(1);
      expect(firstReceived[0]?.sequence).toBe(2);
      expect(secondReceived[0]?.sequence).toBe(2);
    });
  });
}
