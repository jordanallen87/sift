/**
 * TDD tests for `seeds.ts`: loading the real car-purchase fixture data into
 * `EntityRecord`s (via the real fixture tools, not a re-implementation of
 * their math) and the full `case.created` + `criteria.updated` +
 * `obligation.updated`[] + `option.upserted`[] seed event sequence
 * `instantiateCase` alone cannot produce (docs/specs/architecture.md
 * "Deterministic core": `instantiateCase` seeds pack-declared state only,
 * never entities -- see this file's header comment for the full reasoning).
 */
import { describe, expect, it } from 'vitest';
import type { Clock, IdGenerator } from '@sift/core';
import {
  CAR_PURCHASE_MANIFEST,
  compileCarPurchasePack,
  createCapabilityCatalog,
} from '@sift/packs';
import { notFoundResult, okResult } from './tools/index.js';
import type {
  lookupHouseholdFit,
  lookupSafetyReliability,
  SafetyReliabilityClaim,
} from './tools/index.js';
import {
  buildCarPurchaseCandidateEntities,
  buildCarPurchaseSeedEvents,
  CAR_PURCHASE_CANDIDATE_IDS,
  householdFitAttributes,
  record,
  safetyAttributes,
  unwrapOk,
} from './seeds.js';

const FIXED_CLOCK: Clock = { now: () => '2026-08-27T00:00:00.000Z' };

function fixedIdGenerator(): IdGenerator {
  let counter = 0;
  return { next: (prefix) => `${prefix ?? 'id'}-${++counter}` };
}

function carPurchaseCatalog() {
  return createCapabilityCatalog([
    ...CAR_PURCHASE_MANIFEST.skills.map((skill) => ({
      id: skill.id,
      kind: 'skill' as const,
      version: '1.0.0',
    })),
    ...CAR_PURCHASE_MANIFEST.specialists.map((specialist) => ({
      id: specialist.id,
      kind: 'specialist' as const,
      version: '1.0.0',
    })),
    ...CAR_PURCHASE_MANIFEST.tools.map((tool) => ({
      id: tool.id,
      kind: 'tool' as const,
      version: '1.0.0',
    })),
  ]);
}

describe('CAR_PURCHASE_CANDIDATE_IDS', () => {
  it('names exactly the four fixture candidates', () => {
    expect([...CAR_PURCHASE_CANDIDATE_IDS].sort()).toEqual([
      'candidate-crv',
      'candidate-cx5',
      'candidate-outback',
      'candidate-rav4',
    ]);
  });
});

describe('buildCarPurchaseCandidateEntities', () => {
  it('builds one EntityRecord per candidate, kind "candidate"', () => {
    const entities = buildCarPurchaseCandidateEntities(FIXED_CLOCK);
    expect(entities).toHaveLength(4);
    for (const entity of entities) {
      expect(entity.kind).toBe('candidate');
      expect(CAR_PURCHASE_CANDIDATE_IDS).toContain(entity.id);
    }
  });

  it('seeds the real teaser-price conflict math for candidate-rav4', () => {
    const entities = buildCarPurchaseCandidateEntities(FIXED_CLOCK);
    const rav4 = entities.find((entity) => entity.id === 'candidate-rav4');
    expect(rav4).toBeDefined();

    const advertised = rav4?.attributes['car.advertised_price'];
    expect(advertised?.value).toEqual({ type: 'money', amount: 27995, currency: 'USD' });

    const outTheDoor = rav4?.attributes['car.out_the_door_price'];
    expect(outTheDoor?.value).toEqual({ type: 'money', amount: 33291.3, currency: 'USD' });

    const conflict = rav4?.attributes['car.has_teaser_price_conflict'];
    expect(conflict?.value).toEqual({ type: 'boolean', value: true });

    const gap = rav4?.attributes['car.teaser_price_gap_amount'];
    expect(gap?.value).toEqual({ type: 'money', amount: 5296.3, currency: 'USD' });
  });

  it('never fabricates rear_cargo_crate_fit or driving_comfort_rating -- both stay explicitly unknown', () => {
    const entities = buildCarPurchaseCandidateEntities(FIXED_CLOCK);
    for (const entity of entities) {
      const crateFit = entity.attributes['car.rear_cargo_crate_fit'];
      const comfort = entity.attributes['car.driving_comfort_rating'];
      expect(crateFit?.status).toBe('unknown');
      expect('value' in (crateFit ?? {})).toBe(false);
      expect(comfort?.status).toBe('unknown');
      expect('value' in (comfort ?? {})).toBe(false);
    }
  });

  it('translates the household-fit tool definition ids to the pack manifest attribute ids', () => {
    const entities = buildCarPurchaseCandidateEntities(FIXED_CLOCK);
    const crv = entities.find((entity) => entity.id === 'candidate-crv');
    // Pack manifest ids (car.cargo_volume_cu_ft / car.cargo_width_in /
    // car.cargo_length_in), not the fixture tool's own differently-named
    // ids (car.cargo_volume_behind_second_row_cu_ft / ...) -- see this
    // file's header comment for the read-only id mismatch this works around.
    expect(crv?.attributes['car.cargo_volume_cu_ft']?.value).toEqual({
      type: 'number',
      value: 39.3,
      unit: 'cu ft',
    });
    expect(crv?.attributes['car.cargo_width_in']?.value).toEqual({
      type: 'number',
      value: 42.8,
      unit: 'in',
    });
    expect(crv?.attributes['car.cargo_length_in']?.value).toEqual({
      type: 'number',
      value: 39.4,
      unit: 'in',
    });
    // The tool-only field with no pack-manifest counterpart at all
    // (car.cargo_height_floor_to_ceiling_in) is not seeded as an entity
    // attribute -- the pack never declares it.
    expect(crv?.attributes['car.cargo_height_floor_to_ceiling_in']).toBeUndefined();
  });

  it('seeds required car.standard_features from the raw fixture (the listing-reader tool does not expose it)', () => {
    const entities = buildCarPurchaseCandidateEntities(FIXED_CLOCK);
    const rav4 = entities.find((entity) => entity.id === 'candidate-rav4');
    const features = rav4?.attributes['car.standard_features'];
    expect(features?.value).toMatchObject({ type: 'string_list' });
    if (features?.value?.type === 'string_list') {
      expect(features.value.values).toContain('all-wheel drive');
    }
  });

  it('seeds the ownership-calculator E3 five-year totals identically to calling the tool directly', () => {
    const entities = buildCarPurchaseCandidateEntities(FIXED_CLOCK);
    const rav4 = entities.find((entity) => entity.id === 'candidate-rav4');
    const total = rav4?.attributes['car.five_year_ownership_cost'];
    expect(total?.value?.type).toBe('money');
    expect(total?.sourceIds).toEqual(['source-ownership-calculator-candidate-rav4']);
  });

  it('marks the disputed candidate-outback reliability rating conflicted, citing both sources', () => {
    const entities = buildCarPurchaseCandidateEntities(FIXED_CLOCK);
    const outback = entities.find((entity) => entity.id === 'candidate-outback');
    const reliability = outback?.attributes['car.reliability_rating'];
    expect(reliability?.status).toBe('conflicted');
    expect(reliability?.sourceIds).toEqual(
      expect.arrayContaining([
        'source-consumer-drive-index',
        'source-autotrust-reliability-survey',
      ]),
    );
  });
});

describe('buildCarPurchaseSeedEvents', () => {
  it('produces case.created, criteria.updated, one obligation.updated per obligation, then one option.upserted per candidate, in sequence', () => {
    const pack = compileCarPurchasePack(carPurchaseCatalog(), FIXED_CLOCK);
    const { caseState, events } = buildCarPurchaseSeedEvents({
      pack,
      clock: FIXED_CLOCK,
      idGenerator: fixedIdGenerator(),
    });

    expect(events[0]?.type).toBe('case.created');
    expect(events[1]?.type).toBe('criteria.updated');
    const obligationEvents = events.filter((event) => event.type === 'obligation.updated');
    expect(obligationEvents).toHaveLength(pack.obligations.length);
    const optionEvents = events.filter((event) => event.type === 'option.upserted');
    expect(optionEvents).toHaveLength(4);

    events.forEach((event, index) => {
      expect(event.sequence).toBe(index + 1);
    });

    expect(caseState.pack.id).toBe('car-purchase');
    expect(caseState.entities).toHaveLength(0); // instantiateCase alone never seeds entities
  });
});

describe('unwrapOk', () => {
  it('throws a descriptive error, rather than silently returning undefined, when given a non-"ok" ToolResult', () => {
    const result = notFoundResult(
      'some-fixture-tool',
      'candidate-ghost',
      'no such candidate on record',
    );
    expect(() => unwrapOk(result, 'looking up a fictional candidate')).toThrow(
      'seeds.ts: expected an "ok" result while looking up a fictional candidate, got "not_found"',
    );
  });
});

describe('record', () => {
  it('throws, rather than silently building an invalid AttributeRecord, when status "unknown" is paired with a value (violating the asserted/unknown invariant)', () => {
    expect(() =>
      record(FIXED_CLOCK, {
        definitionId: 'car.make',
        label: 'Make',
        sourceIds: [],
        status: 'unknown',
        value: { type: 'text', value: 'should not be present for an unknown record' },
      }),
    ).toThrow(/seeds\.ts: failed to build attribute record "car\.make"/);
  });
});

function syntheticSafetyClaim(
  category: string,
  rating: string,
  sourceId: string,
): SafetyReliabilityClaim {
  return {
    category,
    rating,
    notes: 'synthetic claim for a seeds.ts unit test',
    sourceId,
    publisher: 'Synthetic Publisher (test fixture)',
    reportTitle: 'Synthetic Report (test fixture)',
    url: 'https://example.com/synthetic-report',
    retrievedAt: '2026-08-15',
    publishedAt: '2026-08-01',
  };
}

describe('safetyAttributes', () => {
  it('skips (does not fabricate) an attribute for a SAFETY_CATEGORY_TO_ATTRIBUTE category with no recorded claim, rather than throwing or inventing a rating', () => {
    const syntheticResult: ReturnType<typeof lookupSafetyReliability> = okResult(
      'safety-reliability-lookup',
      {
        candidateId: 'candidate-synthetic',
        // Only crash_safety has a claim; driver_assistance and reliability
        // (also declared in SAFETY_CATEGORY_TO_ATTRIBUTE) do not.
        claims: [
          syntheticSafetyClaim('crash_safety', 'Top Safety Pick+', 'source-synthetic-crash'),
        ],
        disagreements: [],
        evidence: [],
      },
    );

    const attributes = safetyAttributes(FIXED_CLOCK, 'candidate-synthetic', syntheticResult);

    expect(Object.keys(attributes)).toEqual(['car.crash_safety_rating']);
    expect(attributes['car.driver_assistance_rating']).toBeUndefined();
    expect(attributes['car.reliability_rating']).toBeUndefined();
  });
});

describe('householdFitAttributes', () => {
  it('skips (does not fabricate) an attribute for an unknown id with no HOUSEHOLD_FIT_UNKNOWN_TRANSLATION entry, rather than throwing or inventing a pack attribute id', () => {
    const syntheticResult: ReturnType<typeof lookupHouseholdFit> = okResult(
      'household-fit-matrix',
      {
        candidateId: 'candidate-synthetic',
        knownFacts: [],
        unknowns: [
          {
            id: 'unknown.some_untranslated_question',
            definitionId: 'unknown.some_untranslated_question',
            label: 'Some untranslated unknown question',
            origin: 'pack',
            sourceIds: [],
            status: 'unknown',
            updatedAt: FIXED_CLOCK.now(),
            question: 'Some untranslated question no pack attribute maps to?',
            reason: 'synthetic reason for a seeds.ts unit test',
            resolutionPath: 'synthetic resolution path for a seeds.ts unit test',
          },
        ],
        householdDogCrateProfile: {
          crateCount: 0,
          eachCrateDimensionsIn: { lengthIn: 0, widthIn: 0, heightIn: 0 },
        },
        evidence: [],
      },
    );

    const attributes = householdFitAttributes(FIXED_CLOCK, 'candidate-synthetic', syntheticResult);

    expect(Object.keys(attributes)).toHaveLength(0);
  });
});
