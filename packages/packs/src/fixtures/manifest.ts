/**
 * Shared test-only manifest/catalog builders used across `compiler.test.ts`,
 * `capability-catalog.test.ts`, `registry.test.ts`, and `conformance.test.ts`
 * so every test file exercises the exact same "fully valid, minimal"
 * baseline and only needs to describe the one field it is deliberately
 * breaking. Lives under `src/fixtures/` (matching the root
 * `vitest.config.ts` coverage `exclude: ['**\/fixtures/**']` pattern) since
 * it is test support, not product logic -- its own branches are exercised
 * incidentally by every test file that imports it, not directly tested.
 *
 * Not a `.test.ts` file itself, so it is still typechecked and linted like
 * any other source file.
 */
import type { DecisionPackManifest } from '@sift/contracts';
import { createCapabilityCatalog } from '../capability-catalog.js';
import type { CapabilityCatalog } from '../capability-catalog.js';

/**
 * A fully valid, minimal `DecisionPackManifest` that passes every
 * `compilePack` check as-is: one entity, one attribute assigned to a
 * presentation group, one criterion, one obligation referencing the
 * declared skill/specialist, one skill, one specialist referencing the
 * declared tool/skill, a graph orchestration with `maxConcurrency` set, one
 * consequential tool with `requiresApproval: true` covered by a matching
 * policy, and an evaluation suite with `requiresNegativeCase: true` and a
 * non-empty `scenarioIds`. Every compiler-rejection test in
 * `compiler.test.ts` starts from this manifest and mutates exactly one
 * field to reintroduce exactly one violation.
 */
export function validManifest(overrides: Partial<DecisionPackManifest> = {}): DecisionPackManifest {
  return {
    schemaVersion: '1.0',
    identity: {
      id: 'apartment-hunt',
      version: '1.0.0',
      name: 'Apartment Hunt',
      description: 'Compare apartment listings against household needs.',
      tags: ['housing'],
    },
    activation: {
      intents: ['find an apartment'],
      keywords: ['apartment', 'rent'],
      artifactKinds: ['listing'],
      entitySignals: ['unit'],
      exclusions: [],
    },
    entities: [{ id: 'unit', label: 'Unit', attributeIds: ['apt.rent'] }],
    attributes: [
      {
        id: 'apt.rent',
        label: 'Monthly rent',
        valueType: 'money',
        required: true,
        appliesTo: ['unit'],
        evidenceExpectation: 'source',
        comparison: 'lower_better',
        sensitive: false,
      },
    ],
    criteria: {
      defaults: [
        {
          id: 'apt.budget',
          label: 'Within budget',
          kind: 'hard_constraint',
          weight: 100,
          direction: 'lower_better',
          appliesToAttribute: 'apt.rent',
          origin: 'pack',
          status: 'active',
        },
      ],
      allowUserDefined: true,
      protectedCriterionIds: ['apt.budget'],
    },
    obligations: [
      {
        id: 'apt.hard_constraints',
        label: 'Hard constraints',
        question: 'Which units satisfy the household budget?',
        category: 'constraints',
        required: true,
        priority: 10,
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
    ],
    extensionPolicy: {
      allowCaseAttributes: true,
      allowCaseCriteria: true,
      allowCaseObligations: true,
      userConcernTemplateId: 'apt.user_concern',
    },
    skills: [{ id: 'listing-normalizer', description: 'Normalizes listing terms.' }],
    specialists: [
      {
        id: 'deal-analyst',
        description: 'Analyzes normalized listing terms.',
        allowedTools: ['calculator'],
        allowedSkills: ['listing-normalizer'],
      },
    ],
    orchestration: {
      strategy: 'graph',
      maxSteps: 10,
      nodeTimeoutMs: 5_000,
      totalTimeoutMs: 30_000,
      maxConcurrency: 2,
    },
    tools: [
      {
        id: 'calculator',
        description: 'Computes ownership cost estimates.',
        effect: 'consequential',
        requiresApproval: true,
      },
    ],
    policies: [
      {
        id: 'calculator-approval',
        description: 'Requires human approval before a calculator result advances the shortlist.',
        requiresHumanApproval: true,
        appliesToToolIds: ['calculator'],
      },
    ],
    presentation: {
      optionLabel: 'Apartment',
      optionLabelPlural: 'Apartments',
      attributeGroups: [{ id: 'basics', label: 'Basics', attributeIds: ['apt.rent'] }],
    },
    evaluation: { scenarioIds: ['apt-success', 'apt-negative'], requiresNegativeCase: true },
    ...overrides,
  };
}

/** A Swarm-orchestrated variant of `validManifest`, with Swarm-required repetitive-handoff bounds set. */
export function validSwarmManifest(
  overrides: Partial<DecisionPackManifest> = {},
): DecisionPackManifest {
  return validManifest({
    orchestration: {
      strategy: 'swarm',
      maxSteps: 10,
      nodeTimeoutMs: 5_000,
      totalTimeoutMs: 30_000,
      repetitiveHandoffDetectionWindow: 8,
      repetitiveHandoffMinUniqueAgents: 3,
    },
    ...overrides,
  });
}

/** The installed catalog that resolves every skill/specialist/tool `validManifest` declares. */
export function validCatalog(): CapabilityCatalog {
  return createCapabilityCatalog([
    { id: 'listing-normalizer', kind: 'skill', version: '1.0.0' },
    { id: 'deal-analyst', kind: 'specialist', version: '1.0.0' },
    { id: 'calculator', kind: 'tool', version: '1.0.0' },
  ]);
}
