/**
 * TDD tests for the real `home-energy-guardian@1.0.0` Decision Pack
 * manifest (`home-energy-guardian.ts`). Mirrors `car-purchase.test.ts`'s
 * structure: proves the manifest compiles cleanly against a realistic
 * capability catalog covering every declared skill/specialist/tool, that
 * `compiledHash` is deterministic, that the compiled pack passes the exact
 * same shared conformance suite `conformance.ts` runs for every built-in
 * pack (per docs/CLAUDE.md: "Every built-in or authoring-fixture pack must
 * pass the shared compiler/conformance suite"), that every required
 * obligation from docs/specs/packs-and-routing.md "Home Energy Guardian
 * Decision Pack" -> "Required obligations" is present with the exact
 * question/evidence-level/attempts from that table, and that the safety/
 * emergency exclusion is encoded as a protected, non-reweightable,
 * non-removable criterion per that section's "Extensions" bullet.
 */
import { describe, expect, it } from 'vitest';
import type { Clock } from '@sift/core';
import { removeCriterion, reweightCriterion } from '@sift/core';
import type { EvidenceLevel } from '@sift/contracts';
import {
  HOME_ENERGY_GUARDIAN_MANIFEST,
  compileHomeEnergyGuardianPack,
} from './home-energy-guardian.js';
import { createCapabilityCatalog } from './capability-catalog.js';
import type { CapabilityCatalog } from './capability-catalog.js';
import { PACK_CONFORMANCE_CHECK_IDS, runPackConformance } from './conformance.js';

const fixedClock: Clock = { now: () => '2026-08-27T00:00:00.000Z' };
const laterClock: Clock = { now: () => '2026-08-27T01:00:00.000Z' };

/**
 * A catalog covering every skill/specialist/tool id
 * `HOME_ENERGY_GUARDIAN_MANIFEST` declares, built directly from the
 * manifest's own declarations so this test file cannot silently drift out
 * of sync with the manifest as it evolves, matching
 * `car-purchase.test.ts`'s `carPurchaseCatalog()` pattern.
 */
function energyCatalog(): CapabilityCatalog {
  return createCapabilityCatalog([
    ...HOME_ENERGY_GUARDIAN_MANIFEST.skills.map((skill) => ({
      id: skill.id,
      kind: 'skill' as const,
      version: '1.0.0',
    })),
    ...HOME_ENERGY_GUARDIAN_MANIFEST.specialists.map((specialist) => ({
      id: specialist.id,
      kind: 'specialist' as const,
      version: '1.0.0',
    })),
    ...HOME_ENERGY_GUARDIAN_MANIFEST.tools.map((tool) => ({
      id: tool.id,
      kind: 'tool' as const,
      version: '1.0.0',
    })),
  ]);
}

describe('HOME_ENERGY_GUARDIAN_MANIFEST identity and activation', () => {
  it('declares the pinned pack identity', () => {
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.identity.id).toBe('home-energy-guardian');
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.identity.version).toBe('1.0.0');
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.identity.name).toBe('Home Energy Guardian');
  });

  it('declares the exact activation intents from packs-and-routing.md', () => {
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.activation.intents).toEqual([
      'unusual bill',
      'household energy monitoring',
      'rate-plan comparison',
      'unexplained usage increase',
    ]);
  });

  it('declares the exact activation exclusions from packs-and-routing.md', () => {
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.activation.exclusions).toEqual([
      'electrical danger',
      'gas leak',
      'fire',
      'medical equipment risk',
    ]);
  });
});

describe('compileHomeEnergyGuardianPack: compiles cleanly', () => {
  it('compiles the manifest against a realistic capability catalog without throwing', () => {
    expect(() => compileHomeEnergyGuardianPack(energyCatalog(), fixedClock)).not.toThrow();
  });

  it('produces a compiledHash matching the lowercase-hex SHA-256 shape', () => {
    const compiled = compileHomeEnergyGuardianPack(energyCatalog(), fixedClock);
    expect(compiled.compiledHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a deterministic compiledHash across two compiles regardless of clock', () => {
    const a = compileHomeEnergyGuardianPack(energyCatalog(), fixedClock);
    const b = compileHomeEnergyGuardianPack(energyCatalog(), laterClock);
    expect(a.compiledHash).toBe(b.compiledHash);
    expect(a.compiledAt).not.toBe(b.compiledAt);
  });

  it('resolves every declared skill, specialist, and tool against the catalog', () => {
    const compiled = compileHomeEnergyGuardianPack(energyCatalog(), fixedClock);
    expect(compiled.resolvedCapabilities.skillIds.sort()).toEqual(
      [...HOME_ENERGY_GUARDIAN_MANIFEST.skills.map((skill) => skill.id)].sort(),
    );
    expect(compiled.resolvedCapabilities.specialistIds.sort()).toEqual(
      [...HOME_ENERGY_GUARDIAN_MANIFEST.specialists.map((specialist) => specialist.id)].sort(),
    );
    expect(compiled.resolvedCapabilities.toolIds.sort()).toEqual(
      [...HOME_ENERGY_GUARDIAN_MANIFEST.tools.map((tool) => tool.id)].sort(),
    );
  });
});

describe('runPackConformance: home-energy-guardian passes the shared conformance suite', () => {
  it('reports every conformance check passing for the freshly compiled pack', () => {
    const compiled = compileHomeEnergyGuardianPack(energyCatalog(), fixedClock);
    const report = runPackConformance(compiled, energyCatalog());

    expect(report.packId).toBe('home-energy-guardian');
    expect(report.packVersion).toBe('1.0.0');
    expect(report.compiledHash).toBe(compiled.compiledHash);
    expect(report.checks).toHaveLength(PACK_CONFORMANCE_CHECK_IDS.length);
    expect(report.checks.map((check) => check.id).sort()).toEqual(
      [...PACK_CONFORMANCE_CHECK_IDS].sort(),
    );
    for (const check of report.checks) {
      expect(check.passed, `${check.id}: ${check.message}`).toBe(true);
    }
    expect(report.passed).toBe(true);
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
      id: 'energy.anomaly',
      question: 'Is the current bill materially abnormal?',
      requiredEvidenceLevel: 'E3',
      maxAttempts: 1,
    },
    {
      id: 'energy.rate_change',
      question: 'How much of the increase comes from tariff or fee changes?',
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
    },
    {
      id: 'energy.weather',
      question: 'How much is explained by weather-normalized usage?',
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
    },
    {
      id: 'energy.household_change',
      question: 'Did a household or appliance event plausibly change consumption?',
      requiredEvidenceLevel: 'E1',
      maxAttempts: 2,
    },
    {
      id: 'energy.response_options',
      question: "Which actions fit the user's cost and conservation criteria?",
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
    },
  ];

  it('declares exactly the five required obligation ids, no more and no fewer', () => {
    expect(
      HOME_ENERGY_GUARDIAN_MANIFEST.obligations.map((obligation) => obligation.id).sort(),
    ).toEqual(expectedObligations.map((obligation) => obligation.id).sort());
  });

  it.each(expectedObligations)(
    '$id has the exact spec question, evidence level, attempts, and required:true',
    ({ id, question, requiredEvidenceLevel, maxAttempts }) => {
      const obligation = HOME_ENERGY_GUARDIAN_MANIFEST.obligations.find((entry) => entry.id === id);
      expect(obligation).toBeDefined();
      expect(obligation?.question).toBe(question);
      expect(obligation?.requiredEvidenceLevel).toBe(requiredEvidenceLevel);
      expect(obligation?.maxAttempts).toBe(maxAttempts);
      expect(obligation?.required).toBe(true);
      expect(obligation?.origin).toBe('pack');
    },
  );

  it('energy.anomaly has no dependencies and runs first', () => {
    const anomaly = HOME_ENERGY_GUARDIAN_MANIFEST.obligations.find(
      (obligation) => obligation.id === 'energy.anomaly',
    );
    expect(anomaly?.dependsOn).toEqual([]);
  });

  it('energy.rate_change and energy.weather each depend only on energy.anomaly', () => {
    for (const id of ['energy.rate_change', 'energy.weather']) {
      const obligation = HOME_ENERGY_GUARDIAN_MANIFEST.obligations.find((entry) => entry.id === id);
      expect(obligation?.dependsOn).toEqual(['energy.anomaly']);
    }
  });

  it('energy.household_change depends on energy.weather (the required "weather -> home-event correlation" adaptive moment)', () => {
    const householdChange = HOME_ENERGY_GUARDIAN_MANIFEST.obligations.find(
      (obligation) => obligation.id === 'energy.household_change',
    );
    expect(householdChange?.dependsOn).toEqual(['energy.weather']);
  });

  it('energy.response_options depends on the other four required obligations', () => {
    const responseOptions = HOME_ENERGY_GUARDIAN_MANIFEST.obligations.find(
      (obligation) => obligation.id === 'energy.response_options',
    );
    expect(responseOptions?.dependsOn.slice().sort()).toEqual(
      ['energy.anomaly', 'energy.rate_change', 'energy.weather', 'energy.household_change'].sort(),
    );
  });

  it('every obligation preferredSkills/preferredSpecialists reference declared capabilities', () => {
    const skillIds = new Set(HOME_ENERGY_GUARDIAN_MANIFEST.skills.map((skill) => skill.id));
    const specialistIds = new Set(
      HOME_ENERGY_GUARDIAN_MANIFEST.specialists.map((specialist) => specialist.id),
    );
    for (const obligation of HOME_ENERGY_GUARDIAN_MANIFEST.obligations) {
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
  it('declares exactly the five required skill ids', () => {
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.skills.map((skill) => skill.id).sort()).toEqual(
      [
        'bill-normalizer',
        'weather-comparison',
        'rate-plan-analysis',
        'home-event-correlation',
        'decision-synthesis',
      ].sort(),
    );
  });

  it('declares exactly the six required specialist ids', () => {
    expect(
      HOME_ENERGY_GUARDIAN_MANIFEST.specialists.map((specialist) => specialist.id).sort(),
    ).toEqual(
      [
        'anomaly-investigator',
        'rate-analyst',
        'weather-analyst',
        'home-systems-analyst',
        'source-challenger',
        'decision-synthesizer',
      ].sort(),
    );
  });

  it('declares exactly the six required fixture tool ids plus the consequential propose_inspection tool', () => {
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.tools.map((tool) => tool.id).sort()).toEqual(
      [
        'bill-reader',
        'usage-history-query',
        'tariff-lookup',
        'weather-lookup',
        'household-event-lookup',
        'calculator',
        'propose_inspection',
      ].sort(),
    );
  });

  it('declares the consequential propose_inspection tool requiring approval, covered by a policy', () => {
    const tool = HOME_ENERGY_GUARDIAN_MANIFEST.tools.find(
      (entry) => entry.id === 'propose_inspection',
    );
    expect(tool).toBeDefined();
    expect(tool?.effect).toBe('consequential');
    expect(tool?.requiresApproval).toBe(true);

    const coveringPolicy = HOME_ENERGY_GUARDIAN_MANIFEST.policies.find(
      (policy) =>
        policy.requiresHumanApproval &&
        (policy.appliesToToolIds === undefined ||
          policy.appliesToToolIds.includes('propose_inspection')),
    );
    expect(coveringPolicy).toBeDefined();
  });

  it('declares the six fixture-data tools with effect read_only and requiresApproval: false', () => {
    for (const id of [
      'bill-reader',
      'usage-history-query',
      'tariff-lookup',
      'weather-lookup',
      'household-event-lookup',
      'calculator',
    ]) {
      const tool = HOME_ENERGY_GUARDIAN_MANIFEST.tools.find((entry) => entry.id === id);
      expect(tool).toBeDefined();
      expect(tool?.effect).toBe('read_only');
      expect(tool?.requiresApproval).toBe(false);
    }
  });
});

describe('extensionPolicy (packs-and-routing.md "Extensions")', () => {
  it('allows case attributes, criteria, and obligations, and pins the user-concern template id', () => {
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.extensionPolicy).toEqual({
      allowCaseAttributes: true,
      allowCaseCriteria: true,
      allowCaseObligations: true,
      userConcernTemplateId: 'energy.user_concern',
    });
  });
});

describe('orchestration (strands-runtime.md "Energy Swarm")', () => {
  it('uses a swarm strategy with repetitive-handoff bounds set and nodeTimeoutMs <= totalTimeoutMs', () => {
    const { orchestration } = HOME_ENERGY_GUARDIAN_MANIFEST;
    expect(orchestration.strategy).toBe('swarm');
    expect(orchestration.repetitiveHandoffDetectionWindow).toBeDefined();
    expect(orchestration.repetitiveHandoffMinUniqueAgents).toBeDefined();
    expect(orchestration.nodeTimeoutMs).toBeLessThanOrEqual(orchestration.totalTimeoutMs);
  });

  it("configures the repetitive-handoff window wider than Sift's own three-call RetrySteering threshold", () => {
    const { orchestration } = HOME_ENERGY_GUARDIAN_MANIFEST;
    expect(orchestration.repetitiveHandoffDetectionWindow).toBeGreaterThan(3);
  });
});

describe('criteria.defaults (packs-and-routing.md "energy.response_options" and required adaptive moments)', () => {
  it('declares the cost and conservation preference criteria, summing to 100', () => {
    const byId = new Map(
      HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults.map((criterion) => [criterion.id, criterion]),
    );

    expect(byId.get('energy.cost')).toMatchObject({
      kind: 'preference',
      weight: 50,
      direction: 'lower_better',
      origin: 'pack',
      status: 'active',
    });
    expect(byId.get('energy.conservation')).toMatchObject({
      kind: 'preference',
      weight: 50,
      direction: 'higher_better',
      origin: 'pack',
      status: 'active',
    });

    const preferenceWeightSum = HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults
      .filter((criterion) => criterion.kind === 'preference')
      .reduce((sum, criterion) => sum + criterion.weight, 0);
    expect(preferenceWeightSum).toBe(100);
  });

  it('allows user-defined criteria', () => {
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.criteria.allowUserDefined).toBe(true);
  });

  it('the compiled pack carries the same criteria.defaults through unchanged', () => {
    const compiled = compileHomeEnergyGuardianPack(energyCatalog(), fixedClock);
    expect(compiled.criteria.defaults).toEqual(HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults);
  });
});

describe('protected safety/emergency exclusion (packs-and-routing.md "Safety exclusions and emergency policies are protected and cannot be reweighted or removed")', () => {
  it('declares energy.no_emergency_risk as a hard_constraint criterion listed in protectedCriterionIds', () => {
    const criterion = HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults.find(
      (entry) => entry.id === 'energy.no_emergency_risk',
    );
    expect(criterion).toBeDefined();
    expect(criterion?.kind).toBe('hard_constraint');
    expect(criterion?.status).toBe('active');
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.criteria.protectedCriterionIds).toEqual([
      'energy.no_emergency_risk',
    ]);
  });

  it('cannot be removed via packages/core/src/criteria.ts removeCriterion', () => {
    const result = removeCriterion(
      HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults,
      'energy.no_emergency_risk',
      HOME_ENERGY_GUARDIAN_MANIFEST.criteria.protectedCriterionIds,
    );
    expect(result.ok).toBe(false);
  });

  it('cannot be reweighted via packages/core/src/criteria.ts reweightCriterion unless allowProtectedReweight is explicitly granted (which this pack never grants)', () => {
    const denied = reweightCriterion(
      HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults,
      'energy.no_emergency_risk',
      75,
      {
        protectedCriterionIds: HOME_ENERGY_GUARDIAN_MANIFEST.criteria.protectedCriterionIds,
        allowProtectedReweight: false,
      },
    );
    expect(denied.ok).toBe(false);
  });

  it('an ordinary non-protected criterion (energy.cost) can still be removed and reweighted', () => {
    const removed = removeCriterion(
      HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults,
      'energy.cost',
      HOME_ENERGY_GUARDIAN_MANIFEST.criteria.protectedCriterionIds,
    );
    expect(removed.ok).toBe(true);

    const reweighted = reweightCriterion(
      HOME_ENERGY_GUARDIAN_MANIFEST.criteria.defaults,
      'energy.conservation',
      90,
      {
        protectedCriterionIds: HOME_ENERGY_GUARDIAN_MANIFEST.criteria.protectedCriterionIds,
        allowProtectedReweight: false,
      },
    );
    expect(reweighted.ok).toBe(true);
  });
});

describe('presentation renderability', () => {
  it('assigns every declared non-sensitive attribute to a presentation.attributeGroups entry', () => {
    const renderableIds = new Set(
      HOME_ENERGY_GUARDIAN_MANIFEST.presentation.attributeGroups.flatMap(
        (group) => group.attributeIds,
      ),
    );
    for (const attribute of HOME_ENERGY_GUARDIAN_MANIFEST.attributes) {
      if (!attribute.sensitive) {
        expect(renderableIds.has(attribute.id)).toBe(true);
      }
    }
  });
});

describe('evaluation (negative case required)', () => {
  it('requires a negative case and declares at least a happy-path and a negative scenario id', () => {
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.evaluation.requiresNegativeCase).toBe(true);
    expect(HOME_ENERGY_GUARDIAN_MANIFEST.evaluation.scenarioIds.length).toBeGreaterThanOrEqual(2);
  });
});

describe('decisionGuide (§46/§47 pack-level Decision Guide)', () => {
  // See car-purchase.test.ts's identical suite for the full rationale.
  it('declares a Decision Guide with real, non-empty content in every field', () => {
    const guide = HOME_ENERGY_GUARDIAN_MANIFEST.decisionGuide;
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
    const guide = HOME_ENERGY_GUARDIAN_MANIFEST.decisionGuide;
    for (const question of guide?.suggestedQuestions ?? []) {
      expect(question.trim().endsWith('?')).toBe(true);
    }
  });

  it('names the emergency-risk exclusion in importantUnknowns or customFieldGuidance, not just cost', () => {
    const guide = HOME_ENERGY_GUARDIAN_MANIFEST.decisionGuide;
    const joined =
      `${guide?.importantUnknowns.join(' ')} ${guide?.customFieldGuidance}`.toLowerCase();
    expect(joined).toMatch(/emergency|risk|safety/);
  });
});

describe('full manifest fidelity', () => {
  // See car-purchase.test.ts's identical suite for the full rationale:
  // structural suites above don't pin individual field values, so mutation
  // testing found hundreds of surviving string/boolean/array-literal
  // mutants in this file. This snapshot pins the entire manifest verbatim.
  it('matches its full manifest snapshot', () => {
    expect(HOME_ENERGY_GUARDIAN_MANIFEST).toMatchSnapshot();
  });
});
