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
import type { Clock, IdGenerator } from '@sift/core';
import {
  createCapabilityCatalog,
  compileCarPurchasePack,
  CAR_PURCHASE_MANIFEST,
} from '@sift/packs';
import { buildCarPurchaseSeedEvents } from '@sift/scenarios';
import type { CaseEvent, CaseState, Claim, EvidenceLink, ExecutionResult } from '@sift/contracts';
import { InMemoryActivityStore } from '../store/activity-store.js';
import { MemoryCaseStore } from '../store/memory-case-store.js';
import type { CaseStore } from '../store/case-store.js';
import type { RuntimeEvent } from './event-normalizer.js';
import type { CarPurchaseGraphResult } from './car-purchase-graph.js';
import {
  buildExecutionRequestFor,
  dogCrateObligationTemplate,
  drainGraph,
  ensureSourcesExist,
  extractCitedSourceIds,
  foldExecutionResult,
  loadSnapshotOrThrow,
  publisherFor,
  type CarPurchaseScenarioDeps,
} from './car-purchase-scenario.js';
import { emptyScenarioTrajectory } from '@sift/scenarios';

/**
 * A `CaseStore` whose `load()` always answers with a deliberately stale
 * snapshot while `append()`/`updateSelection()`/every other method delegate
 * to the real, since-advanced store -- the same real-race simulation
 * `command-service.test.ts`'s own `withStaleReadStore` documents ("another
 * request committing between this function's own read and its later
 * `append()` call"), reused here because `foldExecutionResult` performs its
 * own internal `caseStore.load()` with no externally-supplied
 * `expectedSequence` a test could otherwise control directly.
 */
function withStaleReadStore(real: MemoryCaseStore, staleSnapshot: CaseState): CaseStore {
  return {
    load: (_caseId: string) => staleSnapshot,
    append: real.append.bind(real),
    updateSelection: real.updateSelection.bind(real),
    peekIdempotent: real.peekIdempotent.bind(real),
    subscribe: real.subscribe.bind(real),
    resetDemo: real.resetDemo.bind(real),
  };
}

/** Appends one harmless real event (an unmodified re-application of the case's own first obligation) so the real store's `eventSequence` advances by exactly one past whatever a `staleSnapshot` captured earlier still reflects -- builds the genuine mismatch `withStaleReadStore`'s simulated race needs. */
function advanceStoreByOneEvent(
  caseStore: MemoryCaseStore,
  caseId: string,
  deps: CarPurchaseScenarioDeps,
): void {
  const current = loadSnapshotOrThrow(caseStore, caseId);
  const obligation = current.obligations[0];
  if (obligation === undefined) {
    throw new Error('test setup: seeded case has no obligations to replay');
  }
  const event: CaseEvent = {
    eventId: deps.idGenerator.next('event'),
    caseId,
    sequence: current.eventSequence + 1,
    timestamp: deps.clock.now(),
    type: 'obligation.updated',
    payload: { obligation },
  };
  const result = caseStore.append(caseId, [event], current.eventSequence);
  if (result.status !== 'applied') {
    throw new Error(`test setup: failed to advance the store: ${result.status}`);
  }
}

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
  it('throws when the case does not exist', () => {
    const caseStore = new MemoryCaseStore();
    const deps: CarPurchaseScenarioDeps = {
      clock: FIXED_CLOCK,
      idGenerator: fixedIdGenerator(),
      skillsRootDir: '/unused',
    };
    expect(() =>
      ensureSourcesExist(
        caseStore,
        'missing-case',
        0,
        ['source-listing-candidate-rav4'],
        deps.clock,
      ),
    ).toThrow(/not found while ensuring sources exist/);
  });

  it('throws when the real CaseStore.updateSelection() rejects a stale expectedSequence (a genuine optimistic-concurrency conflict)', () => {
    const { caseStore, caseId, deps } = seedRealCase();
    const before = loadSnapshotOrThrow(caseStore, caseId);
    expect(() =>
      ensureSourcesExist(
        caseStore,
        caseId,
        before.eventSequence + 1,
        ['source-listing-candidate-rav4'],
        deps.clock,
      ),
    ).toThrow(/failed to record sources for case/);
  });

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

  it('throws when the case has somehow disappeared before folding begins', () => {
    const activityStore = new InMemoryActivityStore();
    const trajectory = emptyScenarioTrajectory();
    const deps: CarPurchaseScenarioDeps = {
      clock: FIXED_CLOCK,
      idGenerator: fixedIdGenerator(),
      skillsRootDir: '/unused',
    };
    expect(() =>
      foldExecutionResult(
        new MemoryCaseStore(),
        activityStore,
        'missing-case',
        CLEAN_RESULT,
        deps,
        trajectory,
        { attemptsToRecord: 1 },
      ),
    ).toThrow(/not found while folding an ExecutionResult/);
  });

  const NO_EVIDENCE_RESULT: ExecutionResult = {
    obligationId: 'car.ownership_cost',
    disposition: 'no_evidence',
    claims: [],
    evidenceResults: [],
    limitations: ['Nothing found yet.'],
    suggestedStatus: 'open',
  };

  it('throws when the real CaseStore.append() rejects the evidence.accepted append due to a concurrent write (simulated via withStaleReadStore, the same real-race technique command-service.test.ts uses)', () => {
    const { caseStore, caseId, deps } = seedRealCase();
    // Pre-create CLEAN_RESULT's cited source for real (correct sequence) so
    // ensureSourcesExist's own internal check inside foldExecutionResult is
    // a no-op, and the very first append this call makes is the
    // evidence.accepted append under test.
    const before = loadSnapshotOrThrow(caseStore, caseId);
    ensureSourcesExist(
      caseStore,
      caseId,
      before.eventSequence,
      ['source-ownership-calculator-candidate-rav4'],
      deps.clock,
    );
    const staleSnapshot = loadSnapshotOrThrow(caseStore, caseId);
    advanceStoreByOneEvent(caseStore, caseId, deps);

    const activityStore = new InMemoryActivityStore();
    const trajectory = emptyScenarioTrajectory();
    expect(() =>
      foldExecutionResult(
        withStaleReadStore(caseStore, staleSnapshot),
        activityStore,
        caseId,
        CLEAN_RESULT,
        deps,
        trajectory,
        { attemptsToRecord: 0 },
      ),
    ).toThrow(/failed to append evidence for obligation/);
  });

  it('throws when the real CaseStore.append() rejects an obligation-attempt append due to a concurrent write', () => {
    const { caseStore, caseId, deps } = seedRealCase();
    const staleSnapshot = loadSnapshotOrThrow(caseStore, caseId);
    advanceStoreByOneEvent(caseStore, caseId, deps);

    const activityStore = new InMemoryActivityStore();
    const trajectory = emptyScenarioTrajectory();
    expect(() =>
      foldExecutionResult(
        withStaleReadStore(caseStore, staleSnapshot),
        activityStore,
        caseId,
        NO_EVIDENCE_RESULT,
        deps,
        trajectory,
        { attemptsToRecord: 1 },
      ),
    ).toThrow(/failed to record an attempt for/);
  });

  it("throws when the obligation is gone by the time the post-loop status check runs (attemptsToRecord: 0 skips the loop's own per-iteration existence check)", () => {
    const { caseStore, caseId, deps } = seedRealCase();
    const activityStore = new InMemoryActivityStore();
    const trajectory = emptyScenarioTrajectory();

    expect(() =>
      foldExecutionResult(
        caseStore,
        activityStore,
        caseId,
        { ...NO_EVIDENCE_RESULT, obligationId: 'car.does_not_exist' },
        deps,
        trajectory,
        { attemptsToRecord: 0 },
      ),
    ).toThrow(/not found on case/);
  });

  it('throws when the real CaseStore.append() rejects the obligation-advance append due to a concurrent write', () => {
    const { caseStore, caseId, deps } = seedRealCase();

    // Manually record satisfying evidence.accepted directly (bypassing
    // foldExecutionResult entirely) so car.ownership_cost's E2 completion
    // rule is already met by the stored evidence/claim/source while the
    // obligation's own `status` is still "open" -- 'evidence.accepted'
    // never itself touches `obligations` (reducer.ts's own case only folds
    // evidenceLinks/claims), exactly the real gap foldExecutionResult's own
    // trailing advanceObligation() call exists to close.
    const before = loadSnapshotOrThrow(caseStore, caseId);
    ensureSourcesExist(
      caseStore,
      caseId,
      before.eventSequence,
      ['source-ownership-calculator-candidate-rav4'],
      deps.clock,
    );
    const afterSource = loadSnapshotOrThrow(caseStore, caseId);
    const evidenceLink: EvidenceLink = {
      id: deps.idGenerator.next('ev'),
      obligationId: 'car.ownership_cost',
      sourceId: 'source-ownership-calculator-candidate-rav4',
      level: 'E3',
      verdict: 'pass',
      disposition: 'included',
      summary: 'Manually recorded for this test.',
      stale: false,
      createdAt: FIXED_CLOCK.now(),
      updatedAt: FIXED_CLOCK.now(),
    };
    const claim: Claim = {
      id: deps.idGenerator.next('claim'),
      obligationId: 'car.ownership_cost',
      statement: 'Manually recorded for this test.',
      stance: 'supports',
      confidence: 0.9,
      sourceIds: ['source-ownership-calculator-candidate-rav4'],
      stale: false,
      createdAt: FIXED_CLOCK.now(),
    };
    const evEvent: CaseEvent = {
      eventId: deps.idGenerator.next('event'),
      caseId,
      sequence: afterSource.eventSequence + 1,
      timestamp: FIXED_CLOCK.now(),
      type: 'evidence.accepted',
      payload: { evidenceLink, claim },
    };
    const evAppend = caseStore.append(caseId, [evEvent], afterSource.eventSequence);
    if (evAppend.status !== 'applied') {
      throw new Error(`test setup: failed to record manual evidence: ${evAppend.status}`);
    }
    const staleSnapshot = evAppend.snapshot;
    expect(staleSnapshot.obligations.find((o) => o.id === 'car.ownership_cost')?.status).toBe(
      'open',
    );
    advanceStoreByOneEvent(caseStore, caseId, deps);

    const activityStore = new InMemoryActivityStore();
    const trajectory = emptyScenarioTrajectory();
    expect(() =>
      foldExecutionResult(
        withStaleReadStore(caseStore, staleSnapshot),
        activityStore,
        caseId,
        { ...NO_EVIDENCE_RESULT, obligationId: 'car.ownership_cost' },
        deps,
        trajectory,
        { attemptsToRecord: 0 },
      ),
    ).toThrow(/failed to advance obligation/);
  });
});

describe('drainGraph', () => {
  const FAKE_GRAPH_RESULT = {
    multiAgentResult: {},
    nodeStartOrder: [],
    nodeFinishOrder: [],
    executionResults: {},
    decisionSynthesizerText: '',
    proposedRecommendation: undefined,
    goalLoopResult: undefined,
  } as unknown as CarPurchaseGraphResult;

  /** Builds a minimal, well-formed synthetic `RuntimeEvent`, the same normalized shape `event-normalizer.ts` actually emits -- overridden per test to reach a specific defensive branch `drainGraph` never sees from the real, fully-scripted Graph run (which never emits a malformed attribute shape). */
  function fakeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
    return {
      schemaVersion: '1.0',
      sequence: 0,
      timestamp: FIXED_CLOCK.now(),
      traceId: 'trace-1',
      caseId: 'case-1',
      runId: 'run-1',
      category: 'tool',
      name: 'test.event',
      phase: 'finish',
      level: 'info',
      summary: 'synthetic test event',
      attributes: {},
      redactions: [],
      ...overrides,
    };
  }

  async function* stream(
    events: readonly RuntimeEvent[],
  ): AsyncGenerator<RuntimeEvent, CarPurchaseGraphResult, undefined> {
    // No real async work: this synthetic generator only needs to satisfy
    // drainGraph's real AsyncGenerator input type, matching the same
    // synchronous-body-in-an-async-generator shape car-purchase-graph.ts's
    // own executeCarPurchaseGraph uses.
    await Promise.resolve();
    for (const event of events) yield event;
    return FAKE_GRAPH_RESULT;
  }

  it('ignores a skill.activated event whose skillId is not a string or whose obligationId is missing, but records a well-formed one', async () => {
    const trajectory = emptyScenarioTrajectory();
    const result = await drainGraph(
      stream([
        fakeEvent({
          category: 'skill',
          name: 'skill.activated',
          attributes: { skillId: 42 },
          obligationId: 'car.deal_normalization',
        }),
        fakeEvent({
          category: 'skill',
          name: 'skill.activated',
          attributes: { skillId: 'deal-normalization' },
          obligationId: undefined,
        }),
        fakeEvent({
          category: 'skill',
          name: 'skill.activated',
          attributes: { skillId: 'deal-normalization' },
          obligationId: 'car.deal_normalization',
        }),
      ]),
      trajectory,
    );
    expect(trajectory.skillActivations).toEqual([
      { skillId: 'deal-normalization', obligationId: 'car.deal_normalization' },
    ]);
    expect(result).toBe(FAKE_GRAPH_RESULT);
  });

  it('ignores a context.injected event whose fields attribute is not an array', async () => {
    const trajectory = emptyScenarioTrajectory();
    await drainGraph(
      stream([
        fakeEvent({
          category: 'context',
          name: 'context.injected',
          attributes: { fields: 'not-an-array' },
        }),
        fakeEvent({
          category: 'context',
          name: 'context.injected',
          attributes: { fields: ['title', 42, 'criteria'] },
        }),
      ]),
      trajectory,
    );
    expect(trajectory.contextInjections).toEqual([{ fields: ['title', 'criteria'] }]);
  });

  it('ignores an intervention event whose handler is not a string, and one whose action is not a recognized intervention name', async () => {
    const trajectory = emptyScenarioTrajectory();
    await drainGraph(
      stream([
        fakeEvent({
          category: 'intervention',
          name: 'intervention.guide',
          attributes: { handler: 7 },
        }),
        fakeEvent({
          category: 'intervention',
          name: 'intervention.unrecognized',
          attributes: { handler: 'ConsequenceGuard' },
        }),
        fakeEvent({
          category: 'intervention',
          name: 'intervention.guide',
          attributes: { handler: 'ConsequenceGuard' },
        }),
      ]),
      trajectory,
    );
    expect(trajectory.interventions).toEqual([{ action: 'guide', handler: 'ConsequenceGuard' }]);
  });

  it('ignores a finished tool event whose toolName attribute is not a string', async () => {
    const trajectory = emptyScenarioTrajectory();
    await drainGraph(
      stream([
        fakeEvent({ category: 'tool', phase: 'finish', attributes: { toolName: 99 } }),
        fakeEvent({
          category: 'tool',
          phase: 'finish',
          attributes: { toolName: 'fixture_lookup' },
        }),
      ]),
      trajectory,
    );
    expect(trajectory.toolCalls).toEqual([{ toolId: 'fixture_lookup' }]);
  });

  it('records a finished graph node in graphNodes without treating it as a specialistsInvoked entry when its id is not one of the six real car-purchase Graph node ids', async () => {
    const trajectory = emptyScenarioTrajectory();
    await drainGraph(
      stream([
        fakeEvent({
          category: 'graph',
          phase: 'finish',
          attributes: { nodeId: 'not-a-real-graph-node' },
        }),
        fakeEvent({
          category: 'graph',
          phase: 'finish',
          attributes: { nodeId: 'deal-analyst' },
        }),
      ]),
      trajectory,
    );
    expect(trajectory.graphNodes).toEqual(['not-a-real-graph-node', 'deal-analyst']);
    expect(trajectory.specialistsInvoked).toEqual(['deal-analyst']);
  });
});
