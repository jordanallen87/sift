import { describe, expect, it } from 'vitest';
import {
  AddNoteInputSchema,
  CommandReceiptSchema,
  DefineCaseAttributeInputSchema,
  FocusEvidenceInputSchema,
  FocusOptionInputSchema,
  GetCaseContextInputSchema,
  ListPacksInputSchema,
  SiftToolResultSchema,
  RequestInvestigationInputSchema,
  RequestRevisionInputSchema,
  ReviewCaseExtensionInputSchema,
  ReviewProposalInputSchema,
  RunReceiptSchema,
  SelectPackInputSchema,
  SetEvidenceDispositionInputSchema,
  SetOptionAttributeInputSchema,
  SetViewInputSchema,
  StartCaseInputSchema,
  StartDemoInputSchema,
  SubmitSourceInputSchema,
  UpdateCriteriaInputSchema,
  UpsertOptionInputSchema,
} from './commands.js';
import { z } from 'zod';

describe('StartDemoInputSchema', () => {
  it('accepts the two demo launcher options', () => {
    expect(StartDemoInputSchema.safeParse({ demoId: 'car-purchase' }).success).toBe(true);
    expect(StartDemoInputSchema.safeParse({ demoId: 'home-energy-guardian' }).success).toBe(true);
  });

  it('rejects an unlisted demo id', () => {
    expect(StartDemoInputSchema.safeParse({ demoId: 'apartment-hunt' }).success).toBe(false);
  });
});

describe('StartCaseInputSchema', () => {
  it('accepts any well-formed pack id, not just the closed DemoId enum', () => {
    expect(StartCaseInputSchema.safeParse({ packId: 'car-purchase' }).success).toBe(true);
    expect(StartCaseInputSchema.safeParse({ packId: 'apartment-hunt' }).success).toBe(true);
  });

  it('rejects a missing packId', () => {
    expect(StartCaseInputSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an unknown field (strict)', () => {
    expect(StartCaseInputSchema.safeParse({ packId: 'car-purchase', extra: 1 }).success).toBe(
      false,
    );
  });
});

describe('SelectPackInputSchema', () => {
  it('parses a valid selection and rejects a missing expectedSequence', () => {
    expect(
      SelectPackInputSchema.safeParse({
        caseId: 'case-1',
        packId: 'car-purchase',
        expectedSequence: 0,
      }).success,
    ).toBe(true);
    expect(
      SelectPackInputSchema.safeParse({ caseId: 'case-1', packId: 'car-purchase' }).success,
    ).toBe(false);
  });
});

describe('UpsertOptionInputSchema', () => {
  it('parses a valid option with typed attributes, and enforces the discriminated AttributeValue union', () => {
    const result = UpsertOptionInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 3,
      option: {
        label: '2022 Honda Civic',
        kind: 'car',
        attributes: [
          {
            definitionId: 'car.advertised_price',
            value: { type: 'money', amount: 24999, currency: 'USD' },
            sourceIds: ['src-1'],
          },
        ],
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an option carrying an invalid AttributeValue', () => {
    const result = UpsertOptionInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 3,
      option: {
        label: '2022 Honda Civic',
        kind: 'car',
        attributes: [{ definitionId: 'car.advertised_price', value: { type: 'currency' } }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts an attribute with no value when status is "unknown" (explicit unknown, §24)', () => {
    const result = UpsertOptionInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 3,
      option: {
        label: '2022 Honda Civic',
        kind: 'car',
        attributes: [{ definitionId: 'custom.laptop_work_fit', status: 'unknown' }],
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('accepts a low-confidence agent-inferred value with status/confidence/origin all set (§24/§25)', () => {
    const result = UpsertOptionInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 3,
      option: {
        label: '2022 Honda Civic',
        kind: 'car',
        attributes: [
          {
            definitionId: 'custom.laptop_work_fit',
            value: { type: 'string', value: 'Likely good' },
            status: 'supported',
            confidence: 0.4,
            origin: 'agent_proposed',
            sourceIds: ['src-1'],
          },
        ],
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
    expect(result.success && result.data.option.attributes[0]?.confidence).toBe(0.4);
  });

  it('accepts a verified value with sources and no confidence set', () => {
    const result = UpsertOptionInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 3,
      option: {
        label: '2022 Honda Civic',
        kind: 'car',
        attributes: [
          {
            definitionId: 'car.advertised_price',
            value: { type: 'money', amount: 24999, currency: 'USD' },
            status: 'verified',
            origin: 'user',
            sourceIds: ['src-1'],
          },
        ],
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an out-of-range confidence value', () => {
    const result = UpsertOptionInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 3,
      option: {
        label: 'x',
        kind: 'car',
        attributes: [
          {
            definitionId: 'car.advertised_price',
            value: { type: 'money', amount: 1, currency: 'USD' },
            confidence: 1.5,
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unlisted status or origin value', () => {
    expect(
      UpsertOptionInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 3,
        option: {
          label: 'x',
          kind: 'car',
          attributes: [
            {
              definitionId: 'car.advertised_price',
              value: { type: 'money', amount: 1, currency: 'USD' },
              status: 'not-a-real-status',
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      UpsertOptionInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 3,
        option: {
          label: 'x',
          kind: 'car',
          attributes: [
            {
              definitionId: 'car.advertised_price',
              value: { type: 'money', amount: 1, currency: 'USD' },
              origin: 'not-a-real-origin',
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it('rejects more than five options being expressed structurally is out of scope (a run-time pack limit, not a schema bound), but rejects an oversized attribute list', () => {
    const result = UpsertOptionInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 3,
      option: {
        label: 'x',
        kind: 'car',
        attributes: Array.from({ length: 101 }, (_, i) => ({
          definitionId: `attr-${i}`,
          value: { type: 'boolean', value: true },
        })),
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('SetViewInputSchema (plan task E5)', () => {
  it('parses a valid setView input carrying expectedSequence and a full WorkspaceViewState', () => {
    const result = SetViewInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 4,
      view: { mode: 'compare', compare: { optionIds: ['car-1', 'car-2'] } },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('parses a minimal view carrying only mode', () => {
    expect(
      SetViewInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 0,
        view: { mode: 'quick_pick' },
      }).success,
    ).toBe(true);
  });

  it('rejects a missing expectedSequence', () => {
    expect(SetViewInputSchema.safeParse({ caseId: 'case-1', view: { mode: 'list' } }).success).toBe(
      false,
    );
  });

  it('rejects a missing view', () => {
    expect(SetViewInputSchema.safeParse({ caseId: 'case-1', expectedSequence: 0 }).success).toBe(
      false,
    );
  });

  it('delegates to WorkspaceViewStateSchema, rejecting an unrecognized view mode', () => {
    expect(
      SetViewInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 0,
        view: { mode: 'grid' },
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown top-level field (strict)', () => {
    expect(
      SetViewInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 0,
        view: { mode: 'list' },
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe('SetOptionAttributeInputSchema (ADR 0006 decision 4)', () => {
  it('parses a valid single-attribute write', () => {
    const result = SetOptionAttributeInputSchema.safeParse({
      caseId: 'case-1',
      optionId: 'car-1',
      expectedSequence: 4,
      attribute: {
        definitionId: 'car.price',
        value: { type: 'money', amount: 24000, currency: 'USD' },
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('accepts status "unknown" with no value, matching OptionAttributeInputSchema', () => {
    expect(
      SetOptionAttributeInputSchema.safeParse({
        caseId: 'case-1',
        optionId: 'car-1',
        expectedSequence: 4,
        attribute: { definitionId: 'custom.dog_crate_fit', status: 'unknown' },
      }).success,
    ).toBe(true);
  });

  it('accepts confidence/origin/sourceIds carried on the single attribute', () => {
    const result = SetOptionAttributeInputSchema.safeParse({
      caseId: 'case-1',
      optionId: 'car-1',
      expectedSequence: 4,
      attribute: {
        definitionId: 'custom.dog_crate_fit',
        value: { type: 'string', value: 'Fits with seats down.' },
        status: 'supported',
        confidence: 0.6,
        origin: 'agent_proposed',
        sourceIds: ['source-1'],
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects a missing optionId', () => {
    expect(
      SetOptionAttributeInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 4,
        attribute: {
          definitionId: 'car.price',
          value: { type: 'money', amount: 1, currency: 'USD' },
        },
      }).success,
    ).toBe(false);
  });

  it('rejects a missing attribute', () => {
    expect(
      SetOptionAttributeInputSchema.safeParse({
        caseId: 'case-1',
        optionId: 'car-1',
        expectedSequence: 4,
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown top-level field (strict)', () => {
    expect(
      SetOptionAttributeInputSchema.safeParse({
        caseId: 'case-1',
        optionId: 'car-1',
        expectedSequence: 4,
        attribute: {
          definitionId: 'car.price',
          value: { type: 'money', amount: 1, currency: 'USD' },
        },
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe('AddNoteInputSchema (docs/change-sets/2026-08-30-generic-decision-workspace.md §28/§29)', () => {
  it('parses a minimal note with only body (kind/origin/links/sourceIds all optional on the wire)', () => {
    const result = AddNoteInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 4,
      note: { body: 'The seat position felt wrong on the test drive.' },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('parses a fully populated note carrying kind, option links, an obligation link, and cited sources', () => {
    const result = AddNoteInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 4,
      origin: 'agent_proposed',
      note: {
        body: 'Two listings disagree on the advertised price.',
        kind: 'research',
        optionIds: ['candidate-rav4', 'candidate-crv'],
        obligationId: 'car.deal_normalization',
        sourceIds: ['source-1', 'source-2'],
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it("defaults origin to being absent (undefined) on the wire, matching DefineCaseAttributeInputSchema's optional origin channel", () => {
    const result = AddNoteInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 4,
      note: { body: 'A plain user note.' },
    });
    expect(result.success && result.data.origin).toBeUndefined();
  });

  it('rejects a missing note body', () => {
    expect(
      AddNoteInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 4,
        note: {},
      }).success,
    ).toBe(false);
  });

  it('rejects an unlisted note kind', () => {
    expect(
      AddNoteInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 4,
        note: { body: 'x', kind: 'rant' },
      }).success,
    ).toBe(false);
  });

  it('rejects an origin outside the reused user/agent_proposed vocabulary', () => {
    expect(
      AddNoteInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 4,
        origin: 'pack',
        note: { body: 'x' },
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown top-level field (strict)', () => {
    expect(
      AddNoteInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 4,
        note: { body: 'x' },
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe('FocusOptionInputSchema / FocusEvidenceInputSchema', () => {
  it('parses valid focus inputs', () => {
    expect(
      FocusOptionInputSchema.safeParse({ caseId: 'case-1', optionId: 'car-1', expectedSequence: 1 })
        .success,
    ).toBe(true);
    expect(
      FocusEvidenceInputSchema.safeParse({
        caseId: 'case-1',
        evidenceId: 'ev-1',
        expectedSequence: 1,
      }).success,
    ).toBe(true);
  });
});

describe('DefineCaseAttributeInputSchema', () => {
  it('parses a valid case-attribute draft matching sift_define_case_attribute', () => {
    const result = DefineCaseAttributeInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 4,
      definition: {
        id: 'custom.dog_crate_fit',
        label: 'Dog crate fit',
        valueType: 'boolean',
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'constraint',
        reason: 'Two dog crates must fit in the cargo area.',
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
    // `origin` is optional -- omitting it must not fabricate a value.
    expect(result.success && result.data.origin).toBeUndefined();
  });

  it('accepts an explicit origin of "user" or "agent_proposed" (§23 authority distinction)', () => {
    const base = {
      caseId: 'case-1',
      expectedSequence: 4,
      definition: {
        id: 'custom.dog_crate_fit',
        label: 'Dog crate fit',
        valueType: 'boolean',
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'constraint',
        reason: 'Two dog crates must fit in the cargo area.',
      },
    } as const;

    const userResult = DefineCaseAttributeInputSchema.safeParse({ ...base, origin: 'user' });
    expect(userResult.success).toBe(true);
    expect(userResult.success && userResult.data.origin).toBe('user');

    // An agent-originated definition must now ARRIVE WITH ITS VALUES (ADR
    // 0011): a model adding a comparison column has by construction just
    // finished looking, so an empty column from it reads as a dimension the
    // comparison failed to resolve rather than one nobody asked about. The
    // user branch above is deliberately unchanged -- a person adding a
    // concern is asking a question, not answering it.
    const agentResult = DefineCaseAttributeInputSchema.safeParse({
      ...base,
      origin: 'agent_proposed',
      values: [{ optionId: 'car-1', value: { type: 'boolean', value: true }, status: 'asserted' }],
    });
    expect(agentResult.success).toBe(true);
    expect(agentResult.success && agentResult.data.origin).toBe('agent_proposed');
  });

  it('rejects an agent-defined attribute that supplies no values at all -- a column the model never filled in', () => {
    const result = DefineCaseAttributeInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 4,
      origin: 'agent_proposed',
      definition: {
        id: 'custom.dog_crate_fit',
        label: 'Dog crate fit',
        valueType: 'boolean',
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'constraint',
        reason: 'Two dog crates must fit in the cargo area.',
      },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('every option it applies to');
  });

  it('accepts an explicit unknown as an answer, but only with a stated reason', () => {
    // The rule that keeps "required values" from becoming a fabrication
    // incentive: a model that genuinely cannot establish a value says so,
    // and says why. Silence and invention are both unavailable.
    const base = {
      caseId: 'case-1',
      expectedSequence: 4,
      origin: 'agent_proposed',
      definition: {
        id: 'custom.dog_crate_fit',
        label: 'Dog crate fit',
        valueType: 'boolean',
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'constraint',
        reason: 'Two dog crates must fit in the cargo area.',
      },
    } as const;

    const reasoned = DefineCaseAttributeInputSchema.safeParse({
      ...base,
      values: [
        { optionId: 'car-1', status: 'unknown', reason: 'No cargo-width spec is published.' },
      ],
    });
    expect(reasoned.success).toBe(true);

    const unreasoned = DefineCaseAttributeInputSchema.safeParse({
      ...base,
      values: [{ optionId: 'car-1', status: 'unknown' }],
    });
    expect(unreasoned.success).toBe(false);

    // And an unknown may not smuggle a value alongside it.
    const contradictory = DefineCaseAttributeInputSchema.safeParse({
      ...base,
      values: [
        {
          optionId: 'car-1',
          status: 'unknown',
          reason: 'No spec published.',
          value: { type: 'boolean', value: true },
        },
      ],
    });
    expect(contradictory.success).toBe(false);
  });

  it('rejects an origin outside the CaseAttributeOrigin union (e.g. "pack")', () => {
    const result = DefineCaseAttributeInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 4,
      origin: 'pack',
      definition: {
        id: 'custom.dog_crate_fit',
        label: 'Dog crate fit',
        valueType: 'boolean',
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'constraint',
        reason: 'Two dog crates must fit in the cargo area.',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a definition id outside the custom. namespace', () => {
    const result = DefineCaseAttributeInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 4,
      definition: {
        id: 'car.dog_crate_fit',
        label: 'Dog crate fit',
        valueType: 'boolean',
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'constraint',
        reason: 'x',
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('ReviewCaseExtensionInputSchema', () => {
  it('parses confirm and reject decisions', () => {
    expect(
      ReviewCaseExtensionInputSchema.safeParse({
        caseId: 'case-1',
        extensionId: 'ext-1',
        decision: 'confirm',
        expectedSequence: 5,
      }).success,
    ).toBe(true);
    expect(
      ReviewCaseExtensionInputSchema.safeParse({
        caseId: 'case-1',
        extensionId: 'ext-1',
        decision: 'reject',
        reason: 'Not relevant to this household.',
        expectedSequence: 5,
      }).success,
    ).toBe(true);
  });

  it('rejects an unlisted decision', () => {
    expect(
      ReviewCaseExtensionInputSchema.safeParse({
        caseId: 'case-1',
        extensionId: 'ext-1',
        decision: 'approve',
        expectedSequence: 5,
      }).success,
    ).toBe(false);
  });
});

describe('UpdateCriteriaInputSchema', () => {
  it('parses add/remove/reweight/rename operations through the discriminated union', () => {
    const result = UpdateCriteriaInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 6,
      operations: [
        {
          op: 'add',
          criterion: {
            id: 'custom.garage_clearance',
            label: 'Garage clearance',
            kind: 'consideration',
            weight: 20,
            direction: 'target',
            target: { type: 'number', value: 84, unit: 'inch' },
          },
        },
        { op: 'remove', criterionId: 'car.color' },
        { op: 'reweight', criterionId: 'car.budget', weight: 90 },
        { op: 'rename', criterionId: 'car.budget', label: 'Total budget' },
      ],
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects a reweight operation with a non-integer or out-of-range weight', () => {
    expect(
      UpdateCriteriaInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 6,
        operations: [{ op: 'reweight', criterionId: 'car.budget', weight: 150 }],
      }).success,
    ).toBe(false);
  });

  it('rejects an operation with an unlisted op discriminant', () => {
    expect(
      UpdateCriteriaInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 6,
        operations: [{ op: 'replace', criterionId: 'car.budget' }],
      }).success,
    ).toBe(false);
  });
});

describe('SubmitSourceInputSchema', () => {
  it('parses a valid submitted source with claims', () => {
    const result = SubmitSourceInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 7,
      source: {
        url: 'https://example.com/review/civic',
        title: 'Honda Civic review',
        retrievedAt: '2026-08-27T00:00:00.000Z',
        claims: [{ statement: 'Reliable in long-term ownership.', appliesToEntityIds: ['car-1'] }],
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects a source with a malformed url', () => {
    expect(
      SubmitSourceInputSchema.safeParse({
        caseId: 'case-1',
        expectedSequence: 7,
        source: {
          url: 'not-a-url',
          title: 'x',
          retrievedAt: '2026-08-27T00:00:00.000Z',
          claims: [],
        },
      }).success,
    ).toBe(false);
  });

  it('accepts an optional obligationId to link submitted claims to a live obligation (§27/item 5)', () => {
    const result = SubmitSourceInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 7,
      obligationId: 'car.ride_comfort',
      source: {
        url: 'https://example.com/review/cx-50',
        title: 'CX-50 owner forum thread',
        retrievedAt: '2026-08-27T00:00:00.000Z',
        claims: [{ statement: 'Ride is stiff on rough pavement.', appliesToEntityIds: ['car-1'] }],
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
    expect(result.success && result.data.obligationId).toBe('car.ride_comfort');
  });

  it('still parses without obligationId (backward compatible; claims cannot be linked but the source itself persists)', () => {
    const result = SubmitSourceInputSchema.safeParse({
      caseId: 'case-1',
      expectedSequence: 7,
      source: {
        url: 'https://example.com/review/cx-50',
        title: 'CX-50 owner forum thread',
        retrievedAt: '2026-08-27T00:00:00.000Z',
        claims: [{ statement: 'Ride is stiff on rough pavement.', appliesToEntityIds: ['car-1'] }],
      },
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
    expect(result.success && result.data.obligationId).toBeUndefined();
  });
});

describe('SetEvidenceDispositionInputSchema', () => {
  it('parses a valid disposition change', () => {
    expect(
      SetEvidenceDispositionInputSchema.safeParse({
        caseId: 'case-1',
        evidenceId: 'ev-1',
        disposition: 'excluded',
        reason: 'Source is a paid promotional listing.',
        expectedSequence: 8,
      }).success,
    ).toBe(true);
  });

  it('rejects an unlisted disposition', () => {
    expect(
      SetEvidenceDispositionInputSchema.safeParse({
        caseId: 'case-1',
        evidenceId: 'ev-1',
        disposition: 'archived',
        reason: 'x',
        expectedSequence: 8,
      }).success,
    ).toBe(false);
  });
});

describe('RequestInvestigationInputSchema', () => {
  it('parses a request with and without a targeted obligationId', () => {
    expect(
      RequestInvestigationInputSchema.safeParse({ caseId: 'case-1', expectedSequence: 9 }).success,
    ).toBe(true);
    expect(
      RequestInvestigationInputSchema.safeParse({
        caseId: 'case-1',
        obligationId: 'car.household_fit',
        expectedSequence: 9,
      }).success,
    ).toBe(true);
  });
});

describe('RequestRevisionInputSchema', () => {
  it('parses a valid revision request', () => {
    expect(
      RequestRevisionInputSchema.safeParse({
        caseId: 'case-1',
        proposalId: 'proposal-1',
        instructions: 'Re-check the safety comparison before finalizing.',
        expectedSequence: 10,
      }).success,
    ).toBe(true);
  });

  it('rejects a missing instructions field', () => {
    expect(
      RequestRevisionInputSchema.safeParse({
        caseId: 'case-1',
        proposalId: 'proposal-1',
        expectedSequence: 10,
      }).success,
    ).toBe(false);
  });
});

describe('ReviewProposalInputSchema', () => {
  it('structurally accepts both human and agent actors for approve/reject/request_revision decisions', () => {
    for (const actor of ['human', 'agent'] as const) {
      for (const decision of ['approve', 'reject'] as const) {
        expect(
          ReviewProposalInputSchema.safeParse({
            caseId: 'case-1',
            proposalId: 'proposal-1',
            actor,
            decision,
            expectedSequence: 11,
          }).success,
        ).toBe(true);
      }
    }
  });

  it('requires instructions when decision is request_revision', () => {
    expect(
      ReviewProposalInputSchema.safeParse({
        caseId: 'case-1',
        proposalId: 'proposal-1',
        actor: 'human',
        decision: 'request_revision',
        expectedSequence: 11,
      }).success,
    ).toBe(false);
    expect(
      ReviewProposalInputSchema.safeParse({
        caseId: 'case-1',
        proposalId: 'proposal-1',
        actor: 'human',
        decision: 'request_revision',
        instructions: 'Please re-check safety sources.',
        expectedSequence: 11,
      }).success,
    ).toBe(true);
  });
});

describe('GetCaseContextInputSchema / ListPacksInputSchema', () => {
  it('accept only an empty object', () => {
    expect(GetCaseContextInputSchema.safeParse({}).success).toBe(true);
    expect(ListPacksInputSchema.safeParse({}).success).toBe(true);
    expect(GetCaseContextInputSchema.safeParse({ caseId: 'case-1' }).success).toBe(false);
  });
});

describe('CommandReceiptSchema / RunReceiptSchema', () => {
  it('parses a minimal command receipt and a run receipt requiring runId', () => {
    expect(
      CommandReceiptSchema.safeParse({
        commandId: 'cmd-1',
        caseId: 'case-1',
        acceptedSequence: 5,
      }).success,
    ).toBe(true);

    expect(
      RunReceiptSchema.safeParse({ commandId: 'cmd-1', caseId: 'case-1', acceptedSequence: 5 })
        .success,
    ).toBe(false);
    expect(
      RunReceiptSchema.safeParse({
        commandId: 'cmd-1',
        caseId: 'case-1',
        acceptedSequence: 5,
        runId: 'run-1',
      }).success,
    ).toBe(true);
  });
});

describe('SiftToolResultSchema', () => {
  it('parses a successful envelope and an honest failure envelope', () => {
    const DataSchema = z.object({ favoredOptionId: z.string() }).strict();
    const ResultSchema = SiftToolResultSchema(DataSchema);

    expect(
      ResultSchema.safeParse({
        ok: true,
        message: 'Focused evidence updated.',
        data: { favoredOptionId: 'car-1' },
        commandId: 'cmd-1',
        caseId: 'case-1',
        sequence: 12,
        ui: { changed: true, focusTarget: 'evidence-panel' },
      }).success,
    ).toBe(true);

    expect(
      ResultSchema.safeParse({
        ok: false,
        message: 'Case sequence is stale.',
        ui: { changed: false },
        error: { code: 'CONFLICT', retryable: true },
      }).success,
    ).toBe(true);
  });

  it('rejects an unlisted error code', () => {
    const ResultSchema = SiftToolResultSchema(z.unknown());
    expect(
      ResultSchema.safeParse({
        ok: false,
        message: 'x',
        ui: { changed: false },
        error: { code: 'TEAPOT', retryable: false },
      }).success,
    ).toBe(false);
  });
});
