/**
 * Decision Pack source contract: `DecisionPackManifest` / `CompiledDecisionPack`
 * from docs/specs/pack-authoring.md ("Decision Pack source contract") and
 * `ObligationTemplate` / router types from docs/specs/packs-and-routing.md.
 *
 * Several nested shapes (`EntityTypeDefinition`, `SkillReference`,
 * `SpecialistDefinition`, `OrchestrationDefinition`, `ToolDeclaration`,
 * `PolicyDefinition`, `PresentationDefinition`, `PackEvaluationDefinition`,
 * `CompletionRule`, `ResolvedCapabilityCatalog`, `CompiledValidatorReferences`)
 * are named in prose but never given an explicit field list anywhere in the
 * spec set. Each is defined here as the minimal reasonable shape grounded in
 * how the spec describes its behavior; the comment above each documents the
 * grounding and flags it as inferred.
 */
import { z } from 'zod';
import { AttributeDefinitionSchema, CriterionSchema } from './attributes.js';

const HTML_OR_EXECUTABLE_PATTERN = /<\/?[a-zA-Z!]|javascript:|on[a-zA-Z]+\s*=\s*["']/;

function safeString(maxLength: number) {
  return z
    .string()
    .max(maxLength)
    .refine((value) => !HTML_OR_EXECUTABLE_PATTERN.test(value), {
      message: 'value must not contain HTML tags or executable expressions',
    });
}

// A conservative id charset shared by pack-scoped identifiers (pack id,
// entity/skill/specialist/tool/policy/criterion ids). Dots and hyphens are
// required by real ids used in the specs (e.g. `car-purchase`,
// `car.hard_constraints`, `deal-analyst`).
const idString = (maxLength = 200) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .regex(/^[A-Za-z0-9._-]+$/, 'id must contain only letters, digits, ".", "_", or "-"');

const semverString = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'version must be a semantic version (major.minor.patch)');

export const PackIdentitySchema = z
  .object({
    id: idString(),
    version: semverString,
    name: safeString(200),
    description: safeString(2000),
    tags: z.array(safeString(60)).max(30),
  })
  .strict();
export type PackIdentity = z.infer<typeof PackIdentitySchema>;

export const PackActivationSchema = z
  .object({
    intents: z.array(safeString(300)).max(50),
    keywords: z.array(safeString(100)).max(100),
    artifactKinds: z.array(safeString(100)).max(50),
    entitySignals: z.array(safeString(100)).max(50),
    exclusions: z.array(safeString(300)).max(50),
  })
  .strict();
export type PackActivation = z.infer<typeof PackActivationSchema>;

/**
 * Inferred: `EntityTypeDefinition` is named in pack-authoring.md's manifest
 * interface (`entities: EntityTypeDefinition[]`) with no field list. Grounded
 * in `EntityRecord.kind`/`label` (pack-authoring.md "Stable entity
 * envelope") plus which attribute definitions apply to this entity kind.
 */
export const EntityTypeDefinitionSchema = z
  .object({
    id: idString(),
    label: safeString(200),
    description: safeString(2000).optional(),
    attributeIds: z.array(idString()).max(200),
  })
  .strict();
export type EntityTypeDefinition = z.infer<typeof EntityTypeDefinitionSchema>;

export const EVIDENCE_LEVELS = ['E0', 'E1', 'E2', 'E3'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

/**
 * Inferred: `CompletionRule` is referenced by `ObligationTemplate.
 * completionRule` (packs-and-routing.md) with no field list. Grounded in the
 * evidence-level table directly above it in the same spec (E0-E3, "E2:
 * corroborated by two independent sources or one authoritative source") and
 * in `acceptedUncertaintyAllowed` appearing as a sibling obligation field.
 */
export const CompletionRuleSchema = z
  .object({
    minimumEvidenceLevel: z.enum(EVIDENCE_LEVELS),
    minimumIndependentSources: z.number().int().min(0).max(20),
    acceptedUncertaintyAllowed: z.boolean(),
  })
  .strict();
export type CompletionRule = z.infer<typeof CompletionRuleSchema>;

export const OBLIGATION_ORIGINS = ['pack', 'case_extension'] as const;
export type ObligationOrigin = (typeof OBLIGATION_ORIGINS)[number];

export const ObligationTemplateSchema = z
  .object({
    id: idString(),
    label: safeString(200),
    question: safeString(2000),
    category: safeString(200),
    required: z.boolean(),
    priority: z.number().int().min(0).max(1000),
    requiredEvidenceLevel: z.enum(EVIDENCE_LEVELS),
    maxAttempts: z.number().int().min(1).max(20),
    acceptedUncertaintyAllowed: z.boolean(),
    dependsOn: z.array(idString()).max(50),
    preferredSkills: z.array(idString()).max(50),
    preferredSpecialists: z.array(idString()).max(50),
    completionRule: CompletionRuleSchema,
    origin: z.enum(OBLIGATION_ORIGINS),
  })
  .strict();
export type ObligationTemplate = z.infer<typeof ObligationTemplateSchema>;

/**
 * Inferred: `SkillReference` has no explicit field list. Grounded in
 * strands-runtime.md "Skills": AgentSkills progressive disclosure means the
 * agent "initially receives name and description metadata" only.
 */
export const SkillReferenceSchema = z
  .object({
    id: idString(),
    description: safeString(2000),
  })
  .strict();
export type SkillReference = z.infer<typeof SkillReferenceSchema>;

/**
 * Inferred: `SpecialistDefinition` has no explicit field list. Grounded in
 * strands-runtime.md "Specialists": "Each has a narrow prompt and tool
 * subset."
 */
export const SpecialistDefinitionSchema = z
  .object({
    id: idString(),
    description: safeString(2000),
    allowedTools: z.array(idString()).max(50),
    allowedSkills: z.array(idString()).max(50).optional(),
  })
  .strict();
export type SpecialistDefinition = z.infer<typeof SpecialistDefinitionSchema>;

export const ORCHESTRATION_STRATEGIES = ['graph', 'swarm', 'single_agent', 'hybrid'] as const;
export type OrchestrationStrategy = (typeof ORCHESTRATION_STRATEGIES)[number];

/**
 * Inferred: `OrchestrationDefinition` has no explicit field list. Grounded in
 * strands-runtime.md: "Graphs set `maxSteps`, timeouts, and concurrency
 * explicitly" and "The Swarm sets `maxSteps`, execution timeout, node
 * timeout, and repetitive-handoff detection." Swarm-only fields stay
 * optional so a Graph-orchestrated pack does not need to declare them.
 */
export const OrchestrationDefinitionSchema = z
  .object({
    strategy: z.enum(ORCHESTRATION_STRATEGIES),
    maxSteps: z.number().int().min(1).max(100),
    nodeTimeoutMs: z.number().int().min(1000).max(300_000),
    totalTimeoutMs: z.number().int().min(1000).max(600_000),
    maxConcurrency: z.number().int().min(1).max(20).optional(),
    repetitiveHandoffDetectionWindow: z.number().int().min(1).max(50).optional(),
    repetitiveHandoffMinUniqueAgents: z.number().int().min(1).max(20).optional(),
  })
  .strict();
export type OrchestrationDefinition = z.infer<typeof OrchestrationDefinitionSchema>;

/**
 * Inferred: `ToolDeclaration` has no explicit field list. Grounded in
 * architecture.md "Pack manifests declare tools, effects, extension policy,
 * and approval posture" and "Fixture tools are read-only except canonical
 * Sift commands."
 */
export const TOOL_EFFECTS = ['read_only', 'consequential'] as const;
export type ToolEffect = (typeof TOOL_EFFECTS)[number];

export const ToolDeclarationSchema = z
  .object({
    id: idString(),
    description: safeString(2000),
    effect: z.enum(TOOL_EFFECTS),
    requiresApproval: z.boolean(),
  })
  .strict();
export type ToolDeclaration = z.infer<typeof ToolDeclarationSchema>;

/**
 * Inferred: `PolicyDefinition` has no explicit field list. Grounded in
 * strands-runtime.md's `ConsequenceGuard`, which "confirms a consequential
 * proposal and denies forbidden effects" for a named tool call.
 */
export const PolicyDefinitionSchema = z
  .object({
    id: idString(),
    description: safeString(2000),
    requiresHumanApproval: z.boolean(),
    appliesToToolIds: z.array(idString()).max(50).optional(),
  })
  .strict();
export type PolicyDefinition = z.infer<typeof PolicyDefinitionSchema>;

/**
 * Inferred: `PresentationDefinition` has no explicit field list. Grounded in
 * pack-authoring.md's compiler step "generic UI renderability checks" and
 * product.md's schema-driven, pack-agnostic option/attribute rendering.
 */
export const PresentationDefinitionSchema = z
  .object({
    optionLabel: safeString(200),
    optionLabelPlural: safeString(200),
    attributeGroups: z
      .array(
        z
          .object({
            id: idString(),
            label: safeString(200),
            attributeIds: z.array(idString()).max(100),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type PresentationDefinition = z.infer<typeof PresentationDefinitionSchema>;

/**
 * Inferred: `PackEvaluationDefinition` has no explicit field list. Grounded
 * in the compiler step "evaluation suites without negative cases" are
 * rejected (pack-authoring.md "Manifest compilation rejects ...") and the
 * authoring skill's "at least one success, incomplete-evidence, steering, and
 * human-boundary scenario" requirement.
 */
export const PackEvaluationDefinitionSchema = z
  .object({
    scenarioIds: z.array(idString()).max(50),
    requiresNegativeCase: z.boolean(),
  })
  .strict();
export type PackEvaluationDefinition = z.infer<typeof PackEvaluationDefinitionSchema>;

export const DecisionPackManifestSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    identity: PackIdentitySchema,
    activation: PackActivationSchema,
    entities: z.array(EntityTypeDefinitionSchema).max(50),
    attributes: z.array(AttributeDefinitionSchema).max(500),
    criteria: z
      .object({
        // A pack default criterion is a `Criterion` template that
        // `instantiateCase` copies into a fresh case; reusing `CriterionSchema`
        // here (rather than a near-duplicate `CriterionDefinition` type)
        // keeps the manifest and runtime shapes from drifting apart.
        defaults: z.array(CriterionSchema).max(200),
        allowUserDefined: z.boolean(),
        protectedCriterionIds: z.array(idString()).max(200),
      })
      .strict(),
    obligations: z.array(ObligationTemplateSchema).max(200),
    extensionPolicy: z
      .object({
        allowCaseAttributes: z.boolean(),
        allowCaseCriteria: z.boolean(),
        allowCaseObligations: z.boolean(),
        userConcernTemplateId: idString(),
      })
      .strict(),
    skills: z.array(SkillReferenceSchema).max(100),
    specialists: z.array(SpecialistDefinitionSchema).max(100),
    orchestration: OrchestrationDefinitionSchema,
    tools: z.array(ToolDeclarationSchema).max(100),
    policies: z.array(PolicyDefinitionSchema).max(100),
    presentation: PresentationDefinitionSchema,
    evaluation: PackEvaluationDefinitionSchema,
  })
  .strict();
export type DecisionPackManifest = z.infer<typeof DecisionPackManifestSchema>;

const SHA256_HEX = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'compiledHash must be a lowercase hex SHA-256');

/**
 * Inferred: `ResolvedCapabilityCatalog` has no explicit field list. Grounded
 * in the compiler step "capability allowlist resolution"
 * (pack-authoring.md).
 */
export const ResolvedCapabilityCatalogSchema = z
  .object({
    skillIds: z.array(idString()).max(200),
    specialistIds: z.array(idString()).max(200),
    toolIds: z.array(idString()).max(200),
  })
  .strict();
export type ResolvedCapabilityCatalog = z.infer<typeof ResolvedCapabilityCatalogSchema>;

/**
 * Inferred: `CompiledValidatorReferences` has no explicit field list.
 * Grounded in "The compiler turns these definitions into runtime
 * validators, comparison metadata, and schema-driven forms"
 * (pack-authoring.md "Pack-defined attributes").
 */
export const CompiledValidatorReferencesSchema = z
  .object({
    attributeValidatorIds: z.array(idString()).max(500),
    obligationValidatorIds: z.array(idString()).max(200),
  })
  .strict();
export type CompiledValidatorReferences = z.infer<typeof CompiledValidatorReferencesSchema>;

export const CompiledDecisionPackSchema = DecisionPackManifestSchema.extend({
  compiledHash: SHA256_HEX,
  compiledAt: z.iso.datetime(),
  resolvedCapabilities: ResolvedCapabilityCatalogSchema,
  runtimeValidators: CompiledValidatorReferencesSchema,
}).strict();
export type CompiledDecisionPack = z.infer<typeof CompiledDecisionPackSchema>;

// --- Routing (docs/specs/packs-and-routing.md "Router input and output") ---

export const RoutingInputSchema = z
  .object({
    explicitPackId: idString().optional(),
    activeCasePack: z
      .object({ id: idString(), version: semverString, compiledHash: SHA256_HEX })
      .strict()
      .optional(),
    userGoal: safeString(2000),
    route: safeString(500),
    artifactKinds: z.array(safeString(100)).max(50),
    entitySignals: z.array(safeString(100)).max(50),
  })
  .strict();
export type RoutingInput = z.infer<typeof RoutingInputSchema>;

export const RoutingCandidateSchema = z
  .object({
    packId: idString(),
    version: semverString,
    compiledHash: SHA256_HEX,
    confidence: z.number().min(0).max(1),
    reasons: z.array(safeString(500)).max(20),
    matchedSignals: z.array(safeString(200)).max(50),
  })
  .strict();
export type RoutingCandidate = z.infer<typeof RoutingCandidateSchema>;

export const ROUTING_DECISION_KINDS = ['selected', 'needs_confirmation', 'no_match'] as const;

export const RoutingDecisionSchema = z
  .object({
    kind: z.enum(ROUTING_DECISION_KINDS),
    selected: RoutingCandidateSchema.nullable(),
    candidates: z.array(RoutingCandidateSchema).max(10),
  })
  .strict();
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
