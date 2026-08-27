/**
 * Focused unit tests for `car-purchase-scenario.ts`'s pure/near-pure helper
 * functions, exercised directly against a real seeded case
 * (`buildCarPurchaseSeedEvents` + a real `MemoryCaseStore`) rather than only
 * incidentally through the full two-round scenario run
 * (`tests/scenarios/car-purchase.scenario.test.ts`, which remains the
 * authoritative end-to-end proof). This covers defensive branches (missing
 * obligation, blocking evidence, not-found failures) the happy-path full
 * run never takes.
 */
import { describe, expect, it } from 'vitest';
import type { Clock, IdGenerator } from '@pax/core';
import { createCapabilityCatalog, compileCarPurchasePack, CAR_PURCHASE_MANIFEST } from '@pax/packs';
import { buildCarPurchaseSeedEvents } from '@pax/scenarios';
import type { ExecutionResult } from '@pax/contracts';
import { InMemoryActivityStore } from '../store/activity-store.js';
import { MemoryCaseStore } from '../store/memory-case-store.js';
import {
  buildExecutionRequestFor,
  dogCrateObligationTemplate,
  ensureSourcesExist,
  extractCitedSourceIds,
  foldExecutionResult,
  loadSnapshotOrThrow,
  publisherFor,
  type CarPurchaseScenarioDeps,
} from './car-purchase-scenario.js';
import { emptyScenarioTrajectory } from '@pax/scenarios';

const FIXED_CLOCK: Clock = { now: () => '2026-08-27T00:00:00.000Z' };

function fixedIdGenerator(): IdGenerator {
  let counter = 0;
  return { next: (prefix) => `${prefix ?? 'id'}-${++counter}` };
}

function carPurchaseCatalog() {
  return createCapabilityCatalog([
    ...CAR_PURCHASE_MANIFEST.skills.map((skill) => ({
      id: skill.id,
      kind: 'skill' as const,
      version: '1.0.0',
    })),
    ...CAR_PURCHASE_MANIFEST.specialists.map((specialist) => ({
      id: specialist.id,
      kind: 'specialist' as const,
      version: '1.0.0',
    })),
    ...CAR_PURCHASE_MANIFEST.tools.map((tool) => ({
      id: tool.id,
      kind: 'tool' as const,
      version: '1.0.0',
    })),
  ]);
}

function seedRealCase(): {
  caseStore: MemoryCaseStore;
  caseId: string;
  deps: CarPurchaseScenarioDeps;
} {
  const pack = compileCarPurchasePack(carPurchaseCatalog(), FIXED_CLOCK);
  const idGenerator = fixedIdGenerator();
  const seed = buildCarPurchaseSeedEvents({ pack, clock: FIXED_CLOCK, idGenerator });
  const caseStore = new MemoryCaseStore();
  const result = caseStore.append(seed.caseState.id, seed.events, 0, {
    seedSnapshot: seed.caseState,
  });
  if (result.status !== 'applied') {
    throw new Error(`test setup: failed to seed case: ${result.status}`);
  }
  return {
    caseStore,
    caseId: seed.caseState.id,
    deps: { clock: FIXED_CLOCK, idGenerator, skillsRootDir: '/unused' },
  };
}

describe('publisherFor', () => {
  it('returns the known publisher name for the four named safety/reliability sources', () => {
    expect(publisherFor('source-national-crash-safety-consortium')).toBe(
      'National Crash Safety Consortium (fictional)',
    );
    expect(publisherFor('source-consumer-drive-index')).toBe('Consumer Drive Index (fictional)');
  });

  it('derives a publisher label from the sourceId prefix for listing/dealer-offer/ownership/household-fit sources', () => {
    expect(publisherFor('source-listing-candidate-rav4')).toContain('listing aggregator');
    expect(publisherFor('source-dealer-offer-candidate-rav4')).toContain('Dealer written offer');
    expect(publisherFor('source-ownership-calculator-candidate-rav4')).toContain(
      'ownership cost calculator',
    );
    expect(publisherFor('source-household-fit-candidate-rav4')).toContain('specification sheet');
  });

  it('falls back to a generic fixture label for an unrecognized sourceId shape', () => {
    expect(publisherFor('source-something-unexpected')).toBe('Fixture source (fictional)');
  });
});

describe('extractCitedSourceIds', () => {
  it('extracts every distinct source-...-shaped id, deduplicated and lowercased', () => {
    const ids = extractCitedSourceIds(
      'See source-listing-candidate-rav4 and source-Listing-Candidate-Rav4 plus source-dealer-offer-candidate-crv.',
    );
    expect(ids.sort()).toEqual(
      ['source-listing-candidate-rav4', 'source-dealer-offer-candidate-crv'].sort(),
    );
  });

  it('returns an empty array when no source id is cited', () => {
    expect(extractCitedSourceIds('No citations here.')).toEqual([]);
  });
});

describe('dogCrateObligationTemplate', () => {
  it('is a well-formed case_extension ObligationTemplate for the dog-crate concern', () => {
    const template = dogCrateObligationTemplate();
    expect(template.origin).toBe('case_extension');
    expect(template.acceptedUncertaintyAllowed).toBe(true);
    expect(template.preferredSpecialists).toContain('household-fit-analyst');
  });
});

describe('buildExecutionRequestFor', () => {
  it('builds a real ExecutionRequest from the current case state for a real pack obligation', () => {
    const { caseStore, caseId } = seedRealCase();
    const pack = compileCarPurchasePack(carPurchaseCatalog(), FIXED_CLOCK);
    const snapshot = loadSnapshotOrThrow(caseStore, caseId);
    const request = buildExecutionRequestFor(snapshot, pack, 'car.deal_normalization');
    expect(request.obligation.id).toBe('car.deal_normalization');
    expect(request.caseSummary.optionSummaries).toHaveLength(4);
    expect(request.limits.maxAttemptsPerObligation).toBe(request.obligation.maxAttempts);
  });

  it('throws when the obligation id does not exist on the case', () => {
    const { caseStore, caseId } = seedRealCase();
    const pack = compileCarPurchasePack(carPurchaseCatalog(), FIXED_CLOCK);
    const snapshot = loadSnapshotOrThrow(caseStore, caseId);
    expect(() => buildExecutionRequestFor(snapshot, pack, 'car.does_not_exist')).toThrow(
      /not found/,
    );
  });
});

describe('loadSnapshotOrThrow', () => {
  it('throws when the case does not exist', () => {
    const caseStore = new MemoryCaseStore();
    expect(() => loadSnapshotOrThrow(caseStore, 'missing-case')).toThrow(
      /unexpectedly disappeared/,
    );
  });
});

describe('ensureSourcesExist', () => {
  it('is a no-op when every cited source already exists', () => {
    const { caseStore, caseId, deps } = seedRealCase();
    const before = loadSnapshotOrThrow(caseStore, caseId);
    ensureSourcesExist(caseStore, caseId, before.eventSequence, [], deps.clock);
    const after = loadSnapshotOrThrow(caseStore, caseId);
    expect(after.sources).toEqual(before.sources);
  });

  it('creates a new verified Source record for a previously unseen sourceId', () => {
    const { caseStore, caseId, deps } = seedRealCase();
    const before = loadSnapshotOrThrow(caseStore, caseId);
    ensureSourcesExist(
      caseStore,
      caseId,
      before.eventSequence,
      ['source-listing-candidate-rav4', 'source-listing-candidate-rav4'],
      deps.clock,
    );
    const after = loadSnapshotOrThrow(caseStore, caseId);
    const created = after.sources.filter((source) => source.id === 'source-listing-candidate-rav4');
    expect(created).toHaveLength(1);
    expect(created[0]?.verification).toBe('verified');
  });
});

describe('foldExecutionResult', () => {
  const CLEAN_RESULT: ExecutionResult = {
    obligationId: 'car.ownership_cost',
    disposition: 'evidence_found',
    claims: [
      {
        statement: 'x',
        stance: 'supports',
        confidence: 0.9,
        sourceIds: ['source-ownership-calculator-candidate-rav4'],
      },
    ],
    evidenceResults: [
      {
        sourceId: 'source-ownership-calculator-candidate-rav4',
        level: 'E3',
        verdict: 'pass',
        summary: 'x',
      },
    ],
    limitations: [],
    suggestedStatus: 'satisfied',
  };

  it('folds a clean ExecutionResult into evidence.accepted events and advances the obligation to satisfied', () => {
    const { caseStore, caseId, deps } = seedRealCase();
    const activityStore = new InMemoryActivityStore();
    const trajectory = emptyScenarioTrajectory();

    const finalSnapshot = foldExecutionResult(
      caseStore,
      activityStore,
      caseId,
      CLEAN_RESULT,
      deps,
      trajectory,
      { attemptsToRecord: 1 },
    );

    expect(
      finalSnapshot.evidenceLinks.some((link) => link.obligationId === 'car.ownership_cost'),
    ).toBe(true);
    const obligation = finalSnapshot.obligations.find((entry) => entry.id === 'car.ownership_cost');
    expect(obligation?.status).toBe('satisfied');
    expect(trajectory.claims).toHaveLength(1);
    expect(trajectory.caseEvents.length).toBeGreaterThan(0);
  });

  it('respects obligationIdOverride, routing evidence to a different obligation than result.obligationId names', () => {
    const { caseStore, caseId, deps } = seedRealCase();
    const activityStore = new InMemoryActivityStore();
    const trajectory = emptyScenarioTrajectory();

    const finalSnapshot = foldExecutionResult(
      caseStore,
      activityStore,
      caseId,
      { ...CLEAN_RESULT, obligationId: 'car.ownership_cost' },
      deps,
      trajectory,
      { attemptsToRecord: 0, obligationIdOverride: 'car.household_fit' },
    );

    const link = finalSnapshot.evidenceLinks.find(
      (entry) => entry.sourceId === 'source-ownership-calculator-candidate-rav4',
    );
    expect(link?.obligationId).toBe('car.household_fit');
  });

  it('throws when folding against an obligation id that does not exist on the case', () => {
    const { caseStore, caseId, deps } = seedRealCase();
    const activityStore = new InMemoryActivityStore();
    const trajectory = emptyScenarioTrajectory();

    expect(() =>
      foldExecutionResult(
        caseStore,
        activityStore,
        caseId,
        { ...CLEAN_RESULT, obligationId: 'car.does_not_exist' },
        deps,
        trajectory,
        { attemptsToRecord: 1 },
      ),
    ).toThrow(/not found/);
  });
});
