import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CaseAttributeDefinition, CaseExtension } from '@sift/contracts';
import {
  createCaseAttributeDefinition,
  createCaseExtension,
  defineCaseExtension,
  isConfirmedExtension,
  reviewCaseExtension,
  toCaseExtensionSummary,
  type CaseAttributeDraft,
  type CreateCaseAttributeDefinitionContext,
} from './extensions.js';
import type { Clock, IdGenerator } from './attributes.js';

const FIXED_NOW = '2026-08-27T12:00:00.000Z';

function fixedClock(now = FIXED_NOW): Clock {
  return { now: () => now };
}

function sequentialIdGenerator(start = 0): IdGenerator {
  let counter = start;
  return {
    next: (prefix) => {
      counter += 1;
      return `${prefix ?? 'id'}-${counter}`;
    },
  };
}

function draft(overrides: Partial<CaseAttributeDraft> = {}): CaseAttributeDraft {
  return {
    id: 'custom.dog_crate_fit',
    label: 'Dog crate fit',
    valueType: 'boolean',
    appliesTo: ['car'],
    evidenceExpectation: 'assertion',
    comparison: 'none',
    reason: 'Two dog crates must fit in the trunk.',
    ...overrides,
  };
}

function context(
  overrides: Partial<CreateCaseAttributeDefinitionContext> = {},
): CreateCaseAttributeDefinitionContext {
  return {
    origin: 'user',
    proposedBy: 'user-123',
    existingAttributeIds: [],
    ...overrides,
  };
}

describe('createCaseAttributeDefinition', () => {
  it('creates a confirmed definition for user origin', () => {
    const result = createCaseAttributeDefinition(
      draft(),
      context({ origin: 'user' }),
      fixedClock(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confirmation).toBe('confirmed');
      expect(result.value.origin).toBe('user');
      expect(result.value.required).toBe(false);
      expect(result.value.sensitive).toBe(false);
      expect(result.value.createdAt).toBe(FIXED_NOW);
      expect(result.value.id).toBe('custom.dog_crate_fit');
    }
  });

  it('creates a pending definition for agent_proposed origin', () => {
    const result = createCaseAttributeDefinition(
      draft(),
      context({ origin: 'agent_proposed', proposedBy: 'agent-household-fit' }),
      fixedClock(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confirmation).toBe('pending');
      expect(result.value.origin).toBe('agent_proposed');
      expect(result.value.proposedBy).toBe('agent-household-fit');
    }
  });

  it('rejects an id that is not custom.-prefixed', () => {
    const result = createCaseAttributeDefinition(
      draft({ id: 'car.dog_crate_fit' }),
      context(),
      fixedClock(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/must start with "custom\."/);
    }
  });

  it('rejects a duplicate id', () => {
    const result = createCaseAttributeDefinition(
      draft(),
      context({ existingAttributeIds: ['custom.dog_crate_fit'] }),
      fixedClock(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/already defined/);
    }
  });

  it('rejects an unsupported value type', () => {
    const result = createCaseAttributeDefinition(
      draft({ valueType: 'not_a_real_type' as unknown as CaseAttributeDraft['valueType'] }),
      context(),
      fixedClock(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/not a supported attribute value type/);
    }
  });

  it('carries an optional unit through when provided', () => {
    const result = createCaseAttributeDefinition(
      draft({ valueType: 'number', unit: 'inch' }),
      context(),
      fixedClock(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.unit).toBe('inch');
    }
  });

  it('carries allowedValues through when provided', () => {
    const result = createCaseAttributeDefinition(
      draft({ valueType: 'enum', allowedValues: ['none', 'mild', 'severe'] }),
      context(),
      fixedClock(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.allowedValues).toEqual(['none', 'mild', 'severe']);
    }
  });

  it('rejects a structurally invalid draft at the schema layer (e.g. an over-length label)', () => {
    const result = createCaseAttributeDefinition(
      draft({ label: 'x'.repeat(201) }),
      context(),
      fixedClock(),
    );
    expect(result.ok).toBe(false);
  });

  it('property: user origin always yields confirmed, agent_proposed always yields pending', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'user' | 'agent_proposed'>('user', 'agent_proposed'),
        (origin) => {
          const result = createCaseAttributeDefinition(draft(), context({ origin }), fixedClock());
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.value.confirmation).toBe(origin === 'user' ? 'confirmed' : 'pending');
          }
        },
      ),
      { seed: 4, numRuns: 50 },
    );
  });
});

function validDefinition(
  overrides: Partial<CaseAttributeDefinition> = {},
): CaseAttributeDefinition {
  const result = createCaseAttributeDefinition(
    draft(),
    context(overrides.origin ? { origin: overrides.origin } : {}),
    fixedClock(),
  );
  if (!result.ok) {
    throw new Error('test setup failure: expected a valid definition');
  }
  return { ...result.value, ...overrides };
}

describe('createCaseExtension', () => {
  it('wraps a definition with a generated id, caseId, and createdAt', () => {
    const definition = validDefinition();
    const result = createCaseExtension(definition, 'case-1', sequentialIdGenerator(), fixedClock());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('ext-1');
      expect(result.value.caseId).toBe('case-1');
      expect(result.value.definition).toEqual(definition);
      expect(result.value.createdAt).toBe(FIXED_NOW);
      expect(result.value.linkedCriterionId).toBeUndefined();
      expect(result.value.linkedObligationId).toBeUndefined();
    }
  });

  it('rejects assembling an extension around a structurally invalid caseId', () => {
    const definition = validDefinition();
    const result = createCaseExtension(
      definition,
      'not a valid case id!',
      sequentialIdGenerator(),
      fixedClock(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/caseId/);
    }
  });
});

describe('defineCaseExtension', () => {
  it('composes definition creation and extension wrapping in one call', () => {
    const result = defineCaseExtension(
      draft(),
      { ...context(), caseId: 'case-1' },
      { clock: fixedClock(), idGenerator: sequentialIdGenerator() },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.caseId).toBe('case-1');
      expect(result.value.definition.id).toBe('custom.dog_crate_fit');
      expect(result.value.definition.createdAt).toBe(FIXED_NOW);
      expect(result.value.createdAt).toBe(FIXED_NOW);
    }
  });

  it('propagates a definition-creation failure without generating an extension id', () => {
    const idGenerator = sequentialIdGenerator();
    const result = defineCaseExtension(
      draft({ id: 'not-custom-prefixed' }),
      { ...context(), caseId: 'case-1' },
      { clock: fixedClock(), idGenerator },
    );
    expect(result.ok).toBe(false);
    // No id should have been consumed for the never-created extension.
    expect(idGenerator.next('ext')).toBe('ext-1');
  });
});

function validExtension(
  confirmation: CaseAttributeDefinition['confirmation'] = 'pending',
): CaseExtension {
  const definition = validDefinition({
    origin: confirmation === 'pending' ? 'agent_proposed' : 'user',
  });
  const withConfirmation: CaseAttributeDefinition = { ...definition, confirmation };
  const result = createCaseExtension(
    withConfirmation,
    'case-1',
    sequentialIdGenerator(),
    fixedClock(),
  );
  if (!result.ok) {
    throw new Error('test setup failure: expected a valid extension');
  }
  return result.value;
}

describe('isConfirmedExtension', () => {
  it('is true only when the definition confirmation is "confirmed"', () => {
    expect(isConfirmedExtension(validExtension('confirmed'))).toBe(true);
    expect(isConfirmedExtension(validExtension('pending'))).toBe(false);
    expect(isConfirmedExtension(validExtension('rejected'))).toBe(false);
  });
});

describe('reviewCaseExtension', () => {
  it('confirms a pending extension', () => {
    const result = reviewCaseExtension(validExtension('pending'), 'confirm');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.definition.confirmation).toBe('confirmed');
    }
  });

  it('rejects a pending extension', () => {
    const result = reviewCaseExtension(validExtension('pending'), 'reject');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.definition.confirmation).toBe('rejected');
    }
  });

  it('refuses to review an extension that is not pending', () => {
    const alreadyConfirmed = reviewCaseExtension(validExtension('confirmed'), 'confirm');
    expect(alreadyConfirmed.ok).toBe(false);
    if (!alreadyConfirmed.ok) {
      expect(alreadyConfirmed.errors[0]).toMatch(/not pending review/);
    }

    const alreadyRejected = reviewCaseExtension(validExtension('rejected'), 'reject');
    expect(alreadyRejected.ok).toBe(false);
  });

  it('rejects reviewing an extension that is already structurally invalid for another reason', () => {
    // A defense-in-depth case: the extension passed in was not built through
    // `createCaseExtension` and is already invalid (empty `id`), so the
    // final `CaseExtensionSchema.safeParse` defense-in-depth check in
    // `reviewCaseExtension` catches it even though the confirmation gate
    // itself passes.
    const definition = validDefinition({ origin: 'agent_proposed', confirmation: 'pending' });
    const invalidExtension = {
      id: '',
      caseId: 'case-1',
      definition,
      createdAt: FIXED_NOW,
    } as unknown as CaseExtension;

    const result = reviewCaseExtension(invalidExtension, 'confirm');
    expect(result.ok).toBe(false);
  });

  it('rejects a root-level schema violation (an extension carrying an unrecognized field), falling back to an "extension" label', () => {
    const pending = validExtension('pending');
    const corrupted = { ...pending, bogusExtraField: 'nope' } as unknown as CaseExtension;
    const result = reviewCaseExtension(corrupted, 'confirm');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/^extension: /);
    }
  });

  it('property: reviewing a pending extension never fails, and always sets the requested decision', () => {
    fc.assert(
      fc.property(fc.constantFrom<'confirm' | 'reject'>('confirm', 'reject'), (decision) => {
        const result = reviewCaseExtension(validExtension('pending'), decision);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.definition.confirmation).toBe(
            decision === 'confirm' ? 'confirmed' : 'rejected',
          );
        }
      }),
      { seed: 5, numRuns: 20 },
    );
  });
});

describe('toCaseExtensionSummary', () => {
  it('projects the definition id, not the extension wrapper id', () => {
    const extension = validExtension('confirmed');
    const summary = toCaseExtensionSummary(extension);
    expect(summary).toEqual({
      id: extension.definition.id,
      label: extension.definition.label,
      valueType: extension.definition.valueType,
      reason: extension.definition.reason,
      origin: extension.definition.origin,
      confirmation: extension.definition.confirmation,
    });
    expect(summary.id).not.toBe(extension.id);
  });
});
