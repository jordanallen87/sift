/**
 * Small, honest builders for RunPlan tests.
 *
 * Deliberately not a general-purpose case factory: each helper returns the
 * *minimum* valid shape for one fact the planner reads, so a test that
 * passes is passing because of the state it set up rather than because of
 * something incidental a fatter fixture happened to include.
 *
 * Every value here still round-trips through the real `@sift/contracts`
 * schemas -- `planCase` parses its own output. A fixture that could not
 * itself be persisted would prove nothing about a planner that reads
 * persisted state.
 */
import {
  CaseStateSchema,
  CompiledDecisionPackSchema,
  type CandidateDisposition,
  type CaseState,
  type CompiledDecisionPack,
  type EntityRecord,
  type ObligationState,
  type ResolvedCapabilityCatalog,
} from '@sift/contracts';

export const FIXTURE_NOW = '2026-09-02T12:00:00.000Z';

/** The specialist every fixture concern is answered by unless a test says otherwise. */
export const DEFAULT_SPECIALIST_ID = 'specialist.reliability';

export function candidate(id: string, label = id.toUpperCase()): EntityRecord {
  return {
    id,
    kind: 'candidate',
    label,
    attributes: {},
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  };
}

export function concernObligation(
  concernId: string,
  overrides: {
    id?: string;
    preferredSpecialists?: readonly string[];
  } = {},
): ObligationState {
  return {
    id: overrides.id ?? `ob-${concernId}`,
    label: `Concern: ${concernId}`,
    question: `What do we know about ${concernId}?`,
    category: 'evidence',
    required: true,
    priority: 500,
    requiredEvidenceLevel: 'E1',
    maxAttempts: 2,
    acceptedUncertaintyAllowed: true,
    dependsOn: [],
    preferredSkills: [],
    preferredSpecialists: [...(overrides.preferredSpecialists ?? [DEFAULT_SPECIALIST_ID])],
    completionRule: {
      minimumEvidenceLevel: 'E1',
      minimumIndependentSources: 1,
      acceptedUncertaintyAllowed: true,
    },
    origin: 'case_extension',
    criterionId: concernId,
    status: 'open',
    attemptsUsed: 0,
    updatedAt: FIXTURE_NOW,
  };
}

export function planCase(
  overrides: {
    entities?: readonly EntityRecord[];
    obligations?: readonly ObligationState[];
  } = {},
): CaseState {
  return CaseStateSchema.parse({
    schemaVersion: '1.0',
    id: 'case-plan',
    title: 'Vehicle Selection',
    status: 'draft',
    pack: {
      id: 'car-purchase',
      version: '1.0.0',
      compiledHash: 'a'.repeat(64),
      selectedBy: 'user',
      reasons: [],
    },
    attributeDefinitions: [],
    entities: [...(overrides.entities ?? [])],
    criteria: [],
    obligations: [...(overrides.obligations ?? [])],
    caseExtensions: [],
    claims: [],
    sources: [],
    evidenceLinks: [],
    recommendation: null,
    proposal: null,
    activeFocus: null,
    selectedOptionId: null,
    selectedEvidenceId: null,
    discovery: {
      mode: 'companion',
      topics: [],
      blindSpotReview: { status: 'pending', offeredPromptIds: [], selectedPromptIds: [] },
      dispositions: [],
      pendingInteraction: null,
      updatedAt: FIXTURE_NOW,
    },
    eventSequence: 1,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  });
}

/** Records the human judgment that authorizes (or withdraws) deep work on one candidate. */
export function withDisposition(
  state: CaseState,
  entityId: string,
  disposition: CandidateDisposition,
): CaseState {
  const discovery = state.discovery;
  if (discovery === undefined) {
    throw new Error('withDisposition: fixture case has no discovery state');
  }
  const existing = discovery.dispositions.find((record) => record.entityId === entityId);
  const next = {
    entityId,
    disposition,
    previousDisposition: existing?.disposition ?? ('unreviewed' as const),
    decidedAt: FIXTURE_NOW,
  };
  return {
    ...state,
    discovery: {
      ...discovery,
      dispositions: [
        ...discovery.dispositions.filter((record) => record.entityId !== entityId),
        next,
      ],
    },
  };
}

/** Records a confirmed answer, which is what a concern check's inputs depend on. */
export function withTopic(state: CaseState, topicId: string, valueSummary: string): CaseState {
  const discovery = state.discovery;
  if (discovery === undefined) {
    throw new Error('withTopic: fixture case has no discovery state');
  }
  return {
    ...state,
    discovery: {
      ...discovery,
      topics: [
        ...discovery.topics.filter((topic) => topic.topicId !== topicId),
        {
          topicId,
          label: topicId,
          status: 'confirmed' as const,
          necessity: 'required' as const,
          valueSummary,
          origin: 'user' as const,
          humanConfirmed: true,
          updatedAt: FIXTURE_NOW,
        },
      ],
    },
  };
}

/**
 * A pack whose declared discovery maps `vehicle.budget` onto the
 * `reliability` concern, so a budget change is a genuine causal input
 * change for the reliability checks and for nothing else.
 */
export function packWithCapabilities(
  capabilities: Partial<ResolvedCapabilityCatalog> = {},
): CompiledDecisionPack {
  return CompiledDecisionPackSchema.parse({
    schemaVersion: '1.0',
    identity: {
      id: 'car-purchase',
      version: '1.0.0',
      name: 'Vehicle Selection',
      description: 'Compare candidate vehicles against weighted household criteria.',
      tags: ['car'],
    },
    activation: {
      intents: ['buy a car'],
      keywords: ['car'],
      artifactKinds: [],
      entitySignals: [],
      exclusions: [],
    },
    entities: [],
    attributes: [],
    criteria: { defaults: [], allowUserDefined: true, protectedCriterionIds: [] },
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
    presentation: { optionLabel: 'car', optionLabelPlural: 'cars', attributeGroups: [] },
    evaluation: { scenarioIds: [], requiresNegativeCase: false },
    discovery: {
      topics: [
        {
          id: 'vehicle.budget',
          label: 'Budget',
          question: 'What is your budget?',
          necessity: 'required',
          priority: 90,
          allowedInteractions: ['free_text'],
          optionSeeds: [],
          escapeHatches: {
            allowCustom: true,
            allowNone: false,
            allowUnsure: true,
            allowDefer: false,
          },
          mapsToAttributeIds: [],
          mapsToCriterionIds: ['reliability'],
          confirmationRequired: true,
        },
      ],
      blindSpots: [{ id: 'bs.parking', label: 'Where it parks', detail: 'Garage size.' }],
    },
    compiledHash: 'b'.repeat(64),
    compiledAt: FIXTURE_NOW,
    resolvedCapabilities: {
      skillIds: [],
      specialistIds: [DEFAULT_SPECIALIST_ID, 'specialist.catalog'],
      toolIds: [],
      ...capabilities,
    },
    runtimeValidators: { attributeValidatorIds: [], obligationValidatorIds: [] },
  });
}
