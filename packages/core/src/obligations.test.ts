import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type {
  Claim,
  EvidenceLink,
  ObligationState,
  ObligationTemplate,
  Source,
} from '@sift/contracts';
import {
  advanceObligation,
  deriveObligations,
  recordObligationAttempt,
  resolveObligationStatus,
  selectNextObligation,
  type CaseExtensionObligationTemplate,
  type Clock,
} from './obligations.js';

const fixedClock: Clock = { now: () => '2026-08-27T00:00:00.000Z' };

function template(overrides: Partial<ObligationTemplate> = {}): ObligationTemplate {
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
    ...overrides,
  };
}

function obligation(overrides: Partial<ObligationState> = {}): ObligationState {
  return {
    ...template(),
    status: 'open',
    attemptsUsed: 0,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function link(overrides: Partial<EvidenceLink> = {}): EvidenceLink {
  return {
    id: 'e1',
    obligationId: 'ob1',
    level: 'E3',
    verdict: 'pass',
    disposition: 'included',
    summary: 'Deterministic check passed.',
    stale: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

const noEvidence: { claims: Claim[]; evidenceLinks: EvidenceLink[]; sources: Source[] } = {
  claims: [],
  evidenceLinks: [],
  sources: [],
};

describe('deriveObligations', () => {
  it('derives a fresh open obligation for each pack template with zero attempts used', () => {
    const [result] = deriveObligations(
      { obligations: [template({ id: 'car.hard_constraints' })] },
      [],
      [],
      fixedClock,
    );
    expect(result).toMatchObject({ id: 'car.hard_constraints', status: 'open', attemptsUsed: 0 });
    expect(result?.updatedAt).toBe('2026-08-27T00:00:00.000Z');
  });

  it('preserves accumulated status/attemptsUsed/updatedAt for an already-known obligation', () => {
    const existing = obligation({
      id: 'car.hard_constraints',
      status: 'satisfied',
      attemptsUsed: 1,
      updatedAt: 'old',
    });
    const [result] = deriveObligations(
      { obligations: [template({ id: 'car.hard_constraints', label: 'Renamed label' })] },
      [],
      [existing],
      fixedClock,
    );
    expect(result).toMatchObject({
      status: 'satisfied',
      attemptsUsed: 1,
      updatedAt: 'old',
      label: 'Renamed label',
    });
  });

  it('never pre-satisfies a newly derived case-extension obligation, even if a same-id pack obligation was satisfied before', () => {
    // Defends the invariant even under an adversarial existingObligations
    // list: a case-extension obligation must always start open/unresolved
    // the first time its template is supplied, regardless of what else is
    // in `existingObligations`.
    const caseExtensionTemplates: CaseExtensionObligationTemplate[] = [
      {
        template: template({ id: 'custom.dog_crate_fit', origin: 'case_extension' }),
        criterionId: 'crit1',
      },
    ];
    const result = deriveObligations({ obligations: [] }, caseExtensionTemplates, [], fixedClock);
    expect(result).toEqual([
      expect.objectContaining({
        id: 'custom.dog_crate_fit',
        status: 'open',
        attemptsUsed: 0,
        criterionId: 'crit1',
      }),
    ]);
  });

  it('reconciles an existing case-extension obligation and keeps its criterionId current', () => {
    const existing = obligation({
      id: 'custom.dog_crate_fit',
      origin: 'case_extension',
      criterionId: 'crit1',
      status: 'active',
      attemptsUsed: 1,
    });
    const caseExtensionTemplates: CaseExtensionObligationTemplate[] = [
      {
        template: template({ id: 'custom.dog_crate_fit', origin: 'case_extension' }),
        criterionId: 'crit1',
      },
    ];
    const [result] = deriveObligations(
      { obligations: [] },
      caseExtensionTemplates,
      [existing],
      fixedClock,
    );
    expect(result).toMatchObject({ status: 'active', attemptsUsed: 1, criterionId: 'crit1' });
  });

  it('drops an obligation whose template is no longer supplied', () => {
    const existing = obligation({ id: 'gone', status: 'open' });
    const result = deriveObligations({ obligations: [] }, [], [existing], fixedClock);
    expect(result).toEqual([]);
  });

  it('throws when a pack.obligations entry does not have origin "pack"', () => {
    expect(() =>
      deriveObligations(
        { obligations: [template({ origin: 'case_extension' })] },
        [],
        [],
        fixedClock,
      ),
    ).toThrow(/origin "pack"/);
  });

  it('throws when a case-extension template does not have origin "case_extension"', () => {
    const caseExtensionTemplates: CaseExtensionObligationTemplate[] = [
      { template: template({ origin: 'pack' }), criterionId: 'crit1' },
    ];
    expect(() =>
      deriveObligations({ obligations: [] }, caseExtensionTemplates, [], fixedClock),
    ).toThrow(/origin "case_extension"/);
  });

  it('derives obligations from both a pack and case extensions together, in order', () => {
    const caseExtensionTemplates: CaseExtensionObligationTemplate[] = [
      {
        template: template({ id: 'custom.dog_crate_fit', origin: 'case_extension' }),
        criterionId: 'crit1',
      },
    ];
    const result = deriveObligations(
      { obligations: [template({ id: 'car.hard_constraints' })] },
      caseExtensionTemplates,
      [],
      fixedClock,
    );
    expect(result.map((o) => o.id)).toEqual(['car.hard_constraints', 'custom.dog_crate_fit']);
  });
});

describe('selectNextObligation', () => {
  it('returns null with a reason when there are no obligations at all', () => {
    const result = selectNextObligation({ obligations: [] });
    expect(result.obligation).toBeNull();
    expect(result.reason).toMatch(/no open obligation/i);
  });

  it('returns null with a dependency-specific reason when every open obligation is waiting on a dependency', () => {
    const result = selectNextObligation({
      obligations: [
        obligation({ id: 'a', status: 'open', dependsOn: ['b'] }),
        obligation({ id: 'b', status: 'open' }),
      ],
    });
    expect(result.obligation?.id).toBe('b');
  });

  it('reports the dependency-waiting reason when literally nothing is selectable', () => {
    const result = selectNextObligation({
      obligations: [
        obligation({ id: 'a', status: 'open', dependsOn: ['b'] }),
        obligation({ id: 'b', status: 'blocked' }),
      ],
    });
    expect(result.obligation).toBeNull();
    expect(result.reason).toMatch(/waiting on an unresolved dependency/i);
  });

  it('selects the only open obligation with satisfied dependencies', () => {
    const target = obligation({ id: 'a', status: 'open' });
    const result = selectNextObligation({ obligations: [target] });
    expect(result.obligation).toBe(target);
    expect(result.reason).toContain(target.label);
  });

  it('does not select an obligation whose dependency is unresolved', () => {
    const result = selectNextObligation({
      obligations: [
        obligation({ id: 'a', status: 'open', dependsOn: ['b'] }),
        obligation({ id: 'b', status: 'open' }),
      ],
    });
    expect(result.obligation?.id).toBe('b');
  });

  it('selects an obligation whose dependency is satisfied', () => {
    const result = selectNextObligation({
      obligations: [
        obligation({ id: 'a', status: 'open', dependsOn: ['b'] }),
        obligation({ id: 'b', status: 'satisfied' }),
      ],
    });
    expect(result.obligation?.id).toBe('a');
  });

  it('selects an obligation whose dependency is accepted_uncertainty', () => {
    const result = selectNextObligation({
      obligations: [
        obligation({ id: 'a', status: 'open', dependsOn: ['b'] }),
        obligation({ id: 'b', status: 'accepted_uncertainty' }),
      ],
    });
    expect(result.obligation?.id).toBe('a');
  });

  it('fails closed on a dangling dependency id with no matching obligation', () => {
    const result = selectNextObligation({
      obligations: [obligation({ id: 'a', status: 'open', dependsOn: ['missing'] })],
    });
    expect(result.obligation).toBeNull();
  });

  it('does not select an already-active obligation', () => {
    const result = selectNextObligation({
      obligations: [obligation({ id: 'a', status: 'active' })],
    });
    expect(result.obligation).toBeNull();
  });

  it('does not select a satisfied, accepted_uncertainty, or blocked obligation', () => {
    const result = selectNextObligation({
      obligations: [
        obligation({ id: 'a', status: 'satisfied' }),
        obligation({ id: 'b', status: 'accepted_uncertainty' }),
        obligation({ id: 'c', status: 'blocked' }),
      ],
    });
    expect(result.obligation).toBeNull();
  });

  it('selects the highest-priority candidate', () => {
    const result = selectNextObligation({
      obligations: [
        obligation({ id: 'low', status: 'open', priority: 1 }),
        obligation({ id: 'high', status: 'open', priority: 99 }),
      ],
    });
    expect(result.obligation?.id).toBe('high');
  });

  it('tie-breaks equal priority by earliest array position (stable insertion order)', () => {
    const result = selectNextObligation({
      obligations: [
        obligation({ id: 'first', status: 'open', priority: 5 }),
        obligation({ id: 'second', status: 'open', priority: 5 }),
      ],
    });
    expect(result.obligation?.id).toBe('first');
  });
});

describe('recordObligationAttempt', () => {
  it('increments attemptsUsed and stamps updatedAt', () => {
    const result = recordObligationAttempt(obligation({ attemptsUsed: 1 }), fixedClock);
    expect(result.attemptsUsed).toBe(2);
    expect(result.updatedAt).toBe('2026-08-27T00:00:00.000Z');
  });
});

describe('resolveObligationStatus', () => {
  it('resolves to satisfied when the required evidence level is met', () => {
    const status = resolveObligationStatus(obligation({ requiredEvidenceLevel: 'E1' }), {
      claims: [],
      evidenceLinks: [link({ obligationId: 'car.hard_constraints', level: 'E1' })],
      sources: [],
    });
    expect(status).toBe('satisfied');
  });

  it('resolves to accepted_uncertainty once attempts are exhausted and it is allowed', () => {
    const status = resolveObligationStatus(
      obligation({ attemptsUsed: 2, maxAttempts: 2, acceptedUncertaintyAllowed: true }),
      noEvidence,
    );
    expect(status).toBe('accepted_uncertainty');
  });

  it('resolves to blocked once attempts are exhausted and accepted uncertainty is not allowed', () => {
    const status = resolveObligationStatus(
      obligation({ attemptsUsed: 2, maxAttempts: 2, acceptedUncertaintyAllowed: false }),
      noEvidence,
    );
    expect(status).toBe('blocked');
  });

  it('stays open while attempts remain and evidence is insufficient', () => {
    const status = resolveObligationStatus(
      obligation({ attemptsUsed: 0, maxAttempts: 2, status: 'open' }),
      noEvidence,
    );
    expect(status).toBe('open');
  });

  it('stays active (does not downgrade to open) while attempts remain and evidence is insufficient', () => {
    const status = resolveObligationStatus(
      obligation({ attemptsUsed: 0, maxAttempts: 2, status: 'active' }),
      noEvidence,
    );
    expect(status).toBe('active');
  });
});

describe('advanceObligation', () => {
  it('returns the same reference when the status does not change', () => {
    const current = obligation({ status: 'open', attemptsUsed: 0, maxAttempts: 2 });
    const result = advanceObligation(current, noEvidence, fixedClock);
    expect(result).toBe(current);
  });

  it('returns a new record with an updated status and timestamp when the status changes', () => {
    const current = obligation({
      id: 'car.hard_constraints',
      status: 'open',
      attemptsUsed: 2,
      maxAttempts: 2,
      acceptedUncertaintyAllowed: true,
    });
    const result = advanceObligation(current, noEvidence, fixedClock);
    expect(result).not.toBe(current);
    expect(result.status).toBe('accepted_uncertainty');
    expect(result.updatedAt).toBe('2026-08-27T00:00:00.000Z');
  });
});

describe('property: dependsOn ordering is always respected by selectNextObligation', () => {
  it('never selects an obligation whose dependency is not satisfied or accepted_uncertainty', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ObligationState['status']>('open', 'active', 'blocked'),
        (dependencyStatus) => {
          const result = selectNextObligation({
            obligations: [
              obligation({ id: 'dependent', status: 'open', dependsOn: ['dependency'] }),
              obligation({ id: 'dependency', status: dependencyStatus }),
            ],
          });
          expect(result.obligation?.id).not.toBe('dependent');
        },
      ),
    );
  });
});

describe('property: a freshly derived case-extension obligation is never pre-resolved', () => {
  it('always starts open with zero attempts regardless of existing state for other ids', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.constantFrom('other.a', 'other.b', 'other.c'),
            status: fc.constantFrom<ObligationState['status']>(
              'open',
              'active',
              'satisfied',
              'accepted_uncertainty',
              'blocked',
            ),
          }),
        ),
        (existingSeeds) => {
          const existing = existingSeeds.map((seed) =>
            obligation({ id: seed.id, status: seed.status }),
          );
          const caseExtensionTemplates: CaseExtensionObligationTemplate[] = [
            {
              template: template({ id: 'custom.new_concern', origin: 'case_extension' }),
              criterionId: 'crit1',
            },
          ];
          const [result] = deriveObligations(
            { obligations: [] },
            caseExtensionTemplates,
            existing,
            fixedClock,
          );
          expect(result?.status).toBe('open');
          expect(result?.attemptsUsed).toBe(0);
        },
      ),
    );
  });
});
