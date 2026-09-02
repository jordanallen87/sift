/**
 * `RunPlanService`: the seam where a derived plan becomes durable history
 * and a visible event.
 *
 * The behaviors under test are the ones that decide whether the demo's
 * central beat is real or theatre:
 *
 * - a plan appears without anyone asking for one;
 * - a state change that genuinely affects the work produces a new version
 *   with a causal trigger, and one that does not produces nothing at all;
 * - the event a person sees says what was reused, not just that something
 *   happened.
 *
 * The last one matters most. A `plan.revised` event that reads "the plan
 * changed" would let a broken implementation pass while telling the person
 * nothing, so the summary's content is asserted, not just its presence.
 */
import { describe, expect, it } from 'vitest';
import type { CaseState } from '@sift/contracts';
import { InMemoryActivityStore } from '../store/activity-store.js';
import { MemoryRunPlanStore } from '../store/run-plan-store.js';
import { RunPlanService } from './run-plan-service.js';
import {
  candidate,
  concernObligation,
  packWithCapabilities,
  planCase,
  withDisposition,
  withTopic,
} from '../runtime/run-plan.fixture.js';
import { createSequentialIdGenerator, fixedClock } from '../fixtures/synthetic-pack.js';

const PACK = packWithCapabilities();

/**
 * A one-method case store. `RunPlanService` only ever reads a snapshot, so
 * the test gives it exactly that and nothing else -- building the same case
 * through real `CaseEvent`s would add thirty lines of setup that no
 * assertion here depends on, and would quietly let the service start
 * writing case state without a test noticing.
 */
function seededCaseStore(initial: CaseState) {
  let current = initial;
  return {
    load: (caseId: string): CaseState | undefined => (caseId === current.id ? current : undefined),
    seed: (next: CaseState) => {
      current = next;
    },
  };
}

function harness(initial: CaseState) {
  const caseStore = seededCaseStore(initial);
  const planStore = new MemoryRunPlanStore();
  const activityStore = new InMemoryActivityStore();
  const service = new RunPlanService({
    caseStore,
    planStore,
    activityStore,
    registry: { get: () => PACK },
    clock: fixedClock,
    idGenerator: createSequentialIdGenerator(),
  });
  return { caseStore, planStore, activityStore, service };
}

function keptCase(): CaseState {
  return withDisposition(
    planCase({
      entities: [candidate('rav4'), candidate('crv')],
      obligations: [concernObligation('reliability')],
    }),
    'rav4',
    'keep',
  );
}

describe('RunPlanService.ensurePlan', () => {
  it('creates and persists a first plan for a case that has none', () => {
    const { service, planStore, activityStore } = harness(keptCase());

    const plan = service.ensurePlan('case-plan');

    expect(plan?.version).toBe(1);
    expect(planStore.loadLatest('case-plan')?.version).toBe(1);
    expect(activityStore.replayFrom('case-plan', 0).map((event) => event.type)).toEqual([
      'plan.created',
    ]);
  });

  it('does not create a second plan when one already exists', () => {
    const { service, planStore } = harness(keptCase());
    service.ensurePlan('case-plan');
    service.ensurePlan('case-plan');

    expect(planStore.listVersions('case-plan')).toHaveLength(1);
  });

  it('returns undefined for a case that does not exist rather than inventing one', () => {
    const { service } = harness(keptCase());
    expect(service.ensurePlan('case-missing')).toBeUndefined();
  });
});

describe('RunPlanService.revisePlan', () => {
  it('issues no version at all when nothing about the work actually changed', () => {
    // The discipline this protects: a plan that bumps its version on every
    // command turns the revision history into noise, and the one moment
    // that genuinely matters stops standing out.
    const { service, planStore, activityStore } = harness(keptCase());
    service.ensurePlan('case-plan');

    const revised = service.revisePlan('case-plan', {
      reason: 'discovery_changed',
      trigger: 'vehicle.usage',
    });

    expect(revised).toBeUndefined();
    expect(planStore.listVersions('case-plan')).toHaveLength(1);
    expect(activityStore.replayFrom('case-plan', 0).map((event) => event.type)).toEqual([
      'plan.created',
    ]);
  });

  it('issues a new version with a causal trigger when a concern is added', () => {
    const { service, caseStore, planStore } = harness(keptCase());
    service.ensurePlan('case-plan');

    const state = caseStore.load('case-plan');
    if (state === undefined) throw new Error('fixture case vanished');
    caseStore.seed({
      ...state,
      obligations: [...state.obligations, concernObligation('dog_crate', { id: 'ob-dog' })],
    });

    const revised = service.revisePlan('case-plan', {
      reason: 'new_concern',
      trigger: 'dog_crate',
    });

    expect(revised?.version).toBe(2);
    expect(revised?.revision?.trigger).toBe('dog_crate');
    expect(planStore.listVersions('case-plan')).toHaveLength(2);
  });

  it('says what it reused in the event a person actually reads', () => {
    const { service, caseStore, activityStore } = harness(keptCase());
    service.ensurePlan('case-plan');

    const state = caseStore.load('case-plan');
    if (state === undefined) throw new Error('fixture case vanished');
    caseStore.seed({
      ...state,
      obligations: [...state.obligations, concernObligation('dog_crate', { id: 'ob-dog' })],
    });
    service.revisePlan('case-plan', { reason: 'new_concern', trigger: 'dog_crate' });

    const revisedEvent = activityStore
      .replayFrom('case-plan', 0)
      .find((event) => event.type === 'plan.revised');

    expect(revisedEvent).toBeDefined();
    expect(revisedEvent?.summary).toMatch(/reused/i);
    expect(revisedEvent?.summary).toContain('dog_crate');
    // Not just narrated: the counts are on the event, so a consumer can
    // render them without re-deriving anything.
    // Three results carried over (both enrichments and the reliability
    // check), one new check added. Only `rav4` was kept, so the new concern
    // attracts exactly one piece of deep work rather than one per option --
    // which is the whole reason triage comes before investigation.
    expect(revisedEvent?.safeDetails?.['reused']).toBe(3);
    expect(revisedEvent?.safeDetails?.['added']).toBe(1);
  });

  it('re-runs only the work whose inputs a changed answer touched', () => {
    const { service, caseStore } = harness(withTopic(keptCase(), 'vehicle.budget', 'Under 40,000'));
    const first = service.ensurePlan('case-plan');
    if (first === undefined) throw new Error('no first plan');

    // Mark the first pass finished, the way a completed run would.
    service.recordAccepted(
      'case-plan',
      first.items.map((item) => item.signature),
    );

    const state = caseStore.load('case-plan');
    if (state === undefined) throw new Error('fixture case vanished');
    caseStore.seed(withTopic(state, 'vehicle.budget', 'Under 30,000'));

    const revised = service.revisePlan('case-plan', {
      reason: 'discovery_changed',
      trigger: 'vehicle.budget',
    });

    expect(revised?.revision?.staledSignatures).toEqual(['check_concern:reliability+rav4']);
    expect(revised?.revision?.reusedSignatures).toEqual([
      'enrich_candidate:crv',
      'enrich_candidate:rav4',
    ]);
  });

  it('does nothing for a case with no plan yet, rather than back-filling one', () => {
    // Reviewing a concern on a case Sift has never planned for is not an
    // error; it just has no plan to revise.
    const { service, planStore } = harness(keptCase());

    expect(
      service.revisePlan('case-plan', { reason: 'new_concern', trigger: 'dog_crate' }),
    ).toBeUndefined();
    expect(planStore.listVersions('case-plan')).toEqual([]);
  });
});

describe('RunPlanService reads', () => {
  it('exposes the current plan and the full history', () => {
    const { service, caseStore } = harness(keptCase());
    service.ensurePlan('case-plan');
    const state = caseStore.load('case-plan');
    if (state === undefined) throw new Error('fixture case vanished');
    caseStore.seed({
      ...state,
      obligations: [...state.obligations, concernObligation('dog_crate', { id: 'ob-dog' })],
    });
    service.revisePlan('case-plan', { reason: 'new_concern', trigger: 'dog_crate' });

    expect(service.currentPlan('case-plan')?.version).toBe(2);
    expect(service.history('case-plan').map((plan) => plan.version)).toEqual([1, 2]);
  });

  it('records acceptance only for signatures the plan actually has', () => {
    const { service } = harness(keptCase());
    service.ensurePlan('case-plan');

    service.recordAccepted('case-plan', ['check_concern:nonsense+nobody']);

    expect(service.currentPlan('case-plan')?.items.every((item) => item.status === 'planned')).toBe(
      true,
    );
  });
});
