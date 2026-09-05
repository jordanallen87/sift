/**
 * The real `car-purchase@1.0.0` Decision Pack manifest ("Choose Our Next
 * Car"), implementing docs/specs/packs-and-routing.md "Choose Our Next Car
 * Decision Pack" and the Graph orchestration topology in
 * docs/specs/strands-runtime.md "Orchestration". This is the Tier-1
 * WebMCP-hero pack.
 *
 * `CAR_PURCHASE_MANIFEST` is the raw, uncompiled source manifest.
 * `compileCarPurchasePack(catalog, clock)` is a thin convenience wrapper
 * around `compilePack` (`compiler.ts`) -- it adds no behavior of its own,
 * matching the manifest+wrapper shape `car-purchase.test.ts` and later
 * callers (case creation, scenario fixtures) expect.
 *
 * Grounding for every field is either a direct spec quote or an explicit
 * judgment call, each documented at its declaration below and recorded
 * with full reasoning in the dated docs/build-log.md entry for this task.
 * The fixture data this manifest's attributes/entities are shaped to match
 * lives in packages/scenarios/fixtures/car-purchase/*.json (already
 * authored by a sibling task) -- candidate ids (`candidate-rav4`,
 * `candidate-crv`, `candidate-cx5`, `candidate-outback`) and source ids
 * (`source-national-crash-safety-consortium`,
 * `source-northfield-vehicle-safety-lab`, `source-consumer-drive-index`,
 * `source-autotrust-reliability-survey`) are case/evidence data, not
 * manifest content, so they do not appear directly in this file; this
 * manifest's attribute *definitions* are shaped so that data round-trips
 * through them.
 */
import type { CapabilityCatalog } from './capability-catalog.js';
import { compilePack } from './compiler.js';
import type { Clock } from '@sift/core';
import type { CompiledDecisionPack, DecisionPackManifest } from '@sift/contracts';

export const CAR_PURCHASE_MANIFEST: DecisionPackManifest = {
  schemaVersion: '1.0',

  // The pack **id** stays `car-purchase` deliberately. Every stored case
  // pins it in `CasePackPin`, so changing it would orphan existing cases for
  // no user-visible gain. Only the user-facing language generalises: this
  // pack now runs a landscaping business's van decision as readily as a
  // household's, and calling it "Choose Our Next Car" in front of a
  // contractor would be a lie about what it does.
  identity: {
    id: 'car-purchase',
    version: '1.0.0',
    name: 'Vehicle Selection',
    description:
      'Works out what a vehicle actually has to do -- for a household, a sole trader, or a business -- and compares candidate models against those needs on budget and non-negotiables, normalized deal terms, five-year ownership cost, safety and reliability records, and practical fit, to recommend which models are worth test driving.',
    tags: ['car-purchase', 'vehicle', 'webmcp-hero', 'vehicle-selection'],
  },

  // packs-and-routing.md "Choose Our Next Car Decision Pack" -> "Activation".
  // `intents` and `exclusions` are quoted verbatim from that section (split
  // into list items at its own comma boundaries). `keywords` and
  // `entitySignals` are not given verbatim anywhere in the spec (the
  // manifest contract requires both fields, but only `intents`/
  // `artifactKinds`/`exclusions` have spec-given text) -- a judgment call,
  // chosen to signal car-shopping intent without echoing any *excluded*
  // capability (e.g. "auto loan"/"lease" are deliberately omitted since
  // they would route a financing-application request into a pack that
  // explicitly cannot process one).
  activation: {
    intents: [
      'compare shortlisted cars',
      'understand a dealer offer',
      'choose what to test-drive',
      'evaluate household vehicle fit',
    ],
    keywords: [
      'car',
      'vehicle',
      'suv',
      'crossover',
      'dealer offer',
      'test drive',
      'compare cars',
      'car shopping',
      'which car should we buy',
      'next car',
    ],
    artifactKinds: [
      'household_priorities',
      'candidate_details',
      'listing_or_offer_terms',
      'ownership_cost_assumptions',
      'safety_and_reliability_sources',
    ],
    entitySignals: ['vehicle', 'car', 'suv', 'listing', 'dealer offer', 'candidate'],
    exclusions: [
      'mechanical diagnosis',
      'financing applications',
      'negotiation or dealer-contact automation',
      'reservations',
      'scheduling',
      'purchases',
    ],
  },

  entities: [
    {
      id: 'candidate',
      label: 'Saved car',
      description:
        'One shortlisted vehicle listing under comparison (e.g. a specific model year/trim at a specific dealer).',
      attributeIds: [
        'car.make',
        'car.model',
        'car.model_year',
        'car.trim',
        'car.body_style',
        'car.drivetrain',
        'car.powertrain',
        'car.mileage',
        'car.standard_features',
        'car.advertised_price',
        'car.out_the_door_price',
        'car.teaser_price_gap_amount',
        'car.has_teaser_price_conflict',
        'car.estimated_monthly_payment',
        'car.five_year_fuel_cost',
        'car.five_year_maintenance_cost',
        'car.five_year_ownership_cost',
        'car.combined_fuel_economy_mpg',
        'car.annual_insurance_premium',
        'car.crash_safety_rating',
        'car.driver_assistance_rating',
        'car.reliability_rating',
        'car.cargo_volume_cu_ft',
        'car.cargo_width_in',
        'car.cargo_length_in',
        'car.rear_door_opening_width_in',
        'car.second_row_legroom_in',
        'car.ground_clearance_in',
        'car.rear_cargo_crate_fit',
        'car.driving_comfort_rating',
      ],
    },
  ],

  // Attribute definitions shaped to match the real fixture field names in
  // packages/scenarios/fixtures/car-purchase/*.json: `car.make`/`model`/
  // `model_year`/`trim`/`body_style`/`drivetrain`/`powertrain`/`mileage`/
  // `standard_features` <- candidate-listings.json; `advertised_price`/
  // `out_the_door_price`/`teaser_price_gap_amount`/
  // `has_teaser_price_conflict`/`estimated_monthly_payment` <-
  // dealer-offers.json; `five_year_fuel_cost`/`five_year_maintenance_cost`/
  // `five_year_ownership_cost`/`combined_fuel_economy_mpg`/
  // `annual_insurance_premium` <- ownership-assumptions.json;
  // `crash_safety_rating`/`driver_assistance_rating`/`reliability_rating`
  // <- safety-reliability-sources.json's three `findings[].category`
  // values; `cargo_volume_cu_ft`/`cargo_width_in`/`cargo_length_in`/
  // `rear_door_opening_width_in`/`second_row_legroom_in`/
  // `ground_clearance_in`/`rear_cargo_crate_fit`/`driving_comfort_rating`
  // <- household-fit.json's `knownSpecifications` and `explicitUnknowns`.
  // Judgment call: purely administrative/display fields present in the
  // fixtures (VIN, listing URL, dealer name, exterior color, listing id)
  // are deliberately NOT modeled as pack `AttributeDefinition`s -- they do
  // not drive comparison, evidence, or criteria scoring, so they add no
  // renderable decision value and would only inflate every
  // presentation.attributeGroups entry.
  attributes: [
    {
      id: 'car.make',
      label: 'Make',
      valueType: 'string',
      required: true,
      appliesTo: ['candidate'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'car.model',
      label: 'Model',
      valueType: 'string',
      required: true,
      appliesTo: ['candidate'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'car.model_year',
      label: 'Model year',
      valueType: 'number',
      required: true,
      appliesTo: ['candidate'],
      evidenceExpectation: 'source',
      comparison: 'higher_better',
      sensitive: false,
    },
    {
      id: 'car.trim',
      label: 'Trim',
      valueType: 'string',
      required: false,
      appliesTo: ['candidate'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'car.body_style',
      label: 'Body style',
      valueType: 'string',
      required: false,
      appliesTo: ['candidate'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'car.drivetrain',
      label: 'Drivetrain',
      valueType: 'enum',
      required: true,
      appliesTo: ['candidate'],
      allowedValues: ['AWD', 'FWD', 'RWD', '4WD'],
      evidenceExpectation: 'source',
      comparison: 'constraint',
      sensitive: false,
    },
    {
      id: 'car.powertrain',
      label: 'Powertrain',
      valueType: 'enum',
      required: false,
      appliesTo: ['candidate'],
      allowedValues: ['gasoline', 'hybrid', 'electric', 'diesel', 'plug_in_hybrid'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'car.mileage',
      label: 'Mileage',
      valueType: 'number',
      required: true,
      appliesTo: ['candidate'],
      unit: 'mi',
      evidenceExpectation: 'source',
      comparison: 'lower_better',
      sensitive: false,
    },
    {
      id: 'car.standard_features',
      label: 'Standard features',
      valueType: 'string_list',
      required: true,
      appliesTo: ['candidate'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'car.advertised_price',
      label: 'Advertised price',
      valueType: 'money',
      required: true,
      appliesTo: ['candidate'],
      evidenceExpectation: 'source',
      comparison: 'lower_better',
      sensitive: false,
    },
    {
      id: 'car.out_the_door_price',
      label: 'True out-the-door price',
      valueType: 'money',
      required: true,
      appliesTo: ['candidate'],
      evidenceExpectation: 'corroborated',
      comparison: 'lower_better',
      sensitive: false,
    },
    {
      id: 'car.teaser_price_gap_amount',
      label: 'Teaser price gap',
      valueType: 'money',
      required: false,
      appliesTo: ['candidate'],
      evidenceExpectation: 'corroborated',
      comparison: 'lower_better',
      sensitive: false,
    },
    {
      id: 'car.has_teaser_price_conflict',
      label: 'Has teaser price conflict',
      valueType: 'boolean',
      required: false,
      appliesTo: ['candidate'],
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'car.estimated_monthly_payment',
      label: 'Estimated monthly payment',
      valueType: 'money',
      required: false,
      appliesTo: ['candidate'],
      evidenceExpectation: 'source',
      comparison: 'lower_better',
      sensitive: false,
    },
    {
      id: 'car.five_year_fuel_cost',
      label: 'Estimated 5-year fuel cost',
      valueType: 'money',
      required: true,
      appliesTo: ['candidate'],
      evidenceExpectation: 'corroborated',
      comparison: 'lower_better',
      sensitive: false,
    },
    {
      id: 'car.five_year_maintenance_cost',
      label: 'Estimated 5-year maintenance cost',
      valueType: 'money',
      required: true,
      appliesTo: ['candidate'],
      evidenceExpectation: 'corroborated',
      comparison: 'lower_better',
      sensitive: false,
    },
    {
      id: 'car.five_year_ownership_cost',
      label: 'Estimated 5-year total ownership cost',
      valueType: 'money',
      required: true,
      appliesTo: ['candidate'],
      evidenceExpectation: 'corroborated',
      comparison: 'lower_better',
      sensitive: false,
    },
    {
      id: 'car.combined_fuel_economy_mpg',
      label: 'Combined fuel economy',
      valueType: 'number',
      required: true,
      appliesTo: ['candidate'],
      unit: 'mpg',
      evidenceExpectation: 'source',
      comparison: 'higher_better',
      sensitive: false,
    },
    {
      id: 'car.annual_insurance_premium',
      label: 'Estimated annual insurance premium',
      valueType: 'money',
      required: false,
      appliesTo: ['candidate'],
      evidenceExpectation: 'source',
      comparison: 'lower_better',
      sensitive: false,
    },
    {
      id: 'car.crash_safety_rating',
      label: 'Crash safety rating',
      valueType: 'enum',
      required: true,
      appliesTo: ['candidate'],
      allowedValues: ['Top Safety Pick+', 'Top Safety Pick', 'Recommended', 'Not Rated'],
      // Worst-to-best, i.e. the REVERSE of `allowedValues` above. Declared
      // explicitly because `allowedValues` is a membership set whose order
      // means nothing, and a scorer that inferred rank from its index would
      // rate an unrated car as the safest one on the lot -- inside a
      // 30%-weight criterion, silently. See `AttributeDefinition
      // .orderedValues`.
      orderedValues: ['Not Rated', 'Recommended', 'Top Safety Pick', 'Top Safety Pick+'],
      evidenceExpectation: 'corroborated',
      comparison: 'higher_better',
      sensitive: false,
    },
    {
      id: 'car.driver_assistance_rating',
      label: 'Driver assistance effectiveness rating',
      valueType: 'enum',
      required: true,
      appliesTo: ['candidate'],
      allowedValues: ['Superior', 'Advanced', 'Basic', 'Not Rated'],
      orderedValues: ['Not Rated', 'Basic', 'Advanced', 'Superior'],
      evidenceExpectation: 'corroborated',
      comparison: 'higher_better',
      sensitive: false,
    },
    {
      id: 'car.reliability_rating',
      label: 'Owner-reported / predicted reliability rating',
      valueType: 'enum',
      required: true,
      appliesTo: ['candidate'],
      allowedValues: ['Above Average', 'Average', 'Below Average'],
      orderedValues: ['Below Average', 'Average', 'Above Average'],
      evidenceExpectation: 'corroborated',
      comparison: 'higher_better',
      sensitive: false,
    },
    {
      id: 'car.cargo_volume_cu_ft',
      label: 'Cargo volume behind second row',
      valueType: 'number',
      required: false,
      appliesTo: ['candidate'],
      unit: 'cu ft',
      evidenceExpectation: 'source',
      comparison: 'higher_better',
      sensitive: false,
    },
    {
      id: 'car.cargo_width_in',
      label: 'Cargo width between wheel wells',
      valueType: 'number',
      required: false,
      appliesTo: ['candidate'],
      unit: 'in',
      evidenceExpectation: 'source',
      comparison: 'higher_better',
      sensitive: false,
    },
    {
      id: 'car.cargo_length_in',
      label: 'Cargo length, seat to liftgate',
      valueType: 'number',
      required: false,
      appliesTo: ['candidate'],
      unit: 'in',
      evidenceExpectation: 'source',
      comparison: 'higher_better',
      sensitive: false,
    },
    {
      id: 'car.rear_door_opening_width_in',
      label: 'Rear door opening width',
      valueType: 'number',
      required: false,
      appliesTo: ['candidate'],
      unit: 'in',
      evidenceExpectation: 'source',
      comparison: 'higher_better',
      sensitive: false,
    },
    {
      id: 'car.second_row_legroom_in',
      label: 'Second-row legroom',
      valueType: 'number',
      required: false,
      appliesTo: ['candidate'],
      unit: 'in',
      evidenceExpectation: 'source',
      comparison: 'higher_better',
      sensitive: false,
    },
    {
      id: 'car.ground_clearance_in',
      label: 'Ground clearance',
      valueType: 'number',
      required: false,
      appliesTo: ['candidate'],
      unit: 'in',
      evidenceExpectation: 'source',
      comparison: 'none',
      sensitive: false,
    },
    {
      id: 'car.rear_cargo_crate_fit',
      label: 'Both dog travel crates fit behind the second row without folding seats',
      valueType: 'boolean',
      required: false,
      appliesTo: ['candidate'],
      evidenceExpectation: 'verification',
      comparison: 'target',
      sensitive: false,
    },
    {
      id: 'car.driving_comfort_rating',
      label: 'Driving comfort',
      valueType: 'enum',
      required: false,
      appliesTo: ['candidate'],
      allowedValues: ['excellent', 'good', 'fair', 'poor'],
      orderedValues: ['poor', 'fair', 'good', 'excellent'],
      evidenceExpectation: 'verification',
      comparison: 'higher_better',
      sensitive: false,
    },
  ],

  // packs-and-routing.md "Flexible attributes and criteria"; the task
  // brief's "household priorities from household-profile.json" maps
  // precisely to that fixture's `weightedPreferences.criteria` (weights
  // sum to 1.0 there; `Criterion.weight` here is an integer 0-100, so each
  // weight is *100, matching webmcp.md `sift_update_criteria`'s "Weights
  // must be integers from 0 through 100"). Judgment call: the household
  // profile's separate `mustHaves` list (AWD, adaptive cruise, etc.) is
  // NOT mirrored into `criteria.defaults` here -- those are this specific
  // demo household's non-negotiable declarations, not a general
  // `car-purchase` pack template every household using this pack would
  // want copied into their case verbatim (a different household might not
  // need AWD). They inform how the `car.hard_constraints` obligation is
  // investigated at the case/scenario level (a separate, later task), not
  // this reusable pack manifest's default criteria. `protectedCriterionIds`
  // is empty: all five are meant to be freely reweighted by the household
  // (packs-and-routing.md's required adaptive moment "Reweighting driving
  // comfort above fuel economy reopens household fit" only makes sense if
  // these preference weights are not protected).
  criteria: {
    defaults: [
      {
        id: 'pref.safety_reliability',
        label: 'Safety and reliability',
        kind: 'preference',
        weight: 30,
        direction: 'higher_better',
        // The three ratings this criterion's own `question` already names.
        // Without them the pack's SINGLE HEAVIEST criterion can only ever be
        // reported as unmeasured, which both loses 30% of the scoreboard's
        // coverage and leaves the most important thing on screen with no
        // number beside it. Each part is normalized by its own attribute's
        // `comparison`/`orderedValues` and the results are averaged; a car
        // missing one of the three still scores from the other two, with the
        // partial basis stated.
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
        // Faithful to household-profile.json, which seeds this as
        // `higher_better` -- and correctly so AT THE CRITERION LEVEL: more
        // deal value is better. The MEASUREMENT points the other way
        // (`car.out_the_door_price` declares `comparison: 'lower_better'`,
        // because a lower price is a better deal), and that asymmetry is
        // exactly why `scoreCase` treats the attribute as authoritative on
        // polarity: a criterion phrased as a benefit over a cost measure is
        // an ordinary modelling pattern, not an authoring mistake. Read the
        // criterion's `direction` literally instead and this 20%-weight
        // criterion ranks the most expensive car as the best deal.
        direction: 'higher_better',
        appliesToAttribute: 'car.out_the_door_price',
        origin: 'pack',
        status: 'active',
      },
      {
        id: 'pref.household_fit',
        // Id preserved -- every stored case pins it. The label generalises
        // because this same criterion now measures whether a landscaper's
        // van carries what it has to carry, not only whether a family's
        // estate fits the pram.
        label: 'Practical fit (cargo, seating, known specification match)',
        kind: 'preference',
        weight: 15,
        direction: 'higher_better',
        // The cargo and rear-seat measurements this criterion's `question`
        // names. Deliberately the DIMENSIONAL ones only: `car
        // .rear_cargo_crate_fit` is the case-specific fit question the
        // dog-crate obligation investigates, and folding it in here would
        // double-count the same concern once as evidence and once as score.
        composedOfAttributes: [
          'car.cargo_volume_cu_ft',
          'car.cargo_width_in',
          'car.cargo_length_in',
          'car.rear_door_opening_width_in',
          'car.second_row_legroom_in',
        ],
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
    ],
    allowUserDefined: true,
    protectedCriterionIds: [],
  },

  // packs-and-routing.md "Required obligations" table, quoted verbatim for
  // id/question/requiredEvidenceLevel/maxAttempts. `dependsOn`: the task
  // brief states "car.shortlist depends on the other five"; the other five
  // obligations declare no dependencies among each other (deal
  // normalization, ownership cost, safety/reliability, and household fit
  // can each be investigated independently and in parallel -- this is
  // exactly what the Graph topology's two parallel branches in
  // strands-runtime.md "Orchestration" encode). `priority`: not given
  // verbatim by the spec (a judgment call) -- `car.hard_constraints` is
  // highest (100; it is the gating filter every other obligation's
  // candidate set depends on being investigated first in practice, even
  // though the schema does not encode that as a formal `dependsOn`),
  // the four parallel evidence-gathering obligations are equal-and-high
  // (80), household fit is slightly lower (70, since it tolerates
  // accepted uncertainty most readily), and `car.shortlist` is lowest
  // (10) since it is the final synthesis step and must run last.
  // `acceptedUncertaintyAllowed` (both the top-level field and the
  // matching `completionRule` field, kept consistent per obligation): true
  // only for `car.safety_reliability` (source disagreements, e.g. the
  // Outback's CVT reliability conflict in safety-reliability-sources.json,
  // may remain genuinely unresolved even after `source-challenger` review)
  // and `car.household_fit` (household-fit.json's `explicitUnknowns` are
  // designed to resolve only via test drive or physical measurement, per
  // packs-and-routing.md's required adaptive moment "Sift creates a
  // test-drive question instead of fabricating a comfort score"). The
  // other four are deterministic pass/fail or arithmetic obligations with
  // no legitimate partial-credit disposition, so acceptedUncertaintyAllowed:
  // false there. `minimumIndependentSources` in `completionRule`: 1 for
  // E1, 2 for E2, matching the evidence-level table's "E2: corroborated by
  // two independent sources or one authoritative source" read as its
  // stronger, two-source case for a simple integer bound.
  obligations: [
    {
      id: 'car.hard_constraints',
      label: 'Hard constraints',
      question: "Which candidates satisfy the household's budget and non-negotiable needs?",
      category: 'constraints',
      required: true,
      priority: 100,
      requiredEvidenceLevel: 'E1',
      maxAttempts: 2,
      acceptedUncertaintyAllowed: false,
      dependsOn: [],
      preferredSkills: ['listing-normalizer'],
      preferredSpecialists: ['deal-analyst'],
      completionRule: {
        minimumEvidenceLevel: 'E1',
        minimumIndependentSources: 1,
        acceptedUncertaintyAllowed: false,
      },
      origin: 'pack',
    },
    {
      id: 'car.deal_normalization',
      label: 'Deal normalization',
      question:
        "What is each candidate's comparable out-the-door price and which terms or add-ons are uncertain?",
      category: 'deal',
      required: true,
      priority: 80,
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
      acceptedUncertaintyAllowed: false,
      dependsOn: [],
      preferredSkills: ['deal-analysis'],
      preferredSpecialists: ['deal-analyst'],
      completionRule: {
        minimumEvidenceLevel: 'E2',
        minimumIndependentSources: 2,
        acceptedUncertaintyAllowed: false,
      },
      origin: 'pack',
    },
    {
      id: 'car.ownership_cost',
      label: 'Ownership cost',
      question: 'What is the comparable five-year ownership estimate under the same assumptions?',
      category: 'ownership_cost',
      required: true,
      priority: 80,
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
      acceptedUncertaintyAllowed: false,
      dependsOn: [],
      preferredSkills: ['ownership-cost'],
      preferredSpecialists: ['ownership-cost-analyst'],
      completionRule: {
        minimumEvidenceLevel: 'E2',
        minimumIndependentSources: 2,
        acceptedUncertaintyAllowed: false,
      },
      origin: 'pack',
    },
    {
      id: 'car.safety_reliability',
      label: 'Safety and reliability',
      question:
        'Which material safety and reliability differences are supported by traceable sources?',
      category: 'safety_reliability',
      required: true,
      priority: 80,
      requiredEvidenceLevel: 'E2',
      maxAttempts: 3,
      acceptedUncertaintyAllowed: true,
      dependsOn: [],
      preferredSkills: ['safety-reliability'],
      preferredSpecialists: ['safety-reliability-analyst', 'source-challenger'],
      completionRule: {
        minimumEvidenceLevel: 'E2',
        minimumIndependentSources: 2,
        acceptedUncertaintyAllowed: true,
      },
      origin: 'pack',
    },
    {
      id: 'car.household_fit',
      label: 'Household fit',
      question:
        'Which needs can be established from specifications and which require household judgment or a test drive?',
      category: 'household_fit',
      required: true,
      priority: 70,
      requiredEvidenceLevel: 'E1',
      maxAttempts: 2,
      acceptedUncertaintyAllowed: true,
      dependsOn: [],
      preferredSkills: ['household-fit'],
      preferredSpecialists: ['household-fit-analyst'],
      completionRule: {
        minimumEvidenceLevel: 'E1',
        minimumIndependentSources: 1,
        acceptedUncertaintyAllowed: true,
      },
      origin: 'pack',
    },
    {
      id: 'car.shortlist',
      label: 'Shortlist recommendation',
      question:
        'Which candidate should advance, what could change that result, and what remains to verify?',
      category: 'shortlist',
      required: true,
      priority: 10,
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
      acceptedUncertaintyAllowed: false,
      dependsOn: [
        'car.hard_constraints',
        'car.deal_normalization',
        'car.ownership_cost',
        'car.safety_reliability',
        'car.household_fit',
      ],
      preferredSkills: ['decision-synthesis'],
      preferredSpecialists: ['decision-synthesizer', 'source-challenger'],
      completionRule: {
        minimumEvidenceLevel: 'E2',
        minimumIndependentSources: 2,
        acceptedUncertaintyAllowed: false,
      },
      origin: 'pack',
      // Which candidate should advance is an answer *about* the criteria,
      // so reweighting them makes it stale and it has to be re-synthesized;
      // the five measurement obligations above it stay satisfied, because a
      // normalized deal or a safety record does not change when the
      // household decides ownership cost matters more. See the field's own
      // comment in contracts/packs.ts.
      dependsOnCriteria: true,
    },
  ],

  extensionPolicy: {
    allowCaseAttributes: true,
    allowCaseCriteria: true,
    allowCaseObligations: true,
    userConcernTemplateId: 'car.user_concern',
  },

  // packs-and-routing.md "Skills, specialists, and tools" -> "Skills:".
  skills: [
    {
      id: 'listing-normalizer',
      description:
        'Normalizes raw listing and dealer-offer terms into comparable structured fields (advertised price, mileage, mandatory add-ons, financing terms).',
    },
    {
      id: 'deal-analysis',
      description:
        "Computes each candidate's comparable out-the-door price, flags teaser-price/add-on/financing conflicts, and surfaces deal value relative to the household's stated budget.",
    },
    {
      id: 'ownership-cost',
      description:
        'Computes a five-year total ownership cost estimate (fuel, maintenance, insurance, depreciation, financing) under shared assumptions applied consistently across candidates.',
    },
    {
      id: 'safety-reliability',
      description:
        'Retrieves and compares crash-safety, driver-assistance, and reliability ratings from independent published sources, flagging disagreements between sources.',
    },
    {
      id: 'household-fit',
      description:
        'Compares candidate cargo and rear-seat specifications against household needs and flags concerns that require test-drive or physical measurement.',
    },
    {
      id: 'decision-synthesis',
      description:
        'Synthesizes normalized deal, ownership-cost, safety/reliability, and household-fit evidence into a source-linked shortlist recommendation.',
    },
  ],

  // packs-and-routing.md "Skills, specialists, and tools" -> "Specialists:".
  // `allowedTools`/`allowedSkills` per specialist are a judgment call
  // (strands-runtime.md only says "Each has a narrow prompt and tool
  // subset" -- no exact grant list), chosen so each specialist's tool
  // grant is exactly the fixture tool(s) its obligation-domain needs, and
  // its skill grant is the skill(s) that activate it. `source-challenger`
  // is granted `listing-reader` (teaser-price/add-on conflicts, per the
  // required adaptive moment "A teaser-price claim conflicts with
  // mandatory add-ons and financing terms ... activating
  // source-challenger") and `safety-reliability-lookup` (the Outback CVT
  // reliability disagreement in safety-reliability-sources.json, flagged
  // `requiresSourceChallengeReview: true`), with no `allowedSkills` since
  // it is invoked as its own bounded Graph agent-tool rather than through
  // ordinary skill activation.
  specialists: [
    {
      id: 'deal-analyst',
      description:
        'Analyzes normalized listing and dealer-offer terms to compute comparable out-the-door price and evaluate hard-constraint and teaser-price conflicts.',
      allowedTools: ['listing-reader'],
      allowedSkills: ['listing-normalizer', 'deal-analysis'],
    },
    {
      id: 'ownership-cost-analyst',
      description:
        'Computes five-year ownership cost estimates from shared assumptions and per-candidate specification data.',
      allowedTools: ['ownership-calculator'],
      allowedSkills: ['ownership-cost'],
    },
    {
      id: 'safety-reliability-analyst',
      description:
        'Retrieves and compares safety and reliability ratings across independent sources for each candidate.',
      allowedTools: ['safety-reliability-lookup'],
      allowedSkills: ['safety-reliability'],
    },
    {
      id: 'household-fit-analyst',
      description:
        'Compares candidate specifications against household cargo, rear-seat, and comfort needs, and surfaces explicit unknowns requiring a test drive or physical measurement.',
      allowedTools: ['household-fit-matrix'],
      allowedSkills: ['household-fit'],
    },
    {
      id: 'source-challenger',
      description:
        'Evaluates provenance, recency, and contradictions across submitted evidence before it can satisfy an obligation.',
      allowedTools: ['listing-reader', 'safety-reliability-lookup'],
      allowedSkills: [],
    },
    {
      id: 'decision-synthesizer',
      description:
        'Synthesizes resolved evidence across all prior obligations into a source-linked shortlist recommendation, gated by its own GoalLoop validator and requiring human approval before the recommendation is recorded.',
      allowedTools: ['propose_recommendation'],
      allowedSkills: ['decision-synthesis'],
    },
  ],

  // packs-and-routing.md: "Orchestration: deterministic Strands Graph with
  // bounded model work inside each node." strands-runtime.md "Orchestration"
  // topology: `deal-analyst` + `ownership-cost-analyst` (left branch) and
  // `safety-reliability-analyst` + `household-fit-analyst` (right branch)
  // feed into `source-challenger` then `decision-synthesizer` -- six total
  // node executions, matching the default execution bound "six graph node
  // executions per run" exactly (`maxSteps: 6`). `maxConcurrency: 4` lets
  // all four first-layer specialist nodes run concurrently before
  // converging (the two Graph branches are themselves each two nodes wide,
  // not two nodes deep). `nodeTimeoutMs`/`totalTimeoutMs` are the default
  // execution bounds' "120-second model request timeout" and "five-minute
  // total run timeout" from strands-runtime.md "Engine loop" verbatim.
  orchestration: {
    strategy: 'graph',
    maxSteps: 6,
    nodeTimeoutMs: 120_000,
    totalTimeoutMs: 300_000,
    maxConcurrency: 4,
  },

  // packs-and-routing.md "Skills, specialists, and tools" -> "Fixture
  // tools: listing/offer reader, specification lookup, safety/reliability
  // source lookup, ownership calculator, household-fit matrix." Named per
  // the task brief's explicit kebab-case list (`listing-reader`,
  // `ownership-calculator`, `safety-reliability-lookup`,
  // `household-fit-matrix`) to match packages/scenarios/src/tools/'s sibling
  // implementation task. Judgment call: "specification lookup" is folded
  // into `household-fit-matrix` rather than declared as a fifth,
  // separately-named data tool -- household-fit.json's fixture data already
  // merges per-candidate `knownSpecifications` together with the
  // fit-comparison `explicitUnknowns` in one bundle, and cargo/rear-seat
  // specification lookup has no other obligation consumer in this pack (the
  // hard-constraint safety features deal-analyst checks come from
  // `car.standard_features` on the listing itself, not a separate spec
  // lookup). `propose_recommendation` is named exactly as
  // strands-runtime.md's own worked example: "the orchestrator invokes to
  // create a consequential artifact (for example `propose_recommendation`
  // in the car pack ...)" -- this is the one consequential effect
  // packs-and-routing.md names for this pack ("advancing candidates to the
  // household's test-drive shortlist requires explicit human approval"),
  // gated by `ConsequenceGuard`'s `beforeToolCall` intervention.
  tools: [
    {
      id: 'listing-reader',
      description:
        'Reads normalized candidate listing and dealer-offer terms (advertised price, mileage, standard features, mandatory add-ons, financing terms) from fixture or bounded live listing sources.',
      effect: 'read_only',
      requiresApproval: false,
    },
    {
      id: 'ownership-calculator',
      description:
        'Computes a five-year total ownership cost estimate (fuel, maintenance, insurance, depreciation, financing) from shared assumptions and per-candidate inputs.',
      effect: 'read_only',
      requiresApproval: false,
    },
    {
      id: 'safety-reliability-lookup',
      description:
        'Retrieves crash-safety, driver-assistance, and reliability findings for a candidate from independent published sources, including any flagged disagreements between sources.',
      effect: 'read_only',
      requiresApproval: false,
    },
    {
      id: 'household-fit-matrix',
      description:
        "Reads candidate cargo and rear-seat specifications and compares them against the household's stated dimensions and needs, returning explicit unknowns where physical measurement or a test drive is required.",
      effect: 'read_only',
      requiresApproval: false,
    },
    {
      id: 'propose_recommendation',
      description:
        "Creates the consequential proposal to advance one or more candidates to the household's test-drive shortlist. Requires explicit human approval before the proposal is recorded; the pack cannot contact a dealer, schedule a test drive, reserve a car, apply for financing, negotiate, or purchase anything.",
      effect: 'consequential',
      requiresApproval: true,
    },
  ],

  // packs-and-routing.md: "Consequential effect: advancing candidates to
  // the household's test-drive shortlist requires explicit human approval."
  // This is the pack's only consequential effect, so one policy is
  // sufficient; the pack's other exclusions (financing, negotiation,
  // scheduling, purchase) require no separate forbidden-effect policy
  // entry because no tool for any of them is declared at all -- there is
  // nothing ungated to gate.
  policies: [
    {
      id: 'car.shortlist-approval',
      description:
        "Advancing any candidate to the household's test-drive shortlist requires explicit human approval before the recommendation is recorded.",
      requiresHumanApproval: true,
      appliesToToolIds: ['propose_recommendation'],
    },
  ],

  presentation: {
    optionLabel: 'Saved car',
    optionLabelPlural: 'Saved cars',
    // What a browse card leads with, in priority order. Deliberately NOT
    // the `basics` group below: make/model/year/trim only restate the
    // option's own title ("2022 Toyota RAV4 XLE Hybrid AWD"), so a card
    // built from them says the same thing five times and never shows a
    // price. These four are the numbers a person actually chooses between.
    // The full, sectioned list still lives in `attributeGroups`, which the
    // detail profile and the comparison table use.
    prominentAttributeIds: [
      'car.advertised_price',
      'car.out_the_door_price',
      'car.mileage',
      'car.crash_safety_rating',
    ],
    attributeGroups: [
      {
        id: 'basics',
        label: 'Vehicle basics',
        attributeIds: [
          'car.make',
          'car.model',
          'car.model_year',
          'car.trim',
          'car.body_style',
          'car.drivetrain',
          'car.powertrain',
          'car.mileage',
          'car.standard_features',
        ],
      },
      {
        id: 'deal',
        label: 'Deal and pricing',
        attributeIds: [
          'car.advertised_price',
          'car.out_the_door_price',
          'car.teaser_price_gap_amount',
          'car.has_teaser_price_conflict',
          'car.estimated_monthly_payment',
        ],
      },
      {
        id: 'ownership',
        label: 'Ownership cost',
        attributeIds: [
          'car.five_year_fuel_cost',
          'car.five_year_maintenance_cost',
          'car.five_year_ownership_cost',
          'car.combined_fuel_economy_mpg',
          'car.annual_insurance_premium',
        ],
      },
      {
        id: 'safety',
        label: 'Safety and reliability',
        attributeIds: [
          'car.crash_safety_rating',
          'car.driver_assistance_rating',
          'car.reliability_rating',
        ],
      },
      {
        id: 'household_fit',
        label: 'Household fit',
        attributeIds: [
          'car.cargo_volume_cu_ft',
          'car.cargo_width_in',
          'car.cargo_length_in',
          'car.rear_door_opening_width_in',
          'car.second_row_legroom_in',
          'car.ground_clearance_in',
          'car.rear_cargo_crate_fit',
          'car.driving_comfort_rating',
        ],
      },
    ],
  },

  // Judgment call: scenario *content* files (scenarios/<scenario-id>.json,
  // fixtures/<scenario-id>/*.json per pack-authoring.md's pack bundle
  // layout) are separate, later authoring work -- this manifest only
  // declares the ids `requiresNegativeCase` needs to see. Three ids give
  // the compiler's required happy-path/negative pairing plus direct
  // traceability to two of packs-and-routing.md's "Required adaptive
  // moments": a teaser-price-conflict steering scenario (activates
  // `source-challenger`) and a household-fit-unknown human-boundary
  // scenario (accepted uncertainty pending a test drive).
  evaluation: {
    scenarioIds: [
      'car-purchase-happy-path',
      'car-purchase-teaser-price-conflict',
      'car-purchase-household-fit-unknown',
    ],
    requiresNegativeCase: true,
  },

  // docs/change-sets/2026-08-30-generic-decision-workspace.md §46/§47
  // pack-level Decision Guide, ADR 0006 decision 6, docs/specs/webmcp.md
  // "Decision Guide". Declarative data consumed as a `sift_get_decision_guide`
  // tool result and Decision Profile UI content -- never concatenated into a
  // model's own system prompt (see `DecisionGuideSchema`'s header comment in
  // packages/contracts/src/packs.ts for the full structural argument).
  // Every claim below is grounded in this same manifest's own obligations,
  // criteria, and attribute definitions above -- nothing here asserts a car-
  // buying fact this pack does not already investigate.
  decisionGuide: {
    domainPurpose:
      'Deciding which shortlisted vehicle candidate a household should advance to a test drive, by weighing hard budget and feature constraints against comparable deal terms, five-year ownership cost, safety and reliability, and household-specific fit.',
    discoveryStrategy:
      "Establish the household's hard constraints -- budget ceiling versus target, and which features are truly non-negotiable -- before comparing candidates. Deal value, ownership cost, safety/reliability, and household fit can then be investigated in parallel, since each draws on independent sources and none depends on the others' results.",
    suggestedQuestions: [
      'Is the stated budget a hard ceiling, or a target the household would stretch for the right car?',
      'Which features, if any, are truly non-negotiable rather than merely preferred?',
      'How many people and how much cargo does the vehicle need to carry regularly?',
      'Does anyone in the household have a physical fit need -- car seats, mobility equipment, travel crates -- that only a measurement or test drive can confirm?',
    ],
    importantUnknowns: [
      'Whether cargo, rear-seat, or equipment fit is adequate usually cannot be confirmed from published specifications alone, and may require a physical measurement or test drive.',
      'Advertised price rarely matches the true out-the-door price once fees, mandatory add-ons, and financing terms are included.',
    ],
    researchGuidance:
      "Prefer independent published crash-safety, driver-assistance, and reliability sources over a single dealer or manufacturer claim, and treat one source's rating as provisional until a second source corroborates or contradicts it.",
    customFieldGuidance:
      "Prefer a typed custom field over noting an important comparison factor only in prose -- for example, a specific cargo item or accessibility need this pack did not anticipate. Do not infer a subjective fit or comfort judgment without supporting evidence or a household member's own observation.",
    presentationGuidance:
      'Deal terms and five-year ownership cost are usually worth comparing together, since a lower advertised price can still mean a higher total cost. Safety and reliability ratings are usually compared as a group rather than one attribute at a time.',
  },

  // --- Adaptive discovery ---
  //
  // This is what makes one pack produce two materially different journeys
  // rather than one questionnaire with some fields greyed out. `vehicle
  // .use_case` is asked first, at the highest priority, and almost everything
  // else hangs off it: a family is never asked about payload, worksite
  // access, or downtime risk, and a landscaping business is never asked about
  // child seats or the school run.
  //
  // Two rules govern the phrasing of every question below:
  //
  // 1. **Ask functionally, not personally.** "Who and what has to fit in it
  //    regularly?" gets the same answer as "do you have kids?" while being
  //    none of Sift's business. The pack asks what must fit, not who someone
  //    is.
  // 2. **No required topic offers a skip.** `DiscoveryTopicTemplateSchema`
  //    refuses `allowDefer` on a required topic outright, but every required
  //    topic here still offers a genuine way out -- a custom answer, or "not
  //    sure" -- so a person is never trapped by a question they cannot
  //    answer. Not sure is a real answer that creates an information need;
  //    it is not a skip.
  discovery: {
    topics: [
      {
        id: 'vehicle.use_case',
        label: 'What this vehicle is for',
        question: 'What will this vehicle mainly be used for?',
        necessity: 'required',
        priority: 100,
        allowedInteractions: ['single_select'],
        optionSeeds: [
          {
            id: 'seed.family',
            label: 'Personal or family use',
            detail: 'Commuting, family transport, trips',
            valueSummary: 'family',
          },
          {
            id: 'seed.business',
            label: 'A business or trade',
            detail: 'Carrying tools, materials, or crew to jobs',
            valueSummary: 'business',
          },
          {
            id: 'seed.mixed',
            label: 'Both',
            detail: 'It has to work for the family and for work',
            valueSummary: 'mixed',
          },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: false,
          allowUnsure: false,
          allowDefer: false,
        },
        mapsToAttributeIds: [],
        mapsToCriterionIds: [],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.budget',
        label: 'Budget',
        question:
          'What is your budget, and is that a hard ceiling or a figure you would stretch for the right vehicle?',
        necessity: 'required',
        priority: 95,
        allowedInteractions: ['range', 'free_text'],
        optionSeeds: [],
        escapeHatches: {
          allowCustom: true,
          allowNone: false,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: ['car.advertised_price', 'car.out_the_door_price'],
        mapsToCriterionIds: ['pref.deal_value'],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.occupants',
        label: 'Who and what has to fit',
        question: 'Who travels in it regularly, and what has to fit in with them?',
        necessity: 'required',
        priority: 90,
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['family', 'mixed'] },
        allowedInteractions: ['multi_select', 'free_text'],
        optionSeeds: [
          { id: 'seed.two_adults', label: 'Two adults', valueSummary: 'Two adults' },
          {
            id: 'seed.children',
            label: 'Children in car seats or boosters',
            valueSummary: 'Children in car seats or boosters',
          },
          {
            id: 'seed.older_children',
            label: 'Older children or teenagers',
            valueSummary: 'Older children or teenagers',
          },
          {
            id: 'seed.dog',
            label: 'A dog',
            detail: 'Loose, crated, or behind a guard',
            valueSummary: 'A dog travelling in the vehicle',
          },
          {
            id: 'seed.passengers',
            label: 'Other regular passengers',
            valueSummary: 'Other regular passengers',
          },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: false,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: ['car.second_row_legroom_in'],
        mapsToCriterionIds: ['pref.household_fit'],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.payload_towing',
        label: 'Payload and towing',
        question: 'What is the heaviest or largest thing this vehicle has to carry or tow?',
        necessity: 'required',
        priority: 90,
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['business', 'mixed'] },
        allowedInteractions: ['multi_select', 'free_text'],
        optionSeeds: [
          {
            id: 'seed.trailer',
            label: 'A trailer',
            detail: 'Plant, mowers, or a tipper',
            valueSummary: 'Tows a trailer',
          },
          {
            id: 'seed.loose_material',
            label: 'Loose material',
            detail: 'Soil, bark, aggregate, green waste',
            valueSummary: 'Carries loose material in bulk',
          },
          {
            id: 'seed.long_items',
            label: 'Long items',
            detail: 'Timber, poles, ladders',
            valueSummary: 'Carries long items',
          },
          {
            id: 'seed.crew',
            label: 'A crew and their kit',
            valueSummary: 'Carries a crew and their kit',
          },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: false,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: ['car.cargo_volume_cu_ft', 'car.cargo_length_in'],
        mapsToCriterionIds: ['pref.household_fit'],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.child_seats',
        label: 'Car seat layout',
        question: 'How many car seats or boosters have to fit at once, and in which row?',
        necessity: 'required',
        priority: 80,
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['family', 'mixed'] },
        allowedInteractions: ['single_select', 'yes_no_unsure'],
        optionSeeds: [
          { id: 'seed.none', label: 'None', valueSummary: 'No car seats required' },
          { id: 'seed.one', label: 'One', valueSummary: 'One car seat' },
          { id: 'seed.two', label: 'Two', valueSummary: 'Two car seats' },
          {
            id: 'seed.three_across',
            label: 'Three across',
            detail: 'The layout most vehicles fail',
            valueSummary: 'Three car seats across one row',
          },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: true,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: ['car.second_row_legroom_in', 'car.rear_door_opening_width_in'],
        mapsToCriterionIds: ['pref.household_fit'],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.equipment_access',
        label: 'Loading and equipment access',
        question:
          'How does equipment get in and out, and does anything about that constrain the vehicle?',
        necessity: 'required',
        priority: 80,
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['business', 'mixed'] },
        allowedInteractions: ['multi_select', 'free_text'],
        optionSeeds: [
          {
            id: 'seed.ramp',
            label: 'Ramp or tail lift',
            valueSummary: 'Equipment is loaded by ramp or tail lift',
          },
          {
            id: 'seed.side_door',
            label: 'Side loading',
            valueSummary: 'Needs side loading access',
          },
          {
            id: 'seed.low_floor',
            label: 'Low load floor',
            detail: 'Lifting heavy items by hand',
            valueSummary: 'Needs a low load floor',
          },
          {
            id: 'seed.secure',
            label: 'Lockable and weatherproof',
            valueSummary: 'Load area must be lockable and weatherproof',
          },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: true,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: ['car.cargo_width_in', 'car.rear_door_opening_width_in'],
        mapsToCriterionIds: ['pref.household_fit'],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.cargo_household',
        label: 'What you carry',
        question: 'What do you regularly need to fit in the back?',
        necessity: 'required',
        priority: 75,
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['family', 'mixed'] },
        allowedInteractions: ['multi_select', 'free_text'],
        optionSeeds: [
          {
            id: 'seed.pram',
            label: 'A pram or stroller',
            valueSummary: 'A pram or stroller',
          },
          {
            id: 'seed.sports',
            label: 'Sports or hobby kit',
            valueSummary: 'Sports or hobby equipment',
          },
          {
            id: 'seed.holiday',
            label: 'Luggage for everyone',
            valueSummary: 'Luggage for the whole household',
          },
          {
            id: 'seed.crate',
            label: 'A dog crate',
            valueSummary: 'A dog crate',
          },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: true,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: ['car.cargo_volume_cu_ft', 'car.cargo_width_in', 'car.cargo_length_in'],
        mapsToCriterionIds: ['pref.household_fit'],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.worksite_access',
        label: 'Where it has to go',
        question: 'What are the tightest or roughest places this vehicle has to get into?',
        necessity: 'required',
        priority: 75,
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['business', 'mixed'] },
        allowedInteractions: ['multi_select', 'free_text'],
        optionSeeds: [
          {
            id: 'seed.narrow_gates',
            label: 'Narrow gates or lanes',
            valueSummary: 'Narrow gates or lanes',
          },
          {
            id: 'seed.soft_ground',
            label: 'Soft or unmade ground',
            valueSummary: 'Soft or unmade ground',
          },
          {
            id: 'seed.height_limits',
            label: 'Height-restricted car parks',
            valueSummary: 'Height-restricted access',
          },
          {
            id: 'seed.urban',
            label: 'Dense urban streets',
            valueSummary: 'Dense urban streets and tight parking',
          },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: true,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: ['car.ground_clearance_in', 'car.drivetrain'],
        mapsToCriterionIds: ['pref.household_fit'],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.usage_pattern',
        label: 'How it gets used',
        question: 'What does a typical week of driving look like?',
        necessity: 'required',
        priority: 70,
        allowedInteractions: ['multi_select'],
        optionSeeds: [
          {
            id: 'seed.short_trips',
            label: 'Mostly short local trips',
            valueSummary: 'Mostly short local trips',
          },
          {
            id: 'seed.commute',
            label: 'A regular commute',
            valueSummary: 'A regular commute',
          },
          {
            id: 'seed.motorway',
            label: 'Long motorway runs',
            valueSummary: 'Long motorway runs',
          },
          {
            id: 'seed.stop_start',
            label: 'Lots of stop-start work',
            detail: 'Many drops in a day',
            valueSummary: 'Frequent stop-start driving',
          },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: false,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: ['car.combined_fuel_economy_mpg', 'car.five_year_fuel_cost'],
        mapsToCriterionIds: ['pref.ownership_cost'],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.downtime_risk',
        label: 'What downtime costs',
        question: 'If this vehicle is off the road for a week, what happens to the work?',
        necessity: 'required',
        priority: 65,
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['business', 'mixed'] },
        allowedInteractions: ['single_select'],
        optionSeeds: [
          {
            id: 'seed.stops',
            label: 'Work stops',
            detail: 'There is no substitute',
            valueSummary: 'Work stops entirely',
          },
          {
            id: 'seed.slows',
            label: 'Work slows down',
            valueSummary: 'Work continues but slows',
          },
          {
            id: 'seed.absorbed',
            label: 'It can be absorbed',
            valueSummary: 'Downtime can be absorbed',
          },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: false,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: ['car.reliability_rating'],
        mapsToCriterionIds: ['pref.safety_reliability'],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.environment',
        label: 'Where it lives',
        question: 'Where is it parked, and what weather or road conditions does it face?',
        necessity: 'required',
        priority: 60,
        allowedInteractions: ['multi_select'],
        optionSeeds: [
          {
            id: 'seed.garage',
            label: 'A garage with limited space',
            valueSummary: 'Parked in a size-limited garage',
          },
          {
            id: 'seed.street',
            label: 'On the street',
            valueSummary: 'Parked on the street',
          },
          { id: 'seed.snow', label: 'Snow and ice', valueSummary: 'Snow and ice in winter' },
          {
            id: 'seed.unpaved',
            label: 'Unpaved roads or tracks',
            valueSummary: 'Regular unpaved roads or tracks',
          },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: true,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: ['car.drivetrain', 'car.ground_clearance_in'],
        mapsToCriterionIds: ['pref.household_fit'],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.priorities',
        label: 'What matters most',
        question:
          'Of the things this vehicle has to get right, which matter most and which are nice to have?',
        necessity: 'required',
        priority: 55,
        allowedInteractions: ['importance_sort', 'ranking'],
        optionSeeds: [
          {
            id: 'seed.running_cost',
            label: 'Running and ownership cost',
            valueSummary: 'Running and ownership cost',
          },
          {
            id: 'seed.safety',
            label: 'Safety and reliability',
            valueSummary: 'Safety and reliability',
          },
          {
            id: 'seed.space',
            label: 'Space and practicality',
            valueSummary: 'Space and practicality',
          },
          { id: 'seed.price', label: 'Purchase price', valueSummary: 'Purchase price' },
          { id: 'seed.comfort', label: 'Comfort to drive', valueSummary: 'Comfort to drive' },
        ],
        escapeHatches: {
          allowCustom: true,
          allowNone: false,
          allowUnsure: true,
          allowDefer: false,
        },
        mapsToAttributeIds: [],
        mapsToCriterionIds: [
          'pref.ownership_cost',
          'pref.safety_reliability',
          'pref.household_fit',
          'pref.deal_value',
          'pref.driving_comfort',
        ],
        confirmationRequired: true,
      },
      {
        id: 'vehicle.operating_cost',
        label: 'Cost per job',
        question: 'Is fuel or running cost a figure you track per job?',
        necessity: 'soft',
        priority: 50,
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['business', 'mixed'] },
        allowedInteractions: ['yes_no_unsure', 'free_text'],
        optionSeeds: [],
        escapeHatches: {
          allowCustom: true,
          allowNone: true,
          allowUnsure: true,
          allowDefer: true,
        },
        mapsToAttributeIds: ['car.five_year_fuel_cost'],
        mapsToCriterionIds: ['pref.ownership_cost'],
        confirmationRequired: false,
      },
      {
        id: 'vehicle.upfit',
        label: 'Racking and fit-out',
        question: 'Does anything need fitting out afterwards -- racking, a liner, signage?',
        necessity: 'soft',
        priority: 45,
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['business', 'mixed'] },
        allowedInteractions: ['free_text'],
        optionSeeds: [],
        escapeHatches: {
          allowCustom: true,
          allowNone: true,
          allowUnsure: true,
          allowDefer: true,
        },
        mapsToAttributeIds: ['car.cargo_volume_cu_ft'],
        mapsToCriterionIds: [],
        confirmationRequired: false,
      },
      {
        id: 'vehicle.brand_preference',
        label: 'Anything ruled in or out',
        question: 'Is there any make or model you already know you do or do not want?',
        necessity: 'soft',
        priority: 20,
        allowedInteractions: ['free_text'],
        optionSeeds: [],
        escapeHatches: {
          allowCustom: true,
          allowNone: true,
          allowUnsure: true,
          allowDefer: true,
        },
        mapsToAttributeIds: ['car.make', 'car.model'],
        mapsToCriterionIds: [],
        confirmationRequired: false,
      },
    ],

    // The one required challenge pass before model discovery. These are
    // plausible omissions, not a second questionnaire -- each one is a thing
    // people genuinely forget until the vehicle is already on the driveway.
    blindSpots: [
      {
        id: 'blindspot.child_seat_layout',
        label: 'Car seat layout',
        detail:
          'Three seats across, or a rear-facing seat behind a tall driver, rules out more vehicles than anything else.',
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['family', 'mixed'] },
      },
      {
        id: 'blindspot.pets_and_luggage',
        label: 'A dog and the luggage at the same time',
        detail: 'Space for either is common; space for both at once is not.',
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['family', 'mixed'] },
      },
      {
        id: 'blindspot.garage_clearance',
        label: 'Where it has to park',
        detail: 'Garage length and height, or a tight communal space.',
      },
      {
        id: 'blindspot.mobility_equipment',
        label: 'Mobility or medical equipment',
        detail: 'A folded wheelchair, a walker, or an oxygen cylinder that has to travel too.',
      },
      {
        id: 'blindspot.charging_access',
        label: 'Charging where you park',
        detail: 'An electric vehicle is only cheap to run if you can charge it where it sleeps.',
      },
      {
        id: 'blindspot.long_term_cost',
        label: 'The cost after the purchase',
        detail: 'Insurance, servicing, tyres, and depreciation usually outweigh the sticker gap.',
      },
      {
        id: 'blindspot.load_height',
        label: 'How high things have to be lifted',
        detail: 'Load floor height decides whether a day of loading is manageable.',
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['business', 'mixed'] },
      },
      {
        id: 'blindspot.secure_storage',
        label: 'Leaving tools in it overnight',
        detail: 'Whether the load area can be locked, and what the insurer requires.',
        appliesWhen: { topicId: 'vehicle.use_case', equalsAnyOf: ['business', 'mixed'] },
      },
    ],
  },
};

/** Convenience wrapper: `compilePack(CAR_PURCHASE_MANIFEST, catalog, clock)`. */
export function compileCarPurchasePack(
  catalog: CapabilityCatalog,
  clock: Clock,
): CompiledDecisionPack {
  return compilePack(CAR_PURCHASE_MANIFEST, catalog, clock);
}
