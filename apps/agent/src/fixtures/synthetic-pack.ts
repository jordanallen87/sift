/**
 * Shared test-only fixtures for `command-service.test.ts`, `run-service.test.ts`
 * (indirectly, via `MemoryCaseStore`), and the HTTP route integration tests:
 * a small synthetic, fully-valid Decision Pack manifest compiled and
 * registered directly with a real `PackRegistry` (`@sift/packs`), per this
 * task's explicit scope note -- "you do not need the real car-purchase pack
 * manifest to exist yet ... build and test the command service against a
 * synthetic test pack registered directly with `PackRegistry` in your own
 * tests" -- rather than depending on `packages/packs`' own internal
 * `src/fixtures/manifest.ts` (that file is that package's private test
 * support, not a published `@sift/packs` export, and a sibling task owns the
 * real `car-purchase.ts` manifest concurrently).
 *
 * Registered under `identity.id: 'car-purchase'` specifically so it also
 * satisfies `StartDemoInputSchema`'s closed `demoId` enum
 * (`['car-purchase', 'home-energy-guardian']`, `@sift/contracts`
 * `commands.ts`) without needing to widen that already-committed schema.
 */
import type { DecisionPackManifest } from '@sift/contracts';
import {
  compilePack,
  createCapabilityCatalog,
  PackRegistry,
  type CapabilityCatalog,
} from '@sift/packs';
import type { Clock, IdGenerator } from '@sift/core';

export const FIXED_NOW = '2026-08-27T00:00:00.000Z';

export const fixedClock: Clock = { now: () => FIXED_NOW };

/** A deterministic, prefix-aware `IdGenerator`: `next('foo')` returns `foo-1`, `foo-2`, ... independently per prefix; `next()` (no prefix) returns `id-1`, `id-2`, ... */
export function createSequentialIdGenerator(): IdGenerator {
  const counters = new Map<string, number>();
  return {
    next: (prefix = 'id') => {
      const count = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, count);
      return `${prefix}-${count}`;
    },
  };
}

export function syntheticCarPurchaseManifest(
  overrides: Partial<DecisionPackManifest> = {},
): DecisionPackManifest {
  return {
    schemaVersion: '1.0',
    identity: {
      id: 'car-purchase',
      version: '1.0.0',
      name: 'Choose Our Next Car (test fixture)',
      description: 'Synthetic test-only car purchase pack for apps/agent tests.',
      tags: ['car'],
    },
    activation: {
      intents: ['buy a car'],
      keywords: ['car', 'vehicle'],
      artifactKinds: ['listing'],
      entitySignals: ['car'],
      exclusions: [],
    },
    entities: [{ id: 'car', label: 'Car', attributeIds: ['car.price'] }],
    attributes: [
      {
        id: 'car.price',
        label: 'Price',
        valueType: 'money',
        required: true,
        appliesTo: ['car'],
        evidenceExpectation: 'source',
        comparison: 'lower_better',
        sensitive: false,
      },
    ],
    criteria: {
      defaults: [
        {
          id: 'price',
          label: 'Price',
          kind: 'hard_constraint',
          weight: 100,
          direction: 'lower_better',
          appliesToAttribute: 'car.price',
          origin: 'pack',
          status: 'active',
        },
      ],
      allowUserDefined: true,
      protectedCriterionIds: ['price'],
    },
    obligations: [
      {
        id: 'hard-constraints',
        label: 'Hard constraints',
        question: 'Which cars satisfy the hard constraints?',
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
      // A synthesis obligation, so tests can exercise the reweight path the
      // real packs rely on: `updateCriteria` reopens a satisfied obligation
      // marked `dependsOnCriteria` (and leaves measurement obligations like
      // `hard-constraints` above alone), which is what makes a re-run
      // possible after the criteria change that invalidated its answer.
      {
        id: 'synthesis',
        label: 'Shortlist synthesis',
        question: 'Which car best fits the criteria as currently weighted?',
        category: 'shortlist',
        required: true,
        priority: 5,
        requiredEvidenceLevel: 'E1',
        maxAttempts: 2,
        acceptedUncertaintyAllowed: false,
        dependsOn: ['hard-constraints'],
        preferredSkills: ['listing-normalizer'],
        preferredSpecialists: ['deal-analyst'],
        completionRule: {
          minimumEvidenceLevel: 'E1',
          minimumIndependentSources: 1,
          acceptedUncertaintyAllowed: false,
        },
        origin: 'pack',
        dependsOnCriteria: true,
      },
    ],
    extensionPolicy: {
      allowCaseAttributes: true,
      allowCaseCriteria: true,
      allowCaseObligations: true,
      userConcernTemplateId: 'car.user_concern',
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
      optionLabel: 'Car',
      optionLabelPlural: 'Cars',
      attributeGroups: [{ id: 'basics', label: 'Basics', attributeIds: ['car.price'] }],
    },
    evaluation: { scenarioIds: ['car-success', 'car-negative'], requiresNegativeCase: true },
    // A minimal but genuinely branching discovery process, so agent-side
    // discovery tests exercise conditional topics, required-vs-soft
    // necessity, and blind-spot applicability without depending on the real
    // Vehicle Selection pack (which would couple every agent test to that
    // pack's evolving question set).
    discovery: {
      topics: [
        {
          id: 'car.use_case',
          label: 'What it is for',
          question: 'What will this vehicle mainly be used for?',
          necessity: 'required',
          priority: 100,
          allowedInteractions: ['single_select'],
          optionSeeds: [
            { id: 'seed.family', label: 'Family', valueSummary: 'family' },
            { id: 'seed.business', label: 'Business', valueSummary: 'business' },
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
          id: 'car.budget',
          label: 'Budget',
          question: 'What is your budget?',
          necessity: 'required',
          priority: 90,
          allowedInteractions: ['range', 'free_text'],
          optionSeeds: [],
          escapeHatches: {
            allowCustom: true,
            allowNone: false,
            allowUnsure: true,
            allowDefer: false,
          },
          mapsToAttributeIds: ['car.price'],
          mapsToCriterionIds: [],
          confirmationRequired: true,
        },
        {
          id: 'car.payload',
          label: 'Payload',
          question: 'What does it have to carry?',
          necessity: 'required',
          priority: 80,
          appliesWhen: { topicId: 'car.use_case', equalsAnyOf: ['business'] },
          allowedInteractions: ['free_text'],
          optionSeeds: [],
          escapeHatches: {
            allowCustom: true,
            allowNone: false,
            allowUnsure: true,
            allowDefer: false,
          },
          mapsToAttributeIds: [],
          mapsToCriterionIds: [],
          confirmationRequired: true,
        },
        {
          id: 'car.colour',
          label: 'Colour',
          question: 'Any colour preference?',
          necessity: 'soft',
          priority: 10,
          allowedInteractions: ['free_text'],
          optionSeeds: [],
          escapeHatches: {
            allowCustom: true,
            allowNone: true,
            allowUnsure: true,
            allowDefer: true,
          },
          mapsToAttributeIds: [],
          mapsToCriterionIds: [],
          confirmationRequired: false,
        },
      ],
      blindSpots: [
        { id: 'blindspot.parking', label: 'Where it parks', detail: 'Garage or street size.' },
        {
          id: 'blindspot.worksite',
          label: 'Worksite access',
          detail: 'Narrow gates or soft ground.',
          appliesWhen: { topicId: 'car.use_case', equalsAnyOf: ['business'] },
        },
      ],
    },
    ...overrides,
  };
}

export function syntheticCatalog(): CapabilityCatalog {
  return createCapabilityCatalog([
    { id: 'listing-normalizer', kind: 'skill', version: '1.0.0' },
    { id: 'deal-analyst', kind: 'specialist', version: '1.0.0' },
    { id: 'calculator', kind: 'tool', version: '1.0.0' },
  ]);
}

/** A `PackRegistry` with `syntheticCarPurchaseManifest()` already compiled and registered. */
export function createRegistryWithSyntheticPack(): PackRegistry {
  const registry = new PackRegistry();
  registry.register(compilePack(syntheticCarPurchaseManifest(), syntheticCatalog(), fixedClock));
  return registry;
}
