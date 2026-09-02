import { describe, expect, it } from 'vitest';
import {
  AttributeDefinitionSchema,
  AttributeRecordSchema,
  AttributeValueSchema,
  BooleanAttributeValueSchema,
  CaseAttributeDefinitionSchema,
  CriterionSchema,
  DateAttributeValueSchema,
  DurationAttributeValueSchema,
  EnumAttributeValueSchema,
  MoneyAttributeValueSchema,
  NumberAttributeValueSchema,
  RangeAttributeValueSchema,
  StringAttributeValueSchema,
  StringListAttributeValueSchema,
  TextAttributeValueSchema,
} from './attributes.js';

describe('AttributeValueSchema variants', () => {
  it('parses a valid string value', () => {
    const result = StringAttributeValueSchema.safeParse({ type: 'string', value: 'Honda Civic' });
    expect(result.success).toBe(true);
  });

  it('parses a valid text value', () => {
    const result = TextAttributeValueSchema.safeParse({
      type: 'text',
      value: 'Long-form notes about the listing.',
    });
    expect(result.success).toBe(true);
  });

  it('parses a valid number value with an optional unit', () => {
    const result = NumberAttributeValueSchema.safeParse({ type: 'number', value: 42, unit: 'mpg' });
    expect(result.success).toBe(true);
  });

  it('rejects a number value that is NaN or infinite', () => {
    expect(
      NumberAttributeValueSchema.safeParse({ type: 'number', value: Number.NaN }).success,
    ).toBe(false);
    expect(
      NumberAttributeValueSchema.safeParse({ type: 'number', value: Number.POSITIVE_INFINITY })
        .success,
    ).toBe(false);
  });

  it('parses a valid money value and rejects a non-ISO currency code', () => {
    const valid = MoneyAttributeValueSchema.safeParse({
      type: 'money',
      amount: 24999,
      currency: 'USD',
      cadence: 'one_time',
    });
    expect(valid.success).toBe(true);

    const invalid = MoneyAttributeValueSchema.safeParse({
      type: 'money',
      amount: 24999,
      currency: 'us-dollars',
    });
    expect(invalid.success).toBe(false);
  });

  it('parses a valid boolean value', () => {
    expect(BooleanAttributeValueSchema.safeParse({ type: 'boolean', value: true }).success).toBe(
      true,
    );
  });

  it('parses a valid ISO date value and rejects a non-date string', () => {
    expect(DateAttributeValueSchema.safeParse({ type: 'date', value: '2026-08-27' }).success).toBe(
      true,
    );
    expect(DateAttributeValueSchema.safeParse({ type: 'date', value: 'not-a-date' }).success).toBe(
      false,
    );
  });

  it('parses a valid duration and rejects an unlisted unit', () => {
    expect(
      DurationAttributeValueSchema.safeParse({ type: 'duration', amount: 5, unit: 'year' }).success,
    ).toBe(true);
    expect(
      DurationAttributeValueSchema.safeParse({ type: 'duration', amount: 5, unit: 'decade' })
        .success,
    ).toBe(false);
  });

  it('parses a valid enum value with optional allowedValues', () => {
    const result = EnumAttributeValueSchema.safeParse({
      type: 'enum',
      value: 'severe',
      allowedValues: ['none', 'mild', 'severe'],
    });
    expect(result.success).toBe(true);
  });

  it('parses a valid range and rejects minimum greater than maximum', () => {
    expect(
      RangeAttributeValueSchema.safeParse({ type: 'range', minimum: 1, maximum: 10, unit: 'inch' })
        .success,
    ).toBe(true);
    expect(
      RangeAttributeValueSchema.safeParse({ type: 'range', minimum: 10, maximum: 1 }).success,
    ).toBe(false);
  });

  it('parses a valid string_list value and rejects an oversized list', () => {
    expect(
      StringListAttributeValueSchema.safeParse({ type: 'string_list', values: ['a', 'b'] }).success,
    ).toBe(true);
    expect(
      StringListAttributeValueSchema.safeParse({
        type: 'string_list',
        values: Array.from({ length: 51 }, (_, i) => `v${i}`),
      }).success,
    ).toBe(false);
  });

  it('round-trips every AttributeValue variant through the discriminated union', () => {
    const samples: unknown[] = [
      { type: 'string', value: 'a' },
      { type: 'text', value: 'a longer note' },
      { type: 'number', value: 12, unit: 'mi' },
      { type: 'money', amount: 100, currency: 'USD', cadence: 'monthly' },
      { type: 'boolean', value: false },
      { type: 'date', value: '2026-01-01' },
      { type: 'duration', amount: 3, unit: 'month' },
      { type: 'enum', value: 'x', allowedValues: ['x', 'y'] },
      { type: 'range', minimum: 0, maximum: 5 },
      { type: 'string_list', values: ['x', 'y'] },
    ];

    for (const sample of samples) {
      const result = AttributeValueSchema.safeParse(sample);
      expect(result.success, `expected ${JSON.stringify(sample)} to parse`).toBe(true);
      if (result.success) {
        expect(AttributeValueSchema.safeParse(result.data).success).toBe(true);
      }
    }
  });

  it('rejects an unknown discriminant tag', () => {
    expect(AttributeValueSchema.safeParse({ type: 'currency', value: 'nope' }).success).toBe(false);
  });

  it('rejects arbitrary functions and class instances as attribute values', () => {
    expect(AttributeValueSchema.safeParse({ type: 'string', value: () => 'x' }).success).toBe(
      false,
    );
    expect(AttributeValueSchema.safeParse({ type: 'string', value: new Date() }).success).toBe(
      false,
    );
    expect(AttributeValueSchema.safeParse({ type: 'number', value: new Number(5) }).success).toBe(
      false,
    );
  });

  it('rejects HTML/executable-looking text in string and text values', () => {
    expect(
      AttributeValueSchema.safeParse({ type: 'string', value: '<script>alert(1)</script>' })
        .success,
    ).toBe(false);
    expect(
      AttributeValueSchema.safeParse({
        type: 'text',
        value: 'click me: javascript:alert(document.cookie)',
      }).success,
    ).toBe(false);
    // Ordinary text using "<" as a comparator must still be accepted.
    expect(AttributeValueSchema.safeParse({ type: 'string', value: 'price < 20000' }).success).toBe(
      true,
    );
  });

  it('rejects unrecognized extra keys on a variant object', () => {
    expect(
      StringAttributeValueSchema.safeParse({ type: 'string', value: 'a', extra: true }).success,
    ).toBe(false);
  });
});

describe('AttributeRecordSchema', () => {
  const base = {
    definitionId: 'car.advertised_price',
    label: 'Advertised price',
    origin: 'agent_proposed' as const,
    sourceIds: ['src-1'],
    status: 'asserted' as const,
    updatedAt: '2026-08-27T00:00:00.000Z',
  };

  it('requires value to be present for asserted/supported/verified/conflicted status', () => {
    for (const status of ['asserted', 'supported', 'verified', 'conflicted'] as const) {
      const withoutValue = AttributeRecordSchema.safeParse({ ...base, status });
      expect(withoutValue.success, `${status} without value should fail`).toBe(false);

      const withValue = AttributeRecordSchema.safeParse({
        ...base,
        status,
        value: { type: 'money', amount: 24999, currency: 'USD' },
      });
      expect(withValue.success, `${status} with value should pass`).toBe(true);
    }
  });

  it('requires value to be absent for unknown status', () => {
    const withoutValue = AttributeRecordSchema.safeParse({ ...base, status: 'unknown' });
    expect(withoutValue.success).toBe(true);

    const withValue = AttributeRecordSchema.safeParse({
      ...base,
      status: 'unknown',
      value: { type: 'string', value: 'placeholder' },
    });
    expect(withValue.success).toBe(false);
  });

  it('rejects an out-of-range confidence', () => {
    expect(
      AttributeRecordSchema.safeParse({
        ...base,
        status: 'asserted',
        value: { type: 'string', value: 'x' },
        confidence: 1.5,
      }).success,
    ).toBe(false);
  });
});

describe('AttributeDefinitionSchema', () => {
  it('parses a valid pack attribute definition', () => {
    const result = AttributeDefinitionSchema.safeParse({
      id: 'car.advertised_price',
      label: 'Advertised price',
      valueType: 'money',
      required: true,
      appliesTo: ['car'],
      evidenceExpectation: 'source',
      comparison: 'lower_better',
      sensitive: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid valueType', () => {
    const result = AttributeDefinitionSchema.safeParse({
      id: 'car.advertised_price',
      label: 'Advertised price',
      valueType: 'currency',
      required: true,
      appliesTo: ['car'],
      evidenceExpectation: 'source',
      comparison: 'lower_better',
      sensitive: false,
    });
    expect(result.success).toBe(false);
  });
});

describe('CaseAttributeDefinitionSchema', () => {
  const validCaseDefinition = {
    id: 'custom.dog_crate_fit',
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

  it('parses a valid case-defined attribute under the custom. namespace', () => {
    expect(CaseAttributeDefinitionSchema.safeParse(validCaseDefinition).success).toBe(true);
  });

  it('rejects an id outside the custom. namespace', () => {
    expect(
      CaseAttributeDefinitionSchema.safeParse({ ...validCaseDefinition, id: 'car.custom_thing' })
        .success,
    ).toBe(false);
  });

  it('rejects an id with unsafe characters after the custom. prefix', () => {
    expect(
      CaseAttributeDefinitionSchema.safeParse({
        ...validCaseDefinition,
        id: 'custom.<script>',
      }).success,
    ).toBe(false);
  });
});

describe('CriterionSchema', () => {
  it('parses a valid pack criterion', () => {
    const result = CriterionSchema.safeParse({
      id: 'car.budget',
      label: 'Stay within budget',
      kind: 'hard_constraint',
      weight: 100,
      direction: 'lower_better',
      origin: 'pack',
      status: 'active',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-integer or out-of-range weight', () => {
    expect(
      CriterionSchema.safeParse({
        id: 'car.budget',
        label: 'Stay within budget',
        kind: 'preference',
        weight: 50.5,
        direction: 'lower_better',
        origin: 'pack',
        status: 'active',
      }).success,
    ).toBe(false);

    expect(
      CriterionSchema.safeParse({
        id: 'car.budget',
        label: 'Stay within budget',
        kind: 'preference',
        weight: 101,
        direction: 'lower_better',
        origin: 'pack',
        status: 'active',
      }).success,
    ).toBe(false);
  });

  it('accepts an agent-proposed criterion carrying a target value and question', () => {
    const result = CriterionSchema.safeParse({
      id: 'custom.garage_clearance',
      label: 'Garage clearance',
      kind: 'consideration',
      weight: 20,
      direction: 'target',
      target: { type: 'number', value: 84, unit: 'inch' },
      appliesToAttribute: 'custom.garage_clearance',
      question: 'Does the vehicle clear our garage door opener?',
      origin: 'agent_proposed',
      status: 'active',
    });
    expect(result.success).toBe(true);
  });
});

describe('AttributeRecordSchema: value provenance', () => {
  const record = {
    definitionId: 'car.cargo_width_in',
    label: 'Cargo width',
    value: { type: 'number' as const, value: 43.2, unit: 'in' },
    origin: 'pack' as const,
    sourceIds: [],
    status: 'asserted' as const,
    updatedAt: '2026-09-02T00:00:00.000Z',
  };

  it('still parses a record that states no provenance', () => {
    expect(AttributeRecordSchema.safeParse(record).success).toBe(true);
  });

  it('labels a curated demo value as curated', () => {
    // The hero cohort enriches EPA records with decision-relevant fields the
    // EPA source does not carry. The pane has to be able to say which is
    // which, so the distinction lives on the record rather than in a
    // convention about which ids happen to be curated.
    const result = AttributeRecordSchema.safeParse({ ...record, provenance: 'curated_demo' });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('labels a value measured in the bundled catalog as catalog-derived', () => {
    expect(AttributeRecordSchema.safeParse({ ...record, provenance: 'catalog' }).success).toBe(
      true,
    );
  });

  it('rejects a provenance outside the vocabulary', () => {
    expect(AttributeRecordSchema.safeParse({ ...record, provenance: 'live_dealer' }).success).toBe(
      false,
    );
  });
});
