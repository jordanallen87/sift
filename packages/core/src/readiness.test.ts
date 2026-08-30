import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { CaseExtension, CaseState, Criterion, ObligationState } from '@sift/contracts';
import { evaluateReadiness } from './readiness.js';

function caseExtension(overrides: Partial<CaseExtension> = {}): CaseExtension {
  return {
    id: 'ext1',
    caseId: 'case1',
    definition: {
      id: 'custom.dog_crate_fit',
      label: 'Two dog crates must fit',
      valueType: 'boolean',
      required: false,
      appliesTo: ['candidate'],
      evidenceExpectation: 'verification',
      comparison: 'constraint',
      sensitive: false,
      origin: 'agent_proposed',
      reason: 'Household requires cargo space for two dog crates.',
      confirmation: 'confirmed',
      proposedBy: 'household-fit-analyst',
      createdAt: '2026-08-01T00:00:00.000Z',
    },
    linkedCriterionId: 'crit1',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function criterion(overrides: Partial<Criterion> = {}): Criterion {
  return {
    id: 'crit1',
    label: 'Household budget',
    kind: 'hard_constraint',
    weight: 50,
    direction: 'lower_better',
    origin: 'pack',
    status: 'active',
    ...overrides,
  };
}

function obligation(overrides: Partial<ObligationState> = {}): ObligationState {
  return {
    id: 'car.hard_constraints',
    label: 'Hard constraints',
    question: 'Which candidates satisfy the household budget and non-negotiable needs?',
    category: 'deal',
    required: true,
    priority: 10,
    requiredEvidenceLevel: 'E1',
    maxAttempts: 2,
    acceptedUncertaintyAllowed: false,
    dependsOn: [],
    preferredSkills: [],
    preferredSpecialists: [],
    completionRule: {
      minimumEvidenceLevel: 'E1',
      minimumIndependentSources: 1,
      acceptedUncertaintyAllowed: false,
    },
    origin: 'pack',
    status: 'open',
    attemptsUsed: 0,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function caseState(overrides: Partial<CaseState> = {}): CaseState {
  return {
    schemaVersion: '1.0',
    id: 'case1',
    title: 'Choose our next car',
    status: 'draft',
    pack: {
      id: 'car-purchase',
      version: '1.0.0',
      compiledHash: 'a'.repeat(64),
      selectedBy: 'user',
      reasons: [],
    },
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
    eventSequence: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('evaluateReadiness', () => {
  it('is ready with zero obligations (vacuously true)', () => {
    const result = evaluateReadiness(caseState({ obligations: [] }));
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('is ready when every required obligation is satisfied', () => {
    const result = evaluateReadiness(
      caseState({ obligations: [obligation({ status: 'satisfied' })] }),
    );
    expect(result.ready).toBe(true);
    expect(result.satisfied).toHaveLength(1);
  });

  it('is ready when every required obligation is satisfied or accepted_uncertainty', () => {
    const result = evaluateReadiness(
      caseState({
        obligations: [
          obligation({ id: 'a', status: 'satisfied' }),
          obligation({ id: 'b', status: 'accepted_uncertainty' }),
        ],
      }),
    );
    expect(result.ready).toBe(true);
  });

  it('is not ready while a required obligation is open', () => {
    const result = evaluateReadiness(caseState({ obligations: [obligation({ status: 'open' })] }));
    expect(result.ready).toBe(false);
    expect(result.open).toHaveLength(1);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toContain(obligation().label);
  });

  it('is not ready while a required obligation is active', () => {
    const result = evaluateReadiness(
      caseState({ obligations: [obligation({ status: 'active' })] }),
    );
    expect(result.ready).toBe(false);
    expect(result.active).toHaveLength(1);
    expect(result.blockers[0]).toMatch(/still being investigated/);
  });

  it('is not ready while a required obligation is blocked', () => {
    const result = evaluateReadiness(
      caseState({
        obligations: [obligation({ status: 'blocked', attemptsUsed: 2, maxAttempts: 2 })],
      }),
    );
    expect(result.ready).toBe(false);
    expect(result.blocked).toHaveLength(1);
    expect(result.blockers[0]).toMatch(/is blocked/);
  });

  it('never lets an unresolved non-required obligation affect readiness', () => {
    const result = evaluateReadiness(
      caseState({ obligations: [obligation({ status: 'open', required: false })] }),
    );
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.open).toHaveLength(1);
  });

  it('buckets every obligation status independently of required/counted status', () => {
    const result = evaluateReadiness(
      caseState({
        obligations: [
          obligation({ id: 'a', status: 'satisfied' }),
          obligation({ id: 'b', status: 'active' }),
          obligation({ id: 'c', status: 'blocked' }),
          obligation({ id: 'd', status: 'accepted_uncertainty' }),
          obligation({ id: 'e', status: 'open' }),
        ],
      }),
    );
    expect(result.satisfied.map((o) => o.id)).toEqual(['a']);
    expect(result.active.map((o) => o.id)).toEqual(['b']);
    expect(result.blocked.map((o) => o.id)).toEqual(['c']);
    expect(result.acceptedUncertainty.map((o) => o.id)).toEqual(['d']);
    expect(result.open.map((o) => o.id)).toEqual(['e']);
  });

  it('never counts an unconfirmed agent-proposed case-extension obligation toward readiness (excluded criterion)', () => {
    const result = evaluateReadiness(
      caseState({
        criteria: [criterion({ id: 'crit1', origin: 'agent_proposed', status: 'excluded' })],
        obligations: [
          obligation({
            id: 'custom.dog_crate_fit',
            origin: 'case_extension',
            criterionId: 'crit1',
            status: 'open',
          }),
        ],
      }),
    );
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    // still visible in its status bucket, just not gating readiness.
    expect(result.open).toHaveLength(1);
  });

  it('counts a confirmed case-extension obligation (active criterion + confirmed extension) toward readiness once required', () => {
    const result = evaluateReadiness(
      caseState({
        criteria: [criterion({ id: 'crit1', origin: 'agent_proposed', status: 'active' })],
        caseExtensions: [caseExtension({ linkedCriterionId: 'crit1' })],
        obligations: [
          obligation({
            id: 'custom.dog_crate_fit',
            origin: 'case_extension',
            criterionId: 'crit1',
            status: 'open',
          }),
        ],
      }),
    );
    expect(result.ready).toBe(false);
    expect(result.blockers).toHaveLength(1);
  });

  it('never counts a case-extension obligation toward readiness while its extension is still pending confirmation, even with an active criterion', () => {
    const result = evaluateReadiness(
      caseState({
        criteria: [criterion({ id: 'crit1', origin: 'agent_proposed', status: 'active' })],
        caseExtensions: [
          caseExtension({
            linkedCriterionId: 'crit1',
            definition: { ...caseExtension().definition, confirmation: 'pending' },
          }),
        ],
        obligations: [
          obligation({
            id: 'custom.dog_crate_fit',
            origin: 'case_extension',
            criterionId: 'crit1',
            status: 'open',
          }),
        ],
      }),
    );
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.open).toHaveLength(1);
  });

  it('fails closed when a case-extension obligation has an active criterion but no matching CaseExtension record at all', () => {
    const result = evaluateReadiness(
      caseState({
        criteria: [criterion({ id: 'crit1', origin: 'agent_proposed', status: 'active' })],
        caseExtensions: [],
        obligations: [
          obligation({
            id: 'custom.dog_crate_fit',
            origin: 'case_extension',
            criterionId: 'crit1',
            status: 'open',
          }),
        ],
      }),
    );
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('treats a case-extension obligation whose linked criterion cannot be found as not counted (fails closed on visibility, not on readiness)', () => {
    const result = evaluateReadiness(
      caseState({
        criteria: [],
        obligations: [
          obligation({
            id: 'custom.orphan',
            origin: 'case_extension',
            criterionId: 'missing-criterion',
            status: 'open',
          }),
        ],
      }),
    );
    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it('always counts a pack-origin obligation toward readiness regardless of criteria', () => {
    const result = evaluateReadiness(
      caseState({
        criteria: [],
        obligations: [obligation({ id: 'car.hard_constraints', origin: 'pack', status: 'open' })],
      }),
    );
    expect(result.ready).toBe(false);
  });
});

describe('property: adding a user concern cannot increase readiness before its evidence question is resolved', () => {
  it('adding a new required, unresolved obligation to a ready case can only make it not-ready', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ObligationState['status']>('open', 'active', 'blocked'),
        (newStatus) => {
          const readyBefore = evaluateReadiness(
            caseState({ obligations: [obligation({ id: 'existing', status: 'satisfied' })] }),
          );
          expect(readyBefore.ready).toBe(true);

          const readyAfter = evaluateReadiness(
            caseState({
              obligations: [
                obligation({ id: 'existing', status: 'satisfied' }),
                obligation({
                  id: 'new-concern',
                  status: newStatus,
                  origin: 'case_extension',
                  criterionId: 'crit1',
                }),
              ],
              criteria: [criterion({ id: 'crit1', origin: 'agent_proposed', status: 'active' })],
              caseExtensions: [caseExtension({ linkedCriterionId: 'crit1' })],
            }),
          );
          expect(readyAfter.ready).toBe(false);
        },
      ),
    );
  });

  it('adding a new unconfirmed (excluded-criterion) obligation never flips a ready case to not-ready', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ObligationState['status']>('open', 'active', 'blocked'),
        (newStatus) => {
          const readyAfter = evaluateReadiness(
            caseState({
              obligations: [
                obligation({ id: 'existing', status: 'satisfied' }),
                obligation({
                  id: 'new-concern',
                  status: newStatus,
                  origin: 'case_extension',
                  criterionId: 'crit1',
                }),
              ],
              criteria: [criterion({ id: 'crit1', origin: 'agent_proposed', status: 'excluded' })],
            }),
          );
          expect(readyAfter.ready).toBe(true);
        },
      ),
    );
  });
});

describe('property: ready is always exactly blockers.length === 0', () => {
  it('holds for arbitrary obligation sets', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            status: fc.constantFrom<ObligationState['status']>(
              'open',
              'active',
              'satisfied',
              'accepted_uncertainty',
              'blocked',
            ),
            required: fc.boolean(),
          }),
          { maxLength: 8 },
        ),
        (specs) => {
          const obligations = specs.map((spec) =>
            obligation({ id: spec.id, status: spec.status, required: spec.required }),
          );
          const result = evaluateReadiness(caseState({ obligations }));
          expect(result.ready).toBe(result.blockers.length === 0);
        },
      ),
    );
  });
});
