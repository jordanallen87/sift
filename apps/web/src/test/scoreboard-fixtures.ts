/**
 * Two `CaseState` fixtures shaped like the two SHIPPED decision packs, for
 * every test that renders the deterministic scoreboard.
 *
 * ## Why two, and why they mirror real packs
 *
 * Every genericity claim in this repository that was only ever tested
 * against `car-purchase` has turned out to be wrong -- `OptionListView`'s
 * own header comment records a card that clipped "Addresses the root ca…"
 * in a 202px column, found only by switching packs, and `option-profile.ts`
 * exists because a narrow card once rendered six identity fields and no
 * price. So the scoreboard surfaces are tested against both pack SHAPES
 * from the start rather than against one plus an assertion of generality.
 *
 * These are not the compiled packs (`apps/web` deliberately does not depend
 * on `@sift/packs`; ADR 0012 has the workspace computing its board from the
 * snapshot it already holds). They are hand-built case states whose
 * criteria, attribute definitions, labels, and value types are copied from
 * `packages/packs/src/car-purchase.ts` and
 * `packages/packs/src/home-energy-guardian.ts` verbatim, so the interesting
 * differences between the two packs are real rather than invented:
 *
 *   | shape                                    | car-purchase | home-energy |
 *   | ---------------------------------------- | ------------ | ----------- |
 *   | composite criterion (`composedOfAttributes`) | yes      | no          |
 *   | `hard_constraint` criterion              | no           | yes         |
 *   | criterion with NO attribute (`not_applicable`) | no     | yes         |
 *   | `direction: 'qualitative'` (`not_comparable`) | no      | yes         |
 *   | ordered enum (`orderedValues`)            | yes         | yes         |
 *   | boolean attribute                         | no          | yes         |
 *   | criterion/attribute polarity disagreement | yes (`pref.deal_value`) | no |
 *   | longest criterion label                   | 62 chars    | 64 chars    |
 *   | an entity that cannot be ranked at all    | yes         | yes         |
 *
 * The exact scores these produce are asserted nowhere: tests read the board
 * through `buildWorkspaceScoreboard` and assert RELATIONSHIPS (this option
 * outranks that one, this criterion is the decisive one, this option has no
 * rank at all). Pinning literal percentages would make every one of these
 * tests a restatement of `scoring.ts`'s arithmetic rather than a check on
 * what the UI does with it.
 */
import type {
  AttributeDefinition,
  AttributeRecord,
  AttributeValue,
  CaseState,
  Criterion,
  EntityRecord,
  PresentationDefinition,
} from '@sift/contracts';
import { buildFixtureCaseState } from './fixtures.js';

const FIXED_TIMESTAMP = '2026-08-27T00:00:00.000Z';

/**
 * One `AttributeRecord` with the boring provenance fields filled in -- these
 * fixtures are about SCORES, so every record is a plain user-entered
 * assertion unless a test says otherwise.
 *
 * `status` is the one field worth passing: `'conflicted'` is what makes the
 * engine mark a criterion `disputed` (honesty rule 6), and it is the only
 * `AttributeStatus` that changes a scoreboard at all.
 */
function record(
  definitionId: string,
  label: string,
  value: AttributeValue,
  status: AttributeRecord['status'] = 'asserted',
): AttributeRecord {
  return {
    definitionId,
    label,
    value,
    origin: 'user',
    sourceIds: [],
    status,
    updatedAt: FIXED_TIMESTAMP,
  };
}

function entity(
  id: string,
  kind: string,
  label: string,
  attributes: Record<string, AttributeRecord>,
): EntityRecord {
  return {
    id,
    kind,
    label,
    attributes,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
  };
}

// --- car-purchase shape -------------------------------------------------

/**
 * Copied from `packages/packs/src/car-purchase.ts`, trimmed to the
 * attributes its five default criteria actually measure plus one identity
 * field. `orderedValues` is worst-first exactly as the real pack declares
 * it (ADR 0012 §3: `allowedValues` lists these best-first, which is why the
 * engine refuses to read an ordering out of it).
 */
const CAR_RATING_SCALE = ['Not Rated', 'Recommended', 'Top Safety Pick', 'Top Safety Pick+'];
const CAR_COMFORT_SCALE = ['Poor', 'Fair', 'Good', 'Excellent'];

export const CAR_DEFINITIONS: AttributeDefinition[] = [
  {
    id: 'car.make',
    label: 'Make',
    valueType: 'string',
    required: true,
    appliesTo: ['car'],
    evidenceExpectation: 'assertion',
    comparison: 'none',
    sensitive: false,
  },
  {
    id: 'car.out_the_door_price',
    label: 'Out-the-door price',
    valueType: 'money',
    required: true,
    appliesTo: ['car'],
    evidenceExpectation: 'source',
    // The half of ADR 0012's rule-2 contradiction that lives on the
    // attribute: a lower price is a better deal, whatever `pref.deal_value`
    // says about itself.
    comparison: 'lower_better',
    sensitive: false,
  },
  {
    id: 'car.five_year_ownership_cost',
    label: '5-year ownership cost',
    valueType: 'money',
    required: true,
    appliesTo: ['car'],
    evidenceExpectation: 'source',
    comparison: 'lower_better',
    sensitive: false,
  },
  {
    id: 'car.crash_safety_rating',
    label: 'Crash safety rating',
    valueType: 'enum',
    required: true,
    appliesTo: ['car'],
    allowedValues: [...CAR_RATING_SCALE].reverse(),
    orderedValues: CAR_RATING_SCALE,
    evidenceExpectation: 'source',
    comparison: 'higher_better',
    sensitive: false,
  },
  {
    id: 'car.driver_assistance_rating',
    label: 'Driver assistance effectiveness rating',
    valueType: 'enum',
    required: true,
    appliesTo: ['car'],
    allowedValues: [...CAR_RATING_SCALE].reverse(),
    orderedValues: CAR_RATING_SCALE,
    evidenceExpectation: 'source',
    comparison: 'higher_better',
    sensitive: false,
  },
  {
    id: 'car.reliability_rating',
    label: 'Reliability rating',
    valueType: 'enum',
    required: true,
    appliesTo: ['car'],
    allowedValues: [...CAR_RATING_SCALE].reverse(),
    orderedValues: CAR_RATING_SCALE,
    evidenceExpectation: 'source',
    comparison: 'higher_better',
    sensitive: false,
  },
  {
    id: 'car.cargo_volume_cu_ft',
    label: 'Cargo volume behind the second row',
    valueType: 'number',
    required: false,
    appliesTo: ['car'],
    unit: 'cu ft',
    evidenceExpectation: 'source',
    comparison: 'higher_better',
    sensitive: false,
  },
  {
    id: 'car.second_row_legroom_in',
    label: 'Second-row legroom',
    valueType: 'number',
    required: false,
    appliesTo: ['car'],
    unit: 'in',
    evidenceExpectation: 'source',
    comparison: 'higher_better',
    sensitive: false,
  },
  {
    id: 'car.driving_comfort_rating',
    label: 'Driving comfort rating',
    valueType: 'enum',
    required: false,
    appliesTo: ['car'],
    allowedValues: [...CAR_COMFORT_SCALE].reverse(),
    orderedValues: CAR_COMFORT_SCALE,
    evidenceExpectation: 'source',
    comparison: 'higher_better',
    sensitive: false,
  },
];

/** The five default criteria from `car-purchase.ts`, weights and all. `pref.household_fit` keeps its real two-part composite shape (the real pack names five parts; two is enough to exercise the "averaged across N measures" path). */
export const CAR_CRITERIA: Criterion[] = [
  {
    id: 'pref.safety_reliability',
    label: 'Safety and reliability',
    kind: 'preference',
    weight: 30,
    direction: 'higher_better',
    composedOfAttributes: [
      'car.crash_safety_rating',
      'car.driver_assistance_rating',
      'car.reliability_rating',
    ],
    question:
      'Composite of crash safety, driver assistance, and reliability ratings across independent sources.',
    origin: 'pack',
    status: 'active',
  },
  {
    id: 'pref.ownership_cost',
    label: '5-year ownership cost (fuel, maintenance, depreciation, financing)',
    kind: 'preference',
    weight: 30,
    direction: 'lower_better',
    appliesToAttribute: 'car.five_year_ownership_cost',
    origin: 'pack',
    status: 'active',
  },
  {
    id: 'pref.deal_value',
    label: 'Deal value (normalized out-the-door price vs. market)',
    kind: 'preference',
    weight: 20,
    // Deliberately contradicts the attribute's own `lower_better`, exactly
    // as the shipped pack does. The attribute wins (honesty rule 2).
    direction: 'higher_better',
    appliesToAttribute: 'car.out_the_door_price',
    origin: 'pack',
    status: 'active',
  },
  {
    id: 'pref.household_fit',
    label: 'Household fit (cargo, rear seat, known specification match)',
    kind: 'preference',
    weight: 15,
    direction: 'higher_better',
    composedOfAttributes: ['car.cargo_volume_cu_ft', 'car.second_row_legroom_in'],
    question:
      'Composite of cargo dimensions, rear-seat specifications, and known specification match against household needs.',
    origin: 'pack',
    status: 'active',
  },
  {
    id: 'pref.driving_comfort',
    label: 'Driving comfort',
    kind: 'preference',
    weight: 5,
    direction: 'higher_better',
    appliesToAttribute: 'car.driving_comfort_rating',
    origin: 'pack',
    status: 'active',
  },
];

export const CAR_PRESENTATION: PresentationDefinition = {
  optionLabel: 'Car',
  optionLabelPlural: 'Cars',
  prominentAttributeIds: ['car.out_the_door_price', 'car.five_year_ownership_cost'],
  attributeGroups: [
    { id: 'basics', label: 'Basics', attributeIds: ['car.make'] },
    {
      id: 'cost',
      label: 'Cost',
      attributeIds: ['car.out_the_door_price', 'car.five_year_ownership_cost'],
    },
  ],
};

function car(
  id: string,
  label: string,
  values: {
    make: string;
    price?: number;
    ownership?: number;
    crash?: string;
    assistance?: string;
    reliability?: string;
    cargo?: number;
    legroom?: number;
    comfort?: string;
    /** Attribute ids whose sources contradict each other -- `AttributeStatus: 'conflicted'`, the input to honesty rule 6. */
    conflicted?: string[];
  },
): EntityRecord {
  const conflicted = new Set(values.conflicted ?? []);
  const status = (id: string): AttributeRecord['status'] =>
    conflicted.has(id) ? 'conflicted' : 'asserted';
  const attributes: Record<string, AttributeRecord> = {
    'car.make': record('car.make', 'Make', { type: 'string', value: values.make }),
  };
  if (values.price !== undefined) {
    attributes['car.out_the_door_price'] = record(
      'car.out_the_door_price',
      'Out-the-door price',
      { type: 'money', amount: values.price, currency: 'USD' },
      status('car.out_the_door_price'),
    );
  }
  if (values.ownership !== undefined) {
    attributes['car.five_year_ownership_cost'] = record(
      'car.five_year_ownership_cost',
      '5-year ownership cost',
      { type: 'money', amount: values.ownership, currency: 'USD' },
      status('car.five_year_ownership_cost'),
    );
  }
  if (values.crash !== undefined) {
    attributes['car.crash_safety_rating'] = record(
      'car.crash_safety_rating',
      'Crash safety rating',
      { type: 'enum', value: values.crash },
      status('car.crash_safety_rating'),
    );
  }
  if (values.assistance !== undefined) {
    attributes['car.driver_assistance_rating'] = record(
      'car.driver_assistance_rating',
      'Driver assistance effectiveness rating',
      { type: 'enum', value: values.assistance },
      status('car.driver_assistance_rating'),
    );
  }
  if (values.reliability !== undefined) {
    attributes['car.reliability_rating'] = record(
      'car.reliability_rating',
      'Reliability rating',
      { type: 'enum', value: values.reliability },
      status('car.reliability_rating'),
    );
  }
  if (values.cargo !== undefined) {
    attributes['car.cargo_volume_cu_ft'] = record(
      'car.cargo_volume_cu_ft',
      'Cargo volume behind the second row',
      { type: 'number', value: values.cargo, unit: 'cu ft' },
      status('car.cargo_volume_cu_ft'),
    );
  }
  if (values.legroom !== undefined) {
    attributes['car.second_row_legroom_in'] = record(
      'car.second_row_legroom_in',
      'Second-row legroom',
      { type: 'number', value: values.legroom, unit: 'in' },
      status('car.second_row_legroom_in'),
    );
  }
  if (values.comfort !== undefined) {
    attributes['car.driving_comfort_rating'] = record(
      'car.driving_comfort_rating',
      'Driving comfort rating',
      { type: 'enum', value: values.comfort },
      status('car.driving_comfort_rating'),
    );
  }
  return entity(id, 'car', label, attributes);
}

/**
 * Four cars, tuned so the board exercises every branch the UI has to
 * render:
 *
 *  - **RAV4 leads, and price alone is why.** Removing `pref.deal_value`
 *    from the weighting puts the CR-V first instead, so `deriveInsights`
 *    emits `decisive_criterion` naming exactly that one criterion. Nothing
 *    else in the fixture flips the order on its own -- verified by the
 *    tests, not asserted here.
 *  - **The Forester is thinly measured**, so `coverage_gap` fires at
 *    `severity: 'attention'` and its card must show a score alongside the
 *    fraction of the weighting that score rests on.
 *  - **The Outback has no measurements at all**, so its `total` is `null`
 *    and it must render as UNRANKED rather than last (honesty rule 1: "we
 *    did not look" is not "it is bad").
 */
export const CAR_OPTIONS: EntityRecord[] = [
  car('candidate-rav4', '2022 Toyota RAV4 XLE Hybrid AWD', {
    make: 'Toyota',
    price: 33_291,
    ownership: 44_800,
    crash: 'Top Safety Pick+',
    assistance: 'Top Safety Pick',
    reliability: 'Top Safety Pick',
    cargo: 37.6,
    legroom: 37.8,
    comfort: 'Excellent',
  }),
  car('candidate-crv', '2022 Honda CR-V EX-L AWD', {
    make: 'Honda',
    price: 36_940,
    ownership: 41_200,
    crash: 'Top Safety Pick+',
    assistance: 'Top Safety Pick+',
    reliability: 'Top Safety Pick',
    cargo: 39.2,
    legroom: 40.4,
    comfort: 'Good',
    // Honesty rule 6, in both of the shapes it comes in -- deliberately on
    // the LEADER, which is where a dispute does the most damage:
    //
    //  - `car.reliability_rating` is one of three parts of a composite, so
    //    the whole `pref.safety_reliability` line comes back `disputed`
    //    even though two of its three measures are settled. Removing that
    //    criterion does NOT flip the order, so it is a real dispute that is
    //    immaterial to the ranking: a card affordance, and no insight.
    //  - `car.five_year_ownership_cost` is the criterion that actually
    //    decides this board. Removing it hands the lead to the RAV4, so the
    //    engine emits `disputed_evidence` for it and only it -- the lead
    //    rests on a number the sources do not agree on.
    //
    // Both still score. Refusing to use a value that exists is its own
    // distortion; reporting the result as settled is the failure this rule
    // exists to prevent.
    conflicted: ['car.reliability_rating', 'car.five_year_ownership_cost'],
  }),
  car('candidate-forester', '2022 Subaru Forester Premium', {
    make: 'Subaru',
    price: 32_150,
    crash: 'Top Safety Pick',
    assistance: 'Recommended',
    reliability: 'Recommended',
  }),
  car('candidate-outback', '2022 Subaru Outback Limited', { make: 'Subaru' }),
];

export function buildCarCaseState(overrides: Partial<CaseState> = {}): CaseState {
  return buildFixtureCaseState({
    id: 'case-car',
    title: 'Choose our next car',
    attributeDefinitions: CAR_DEFINITIONS,
    criteria: CAR_CRITERIA,
    entities: CAR_OPTIONS,
    ...overrides,
  });
}

// --- home-energy-guardian shape -----------------------------------------

/** Copied from `packages/packs/src/home-energy-guardian.ts`. `energy.rough_effort_level`'s `orderedValues` is least-effort-first with `comparison: 'lower_better'`, exactly as the real pack declares it and for the reason its own comment gives. */
export const ENERGY_DEFINITIONS: AttributeDefinition[] = [
  {
    id: 'energy.billing_period',
    label: 'Billing period',
    valueType: 'string',
    required: true,
    appliesTo: ['billing_cycle'],
    evidenceExpectation: 'source',
    comparison: 'none',
    sensitive: false,
  },
  {
    id: 'energy.emergency_risk_present',
    label: 'Electrical, gas, fire, or medical-equipment risk flagged',
    valueType: 'boolean',
    required: false,
    appliesTo: ['billing_cycle'],
    evidenceExpectation: 'assertion',
    comparison: 'constraint',
    sensitive: false,
  },
  {
    id: 'energy.response_option_description',
    label: 'Description',
    valueType: 'text',
    required: true,
    appliesTo: ['response_option'],
    evidenceExpectation: 'source',
    comparison: 'none',
    sensitive: false,
  },
  {
    id: 'energy.rough_cost',
    label: 'Rough cost',
    valueType: 'money',
    required: true,
    appliesTo: ['response_option'],
    evidenceExpectation: 'source',
    comparison: 'lower_better',
    sensitive: false,
  },
  {
    id: 'energy.rough_effort_level',
    label: 'Rough effort level',
    valueType: 'enum',
    required: true,
    appliesTo: ['response_option'],
    allowedValues: ['low', 'medium', 'high'],
    orderedValues: ['low', 'medium', 'high'],
    evidenceExpectation: 'source',
    comparison: 'lower_better',
    sensitive: false,
  },
  {
    id: 'energy.addresses_root_cause',
    label: 'Addresses the root cause',
    valueType: 'boolean',
    required: true,
    appliesTo: ['response_option'],
    evidenceExpectation: 'source',
    comparison: 'target',
    sensitive: false,
  },
  {
    id: 'energy.requires_consequential_action',
    label: 'Requires a consequential action to pursue',
    valueType: 'boolean',
    required: true,
    appliesTo: ['response_option'],
    evidenceExpectation: 'source',
    comparison: 'none',
    sensitive: false,
  },
];

/**
 * The pack's three defaults plus one user-added hard constraint.
 *
 * The user-added one is not decoration. The pack's OWN hard constraint
 * (`energy.no_emergency_risk`) declares `direction: 'qualitative'`, so the
 * engine reports it `not_comparable` and it can never actually flag an
 * option -- which means the shipped energy pack alone cannot exercise the
 * violated-constraint rendering at all. `criteria.allowUserDefined` is
 * `true` on this pack, so a household adding "nothing that needs a
 * consequential action" is the ordinary way that state arises.
 */
export const ENERGY_CRITERIA: Criterion[] = [
  {
    id: 'energy.cost',
    label: 'Lowest immediate cost',
    kind: 'preference',
    weight: 50,
    direction: 'lower_better',
    appliesToAttribute: 'energy.rough_cost',
    origin: 'pack',
    status: 'active',
  },
  {
    id: 'energy.conservation',
    label: 'Long-term waste reduction',
    kind: 'preference',
    weight: 50,
    direction: 'higher_better',
    // No `appliesToAttribute` and no `composedOfAttributes`, exactly as the
    // shipped pack declares it -- the `not_applicable` path, and half the
    // weighting.
    question:
      'Does this action address the root cause of the elevated usage rather than only monitor or defer it?',
    origin: 'pack',
    status: 'active',
  },
  {
    id: 'energy.no_emergency_risk',
    label: 'No electrical, gas, fire, or medical-equipment emergency risk',
    kind: 'hard_constraint',
    weight: 0,
    direction: 'qualitative',
    appliesToAttribute: 'energy.emergency_risk_present',
    question: 'Is there any electrical danger, gas leak, fire, or medical equipment risk present?',
    origin: 'pack',
    status: 'active',
  },
  {
    id: 'custom.no_consequential_action',
    label: 'Nothing that needs a consequential action from us',
    kind: 'hard_constraint',
    weight: 0,
    direction: 'lower_better',
    appliesToAttribute: 'energy.requires_consequential_action',
    origin: 'user',
    status: 'active',
  },
];

export const ENERGY_PRESENTATION: PresentationDefinition = {
  optionLabel: 'Response option',
  optionLabelPlural: 'Response options',
  prominentAttributeIds: ['energy.rough_cost', 'energy.rough_effort_level'],
  attributeGroups: [
    {
      id: 'response',
      label: 'What this involves',
      attributeIds: [
        'energy.response_option_description',
        'energy.rough_cost',
        'energy.rough_effort_level',
      ],
    },
  ],
};

function responseOption(
  id: string,
  label: string,
  values: {
    description: string;
    cost: number;
    effort: string;
    addressesRootCause: boolean;
    consequential: boolean;
    /** Marks `energy.rough_cost` as contradicted by its sources -- the second pack's own instance of honesty rule 6. */
    costDisputed?: boolean;
  },
): EntityRecord {
  return entity(id, 'response_option', label, {
    'energy.response_option_description': record(
      'energy.response_option_description',
      'Description',
      { type: 'text', value: values.description },
    ),
    'energy.rough_cost': record(
      'energy.rough_cost',
      'Rough cost',
      { type: 'money', amount: values.cost, currency: 'USD' },
      values.costDisputed === true ? 'conflicted' : 'asserted',
    ),
    'energy.rough_effort_level': record('energy.rough_effort_level', 'Rough effort level', {
      type: 'enum',
      value: values.effort,
    }),
    'energy.addresses_root_cause': record(
      'energy.addresses_root_cause',
      'Addresses the root cause',
      { type: 'boolean', value: values.addressesRootCause },
    ),
    'energy.requires_consequential_action': record(
      'energy.requires_consequential_action',
      'Requires a consequential action to pursue',
      { type: 'boolean', value: values.consequential },
    ),
  });
}

/**
 * The billing cycle plus four response options.
 *
 * The billing cycle is deliberately included. `scoreCaseState` admits any
 * entity whose kind an active criterion measures, and
 * `energy.no_emergency_risk` measures an attribute declared on
 * `billing_cycle` -- so a real energy case genuinely puts this entity on
 * the board with nothing scorable on it. It is the second pack's own,
 * un-contrived version of "an option that must render as unranked rather
 * than last".
 */
export const ENERGY_OPTIONS: EntityRecord[] = [
  entity('billing-cycle-2026-07', 'billing_cycle', 'July 2026 billing cycle', {
    'energy.billing_period': record('energy.billing_period', 'Billing period', {
      type: 'string',
      value: 'Jul 1 - Jul 31, 2026 (31 days)',
    }),
    'energy.emergency_risk_present': record(
      'energy.emergency_risk_present',
      'Electrical, gas, fire, or medical-equipment risk flagged',
      { type: 'boolean', value: false },
    ),
  }),
  responseOption('option-monitor', 'Monitor for another cycle', {
    description: 'Take no action and re-read the meter after the next bill arrives.',
    cost: 0,
    effort: 'low',
    addressesRootCause: false,
    consequential: false,
  }),
  responseOption('option-thermostat', 'Replace the failed thermostat', {
    description: 'Swap the thermostat that stopped holding its setpoint in July.',
    cost: 180,
    effort: 'medium',
    addressesRootCause: true,
    consequential: false,
    // The second pack's disputed value, and deliberately on a NON-leader:
    // `disputed_evidence` only fires when the LEADER's lead depends on a
    // contested fact, so this option produces a `disputed` criterion line
    // and no insight at all. The card must still say so -- a dispute is a
    // fact about the measurement whether or not it changes the order.
    costDisputed: true,
  }),
  responseOption('option-rate-plan', 'Switch to the time-of-use rate plan', {
    description: 'Move to the utility’s time-of-use tariff at the next billing boundary.',
    cost: 0,
    effort: 'medium',
    addressesRootCause: false,
    consequential: false,
  }),
  responseOption('option-audit', 'Request a professional energy audit', {
    description: 'Book a certified auditor to survey the envelope and the HVAC system.',
    cost: 425,
    effort: 'high',
    addressesRootCause: true,
    // Trips the household's own hard constraint -- and must still render,
    // still score, and still be selectable (honesty rule 4).
    consequential: true,
  }),
];

export function buildEnergyCaseState(overrides: Partial<CaseState> = {}): CaseState {
  return buildFixtureCaseState({
    id: 'case-energy',
    title: 'Why is our energy bill so high?',
    pack: {
      id: 'home-energy-guardian',
      version: '1.0.0',
      compiledHash: 'c'.repeat(64),
      selectedBy: 'user',
      reasons: [],
    },
    attributeDefinitions: ENERGY_DEFINITIONS,
    criteria: ENERGY_CRITERIA,
    entities: ENERGY_OPTIONS,
    ...overrides,
  });
}
