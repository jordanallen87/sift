/**
 * Behavioral suite for the one shared module `WorkspaceFilter` semantics
 * live in -- see `workspace-filters.ts`'s own file header and
 * `/private/tmp/.../filter-api-contract.md` for the product rules under
 * test. Every case here traces to a rule stated in that contract; where a
 * rule is a deliberate, non-obvious product choice (an unknown value
 * excludes, a stale `fieldId` is ignored, `allowedValues` is never
 * fabricated into a facet) the test name says so explicitly rather than
 * leaving the reader to infer it from the assertion alone.
 *
 * Fixture convention: local `buildAttribute`/`buildOption` factories, not
 * hand-rolled partial literals, following the exact pattern already
 * established in `WorkspaceSidebar.test.tsx` (there is no shared
 * `EntityRecord`/`AttributeDefinition` builder exported for reuse --
 * `packages/catalog/src/test-support.ts` builds `VehicleCatalogRecord`,
 * an unrelated schema).
 */
import { describe, expect, it } from 'vitest';
import type {
  AttributeDefinition,
  AttributeRecord,
  AttributeValue,
  EntityRecord,
  WorkspaceFilter,
} from '@sift/contracts';
import {
  applyAssistantNarrowing,
  applyWorkspaceFilters,
  buildFacetOptions,
  committedFilterValue,
  describeAppliedFilters,
  discriminatingScore,
  formatNumericRangeHint,
  isFilterableAttribute,
  planFilter,
  planWorkspaceFilters,
  sampleAttributeValue,
  upsertFilter,
  type FilterRenderPlan,
} from './workspace-filters.js';

// --- Fixtures -------------------------------------------------------------

function buildAttribute(overrides: Partial<AttributeDefinition> = {}): AttributeDefinition {
  return {
    id: 'awd',
    label: 'AWD',
    valueType: 'boolean',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'assertion',
    comparison: 'none',
    sensitive: false,
    ...overrides,
  };
}

/** Builds one real `EntityRecord`; `values` maps attribute id to the `AttributeValue` this option asserts. An omitted key means "no data for that attribute", the same real-world case `sampleAttributeValue` must read as `null`. */
function buildOption(id: string, values: Record<string, AttributeValue> = {}): EntityRecord {
  const attributes: EntityRecord['attributes'] = {};
  for (const [definitionId, value] of Object.entries(values)) {
    attributes[definitionId] = {
      definitionId,
      label: definitionId,
      value,
      origin: 'user',
      sourceIds: [],
      status: 'asserted',
      updatedAt: '2026-08-28T00:00:00.000Z',
    };
  }
  return {
    id,
    kind: 'car',
    label: id,
    attributes,
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  };
}

/** Builds an option carrying one `AttributeRecord` verbatim -- the only way to reach `status: 'unknown'` (no `value`), which `buildOption` above cannot express since it always writes an asserted value. */
function buildOptionWithRecord(
  id: string,
  attributeId: string,
  record: AttributeRecord,
): EntityRecord {
  return {
    id,
    kind: 'car',
    label: id,
    attributes: { [attributeId]: record },
    createdAt: '2026-08-28T00:00:00.000Z',
    updatedAt: '2026-08-28T00:00:00.000Z',
  };
}

// ============================================================================

describe('isFilterableAttribute', () => {
  it.each<[string, AttributeDefinition['valueType']]>([
    ['boolean', 'boolean'],
    ['number', 'number'],
    ['money', 'money'],
    ['string', 'string'],
    ['text', 'text'],
  ])('accepts %s', (_name, valueType) => {
    expect(isFilterableAttribute(buildAttribute({ valueType }))).toBe(true);
  });

  it('accepts enum with a real allowedValues list', () => {
    expect(
      isFilterableAttribute(
        buildAttribute({ valueType: 'enum', allowedValues: ['FWD', 'AWD', 'RWD'] }),
      ),
    ).toBe(true);
  });

  it.each<[string, AttributeDefinition['valueType']]>([
    ['date', 'date'],
    ['duration', 'duration'],
    ['range', 'range'],
    ['string_list', 'string_list'],
  ])(
    'rejects %s -- no honest single-field comparison control exists for it',
    (_name, valueType) => {
      expect(isFilterableAttribute(buildAttribute({ valueType }))).toBe(false);
    },
  );

  it('rejects enum with no allowedValues at all -- never fabricate a choice list', () => {
    expect(isFilterableAttribute(buildAttribute({ valueType: 'enum' }))).toBe(false);
  });

  it('rejects enum with an empty allowedValues array', () => {
    expect(isFilterableAttribute(buildAttribute({ valueType: 'enum', allowedValues: [] }))).toBe(
      false,
    );
  });
});

// ============================================================================

describe('sampleAttributeValue', () => {
  const option = buildOption('car-1', {
    boolAttr: { type: 'boolean', value: true },
    enumAttr: { type: 'enum', value: 'AWD' },
    stringAttr: { type: 'string', value: 'Red' },
    textAttr: { type: 'text', value: 'Test drove twice.' },
    numberAttr: { type: 'number', value: 27995 },
    moneyAttr: { type: 'money', amount: 29500, currency: 'USD' },
    dateAttr: { type: 'date', value: '2026-08-28' },
    durationAttr: { type: 'duration', amount: 3, unit: 'day' },
    rangeAttr: { type: 'range', minimum: 1, maximum: 10 },
    stringListAttr: { type: 'string_list', values: ['a', 'b'] },
  });

  it.each<[string, string | number | boolean]>([
    ['boolAttr', true],
    ['enumAttr', 'AWD'],
    ['stringAttr', 'Red'],
    ['textAttr', 'Test drove twice.'],
    ['numberAttr', 27995],
    ['moneyAttr', 29500],
  ])('reads the raw comparable for %s', (attributeId, expected) => {
    expect(sampleAttributeValue(option, attributeId)).toBe(expected);
  });

  it.each(['dateAttr', 'durationAttr', 'rangeAttr', 'stringListAttr'])(
    'returns null for %s -- no comparable primitive exists for this value type',
    (attributeId) => {
      expect(sampleAttributeValue(option, attributeId)).toBeNull();
    },
  );

  it('returns null when the option has no record for the attribute at all', () => {
    expect(sampleAttributeValue(option, 'never-set')).toBeNull();
  });

  it('returns null when the record status is "unknown" (value is absent by schema)', () => {
    const unknownOption = buildOptionWithRecord('car-2', 'price', {
      definitionId: 'price',
      label: 'Price',
      origin: 'user',
      sourceIds: [],
      status: 'unknown',
      updatedAt: '2026-08-28T00:00:00.000Z',
    });
    expect(sampleAttributeValue(unknownOption, 'price')).toBeNull();
  });
});

// ============================================================================

describe('planFilter', () => {
  const boolAttr = buildAttribute({ id: 'awd', label: 'AWD', valueType: 'boolean' });
  const colorAttr = buildAttribute({ id: 'color', label: 'Color', valueType: 'string' });
  const priceAttr = buildAttribute({ id: 'price', label: 'Price', valueType: 'number' });
  const msrpAttr = buildAttribute({ id: 'msrp', label: 'MSRP', valueType: 'money' });

  it('returns { kind: "legacy" } when no option data is supplied', () => {
    expect(planFilter(boolAttr, [])).toEqual({ kind: 'legacy' });
  });

  describe('suppressed', () => {
    it('boolean: suppressed when every option that asserted a value agrees true', () => {
      const options = [
        buildOption('c1', { awd: { type: 'boolean', value: true } }),
        buildOption('c2', { awd: { type: 'boolean', value: true } }),
      ];
      expect(planFilter(boolAttr, options)).toEqual({ kind: 'suppressed' });
    });

    it('boolean: suppressed when every option that asserted a value agrees false', () => {
      const options = [
        buildOption('c1', { awd: { type: 'boolean', value: false } }),
        buildOption('c2', { awd: { type: 'boolean', value: false } }),
      ];
      expect(planFilter(boolAttr, options)).toEqual({ kind: 'suppressed' });
    });

    it('boolean: suppressed when nobody has asserted a value at all', () => {
      const options = [buildOption('c1', {}), buildOption('c2', {})];
      expect(planFilter(boolAttr, options)).toEqual({ kind: 'suppressed' });
    });

    it('facet: suppressed when only a single distinct value is present', () => {
      const options = [
        buildOption('c1', { color: { type: 'string', value: 'Red' } }),
        buildOption('c2', { color: { type: 'string', value: 'Red' } }),
      ];
      expect(planFilter(colorAttr, options)).toEqual({ kind: 'suppressed' });
    });

    it('facet: suppressed when zero options have any value for the field', () => {
      const options = [buildOption('c1', {}), buildOption('c2', {})];
      expect(planFilter(colorAttr, options)).toEqual({ kind: 'suppressed' });
    });

    it('numeric: suppressed when min === max across every real value', () => {
      const options = [
        buildOption('c1', { price: { type: 'number', value: 25000 } }),
        buildOption('c2', { price: { type: 'number', value: 25000 } }),
      ];
      expect(planFilter(priceAttr, options)).toEqual({ kind: 'suppressed' });
    });

    it('numeric: suppressed when no option carries a numeric value at all', () => {
      const options = [buildOption('c1', {}), buildOption('c2', {})];
      expect(planFilter(priceAttr, options)).toEqual({ kind: 'suppressed' });
    });
  });

  it('boolean_narrow: reports the real matchingCount/totalCount', () => {
    const options = [
      buildOption('c1', { awd: { type: 'boolean', value: true } }),
      buildOption('c2', { awd: { type: 'boolean', value: true } }),
      buildOption('c3', { awd: { type: 'boolean', value: false } }),
    ];
    expect(planFilter(boolAttr, options)).toEqual({
      kind: 'boolean_narrow',
      matchingCount: 2,
      totalCount: 3,
    });
  });

  it('facet: reports counts sorted by count descending, tiebreak alphabetically ascending', () => {
    // Amber:2, Blue:1, Red:1 -- Blue and Red genuinely tie on count, which is
    // the case that actually exercises the documented `a.value.localeCompare(b.value)`
    // tiebreak rather than merely asserting a count-sorted list.
    const options = [
      buildOption('c1', { color: { type: 'string', value: 'Amber' } }),
      buildOption('c2', { color: { type: 'string', value: 'Amber' } }),
      buildOption('c3', { color: { type: 'string', value: 'Blue' } }),
      buildOption('c4', { color: { type: 'string', value: 'Red' } }),
    ];
    expect(planFilter(colorAttr, options)).toEqual({
      kind: 'facet',
      facetOptions: [
        { value: 'Amber', count: 2 },
        { value: 'Blue', count: 1 },
        { value: 'Red', count: 1 },
      ],
    });
  });

  it('numeric: reports min/max/distinctCount and the real currency for a money attribute', () => {
    const options = [
      buildOption('c1', { msrp: { type: 'money', amount: 26000, currency: 'USD' } }),
      buildOption('c2', { msrp: { type: 'money', amount: 29500, currency: 'USD' } }),
      buildOption('c3', { msrp: { type: 'money', amount: 26000, currency: 'USD' } }),
    ];
    const plan = planFilter(msrpAttr, options);
    expect(plan).toEqual({
      kind: 'numeric',
      min: 26000,
      max: 29500,
      distinctCount: 2,
      currency: 'USD',
    });
  });

  it('numeric: a plain number attribute has NO currency key at all (exactOptionalPropertyTypes)', () => {
    const options = [
      buildOption('c1', { price: { type: 'number', value: 22995 } }),
      buildOption('c2', { price: { type: 'number', value: 27995 } }),
    ];
    const plan = planFilter(priceAttr, options);
    expect(plan).toMatchObject({ kind: 'numeric', min: 22995, max: 27995, distinctCount: 2 });
    // Explicitly NOT a `currency: undefined` check -- the module's own doc
    // comment calls out that `exactOptionalPropertyTypes` treats an explicit
    // `undefined` value as distinct from the key being absent, so only
    // `.not.toHaveProperty` proves the key itself was never spread in.
    expect(plan).not.toHaveProperty('currency');
  });
});

// ============================================================================

describe('buildFacetOptions', () => {
  it('reads only values actually present on saved options, never attribute.allowedValues', () => {
    // `allowedValues` lists 'RWD' but no saved option ever asserted it -- a
    // pack author's anticipated value that turned out to be unused must not
    // become a fabricated, always-zero facet choice (CLAUDE.md "Never
    // fabricate a value").
    const attribute = buildAttribute({
      id: 'drivetrain',
      label: 'Drivetrain',
      valueType: 'enum',
      allowedValues: ['FWD', 'AWD', 'RWD'],
    });
    const options = [
      buildOption('c1', { drivetrain: { type: 'enum', value: 'FWD' } }),
      buildOption('c2', { drivetrain: { type: 'enum', value: 'AWD' } }),
    ];
    const facets = buildFacetOptions(attribute, options);
    expect(facets).toEqual([
      { value: 'AWD', count: 1 },
      { value: 'FWD', count: 1 },
    ]);
    expect(facets.find((facet) => facet.value === 'RWD')).toBeUndefined();
  });
});

// ============================================================================

describe('discriminatingScore / planWorkspaceFilters', () => {
  const boolAttr = buildAttribute({ id: 'awd', label: 'AWD', valueType: 'boolean' });
  const colorAttr = buildAttribute({ id: 'color', label: 'Color', valueType: 'string' });
  const drivetrainAttr = buildAttribute({
    id: 'drivetrain',
    label: 'Drivetrain',
    valueType: 'enum',
    allowedValues: ['FWD', 'AWD', 'RWD'],
  });
  const priceAttr = buildAttribute({ id: 'price', label: 'Price', valueType: 'number' });

  it('discriminatingScore is the largest group a single choice can keep, never the number of distinct values', () => {
    // The distinction this whole score exists to make. A facet whose values
    // are 3-and-1 can keep three options; a facet with four unique values
    // can only ever keep one. Under the earlier "count the distinct values"
    // score the second one outranked the first, which is backwards at the
    // five-option size Sift actually holds.
    expect(
      discriminatingScore({
        kind: 'facet',
        facetOptions: [
          { value: 'AWD', count: 3 },
          { value: 'FWD', count: 1 },
        ],
      }),
    ).toBe(3);
    expect(
      discriminatingScore({
        kind: 'facet',
        facetOptions: [
          { value: 'a', count: 1 },
          { value: 'b', count: 1 },
          { value: 'c', count: 1 },
          { value: 'd', count: 1 },
        ],
      }),
    ).toBe(1);
    // An "at most" threshold can keep every option but the highest-valued
    // one before it stops narrowing at all.
    expect(discriminatingScore({ kind: 'numeric', min: 0, max: 10, distinctCount: 4 })).toBe(3);
    // The larger side of the boolean split, not a constant 2.
    expect(discriminatingScore({ kind: 'boolean_narrow', matchingCount: 1, totalCount: 4 })).toBe(
      3,
    );
    expect(discriminatingScore({ kind: 'boolean_narrow', matchingCount: 3, totalCount: 4 })).toBe(
      3,
    );
    expect(discriminatingScore({ kind: 'legacy' })).toBe(0);
    expect(discriminatingScore({ kind: 'suppressed' })).toBe(0);
  });

  it('suppresses a facet whose every value appears exactly once -- that isolates one option rather than grouping any', () => {
    // The real defect this rule closes: the seeded four-car case rendered
    // twelve chips across Make/Model/Trim, every one reading "(1)", filling
    // the filter sheet with controls that could only ever leave a single
    // car on screen.
    const options = [
      buildOption('c1', { color: { type: 'string', value: 'Red' } }),
      buildOption('c2', { color: { type: 'string', value: 'Blue' } }),
      buildOption('c3', { color: { type: 'string', value: 'Black' } }),
    ];
    expect(planFilter(colorAttr, options)).toEqual({ kind: 'suppressed' });
    expect(planWorkspaceFilters([colorAttr], options)).toEqual([]);
  });

  it('keeps a facet as soon as ONE value groups two options, even when the rest are singletons', () => {
    // Keyed on the data, not on the attribute being an identity field: five
    // cars where two share a make is a real, useful Make facet.
    const options = [
      buildOption('c1', { color: { type: 'string', value: 'Red' } }),
      buildOption('c2', { color: { type: 'string', value: 'Red' } }),
      buildOption('c3', { color: { type: 'string', value: 'Black' } }),
    ];
    const plan = planFilter(colorAttr, options);
    expect(plan).toMatchObject({ kind: 'facet' });
    expect(discriminatingScore(plan)).toBe(2);
  });

  it('drops suppressed entries entirely', () => {
    // Every drivetrain here is "AWD" -- cannot narrow, must be absent from
    // the plan list, not merely sorted last.
    const options = [
      buildOption('c1', { drivetrain: { type: 'enum', value: 'AWD' } }),
      buildOption('c2', { drivetrain: { type: 'enum', value: 'AWD' } }),
    ];
    const entries = planWorkspaceFilters([drivetrainAttr], options);
    expect(entries).toEqual([]);
  });

  it('sorts surviving entries by the largest group each can keep, most useful first', () => {
    // awd keeps 3 of 4 (score 3); color's biggest bucket is 2 (score 2), so
    // awd must outrank color. Under the earlier distinct-value score color
    // would have won with 3 distinct values against the boolean's flat 2 --
    // this fixture is deliberately built so the two scores disagree.
    const options = [
      buildOption('c1', {
        awd: { type: 'boolean', value: true },
        color: { type: 'string', value: 'Red' },
      }),
      buildOption('c2', {
        awd: { type: 'boolean', value: true },
        color: { type: 'string', value: 'Red' },
      }),
      buildOption('c3', {
        awd: { type: 'boolean', value: true },
        color: { type: 'string', value: 'Blue' },
      }),
      buildOption('c4', {
        awd: { type: 'boolean', value: false },
        color: { type: 'string', value: 'Black' },
      }),
    ];
    const entries = planWorkspaceFilters([colorAttr, boolAttr], options);
    expect(entries.map((entry) => entry.attribute.id)).toEqual(['awd', 'color']);
  });

  it('preserves declaration order when no option data is supplied (every plan is legacy, score 0)', () => {
    const entries = planWorkspaceFilters([priceAttr, boolAttr, colorAttr], []);
    expect(entries.map((entry) => entry.attribute.id)).toEqual(['price', 'awd', 'color']);
  });
});

// ============================================================================

describe('formatNumericRangeHint', () => {
  it('formats a money attribute with a known currency as currency', () => {
    const attribute = buildAttribute({ id: 'msrp', label: 'MSRP', valueType: 'money' });
    const plan: Extract<FilterRenderPlan, { kind: 'numeric' }> = {
      kind: 'numeric',
      min: 26000,
      max: 29500,
      distinctCount: 2,
      currency: 'USD',
    };
    expect(formatNumericRangeHint(attribute, plan)).toBe('Seen: $26,000–$29,500');
  });

  it('formats a plain number with its declared unit', () => {
    const attribute = buildAttribute({
      id: 'price',
      label: 'Price',
      valueType: 'number',
      unit: 'USD',
    });
    const plan: Extract<FilterRenderPlan, { kind: 'numeric' }> = {
      kind: 'numeric',
      min: 22995,
      max: 31995,
      distinctCount: 4,
    };
    // The unit is written ONCE, after the range -- "19,800 mi–31,200 mi"
    // shipped to the running product briefly and reads as two separate
    // measurements rather than one span. A currency symbol is the exception
    // and stays on both ends (covered by the money case above).
    expect(formatNumericRangeHint(attribute, plan)).toBe('Seen: 22,995–31,995 USD');
  });

  it('formats a plain number with no declared unit with no trailing text', () => {
    const attribute = buildAttribute({ id: 'mileage', label: 'Mileage', valueType: 'number' });
    const plan: Extract<FilterRenderPlan, { kind: 'numeric' }> = {
      kind: 'numeric',
      min: 10000,
      max: 50000,
      distinctCount: 3,
    };
    expect(formatNumericRangeHint(attribute, plan)).toBe('Seen: 10,000–50,000');
  });
});

// ============================================================================

describe('committedFilterValue / upsertFilter', () => {
  it('committedFilterValue returns the existing value, or "" when absent', () => {
    const filters: WorkspaceFilter[] = [{ fieldId: 'awd', operator: 'equals', value: 'true' }];
    expect(committedFilterValue(filters, 'awd')).toBe('true');
    expect(committedFilterValue(filters, 'color')).toBe('');
  });

  it('upsertFilter replaces an existing entry for the same fieldId', () => {
    const filters: WorkspaceFilter[] = [{ fieldId: 'awd', operator: 'equals', value: 'true' }];
    const next = upsertFilter(filters, 'awd', {
      fieldId: 'awd',
      operator: 'equals',
      value: 'false',
    });
    expect(next).toEqual([{ fieldId: 'awd', operator: 'equals', value: 'false' }]);
  });

  it('upsertFilter adds a new entry for an unseen fieldId', () => {
    const filters: WorkspaceFilter[] = [{ fieldId: 'awd', operator: 'equals', value: 'true' }];
    const next = upsertFilter(filters, 'color', {
      fieldId: 'color',
      operator: 'equals',
      value: 'Red',
    });
    expect(next).toEqual([
      { fieldId: 'awd', operator: 'equals', value: 'true' },
      { fieldId: 'color', operator: 'equals', value: 'Red' },
    ]);
  });

  it('upsertFilter removes the entry when next is null', () => {
    const filters: WorkspaceFilter[] = [
      { fieldId: 'awd', operator: 'equals', value: 'true' },
      { fieldId: 'color', operator: 'equals', value: 'Red' },
    ];
    const next = upsertFilter(filters, 'awd', null);
    expect(next).toEqual([{ fieldId: 'color', operator: 'equals', value: 'Red' }]);
  });

  it('upsertFilter never mutates the input array', () => {
    const filters: WorkspaceFilter[] = [{ fieldId: 'awd', operator: 'equals', value: 'true' }];
    const snapshot = [...filters];
    upsertFilter(filters, 'awd', { fieldId: 'awd', operator: 'equals', value: 'false' });
    upsertFilter(filters, 'color', { fieldId: 'color', operator: 'equals', value: 'Red' });
    upsertFilter(filters, 'awd', null);
    expect(filters).toEqual(snapshot);
  });
});

// ============================================================================

describe('applyWorkspaceFilters', () => {
  const attributes: AttributeDefinition[] = [
    buildAttribute({ id: 'awd', label: 'AWD', valueType: 'boolean' }),
    buildAttribute({
      id: 'drivetrain',
      label: 'Drivetrain',
      valueType: 'enum',
      allowedValues: ['FWD', 'AWD', 'RWD'],
    }),
    buildAttribute({ id: 'color', label: 'Color', valueType: 'string' }),
    buildAttribute({ id: 'price', label: 'Price', valueType: 'number' }),
  ];

  it('empty filters returns every option as a NEW array, not the same reference', () => {
    const options = [buildOption('c1'), buildOption('c2')];
    const result = applyWorkspaceFilters(options, [], attributes);
    expect(result).toEqual(options);
    expect(result).not.toBe(options);
  });

  it('ANDs across multiple filters -- an option must satisfy every one', () => {
    const options = [
      buildOption('c1', {
        awd: { type: 'boolean', value: true },
        price: { type: 'number', value: 24500 },
      }),
      buildOption('c2', {
        awd: { type: 'boolean', value: true },
        price: { type: 'number', value: 31995 },
      }),
      buildOption('c3', {
        awd: { type: 'boolean', value: false },
        price: { type: 'number', value: 22995 },
      }),
    ];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'awd', operator: 'equals', value: 'true' },
      { fieldId: 'price', operator: 'less_than_or_equal', value: '25000' },
    ];
    expect(applyWorkspaceFilters(options, filters, attributes).map((o) => o.id)).toEqual(['c1']);
  });

  it('an option with NO usable value for a filtered field is excluded -- Sift cannot claim an unknown price is under a threshold', () => {
    const options = [
      buildOption('c1', { price: { type: 'number', value: 22995 } }),
      // c2 never recorded a price at all.
      buildOption('c2', {}),
    ];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'less_than_or_equal', value: '30000' },
    ];
    expect(applyWorkspaceFilters(options, filters, attributes).map((o) => o.id)).toEqual(['c1']);
  });

  it('a filter whose fieldId matches no definition is ignored -- a stale filter must never empty the results', () => {
    const options = [buildOption('c1'), buildOption('c2')];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'no-longer-a-real-field', operator: 'equals', value: 'anything' },
    ];
    expect(applyWorkspaceFilters(options, filters, attributes)).toEqual(options);
  });

  it('a filter list where EVERY entry is stale returns all options', () => {
    const options = [buildOption('c1'), buildOption('c2')];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'retired-field-1', operator: 'equals', value: 'a' },
      { fieldId: 'retired-field-2', operator: 'contains', value: 'b' },
    ];
    expect(applyWorkspaceFilters(options, filters, attributes)).toEqual(options);
  });

  it('equals matches a string field exactly', () => {
    const options = [
      buildOption('c1', { color: { type: 'string', value: 'Red' } }),
      buildOption('c2', { color: { type: 'string', value: 'Blue' } }),
    ];
    const filters: WorkspaceFilter[] = [{ fieldId: 'color', operator: 'equals', value: 'Red' }];
    expect(applyWorkspaceFilters(options, filters, attributes).map((o) => o.id)).toEqual(['c1']);
  });

  it('not_equals excludes the matching value and keeps the rest', () => {
    const options = [
      buildOption('c1', { color: { type: 'string', value: 'Red' } }),
      buildOption('c2', { color: { type: 'string', value: 'Blue' } }),
    ];
    const filters: WorkspaceFilter[] = [{ fieldId: 'color', operator: 'not_equals', value: 'Red' }];
    expect(applyWorkspaceFilters(options, filters, attributes).map((o) => o.id)).toEqual(['c2']);
  });

  it('equals matches an enum field exactly', () => {
    const options = [
      buildOption('c1', { drivetrain: { type: 'enum', value: 'AWD' } }),
      buildOption('c2', { drivetrain: { type: 'enum', value: 'FWD' } }),
    ];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'drivetrain', operator: 'equals', value: 'AWD' },
    ];
    expect(applyWorkspaceFilters(options, filters, attributes).map((o) => o.id)).toEqual(['c1']);
  });

  it("equals matches a boolean field via String(true) === 'true', the same string the Toggle control emits", () => {
    const options = [
      buildOption('c1', { awd: { type: 'boolean', value: true } }),
      buildOption('c2', { awd: { type: 'boolean', value: false } }),
    ];
    const filters: WorkspaceFilter[] = [{ fieldId: 'awd', operator: 'equals', value: 'true' }];
    expect(applyWorkspaceFilters(options, filters, attributes).map((o) => o.id)).toEqual(['c1']);
  });

  it('contains is case-insensitive', () => {
    const options = [
      buildOption('c1', { color: { type: 'string', value: 'Red' } }),
      buildOption('c2', { color: { type: 'string', value: 'Blue' } }),
    ];
    const filters: WorkspaceFilter[] = [{ fieldId: 'color', operator: 'contains', value: 'RED' }];
    expect(applyWorkspaceFilters(options, filters, attributes).map((o) => o.id)).toEqual(['c1']);
  });

  it('contains works on a stringified number', () => {
    // "27950" genuinely contains the substring "795"; 24500 does not.
    const options = [
      buildOption('c1', { price: { type: 'number', value: 27950 } }),
      buildOption('c2', { price: { type: 'number', value: 24500 } }),
    ];
    const filters: WorkspaceFilter[] = [{ fieldId: 'price', operator: 'contains', value: '795' }];
    expect(applyWorkspaceFilters(options, filters, attributes).map((o) => o.id)).toEqual(['c1']);
  });

  it('less_than excludes a value exactly equal to the threshold (strict)', () => {
    const options = [buildOption('c1', { price: { type: 'number', value: 25000 } })];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'less_than', value: '25000' },
    ];
    expect(applyWorkspaceFilters(options, filters, attributes)).toEqual([]);
  });

  it('less_than_or_equal includes a value exactly equal to the threshold', () => {
    const options = [buildOption('c1', { price: { type: 'number', value: 25000 } })];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'less_than_or_equal', value: '25000' },
    ];
    expect(applyWorkspaceFilters(options, filters, attributes).map((o) => o.id)).toEqual(['c1']);
  });

  it('greater_than excludes a value exactly equal to the threshold (strict)', () => {
    const options = [buildOption('c1', { price: { type: 'number', value: 25000 } })];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'greater_than', value: '25000' },
    ];
    expect(applyWorkspaceFilters(options, filters, attributes)).toEqual([]);
  });

  it('greater_than_or_equal includes a value exactly equal to the threshold', () => {
    const options = [buildOption('c1', { price: { type: 'number', value: 25000 } })];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'greater_than_or_equal', value: '25000' },
    ];
    expect(applyWorkspaceFilters(options, filters, attributes).map((o) => o.id)).toEqual(['c1']);
  });

  it('a numeric operator against a boolean sample excludes -- never coerced to 0/1', () => {
    const options = [buildOption('c1', { awd: { type: 'boolean', value: true } })];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'awd', operator: 'greater_than_or_equal', value: '0' },
    ];
    expect(applyWorkspaceFilters(options, filters, attributes)).toEqual([]);
  });

  it('a numeric operator with an unparseable filter value excludes rather than passing everything', () => {
    const options = [buildOption('c1', { price: { type: 'number', value: 22995 } })];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'less_than_or_equal', value: 'not-a-number' },
    ];
    expect(applyWorkspaceFilters(options, filters, attributes)).toEqual([]);
  });

  it('never mutates the input array, and output order matches input order', () => {
    const options = [
      buildOption('c3', { price: { type: 'number', value: 22995 } }),
      buildOption('c1', { price: { type: 'number', value: 24500 } }),
      buildOption('c2', { price: { type: 'number', value: 25995 } }),
    ];
    const snapshot = [...options];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'less_than_or_equal', value: '30000' },
    ];
    const result = applyWorkspaceFilters(options, filters, attributes);
    expect(options).toEqual(snapshot);
    expect(result.map((o) => o.id)).toEqual(['c3', 'c1', 'c2']);
  });
});

// ============================================================================

describe('describeAppliedFilters', () => {
  const attributes: AttributeDefinition[] = [
    buildAttribute({ id: 'awd', label: 'AWD', valueType: 'boolean' }),
    buildAttribute({
      id: 'drivetrain',
      label: 'Drivetrain',
      valueType: 'enum',
      allowedValues: ['FWD', 'AWD', 'RWD'],
    }),
    buildAttribute({ id: 'color', label: 'Color', valueType: 'string' }),
    buildAttribute({ id: 'price', label: 'Price', valueType: 'number', unit: 'USD' }),
    buildAttribute({ id: 'msrp', label: 'MSRP', valueType: 'money' }),
  ];

  it('boolean equals "true" reads as "<Label> only", matching the Toggle control\'s own wording', () => {
    const filters: WorkspaceFilter[] = [{ fieldId: 'awd', operator: 'equals', value: 'true' }];
    expect(describeAppliedFilters(filters, attributes)).toEqual([
      { fieldId: 'awd', label: 'AWD only' },
    ]);
  });

  it('a non-boolean equals reads as "<Label>: <value>"', () => {
    const filters: WorkspaceFilter[] = [
      { fieldId: 'drivetrain', operator: 'equals', value: 'AWD' },
    ];
    expect(describeAppliedFilters(filters, attributes)).toEqual([
      { fieldId: 'drivetrain', label: 'Drivetrain: AWD' },
    ]);
  });

  it('not_equals reads as "<Label>: not <value>"', () => {
    const filters: WorkspaceFilter[] = [{ fieldId: 'color', operator: 'not_equals', value: 'Red' }];
    expect(describeAppliedFilters(filters, attributes)).toEqual([
      { fieldId: 'color', label: 'Color: not Red' },
    ]);
  });

  it('contains reads as "<Label>: contains “<value>”" with real curly quotes', () => {
    const filters: WorkspaceFilter[] = [{ fieldId: 'color', operator: 'contains', value: 'red' }];
    const [chip] = describeAppliedFilters(filters, attributes);
    expect(chip?.label).toBe('Color: contains “red”');
    // Explicit character-level proof the quotes are the curly variant, not
    // straight ASCII quotes that would silently satisfy a looser assertion.
    expect(chip?.label).toContain('“');
    expect(chip?.label).toContain('”');
  });

  it('less_than reads as "<Label>: under <formatted>"', () => {
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'less_than', value: '25000' },
    ];
    expect(describeAppliedFilters(filters, attributes)).toEqual([
      { fieldId: 'price', label: 'Price: under 25,000 USD' },
    ]);
  });

  it('less_than_or_equal reads as "<Label>: <formatted> or less"', () => {
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'less_than_or_equal', value: '25000' },
    ];
    expect(describeAppliedFilters(filters, attributes)).toEqual([
      { fieldId: 'price', label: 'Price: 25,000 USD or less' },
    ]);
  });

  it('greater_than reads as "<Label>: over <formatted>"', () => {
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'greater_than', value: '20000' },
    ];
    expect(describeAppliedFilters(filters, attributes)).toEqual([
      { fieldId: 'price', label: 'Price: over 20,000 USD' },
    ]);
  });

  it('greater_than_or_equal reads as "<Label>: <formatted> or more"', () => {
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'greater_than_or_equal', value: '20000' },
    ];
    expect(describeAppliedFilters(filters, attributes)).toEqual([
      { fieldId: 'price', label: 'Price: 20,000 USD or more' },
    ]);
  });

  it('a money attribute renders its real currency symbol when the options carry one', () => {
    const filters: WorkspaceFilter[] = [
      { fieldId: 'msrp', operator: 'less_than_or_equal', value: '30000' },
    ];
    const options = [
      buildOption('c1', { msrp: { type: 'money', amount: 29500, currency: 'USD' } }),
    ];
    expect(describeAppliedFilters(filters, attributes, options)).toEqual([
      { fieldId: 'msrp', label: 'MSRP: $30,000 or less' },
    ]);
  });

  it('a number attribute renders its declared unit', () => {
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'less_than_or_equal', value: '25000' },
    ];
    expect(describeAppliedFilters(filters, attributes)).toEqual([
      { fieldId: 'price', label: 'Price: 25,000 USD or less' },
    ]);
  });

  it('an unparseable numeric value falls back to the raw string unchanged', () => {
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'less_than', value: 'a-lot' },
    ];
    expect(describeAppliedFilters(filters, attributes)).toEqual([
      { fieldId: 'price', label: 'Price: under a-lot' },
    ]);
  });

  it('a stale fieldId matching no definition produces no chip', () => {
    const filters: WorkspaceFilter[] = [
      { fieldId: 'retired-field', operator: 'equals', value: 'x' },
    ];
    expect(describeAppliedFilters(filters, attributes)).toEqual([]);
  });

  it('orders chips by attributeDefinitions order, not the order filters were applied in', () => {
    // Deliberately built in the WRONG order (price before awd, msrp before
    // color) so this only passes if the function re-sorts by definition
    // order rather than echoing `filters` back -- `upsertFilter` appends, so
    // the raw array order would otherwise jump under the user's cursor as
    // they toggle controls.
    const filters: WorkspaceFilter[] = [
      { fieldId: 'msrp', operator: 'less_than_or_equal', value: '30000' },
      { fieldId: 'price', operator: 'less_than_or_equal', value: '25000' },
      { fieldId: 'color', operator: 'equals', value: 'Red' },
      { fieldId: 'awd', operator: 'equals', value: 'true' },
    ];
    const chips = describeAppliedFilters(filters, attributes);
    expect(chips.map((chip) => chip.fieldId)).toEqual(['awd', 'color', 'price', 'msrp']);
  });
});

// ============================================================================

/**
 * The model's own narrowing, which is a genuinely different thing from a
 * filter even though it lands in the same rendered list.
 *
 * A filter is a RULE the person set ("under $30k"); this is a LITERAL SET
 * the assistant named ("these three"). They compose -- both must hold -- and
 * the two reasons stay separately visible and separately removable in
 * `FilterBar`, which is what keeps a narrowed list honest about who narrowed
 * it and why.
 */
describe('applyAssistantNarrowing', () => {
  it('returns every option as a NEW array when the assistant has narrowed nothing', () => {
    const options = [buildOption('c1'), buildOption('c2')];
    const result = applyAssistantNarrowing(options, undefined);
    expect(result).toEqual(options);
    expect(result).not.toBe(options);
  });

  it('keeps only the named options', () => {
    const options = [buildOption('c1'), buildOption('c2'), buildOption('c3')];
    expect(applyAssistantNarrowing(options, ['c1', 'c3']).map((o) => o.id)).toEqual(['c1', 'c3']);
  });

  it("preserves the case's own option order rather than the order the assistant listed ids in", () => {
    // The list order is the person's own working arrangement -- the order
    // they added options in. A model naming ids in a different order is
    // expressing WHICH options to show, not asking for a re-sort, and
    // silently resequencing the page underneath someone would be a change
    // they never asked for.
    const options = [buildOption('c1'), buildOption('c2'), buildOption('c3')];
    expect(applyAssistantNarrowing(options, ['c3', 'c1']).map((o) => o.id)).toEqual(['c1', 'c3']);
  });

  it('ignores an id naming no saved option instead of failing', () => {
    // A `visibleOptionIds` array persisted before an option was deleted
    // still names it. That is ordinary staleness, not corruption.
    const options = [buildOption('c1'), buildOption('c2')];
    expect(applyAssistantNarrowing(options, ['c1', 'ghost']).map((o) => o.id)).toEqual(['c1']);
  });

  it('narrows to nothing when the assistant names an empty set, rather than quietly showing everything', () => {
    // `[]` is a real, schema-valid value meaning "show none of them". Reading
    // it as "no narrowing" would silently contradict what was persisted.
    const options = [buildOption('c1'), buildOption('c2')];
    expect(applyAssistantNarrowing(options, [])).toEqual([]);
  });

  it('never mutates the options it was handed', () => {
    const options = [buildOption('c1'), buildOption('c2')];
    const snapshot = structuredClone(options);
    applyAssistantNarrowing(options, ['c2']);
    expect(options).toEqual(snapshot);
  });

  it('composes with applyWorkspaceFilters -- both narrowings hold, in either order', () => {
    const attributes: AttributeDefinition[] = [
      buildAttribute({ id: 'price', label: 'Price', valueType: 'number' }),
    ];
    const options = [
      buildOption('c1', { price: { type: 'number', value: 24500 } }),
      buildOption('c2', { price: { type: 'number', value: 31995 } }),
      buildOption('c3', { price: { type: 'number', value: 22995 } }),
    ];
    const filters: WorkspaceFilter[] = [
      { fieldId: 'price', operator: 'less_than', value: '30000' },
    ];

    const narrowedThenFiltered = applyWorkspaceFilters(
      applyAssistantNarrowing(options, ['c1', 'c2']),
      filters,
      attributes,
    );
    const filteredThenNarrowed = applyAssistantNarrowing(
      applyWorkspaceFilters(options, filters, attributes),
      ['c1', 'c2'],
    );

    expect(narrowedThenFiltered.map((o) => o.id)).toEqual(['c1']);
    expect(filteredThenNarrowed.map((o) => o.id)).toEqual(['c1']);
  });
});
