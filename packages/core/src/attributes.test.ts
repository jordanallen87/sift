import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AttributeValueSchema,
  type AttributeDefinition,
  type AttributeValue,
} from '@sift/contracts';
import {
  attributeValueStatusInvariantError,
  compareAttributeValues,
  createAttributeRecord,
  fail,
  normalizeAttributeValue,
  ok,
  type Clock,
} from './attributes.js';

const FIXED_NOW = '2026-08-27T12:00:00.000Z';

function fixedClock(now = FIXED_NOW): Clock {
  return { now: () => now };
}

function definition(overrides: Partial<AttributeDefinition> = {}): AttributeDefinition {
  return {
    id: 'car.advertised_price',
    label: 'Advertised price',
    valueType: 'number',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'source',
    comparison: 'lower_better',
    sensitive: false,
    ...overrides,
  };
}

// A charset guaranteed not to trip the contracts HTML/executable guard, for
// generating arbitrary *valid* strings in property tests below.
const safeText = () =>
  fc
    .array(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_'.split(''),
      ),
      {
        minLength: 1,
        maxLength: 30,
      },
    )
    .map((characters) => characters.join(''));

describe('ok / fail helpers', () => {
  it('wraps a value as a success result', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it('wraps zero or more errors as a failure result', () => {
    expect(fail('bad')).toEqual({ ok: false, errors: ['bad'] });
    expect(fail('a', 'b')).toEqual({ ok: false, errors: ['a', 'b'] });
  });
});

describe('normalizeAttributeValue', () => {
  it('normalizes a bare number primitive', () => {
    const result = normalizeAttributeValue(definition(), 42);
    expect(result).toEqual(ok({ type: 'number', value: 42 }));
  });

  it('normalizes an object payload for a number attribute', () => {
    const result = normalizeAttributeValue(definition(), { value: 42, unit: 'mpg' });
    expect(result).toEqual(ok({ type: 'number', value: 42, unit: 'mpg' }));
  });

  it('normalizes a bare string primitive for a string attribute', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'string' }), 'Honda Civic');
    expect(result).toEqual(ok({ type: 'string', value: 'Honda Civic' }));
  });

  it('normalizes a bare string primitive for a text attribute', () => {
    const result = normalizeAttributeValue(
      definition({ valueType: 'text' }),
      'Notes about the car.',
    );
    expect(result).toEqual(ok({ type: 'text', value: 'Notes about the car.' }));
  });

  it('normalizes a bare string primitive for a date attribute', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'date' }), '2026-08-27');
    expect(result).toEqual(ok({ type: 'date', value: '2026-08-27' }));
  });

  it('normalizes a bare string primitive for an enum attribute', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'enum' }), 'severe');
    expect(result).toEqual(ok({ type: 'enum', value: 'severe' }));
  });

  it('normalizes a bare boolean primitive', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'boolean' }), true);
    expect(result).toEqual(ok({ type: 'boolean', value: true }));
  });

  it('normalizes a bare array for a string_list attribute', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'string_list' }), ['a', 'b']);
    expect(result).toEqual(ok({ type: 'string_list', values: ['a', 'b'] }));
  });

  it('rejects a bare primitive for a money attribute (requires an object payload)', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'money' }), 24999);
    expect(result.ok).toBe(false);
  });

  it('normalizes an object payload for a money attribute', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'money' }), {
      amount: 24999,
      currency: 'USD',
    });
    expect(result).toEqual(ok({ type: 'money', amount: 24999, currency: 'USD' }));
  });

  it('rejects a bare primitive for a duration attribute (requires an object payload)', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'duration' }), 5);
    expect(result.ok).toBe(false);
  });

  it('normalizes an object payload for a duration attribute', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'duration' }), {
      amount: 5,
      unit: 'year',
    });
    expect(result).toEqual(ok({ type: 'duration', amount: 5, unit: 'year' }));
  });

  it('rejects a bare primitive for a range attribute (requires an object payload)', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'range' }), 5);
    expect(result.ok).toBe(false);
  });

  it('normalizes an object payload for a range attribute', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'range' }), {
      minimum: 1,
      maximum: 10,
    });
    expect(result).toEqual(ok({ type: 'range', minimum: 1, maximum: 10 }));
  });

  it('rejects a raw value of the wrong primitive kind', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'number' }), 'not a number');
    expect(result.ok).toBe(false);
  });

  it('rejects a raw value of the wrong primitive kind for a boolean attribute', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'boolean' }), 'not a boolean');
    expect(result.ok).toBe(false);
  });

  it('rejects a raw array for a scalar-valued attribute, naming it in the error', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'number' }), [
      'not',
      'a',
      'number',
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain('an array');
    }
  });

  it('rejects a raw value of the wrong primitive kind for a string attribute', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'string' }), 42);
    expect(result.ok).toBe(false);
  });

  it('rejects a raw value of the wrong primitive kind for a string_list attribute', () => {
    const result = normalizeAttributeValue(
      definition({ valueType: 'string_list' }),
      'not an array',
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a root-level schema violation (an object payload carrying an unrecognized field), falling back to a "value" label', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'number' }), {
      value: 42,
      bogusExtraField: 'nope',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/^value: /);
    }
  });

  it('rejects null and undefined raw values', () => {
    expect(normalizeAttributeValue(definition(), null).ok).toBe(false);
    expect(normalizeAttributeValue(definition(), undefined).ok).toBe(false);
  });

  it('accepts an object payload that already carries a matching type field', () => {
    const result = normalizeAttributeValue(definition(), { type: 'number', value: 42 });
    expect(result).toEqual(ok({ type: 'number', value: 42 }));
  });

  it('rejects an object payload whose type field mismatches the definition', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'number' }), {
      type: 'boolean',
      value: true,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a structurally invalid value (schema-level failure, e.g. bad currency code)', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'money' }), {
      amount: 100,
      currency: 'us-dollars',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects HTML/executable-content-shaped text', () => {
    const result = normalizeAttributeValue(
      definition({ valueType: 'string' }),
      '<script>alert(1)</script>',
    );
    expect(result.ok).toBe(false);
  });

  it('enforces allowedValues for an enum attribute', () => {
    const enumDefinition = definition({
      valueType: 'enum',
      allowedValues: ['none', 'mild', 'severe'],
    });
    expect(normalizeAttributeValue(enumDefinition, 'severe').ok).toBe(true);

    const rejected = normalizeAttributeValue(enumDefinition, 'catastrophic');
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.errors[0]).toContain('catastrophic');
    }
  });

  it('enforces allowedValues for a string_list attribute, listing every invalid entry', () => {
    const listDefinition = definition({ valueType: 'string_list', allowedValues: ['a', 'b'] });
    expect(normalizeAttributeValue(listDefinition, ['a', 'b']).ok).toBe(true);

    const rejected = normalizeAttributeValue(listDefinition, ['a', 'z', 'q']);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.errors[0]).toContain('"z"');
      expect(rejected.errors[0]).toContain('"q"');
      expect(rejected.errors[0]).toMatch(/values .* are not/);
    }
  });

  it('uses singular phrasing when exactly one string_list entry is invalid', () => {
    const listDefinition = definition({ valueType: 'string_list', allowedValues: ['a', 'b'] });
    const rejected = normalizeAttributeValue(listDefinition, ['a', 'z']);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.errors[0]).toMatch(/value "z" is not/);
    }
  });

  it('does not apply allowedValues checks to non-enum/string_list types', () => {
    const numberDefinition = definition({ valueType: 'number' });
    expect(normalizeAttributeValue(numberDefinition, 5).ok).toBe(true);
  });

  it('applies the definition unit as a default for a number value with no unit', () => {
    const result = normalizeAttributeValue(definition({ unit: 'mi' }), 100);
    expect(result).toEqual(ok({ type: 'number', value: 100, unit: 'mi' }));
  });

  it('does not override a number value that already declares its own unit', () => {
    const result = normalizeAttributeValue(definition({ unit: 'mi' }), { value: 100, unit: 'km' });
    expect(result).toEqual(ok({ type: 'number', value: 100, unit: 'km' }));
  });

  it('applies the definition unit as a default for a range value with no unit', () => {
    const result = normalizeAttributeValue(definition({ valueType: 'range', unit: 'inch' }), {
      minimum: 1,
      maximum: 10,
    });
    expect(result).toEqual(ok({ type: 'range', minimum: 1, maximum: 10, unit: 'inch' }));
  });

  it('leaves a value untouched when the definition declares no unit', () => {
    const result = normalizeAttributeValue(definition({ unit: undefined }), 100);
    expect(result).toEqual(ok({ type: 'number', value: 100 }));
  });

  it('leaves non-number/range values untouched even when a unit default exists', () => {
    const result = normalizeAttributeValue(
      definition({ valueType: 'boolean', unit: 'irrelevant' }),
      true,
    );
    expect(result).toEqual(ok({ type: 'boolean', value: true }));
  });

  it('property: every valid AttributeValue variant round-trips through normalizeAttributeValue', () => {
    fc.assert(
      fc.property(arbitraryDefinitionAndCandidate(), ({ def, candidate, expected }) => {
        const result = normalizeAttributeValue(def, candidate);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toEqual(expected);
        }
      }),
      { seed: 1, numRuns: 200 },
    );
  });

  it('property: HTML/script-shaped text is always rejected for string and text attributes', () => {
    const executableMarker = fc.constantFrom(
      '<script>alert(1)</script>',
      'javascript:alert(1)',
      '<img onerror="x" src=x>',
      '<div>',
      'onclick="x"',
    );
    fc.assert(
      fc.property(
        fc.constantFrom<'string' | 'text'>('string', 'text'),
        safeText(),
        executableMarker,
        safeText(),
        (valueType, before, marker, after) => {
          const raw = `${before}${marker}${after}`;
          const result = normalizeAttributeValue(definition({ valueType }), raw);
          expect(result.ok).toBe(false);
        },
      ),
      { seed: 2, numRuns: 100 },
    );
  });
});

// --- Arbitrary generator: a valid (definition, raw candidate, expected
// AttributeValue) triple for every variant, used by the round-trip property
// test above. ---
function arbitraryDefinitionAndCandidate(): fc.Arbitrary<{
  def: AttributeDefinition;
  candidate: unknown;
  expected: AttributeValue;
}> {
  return fc.oneof(
    fc.record({ value: safeText() }).map(({ value }) => ({
      def: definition({ valueType: 'string' as const }),
      candidate: value,
      expected: { type: 'string' as const, value },
    })),
    fc.record({ value: safeText() }).map(({ value }) => ({
      def: definition({ valueType: 'text' as const }),
      candidate: value,
      expected: { type: 'text' as const, value },
    })),
    fc
      .record({
        value: fc.double({ noNaN: true, noDefaultInfinity: true, min: -1_000_000, max: 1_000_000 }),
      })
      .map(({ value }) => ({
        def: definition({ valueType: 'number' as const }),
        candidate: value,
        expected: { type: 'number' as const, value },
      })),
    fc
      .record({
        amount: fc.double({
          noNaN: true,
          noDefaultInfinity: true,
          min: -1_000_000,
          max: 1_000_000,
        }),
        currency: fc.constantFrom('USD', 'EUR', 'GBP'),
      })
      .map(({ amount, currency }) => ({
        def: definition({ valueType: 'money' as const }),
        candidate: { amount, currency },
        expected: { type: 'money' as const, amount, currency },
      })),
    fc.record({ value: fc.boolean() }).map(({ value }) => ({
      def: definition({ valueType: 'boolean' as const }),
      candidate: value,
      expected: { type: 'boolean' as const, value },
    })),
    fc.date({ min: new Date('2000-01-01'), max: new Date('2030-01-01') }).map((date) => {
      const value = date.toISOString().slice(0, 10);
      return {
        def: definition({ valueType: 'date' as const }),
        candidate: value,
        expected: { type: 'date' as const, value },
      };
    }),
    fc
      .record({
        amount: fc.double({ noNaN: true, noDefaultInfinity: true, min: 0, max: 1_000_000 }),
        unit: fc.constantFrom('minute', 'hour', 'day', 'month', 'year'),
      })
      .map(({ amount, unit }) => ({
        def: definition({ valueType: 'duration' as const }),
        candidate: { amount, unit },
        expected: { type: 'duration' as const, amount, unit },
      })),
    fc.record({ value: safeText() }).map(({ value }) => ({
      def: definition({ valueType: 'enum' as const }),
      candidate: value,
      expected: { type: 'enum' as const, value },
    })),
    fc
      .tuple(
        fc.double({ noNaN: true, noDefaultInfinity: true, min: -1_000_000, max: 500_000 }),
        fc.double({ noNaN: true, noDefaultInfinity: true, min: 500_000, max: 1_000_000 }),
      )
      .map(([minimum, maximum]) => ({
        def: definition({ valueType: 'range' as const }),
        candidate: { minimum, maximum },
        expected: { type: 'range' as const, minimum, maximum },
      })),
    fc.array(safeText(), { minLength: 0, maxLength: 10 }).map((values) => ({
      def: definition({ valueType: 'string_list' as const }),
      candidate: values,
      expected: { type: 'string_list' as const, values },
    })),
  );
}

describe('compareAttributeValues', () => {
  it('returns a defined tie for comparison mode "none"', () => {
    expect(
      compareAttributeValues({ type: 'number', value: 1 }, { type: 'number', value: 2 }, 'none'),
    ).toEqual({ comparable: true, order: 0 });
  });

  it('is never comparable for comparison mode "constraint"', () => {
    const outcome = compareAttributeValues(
      { type: 'number', value: 1 },
      { type: 'number', value: 2 },
      'constraint',
    );
    expect(outcome.comparable).toBe(false);
  });

  it('rejects comparing two AttributeValues of different types', () => {
    const outcome = compareAttributeValues(
      { type: 'number', value: 1 },
      { type: 'boolean', value: true },
      'lower_better',
    );
    expect(outcome.comparable).toBe(false);
  });

  it('rejects comparing non-numeric AttributeValue types', () => {
    const outcome = compareAttributeValues(
      { type: 'string', value: 'a' },
      { type: 'string', value: 'b' },
      'lower_better',
    );
    expect(outcome.comparable).toBe(false);
  });

  it('orders "lower_better" so the smaller magnitude wins', () => {
    expect(
      compareAttributeValues(
        { type: 'number', value: 10 },
        { type: 'number', value: 20 },
        'lower_better',
      ),
    ).toEqual({ comparable: true, order: -1 });
    expect(
      compareAttributeValues(
        { type: 'number', value: 20 },
        { type: 'number', value: 10 },
        'lower_better',
      ),
    ).toEqual({ comparable: true, order: 1 });
    expect(
      compareAttributeValues(
        { type: 'number', value: 10 },
        { type: 'number', value: 10 },
        'lower_better',
      ),
    ).toEqual({ comparable: true, order: 0 });
  });

  it('orders "higher_better" so the larger magnitude wins', () => {
    expect(
      compareAttributeValues(
        { type: 'number', value: 10 },
        { type: 'number', value: 20 },
        'higher_better',
      ),
    ).toEqual({ comparable: true, order: 1 });
    expect(
      compareAttributeValues(
        { type: 'number', value: 20 },
        { type: 'number', value: 10 },
        'higher_better',
      ),
    ).toEqual({ comparable: true, order: -1 });
  });

  it('compares money by amount and duration by amount', () => {
    expect(
      compareAttributeValues(
        { type: 'money', amount: 100, currency: 'USD' },
        { type: 'money', amount: 200, currency: 'USD' },
        'lower_better',
      ),
    ).toEqual({ comparable: true, order: -1 });
    expect(
      compareAttributeValues(
        { type: 'duration', amount: 1, unit: 'hour' },
        { type: 'duration', amount: 2, unit: 'hour' },
        'lower_better',
      ),
    ).toEqual({ comparable: true, order: -1 });
  });

  it('compares range values by their midpoint, or a single present bound', () => {
    expect(
      compareAttributeValues(
        { type: 'range', minimum: 0, maximum: 10 },
        { type: 'range', minimum: 10, maximum: 20 },
        'lower_better',
      ),
    ).toEqual({ comparable: true, order: -1 });
    expect(
      compareAttributeValues(
        { type: 'range', minimum: 5 },
        { type: 'range', minimum: 15 },
        'lower_better',
      ),
    ).toEqual({ comparable: true, order: -1 });
    expect(
      compareAttributeValues(
        { type: 'range', maximum: 5 },
        { type: 'range', maximum: 15 },
        'lower_better',
      ),
    ).toEqual({ comparable: true, order: -1 });
    const outcome = compareAttributeValues(
      { type: 'range' },
      { type: 'range', minimum: 1 },
      'lower_better',
    );
    expect(outcome.comparable).toBe(false);
  });

  it('requires a target value for comparison mode "target"', () => {
    const outcome = compareAttributeValues(
      { type: 'number', value: 5 },
      { type: 'number', value: 6 },
      'target',
    );
    expect(outcome.comparable).toBe(false);
  });

  it('rejects a non-numeric target value for comparison mode "target"', () => {
    const outcome = compareAttributeValues(
      { type: 'number', value: 5 },
      { type: 'number', value: 6 },
      'target',
      { type: 'string', value: 'nope' } as unknown as AttributeValue,
    );
    expect(outcome.comparable).toBe(false);
  });

  it('orders "target" so the closer magnitude wins', () => {
    const target: AttributeValue = { type: 'number', value: 10 };
    expect(
      compareAttributeValues(
        { type: 'number', value: 9 },
        { type: 'number', value: 15 },
        'target',
        target,
      ),
    ).toEqual({ comparable: true, order: -1 });
    expect(
      compareAttributeValues(
        { type: 'number', value: 15 },
        { type: 'number', value: 9 },
        'target',
        target,
      ),
    ).toEqual({ comparable: true, order: 1 });
    expect(
      compareAttributeValues(
        { type: 'number', value: 5 },
        { type: 'number', value: 15 },
        'target',
        target,
      ),
    ).toEqual({ comparable: true, order: 0 });
  });
});

describe('attributeValueStatusInvariantError', () => {
  it('is satisfied for unknown status with no value', () => {
    expect(attributeValueStatusInvariantError('unknown', undefined)).toBeNull();
  });

  it('flags unknown status carrying a value', () => {
    expect(attributeValueStatusInvariantError('unknown', { type: 'boolean', value: true })).toMatch(
      /must be absent/,
    );
  });

  it.each(['asserted', 'supported', 'verified', 'conflicted'] as const)(
    'is satisfied for %s status with a value',
    (status) => {
      expect(
        attributeValueStatusInvariantError(status, { type: 'boolean', value: true }),
      ).toBeNull();
    },
  );

  it.each(['asserted', 'supported', 'verified', 'conflicted'] as const)(
    'flags %s status with no value',
    (status) => {
      expect(attributeValueStatusInvariantError(status, undefined)).toMatch(/is required/);
    },
  );

  it('property: the invariant holds for every status/value combination', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('asserted', 'supported', 'verified', 'conflicted', 'unknown'),
        fc.option(fc.record({ type: fc.constant('boolean' as const), value: fc.boolean() }), {
          nil: undefined,
        }),
        (status, value) => {
          const error = attributeValueStatusInvariantError(status, value);
          if (status === 'unknown') {
            expect(error === null).toBe(value === undefined);
          } else {
            expect(error === null).toBe(value !== undefined);
          }
        },
      ),
      { seed: 3, numRuns: 200 },
    );
  });
});

describe('createAttributeRecord', () => {
  it('builds a valid record for a non-unknown status with a value', () => {
    const result = createAttributeRecord(
      {
        definitionId: 'car.advertised_price',
        label: 'Advertised price',
        origin: 'pack',
        status: 'asserted',
        value: { type: 'number', value: 24999 },
      },
      fixedClock(),
    );
    expect(result).toEqual(
      ok({
        definitionId: 'car.advertised_price',
        label: 'Advertised price',
        origin: 'pack',
        sourceIds: [],
        status: 'asserted',
        value: { type: 'number', value: 24999 },
        updatedAt: FIXED_NOW,
      }),
    );
  });

  it('builds a valid record for unknown status with no value', () => {
    const result = createAttributeRecord(
      {
        definitionId: 'custom.dog_crate_fit',
        label: 'Dog crate fit',
        origin: 'user',
        status: 'unknown',
      },
      fixedClock(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBeUndefined();
      expect(result.value.status).toBe('unknown');
      expect(result.value.updatedAt).toBe(FIXED_NOW);
    }
  });

  it('rejects unknown status carrying a value before attempting to build the record', () => {
    const result = createAttributeRecord(
      {
        definitionId: 'custom.dog_crate_fit',
        label: 'Dog crate fit',
        origin: 'user',
        status: 'unknown',
        value: { type: 'boolean', value: true },
      },
      fixedClock(),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a non-unknown status with no value', () => {
    const result = createAttributeRecord(
      {
        definitionId: 'car.advertised_price',
        label: 'Advertised price',
        origin: 'pack',
        status: 'asserted',
      },
      fixedClock(),
    );
    expect(result.ok).toBe(false);
  });

  it('carries optional sourceIds and confidence through when provided', () => {
    const result = createAttributeRecord(
      {
        definitionId: 'car.advertised_price',
        label: 'Advertised price',
        origin: 'agent_proposed',
        status: 'supported',
        value: { type: 'number', value: 100 },
        sourceIds: ['source-1', 'source-2'],
        confidence: 0.8,
      },
      fixedClock(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sourceIds).toEqual(['source-1', 'source-2']);
      expect(result.value.confidence).toBe(0.8);
    }
  });

  it('rejects an out-of-range confidence value at the schema layer', () => {
    const result = createAttributeRecord(
      {
        definitionId: 'car.advertised_price',
        label: 'Advertised price',
        origin: 'pack',
        status: 'asserted',
        value: { type: 'number', value: 1 },
        confidence: 5,
      },
      fixedClock(),
    );
    expect(result.ok).toBe(false);
  });

  it('uses the injected clock, not wall-clock time', () => {
    const result = createAttributeRecord(
      {
        definitionId: 'car.advertised_price',
        label: 'Advertised price',
        origin: 'pack',
        status: 'asserted',
        value: { type: 'number', value: 1 },
      },
      fixedClock('2020-01-01T00:00:00.000Z'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.updatedAt).toBe('2020-01-01T00:00:00.000Z');
    }
  });

  // --- Honesty boundary: a model may not certify its own inference as
  // "verified" (plan task F5 / change-set §25-§26). CLAUDE.md: "The
  // deterministic core, not an LLM, owns case state, evidence validity,
  // readiness, and human authority." `status: 'verified'` is this protocol's
  // strongest claim -- it asserts a human confirmed the value, not merely
  // that specification research or a pack default supports it
  // (packs-and-routing.md: "research-supported 'likely' is not the same
  // claim as human-attested 'verified comfortable'"). Only `origin: 'user'`
  // is a literal human action, so only it may claim `'verified'`.

  it('rejects "verified" status from origin "agent_proposed" -- a model may not certify its own inference as verified', () => {
    const result = createAttributeRecord(
      {
        definitionId: 'custom.dog_crate_fit',
        label: 'Dog crate fit',
        origin: 'agent_proposed',
        status: 'verified',
        value: { type: 'boolean', value: true },
      },
      fixedClock(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Loud and actionable: names what was rejected (origin "agent_proposed"
      // claiming "verified") and what would have been accepted ("user"),
      // never a silent downgrade to a weaker status the caller didn't ask
      // for and wouldn't know happened.
      expect(result.errors.join(' ')).toMatch(/verified/i);
      expect(result.errors.join(' ')).toMatch(/agent_proposed/);
      expect(result.errors.join(' ')).toMatch(/user/);
    }
  });

  it('rejects "verified" status from origin "pack" -- pre-authored pack reference data is not a human attestation either', () => {
    const result = createAttributeRecord(
      {
        definitionId: 'car.advertised_price',
        label: 'Advertised price',
        origin: 'pack',
        status: 'verified',
        value: { type: 'number', value: 24999 },
      },
      fixedClock(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/verified/i);
      expect(result.errors.join(' ')).toMatch(/pack/);
    }
  });

  it('accepts "verified" status from origin "user" -- human observation may assert the strongest status', () => {
    const result = createAttributeRecord(
      {
        definitionId: 'custom.dog_crate_fit',
        label: 'Dog crate fit',
        origin: 'user',
        status: 'verified',
        value: { type: 'boolean', value: true },
      },
      fixedClock(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('verified');
      expect(result.value.origin).toBe('user');
    }
  });

  it('does not reject a non-"verified" status for a non-"user" origin -- the rule targets "verified" specifically, not agent/pack writes in general', () => {
    const result = createAttributeRecord(
      {
        definitionId: 'car.advertised_price',
        label: 'Advertised price',
        origin: 'agent_proposed',
        status: 'supported',
        value: { type: 'number', value: 24999 },
      },
      fixedClock(),
    );
    expect(result.ok).toBe(true);
  });

  it('property: "verified" succeeds if and only if origin is "user", for every origin/status combination', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('pack', 'user', 'agent_proposed'),
        fc.constantFrom('asserted', 'supported', 'verified', 'conflicted'),
        (origin, status) => {
          const result = createAttributeRecord(
            {
              definitionId: 'car.advertised_price',
              label: 'Advertised price',
              origin,
              status,
              value: { type: 'number', value: 1 },
            },
            fixedClock(),
          );
          const expectedOk = status !== 'verified' || origin === 'user';
          expect(result.ok).toBe(expectedOk);
        },
      ),
      { seed: 4, numRuns: 200 },
    );
  });
});

describe('AttributeValueSchema sanity (imported to keep the round-trip property test honest)', () => {
  it('is the same schema normalizeAttributeValue delegates to', () => {
    expect(AttributeValueSchema.safeParse({ type: 'number', value: 1 }).success).toBe(true);
  });
});
