/**
 * TDD tests for the real `car-purchase@1.0.0` Decision Pack manifest
 * (`car-purchase.ts`). Proves the manifest compiles cleanly against a
 * realistic capability catalog covering every declared skill/specialist/
 * tool, that `compiledHash` is deterministic, that every required
 * obligation from docs/specs/packs-and-routing.md "Choose Our Next Car
 * Decision Pack" -> "Required obligations" is present with the exact
 * question/evidence-level/attempts from that table, and that the compiled
 * pack's `criteria.defaults` reflects the household's actual seeded
 * `weightedPreferences` from
 * packages/scenarios/fixtures/car-purchase/household-profile.json.
 */
import { describe, expect, it } from 'vitest';
import type { Clock } from '@sift/core';
import type { EvidenceLevel } from '@sift/contracts';
import { CAR_PURCHASE_MANIFEST, compileCarPurchasePack } from './car-purchase.js';
import { createCapabilityCatalog } from './capability-catalog.js';
import type { CapabilityCatalog } from './capability-catalog.js';

const fixedClock: Clock = { now: () => '2026-08-27T00:00:00.000Z' };
const laterClock: Clock = { now: () => '2026-08-27T01:00:00.000Z' };

/**
 * A catalog covering every skill/specialist/tool id `CAR_PURCHASE_MANIFEST`
 * declares, built directly from the manifest's own declarations so this
 * test file cannot silently drift out of sync with the manifest as it
 * evolves (a missing catalog entry would otherwise fail every test here
 * with an unrelated "unknown capability" compilation error rather than the
 * behavior actually under test).
 */
function carPurchaseCatalog(): CapabilityCatalog {
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

describe('CAR_PURCHASE_MANIFEST identity and activation', () => {
  it('declares the pinned pack identity', () => {
    expect(CAR_PURCHASE_MANIFEST.identity.id).toBe('car-purchase');
    expect(CAR_PURCHASE_MANIFEST.identity.version).toBe('1.0.0');
    // Renamed from "Choose Our Next Car" when the pack was generalised: it
    // now runs a landscaping business's van decision from the same
    // declarations, and the old name would be a lie in front of a
    // contractor. The pack *id* is unchanged -- see the manifest comment.
    expect(CAR_PURCHASE_MANIFEST.identity.name).toBe('Vehicle Selection');
  });

  it('declares the exact activation intents from packs-and-routing.md', () => {
    expect(CAR_PURCHASE_MANIFEST.activation.intents).toEqual([
      'compare shortlisted cars',
      'understand a dealer offer',
      'choose what to test-drive',
      'evaluate household vehicle fit',
    ]);
  });

  it('declares the exact activation exclusions from packs-and-routing.md', () => {
    expect(CAR_PURCHASE_MANIFEST.activation.exclusions).toEqual([
      'mechanical diagnosis',
      'financing applications',
      'negotiation or dealer-contact automation',
      'reservations',
      'scheduling',
      'purchases',
    ]);
  });
});

describe('compileCarPurchasePack: compiles cleanly', () => {
  it('compiles the manifest against a realistic capability catalog without throwing', () => {
    expect(() => compileCarPurchasePack(carPurchaseCatalog(), fixedClock)).not.toThrow();
  });

  it('produces a compiledHash matching the lowercase-hex SHA-256 shape', () => {
    const compiled = compileCarPurchasePack(carPurchaseCatalog(), fixedClock);
    expect(compiled.compiledHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a deterministic compiledHash across two compiles regardless of clock', () => {
    const a = compileCarPurchasePack(carPurchaseCatalog(), fixedClock);
    const b = compileCarPurchasePack(carPurchaseCatalog(), laterClock);
    expect(a.compiledHash).toBe(b.compiledHash);
    expect(a.compiledAt).not.toBe(b.compiledAt);
  });

  it('resolves every declared skill, specialist, and tool against the catalog', () => {
    const compiled = compileCarPurchasePack(carPurchaseCatalog(), fixedClock);
    expect(compiled.resolvedCapabilities.skillIds.sort()).toEqual(
      [...CAR_PURCHASE_MANIFEST.skills.map((skill) => skill.id)].sort(),
    );
    expect(compiled.resolvedCapabilities.specialistIds.sort()).toEqual(
      [...CAR_PURCHASE_MANIFEST.specialists.map((specialist) => specialist.id)].sort(),
    );
    expect(compiled.resolvedCapabilities.toolIds.sort()).toEqual(
      [...CAR_PURCHASE_MANIFEST.tools.map((tool) => tool.id)].sort(),
    );
  });
});

describe('required obligations table (packs-and-routing.md "Required obligations")', () => {
  const expectedObligations: {
    id: string;
    question: string;
    requiredEvidenceLevel: EvidenceLevel;
    maxAttempts: number;
  }[] = [
    {
      id: 'car.hard_constraints',
      question: "Which candidates satisfy the household's budget and non-negotiable needs?",
      requiredEvidenceLevel: 'E1',
      maxAttempts: 2,
    },
    {
      id: 'car.deal_normalization',
      question:
        "What is each candidate's comparable out-the-door price and which terms or add-ons are uncertain?",
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
    },
    {
      id: 'car.ownership_cost',
      question: 'What is the comparable five-year ownership estimate under the same assumptions?',
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
    },
    {
      id: 'car.safety_reliability',
      question:
        'Which material safety and reliability differences are supported by traceable sources?',
      requiredEvidenceLevel: 'E2',
      maxAttempts: 3,
    },
    {
      id: 'car.household_fit',
      question:
        'Which needs can be established from specifications and which require household judgment or a test drive?',
      requiredEvidenceLevel: 'E1',
      maxAttempts: 2,
    },
    {
      id: 'car.shortlist',
      question:
        'Which candidate should advance, what could change that result, and what remains to verify?',
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
    },
  ];

  it('declares exactly the six required obligation ids, no more and no fewer', () => {
    expect(CAR_PURCHASE_MANIFEST.obligations.map((obligation) => obligation.id).sort()).toEqual(
      expectedObligations.map((obligation) => obligation.id).sort(),
    );
  });

  it.each(expectedObligations)(
    '$id has the exact spec question, evidence level, attempts, and required:true',
    ({ id, question, requiredEvidenceLevel, maxAttempts }) => {
      const obligation = CAR_PURCHASE_MANIFEST.obligations.find((entry) => entry.id === id);
      expect(obligation).toBeDefined();
      expect(obligation?.question).toBe(question);
      expect(obligation?.requiredEvidenceLevel).toBe(requiredEvidenceLevel);
      expect(obligation?.maxAttempts).toBe(maxAttempts);
      expect(obligation?.required).toBe(true);
      expect(obligation?.origin).toBe('pack');
    },
  );

  it('car.shortlist depends on the other five required obligations', () => {
    const shortlist = CAR_PURCHASE_MANIFEST.obligations.find(
      (obligation) => obligation.id === 'car.shortlist',
    );
    expect(shortlist?.dependsOn.slice().sort()).toEqual(
      [
        'car.hard_constraints',
        'car.deal_normalization',
        'car.ownership_cost',
        'car.safety_reliability',
        'car.household_fit',
      ].sort(),
    );
  });

  it('every obligation preferredSkills/preferredSpecialists reference declared capabilities', () => {
    const skillIds = new Set(CAR_PURCHASE_MANIFEST.skills.map((skill) => skill.id));
    const specialistIds = new Set(
      CAR_PURCHASE_MANIFEST.specialists.map((specialist) => specialist.id),
    );
    for (const obligation of CAR_PURCHASE_MANIFEST.obligations) {
      for (const skillId of obligation.preferredSkills) {
        expect(skillIds.has(skillId)).toBe(true);
      }
      for (const specialistId of obligation.preferredSpecialists) {
        expect(specialistIds.has(specialistId)).toBe(true);
      }
    }
  });
});

describe('skills, specialists, and tools (packs-and-routing.md "Skills, specialists, and tools")', () => {
  it('declares exactly the six required skill ids', () => {
    expect(CAR_PURCHASE_MANIFEST.skills.map((skill) => skill.id).sort()).toEqual(
      [
        'listing-normalizer',
        'deal-analysis',
        'ownership-cost',
        'safety-reliability',
        'household-fit',
        'decision-synthesis',
      ].sort(),
    );
  });

  it('declares exactly the six required specialist ids', () => {
    expect(CAR_PURCHASE_MANIFEST.specialists.map((specialist) => specialist.id).sort()).toEqual(
      [
        'deal-analyst',
        'ownership-cost-analyst',
        'safety-reliability-analyst',
        'household-fit-analyst',
        'source-challenger',
        'decision-synthesizer',
      ].sort(),
    );
  });

  it('declares the consequential propose_recommendation tool requiring approval, covered by a policy', () => {
    const tool = CAR_PURCHASE_MANIFEST.tools.find((entry) => entry.id === 'propose_recommendation');
    expect(tool).toBeDefined();
    expect(tool?.effect).toBe('consequential');
    expect(tool?.requiresApproval).toBe(true);

    const coveringPolicy = CAR_PURCHASE_MANIFEST.policies.find(
      (policy) =>
        policy.requiresHumanApproval &&
        (policy.appliesToToolIds === undefined ||
          policy.appliesToToolIds.includes('propose_recommendation')),
    );
    expect(coveringPolicy).toBeDefined();
  });

  it('declares the four read-only fixture-data tools with requiresApproval: false', () => {
    for (const id of [
      'listing-reader',
      'ownership-calculator',
      'safety-reliability-lookup',
      'household-fit-matrix',
    ]) {
      const tool = CAR_PURCHASE_MANIFEST.tools.find((entry) => entry.id === id);
      expect(tool).toBeDefined();
      expect(tool?.effect).toBe('read_only');
      expect(tool?.requiresApproval).toBe(false);
    }
  });
});

describe('extensionPolicy (packs-and-routing.md "Extensions")', () => {
  it('allows case attributes, criteria, and obligations, and pins the user-concern template id', () => {
    expect(CAR_PURCHASE_MANIFEST.extensionPolicy).toEqual({
      allowCaseAttributes: true,
      allowCaseCriteria: true,
      allowCaseObligations: true,
      userConcernTemplateId: 'car.user_concern',
    });
  });
});

describe('orchestration (strands-runtime.md "Orchestration" and default execution bounds)', () => {
  it('uses a graph strategy with maxConcurrency set and nodeTimeoutMs <= totalTimeoutMs', () => {
    const { orchestration } = CAR_PURCHASE_MANIFEST;
    expect(orchestration.strategy).toBe('graph');
    expect(orchestration.maxConcurrency).toBeDefined();
    expect(orchestration.nodeTimeoutMs).toBeLessThanOrEqual(orchestration.totalTimeoutMs);
  });

  it('bounds graph node executions at six per run, per the default execution bounds', () => {
    expect(CAR_PURCHASE_MANIFEST.orchestration.maxSteps).toBe(6);
  });
});

describe('criteria.defaults reflects the household-profile.json seeded weightedPreferences', () => {
  it('declares exactly the five seeded preference criteria with matching weights and directions', () => {
    const byId = new Map(
      CAR_PURCHASE_MANIFEST.criteria.defaults.map((criterion) => [criterion.id, criterion]),
    );

    expect(byId.get('pref.safety_reliability')).toMatchObject({
      weight: 30,
      direction: 'higher_better',
      kind: 'preference',
      origin: 'pack',
    });
    expect(byId.get('pref.ownership_cost')).toMatchObject({
      weight: 30,
      direction: 'lower_better',
      kind: 'preference',
      origin: 'pack',
    });
    expect(byId.get('pref.deal_value')).toMatchObject({
      weight: 20,
      direction: 'higher_better',
      kind: 'preference',
      origin: 'pack',
    });
    expect(byId.get('pref.household_fit')).toMatchObject({
      weight: 15,
      direction: 'higher_better',
      kind: 'preference',
      origin: 'pack',
    });
    expect(byId.get('pref.driving_comfort')).toMatchObject({
      weight: 5,
      direction: 'higher_better',
      kind: 'preference',
      origin: 'pack',
    });
  });

  it('seeded criteria weights sum to 100, matching household-profile.json weights summing to 1.0', () => {
    const total = CAR_PURCHASE_MANIFEST.criteria.defaults.reduce(
      (sum, criterion) => sum + criterion.weight,
      0,
    );
    expect(total).toBe(100);
  });

  it('allows user-defined criteria and does not protect the reweightable preference criteria', () => {
    expect(CAR_PURCHASE_MANIFEST.criteria.allowUserDefined).toBe(true);
    expect(CAR_PURCHASE_MANIFEST.criteria.protectedCriterionIds).toEqual([]);
  });

  it('the compiled pack carries the same criteria.defaults through unchanged', () => {
    const compiled = compileCarPurchasePack(carPurchaseCatalog(), fixedClock);
    expect(compiled.criteria.defaults).toEqual(CAR_PURCHASE_MANIFEST.criteria.defaults);
  });
});

describe('presentation renderability', () => {
  it('assigns every declared non-sensitive attribute to a presentation.attributeGroups entry', () => {
    const renderableIds = new Set(
      CAR_PURCHASE_MANIFEST.presentation.attributeGroups.flatMap((group) => group.attributeIds),
    );
    for (const attribute of CAR_PURCHASE_MANIFEST.attributes) {
      if (!attribute.sensitive) {
        expect(renderableIds.has(attribute.id)).toBe(true);
      }
    }
  });
});

describe('evaluation (negative case required)', () => {
  it('requires a negative case and declares at least a happy-path and a negative scenario id', () => {
    expect(CAR_PURCHASE_MANIFEST.evaluation.requiresNegativeCase).toBe(true);
    expect(CAR_PURCHASE_MANIFEST.evaluation.scenarioIds.length).toBeGreaterThanOrEqual(2);
  });
});

describe('decisionGuide (§46/§47 pack-level Decision Guide)', () => {
  // Task D4/E7: `suggestedQuestions` (decision-profile.ts) is only honest
  // once a real, pack-authored Decision Guide exists for this pack to draw
  // from -- these assertions exist so a future edit cannot silently reduce
  // this pack's guide back down to empty/placeholder content without a
  // visibly failing test.
  it('declares a Decision Guide with real, non-empty content in every field', () => {
    const guide = CAR_PURCHASE_MANIFEST.decisionGuide;
    expect(guide).toBeDefined();
    expect(guide?.domainPurpose.length).toBeGreaterThan(0);
    expect(guide?.discoveryStrategy.length).toBeGreaterThan(0);
    expect(guide?.researchGuidance.length).toBeGreaterThan(0);
    expect(guide?.customFieldGuidance.length).toBeGreaterThan(0);
    expect(guide?.presentationGuidance.length).toBeGreaterThan(0);
    expect(guide?.suggestedQuestions.length).toBeGreaterThan(0);
    expect(guide?.importantUnknowns.length).toBeGreaterThan(0);
  });

  it('suggests questions that actually read as questions, not asserted facts', () => {
    const guide = CAR_PURCHASE_MANIFEST.decisionGuide;
    for (const question of guide?.suggestedQuestions ?? []) {
      expect(question.trim().endsWith('?')).toBe(true);
    }
  });

  it('names an actual household fit concern in importantUnknowns rather than generic filler', () => {
    const guide = CAR_PURCHASE_MANIFEST.decisionGuide;
    const joined = (guide?.importantUnknowns ?? []).join(' ').toLowerCase();
    expect(joined).toMatch(/fit|measurement|test drive/);
  });
});

describe('full manifest fidelity', () => {
  // The suites above assert structural invariants (counts, ids, required
  // relationships) but do not pin every individual field value -- a label
  // silently emptied, a `required` flag silently flipped, or an `appliesTo`
  // entry silently dropped would still satisfy every one of them. This
  // snapshot pins the ENTIRE manifest verbatim, so any such change forces a
  // deliberate, reviewed snapshot update instead of passing silently. (Found
  // via mutation testing: hundreds of pure string/boolean/array-literal
  // mutants in this file survived every other test in the suite.)
  it('matches its full manifest snapshot', () => {
    expect(CAR_PURCHASE_MANIFEST).toMatchSnapshot();
  });
});

describe('Vehicle Selection discovery: one pack, materially different journeys', () => {
  const discovery = CAR_PURCHASE_MANIFEST.discovery;

  function topicIdsFor(useCase: string): string[] {
    if (discovery === undefined) throw new Error('pack declares no discovery process');
    return discovery.topics
      .filter(
        (topic) =>
          topic.appliesWhen === undefined ||
          (topic.appliesWhen.topicId === 'vehicle.use_case' &&
            topic.appliesWhen.equalsAnyOf.includes(useCase)),
      )
      .map((topic) => topic.id);
  }

  it('declares a discovery process at all', () => {
    expect(discovery).toBeDefined();
    expect(discovery?.topics.length).toBeGreaterThan(0);
    expect(discovery?.blindSpots.length).toBeGreaterThan(0);
  });

  it('asks what the vehicle is for before anything else', () => {
    // Everything conditional hangs off this answer, so it has to be first
    // or the pack asks household questions of a landscaper.
    const first = [...(discovery?.topics ?? [])].sort((a, b) => b.priority - a.priority)[0];
    expect(first?.id).toBe('vehicle.use_case');
  });

  it('produces materially different topic sets for a family and a business', () => {
    const family = topicIdsFor('family');
    const business = topicIdsFor('business');

    // Not a copy change: each branch asks questions the other never sees.
    const familyOnly = family.filter((id) => !business.includes(id));
    const businessOnly = business.filter((id) => !family.includes(id));

    expect(familyOnly.length).toBeGreaterThan(0);
    expect(businessOnly.length).toBeGreaterThan(0);
  });

  it('never asks a landscaping business about child seats', () => {
    expect(topicIdsFor('business')).not.toContain('vehicle.child_seats');
  });

  it('never asks a family about payload, towing, or worksite access', () => {
    const family = topicIdsFor('family');
    expect(family).not.toContain('vehicle.payload_towing');
    expect(family).not.toContain('vehicle.worksite_access');
    expect(family).not.toContain('vehicle.equipment_access');
  });

  it('asks both branches the questions that genuinely apply to both', () => {
    const family = topicIdsFor('family');
    const business = topicIdsFor('business');

    for (const shared of ['vehicle.use_case', 'vehicle.budget', 'vehicle.usage_pattern']) {
      expect(family).toContain(shared);
      expect(business).toContain(shared);
    }
  });

  it('offers blind-spot prompts that differ by case', () => {
    const applicable = (useCase: string) =>
      (discovery?.blindSpots ?? [])
        .filter(
          (prompt) =>
            prompt.appliesWhen === undefined || prompt.appliesWhen.equalsAnyOf.includes(useCase),
        )
        .map((prompt) => prompt.id);

    const family = applicable('family');
    const business = applicable('business');

    expect(family).not.toEqual(business);
    expect(family.filter((id) => !business.includes(id)).length).toBeGreaterThan(0);
    expect(business.filter((id) => !family.includes(id)).length).toBeGreaterThan(0);
  });

  it('asks functional questions rather than unnecessary personal ones', () => {
    // "Who and what has to fit" is the question. "Do you have kids?" is not.
    for (const topic of discovery?.topics ?? []) {
      expect(topic.question).not.toMatch(/do you have (kids|children)\b/i);
      expect(topic.question).not.toMatch(/are you (married|disabled)/i);
      expect(topic.question).not.toMatch(/how old are you/i);
    }
  });

  it('gives every required topic an escape hatch that is not a skip', () => {
    for (const topic of discovery?.topics ?? []) {
      if (topic.necessity !== 'required') continue;
      expect(topic.escapeHatches.allowDefer).toBe(false);
      // But there is always some way out of a question a person cannot
      // answer -- a custom answer, or saying they are not sure.
      expect(topic.escapeHatches.allowCustom || topic.escapeHatches.allowUnsure).toBe(true);
    }
  });

  it('routes every topic mapping at an attribute or criterion the pack actually declares', () => {
    const attributeIds = new Set(CAR_PURCHASE_MANIFEST.attributes.map((a) => a.id));
    const criterionIds = new Set(CAR_PURCHASE_MANIFEST.criteria.defaults.map((c) => c.id));

    for (const topic of discovery?.topics ?? []) {
      for (const id of topic.mapsToAttributeIds) {
        expect(attributeIds.has(id), `${topic.id} maps to unknown attribute ${id}`).toBe(true);
      }
      for (const id of topic.mapsToCriterionIds) {
        expect(criterionIds.has(id), `${topic.id} maps to unknown criterion ${id}`).toBe(true);
      }
    }
  });

  it('keeps the pack id stable so stored cases still resolve', () => {
    // The user-facing name changes; the id a `CasePackPin` records does not.
    expect(CAR_PURCHASE_MANIFEST.identity.id).toBe('car-purchase');
  });

  it('uses vehicle-selection language rather than household-only language', () => {
    expect(CAR_PURCHASE_MANIFEST.identity.name).toBe('Vehicle Selection');
    expect(CAR_PURCHASE_MANIFEST.identity.description).toMatch(/vehicle/i);
    expect(CAR_PURCHASE_MANIFEST.identity.description).not.toMatch(/^Compares shortlisted/);
  });

  it('compiles with the discovery declaration attached', () => {
    const clock: Clock = { now: () => '2026-09-02T00:00:00.000Z' };
    const compiled = compileCarPurchasePack(carPurchaseCatalog(), clock);
    expect(compiled.discovery?.topics.length).toBe(discovery?.topics.length);
  });
});
