/**
 * Minimal, schema-valid `CaseState` / `CompiledDecisionPack` builders shared
 * by `model-context/*.test.ts`. Every field is populated with the smallest
 * value its real `@sift/contracts` Zod schema accepts (mostly empty arrays
 * and `null`s) so these fixtures stay valid as those schemas evolve, rather
 * than hand-copying a large literal that silently drifts out of sync.
 */
import type { CaseState, CompiledDecisionPack, ObligationState } from '@sift/contracts';

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

export function buildFixtureObligation(overrides: Partial<ObligationState> = {}): ObligationState {
  return {
    id: 'obl-1',
    label: 'Confirm total price',
    question: 'What is the out-the-door price?',
    category: 'price',
    required: true,
    priority: 1,
    requiredEvidenceLevel: 'E1',
    maxAttempts: 3,
    acceptedUncertaintyAllowed: false,
    dependsOn: [],
    preferredSkills: [],
    preferredSpecialists: [],
    completionRule: {
      minimumEvidenceLevel: 'E1',
      minimumIndependentSources: 1,
      acceptedUncertaintyAllowed: false,
    },
    origin: 'pack',
    status: 'open',
    attemptsUsed: 0,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

export function buildFixtureCaseState(overrides: Partial<CaseState> = {}): CaseState {
  return {
    schemaVersion: '1.0',
    id: 'case-1',
    title: 'Choose our next car',
    status: 'draft',
    pack: {
      id: 'car-purchase',
      version: '1.0.0',
      compiledHash: 'a'.repeat(64),
      selectedBy: 'user',
      reasons: [],
    },
    attributeDefinitions: [],
    entities: [],
    criteria: [],
    obligations: [],
    caseExtensions: [],
    claims: [],
    sources: [],
    evidenceLinks: [],
    recommendation: null,
    proposal: null,
    activeFocus: null,
    selectedOptionId: null,
    selectedEvidenceId: null,
    eventSequence: 1,
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

export function buildFixtureCompiledPack(
  overrides: Partial<CompiledDecisionPack> = {},
): CompiledDecisionPack {
  return {
    schemaVersion: '1.0',
    identity: {
      id: 'car-purchase',
      version: '1.0.0',
      name: 'Choose Our Next Car',
      description: 'Compare candidate cars against weighted household criteria.',
      tags: ['car', 'purchase'],
    },
    activation: {
      intents: ['buy a car'],
      keywords: ['car', 'vehicle'],
      artifactKinds: [],
      entitySignals: [],
      exclusions: [],
    },
    entities: [],
    attributes: [],
    criteria: {
      defaults: [],
      allowUserDefined: true,
      protectedCriterionIds: [],
    },
    obligations: [],
    extensionPolicy: {
      allowCaseAttributes: true,
      allowCaseCriteria: true,
      allowCaseObligations: true,
      userConcernTemplateId: 'user-concern-default',
    },
    skills: [],
    specialists: [],
    orchestration: {
      strategy: 'graph',
      maxSteps: 10,
      nodeTimeoutMs: 30_000,
      totalTimeoutMs: 120_000,
    },
    tools: [],
    policies: [],
    presentation: {
      optionLabel: 'car',
      optionLabelPlural: 'cars',
      attributeGroups: [],
    },
    evaluation: {
      scenarioIds: [],
      requiresNegativeCase: false,
    },
    compiledHash: 'b'.repeat(64),
    compiledAt: FIXED_TIMESTAMP,
    resolvedCapabilities: {
      skillIds: [],
      specialistIds: [],
      toolIds: [],
    },
    runtimeValidators: {
      attributeValidatorIds: [],
      obligationValidatorIds: [],
    },
    ...overrides,
  };
}
