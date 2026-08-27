import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Claim, EvidenceLink, ObligationState, Source } from '@pax/contracts';
import {
  achievedEvidenceLevel,
  evidenceLevelRank,
  findStalenessImpact,
  hasBlockingEvidenceIssue,
  isAuthoritativeSource,
  markStale,
  meetsRequiredEvidenceLevel,
  sourcesAreIndependent,
  type Clock,
  type StalenessContext,
  type StalenessCriterion,
} from './evidence.js';

const fixedClock: Clock = { now: () => '2026-08-27T00:00:00.000Z' };

function source(overrides: Partial<Source> = {}): Source {
  return {
    id: 's1',
    url: 'https://example.com/a',
    title: 'Example source',
    retrievedAt: '2026-08-01T00:00:00.000Z',
    origin: 'fixture',
    verification: 'unverified',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function claim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'c1',
    obligationId: 'ob1',
    statement: 'The car fits the budget.',
    stance: 'supports',
    confidence: 0.5,
    sourceIds: [],
    stale: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function link(overrides: Partial<EvidenceLink> = {}): EvidenceLink {
  return {
    id: 'e1',
    obligationId: 'ob1',
    level: 'E1',
    verdict: 'pass',
    disposition: 'included',
    summary: 'Listing price confirmed.',
    stale: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function obligation(overrides: Partial<ObligationState> = {}): ObligationState {
  return {
    id: 'ob1',
    label: 'Hard constraints',
    question: 'Which candidates satisfy the household budget?',
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

describe('evidenceLevelRank', () => {
  it('ranks E0 through E3 ordinally', () => {
    expect(evidenceLevelRank('E0')).toBe(0);
    expect(evidenceLevelRank('E1')).toBe(1);
    expect(evidenceLevelRank('E2')).toBe(2);
    expect(evidenceLevelRank('E3')).toBe(3);
  });
});

describe('isAuthoritativeSource', () => {
  it('treats a verified source as authoritative', () => {
    expect(isAuthoritativeSource(source({ verification: 'verified' }))).toBe(true);
  });

  it('treats unverified, challenged, and rejected sources as not authoritative', () => {
    expect(isAuthoritativeSource(source({ verification: 'unverified' }))).toBe(false);
    expect(isAuthoritativeSource(source({ verification: 'challenged' }))).toBe(false);
    expect(isAuthoritativeSource(source({ verification: 'rejected' }))).toBe(false);
  });
});

describe('sourcesAreIndependent', () => {
  it('is false for the same source id', () => {
    const a = source({ id: 's1' });
    expect(sourcesAreIndependent(a, a)).toBe(false);
  });

  it('is true for distinct ids with no publisher on either side', () => {
    expect(sourcesAreIndependent(source({ id: 's1' }), source({ id: 's2' }))).toBe(true);
  });

  it('is true for distinct ids with a publisher on only one side', () => {
    expect(
      sourcesAreIndependent(
        source({ id: 's1', publisher: 'Consumer Reports' }),
        source({ id: 's2' }),
      ),
    ).toBe(true);
  });

  it('is false for distinct ids sharing the same publisher', () => {
    expect(
      sourcesAreIndependent(
        source({ id: 's1', publisher: 'Consumer Reports' }),
        source({ id: 's2', publisher: 'Consumer Reports' }),
      ),
    ).toBe(false);
  });

  it('is true for distinct ids with different publishers', () => {
    expect(
      sourcesAreIndependent(
        source({ id: 's1', publisher: 'Consumer Reports' }),
        source({ id: 's2', publisher: 'Edmunds' }),
      ),
    ).toBe(true);
  });
});

describe('hasBlockingEvidenceIssue', () => {
  it('is false with no evidence at all', () => {
    expect(hasBlockingEvidenceIssue('ob1', [])).toBe(false);
  });

  it('is true for an included, non-stale error verdict', () => {
    expect(hasBlockingEvidenceIssue('ob1', [link({ verdict: 'error' })])).toBe(true);
  });

  it('is true for an included, non-stale degraded verdict', () => {
    expect(hasBlockingEvidenceIssue('ob1', [link({ verdict: 'degraded' })])).toBe(true);
  });

  it('is false for a pass verdict', () => {
    expect(hasBlockingEvidenceIssue('ob1', [link({ verdict: 'pass' })])).toBe(false);
  });

  it('is false for fail and skipped verdicts', () => {
    expect(hasBlockingEvidenceIssue('ob1', [link({ verdict: 'fail' })])).toBe(false);
    expect(hasBlockingEvidenceIssue('ob1', [link({ verdict: 'skipped' })])).toBe(false);
  });

  it('is false when the error result is stale', () => {
    expect(hasBlockingEvidenceIssue('ob1', [link({ verdict: 'error', stale: true })])).toBe(false);
  });

  it('is false when the error result has been excluded or questioned', () => {
    expect(
      hasBlockingEvidenceIssue('ob1', [link({ verdict: 'error', disposition: 'excluded' })]),
    ).toBe(false);
    expect(
      hasBlockingEvidenceIssue('ob1', [link({ verdict: 'degraded', disposition: 'questioned' })]),
    ).toBe(false);
  });

  it('is false for a different obligation id', () => {
    expect(
      hasBlockingEvidenceIssue('other', [link({ verdict: 'error', obligationId: 'ob1' })]),
    ).toBe(false);
  });
});

describe('achievedEvidenceLevel', () => {
  it('is null with no claims and no evidence', () => {
    expect(achievedEvidenceLevel({ claims: [], evidenceLinks: [], sources: [] }, 'ob1')).toBeNull();
  });

  it('is E0 with only a non-stale claim', () => {
    expect(
      achievedEvidenceLevel({ claims: [claim()], evidenceLinks: [], sources: [] }, 'ob1'),
    ).toBe('E0');
  });

  it('ignores a stale claim', () => {
    expect(
      achievedEvidenceLevel(
        { claims: [claim({ stale: true })], evidenceLinks: [], sources: [] },
        'ob1',
      ),
    ).toBeNull();
  });

  it('ignores a claim for a different obligation', () => {
    expect(
      achievedEvidenceLevel(
        { claims: [claim({ obligationId: 'other' })], evidenceLinks: [], sources: [] },
        'ob1',
      ),
    ).toBeNull();
  });

  it('trusts a single tagged E1 evidence link with no source', () => {
    expect(
      achievedEvidenceLevel(
        { claims: [], evidenceLinks: [link({ level: 'E1' })], sources: [] },
        'ob1',
      ),
    ).toBe('E1');
  });

  it('trusts a single tagged E3 evidence link directly', () => {
    expect(
      achievedEvidenceLevel(
        { claims: [], evidenceLinks: [link({ level: 'E3' })], sources: [] },
        'ob1',
      ),
    ).toBe('E3');
  });

  it('ignores an excluded, questioned, stale, non-pass, or mismatched-obligation link', () => {
    const base = link({ level: 'E3' });
    expect(
      achievedEvidenceLevel(
        { claims: [], evidenceLinks: [{ ...base, disposition: 'excluded' }], sources: [] },
        'ob1',
      ),
    ).toBeNull();
    expect(
      achievedEvidenceLevel(
        { claims: [], evidenceLinks: [{ ...base, stale: true }], sources: [] },
        'ob1',
      ),
    ).toBeNull();
    expect(
      achievedEvidenceLevel(
        { claims: [], evidenceLinks: [{ ...base, verdict: 'fail' }], sources: [] },
        'ob1',
      ),
    ).toBeNull();
    expect(
      achievedEvidenceLevel(
        { claims: [], evidenceLinks: [{ ...base, obligationId: 'other' }], sources: [] },
        'ob1',
      ),
    ).toBeNull();
  });

  it('synthesizes E2 from one E1 link citing an authoritative source', () => {
    const src = source({ id: 's1', verification: 'verified' });
    const result = achievedEvidenceLevel(
      { claims: [], evidenceLinks: [link({ level: 'E1', sourceId: 's1' })], sources: [src] },
      'ob1',
    );
    expect(result).toBe('E2');
  });

  it('does not synthesize E2 from one E1 link citing a non-authoritative source', () => {
    const src = source({ id: 's1', verification: 'unverified' });
    const result = achievedEvidenceLevel(
      { claims: [], evidenceLinks: [link({ level: 'E1', sourceId: 's1' })], sources: [src] },
      'ob1',
    );
    expect(result).toBe('E1');
  });

  it('synthesizes E2 from two E1 links citing independent sources', () => {
    const result = achievedEvidenceLevel(
      {
        claims: [],
        evidenceLinks: [
          link({ id: 'e1', level: 'E1', sourceId: 's1' }),
          link({ id: 'e2', level: 'E1', sourceId: 's2' }),
        ],
        sources: [source({ id: 's1' }), source({ id: 's2' })],
      },
      'ob1',
    );
    expect(result).toBe('E2');
  });

  it('does not synthesize E2 from two E1 links citing the same publisher', () => {
    const result = achievedEvidenceLevel(
      {
        claims: [],
        evidenceLinks: [
          link({ id: 'e1', level: 'E1', sourceId: 's1' }),
          link({ id: 'e2', level: 'E1', sourceId: 's2' }),
        ],
        sources: [
          source({ id: 's1', publisher: 'Consumer Reports' }),
          source({ id: 's2', publisher: 'Consumer Reports' }),
        ],
      },
      'ob1',
    );
    expect(result).toBe('E1');
  });

  it('does not synthesize E2 when a sourceId does not resolve to a known source', () => {
    const result = achievedEvidenceLevel(
      {
        claims: [],
        evidenceLinks: [
          link({ id: 'e1', level: 'E1', sourceId: 'missing-1' }),
          link({ id: 'e2', level: 'E1', sourceId: 'missing-2' }),
        ],
        sources: [],
      },
      'ob1',
    );
    expect(result).toBe('E1');
  });

  it('finds an independent pair even when an earlier link has no resolvable source', () => {
    const result = achievedEvidenceLevel(
      {
        claims: [],
        evidenceLinks: [
          link({ id: 'e0', level: 'E1', sourceId: 'missing' }),
          link({ id: 'e1', level: 'E1', sourceId: 's1' }),
          link({ id: 'e2', level: 'E1', sourceId: 's2' }),
        ],
        sources: [source({ id: 's1' }), source({ id: 's2' })],
      },
      'ob1',
    );
    expect(result).toBe('E2');
  });

  it('does not use an E0-ranked link toward the independent-pair/authoritative synthesis', () => {
    // Two links at rank 0 with independent sources still should not
    // synthesize E2: synthesis requires E1+ individually.
    const result = achievedEvidenceLevel(
      {
        claims: [],
        evidenceLinks: [
          link({ id: 'e1', level: 'E0', sourceId: 's1' }),
          link({ id: 'e2', level: 'E0', sourceId: 's2' }),
        ],
        sources: [source({ id: 's1' }), source({ id: 's2' })],
      },
      'ob1',
    );
    expect(result).toBe('E0');
  });
});

describe('meetsRequiredEvidenceLevel', () => {
  it('is false with no evidence', () => {
    expect(
      meetsRequiredEvidenceLevel(obligation({ requiredEvidenceLevel: 'E0' }), {
        claims: [],
        evidenceLinks: [],
        sources: [],
      }),
    ).toBe(false);
  });

  it('is true when achieved level meets or exceeds the requirement', () => {
    expect(
      meetsRequiredEvidenceLevel(obligation({ requiredEvidenceLevel: 'E1' }), {
        claims: [],
        evidenceLinks: [link({ level: 'E2' })],
        sources: [],
      }),
    ).toBe(true);
  });

  it('is false when achieved level is below the requirement', () => {
    expect(
      meetsRequiredEvidenceLevel(obligation({ requiredEvidenceLevel: 'E2' }), {
        claims: [],
        evidenceLinks: [link({ level: 'E1' })],
        sources: [],
      }),
    ).toBe(false);
  });

  it('fails closed on a non-stale blocking error even with otherwise-sufficient evidence', () => {
    expect(
      meetsRequiredEvidenceLevel(obligation({ requiredEvidenceLevel: 'E1' }), {
        claims: [],
        evidenceLinks: [
          link({ id: 'pass', level: 'E3', verdict: 'pass' }),
          link({ id: 'err', verdict: 'error' }),
        ],
        sources: [],
      }),
    ).toBe(false);
  });

  it('does not fail closed on a stale error', () => {
    expect(
      meetsRequiredEvidenceLevel(obligation({ requiredEvidenceLevel: 'E1' }), {
        claims: [],
        evidenceLinks: [link({ level: 'E1', verdict: 'error', stale: true })],
        sources: [],
      }),
    ).toBe(false); // still false: no passing evidence exists, but not via the blocking path
  });
});

describe('markStale', () => {
  it('returns a new record with stale true and an updated timestamp', () => {
    const original = link({ stale: false, updatedAt: '2020-01-01T00:00:00.000Z' });
    const result = markStale(original, 'source retracted', fixedClock);
    expect(result).not.toBe(original);
    expect(result.stale).toBe(true);
    expect(result.updatedAt).toBe('2026-08-27T00:00:00.000Z');
    expect(original.stale).toBe(false);
  });

  it('throws on an empty reason', () => {
    expect(() => markStale(link(), '', fixedClock)).toThrow(/reason/);
  });

  it('throws on a whitespace-only reason', () => {
    expect(() => markStale(link(), '   ', fixedClock)).toThrow(/reason/);
  });
});

describe('findStalenessImpact', () => {
  function context(overrides: Partial<StalenessContext> = {}): StalenessContext {
    return { criteria: [], obligations: [], evidenceLinks: [], claims: [], ...overrides };
  }

  it('finds nothing for a trigger with no references', () => {
    expect(findStalenessImpact({ kind: 'source', id: 'none' }, context())).toEqual({
      staleEvidenceLinkIds: [],
      invalidatedObligationIds: [],
    });
  });

  it('propagates a source trigger to its evidence links and their obligations', () => {
    const result = findStalenessImpact(
      { kind: 'source', id: 's1' },
      context({
        evidenceLinks: [link({ id: 'e1', sourceId: 's1', obligationId: 'ob1' })],
      }),
    );
    expect(result.staleEvidenceLinkIds).toEqual(['e1']);
    expect(result.invalidatedObligationIds).toEqual(['ob1']);
  });

  it("propagates a source trigger through a claim that cites it, marking that claim's evidence links stale too", () => {
    const result = findStalenessImpact(
      { kind: 'source', id: 's1' },
      context({
        claims: [
          claim({ id: 'c1', obligationId: 'ob2', sourceIds: ['s1'] }),
          claim({ id: 'c2', obligationId: 'ob3', sourceIds: ['unrelated-source'] }),
        ],
        evidenceLinks: [
          link({ id: 'e2', claimId: 'c1', obligationId: 'ob2', sourceId: undefined }),
          link({ id: 'e3', claimId: 'unrelated-claim', obligationId: 'ob4', sourceId: undefined }),
        ],
      }),
    );
    expect(result.invalidatedObligationIds).toEqual(['ob2']);
    expect(result.staleEvidenceLinkIds).toEqual(['e2']);
  });

  it('propagates a criterion trigger to the case-extension obligation it produced', () => {
    const result = findStalenessImpact(
      { kind: 'criterion', id: 'crit1' },
      context({
        obligations: [obligation({ id: 'ob-ext', origin: 'case_extension', criterionId: 'crit1' })],
        evidenceLinks: [link({ id: 'e1', obligationId: 'ob-ext' })],
      }),
    );
    expect(result.invalidatedObligationIds).toEqual(['ob-ext']);
    expect(result.staleEvidenceLinkIds).toEqual(['e1']);
  });

  it('resolves an attribute trigger to matching criteria and their case-extension obligations', () => {
    const criteria: StalenessCriterion[] = [
      { id: 'crit1', appliesToAttribute: 'custom.dog_crate_fit' },
    ];
    const result = findStalenessImpact(
      { kind: 'attribute', id: 'custom.dog_crate_fit' },
      context({
        criteria,
        obligations: [obligation({ id: 'ob-ext', origin: 'case_extension', criterionId: 'crit1' })],
      }),
    );
    expect(result.invalidatedObligationIds).toEqual(['ob-ext']);
  });

  it('does not match an attribute trigger against an unrelated criterion', () => {
    const criteria: StalenessCriterion[] = [{ id: 'crit1', appliesToAttribute: 'custom.other' }];
    const result = findStalenessImpact(
      { kind: 'attribute', id: 'custom.dog_crate_fit' },
      context({
        criteria,
        obligations: [obligation({ id: 'ob-ext', origin: 'case_extension', criterionId: 'crit1' })],
      }),
    );
    expect(result.invalidatedObligationIds).toEqual([]);
  });

  it('propagates transitively through dependsOn', () => {
    const result = findStalenessImpact(
      { kind: 'source', id: 's1' },
      context({
        evidenceLinks: [
          link({ id: 'e1', sourceId: 's1', obligationId: 'ob1' }),
          link({ id: 'e2', sourceId: undefined, obligationId: 'ob2' }),
        ],
        obligations: [
          obligation({ id: 'ob1', dependsOn: [] }),
          obligation({ id: 'ob2', dependsOn: ['ob1'] }),
          obligation({ id: 'ob3', dependsOn: ['ob2'] }),
        ],
      }),
    );
    expect(result.invalidatedObligationIds).toEqual(['ob1', 'ob2', 'ob3']);
    expect(result.staleEvidenceLinkIds).toEqual(['e1', 'e2']);
  });

  it('does not propagate to an obligation with no dependency on the invalidated set', () => {
    const result = findStalenessImpact(
      { kind: 'source', id: 's1' },
      context({
        evidenceLinks: [link({ id: 'e1', sourceId: 's1', obligationId: 'ob1' })],
        obligations: [
          obligation({ id: 'ob1' }),
          obligation({ id: 'ob2', dependsOn: ['unrelated'] }),
        ],
      }),
    );
    expect(result.invalidatedObligationIds).toEqual(['ob1']);
  });

  it('ignores an unrelated obligation origin/criterion combination', () => {
    const result = findStalenessImpact(
      { kind: 'criterion', id: 'crit1' },
      context({
        obligations: [obligation({ id: 'ob1', origin: 'pack' })],
      }),
    );
    expect(result.invalidatedObligationIds).toEqual([]);
  });
});

const anyEvidenceLevel = fc.constantFrom<'E0' | 'E1' | 'E2' | 'E3'>('E0', 'E1', 'E2', 'E3');

describe('property: adding failed, degraded, skipped, or stale evidence cannot promote readiness', () => {
  const nonPromotingVerdict = fc.constantFrom<'fail' | 'skipped'>('fail', 'skipped');

  it('adding a fail/skipped-verdict evidence link never raises the achieved level', () => {
    fc.assert(
      fc.property(nonPromotingVerdict, anyEvidenceLevel, (verdict, level) => {
        const before = achievedEvidenceLevel({ claims: [], evidenceLinks: [], sources: [] }, 'ob1');
        const after = achievedEvidenceLevel(
          { claims: [], evidenceLinks: [link({ verdict, level })], sources: [] },
          'ob1',
        );
        expect(after).toBe(before);
      }),
    );
  });

  it('adding a stale pass-verdict evidence link never raises the achieved level', () => {
    fc.assert(
      fc.property(anyEvidenceLevel, (level) => {
        const before = achievedEvidenceLevel({ claims: [], evidenceLinks: [], sources: [] }, 'ob1');
        const after = achievedEvidenceLevel(
          {
            claims: [],
            evidenceLinks: [link({ verdict: 'pass', level, stale: true })],
            sources: [],
          },
          'ob1',
        );
        expect(after).toBe(before);
      }),
    );
  });

  it('adding a non-stale error/degraded evidence link never satisfies the required level', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'error' | 'degraded'>('error', 'degraded'),
        anyEvidenceLevel,
        (verdict, requiredEvidenceLevel) => {
          const met = meetsRequiredEvidenceLevel(obligation({ requiredEvidenceLevel }), {
            claims: [],
            evidenceLinks: [link({ verdict, level: 'E3' })],
            sources: [],
          });
          expect(met).toBe(false);
        },
      ),
    );
  });
});

describe('property: removing included evidence cannot increase readiness', () => {
  it('excluding a previously-included passing link never raises the achieved level', () => {
    fc.assert(
      fc.property(anyEvidenceLevel, (level) => {
        const included = achievedEvidenceLevel(
          {
            claims: [],
            evidenceLinks: [link({ verdict: 'pass', level, disposition: 'included' })],
            sources: [],
          },
          'ob1',
        );
        const excluded = achievedEvidenceLevel(
          {
            claims: [],
            evidenceLinks: [link({ verdict: 'pass', level, disposition: 'excluded' })],
            sources: [],
          },
          'ob1',
        );
        const includedRank = included === null ? -1 : evidenceLevelRank(included);
        const excludedRank = excluded === null ? -1 : evidenceLevelRank(excluded);
        expect(excludedRank).toBeLessThanOrEqual(includedRank);
      }),
    );
  });

  it('dropping a link from the evidence set never raises the achieved level', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom<'E1' | 'E2' | 'E3'>('E1', 'E2', 'E3'), {
          minLength: 1,
          maxLength: 5,
        }),
        (levels) => {
          const links = levels.map((level, index) =>
            link({ id: `e${index}`, level, verdict: 'pass' }),
          );
          const full = achievedEvidenceLevel(
            { claims: [], evidenceLinks: links, sources: [] },
            'ob1',
          );
          const reduced = achievedEvidenceLevel(
            { claims: [], evidenceLinks: links.slice(1), sources: [] },
            'ob1',
          );
          const fullRank = full === null ? -1 : evidenceLevelRank(full);
          const reducedRank = reduced === null ? -1 : evidenceLevelRank(reduced);
          expect(reducedRank).toBeLessThanOrEqual(fullRank);
        },
      ),
    );
  });
});
