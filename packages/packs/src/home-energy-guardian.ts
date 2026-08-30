/**
 * The real `home-energy-guardian@1.0.0` Decision Pack manifest ("Home
 * Energy Guardian"), implementing docs/specs/packs-and-routing.md "Home
 * Energy Guardian Decision Pack" and the bounded Strands Swarm orchestration
 * topology in docs/specs/strands-runtime.md "Energy Swarm". This is the
 * Tier-2 AWS/Strands-Swarm-hero pack.
 *
 * `HOME_ENERGY_GUARDIAN_MANIFEST` is the raw, uncompiled source manifest.
 * `compileHomeEnergyGuardianPack(catalog, clock)` is a thin convenience
 * wrapper around `compilePack` (`compiler.ts`) -- it adds no behavior of its
 * own, matching `car-purchase.ts`'s manifest+wrapper shape and the shape
 * `home-energy-guardian.test.ts` and later callers (case creation, Swarm
 * wiring, scenario fixtures -- separate, later tasks) expect.
 *
 * Grounding for every field is either a direct spec quote or an explicit
 * judgment call, each documented at its declaration below and recorded with
 * full reasoning in the dated docs/build-log.md entry for this task. The
 * fixture data this manifest's attributes/entities are shaped to match
 * lives in packages/scenarios/fixtures/energy/*.json (current-bill.json,
 * usage-history.json, weather-history.json, household-events.json,
 * rate-schedules.json, response-options.json, already authored by a sibling
 * task): case/household identifiers (`case-demo-energy-guardian`,
 * `household-demo-energy-01`), tariff ids (`tariff-standard-2024`,
 * `tariff-standard-2026`), the correlated household event id
 * (`event-thermostat-failure-2026-07`), and response-option ids
 * (`monitor-one-cycle`, `change-rate-plan`, `request-energy-audit`,
 * `request-hvac-inspection`) are case/evidence data, not manifest content,
 * so they do not appear directly in this file; this manifest's attribute
 * *definitions* are shaped so that data round-trips through them.
 *
 * This pack does not model 18 historical billing cycles as 18 separate
 * `billing_cycle` entities. usage-history.json/weather-history.json's prior
 *17 cycles are the *reference series* the `usage-history-query`/
 * `weather-lookup` fixture tools return to a specialist so it can compute
 * the current cycle's baseline/typical-weather figures (a separate, later
 * tool-implementation task); the pack's own typed attributes capture only
 * the *current* billing cycle under investigation plus the already-computed
 * comparison figures (baseline, anomaly, weather attribution, rate-change
 * attribution) those tools' skills derive from that series -- the same
 * discipline car-purchase.ts used to fold safety-reliability-sources.json's
 * per-source `findings[]` list down into three rating attributes on
 * `candidate` rather than modeling every source record as its own entity.
 */
import type { CapabilityCatalog } from './capability-catalog.js';
import { compilePack } from './compiler.js';
import type { Clock } from '@sift/core';
import type { CompiledDecisionPack, DecisionPackManifest } from '@sift/contracts';

export const HOME_ENERGY_GUARDIAN_MANIFEST: DecisionPackManifest = {
  schemaVersion: '1.0',

  identity: {
    id: 'home-energy-guardian',
    version: '1.0.0',
    name: 'Home Energy Guardian',
    description:
      "Investigates an unusually high home energy bill by isolating how much of the increase is explained by tariff or fee changes, weather-normalized usage, and a household or appliance event, then recommends response options that fit the household's cost and long-term-waste-reduction criteria, deferring any inspection request to explicit human confirmation.",
    tags: ['home-energy-guardian', 'energy', 'strands-swarm-hero', 'household-decision'],
  },

  // packs-and-routing.md "Home Energy Guardian Decision Pack" -> "Activation".
  // `intents` and `artifactKinds` are quoted verbatim from that section
  // (split into list items at its own comma boundaries, `artifactKinds`
  // additionally snake_cased to match car-purchase.ts's identifier
  // convention for this field). `exclusions` is likewise split at comma
  // boundaries from the spec's "Exclusion:" sentence; its trailing "The
  // demo stops and presents emergency guidance" is engine/UI *behavior*
  // triggered by this exclusion, not itself an exclusion noun phrase, so it
  // is documented here rather than added as a fifth list entry (the
  // protected `energy.no_emergency_risk` hard-constraint criterion below is
  // this manifest's declarative half of that behavior -- see its comment).
  // `keywords` and `entitySignals` are not given verbatim anywhere in the
  // spec (the manifest contract requires both fields, but only
  // `intents`/`artifactKinds`/`exclusions` have spec-given text) -- a
  // judgment call, chosen to signal an energy-bill-investigation intent
  // without echoing any capability this pack cannot perform (e.g. "book an
  // electrician" is deliberately omitted since the pack can only *propose*
  // an inspection, never schedule one).
  activation: {
    intents: [
      'unusual bill',
      'household energy monitoring',
      'rate-plan comparison',
      'unexplained usage increase',
    ],
    keywords: [
      'energy bill',
      'utility bill',
      'power bill',
      'electric bill',
      'bill spike',
      'usage increase',
      'rate plan',
      'kwh',
      'why is my bill so high',
      'energy audit',
    ],
    artifactKinds: [
      'utility_bill',
      'usage_history',
      'rate_schedule',
      'weather_history',
      'household_event_log',
    ],
    entitySignals: ['utility bill', 'energy usage', 'kwh', 'billing cycle', 'thermostat', 'hvac'],
    exclusions: ['electrical danger', 'gas leak', 'fire', 'medical equipment risk'],
  },

  entities: [
    {
      id: 'billing_cycle',
      label: 'Billing cycle under investigation',
      description:
        "The household's current billing cycle under anomaly investigation: bill totals, the computed weather/trend-normalized baseline and anomaly figures, weather attribution, tariff/rate-change attribution, any correlated household or appliance event, and any flagged safety/emergency risk.",
      attributeIds: [
        'energy.billing_period',
        'energy.billing_period_days',
        'energy.tariff_id',
        'energy.current_usage_kwh',
        'energy.fixed_monthly_customer_charge',
        'energy.volumetric_charge',
        'energy.current_bill_amount',
        'energy.baseline_bill_amount',
        'energy.baseline_usage_kwh',
        'energy.anomaly_percent_above_baseline',
        'energy.usage_gap_above_baseline_kwh',
        'energy.actual_heating_degree_days',
        'energy.actual_cooling_degree_days',
        'energy.typical_cooling_degree_days',
        'energy.excess_cooling_degree_days',
        'energy.usage_explained_by_weather_kwh',
        'energy.current_tariff_fixed_charge',
        'energy.current_tariff_volumetric_rate',
        'energy.prior_tariff_fixed_charge',
        'energy.prior_tariff_volumetric_rate',
        'energy.rate_change_attributable_amount',
        'energy.rate_change_attributable_percent_of_gap',
        'energy.correlated_event_type',
        'energy.correlated_event_date',
        'energy.correlated_event_label',
        'energy.correlated_event_description',
        'energy.correlated_event_status',
        'energy.emergency_risk_present',
      ],
    },
    {
      id: 'response_option',
      label: 'Response option',
      description:
        'One candidate action the household could take in response to the investigated bill anomaly (for example: monitor, switch rate plan, request an energy audit, request an HVAC/thermostat inspection).',
      attributeIds: [
        'energy.response_option_description',
        'energy.rough_cost',
        'energy.rough_effort_level',
        'energy.estimated_time_to_insight',
        'energy.addresses_root_cause',
        'energy.requires_consequential_action',
        'energy.consequential_action_note',
      ],
    },
  ],

  // Attribute definitions shaped to match the real fixture field names in
  // packages/scenarios/fixtures/energy/*.json: `billing_period`/
  // `billing_period_days`/`tariff_id`/`current_usage_kwh`/
  // `fixed_monthly_customer_charge`/`volumetric_charge`/
  // `current_bill_amount` <- current-bill.json's `billingPeriod`/`tariffId`/
  // `usage`/`charges`/`currentAmount` (`charges.totalAmount` and
  // `currentAmount` are the same 248.50 value reported twice in the
  // fixture; folded into the one `current_bill_amount` attribute rather
  // than declaring a duplicate). `baseline_bill_amount`/`baseline_usage_kwh`/
  // `anomaly_percent_above_baseline`/`usage_gap_above_baseline_kwh` <-
  // current-bill.json's `baseline`/`anomaly` (the deterministic
  // bill-normalizer computation `energy.anomaly`'s required E3 evidence
  // level verifies). `actual_heating_degree_days`/`actual_cooling_degree_days`
  // <- weather-history.json's per-cycle `hdd`/`cdd` for the current cycle.
  // `typical_cooling_degree_days`/`excess_cooling_degree_days`/
  // `usage_explained_by_weather_kwh` <- weather-history.json's current-cycle
  // `weatherAttribution.typicalCdd`/`excessCdd`/`usageExplainedByWeatherKwh`
  // (its `weatherSensitivityKwhPerCdd` regression coefficient and
  // `weatherSensitivityMethodology`/`arithmeticNote`/`conclusion` strings
  // are audit-trail/methodology detail, not decision-facing attributes --
  // excluded, matching car-purchase.ts's exclusion of
  // `computedBy`/`arithmeticNote`/`methodology` fields there).
  // `current_tariff_fixed_charge`/`current_tariff_volumetric_rate`/
  // `prior_tariff_fixed_charge`/`prior_tariff_volumetric_rate`/
  // `rate_change_attributable_amount`/`rate_change_attributable_percent_of_gap`
  // <- rate-schedules.json's `tariffs[]` (current vs. prior
  // `tariff-standard-2026`/`tariff-standard-2024` entries) and
  // `rateChangeImpactOnBaselineUsage` (its
  // `regulatoryFilingReference`/`arithmeticNote`/`note` fields are
  // administrative/audit-trail detail -- excluded on the same basis).
  // `correlated_event_type`/`_date`/`_label`/`_description`/`_status` <-
  // household-events.json's `events[]` entry for whichever event the
  // home-event-correlation skill judges most relevant to the anomaly (in
  // the shipped fixture, `event-thermostat-failure-2026-07`); its
  // `eventId`/`workOrderId`/`deviceIdFictional`/`performedBy`/
  // `detectionMethod`/`relevanceNote` are administrative/audit-trail
  // detail, excluded on the same basis (the household's own explanatory
  // `relevanceNote` prose is not itself a typed decision fact -- the typed
  // `usage_gap_above_baseline_kwh` minus `usage_explained_by_weather_kwh`
  // already captures the unexplained-usage figure it discusses, without
  // this pack inventing a field for a number that appears only in fixture
  // prose, never as its own structured JSON field).
  // `response_option_description`/`rough_cost`/`rough_effort_level`/
  // `estimated_time_to_insight`/`addresses_root_cause`/
  // `requires_consequential_action`/`consequential_action_note` <-
  // response-options.json's four `options[]` entries (`optionId`/`label`
  // become the `EntityRecord.id`/`label` pack-authoring.md's stable entity
  // envelope already carries, not separate attributes, matching how
  // car-purchase.ts relies on `EntityRecord.label` rather than declaring a
  // redundant attribute for it).
  // `emergency_risk_present` has no fixture source file (the shipped demo
  // scenario is never an emergency) -- it exists so the protected
  // `energy.no_emergency_risk` hard-constraint criterion below has a
  // concrete typed attribute to gate on, per packs-and-routing.md's
  // "Exclusion: electrical danger, gas leak, fire, or medical equipment
  // risk. The demo stops and presents emergency guidance."
  attributes: [
    {
      id: 'energy.billing_period',
      label: 'Billing period',
      // No `AttributeValue` variant represents a date *range* as one value
      // (`range` is numeric min/max with an optional unit, not two dates);
      // a formatted display string capturing start, end, and day count
      // together is the smallest reasonable judgment call. This is the
      // exact attribute id packs-and-routing.md's own "Flexible attributes
      // and criteria" section uses as its worked example of a pack-defined
      // field ("Known fields such as `car.advertised_price` or
      // `energy.billing_period`..."), so the id is quoted verbatim from
      // the spec rather than chosen freely.
      valueType: 'string',
      required: true,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.billing_period_days',
      label: 'Billing period length',
      valueType: 'number',
      required: true,
      appliesTo: ['billing_cycle'],
      unit: 'days',
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.tariff_id',
      label: 'Tariff',
      valueType: 'string',
      required: true,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.current_usage_kwh',
      label: 'Current-cycle usage',
      valueType: 'number',
      required: true,
      appliesTo: ['billing_cycle'],
      unit: 'kWh',
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.fixed_monthly_customer_charge',
      label: 'Fixed monthly customer charge',
      valueType: 'money',
      required: true,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.volumetric_charge',
      label: 'Volumetric (usage) charge',
      valueType: 'money',
      required: true,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.current_bill_amount',
      label: 'Current bill total',
      valueType: 'money',
      required: true,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.baseline_bill_amount',
      label: 'Weather- and trend-normalized baseline bill',
      valueType: 'money',
      required: true,
      appliesTo: ['billing_cycle'],
      // `evidenceExpectation: 'verification'` (E3-tier), not `'source'`:
      // this is the bill-normalizer skill's own deterministic computation
      // (current-bill.json's `baseline.methodology`), the domain-specific
      // deterministic check `energy.anomaly`'s required `E3` evidence level
      // names -- matching how car-purchase.ts reserves `'verification'`
      // for household-attested/observed fields, generalized here to a
      // deterministic recomputation rather than a human observation.
      evidenceExpectation: 'verification',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.baseline_usage_kwh',
      label: 'Weather- and trend-normalized baseline usage',
      valueType: 'number',
      required: true,
      appliesTo: ['billing_cycle'],
      unit: 'kWh',
      evidenceExpectation: 'verification',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.anomaly_percent_above_baseline',
      label: 'Percent above baseline',
      valueType: 'number',
      required: true,
      appliesTo: ['billing_cycle'],
      unit: '%',
      evidenceExpectation: 'verification',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.usage_gap_above_baseline_kwh',
      label: 'Usage gap above baseline',
      valueType: 'number',
      required: true,
      appliesTo: ['billing_cycle'],
      unit: 'kWh',
      evidenceExpectation: 'verification',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.actual_heating_degree_days',
      label: 'Actual heating degree days',
      valueType: 'number',
      required: true,
      appliesTo: ['billing_cycle'],
      unit: 'HDD',
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.actual_cooling_degree_days',
      label: 'Actual cooling degree days',
      valueType: 'number',
      required: true,
      appliesTo: ['billing_cycle'],
      unit: 'CDD',
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.typical_cooling_degree_days',
      label: 'Typical cooling degree days for this window',
      valueType: 'number',
      required: false,
      appliesTo: ['billing_cycle'],
      unit: 'CDD',
      evidenceExpectation: 'corroborated',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.excess_cooling_degree_days',
      label: 'Excess cooling degree days versus typical',
      valueType: 'number',
      required: false,
      appliesTo: ['billing_cycle'],
      unit: 'CDD',
      evidenceExpectation: 'corroborated',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.usage_explained_by_weather_kwh',
      label: 'Usage explained by weather',
      valueType: 'number',
      required: false,
      appliesTo: ['billing_cycle'],
      unit: 'kWh',
      evidenceExpectation: 'corroborated',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.current_tariff_fixed_charge',
      label: 'Current tariff: fixed monthly charge',
      valueType: 'money',
      required: true,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.current_tariff_volumetric_rate',
      label: 'Current tariff: volumetric rate',
      valueType: 'money',
      required: true,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.prior_tariff_fixed_charge',
      label: 'Prior tariff: fixed monthly charge',
      valueType: 'money',
      required: false,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.prior_tariff_volumetric_rate',
      label: 'Prior tariff: volumetric rate',
      valueType: 'money',
      required: false,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.rate_change_attributable_amount',
      label: 'Amount attributable to the rate change',
      valueType: 'money',
      required: false,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'corroborated',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.rate_change_attributable_percent_of_gap',
      label: 'Percent of the total gap attributable to the rate change',
      valueType: 'number',
      required: false,
      appliesTo: ['billing_cycle'],
      unit: '%',
      evidenceExpectation: 'corroborated',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.correlated_event_type',
      label: 'Correlated household/appliance event type',
      // 'string', not 'enum': household/appliance event types are an
      // open-ended vocabulary (any real-world household event could
      // plausibly be logged), unlike e.g. `car.drivetrain`'s genuinely
      // closed, fixed set -- matching car-purchase.ts's `car.body_style`
      // judgment call for the same shape of field.
      valueType: 'string',
      required: false,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.correlated_event_date',
      label: 'Correlated event date',
      valueType: 'date',
      required: false,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.correlated_event_label',
      label: 'Correlated event label',
      valueType: 'string',
      required: false,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.correlated_event_description',
      label: 'Correlated event description',
      valueType: 'text',
      required: false,
      appliesTo: ['billing_cycle'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'energy.correlated_event_status',
      label: 'Correlated event status',
      valueType: 'string',
      required: false,
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
      // `evidenceExpectation: 'assertion'` (E0-tier): an initial,
      // unverified household-reported signal is exactly what should halt
      // the ordinary investigation and route to emergency guidance --
      // waiting for a higher evidence tier here would be the opposite of
      // the spec's intent. `comparison: 'constraint'` matches
      // car-purchase.ts's `car.drivetrain` treatment of a gating field.
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
      evidenceExpectation: 'source',
      comparison: 'lower_better',
      sensitive: false,
    },
    {
      id: 'energy.estimated_time_to_insight',
      label: 'Estimated time to insight',
      valueType: 'string',
      required: true,
      appliesTo: ['response_option'],
      evidenceExpectation: 'source',
      comparison: 'none',
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
    {
      id: 'energy.consequential_action_note',
      label: 'Consequential action note',
      valueType: 'text',
      required: false,
      appliesTo: ['response_option'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
  ],

  // packs-and-routing.md "Home Energy Guardian Decision Pack" ->
  // "Extensions": "The `energy.user_concern` template can capture comfort,
  // budget, environmental, equipment, accessibility, and household-specific
  // questions." Those named categories are case-specific concerns a
  // household may *add* (via `energy.user_concern`, see `extensionPolicy`
  // below), not a pack-default criterion list every household using this
  // pack would want pre-populated -- the same reasoning car-purchase.ts
  // gives for excluding household-profile.json's `mustHaves` from its own
  // `criteria.defaults`. The two default preference criteria below --
  // `energy.cost` and `energy.conservation` -- are, by contrast, quoted
  // directly from the spec: `energy.response_options`'s own required
  // obligation question is "Which actions fit the user's cost and
  // conservation criteria?", and the required adaptive moment "Changing the
  // criterion from lowest immediate cost to long-term waste reduction
  // changes option ranking" describes exactly these two criteria being
  // reweighted against each other. Default weight is a 50/50 split (a
  // judgment call: the spec grounds *that* these two criteria exist and
  // that reweighting between them changes the ranking, not a specific
  // starting split).
  //
  // `energy.no_emergency_risk` is the declarative half of
  // packs-and-routing.md's "Exclusion: electrical danger, gas leak, fire,
  // or medical equipment risk. The demo stops and presents emergency
  // guidance" (`activation.exclusions` above) and "Safety exclusions and
  // emergency policies are protected and cannot be reweighted or removed"
  // (`extensionPolicy` section below): it is a `hard_constraint` criterion
  // listed in `criteria.protectedCriterionIds`. `packages/core/src/
  // criteria.ts`'s `removeCriterion` already rejects removing any
  // protected-id criterion unconditionally, and its `reweightCriterion`
  // rejects reweighting one unless the caller explicitly passes
  // `allowProtectedReweight: true` -- a permission this manifest never
  // grants anywhere, so "protected" here already means "cannot be
  // reweighted or removed" under the existing engine contract with no
  // further manifest field needed. `weight: 0` (not `100`, unlike the
  // `apartment-hunt` authoring fixture's single-criterion `apt.budget`):
  // `packages/core/src/criteria.ts`'s `normalizeCriterionWeights` pools
  // *every* `active`-status criterion's weight together regardless of
  // `kind` when computing each criterion's scoring share. A hard constraint
  // is a pass/fail gate on candidates (packs-and-routing.md: "Which
  // candidates satisfy... non-negotiable needs"), not a weighted scoring
  // contributor, so giving it a nonzero weight here would silently dilute
  // `energy.cost`/`energy.conservation`'s intended 100%-of-the-scored-pool
  // share by whatever fraction the hard constraint claimed -- weight `0`
  // keeps the two preference criteria the sole scoring pool, mirroring
  // car-purchase.ts's precedent of its five preference-only criteria
  // summing to exactly 100. `direction: 'qualitative'` since a
  // present/absent emergency-risk gate is not a `higher_better`/
  // `lower_better`/`target` numeric comparison.
  criteria: {
    defaults: [
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
        question:
          'Is there any electrical danger, gas leak, fire, or medical equipment risk present?',
        origin: 'pack',
        status: 'active',
      },
    ],
    allowUserDefined: true,
    protectedCriterionIds: ['energy.no_emergency_risk'],
  },

  // packs-and-routing.md "Required obligations" table, quoted verbatim for
  // id/question/requiredEvidenceLevel/maxAttempts.
  //
  // `dependsOn` encodes the required adaptive moments' causal chain rather
  // than the un-ordered parallel topology car-purchase.ts's Graph obligations
  // use, matching strands-runtime.md's "the next specialist depends on what
  // rate, weather, and household evidence explains": `energy.anomaly` runs
  // first (nothing can be attributed before an anomaly is confirmed, and
  // "The engine investigates the anomaly in the background before creating
  // a human action" requires it to complete before any other obligation
  // proceeds); `energy.rate_change` and `energy.weather` each depend only on
  // `energy.anomaly` and can run in either order; `energy.household_change`
  // depends specifically on `energy.weather` per "Weather explains part but
  // not all of the spike, causing the engine to activate home-event
  // correlation" -- a direct causal trigger, not a coincidence of parallel
  // scheduling; `energy.response_options` depends on all four, mirroring
  // car-purchase.ts's `car.shortlist` synthesis-depends-on-everything
  // pattern.
  //
  // `priority`: not given verbatim by the spec (a judgment call, using the
  // same scheme car-purchase.ts documents) -- `energy.anomaly` is highest
  // (100; every other obligation's investigation depends on it in practice),
  // `energy.rate_change`/`energy.weather` are equal-and-high (80, the two
  // obligations `energy.anomaly` alone gates), `energy.household_change` is
  // next (70, gated specifically on `energy.weather`), and
  // `energy.response_options` is lowest (10, the final synthesis step).
  //
  // `acceptedUncertaintyAllowed`: `energy.anomaly`, `energy.rate_change`,
  // and `energy.response_options` are `false` -- the first two are
  // deterministic arithmetic re-derivations from current-bill.json/
  // rate-schedules.json with no legitimate partial-credit disposition (the
  // same reasoning car-purchase.ts gives for its own deterministic
  // obligations), and the final synthesis must reach a definite ranked
  // recommendation rather than an open question, mirroring `car.shortlist`.
  // `energy.weather` and `energy.household_change` are `true` --
  // weather-history.json's own attribution is an explicit statistical
  // estimate ("Regression coefficient derived from correlating... for this
  // household"), and a household-event correlation is inherently a
  // plausibility judgment, not a provable fact (household-events.json's
  // `relevanceNote` says the timing "plausibly accounts for" the gap, never
  // that it is certain) -- the same shape of irreducible uncertainty
  // car-purchase.ts accepts for `car.safety_reliability`/`car.household_fit`.
  //
  // `completionRule.minimumIndependentSources`: 1 for `E1`, 2 for `E2`
  // (car-purchase.ts's convention, reading the evidence-level table's "E2:
  // corroborated by two independent sources or one authoritative source").
  // `energy.anomaly` additionally requires `E3` ("verified by a
  // domain-specific deterministic check or explicit human attestation"),
  // which car-purchase.ts's obligations never reach; `minimumIndependentSources:
  // 1` is used there too -- a single authoritative deterministic
  // recomputation (re-deriving `energy.baseline_bill_amount`/
  // `energy.anomaly_percent_above_baseline` from current-bill.json's own
  // figures) *is* the E3 verification act, distinct from E2's explicit
  // two-or-authoritative-source plurality language.
  obligations: [
    {
      id: 'energy.anomaly',
      label: 'Anomaly detection',
      question: 'Is the current bill materially abnormal?',
      category: 'anomaly',
      required: true,
      priority: 100,
      requiredEvidenceLevel: 'E3',
      maxAttempts: 1,
      acceptedUncertaintyAllowed: false,
      dependsOn: [],
      preferredSkills: ['bill-normalizer'],
      preferredSpecialists: ['anomaly-investigator'],
      completionRule: {
        minimumEvidenceLevel: 'E3',
        minimumIndependentSources: 1,
        acceptedUncertaintyAllowed: false,
      },
      origin: 'pack',
    },
    {
      id: 'energy.rate_change',
      label: 'Rate-change attribution',
      question: 'How much of the increase comes from tariff or fee changes?',
      category: 'rate_change',
      required: true,
      priority: 80,
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
      acceptedUncertaintyAllowed: false,
      dependsOn: ['energy.anomaly'],
      preferredSkills: ['rate-plan-analysis'],
      preferredSpecialists: ['rate-analyst'],
      completionRule: {
        minimumEvidenceLevel: 'E2',
        minimumIndependentSources: 2,
        acceptedUncertaintyAllowed: false,
      },
      origin: 'pack',
    },
    {
      id: 'energy.weather',
      label: 'Weather-normalized usage attribution',
      question: 'How much is explained by weather-normalized usage?',
      category: 'weather',
      required: true,
      priority: 80,
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
      acceptedUncertaintyAllowed: true,
      dependsOn: ['energy.anomaly'],
      preferredSkills: ['weather-comparison'],
      preferredSpecialists: ['weather-analyst'],
      completionRule: {
        minimumEvidenceLevel: 'E2',
        minimumIndependentSources: 2,
        acceptedUncertaintyAllowed: true,
      },
      origin: 'pack',
    },
    {
      id: 'energy.household_change',
      label: 'Household or appliance event correlation',
      question: 'Did a household or appliance event plausibly change consumption?',
      category: 'household_change',
      required: true,
      priority: 70,
      requiredEvidenceLevel: 'E1',
      maxAttempts: 2,
      acceptedUncertaintyAllowed: true,
      dependsOn: ['energy.weather'],
      preferredSkills: ['home-event-correlation'],
      preferredSpecialists: ['home-systems-analyst'],
      completionRule: {
        minimumEvidenceLevel: 'E1',
        minimumIndependentSources: 1,
        acceptedUncertaintyAllowed: true,
      },
      origin: 'pack',
    },
    {
      id: 'energy.response_options',
      label: 'Response options synthesis',
      question: "Which actions fit the user's cost and conservation criteria?",
      category: 'response_options',
      required: true,
      priority: 10,
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
      acceptedUncertaintyAllowed: false,
      dependsOn: [
        'energy.anomaly',
        'energy.rate_change',
        'energy.weather',
        'energy.household_change',
      ],
      preferredSkills: ['decision-synthesis'],
      preferredSpecialists: ['decision-synthesizer', 'source-challenger'],
      completionRule: {
        minimumEvidenceLevel: 'E2',
        minimumIndependentSources: 2,
        acceptedUncertaintyAllowed: false,
      },
      origin: 'pack',
    },
  ],

  extensionPolicy: {
    allowCaseAttributes: true,
    allowCaseCriteria: true,
    allowCaseObligations: true,
    userConcernTemplateId: 'energy.user_concern',
  },

  // packs-and-routing.md "Skills, specialists, and tools" -> "Skills:".
  skills: [
    {
      id: 'bill-normalizer',
      description:
        'Computes the weather- and trend-normalized baseline bill/usage for the current cycle from prior billing history and the current tariff, and flags whether the current bill is materially abnormal relative to that baseline.',
    },
    {
      id: 'weather-comparison',
      description:
        'Compares actual heating/cooling degree days for the current cycle against a typical-for-this-window reference and estimates how much of the usage gap weather alone explains.',
    },
    {
      id: 'rate-plan-analysis',
      description:
        "Compares the current and prior tariff's fixed and volumetric charges to isolate how much of the bill increase is attributable to the rate change itself, holding usage constant at baseline.",
    },
    {
      id: 'home-event-correlation',
      description:
        'Correlates the household/appliance event log against the anomalous billing cycle to identify whether a plausible event (e.g. a malfunctioning thermostat) explains usage the rate change and weather do not.',
    },
    {
      id: 'decision-synthesis',
      description:
        "Synthesizes anomaly, rate-change, weather, and household-event evidence into a source-linked ranking of response options against the household's cost and conservation criteria.",
    },
  ],

  // packs-and-routing.md "Skills, specialists, and tools" -> "Specialists:".
  // `allowedTools`/`allowedSkills` per specialist are a judgment call
  // (strands-runtime.md only says "Each has a narrow prompt and tool
  // subset" -- no exact grant list), chosen so each specialist's tool grant
  // is exactly the fixture tool(s) its obligation-domain needs, and its
  // skill grant is the skill(s) that activate it, mirroring
  // car-purchase.ts's own reasoning. `anomaly-investigator` additionally
  // gets `calculator` since `energy.anomaly`'s required `E3` evidence level
  // is "verified by a domain-specific deterministic check" -- the
  // baseline/anomaly-percent arithmetic itself. `source-challenger` is
  // granted `bill-reader` (a teaser-price-conflict-shaped analog: a stated
  // bill total that does not reconcile against its own fixed+volumetric
  // components) and `household-event-lookup` (challenging whether a
  // correlated event genuinely predates/overlaps the anomalous cycle), with
  // no `allowedSkills` since it is invoked as its own bounded Swarm
  // agent-tool rather than through ordinary skill activation, matching
  // car-purchase.ts's `source-challenger` treatment exactly.
  specialists: [
    {
      id: 'anomaly-investigator',
      description:
        'Computes the normalized baseline for the current billing cycle and determines whether the current bill is materially abnormal relative to it.',
      allowedTools: ['bill-reader', 'usage-history-query', 'calculator'],
      allowedSkills: ['bill-normalizer'],
    },
    {
      id: 'rate-analyst',
      description:
        'Compares current and prior tariff terms to isolate how much of the anomaly is attributable to the rate change.',
      allowedTools: ['tariff-lookup', 'calculator'],
      allowedSkills: ['rate-plan-analysis'],
    },
    {
      id: 'weather-analyst',
      description:
        'Compares actual and typical heating/cooling degree days to estimate how much of the anomaly is attributable to weather.',
      allowedTools: ['weather-lookup', 'calculator'],
      allowedSkills: ['weather-comparison'],
    },
    {
      id: 'home-systems-analyst',
      description:
        'Correlates household and appliance events against the anomalous billing cycle to identify a plausible non-weather, non-rate explanation for remaining usage.',
      allowedTools: ['household-event-lookup'],
      allowedSkills: ['home-event-correlation'],
    },
    {
      id: 'source-challenger',
      description:
        'Evaluates provenance, recency, and contradictions across submitted evidence before it can satisfy an obligation.',
      allowedTools: ['bill-reader', 'household-event-lookup'],
      allowedSkills: [],
    },
    {
      id: 'decision-synthesizer',
      description:
        'Synthesizes resolved evidence across all prior obligations into a source-linked response-options ranking, gated by its own GoalLoop validator and requiring human confirmation before an inspection proposal is recorded.',
      allowedTools: ['propose_inspection'],
      allowedSkills: ['decision-synthesis'],
    },
  ],

  // packs-and-routing.md: "Orchestration: bounded Strands Swarm with
  // deterministic readiness outside the Swarm." strands-runtime.md "Energy
  // Swarm": "The Energy investigation team contains `anomaly-investigator`,
  // `rate-analyst`, `weather-analyst`, `home-systems-analyst`,
  // `source-challenger`, and `decision-synthesizer`." and "The Swarm sets
  // `maxSteps`, execution timeout, node timeout, and repetitive-handoff
  // detection." `nodeTimeoutMs`/`totalTimeoutMs` reuse the same default
  // execution bounds car-purchase.ts's Graph does ("120-second model
  // request timeout"/"five-minute total run timeout",
  // strands-runtime.md "Engine loop"), which apply engine-wide, not only to
  // Graph orchestration. `maxSteps: 12` is a judgment call: unlike
  // car-purchase.ts's Graph (a fixed six-node topology matching the "six
  // graph node executions per run" default bound exactly), a Swarm's step
  // count is not fixed -- the required adaptive moment "Repeated work
  // without evidence gain triggers steering and a specialist handoff" means
  // a legitimate run can revisit a specialist before handing off, so a
  // bound of exactly six specialists would leave no room for that handoff
  // to occur. `12` reuses the engine loop's own "twelve tool calls per run"
  // default bound value (strands-runtime.md "Engine loop") rather than
  // inventing an unrelated number, and comfortably allows the five
  // obligation-owning specialists plus at least one repeated visit,
  // `source-challenger` review, and `decision-synthesizer` handoff before
  // the bound is reached.
  //
  // `repetitiveHandoffDetectionWindow: 8`/`repetitiveHandoffMinUniqueAgents: 3`:
  // strands-runtime.md "Energy Swarm" requires these to be "wider than
  // Sift's three-call [`RetrySteering` no-progress] threshold ... so it
  // functions only as an outer safety net" -- Sift's own soft steering must
  // trip strictly before the Swarm's own hard `FAILED`-result repetitive-
  // handoff detection would. `8`/`3` satisfy that (`8 > 3`, and requiring
  // only 3 of the 6 available specialists to appear across an 8-handoff
  // window is a generous diversity floor, not a tight one), and match the
  // exact values `packages/packs/src/fixtures/manifest.ts`'s
  // `validSwarmManifest` test fixture already uses for the same two
  // fields, keeping this pack's real Swarm bounds consistent with the
  // package's own baseline "valid Swarm" shape rather than picking an
  // unrelated pair of numbers.
  orchestration: {
    strategy: 'swarm',
    maxSteps: 12,
    nodeTimeoutMs: 120_000,
    totalTimeoutMs: 300_000,
    repetitiveHandoffDetectionWindow: 8,
    repetitiveHandoffMinUniqueAgents: 3,
  },

  // packs-and-routing.md "Skills, specialists, and tools" -> "Tools:
  // fixture bill reader, historical usage query, tariff lookup, weather
  // lookup, household event lookup, calculator." Named per that list, in
  // kebab-case matching car-purchase.ts's tool-naming convention
  // (`bill-reader`, `usage-history-query`, `tariff-lookup`,
  // `weather-lookup`, `household-event-lookup`, `calculator`).
  // `propose_inspection` is this pack's one consequential effect
  // (packs-and-routing.md: "Consequential effects: requesting an inspection
  // is a proposal requiring human confirmation. The pack does not schedule
  // an appointment."), named to match response-options.json's
  // `request-hvac-inspection` option and gated by `ConsequenceGuard`'s
  // `beforeToolCall` intervention, mirroring car-purchase.ts's
  // `propose_recommendation` treatment exactly (snake_case, matching
  // strands-runtime.md's own `propose_recommendation` worked example for
  // this same kind of tool).
  tools: [
    {
      id: 'bill-reader',
      description:
        'Reads the current billing cycle (billing period, tariff, usage, charges, computed baseline and anomaly figures) from fixture or bounded live utility-account sources.',
      effect: 'read_only',
      requiresApproval: false,
    },
    {
      id: 'usage-history-query',
      description:
        "Reads the household's prior billing-cycle usage history, used to compute the current cycle's weather- and trend-normalized baseline.",
      effect: 'read_only',
      requiresApproval: false,
    },
    {
      id: 'tariff-lookup',
      description:
        "Reads current and historical tariff schedules (fixed monthly charge, volumetric rate, effective dates) for the household's utility.",
      effect: 'read_only',
      requiresApproval: false,
    },
    {
      id: 'weather-lookup',
      description:
        "Reads heating/cooling degree-day history for the household's weather station, used to weather-normalize usage for the current billing cycle.",
      effect: 'read_only',
      requiresApproval: false,
    },
    {
      id: 'household-event-lookup',
      description:
        "Reads the household's logged appliance and household events (e.g. maintenance visits, device malfunctions) for correlation against the anomalous billing cycle.",
      effect: 'read_only',
      requiresApproval: false,
    },
    {
      id: 'calculator',
      description:
        'Performs the deterministic arithmetic behind baseline, anomaly, weather-attribution, and rate-change-attribution figures.',
      effect: 'read_only',
      requiresApproval: false,
    },
    {
      id: 'propose_inspection',
      description:
        'Creates the consequential proposal to request an HVAC/thermostat inspection. Requires explicit human confirmation before the proposal is recorded; the pack does not schedule an actual appointment.',
      effect: 'consequential',
      requiresApproval: true,
    },
  ],

  // packs-and-routing.md: "Consequential effects: requesting an inspection
  // is a proposal requiring human confirmation." This is the pack's only
  // consequential effect, so one policy is sufficient, mirroring
  // car-purchase.ts's single `car.shortlist-approval` policy.
  policies: [
    {
      id: 'energy.inspection-approval',
      description:
        'Requesting an HVAC/thermostat inspection requires explicit human confirmation before the proposal is recorded.',
      requiresHumanApproval: true,
      appliesToToolIds: ['propose_inspection'],
    },
  ],

  presentation: {
    optionLabel: 'Response option',
    optionLabelPlural: 'Response options',
    attributeGroups: [
      {
        id: 'bill',
        label: 'Current bill',
        attributeIds: [
          'energy.billing_period',
          'energy.billing_period_days',
          'energy.tariff_id',
          'energy.current_usage_kwh',
          'energy.fixed_monthly_customer_charge',
          'energy.volumetric_charge',
          'energy.current_bill_amount',
        ],
      },
      {
        id: 'anomaly',
        label: 'Anomaly detection',
        attributeIds: [
          'energy.baseline_bill_amount',
          'energy.baseline_usage_kwh',
          'energy.anomaly_percent_above_baseline',
          'energy.usage_gap_above_baseline_kwh',
        ],
      },
      {
        id: 'weather',
        label: 'Weather attribution',
        attributeIds: [
          'energy.actual_heating_degree_days',
          'energy.actual_cooling_degree_days',
          'energy.typical_cooling_degree_days',
          'energy.excess_cooling_degree_days',
          'energy.usage_explained_by_weather_kwh',
        ],
      },
      {
        id: 'rate',
        label: 'Rate-change attribution',
        attributeIds: [
          'energy.current_tariff_fixed_charge',
          'energy.current_tariff_volumetric_rate',
          'energy.prior_tariff_fixed_charge',
          'energy.prior_tariff_volumetric_rate',
          'energy.rate_change_attributable_amount',
          'energy.rate_change_attributable_percent_of_gap',
        ],
      },
      {
        id: 'household_event',
        label: 'Correlated household event',
        attributeIds: [
          'energy.correlated_event_type',
          'energy.correlated_event_date',
          'energy.correlated_event_label',
          'energy.correlated_event_description',
          'energy.correlated_event_status',
        ],
      },
      {
        id: 'safety',
        label: 'Safety',
        attributeIds: ['energy.emergency_risk_present'],
      },
      {
        id: 'response_option',
        label: 'Response option',
        attributeIds: [
          'energy.response_option_description',
          'energy.rough_cost',
          'energy.rough_effort_level',
          'energy.estimated_time_to_insight',
          'energy.addresses_root_cause',
          'energy.requires_consequential_action',
          'energy.consequential_action_note',
        ],
      },
    ],
  },

  // Judgment call, mirroring car-purchase.ts exactly: scenario *content*
  // files (scenarios/<scenario-id>.json, fixtures/<scenario-id>/*.json per
  // pack-authoring.md's pack bundle layout) are separate, later authoring
  // work -- this manifest only declares the ids `requiresNegativeCase`
  // needs to see. Three ids give the compiler's required happy-path/
  // negative pairing plus direct traceability to two of packs-and-routing.md's
  // "Required adaptive moments": a repeated-weather-work steering scenario
  // (activates the `RetrySteering` -> `Guide` -> handoff to
  // `home-systems-analyst` trajectory strands-runtime.md "Energy Swarm"
  // names) and an inspection-confirmation human-boundary scenario ("The
  // system asks for confirmation before creating an inspection proposal").
  evaluation: {
    scenarioIds: [
      'home-energy-guardian-happy-path',
      'home-energy-guardian-weather-household-handoff',
      'home-energy-guardian-inspection-confirmation',
    ],
    requiresNegativeCase: true,
  },
};

/** Convenience wrapper: `compilePack(HOME_ENERGY_GUARDIAN_MANIFEST, catalog, clock)`. */
export function compileHomeEnergyGuardianPack(
  catalog: CapabilityCatalog,
  clock: Clock,
): CompiledDecisionPack {
  return compilePack(HOME_ENERGY_GUARDIAN_MANIFEST, catalog, clock);
}
