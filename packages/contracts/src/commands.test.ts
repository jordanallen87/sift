import { describe, expect, it } from 'vitest';
import {
  CommandReceiptSchema,
  DefineCaseAttributeInputSchema,
  FocusEvidenceInputSchema,
  FocusOptionInputSchema,
  GetCaseContextInputSchema,
  ListPacksInputSchema,
  PaxToolResultSchema,
  RequestInvestigationInputSchema,
  RequestRevisionInputSchema,
  ReviewCaseExtensionInputSchema,
  ReviewProposalInputSchema,
  RunReceiptSchema,
  SelectPackInputSchema,
  SetEvidenceDispositionInputSchema,
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
  it('parses a valid case-attribute draft matching pax_define_case_attribute', () => {
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

describe('PaxToolResultSchema', () => {
  it('parses a successful envelope and an honest failure envelope', () => {
    const DataSchema = z.object({ favoredOptionId: z.string() }).strict();
    const ResultSchema = PaxToolResultSchema(DataSchema);

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
    const ResultSchema = PaxToolResultSchema(z.unknown());
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
