import { describe, expect, it } from 'vitest';
import {
  CASE_EXTENSION_REVIEW_DECISIONS,
  CaseExtensionReviewDecisionSchema,
  CaseExtensionSchema,
  CaseExtensionSummarySchema,
} from './extensions.js';

function validDefinition() {
  return {
    id: 'custom.dog_crate_fit' as const,
    label: 'Dog crate fit',
    valueType: 'boolean' as const,
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'assertion' as const,
    comparison: 'constraint' as const,
    sensitive: false,
    origin: 'user' as const,
    reason: 'Two dog crates must fit in the cargo area.',
    confirmation: 'pending' as const,
    proposedBy: 'user-123',
    createdAt: '2026-08-27T00:00:00.000Z',
  };
}

describe('CaseExtensionSchema', () => {
  it('parses a pending, agent-proposed extension with no downstream links yet', () => {
    const result = CaseExtensionSchema.safeParse({
      id: 'ext-1',
      caseId: 'case-1',
      definition: { ...validDefinition(), origin: 'agent_proposed', confirmation: 'pending' },
      createdAt: '2026-08-27T00:00:00.000Z',
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('parses a confirmed extension carrying its linked criterion and obligation ids', () => {
    const result = CaseExtensionSchema.safeParse({
      id: 'ext-1',
      caseId: 'case-1',
      definition: { ...validDefinition(), confirmation: 'confirmed' },
      linkedCriterionId: 'custom.dog_crate_fit',
      linkedObligationId: 'case.case-1.dog-crate-fit',
      createdAt: '2026-08-27T00:00:00.000Z',
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an extension whose definition is invalid (id outside the custom. namespace)', () => {
    const result = CaseExtensionSchema.safeParse({
      id: 'ext-1',
      caseId: 'case-1',
      definition: { ...validDefinition(), id: 'car.dog_crate_fit' },
      createdAt: '2026-08-27T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized top-level key', () => {
    const result = CaseExtensionSchema.safeParse({
      id: 'ext-1',
      caseId: 'case-1',
      definition: validDefinition(),
      createdAt: '2026-08-27T00:00:00.000Z',
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('CaseExtensionSummarySchema', () => {
  it('parses a valid compact summary suitable for Context Injector', () => {
    const result = CaseExtensionSummarySchema.safeParse({
      id: 'custom.dog_crate_fit',
      label: 'Dog crate fit',
      valueType: 'boolean',
      reason: 'Two dog crates must fit in the cargo area.',
      origin: 'user',
      confirmation: 'pending',
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects executable-looking content in the reason field', () => {
    const result = CaseExtensionSummarySchema.safeParse({
      id: 'custom.dog_crate_fit',
      label: 'Dog crate fit',
      valueType: 'boolean',
      reason: '<img src=x onerror="steal()">',
      origin: 'user',
      confirmation: 'pending',
    });
    expect(result.success).toBe(false);
  });
});

describe('CaseExtensionReviewDecisionSchema', () => {
  it('accepts exactly the confirm/reject vocabulary', () => {
    expect(CASE_EXTENSION_REVIEW_DECISIONS).toEqual(['confirm', 'reject']);
    for (const decision of CASE_EXTENSION_REVIEW_DECISIONS) {
      expect(CaseExtensionReviewDecisionSchema.safeParse(decision).success).toBe(true);
    }
  });

  it('rejects an unlisted decision', () => {
    expect(CaseExtensionReviewDecisionSchema.safeParse('approve').success).toBe(false);
  });
});
