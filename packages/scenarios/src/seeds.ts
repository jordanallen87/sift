/**
 * Loads the real car-purchase fixture data into the four candidate
 * `EntityRecord`s the "Choose Our Next Car" demo compares, plus the full
 * seed `CaseEvent` sequence a fresh demo case needs.
 *
 * `instantiateCase` (`@pax/core`) alone only ever seeds pack-declared state
 * (`pack`, `criteria`, `obligations`, `attributeDefinitions`) -- it always
 * seeds `entities: []` (see that file's own header comment). This module is
 * the "whatever glue is needed to load the car-purchase fixtures into
 * initial CaseState/entities via `instantiateCase` + `option.upserted`
 * events for the four candidates" this task calls for.
 *
 * `buildCarPurchaseCandidateEntities` deliberately calls the REAL fixture
 * tools (`readListing`/`calculateOwnershipCost`/`lookupSafetyReliability`/
 * `lookupHouseholdFit` -- `./tools/index.js`, read-only reference) to
 * compute every entity attribute, rather than re-deriving the same
 * arithmetic a second time here. This keeps the seeded "current best known
 * value" on each candidate's `EntityRecord` byte-for-byte identical to what
 * a Strands specialist independently re-discovers when it calls the exact
 * same tool during the Graph investigation -- there are not two competing
 * sources of truth for one fixture fact.
 *
 * --- Two real, pre-existing mismatches in the read-only fixture-tool/pack
 * layers this module works around (documented, not silently patched over;
 * flagged loudly in the dated docs/build-log.md entry for this task since
 * neither file may be edited) ---
 *
 * 1. `listing-reader.ts`'s `CandidateListingFacts`/`CandidateDealerOfferFacts`
 *    never expose `standardFeatures`, even though `candidate-listings.json`
 *    itself has one and the car-purchase pack manifest declares
 *    `car.standard_features` as `required: true`. This module reads that one
 *    field directly from `loadFixture('candidate-listings')` (a real,
 *    already-exported `@pax/scenarios` function, not a private tool
 *    internal) rather than leaving a required pack attribute permanently
 *    unseeded.
 * 2. `household-fit-matrix.ts`'s `KNOWN_SPEC_FIELDS` definition ids
 *    (`car.cargo_width_between_wheel_wells_in`,
 *    `car.cargo_length_seat_to_liftgate_in`,
 *    `car.cargo_height_floor_to_ceiling_in`,
 *    `car.cargo_volume_behind_second_row_cu_ft`) do not match the car-purchase
 *    pack manifest's own attribute ids
 *    (`car.cargo_width_in`/`car.cargo_length_in`/`car.cargo_volume_cu_ft`;
 *    the pack declares no height-floor-to-ceiling attribute at all).
 *    `HOUSEHOLD_FIT_DEFINITION_ID_TRANSLATION` below maps the tool's ids to
 *    the pack's, dropping the one field the pack never declares. The same
 *    translation table is reused wherever a later task folds a live
 *    `household-fit-matrix` tool call's `knownFacts` into `EntityRecord`
 *    attributes, so the two never drift against each other.
 *
 * `car.rear_cargo_crate_fit` and `car.driving_comfort_rating` are seeded
 * `status: 'unknown'` with no `value` for every candidate, translated from
 * `household-fit-matrix`'s own `unknown.rear_cargo_crate_compatibility` /
 * `unknown.driving_comfort` -- CLAUDE.md: "It may never ... fabricate."
 */
import type { Clock, IdGenerator } from '@pax/core';
import { createAttributeRecord, instantiateCase, type PackSelection } from '@pax/core';
import type {
  AttributeRecord,
  AttributeValue,
  CaseEvent,
  CaseState,
  CompiledDecisionPack,
  EntityRecord,
} from '@pax/contracts';
import {
  calculateOwnershipCost,
  loadFixture,
  lookupHouseholdFit,
  lookupSafetyReliability,
  readListing,
  type CandidateDealerOfferFacts,
  type CandidateListingFacts,
  type OwnershipCostResult,
} from './tools/index.js';

export const CAR_PURCHASE_CANDIDATE_IDS = [
  'candidate-rav4',
  'candidate-crv',
  'candidate-cx5',
  'candidate-outback',
] as const;
export type CarPurchaseCandidateId = (typeof CAR_PURCHASE_CANDIDATE_IDS)[number];

/** See module header, mismatch #2. Tool definition id -> pack manifest attribute id; a tool id with no entry here (`car.cargo_height_floor_to_ceiling_in`) has no pack-manifest counterpart and is intentionally dropped. */
export const HOUSEHOLD_FIT_DEFINITION_ID_TRANSLATION: Readonly<Record<string, string>> = {
  'car.cargo_width_between_wheel_wells_in': 'car.cargo_width_in',
  'car.cargo_length_seat_to_liftgate_in': 'car.cargo_length_in',
  'car.cargo_volume_behind_second_row_cu_ft': 'car.cargo_volume_cu_ft',
  'car.rear_door_opening_width_in': 'car.rear_door_opening_width_in',
  'car.second_row_legroom_in': 'car.second_row_legroom_in',
  'car.ground_clearance_in': 'car.ground_clearance_in',
};

/** `household-fit-matrix`'s `unknowns[].id` -> the pack manifest attribute id the unknown blocks. */
const HOUSEHOLD_FIT_UNKNOWN_TRANSLATION: Readonly<Record<string, string>> = {
  'unknown.rear_cargo_crate_compatibility': 'car.rear_cargo_crate_fit',
  'unknown.driving_comfort': 'car.driving_comfort_rating',
};

function unwrapOk<T>(result: { status: string }, description: string): T {
  if (result.status !== 'ok') {
    throw new Error(
      `seeds.ts: expected an "ok" result while ${description}, got "${result.status}"`,
    );
  }
  return (result as { status: 'ok'; data: T }).data;
}

function record(
  clock: Clock,
  input: {
    definitionId: string;
    label: string;
    sourceIds: readonly string[];
    status: AttributeRecord['status'];
    value?: AttributeValue;
  },
): AttributeRecord {
  const result = createAttributeRecord(
    {
      definitionId: input.definitionId,
      label: input.label,
      origin: 'pack',
      sourceIds: input.sourceIds,
      status: input.status,
      ...(input.value !== undefined ? { value: input.value } : {}),
    },
    clock,
  );
  if (!result.ok) {
    throw new Error(
      `seeds.ts: failed to build attribute record "${input.definitionId}": ${result.errors.join('; ')}`,
    );
  }
  return result.value;
}

function candidateLabel(listing: CandidateListingFacts): string {
  return `${listing.modelYear} ${listing.make} ${listing.model} ${listing.trim}`;
}

/**
 * Attribute records derivable directly from `listing-reader`'s real output
 * (plus the one raw `standardFeatures` field it never exposes -- see module
 * header mismatch #1).
 */
function listingAttributes(
  clock: Clock,
  listing: CandidateListingFacts,
  dealerOffer: CandidateDealerOfferFacts,
  standardFeatures: readonly string[],
): Record<string, AttributeRecord> {
  const listingSourceId = `source-listing-${listing.candidateId}`;
  const dealerOfferSourceId = `source-dealer-offer-${listing.candidateId}`;

  return {
    'car.make': record(clock, {
      definitionId: 'car.make',
      label: 'Make',
      sourceIds: [listingSourceId],
      status: 'asserted',
      value: { type: 'string', value: listing.make },
    }),
    'car.model': record(clock, {
      definitionId: 'car.model',
      label: 'Model',
      sourceIds: [listingSourceId],
      status: 'asserted',
      value: { type: 'string', value: listing.model },
    }),
    'car.model_year': record(clock, {
      definitionId: 'car.model_year',
      label: 'Model year',
      sourceIds: [listingSourceId],
      status: 'asserted',
      value: { type: 'number', value: listing.modelYear },
    }),
    'car.trim': record(clock, {
      definitionId: 'car.trim',
      label: 'Trim',
      sourceIds: [listingSourceId],
      status: 'asserted',
      value: { type: 'string', value: listing.trim },
    }),
    'car.body_style': record(clock, {
      definitionId: 'car.body_style',
      label: 'Body style',
      sourceIds: [listingSourceId],
      status: 'asserted',
      value: { type: 'string', value: listing.bodyStyle },
    }),
    'car.drivetrain': record(clock, {
      definitionId: 'car.drivetrain',
      label: 'Drivetrain',
      sourceIds: [listingSourceId],
      status: 'asserted',
      value: { type: 'enum', value: listing.drivetrain },
    }),
    'car.powertrain': record(clock, {
      definitionId: 'car.powertrain',
      label: 'Powertrain',
      sourceIds: [listingSourceId],
      status: 'asserted',
      value: { type: 'enum', value: listing.powertrain },
    }),
    'car.mileage': record(clock, {
      definitionId: 'car.mileage',
      label: 'Mileage',
      sourceIds: [listingSourceId],
      status: 'asserted',
      value: { type: 'number', value: listing.mileage.value, unit: listing.mileage.unit },
    }),
    'car.standard_features': record(clock, {
      definitionId: 'car.standard_features',
      label: 'Standard features',
      sourceIds: [listingSourceId],
      status: 'asserted',
      value: { type: 'string_list', values: [...standardFeatures] },
    }),
    'car.advertised_price': record(clock, {
      definitionId: 'car.advertised_price',
      label: 'Advertised price',
      sourceIds: [listingSourceId],
      status: 'asserted',
      value: {
        type: 'money',
        amount: listing.advertisedPrice.amount,
        currency: listing.advertisedPrice.currency,
      },
    }),
    'car.out_the_door_price': record(clock, {
      definitionId: 'car.out_the_door_price',
      label: 'True out-the-door price',
      sourceIds: [dealerOfferSourceId],
      status: 'asserted',
      value: {
        type: 'money',
        amount: dealerOffer.trueOutTheDoorPrice,
        currency: dealerOffer.advertisedPrice.currency,
      },
    }),
    'car.teaser_price_gap_amount': record(clock, {
      definitionId: 'car.teaser_price_gap_amount',
      label: 'Teaser price gap',
      sourceIds: [dealerOfferSourceId],
      status: 'asserted',
      value: {
        type: 'money',
        amount: dealerOffer.teaserGap.gapAmount,
        currency: dealerOffer.advertisedPrice.currency,
      },
    }),
    'car.has_teaser_price_conflict': record(clock, {
      definitionId: 'car.has_teaser_price_conflict',
      label: 'Has teaser price conflict',
      sourceIds: [dealerOfferSourceId],
      status: 'asserted',
      value: { type: 'boolean', value: dealerOffer.hasTeaserPriceConflict },
    }),
  };
}

function ownershipAttributes(
  clock: Clock,
  ownership: OwnershipCostResult,
): Record<string, AttributeRecord> {
  const sourceId = `source-ownership-calculator-${ownership.candidateId}`;
  return {
    'car.five_year_fuel_cost': record(clock, {
      definitionId: 'car.five_year_fuel_cost',
      label: 'Estimated 5-year fuel cost',
      sourceIds: [sourceId],
      status: 'asserted',
      value: {
        type: 'money',
        amount: ownership.components.fuel.amount,
        currency: ownership.currency,
      },
    }),
    'car.five_year_maintenance_cost': record(clock, {
      definitionId: 'car.five_year_maintenance_cost',
      label: 'Estimated 5-year maintenance cost',
      sourceIds: [sourceId],
      status: 'asserted',
      value: {
        type: 'money',
        amount: ownership.components.maintenance.amount,
        currency: ownership.currency,
      },
    }),
    'car.five_year_ownership_cost': record(clock, {
      definitionId: 'car.five_year_ownership_cost',
      label: 'Estimated 5-year total ownership cost',
      sourceIds: [sourceId],
      status: 'asserted',
      value: { type: 'money', amount: ownership.totalFiveYearCost, currency: ownership.currency },
    }),
    'car.combined_fuel_economy_mpg': record(clock, {
      definitionId: 'car.combined_fuel_economy_mpg',
      label: 'Combined fuel economy',
      sourceIds: [sourceId],
      status: 'asserted',
      value: {
        type: 'number',
        value: ownership.components.fuel.combinedMpg,
        unit: 'mpg',
      },
    }),
    'car.annual_insurance_premium': record(clock, {
      definitionId: 'car.annual_insurance_premium',
      label: 'Estimated annual insurance premium',
      sourceIds: [sourceId],
      status: 'asserted',
      value: {
        type: 'money',
        amount: ownership.components.insurance.annualPremium,
        currency: ownership.currency,
      },
    }),
  };
}

const SAFETY_CATEGORY_TO_ATTRIBUTE: Readonly<Record<string, string>> = {
  crash_safety: 'car.crash_safety_rating',
  driver_assistance: 'car.driver_assistance_rating',
  reliability: 'car.reliability_rating',
};

function safetyAttributes(
  clock: Clock,
  candidateId: string,
  result: ReturnType<typeof lookupSafetyReliability>,
): Record<string, AttributeRecord> {
  const data = unwrapOk<{
    claims: {
      category: string;
      rating: string;
      sourceId: string;
    }[];
    disagreements: { category: string; sourceIdA: string; sourceIdB: string }[];
  }>(result, `looking up safety/reliability facts for "${candidateId}"`);

  const disputedCategories = new Set(data.disagreements.map((entry) => entry.category));
  const byCategory = new Map<string, { rating: string; sourceIds: string[] }>();
  for (const claim of data.claims) {
    const existing = byCategory.get(claim.category);
    if (existing === undefined) {
      byCategory.set(claim.category, { rating: claim.rating, sourceIds: [claim.sourceId] });
    } else {
      existing.sourceIds.push(claim.sourceId);
    }
  }

  const attributes: Record<string, AttributeRecord> = {};
  for (const [category, definitionId] of Object.entries(SAFETY_CATEGORY_TO_ATTRIBUTE)) {
    const claim = byCategory.get(category);
    if (claim === undefined) continue;
    const disputed = disputedCategories.has(category);
    attributes[definitionId] = record(clock, {
      definitionId,
      label: definitionId,
      sourceIds: claim.sourceIds,
      status: disputed ? 'conflicted' : 'supported',
      value: { type: 'enum', value: claim.rating },
    });
  }
  return attributes;
}

function householdFitAttributes(
  clock: Clock,
  candidateId: string,
  result: ReturnType<typeof lookupHouseholdFit>,
): Record<string, AttributeRecord> {
  const data = unwrapOk<{
    knownFacts: {
      definitionId: string;
      label: string;
      value: AttributeValue;
      sourceIds: string[];
    }[];
    unknowns: { id: string; label: string }[];
  }>(result, `looking up household fit for "${candidateId}"`);

  const attributes: Record<string, AttributeRecord> = {};
  for (const fact of data.knownFacts) {
    const packAttributeId = HOUSEHOLD_FIT_DEFINITION_ID_TRANSLATION[fact.definitionId];
    if (packAttributeId === undefined) continue; // See module header mismatch #2.
    attributes[packAttributeId] = record(clock, {
      definitionId: packAttributeId,
      label: fact.label,
      sourceIds: fact.sourceIds,
      status: 'supported',
      value: fact.value,
    });
  }
  for (const unknown of data.unknowns) {
    const packAttributeId = HOUSEHOLD_FIT_UNKNOWN_TRANSLATION[unknown.id];
    if (packAttributeId === undefined) continue;
    attributes[packAttributeId] = record(clock, {
      definitionId: packAttributeId,
      label: unknown.label,
      sourceIds: [],
      status: 'unknown',
    });
  }
  return attributes;
}

/**
 * Builds the four car-purchase candidate `EntityRecord`s from the real
 * fixture tools. See module header for the full grounding and the two
 * documented read-only id mismatches this works around.
 */
export function buildCarPurchaseCandidateEntities(clock: Clock): EntityRecord[] {
  const now = clock.now();
  const rawListings = loadFixture('candidate-listings');
  const standardFeaturesByCandidateId = new Map(
    rawListings.candidates.map((candidate) => [candidate.candidateId, candidate.standardFeatures]),
  );

  return CAR_PURCHASE_CANDIDATE_IDS.map((candidateId): EntityRecord => {
    const listingResult = unwrapOk<{
      listing: CandidateListingFacts;
      dealerOffer: CandidateDealerOfferFacts;
    }>(readListing({ candidateId }), `reading the listing for "${candidateId}"`);
    const ownershipResult = unwrapOk<OwnershipCostResult>(
      calculateOwnershipCost({ candidateId }),
      `calculating ownership cost for "${candidateId}"`,
    );
    const standardFeatures = standardFeaturesByCandidateId.get(candidateId) ?? [];

    const attributes: Record<string, AttributeRecord> = {
      ...listingAttributes(
        clock,
        listingResult.listing,
        listingResult.dealerOffer,
        standardFeatures,
      ),
      ...ownershipAttributes(clock, ownershipResult),
      ...safetyAttributes(clock, candidateId, lookupSafetyReliability({ candidateId })),
      ...householdFitAttributes(clock, candidateId, lookupHouseholdFit({ candidateId })),
    };

    return {
      id: candidateId,
      kind: 'candidate',
      label: candidateLabel(listingResult.listing),
      attributes,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export interface CarPurchaseSeedResult {
  readonly caseState: CaseState;
  readonly events: CaseEvent[];
}

export interface BuildCarPurchaseSeedEventsParams {
  readonly pack: CompiledDecisionPack;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly selection?: PackSelection;
}

/**
 * The full seed `CaseEvent` sequence for a fresh car-purchase demo case:
 * `case.created`, `criteria.updated`, one `obligation.updated` per compiled
 * obligation (mirroring `apps/agent/src/services/command-service.ts`'s
 * `startDemo` -- read-only reference, not imported here to keep this
 * package's dependency graph one-directional; the shape is intentionally
 * identical), then one `option.upserted` per candidate entity. `caseState`
 * is the same `instantiateCase` result the first three event groups encode;
 * a caller that only needs the events (e.g. to feed a real `CaseStore`) can
 * ignore it.
 */
export function buildCarPurchaseSeedEvents(
  params: BuildCarPurchaseSeedEventsParams,
): CarPurchaseSeedResult {
  const { pack, clock, idGenerator } = params;
  const selection: PackSelection = params.selection ?? {
    selectedBy: 'router',
    reasons: [
      `"${pack.identity.name}" matched the household's request to compare shortlisted vehicles.`,
      'The case mentions candidate listings, a dealer offer, and household cargo/budget needs.',
    ],
  };
  const caseState = instantiateCase(pack, selection, clock, idGenerator);
  const now = caseState.createdAt;

  const events: CaseEvent[] = [
    {
      eventId: idGenerator.next('event'),
      caseId: caseState.id,
      sequence: 1,
      timestamp: now,
      type: 'case.created',
      payload: { title: caseState.title, pack: caseState.pack },
    },
    {
      eventId: idGenerator.next('event'),
      caseId: caseState.id,
      sequence: 2,
      timestamp: now,
      type: 'criteria.updated',
      payload: { criteria: caseState.criteria },
    },
    ...caseState.obligations.map((obligation, index): CaseEvent => ({
      eventId: idGenerator.next('event'),
      caseId: caseState.id,
      sequence: 3 + index,
      timestamp: now,
      type: 'obligation.updated',
      payload: { obligation },
    })),
  ];

  const entities = buildCarPurchaseCandidateEntities(clock);
  const optionStartSequence = events.length + 1;
  events.push(
    ...entities.map((entity, index): CaseEvent => ({
      eventId: idGenerator.next('event'),
      caseId: caseState.id,
      sequence: optionStartSequence + index,
      timestamp: now,
      type: 'option.upserted',
      payload: { entity },
    })),
  );

  return { caseState, events };
}
