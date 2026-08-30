import { describe, expect, it } from 'vitest';
import type { AttributeDefinition, CaseExtension, Criterion, DecisionGuide } from '@sift/contracts';
import { buildFixtureCaseState, buildFixtureObligation } from '../test/fixtures.js';
import { bandWeight, deriveDecisionProfile } from './decision-profile.js';

function buildGuide(overrides: Partial<DecisionGuide> = {}): DecisionGuide {
  return {
    domainPurpose: 'Compare shortlisted vehicles against household needs.',
    discoveryStrategy: 'Establish hard constraints before comparing candidates.',
    suggestedQuestions: [],
    importantUnknowns: [],
    researchGuidance: 'Prefer independent published sources.',
    customFieldGuidance: 'Prefer a typed custom field over prose.',
    presentationGuidance: 'Show deal and ownership cost together.',
    ...overrides,
  };
}

const FIXED_TIMESTAMP = '2026-08-27T00:00:00.000Z';

function buildCriterion(overrides: Partial<Criterion> = {}): Criterion {
  return {
    id: 'crit-1',
    label: 'Safety',
    kind: 'preference',
    weight: 50,
    direction: 'higher_better',
    origin: 'pack',
    status: 'active',
    ...overrides,
  };
}

function buildAttributeDefinition(
  overrides: Partial<AttributeDefinition> = {},
): AttributeDefinition {
  return {
    id: 'safety_rating',
    label: 'Safety rating',
    valueType: 'number',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'assertion',
    comparison: 'higher_better',
    sensitive: false,
    ...overrides,
  };
}

function buildExtension(overrides: Partial<CaseExtension> = {}): CaseExtension {
  return {
    id: 'ext-1',
    caseId: 'case-1',
    definition: {
      id: 'custom.laptop_work_fit',
      label: 'Laptop work fit',
      valueType: 'string',
      required: false,
      appliesTo: ['car'],
      evidenceExpectation: 'assertion',
      comparison: 'none',
      sensitive: false,
      origin: 'user',
      reason: 'I work from the car sometimes.',
      confirmation: 'confirmed',
      proposedBy: 'user-123',
      createdAt: FIXED_TIMESTAMP,
    },
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

describe('bandWeight', () => {
  it('bands the bottom third (0-33) as somewhat_important', () => {
    expect(bandWeight(0)).toBe('somewhat_important');
    expect(bandWeight(33)).toBe('somewhat_important');
  });

  it('bands the middle third (34-66) as important', () => {
    expect(bandWeight(34)).toBe('important');
    expect(bandWeight(66)).toBe('important');
  });

  it('bands the top third (67-100) as very_important', () => {
    expect(bandWeight(67)).toBe('very_important');
    expect(bandWeight(100)).toBe('very_important');
  });
});

describe('deriveDecisionProfile', () => {
  it('produces an entirely empty profile for a fresh case with no criteria or extensions', () => {
    const caseState = buildFixtureCaseState();
    const profile = deriveDecisionProfile(caseState);
    expect(profile).toEqual({
      mustHave: [],
      important: [],
      niceToHave: [],
      context: [],
      personalConcerns: [],
      missing: [],
      suggestedQuestions: [],
    });
  });

  it('routes hard_constraint criteria to mustHave, never to a weighted preference bucket', () => {
    const caseState = buildFixtureCaseState({
      criteria: [
        buildCriterion({
          id: 'budget',
          label: 'Budget',
          kind: 'hard_constraint',
          weight: 20,
          target: { type: 'money', amount: 40000, currency: 'USD' },
        }),
      ],
    });
    const profile = deriveDecisionProfile(caseState);
    expect(profile.mustHave).toHaveLength(1);
    expect(profile.mustHave[0]?.label).toBe('Budget');
    expect(profile.mustHave[0]?.kind).toBe('hard_constraint');
    expect(profile.important).toEqual([]);
    expect(profile.niceToHave).toEqual([]);
  });

  it('routes preference criteria into important vs niceToHave strictly by weight band', () => {
    const caseState = buildFixtureCaseState({
      criteria: [
        buildCriterion({ id: 'safety', label: 'Safety', kind: 'preference', weight: 80 }),
        buildCriterion({ id: 'cargo', label: 'Cargo', kind: 'preference', weight: 50 }),
        buildCriterion({ id: 'color', label: 'Color', kind: 'preference', weight: 10 }),
      ],
    });
    const profile = deriveDecisionProfile(caseState);
    expect(profile.important.map((c) => c.label).sort()).toEqual(['Cargo', 'Safety']);
    expect(profile.niceToHave.map((c) => c.label)).toEqual(['Color']);
  });

  it('routes consideration criteria to context, and preserves the exact weight alongside the band', () => {
    const caseState = buildFixtureCaseState({
      criteria: [
        buildCriterion({
          id: 'commute',
          label: 'Commute distance',
          kind: 'consideration',
          weight: 15,
        }),
      ],
    });
    const profile = deriveDecisionProfile(caseState);
    expect(profile.context).toHaveLength(1);
    expect(profile.context[0]?.weight).toBe(15);
    expect(profile.context[0]?.priorityBand).toBe('somewhat_important');
    expect(profile.mustHave).toEqual([]);
    expect(profile.important).toEqual([]);
  });

  it('drops excluded criteria from every weighted section', () => {
    const caseState = buildFixtureCaseState({
      criteria: [
        buildCriterion({ id: 'old', label: 'Old concern', kind: 'preference', status: 'excluded' }),
      ],
    });
    const profile = deriveDecisionProfile(caseState);
    expect(profile.important).toEqual([]);
    expect(profile.niceToHave).toEqual([]);
  });

  it('sorts each weighted section by weight descending', () => {
    const caseState = buildFixtureCaseState({
      criteria: [
        buildCriterion({ id: 'a', label: 'A', kind: 'preference', weight: 40 }),
        buildCriterion({ id: 'b', label: 'B', kind: 'preference', weight: 60 }),
      ],
    });
    const profile = deriveDecisionProfile(caseState);
    expect(profile.important.map((c) => c.label)).toEqual(['B', 'A']);
  });

  it('formats a criterion target using the shared attribute-value formatter', () => {
    const caseState = buildFixtureCaseState({
      criteria: [
        buildCriterion({
          id: 'budget',
          label: 'Budget',
          kind: 'hard_constraint',
          target: { type: 'money', amount: 40000, currency: 'USD' },
        }),
      ],
    });
    const profile = deriveDecisionProfile(caseState);
    // Deterministic, comma-grouped, symbol-mapped money formatting -- see
    // attribute-value-format.ts's header comment. Not locale-dependent: the
    // symbol/grouping are hand-composed the same way in every environment.
    expect(profile.mustHave[0]?.target).toBe('$40,000');
  });

  it('carries a null target when none is set, never a fabricated value', () => {
    const caseState = buildFixtureCaseState({
      criteria: [buildCriterion({ id: 'safety', kind: 'preference' })],
    });
    const profile = deriveDecisionProfile(caseState);
    expect(profile.important[0]?.target).toBeNull();
  });

  describe('personal concerns (case extensions)', () => {
    it('projects a confirmed, user-added extension as a personal concern with its origin and confirmation intact', () => {
      const caseState = buildFixtureCaseState({
        caseExtensions: [buildExtension()],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.personalConcerns).toEqual([
        {
          id: 'ext-1',
          label: 'Laptop work fit',
          reason: 'I work from the car sometimes.',
          origin: 'user',
          confirmation: 'confirmed',
          proposedBy: 'user-123',
        },
      ]);
    });

    it('distinguishes an agent-proposed, still-pending concern from a user-added one', () => {
      const caseState = buildFixtureCaseState({
        caseExtensions: [
          buildExtension({
            id: 'ext-agent',
            definition: {
              ...buildExtension().definition,
              id: 'custom.dog_crate_fit',
              label: 'Dog crate fit',
              origin: 'agent_proposed',
              confirmation: 'pending',
              proposedBy: 'sift-runtime',
            },
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.personalConcerns).toHaveLength(1);
      expect(profile.personalConcerns[0]?.origin).toBe('agent_proposed');
      expect(profile.personalConcerns[0]?.confirmation).toBe('pending');
    });

    it('drops a rejected extension entirely -- it is no longer part of what this person is looking for', () => {
      const caseState = buildFixtureCaseState({
        caseExtensions: [
          buildExtension({
            definition: { ...buildExtension().definition, confirmation: 'rejected' },
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.personalConcerns).toEqual([]);
    });
  });

  describe('missing (§16 "what we still don\'t know")', () => {
    it('flags a hard_constraint with no target as no_target, not as no_measurement', () => {
      const caseState = buildFixtureCaseState({
        criteria: [
          buildCriterion({
            id: 'budget',
            label: 'Budget',
            kind: 'hard_constraint',
            target: undefined,
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toHaveLength(1);
      expect(profile.missing[0]).toMatchObject({
        reasonKind: 'no_target',
        relatedId: 'budget',
      });
      expect(profile.missing[0]?.text).toContain('Budget');
    });

    it('does not flag a hard_constraint that already has a target', () => {
      const caseState = buildFixtureCaseState({
        criteria: [
          buildCriterion({
            id: 'budget',
            kind: 'hard_constraint',
            target: { type: 'money', amount: 40000, currency: 'USD' },
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toEqual([]);
    });

    it('flags a preference criterion with no target and no appliesToAttribute as no_measurement', () => {
      const caseState = buildFixtureCaseState({
        criteria: [
          buildCriterion({
            id: 'comfort',
            label: 'Ride comfort',
            kind: 'preference',
            appliesToAttribute: undefined,
            target: undefined,
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toEqual([
        {
          id: 'criterion:comfort:no-measurement',
          relatedId: 'comfort',
          reasonKind: 'no_measurement',
          text: 'There\'s no way yet to check "Ride comfort" against your options.',
        },
      ]);
    });

    it('flags a preference criterion whose appliesToAttribute is a dangling reference as no_measurement', () => {
      const caseState = buildFixtureCaseState({
        attributeDefinitions: [buildAttributeDefinition({ id: 'safety_rating' })],
        criteria: [
          buildCriterion({
            id: 'cargo',
            label: 'Cargo',
            kind: 'preference',
            appliesToAttribute: 'cargo_volume',
            target: undefined,
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toHaveLength(1);
      expect(profile.missing[0]?.reasonKind).toBe('no_measurement');
    });

    it('does not flag a preference criterion whose appliesToAttribute resolves to a real attribute definition', () => {
      const caseState = buildFixtureCaseState({
        attributeDefinitions: [buildAttributeDefinition({ id: 'safety_rating' })],
        criteria: [
          buildCriterion({
            id: 'safety',
            kind: 'preference',
            appliesToAttribute: 'safety_rating',
            target: undefined,
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toEqual([]);
    });

    it('does not flag a criterion that has a target even without a matching attribute definition', () => {
      const caseState = buildFixtureCaseState({
        criteria: [
          buildCriterion({
            id: 'cargo',
            kind: 'preference',
            appliesToAttribute: undefined,
            target: { type: 'number', value: 30 },
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toEqual([]);
    });

    it('ignores excluded criteria entirely when deriving missing items', () => {
      const caseState = buildFixtureCaseState({
        criteria: [
          buildCriterion({
            id: 'old',
            kind: 'hard_constraint',
            status: 'excluded',
            target: undefined,
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toEqual([]);
    });

    it('flags a pending case extension as pending_confirmation', () => {
      const caseState = buildFixtureCaseState({
        caseExtensions: [
          buildExtension({
            id: 'ext-1',
            definition: {
              ...buildExtension().definition,
              label: 'Dog crate fit',
              confirmation: 'pending',
            },
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toEqual([
        {
          id: 'extension:ext-1:pending',
          relatedId: 'ext-1',
          reasonKind: 'pending_confirmation',
          text: '"Dog crate fit" is still waiting for your confirmation before it\'s part of the comparison.',
        },
      ]);
    });

    it('does not flag a confirmed or rejected case extension', () => {
      const caseState = buildFixtureCaseState({
        caseExtensions: [
          buildExtension({ id: 'ext-confirmed' }),
          buildExtension({
            id: 'ext-rejected',
            definition: { ...buildExtension().definition, confirmation: 'rejected' },
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toEqual([]);
    });

    it('combines criteria- and extension-derived missing items in one list', () => {
      const caseState = buildFixtureCaseState({
        criteria: [buildCriterion({ id: 'budget', kind: 'hard_constraint', target: undefined })],
        caseExtensions: [
          buildExtension({
            id: 'ext-1',
            definition: { ...buildExtension().definition, confirmation: 'pending' },
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toHaveLength(2);
      expect(profile.missing.map((item) => item.reasonKind).sort()).toEqual([
        'no_target',
        'pending_confirmation',
      ]);
    });
  });

  describe('suggestedQuestions (§16, sourced honestly per task D4)', () => {
    it('is empty when no guide is supplied and the case has no unmet obligation or questioned criterion', () => {
      const caseState = buildFixtureCaseState();
      const profile = deriveDecisionProfile(caseState);
      expect(profile.suggestedQuestions).toEqual([]);
    });

    it('surfaces a guide-declared question verbatim, tagged pack_guide, with no relatedId', () => {
      const caseState = buildFixtureCaseState();
      const guide = buildGuide({ suggestedQuestions: ['Do you need AWD?'] });
      const profile = deriveDecisionProfile(caseState, guide);
      expect(profile.suggestedQuestions).toEqual([
        { id: 'guide:0', text: 'Do you need AWD?', source: 'pack_guide' },
      ]);
    });

    it("preserves the guide's own declared question order", () => {
      const caseState = buildFixtureCaseState();
      const guide = buildGuide({
        suggestedQuestions: ['Do you need AWD?', 'Is $40,000 a hard ceiling or target?'],
      });
      const profile = deriveDecisionProfile(caseState, guide);
      expect(profile.suggestedQuestions.map((q) => q.text)).toEqual([
        'Do you need AWD?',
        'Is $40,000 a hard ceiling or target?',
      ]);
    });

    it('never fabricates guide questions when no guide is supplied at all', () => {
      const caseState = buildFixtureCaseState({
        obligations: [], // no case-side signal either
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.suggestedQuestions).toEqual([]);
    });

    it("surfaces an open obligation's own question, tagged unmet_obligation, with its relatedId", () => {
      const caseState = buildFixtureCaseState({
        obligations: [
          buildFixtureObligation({
            id: 'obl-price',
            question: 'What is the out-the-door price?',
            status: 'open',
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.suggestedQuestions).toEqual([
        {
          id: 'obligation:obl-price',
          text: 'What is the out-the-door price?',
          source: 'unmet_obligation',
          relatedId: 'obl-price',
        },
      ]);
    });

    it.each(['open', 'active', 'blocked'] as const)(
      'treats a "%s" obligation as unmet and surfaces its question',
      (status) => {
        const caseState = buildFixtureCaseState({
          obligations: [buildFixtureObligation({ id: 'obl-1', status })],
        });
        const profile = deriveDecisionProfile(caseState);
        expect(profile.suggestedQuestions.map((q) => q.relatedId)).toEqual(['obl-1']);
      },
    );

    it.each(['satisfied', 'accepted_uncertainty'] as const)(
      'does not surface a "%s" obligation -- it is no longer unmet',
      (status) => {
        const caseState = buildFixtureCaseState({
          obligations: [buildFixtureObligation({ id: 'obl-1', status })],
        });
        const profile = deriveDecisionProfile(caseState);
        expect(profile.suggestedQuestions).toEqual([]);
      },
    );

    it('orders unmet obligations by descending pack-declared priority', () => {
      const caseState = buildFixtureCaseState({
        obligations: [
          buildFixtureObligation({ id: 'low', question: 'Low priority question?', priority: 1 }),
          buildFixtureObligation({
            id: 'high',
            question: 'High priority question?',
            priority: 100,
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.suggestedQuestions.map((q) => q.relatedId)).toEqual(['high', 'low']);
    });

    it("surfaces a missing criterion's own declared question, tagged missing_criterion", () => {
      const caseState = buildFixtureCaseState({
        criteria: [
          buildCriterion({
            id: 'budget',
            label: 'Budget',
            kind: 'hard_constraint',
            target: undefined,
            question: 'Is $40,000 a hard ceiling or a target?',
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.suggestedQuestions).toEqual([
        {
          id: 'criterion:budget',
          text: 'Is $40,000 a hard ceiling or a target?',
          source: 'missing_criterion',
          relatedId: 'budget',
        },
      ]);
    });

    it('never fabricates a question for a missing criterion that declares no question of its own', () => {
      const caseState = buildFixtureCaseState({
        criteria: [
          buildCriterion({
            id: 'budget',
            kind: 'hard_constraint',
            target: undefined,
            question: undefined,
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toHaveLength(1); // the gap is still visible in "missing"...
      expect(profile.suggestedQuestions).toEqual([]); // ...but never turned into an invented question
    });

    it('does not surface a resolved criterion\'s question -- it is not in "missing"', () => {
      const caseState = buildFixtureCaseState({
        criteria: [
          buildCriterion({
            id: 'budget',
            kind: 'hard_constraint',
            target: { type: 'money', amount: 40000, currency: 'USD' },
            question: 'Is $40,000 a hard ceiling or a target?',
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.suggestedQuestions).toEqual([]);
    });

    it('never fabricates a question for a pending case extension with no backing guide or obligation question', () => {
      const caseState = buildFixtureCaseState({
        caseExtensions: [
          buildExtension({
            id: 'ext-1',
            definition: { ...buildExtension().definition, confirmation: 'pending' },
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.missing).toHaveLength(1); // pending_confirmation is still visible in "missing"...
      expect(profile.suggestedQuestions).toEqual([]); // ...honestly empty rather than invented
    });

    it("surfaces a pending extension's obligation question when one genuinely exists (case_extension-origin obligation)", () => {
      const caseState = buildFixtureCaseState({
        caseExtensions: [
          buildExtension({
            id: 'ext-1',
            definition: { ...buildExtension().definition, confirmation: 'pending' },
          }),
        ],
        obligations: [
          buildFixtureObligation({
            id: 'case.ext-1',
            question: 'Should "Laptop work fit" count toward the comparison?',
            origin: 'case_extension',
            criterionId: 'crit-ext-1',
            status: 'open',
          }),
        ],
      });
      const profile = deriveDecisionProfile(caseState);
      expect(profile.suggestedQuestions).toContainEqual({
        id: 'obligation:case.ext-1',
        text: 'Should "Laptop work fit" count toward the comparison?',
        source: 'unmet_obligation',
        relatedId: 'case.ext-1',
      });
    });

    it('combines pack_guide, unmet_obligation, and missing_criterion sources together, guide first', () => {
      const caseState = buildFixtureCaseState({
        criteria: [
          buildCriterion({
            id: 'budget',
            kind: 'hard_constraint',
            target: undefined,
            question: 'Is $40,000 a hard ceiling or a target?',
          }),
        ],
        obligations: [
          buildFixtureObligation({ id: 'obl-1', question: 'What is the out-the-door price?' }),
        ],
      });
      const guide = buildGuide({ suggestedQuestions: ['Do you need AWD?'] });
      const profile = deriveDecisionProfile(caseState, guide);
      expect(profile.suggestedQuestions.map((q) => q.source)).toEqual([
        'pack_guide',
        'unmet_obligation',
        'missing_criterion',
      ]);
    });

    it('deduplicates an identical question surfaced by two different real signals, keeping the first', () => {
      const caseState = buildFixtureCaseState({
        obligations: [buildFixtureObligation({ id: 'obl-1', question: 'Do you need AWD?' })],
      });
      const guide = buildGuide({ suggestedQuestions: ['Do you need AWD?'] });
      const profile = deriveDecisionProfile(caseState, guide);
      expect(profile.suggestedQuestions).toHaveLength(1);
      expect(profile.suggestedQuestions[0]?.source).toBe('pack_guide');
    });
  });
});
