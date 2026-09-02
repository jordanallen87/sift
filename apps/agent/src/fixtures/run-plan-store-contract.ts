/**
 * Shared behavioral contract both `RunPlanStore` implementations must
 * satisfy. Same pattern (and same rationale for living under
 * `src/fixtures/`) as `activity-store-contract.ts`: an in-memory store that
 * quietly disagrees with the SQLite one is a bug that only ever shows up in
 * production, so both are held to one suite rather than two.
 */
import { describe, expect, it } from 'vitest';
import { buildRunPlan, reviseRunPlan, type RunPlan } from '../runtime/run-plan.js';
import { DuplicateRunPlanVersionError, type RunPlanStore } from '../store/run-plan-store.js';
import {
  candidate,
  concernObligation,
  packWithCapabilities,
  planCase,
  withDisposition,
} from '../runtime/run-plan.fixture.js';

const FIRST = '2026-09-02T12:00:00.000Z';
const SECOND = '2026-09-02T12:05:00.000Z';

function fixtureCase(caseId: string) {
  const state = withDisposition(
    planCase({
      entities: [candidate('rav4')],
      obligations: [concernObligation('reliability')],
    }),
    'rav4',
    'keep',
  );
  return { ...state, id: caseId };
}

function firstPlan(caseId: string): RunPlan {
  return buildRunPlan(`plan-${caseId}`, {
    caseState: fixtureCase(caseId),
    pack: packWithCapabilities(),
    now: FIRST,
  });
}

function secondPlan(caseId: string): RunPlan {
  return reviseRunPlan(
    firstPlan(caseId),
    { caseState: fixtureCase(caseId), pack: packWithCapabilities(), now: SECOND },
    { reason: 'new_concern', trigger: 'dog_crate' },
  );
}

export function runRunPlanStoreContractTests(
  createStore: () => RunPlanStore,
  /** Called before each case id is used, so a store with real foreign keys can create the case row. */
  seedCase: (caseId: string) => void = () => undefined,
): void {
  describe('RunPlanStore contract', () => {
    it('returns undefined for a case that has no plan yet', () => {
      const store = createStore();
      seedCase('case-empty');
      expect(store.loadLatest('case-empty')).toBeUndefined();
      expect(store.listVersions('case-empty')).toEqual([]);
    });

    it('round-trips a plan without losing any of it', () => {
      const store = createStore();
      seedCase('case-a');
      const plan = firstPlan('case-a');
      store.save(plan);

      expect(store.loadLatest('case-a')).toEqual(plan);
    });

    it('keeps every version and returns the newest as the current plan', () => {
      const store = createStore();
      seedCase('case-a');
      const first = firstPlan('case-a');
      const second = secondPlan('case-a');
      store.save(first);
      store.save(second);

      expect(store.loadLatest('case-a')?.version).toBe(2);
      expect(store.listVersions('case-a').map((plan) => plan.version)).toEqual([1, 2]);
    });

    it('preserves the revision summary, which is the whole point of keeping history', () => {
      const store = createStore();
      seedCase('case-a');
      store.save(firstPlan('case-a'));
      store.save(secondPlan('case-a'));

      const [, second] = store.listVersions('case-a');
      expect(second?.revision?.trigger).toBe('dog_crate');
      expect(second?.revision?.previousVersion).toBe(1);
    });

    it('refuses to rewrite a version that already exists', () => {
      const store = createStore();
      seedCase('case-a');
      const plan = firstPlan('case-a');
      store.save(plan);

      expect(() => {
        store.save(plan);
      }).toThrow(DuplicateRunPlanVersionError);
    });

    it('advances an item`s execution status without rewriting what the version intended', () => {
      const store = createStore();
      seedCase('case-a');
      const plan = firstPlan('case-a');
      store.save(plan);
      const target = plan.items[0]?.signature ?? '';

      store.updateItemStatuses(plan.planId, plan.version, { [target]: 'accepted' }, SECOND);

      const reloaded = store.loadLatest('case-a');
      const updated = reloaded?.items.find((item) => item.signature === target);
      expect(updated?.status).toBe('accepted');
      expect(updated?.updatedAt).toBe(SECOND);
      // Everything that made the item what it is survives untouched.
      expect(updated?.inputsHash).toBe(plan.items[0]?.inputsHash);
      expect(updated?.triageBasis).toEqual(plan.items[0]?.triageBasis);
      expect(reloaded?.createdAt).toBe(plan.createdAt);
    });

    it('ignores a status update for a signature the version never had', () => {
      const store = createStore();
      seedCase('case-a');
      const plan = firstPlan('case-a');
      store.save(plan);

      store.updateItemStatuses(
        plan.planId,
        plan.version,
        { 'not:a+real+item': 'accepted' },
        SECOND,
      );

      expect(store.loadLatest('case-a')?.items).toEqual(plan.items);
    });

    it('ignores a status update for a version that does not exist', () => {
      const store = createStore();
      seedCase('case-a');
      const plan = firstPlan('case-a');
      store.save(plan);

      store.updateItemStatuses(plan.planId, 99, { x: 'accepted' }, SECOND);

      expect(store.listVersions('case-a')).toHaveLength(1);
    });

    it('keeps one case`s plans out of another case`s history', () => {
      const store = createStore();
      seedCase('case-a');
      seedCase('case-b');
      store.save(firstPlan('case-a'));
      store.save(firstPlan('case-b'));

      expect(store.listVersions('case-a')).toHaveLength(1);
      expect(store.listVersions('case-a')[0]?.caseId).toBe('case-a');
    });
  });
}
