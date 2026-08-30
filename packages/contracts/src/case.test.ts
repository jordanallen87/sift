import { describe, expect, it } from 'vitest';
import {
  ActiveFocusSchema,
  CaseStateSchema,
  ClaimSchema,
  DecisionProposalSchema,
  EntityRecordSchema,
  EvidenceLinkSchema,
  ObligationStateSchema,
  RecommendationSchema,
  SourceSchema,
  WorkspaceViewStateSchema,
} from './case.js';

function validAttributeRecord() {
  return {
    definitionId: 'car.advertised_price',
    label: 'Advertised price',
    value: { type: 'money' as const, amount: 24999, currency: 'USD' },
    origin: 'agent_proposed' as const,
    sourceIds: ['src-1'],
    status: 'asserted' as const,
    updatedAt: '2026-08-27T00:00:00.000Z',
  };
}

describe('EntityRecordSchema', () => {
  it('parses a valid entity with a keyed attribute map', () => {
    const result = EntityRecordSchema.safeParse({
      id: 'car-1',
      kind: 'car',
      label: '2022 Honda Civic',
      attributes: { 'car.advertised_price': validAttributeRecord() },
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an entity whose attribute map contains an invalid AttributeRecord', () => {
    const result = EntityRecordSchema.safeParse({
      id: 'car-1',
      kind: 'car',
      label: '2022 Honda Civic',
      attributes: {
        'car.advertised_price': { ...validAttributeRecord(), status: 'unknown' },
      },
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized top-level key', () => {
    const result = EntityRecordSchema.safeParse({
      id: 'car-1',
      kind: 'car',
      label: '2022 Honda Civic',
      attributes: {},
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});

function validObligationState() {
  return {
    id: 'car.hard_constraints',
    label: 'Hard constraints',
    question: 'Which candidates satisfy budget and non-negotiable needs?',
    category: 'constraints',
    required: true,
    priority: 100,
    requiredEvidenceLevel: 'E1' as const,
    maxAttempts: 2,
    acceptedUncertaintyAllowed: false,
    dependsOn: [],
    preferredSkills: ['listing-normalizer'],
    preferredSpecialists: ['deal-analyst'],
    completionRule: {
      minimumEvidenceLevel: 'E1' as const,
      minimumIndependentSources: 1,
      acceptedUncertaintyAllowed: false,
    },
    origin: 'pack' as const,
    status: 'open' as const,
    attemptsUsed: 0,
    updatedAt: '2026-08-27T00:00:00.000Z',
  };
}

describe('ObligationStateSchema', () => {
  it('parses a valid pack-origin obligation state', () => {
    expect(ObligationStateSchema.safeParse(validObligationState()).success).toBe(true);
  });

  it('parses a case-extension obligation carrying its originating criterionId', () => {
    const result = ObligationStateSchema.safeParse({
      ...validObligationState(),
      id: 'case.case-1.dog-crate-fit',
      origin: 'case_extension',
      criterionId: 'custom.dog_crate_fit',
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an invalid status', () => {
    expect(
      ObligationStateSchema.safeParse({ ...validObligationState(), status: 'done' }).success,
    ).toBe(false);
  });

  it('rejects a case-extension obligation that omits its originating criterionId', () => {
    const result = ObligationStateSchema.safeParse({
      ...validObligationState(),
      id: 'case.case-1.dog-crate-fit',
      origin: 'case_extension',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['criterionId']);
      expect(result.error.issues[0]?.message).toContain('must record its originating criterionId');
    }
  });
});

describe('ClaimSchema', () => {
  it('parses a valid claim', () => {
    const result = ClaimSchema.safeParse({
      id: 'claim-1',
      obligationId: 'car.deal_normalization',
      statement: 'The out-the-door price is $500 higher than advertised.',
      stance: 'opposes',
      confidence: 0.8,
      sourceIds: ['src-1'],
      stale: false,
      createdAt: '2026-08-27T00:00:00.000Z',
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an invalid stance and an out-of-range confidence', () => {
    expect(
      ClaimSchema.safeParse({
        id: 'claim-1',
        obligationId: 'car.deal_normalization',
        statement: 'x',
        stance: 'strongly_opposes',
        confidence: 0.5,
        sourceIds: [],
        stale: false,
        createdAt: '2026-08-27T00:00:00.000Z',
      }).success,
    ).toBe(false);

    expect(
      ClaimSchema.safeParse({
        id: 'claim-1',
        obligationId: 'car.deal_normalization',
        statement: 'x',
        stance: 'supports',
        confidence: 2,
        sourceIds: [],
        stale: false,
        createdAt: '2026-08-27T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('SourceSchema', () => {
  it('parses a valid submitted source', () => {
    const result = SourceSchema.safeParse({
      id: 'src-1',
      url: 'https://example.com/listing/123',
      title: 'Listing 123',
      retrievedAt: '2026-08-27T00:00:00.000Z',
      origin: 'user_submitted',
      verification: 'unverified',
      createdAt: '2026-08-27T00:00:00.000Z',
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects a non-URL value for url', () => {
    expect(
      SourceSchema.safeParse({
        id: 'src-1',
        url: 'not a url',
        title: 'Listing 123',
        retrievedAt: '2026-08-27T00:00:00.000Z',
        origin: 'user_submitted',
        verification: 'unverified',
        createdAt: '2026-08-27T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('EvidenceLinkSchema', () => {
  it('parses a valid evidence link and rejects an invalid disposition', () => {
    const valid = {
      id: 'ev-1',
      obligationId: 'car.deal_normalization',
      sourceId: 'src-1',
      level: 'E2' as const,
      verdict: 'pass' as const,
      disposition: 'included' as const,
      summary: 'Corroborated by two listings.',
      stale: false,
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };
    expect(EvidenceLinkSchema.safeParse(valid).success).toBe(true);
    expect(EvidenceLinkSchema.safeParse({ ...valid, disposition: 'archived' }).success).toBe(false);
  });
});

describe('ActiveFocusSchema', () => {
  it('parses a valid current-focus record', () => {
    const result = ActiveFocusSchema.safeParse({
      obligationId: 'car.deal_normalization',
      reason: 'A teaser price conflicts with mandatory add-ons.',
      skillId: 'deal-analysis',
      specialistId: 'deal-analyst',
      runId: 'run-1',
      since: '2026-08-27T00:00:00.000Z',
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });
});

describe('WorkspaceViewStateSchema', () => {
  it('parses a minimal view state carrying only mode', () => {
    const result = WorkspaceViewStateSchema.safeParse({ mode: 'quick_pick' });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('parses a fully populated view state across every view mode', () => {
    const result = WorkspaceViewStateSchema.safeParse({
      mode: 'compare',
      focusedOptionId: 'car-1',
      visibleOptionIds: ['car-1', 'car-2'],
      visibleAttributeIds: ['car.price', 'custom.dog_crate_fit'],
      pinnedAttributeIds: ['car.price'],
      sort: { fieldId: 'car.price', direction: 'asc' },
      filters: [{ fieldId: 'car.price', operator: 'less_than', value: '30000' }],
      compare: { optionIds: ['car-1', 'car-2'] },
      board: {
        columns: [
          { id: 'considering', label: 'Considering', optionIds: ['car-1'] },
          { id: 'top-choices', label: 'Top choices', optionIds: ['car-2'] },
        ],
      },
      quickPick: { queue: ['car-1', 'car-2', 'car-3'], position: 1 },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an unrecognized mode', () => {
    expect(WorkspaceViewStateSchema.safeParse({ mode: 'grid' }).success).toBe(false);
  });

  it('rejects an unrecognized top-level key', () => {
    expect(WorkspaceViewStateSchema.safeParse({ mode: 'list', extra: true }).success).toBe(false);
  });
});

describe('RecommendationSchema', () => {
  it('parses a valid recommendation and rejects an out-of-range confidence', () => {
    const valid = {
      id: 'rec-1',
      status: 'ready' as const,
      favoredOptionId: 'car-1',
      rationale: 'Best fit under budget with strong reliability evidence.',
      facts: ['Advertised price is $24,999.'],
      hypotheses: [],
      confidence: 0.75,
      limitations: ['Test drive not yet completed.'],
      sourceIds: ['src-1'],
      resolvedObligationIds: ['car.deal_normalization'],
      acceptedUncertaintyObligationIds: [],
      generatedAt: '2026-08-27T00:00:00.000Z',
    };
    expect(RecommendationSchema.safeParse(valid).success).toBe(true);
    expect(RecommendationSchema.safeParse({ ...valid, confidence: 1.5 }).success).toBe(false);
  });
});

describe('DecisionProposalSchema', () => {
  it('structurally accepts both human and agent actors (the human-only rule is a core-reducer behavior, not a schema-level restriction)', () => {
    const base = {
      id: 'proposal-1',
      recommendationId: 'rec-1',
      status: 'pending' as const,
      createdAt: '2026-08-27T00:00:00.000Z',
    };
    expect(DecisionProposalSchema.safeParse(base).success).toBe(true);
    expect(
      DecisionProposalSchema.safeParse({
        ...base,
        status: 'approved',
        reviewedAt: '2026-08-27T00:05:00.000Z',
        reviewedByActor: 'human',
      }).success,
    ).toBe(true);
    expect(
      DecisionProposalSchema.safeParse({
        ...base,
        status: 'approved',
        reviewedAt: '2026-08-27T00:05:00.000Z',
        reviewedByActor: 'agent',
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid status', () => {
    expect(
      DecisionProposalSchema.safeParse({
        id: 'proposal-1',
        recommendationId: 'rec-1',
        status: 'archived',
        createdAt: '2026-08-27T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('CaseStateSchema', () => {
  function validCaseState() {
    return {
      schemaVersion: '1.0' as const,
      id: 'case-1',
      title: 'Choose our next family car',
      status: 'draft' as const,
      pack: {
        id: 'car-purchase',
        version: '1.0.0',
        compiledHash: 'a'.repeat(64),
        selectedBy: 'user' as const,
        reasons: ['User selected this Decision Pack'],
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
      createdAt: '2026-08-27T00:00:00.000Z',
      updatedAt: '2026-08-27T00:00:00.000Z',
    };
  }

  it('parses a minimal freshly instantiated case', () => {
    const result = CaseStateSchema.safeParse(validCaseState());
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an invalid status', () => {
    expect(CaseStateSchema.safeParse({ ...validCaseState(), status: 'archived' }).success).toBe(
      false,
    );
  });

  it('rejects a negative eventSequence', () => {
    expect(CaseStateSchema.safeParse({ ...validCaseState(), eventSequence: -1 }).success).toBe(
      false,
    );
  });

  it('rejects an unrecognized top-level key', () => {
    expect(CaseStateSchema.safeParse({ ...validCaseState(), extra: true }).success).toBe(false);
  });

  it('parses a pre-existing persisted snapshot that has no view key at all (backward compatibility)', () => {
    const legacySnapshot = validCaseState();
    expect('view' in legacySnapshot).toBe(false);
    const result = CaseStateSchema.safeParse(legacySnapshot);
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('parses a case whose view has been explicitly cleared to null', () => {
    const result = CaseStateSchema.safeParse({ ...validCaseState(), view: null });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('parses a case carrying a populated workspace view state', () => {
    const result = CaseStateSchema.safeParse({
      ...validCaseState(),
      view: {
        mode: 'board',
        board: {
          columns: [{ id: 'considering', label: 'Considering', optionIds: [] }],
        },
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('round-trips a case carrying a case-extension obligation, criterion, and recommendation', () => {
    const full = {
      ...validCaseState(),
      criteria: [
        {
          id: 'custom.dog_crate_fit',
          label: 'Two dog crates must fit',
          kind: 'hard_constraint' as const,
          weight: 90,
          direction: 'qualitative' as const,
          appliesToAttribute: 'custom.dog_crate_fit',
          origin: 'user' as const,
          status: 'active' as const,
        },
      ],
      obligations: [
        {
          ...validObligationState(),
          id: 'case.case-1.dog-crate-fit',
          origin: 'case_extension' as const,
          criterionId: 'custom.dog_crate_fit',
        },
      ],
      recommendation: {
        id: 'rec-1',
        status: 'stale' as const,
        favoredOptionId: null,
        rationale: 'Pending re-evaluation.',
        facts: [],
        hypotheses: [],
        confidence: 0,
        limitations: [],
        sourceIds: [],
        resolvedObligationIds: [],
        acceptedUncertaintyObligationIds: [],
        generatedAt: '2026-08-27T00:00:00.000Z',
      },
    };
    const result = CaseStateSchema.safeParse(full);
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });
});
