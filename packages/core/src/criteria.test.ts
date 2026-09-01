import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Criterion } from '@sift/contracts';
import {
  addCriterion,
  criterionNeedsEvidenceQuestion,
  normalizeCriterionWeights,
  removeCriterion,
  renameCriterion,
  reweightCriterion,
  type CriterionAddInput,
  type ExistingEvidenceSignal,
} from './criteria.js';

function criterion(overrides: Partial<Criterion> = {}): Criterion {
  return {
    id: 'price',
    label: 'Total price',
    kind: 'preference',
    weight: 50,
    direction: 'lower_better',
    origin: 'pack',
    status: 'active',
    ...overrides,
  };
}

function addInput(overrides: Partial<CriterionAddInput> = {}): CriterionAddInput {
  return {
    id: 'dog_crate_fit',
    label: 'Dog crate fit',
    kind: 'hard_constraint',
    weight: 80,
    direction: 'qualitative',
    ...overrides,
  };
}

describe('addCriterion', () => {
  it('appends a new criterion with status active', () => {
    const result = addCriterion([], addInput(), 'user');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({
        id: 'dog_crate_fit',
        status: 'active',
        origin: 'user',
      });
    }
  });

  it('rejects a duplicate id', () => {
    const existing = [criterion({ id: 'dog_crate_fit' })];
    const result = addCriterion(existing, addInput(), 'user');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/already exists/);
    }
  });

  it('carries optional target, appliesToAttribute, and question through', () => {
    const result = addCriterion(
      [],
      addInput({
        target: { type: 'number', value: 30000 },
        appliesToAttribute: 'car.advertised_price',
        question: 'What is the out-the-door price?',
      }),
      'pack',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.target).toEqual({ type: 'number', value: 30000 });
      expect(result.value[0]?.appliesToAttribute).toBe('car.advertised_price');
      expect(result.value[0]?.question).toBe('What is the out-the-door price?');
    }
  });

  it('rejects a structurally invalid criterion at the schema layer (e.g. out-of-range weight)', () => {
    const result = addCriterion([], addInput({ weight: 1000 }), 'user');
    expect(result.ok).toBe(false);
  });

  it('does not mutate the input array', () => {
    const existing = [criterion({ id: 'existing' })];
    const result = addCriterion(existing, addInput(), 'user');
    expect(existing).toHaveLength(1);
    expect(result.ok).toBe(true);
  });
});

describe('removeCriterion', () => {
  it('marks a criterion excluded rather than deleting it', () => {
    const criteria = [criterion({ id: 'a' }), criterion({ id: 'b' })];
    const result = removeCriterion(criteria, 'a', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value.find((item) => item.id === 'a')?.status).toBe('excluded');
      expect(result.value.find((item) => item.id === 'b')?.status).toBe('active');
    }
  });

  it('rejects removing a criterion that does not exist', () => {
    const result = removeCriterion([criterion({ id: 'a' })], 'missing', []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/not found/);
    }
  });

  it('rejects removing a protected criterion', () => {
    const result = removeCriterion([criterion({ id: 'safety' })], 'safety', ['safety']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/protected/);
    }
  });

  it('treats removing an already-excluded criterion as an idempotent success', () => {
    const result = removeCriterion([criterion({ id: 'a', status: 'excluded' })], 'a', []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.status).toBe('excluded');
    }
  });
});

describe('renameCriterion', () => {
  it('updates the label and leaves sibling criteria unchanged', () => {
    const siblings = [
      criterion({ id: 'a', label: 'Old' }),
      criterion({ id: 'b', label: 'Untouched' }),
    ];
    const result = renameCriterion(siblings, 'a', 'New label');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.find((item) => item.id === 'a')?.label).toBe('New label');
      expect(result.value.find((item) => item.id === 'b')).toEqual(
        criterion({ id: 'b', label: 'Untouched' }),
      );
    }
  });

  it('rejects renaming a criterion that does not exist', () => {
    const result = renameCriterion([criterion({ id: 'a' })], 'missing', 'New');
    expect(result.ok).toBe(false);
  });

  it('allows renaming a protected criterion (only removal and reweighting are restricted)', () => {
    const result = renameCriterion(
      [criterion({ id: 'safety' })],
      'safety',
      'Renamed safety criterion',
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a structurally invalid rename at the schema layer (e.g. an over-length label)', () => {
    const result = renameCriterion([criterion({ id: 'a' })], 'a', 'x'.repeat(201));
    expect(result.ok).toBe(false);
  });

  it('rejects a root-level schema violation (a stored criterion carrying an unrecognized field), falling back to a "criterion" label', () => {
    const corrupted = {
      ...criterion({ id: 'a' }),
      bogusExtraField: 'nope',
    } as unknown as Criterion;
    const result = renameCriterion([corrupted], 'a', 'New label');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/^criterion: /);
    }
  });
});

describe('reweightCriterion', () => {
  it('updates the weight and leaves sibling criteria unchanged', () => {
    const siblings = [criterion({ id: 'a', weight: 10 }), criterion({ id: 'b', weight: 40 })];
    const result = reweightCriterion(siblings, 'a', 90, {
      protectedCriterionIds: [],
      allowProtectedReweight: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.find((item) => item.id === 'a')?.weight).toBe(90);
      expect(result.value.find((item) => item.id === 'b')).toEqual(
        criterion({ id: 'b', weight: 40 }),
      );
    }
  });

  it('rejects reweighting a criterion that does not exist', () => {
    const result = reweightCriterion([criterion({ id: 'a' })], 'missing', 50, {
      protectedCriterionIds: [],
      allowProtectedReweight: false,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects reweighting a protected criterion by default', () => {
    const result = reweightCriterion([criterion({ id: 'safety' })], 'safety', 50, {
      protectedCriterionIds: ['safety'],
      allowProtectedReweight: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/protected/);
    }
  });

  it('allows reweighting a protected criterion when explicitly permitted', () => {
    const result = reweightCriterion([criterion({ id: 'safety', weight: 10 })], 'safety', 60, {
      protectedCriterionIds: ['safety'],
      allowProtectedReweight: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.weight).toBe(60);
    }
  });

  it('rejects a structurally invalid weight at the schema layer (out of 0-100 range)', () => {
    const result = reweightCriterion([criterion({ id: 'a' })], 'a', -5, {
      protectedCriterionIds: [],
      allowProtectedReweight: false,
    });
    expect(result.ok).toBe(false);
  });

  it('property: a protected criterion can never be removed or reweighted without explicit permission', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (initialWeight, newWeight) => {
          const criteria = [criterion({ id: 'protected-one', weight: initialWeight })];
          const removeResult = removeCriterion(criteria, 'protected-one', ['protected-one']);
          expect(removeResult.ok).toBe(false);

          const reweightResult = reweightCriterion(criteria, 'protected-one', newWeight, {
            protectedCriterionIds: ['protected-one'],
            allowProtectedReweight: false,
          });
          expect(reweightResult.ok).toBe(false);

          // The original criterion is untouched by either rejected attempt.
          expect(criteria[0]).toEqual(criterion({ id: 'protected-one', weight: initialWeight }));
        },
      ),
      { seed: 6, numRuns: 100 },
    );
  });
});

describe('normalizeCriterionWeights', () => {
  it('normalizes active criteria weights to sum to 1', () => {
    const result = normalizeCriterionWeights([
      criterion({ id: 'a', weight: 25 }),
      criterion({ id: 'b', weight: 75 }),
    ]);
    expect(result).toEqual([
      { criterionId: 'a', weight: 0.25 },
      { criterionId: 'b', weight: 0.75 },
    ]);
  });

  it('excludes non-active criteria entirely', () => {
    const result = normalizeCriterionWeights([
      criterion({ id: 'a', weight: 25 }),
      criterion({ id: 'b', weight: 75, status: 'excluded' }),
    ]);
    expect(result).toEqual([{ criterionId: 'a', weight: 1 }]);
  });

  it('returns an equal split when every active criterion has weight zero', () => {
    const result = normalizeCriterionWeights([
      criterion({ id: 'a', weight: 0 }),
      criterion({ id: 'b', weight: 0 }),
      criterion({ id: 'c', weight: 0 }),
    ]);
    expect(result).toEqual([
      { criterionId: 'a', weight: 1 / 3 },
      { criterionId: 'b', weight: 1 / 3 },
      { criterionId: 'c', weight: 1 / 3 },
    ]);
  });

  it('returns an empty array when there are no active criteria', () => {
    expect(normalizeCriterionWeights([])).toEqual([]);
    expect(normalizeCriterionWeights([criterion({ status: 'excluded' })])).toEqual([]);
  });

  it('property: normalized weights are always finite and sum to one when at least one criterion has positive weight', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.uuid(), weight: fc.integer({ min: 0, max: 100 }) }), {
          minLength: 1,
          maxLength: 20,
        }),
        (specs) => {
          const criteria = specs.map((spec) => criterion({ id: spec.id, weight: spec.weight }));
          const result = normalizeCriterionWeights(criteria);
          const sum = result.reduce((total, entry) => total + entry.weight, 0);

          for (const entry of result) {
            expect(Number.isFinite(entry.weight)).toBe(true);
          }
          expect(result).toHaveLength(criteria.length);
          expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
        },
      ),
      { seed: 7, numRuns: 200 },
    );
  });
});

function evidence(overrides: Partial<ExistingEvidenceSignal> = {}): ExistingEvidenceSignal {
  return { attributeDefinitionId: 'car.advertised_price', hasSourcedValue: true, ...overrides };
}

describe('criterionNeedsEvidenceQuestion', () => {
  it('returns false for a consideration-kind criterion', () => {
    expect(criterionNeedsEvidenceQuestion(criterion({ kind: 'consideration' }), [])).toBe(false);
  });

  it('returns false for an excluded criterion', () => {
    expect(
      criterionNeedsEvidenceQuestion(
        criterion({ kind: 'hard_constraint', status: 'excluded' }),
        [],
      ),
    ).toBe(false);
  });

  it('returns true for a hard_constraint or preference criterion with no linked attribute', () => {
    expect(
      criterionNeedsEvidenceQuestion(
        criterion({ kind: 'hard_constraint', appliesToAttribute: undefined }),
        [],
      ),
    ).toBe(true);
    expect(
      criterionNeedsEvidenceQuestion(
        criterion({ kind: 'preference', appliesToAttribute: undefined }),
        [],
      ),
    ).toBe(true);
  });

  it('returns false when a sourced value already exists for the linked attribute', () => {
    const withAttribute = criterion({
      kind: 'preference',
      appliesToAttribute: 'car.advertised_price',
    });
    expect(
      criterionNeedsEvidenceQuestion(withAttribute, [evidence({ hasSourcedValue: true })]),
    ).toBe(false);
  });

  it('returns true when the linked attribute has no sourced value yet', () => {
    const withAttribute = criterion({
      kind: 'preference',
      appliesToAttribute: 'car.advertised_price',
    });
    expect(
      criterionNeedsEvidenceQuestion(withAttribute, [evidence({ hasSourcedValue: false })]),
    ).toBe(true);
  });

  it('returns true when no evidence signal matches the linked attribute at all', () => {
    const withAttribute = criterion({
      kind: 'hard_constraint',
      appliesToAttribute: 'car.advertised_price',
    });
    expect(
      criterionNeedsEvidenceQuestion(withAttribute, [
        evidence({ attributeDefinitionId: 'car.mileage' }),
      ]),
    ).toBe(true);
  });
});

describe('renameCriterion protection (ADR 0011)', () => {
  it('rejects renaming a pack-protected criterion -- the label is the only thing identifying it to a person', () => {
    // The gap this closes: `remove` and `reweight` both refused a protected
    // criterion while `rename` did not, which made the protection largely
    // cosmetic. A caller could not delete or down-weight a pack's mandatory
    // criterion, but could relabel it to anything -- and since the id never
    // reaches the consumer surface, that reads as a substitution.
    const result = renameCriterion([criterion({ id: 'price' })], 'price', 'Nice to have', {
      protectedCriterionIds: ['price'],
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.join(' ')).toContain('may not be renamed');
  });

  it('allows renaming an unprotected criterion when other criteria are protected', () => {
    const result = renameCriterion(
      [criterion({ id: 'price' }), criterion({ id: 'custom.dog_crate_fit' })],
      'custom.dog_crate_fit',
      'Dog crate fit (both crates)',
      { protectedCriterionIds: ['price'] },
    );
    expect(result.ok).toBe(true);
  });

  it('defaults to no protection when the caller supplies no options, keeping every existing caller byte-identical', () => {
    const result = renameCriterion([criterion({ id: 'price' })], 'price', 'Renamed');
    expect(result.ok).toBe(true);
  });
});
