/**
 * Behavioral suite for `option-profile.ts` -- the shared module that joins a
 * single option to its claims, sources, and full provenance for both the
 * browse card (`pickCardAttributeIds` / `summarizeOptionSignals`) and the
 * full detail sheet (`deriveOptionProfile`). See that module's own file
 * header and `/private/tmp/.../option-profile-contract.md` for the product
 * rules under test -- most importantly the shipped bug this module exists to
 * fix: a pack that declared no `prominentAttributeIds` fell back to reading
 * `attributeGroups[0]`, which for `car-purchase` is six identity fields
 * (make/model/trim/...) and no price at all, on the 390px card that is the
 * product's primary surface. Every `pickCardAttributeIds` case below traces
 * either to that fix or to the `isIdentityAttribute` exclusion rule that
 * makes it durable across every future pack, not just the one that exposed
 * it.
 *
 * Fixture convention: local `buildDefinition` / `buildOption` /
 * `buildOptionWithRecords` / `buildSource` / `buildClaim` / `buildNote` /
 * `buildCriterion` / `buildPresentation` / `buildRecommendation` /
 * `buildCaseState` factories, not hand-rolled partial literals, following
 * the exact pattern established in `workspace-filters.test.ts` and
 * `case-context.test.ts` (there is no shared `EntityRecord` /
 * `AttributeDefinition` / `Source` / `Claim` builder exported for reuse).
 * Where a test needs a record shape the factories' own defaults would
 * obscure -- an `AttributeRecord` with `status: 'unknown'` (value must be
 * absent), or one whose `value` is missing despite a non-`'unknown'` status
 * (a defensive branch, unreachable through schema-valid data but explicitly
 * coded) -- a full literal `AttributeRecord` is written out at the call
 * site instead, exactly as `workspace-filters.test.ts`'s own
 * `buildOptionWithRecord` call sites do.
 */
import { describe, expect, it } from 'vitest';
import type {
  AttributeDefinition,
  AttributeRecord,
  AttributeValue,
  CaseNote,
  CaseState,
  Claim,
  Criterion,
  EntityRecord,
  PresentationDefinition,
  Recommendation,
  Source,
} from '@sift/contracts';
import {
  deriveOptionProfile,
  pickCardAttributeIds,
  summarizeOptionSignals,
} from './option-profile.js';

// --- Fixtures -------------------------------------------------------------

const FIXED_TIMESTAMP = '2026-08-28T00:00:00.000Z';

function buildDefinition(overrides: Partial<AttributeDefinition> = {}): AttributeDefinition {
  return {
    id: 'mileage',
    label: 'Mileage',
    valueType: 'number',
    required: false,
    appliesTo: ['car'],
    evidenceExpectation: 'assertion',
    comparison: 'lower_better',
    sensitive: false,
    ...overrides,
  };
}

/** Builds one real `EntityRecord`; `values` maps attribute id to the `AttributeValue` this option asserts, each wrapped in an ordinary `status: 'asserted'` record. Mirrors `workspace-filters.test.ts`'s `buildOption` exactly. */
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
      updatedAt: FIXED_TIMESTAMP,
    };
  }
  return {
    id,
    kind: 'car',
    label: id,
    attributes,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

/** Builds one `EntityRecord` from already-complete `AttributeRecord`s -- the only way to reach a record whose `status`/`value` combination `buildOption` above cannot express (`'unknown'` status, or a record with no usable value at all). */
function buildOptionWithRecords(
  id: string,
  records: Record<string, AttributeRecord>,
): EntityRecord {
  return {
    id,
    kind: 'car',
    label: id,
    attributes: records,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function buildAttributeRecord(overrides: Partial<AttributeRecord> = {}): AttributeRecord {
  return {
    definitionId: 'mileage',
    label: 'Mileage',
    value: { type: 'number', value: 31000 },
    origin: 'agent_proposed',
    sourceIds: [],
    status: 'asserted',
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function buildCriterion(overrides: Partial<Criterion> = {}): Criterion {
  return {
    id: 'crit-1',
    label: 'Criterion',
    kind: 'preference',
    weight: 50,
    direction: 'higher_better',
    origin: 'user',
    status: 'active',
    ...overrides,
  };
}

function buildPresentation(
  overrides: Partial<PresentationDefinition> = {},
): PresentationDefinition {
  return {
    optionLabel: 'Option',
    optionLabelPlural: 'Options',
    attributeGroups: [],
    ...overrides,
  };
}

function buildSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 'src-1',
    url: 'https://example.com/review',
    title: 'Independent review',
    retrievedAt: FIXED_TIMESTAMP,
    origin: 'user_submitted',
    verification: 'unverified',
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

/** Omits `entityId` by default -- `Claim.entityId` is genuinely optional, and one required test case is a claim that never names any option at all. */
function buildClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    obligationId: 'obl-1',
    statement: 'Good fuel economy.',
    stance: 'supports',
    confidence: 0.6,
    sourceIds: [],
    stale: false,
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function buildNote(overrides: Partial<CaseNote> = {}): CaseNote {
  return {
    id: 'note-1',
    body: 'Observed detail worth remembering.',
    kind: 'observation',
    origin: 'user',
    authoredBy: 'user',
    optionIds: [],
    sourceIds: [],
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function buildRecommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: 'rec-1',
    status: 'ready',
    favoredOptionId: null,
    rationale: 'Because the evidence points this way.',
    facts: [],
    hypotheses: [],
    confidence: 0.7,
    limitations: [],
    sourceIds: [],
    resolvedObligationIds: [],
    acceptedUncertaintyObligationIds: [],
    generatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

type OptionProfileCaseState = Pick<
  CaseState,
  'entities' | 'attributeDefinitions' | 'claims' | 'sources' | 'notes' | 'recommendation'
>;

/**
 * Deliberately omits the `notes` key entirely when no override supplies it
 * (rather than defaulting it to `[]`), so tests exercising the real-world
 * "this case has never had a note" state -- `CaseState.notes` is
 * `.optional()`, not defaulted -- get that state for free instead of every
 * caller having to remember to delete the key.
 */
function buildCaseState(overrides: Partial<OptionProfileCaseState> = {}): OptionProfileCaseState {
  return {
    entities: [],
    attributeDefinitions: [],
    claims: [],
    sources: [],
    recommendation: null,
    ...overrides,
  };
}

// ============================================================================

describe('pickCardAttributeIds', () => {
  it("uses pack prominentAttributeIds, in the pack's declared order -- not definition order", () => {
    const definitions = [
      buildDefinition({
        id: 'price',
        label: 'Price',
        valueType: 'money',
        comparison: 'lower_better',
      }),
      buildDefinition({
        id: 'mileage',
        label: 'Mileage',
        valueType: 'number',
        comparison: 'lower_better',
      }),
      buildDefinition({
        id: 'rating',
        label: 'Rating',
        valueType: 'number',
        comparison: 'higher_better',
      }),
    ];
    const presentation = buildPresentation({ prominentAttributeIds: ['mileage', 'price'] });
    expect(pickCardAttributeIds(definitions, presentation, [], 'car', 5)).toEqual([
      'mileage',
      'price',
    ]);
  });

  it('skips a prominentAttributeIds entry that matches no definition, rather than rendering it blank', () => {
    const definitions = [buildDefinition({ id: 'price', valueType: 'money' })];
    const presentation = buildPresentation({
      prominentAttributeIds: ['price', 'stale-id-from-an-older-pack-version'],
    });
    expect(pickCardAttributeIds(definitions, presentation, [], 'car', 5)).toEqual(['price']);
  });

  it("skips a prominentAttributeIds entry whose definition does not apply to this option's kind", () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money', appliesTo: ['car'] }),
      buildDefinition({ id: 'cargo_volume', valueType: 'number', appliesTo: ['boat'] }),
    ];
    const presentation = buildPresentation({ prominentAttributeIds: ['cargo_volume', 'price'] });
    expect(pickCardAttributeIds(definitions, presentation, [], 'car', 5)).toEqual(['price']);
  });

  it('falls through to the next rule when every declared prominentAttributeIds entry is stale or inapplicable, rather than returning an empty list', () => {
    // Both declared ids are dead ends: one matches nothing, and the
    // exercise is proving the function does NOT then return `[]` -- it
    // must behave exactly as if the pack had declared no field at all, so
    // the next-priority rule (criterion weight) still gets a chance.
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money', comparison: 'lower_better' }),
      buildDefinition({ id: 'mileage', valueType: 'number', comparison: 'lower_better' }),
    ];
    const presentation = buildPresentation({ prominentAttributeIds: ['ghost-1', 'ghost-2'] });
    const criteria = [buildCriterion({ id: 'c1', appliesToAttribute: 'mileage', weight: 80 })];
    expect(pickCardAttributeIds(definitions, presentation, criteria, 'car', 5)).toEqual([
      'mileage',
    ]);
  });

  it('with no prominentAttributeIds, ranks by the heaviest Criterion.appliesToAttribute weight, descending', () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money', comparison: 'lower_better' }),
      buildDefinition({ id: 'mileage', valueType: 'number', comparison: 'lower_better' }),
      buildDefinition({ id: 'rating', valueType: 'number', comparison: 'higher_better' }),
    ];
    const criteria = [
      buildCriterion({ id: 'c1', appliesToAttribute: 'price', weight: 40 }),
      buildCriterion({ id: 'c2', appliesToAttribute: 'mileage', weight: 90 }),
      buildCriterion({ id: 'c3', appliesToAttribute: 'rating', weight: 65 }),
    ];
    expect(pickCardAttributeIds(definitions, null, criteria, 'car', 5)).toEqual([
      'mileage',
      'rating',
      'price',
    ]);
  });

  it('a criterion with no appliesToAttribute at all, or one naming an attribute id that does not exist, contributes zero weight', () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money' }),
      buildDefinition({ id: 'mileage', valueType: 'number' }),
    ];
    const criteria = [
      buildCriterion({ id: 'c1', weight: 90 }), // no appliesToAttribute
      buildCriterion({ id: 'c2', appliesToAttribute: 'ghost-attribute', weight: 95 }),
    ];
    // Neither criterion can attach its weight to any real definition, so
    // this falls all the way through to the money-first rule -- proof the
    // two criteria were truly ignored, not accidentally matched by index.
    expect(pickCardAttributeIds(definitions, null, criteria, 'car', 5)).toEqual([
      'price',
      'mileage',
    ]);
  });

  it('with neither prominentAttributeIds nor any matching criterion, money-typed attributes come first, then declaration order', () => {
    const definitions = [
      buildDefinition({ id: 'mileage', valueType: 'number' }),
      buildDefinition({ id: 'rating', valueType: 'number' }),
      buildDefinition({ id: 'price', valueType: 'money' }),
      buildDefinition({ id: 'warranty_months', valueType: 'number' }),
    ];
    expect(pickCardAttributeIds(definitions, null, [], 'car', 5)).toEqual([
      'price',
      'mileage',
      'rating',
      'warranty_months',
    ]);
  });

  // Identity exclusion is written as three separate branch-by-branch
  // assertions rather than one -- this exclusion is the actual defect
  // being fixed here (a 390px card previously showed six identity fields
  // and no price), so each precedence branch must prove it independently.
  it('excludes an identity attribute even when the pack explicitly names it in prominentAttributeIds (branch 1)', () => {
    const definitions = [
      buildDefinition({ id: 'make', valueType: 'string', comparison: 'none' }), // identity
      buildDefinition({ id: 'price', valueType: 'money', comparison: 'lower_better' }),
    ];
    const presentation = buildPresentation({ prominentAttributeIds: ['make', 'price'] });
    expect(pickCardAttributeIds(definitions, presentation, [], 'car', 5)).toEqual(['price']);
  });

  it('excludes an identity attribute even when a criterion assigns it the heaviest weight (branch 2)', () => {
    const definitions = [
      buildDefinition({ id: 'make', valueType: 'string', comparison: 'none' }), // identity
      buildDefinition({ id: 'mileage', valueType: 'number', comparison: 'lower_better' }),
    ];
    const criteria = [
      buildCriterion({ id: 'c1', appliesToAttribute: 'make', weight: 100 }),
      buildCriterion({ id: 'c2', appliesToAttribute: 'mileage', weight: 10 }),
    ];
    expect(pickCardAttributeIds(definitions, null, criteria, 'car', 5)).toEqual(['mileage']);
  });

  it('excludes an identity attribute from the money-first fallback entirely (branch 3)', () => {
    const definitions = [
      buildDefinition({ id: 'make', valueType: 'string', comparison: 'none' }), // identity
      buildDefinition({ id: 'price', valueType: 'money' }),
      buildDefinition({ id: 'mileage', valueType: 'number' }),
    ];
    expect(pickCardAttributeIds(definitions, null, [], 'car', 5)).toEqual(['price', 'mileage']);
  });

  it('limit is respected in the prominentAttributeIds branch', () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money' }),
      buildDefinition({ id: 'mileage', valueType: 'number' }),
      buildDefinition({ id: 'rating', valueType: 'number' }),
    ];
    const presentation = buildPresentation({
      prominentAttributeIds: ['price', 'mileage', 'rating'],
    });
    expect(pickCardAttributeIds(definitions, presentation, [], 'car', 2)).toEqual([
      'price',
      'mileage',
    ]);
  });

  it('limit is respected in the criterion-weight branch', () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money' }),
      buildDefinition({ id: 'mileage', valueType: 'number' }),
      buildDefinition({ id: 'rating', valueType: 'number' }),
    ];
    const criteria = [
      buildCriterion({ id: 'c1', appliesToAttribute: 'rating', weight: 90 }),
      buildCriterion({ id: 'c2', appliesToAttribute: 'mileage', weight: 60 }),
      buildCriterion({ id: 'c3', appliesToAttribute: 'price', weight: 30 }),
    ];
    expect(pickCardAttributeIds(definitions, null, criteria, 'car', 2)).toEqual([
      'rating',
      'mileage',
    ]);
  });

  it('limit is respected in the money-first fallback branch', () => {
    const definitions = [
      buildDefinition({ id: 'mileage', valueType: 'number' }),
      buildDefinition({ id: 'price', valueType: 'money' }),
      buildDefinition({ id: 'rating', valueType: 'number' }),
    ];
    expect(pickCardAttributeIds(definitions, null, [], 'car', 1)).toEqual(['price']);
  });
});

// ============================================================================

describe('summarizeOptionSignals', () => {
  it('counts a record that meets its evidenceExpectation as a strength', () => {
    const definitions = [buildDefinition({ id: 'mileage', evidenceExpectation: 'source' })];
    const option = buildOptionWithRecords('opt-1', {
      mileage: buildAttributeRecord({ definitionId: 'mileage', status: 'supported' }),
    });
    expect(summarizeOptionSignals(option, definitions)).toEqual({
      strengths: 1,
      concerns: 0,
      unresolved: 0,
    });
  });

  it('counts a record that does not meet its evidenceExpectation as a concern', () => {
    const definitions = [buildDefinition({ id: 'mileage', evidenceExpectation: 'verification' })];
    const option = buildOptionWithRecords('opt-1', {
      // 'asserted' clears a mere-assertion bar but not a verification bar.
      mileage: buildAttributeRecord({ definitionId: 'mileage', status: 'asserted' }),
    });
    expect(summarizeOptionSignals(option, definitions)).toEqual({
      strengths: 0,
      concerns: 1,
      unresolved: 0,
    });
  });

  it("counts status 'conflicted' as a concern even under the lenient 'assertion' expectation it would otherwise meet", () => {
    const definitions = [buildDefinition({ id: 'mileage', evidenceExpectation: 'assertion' })];
    const option = buildOptionWithRecords('opt-1', {
      mileage: buildAttributeRecord({ definitionId: 'mileage', status: 'conflicted' }),
    });
    expect(summarizeOptionSignals(option, definitions)).toEqual({
      strengths: 0,
      concerns: 1,
      unresolved: 0,
    });
  });

  it("counts a wholly absent record, one with status 'unknown', and one with no usable value despite a non-'unknown' status, all as unresolved", () => {
    const definitions = [
      buildDefinition({ id: 'a' }),
      buildDefinition({ id: 'b' }),
      buildDefinition({ id: 'c' }),
    ];
    const statusUnknown: AttributeRecord = {
      definitionId: 'b',
      label: 'B',
      origin: 'agent_proposed',
      sourceIds: [],
      status: 'unknown',
      updatedAt: FIXED_TIMESTAMP,
    };
    // Defensive branch: a record whose `status` claims a real value but
    // whose `value` is nonetheless absent. Unreachable through
    // schema-valid data (the schema requires `value` for every non-
    // `'unknown'` status), but `summarizeOptionSignals` checks
    // `record.value === undefined` as its own independent condition, so it
    // must not silently trust an inconsistent record.
    const valueMissingDespiteStatus: AttributeRecord = {
      definitionId: 'c',
      label: 'C',
      origin: 'agent_proposed',
      sourceIds: [],
      status: 'asserted',
      updatedAt: FIXED_TIMESTAMP,
    };
    const option = buildOptionWithRecords('opt-1', {
      b: statusUnknown,
      c: valueMissingDespiteStatus,
      // a: no record at all.
    });
    expect(summarizeOptionSignals(option, definitions)).toEqual({
      strengths: 0,
      concerns: 0,
      unresolved: 3,
    });
  });

  it('excludes identity attributes from all three counts, regardless of their own status', () => {
    const definitions = [buildDefinition({ id: 'make', valueType: 'string', comparison: 'none' })];
    const option = buildOptionWithRecords('opt-1', {
      make: buildAttributeRecord({
        definitionId: 'make',
        status: 'conflicted',
        value: { type: 'string', value: 'Toyota' },
      }),
    });
    expect(summarizeOptionSignals(option, definitions)).toEqual({
      strengths: 0,
      concerns: 0,
      unresolved: 0,
    });
  });

  it("excludes definitions that do not apply to the option's kind", () => {
    const definitions = [
      buildDefinition({ id: 'towing_capacity', valueType: 'number', appliesTo: ['boat'] }),
    ];
    const option = buildOptionWithRecords('opt-1', {
      // option.kind is 'car' (buildOptionWithRecords' default).
      towing_capacity: buildAttributeRecord({
        definitionId: 'towing_capacity',
        status: 'verified',
        value: { type: 'number', value: 500 },
      }),
    });
    expect(summarizeOptionSignals(option, definitions)).toEqual({
      strengths: 0,
      concerns: 0,
      unresolved: 0,
    });
  });

  it('the three counts always sum to the number of counted (applicable, non-identity) attributes', () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money', evidenceExpectation: 'source' }),
      buildDefinition({ id: 'mileage', valueType: 'number', evidenceExpectation: 'assertion' }),
      buildDefinition({ id: 'make', valueType: 'string', comparison: 'none' }), // identity -> excluded
      buildDefinition({ id: 'towing_capacity', valueType: 'number', appliesTo: ['boat'] }), // inapplicable -> excluded
    ];
    const option = buildOptionWithRecords('opt-1', {
      price: buildAttributeRecord({
        definitionId: 'price',
        status: 'verified',
        value: { type: 'money', amount: 1000, currency: 'USD' },
      }),
      // mileage: no record -> unresolved.
      make: buildAttributeRecord({
        definitionId: 'make',
        status: 'asserted',
        value: { type: 'string', value: 'Toyota' },
      }),
    });
    const counts = summarizeOptionSignals(option, definitions);
    // Only price + mileage are counted at all; make and towing_capacity
    // are excluded and must not appear in the sum either way.
    expect(counts.strengths + counts.concerns + counts.unresolved).toBe(2);
  });
});

// ============================================================================

describe('deriveOptionProfile', () => {
  it('returns null for an option id matching no entity -- an honest absence, never an empty shell (the honest-absence rule)', () => {
    const caseState = buildCaseState({ entities: [buildOption('opt-1')] });
    expect(deriveOptionProfile(caseState, 'opt-does-not-exist', null)).toBeNull();
  });

  it('groups follow presentation.attributeGroups order, omitting a group whose attributes are all absent rather than rendering it empty', () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money', appliesTo: ['car'] }),
      buildDefinition({ id: 'mileage', valueType: 'number', appliesTo: ['car'] }),
      // Applies to a different option kind entirely, so it can never be
      // present for this 'car' option -- the group listing it is the one
      // that must vanish.
      buildDefinition({ id: 'towing_capacity', valueType: 'number', appliesTo: ['boat'] }),
    ];
    const presentation = buildPresentation({
      attributeGroups: [
        { id: 'towing', label: 'Towing', attributeIds: ['towing_capacity'] },
        { id: 'specs', label: 'Specs', attributeIds: ['mileage'] },
        { id: 'pricing', label: 'Pricing', attributeIds: ['price'] },
      ],
    });
    const option = buildOption('opt-1', {
      price: { type: 'money', amount: 25000, currency: 'USD' },
      mileage: { type: 'number', value: 25000 },
    });
    const caseState = buildCaseState({ entities: [option], attributeDefinitions: definitions });
    const profile = deriveOptionProfile(caseState, 'opt-1', presentation);
    expect(profile?.groups.map((group) => group.id)).toEqual(['specs', 'pricing']);
  });

  it('places attributes the pack grouped nowhere into a trailing "Other details" group', () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money' }),
      buildDefinition({ id: 'mileage', valueType: 'number' }),
    ];
    const presentation = buildPresentation({
      attributeGroups: [{ id: 'pricing', label: 'Pricing', attributeIds: ['price'] }],
    });
    const option = buildOption('opt-1', {
      price: { type: 'money', amount: 25000, currency: 'USD' },
      mileage: { type: 'number', value: 25000 },
    });
    const caseState = buildCaseState({ entities: [option], attributeDefinitions: definitions });
    const profile = deriveOptionProfile(caseState, 'opt-1', presentation);
    expect(profile?.groups.map((group) => ({ id: group.id, label: group.label }))).toEqual([
      { id: 'pricing', label: 'Pricing' },
      { id: 'other', label: 'Other details' },
    ]);
    expect(profile?.groups[1]?.attributes.map((attribute) => attribute.definitionId)).toEqual([
      'mileage',
    ]);
  });

  it('with no presentation at all, every applicable attribute lands in a single "All details" group', () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money' }),
      buildDefinition({ id: 'mileage', valueType: 'number' }),
    ];
    const option = buildOption('opt-1', {
      price: { type: 'money', amount: 25000, currency: 'USD' },
      mileage: { type: 'number', value: 25000 },
    });
    const caseState = buildCaseState({ entities: [option], attributeDefinitions: definitions });
    const profile = deriveOptionProfile(caseState, 'opt-1', null);
    expect(profile?.groups.map((group) => ({ id: group.id, label: group.label }))).toEqual([
      { id: 'all', label: 'All details' },
    ]);
    expect(profile?.groups[0]?.attributes.map((attribute) => attribute.definitionId)).toEqual([
      'price',
      'mileage',
    ]);
  });

  it('flags a custom.* attribute custom: true and routes it to the ungrouped section, since no pack-authored group can list it', () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money' }),
      buildDefinition({
        id: 'custom.dog_crate_fit',
        valueType: 'boolean',
        comparison: 'higher_better',
      }),
    ];
    const presentation = buildPresentation({
      attributeGroups: [{ id: 'pricing', label: 'Pricing', attributeIds: ['price'] }],
    });
    const option = buildOption('opt-1', {
      price: { type: 'money', amount: 25000, currency: 'USD' },
      'custom.dog_crate_fit': { type: 'boolean', value: true },
    });
    const caseState = buildCaseState({ entities: [option], attributeDefinitions: definitions });
    const profile = deriveOptionProfile(caseState, 'opt-1', presentation);
    const otherGroup = profile?.groups.find((group) => group.id === 'other');
    expect(otherGroup?.attributes).toHaveLength(1);
    expect(otherGroup?.attributes[0]).toMatchObject({
      definitionId: 'custom.dog_crate_fit',
      custom: true,
    });
  });

  it("includes identity attributes in the profile -- unlike a card, a deliberate asymmetry ('what is this thing' is the first question a detail view answers)", () => {
    const definitions = [buildDefinition({ id: 'make', valueType: 'string', comparison: 'none' })];
    const option = buildOption('opt-1', { make: { type: 'string', value: 'Toyota' } });
    const caseState = buildCaseState({ entities: [option], attributeDefinitions: definitions });
    const profile = deriveOptionProfile(caseState, 'opt-1', null);
    expect(profile?.groups[0]?.attributes.map((attribute) => attribute.definitionId)).toEqual([
      'make',
    ]);
  });

  it('display is null for an unusable value, and a formatted string otherwise', () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money' }),
      buildDefinition({ id: 'mileage', valueType: 'number' }),
    ];
    const mileageUnknown: AttributeRecord = {
      definitionId: 'mileage',
      label: 'Mileage',
      origin: 'agent_proposed',
      sourceIds: [],
      status: 'unknown',
      updatedAt: FIXED_TIMESTAMP,
    };
    const option = buildOptionWithRecords('opt-1', {
      price: buildAttributeRecord({
        definitionId: 'price',
        value: { type: 'money', amount: 25000, currency: 'USD' },
        status: 'asserted',
      }),
      mileage: mileageUnknown,
    });
    const caseState = buildCaseState({ entities: [option], attributeDefinitions: definitions });
    const profile = deriveOptionProfile(caseState, 'opt-1', null);
    const attributes = profile?.groups[0]?.attributes ?? [];
    expect(attributes.find((attribute) => attribute.definitionId === 'price')?.display).toBe(
      '$25,000',
    );
    expect(
      attributes.find((attribute) => attribute.definitionId === 'mileage')?.display,
    ).toBeNull();
  });

  it("status is null when no record exists at all, and 'unknown' when a record exists with that status -- deliberately different results, since conflating them is the fabrication rule this module exists against", () => {
    const definitions = [
      buildDefinition({ id: 'price', valueType: 'money' }),
      buildDefinition({ id: 'mileage', valueType: 'number' }),
    ];
    const mileageUnknown: AttributeRecord = {
      definitionId: 'mileage',
      label: 'Mileage',
      origin: 'agent_proposed',
      sourceIds: [],
      status: 'unknown',
      updatedAt: FIXED_TIMESTAMP,
    };
    const option = buildOptionWithRecords('opt-1', {
      mileage: mileageUnknown,
      // price: no record at all.
    });
    const caseState = buildCaseState({ entities: [option], attributeDefinitions: definitions });
    const profile = deriveOptionProfile(caseState, 'opt-1', null);
    const attributes = profile?.groups[0]?.attributes ?? [];
    const priceStatus = attributes.find((attribute) => attribute.definitionId === 'price')?.status;
    const mileageStatus = attributes.find(
      (attribute) => attribute.definitionId === 'mileage',
    )?.status;
    expect(priceStatus).toBeNull();
    expect(mileageStatus).toBe('unknown');
    expect(priceStatus).not.toBe(mileageStatus);
  });

  it('carries origin, confidence, and updatedAt through verbatim', () => {
    const definitions = [buildDefinition({ id: 'mileage', valueType: 'number' })];
    const option = buildOptionWithRecords('opt-1', {
      mileage: buildAttributeRecord({
        definitionId: 'mileage',
        value: { type: 'number', value: 31000 },
        origin: 'agent_proposed',
        confidence: 0.42,
        updatedAt: '2026-07-04T12:00:00.000Z',
        status: 'supported',
      }),
    });
    const caseState = buildCaseState({ entities: [option], attributeDefinitions: definitions });
    const profile = deriveOptionProfile(caseState, 'opt-1', null);
    const attribute = profile?.groups[0]?.attributes[0];
    expect(attribute?.origin).toBe('agent_proposed');
    expect(attribute?.confidence).toBe(0.42);
    expect(attribute?.updatedAt).toBe('2026-07-04T12:00:00.000Z');
  });

  it("resolves an attribute's sourceIds to real Source records, dropping an id that resolves to nothing rather than surfacing a bare id", () => {
    const source = buildSource({ id: 'src-1' });
    const definitions = [buildDefinition({ id: 'mileage', valueType: 'number' })];
    const option = buildOptionWithRecords('opt-1', {
      mileage: buildAttributeRecord({
        definitionId: 'mileage',
        value: { type: 'number', value: 31000 },
        sourceIds: ['src-1', 'src-ghost'],
      }),
    });
    const caseState = buildCaseState({
      entities: [option],
      attributeDefinitions: definitions,
      sources: [source],
    });
    const profile = deriveOptionProfile(caseState, 'opt-1', null);
    expect(profile?.groups[0]?.attributes[0]?.sources).toEqual([source]);
  });

  it('relatedClaims selects exactly the claims recorded about this option, excluding other options and claims with no entityId at all', () => {
    const claimAboutThis = buildClaim({ id: 'claim-this', entityId: 'opt-1' });
    const claimAboutOther = buildClaim({ id: 'claim-other', entityId: 'opt-2' });
    const claimWithNoEntity = buildClaim({ id: 'claim-none' }); // entityId omitted entirely
    const option = buildOption('opt-1');
    const caseState = buildCaseState({
      entities: [option],
      claims: [claimAboutThis, claimAboutOther, claimWithNoEntity],
    });
    const profile = deriveOptionProfile(caseState, 'opt-1', null);
    expect(profile?.relatedClaims).toEqual([claimAboutThis]);
  });

  it("relatedSources unions sources reachable from related claims AND from the option's own attribute sourceIds, deduplicated", () => {
    const sharedSource = buildSource({ id: 'src-shared' });
    const claimOnlySource = buildSource({
      id: 'src-claim-only',
      url: 'https://example.com/claim-only',
    });
    const definitions = [buildDefinition({ id: 'mileage', valueType: 'number' })];
    const claim = buildClaim({
      id: 'claim-1',
      entityId: 'opt-1',
      sourceIds: ['src-shared', 'src-claim-only'],
    });
    const option = buildOptionWithRecords('opt-1', {
      // Reachable both via the claim above AND directly via this
      // attribute's own sourceIds -- the fixture that actually proves
      // dedup rather than merely proving both reachability paths work.
      mileage: buildAttributeRecord({
        definitionId: 'mileage',
        value: { type: 'number', value: 31000 },
        sourceIds: ['src-shared'],
      }),
    });
    const caseState = buildCaseState({
      entities: [option],
      attributeDefinitions: definitions,
      claims: [claim],
      sources: [sharedSource, claimOnlySource],
    });
    const profile = deriveOptionProfile(caseState, 'opt-1', null);
    expect(profile?.relatedSources).toEqual([sharedSource, claimOnlySource]);
  });

  it('relatedNotes selects notes whose optionIds includes this option', () => {
    const noteAboutThis = buildNote({ id: 'note-1', optionIds: ['opt-1'] });
    const noteAboutOther = buildNote({ id: 'note-2', optionIds: ['opt-2'] });
    const option = buildOption('opt-1');
    const caseState = buildCaseState({
      entities: [option],
      notes: [noteAboutThis, noteAboutOther],
    });
    const profile = deriveOptionProfile(caseState, 'opt-1', null);
    expect(profile?.relatedNotes).toEqual([noteAboutThis]);
  });

  it('relatedNotes is [] rather than throwing when the case has never had notes at all (CaseState.notes is optional, not defaulted)', () => {
    const option = buildOption('opt-1');
    const caseState = buildCaseState({ entities: [option] }); // no `notes` override -> the key is entirely absent
    expect(() => deriveOptionProfile(caseState, 'opt-1', null)).not.toThrow();
    expect(deriveOptionProfile(caseState, 'opt-1', null)?.relatedNotes).toEqual([]);
  });

  it('favored is true only when recommendation.favoredOptionId matches this option', () => {
    const option = buildOption('opt-1');
    const recommendation = buildRecommendation({ favoredOptionId: 'opt-1' });
    const caseState = buildCaseState({ entities: [option], recommendation });
    expect(deriveOptionProfile(caseState, 'opt-1', null)?.favored).toBe(true);
  });

  it('favored is false when recommendation.favoredOptionId names a different option', () => {
    const option = buildOption('opt-1');
    const recommendation = buildRecommendation({ favoredOptionId: 'opt-2' });
    const caseState = buildCaseState({ entities: [option], recommendation });
    expect(deriveOptionProfile(caseState, 'opt-1', null)?.favored).toBe(false);
  });

  it('favored is false for a null recommendation', () => {
    const option = buildOption('opt-1');
    const caseState = buildCaseState({ entities: [option], recommendation: null });
    expect(deriveOptionProfile(caseState, 'opt-1', null)?.favored).toBe(false);
  });
});
