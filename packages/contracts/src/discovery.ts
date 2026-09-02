/**
 * Adaptive decision discovery: the contracts that let a conversation drive a
 * decision without letting it lie about one.
 *
 * Grounded in docs/final-plan/final-approved-experience.md ("Adaptive
 * discovery, not a questionnaire", "Needs, importance, and blockers",
 * "Contextual blind-spot review", "Automatic Quick Pick") and the
 * non-negotiable P0 list in docs/final-plan/final-hackathon-execution-plan.md.
 *
 * ## Four rules this module makes unrepresentable rather than merely documented
 *
 * 1. **A model may propose; only a person may confirm.** A
 *    `DiscoveryTopicState` whose `origin` is `'model'` cannot carry
 *    `status: 'confirmed'` unless `humanConfirmed` is true, and no topic may
 *    reach the `must_work` tier — the one that removes options from
 *    consideration — without a human behind it. The same rule appears one
 *    level down on `TopicMapping`, so a model-proposed blocker always
 *    carries `requiresConfirmation: true`.
 *
 * 2. **Required conversational discovery cannot be skipped into search.** A
 *    `required` topic template may not declare a defer escape hatch, and a
 *    `companion`-mode `DecisionBrief` may not contain a deferred required
 *    topic. Only `standalone` may defer, and only then by marking its own
 *    output `provisional`.
 *
 * 3. **A candidate is a model unless it carries listing provenance.**
 *    `CandidateProvenance` refuses `level: 'listing'` without a `listing`
 *    block and refuses a `listing` block on a `model`-level candidate, so
 *    "this exact car, at this dealer, at this price" is a claim the type
 *    system will not let the product make by accident.
 *
 * 4. **Shortlist confirmation and the final decision are human-only.** A
 *    `NextMove` of a human-only kind must say so, and a human-only move has
 *    nowhere to put a `toolName` — so no registration code can find a tool
 *    to expose for it.
 *
 * ## Bounded generative UI
 *
 * `InteractionRequest` is the entire surface a model has for asking Sift to
 * render something. It is a fixed vocabulary of interaction kinds with
 * bounded, content-filtered strings and a closed option list whose mappings
 * must target the topics the interaction is already about. There is no
 * field for markup, no field for a script, and — deliberately — no field
 * for a preselected answer, so "no suggestion is silently preselected"
 * holds by construction rather than by convention.
 *
 * This module deliberately imports nothing from `case.ts` or `packs.ts`:
 * both of those import *from here*, and the private `safeString`/`idString`
 * helpers are duplicated here for the same reason they are duplicated in
 * every other contract module in this package.
 */
import { z } from 'zod';

const HTML_OR_EXECUTABLE_PATTERN = /<\/?[a-zA-Z!]|javascript:|on[a-zA-Z]+\s*=\s*["']/;

function safeString(maxLength: number) {
  return z
    .string()
    .max(maxLength)
    .refine((value) => !HTML_OR_EXECUTABLE_PATTERN.test(value), {
      message: 'value must not contain HTML tags or executable expressions',
    });
}

const idString = (maxLength = 200) =>
  z
    .string()
    .min(1)
    .max(maxLength)
    .regex(/^[A-Za-z0-9._-]+$/, 'id must contain only letters, digits, ".", "_", or "-"');

// --- Vocabularies ---

/**
 * Which presentation a case is being driven through. The two modes are two
 * presentations of one decision engine, not two engines: the only behavioral
 * difference the contracts encode is that `standalone` may defer a soft
 * topic and label its output provisional, while `companion` may not.
 */
export const DECISION_MODES = ['companion', 'standalone'] as const;
export type DecisionMode = (typeof DECISION_MODES)[number];

export const DISCOVERY_TOPIC_STATUSES = [
  'unknown',
  'inferred_pending',
  'confirmed',
  'deferred',
  'not_applicable',
  'blocked',
] as const;
export type DiscoveryTopicStatus = (typeof DISCOVERY_TOPIC_STATUSES)[number];

/**
 * The user-facing classification from the canonical experience. Note that
 * `needs_verification` is deliberately a peer of the other three rather than
 * a sub-state of one: "important but not established" is a distinct thing
 * from "unimportant", and collapsing it into either would turn an unknown
 * into a pass or a failure.
 */
export const IMPORTANCE_TIERS = [
  'must_work',
  'matters_a_lot',
  'nice_to_have',
  'needs_verification',
] as const;
export type ImportanceTier = (typeof IMPORTANCE_TIERS)[number];

/** The tier that removes options from consideration, and therefore the tier a model may never assign alone. */
const BLOCKING_TIER: ImportanceTier = 'must_work';

export const CANDIDATE_RESOLUTION_LEVELS = ['model', 'listing'] as const;
export type CandidateResolutionLevel = (typeof CANDIDATE_RESOLUTION_LEVELS)[number];

export const CANDIDATE_DISPOSITIONS = ['unreviewed', 'keep', 'pass', 'unsure'] as const;
export type CandidateDisposition = (typeof CANDIDATE_DISPOSITIONS)[number];

export const TOPIC_NECESSITIES = ['required', 'soft'] as const;
export type TopicNecessity = (typeof TOPIC_NECESSITIES)[number];

/** Who supplied a discovery value. Distinct from `humanConfirmed`, which records whether a person ratified it. */
export const DISCOVERY_ORIGINS = ['user', 'model', 'pack'] as const;
export type DiscoveryOrigin = (typeof DISCOVERY_ORIGINS)[number];

/**
 * The closed vocabulary of pane artifacts. `NextMove.requiredView` and every
 * model presentation request resolve against this list, which is why a model
 * cannot ask for a view that does not exist — including an arbitrary
 * HTML one.
 */
export const DECISION_VIEWS = [
  'brief',
  'interaction',
  'candidates',
  'quick_pick',
  'compare',
  'progress',
  'evidence',
  'recommendations',
  'confirmation',
] as const;
export type DecisionView = (typeof DECISION_VIEWS)[number];

/**
 * The bounded interaction grammar. Every kind here renders through a Sift
 * component; the model chooses a kind and supplies content, never markup.
 */
export const INTERACTION_KINDS = [
  'single_select',
  'multi_select',
  'yes_no_unsure',
  'range',
  'importance_sort',
  'ranking',
  'confirmation',
  'checklist',
  'free_text',
] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

/** Kinds whose answers come from a closed option list, and therefore need at least a real choice. */
const OPTION_BEARING_KINDS: readonly InteractionKind[] = [
  'single_select',
  'multi_select',
  'importance_sort',
  'ranking',
  'checklist',
];

export const INTERACTION_ESCAPES = ['none', 'unsure', 'defer'] as const;
export type InteractionEscape = (typeof INTERACTION_ESCAPES)[number];

// --- Coverage ---

const DiscoveryCoverageShape = z
  .object({
    requiredTotal: z.number().int().min(0).max(200),
    requiredResolved: z.number().int().min(0).max(200),
    softTotal: z.number().int().min(0).max(200),
    softResolved: z.number().int().min(0).max(200),
    blindSpotReviewComplete: z.boolean(),
  })
  .strict();

/**
 * Counts only — no stored ratio. A percentage persisted beside its own
 * numerator and denominator is a third fact that can disagree with the other
 * two; the pane derives it instead.
 */
export const DiscoveryCoverageSchema = DiscoveryCoverageShape.superRefine((coverage, ctx) => {
  if (coverage.requiredResolved > coverage.requiredTotal) {
    ctx.addIssue({
      code: 'custom',
      path: ['requiredResolved'],
      message: 'requiredResolved cannot exceed requiredTotal',
    });
  }
  if (coverage.softResolved > coverage.softTotal) {
    ctx.addIssue({
      code: 'custom',
      path: ['softResolved'],
      message: 'softResolved cannot exceed softTotal',
    });
  }
});
export type DiscoveryCoverage = z.infer<typeof DiscoveryCoverageSchema>;

// --- Topic state ---

const DiscoveryTopicStateShape = z
  .object({
    topicId: idString(),
    label: safeString(200),
    status: z.enum(DISCOVERY_TOPIC_STATUSES),
    necessity: z.enum(TOPIC_NECESSITIES),
    /** What the person or model actually said, summarised for the pane and the next model turn. */
    valueSummary: safeString(1000).optional(),
    importance: z.enum(IMPORTANCE_TIERS).optional(),
    origin: z.enum(DISCOVERY_ORIGINS),
    /** The model's own confidence in an extraction. Absent for values a person stated directly. */
    confidence: z.number().min(0).max(1).optional(),
    /** Why this topic cannot currently be resolved. Required when `status` is `blocked` so the pane can say what is wrong. */
    blockingReason: safeString(1000).optional(),
    /** True only when a person explicitly ratified this value. Never set by a model-origin write. */
    humanConfirmed: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DiscoveryTopicStateSchema = DiscoveryTopicStateShape.superRefine((topic, ctx) => {
  if (topic.status === 'confirmed' && topic.origin === 'model' && !topic.humanConfirmed) {
    ctx.addIssue({
      code: 'custom',
      path: ['humanConfirmed'],
      message:
        'a model-origin topic cannot be confirmed without human confirmation; use inferred_pending',
    });
  }

  if (topic.status === 'inferred_pending' && topic.humanConfirmed) {
    ctx.addIssue({
      code: 'custom',
      path: ['status'],
      message: 'a human-confirmed topic is no longer inferred_pending',
    });
  }

  if (topic.importance === BLOCKING_TIER && !topic.humanConfirmed) {
    ctx.addIssue({
      code: 'custom',
      path: ['importance'],
      message: `"${BLOCKING_TIER}" removes options from consideration and requires human confirmation`,
    });
  }

  if (topic.status === 'confirmed' && topic.valueSummary === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['valueSummary'],
      message: 'a confirmed topic must record what was confirmed',
    });
  }

  if (topic.status === 'blocked' && topic.blockingReason === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['blockingReason'],
      message: 'a blocked topic must record why it is blocked',
    });
  }
});
export type DiscoveryTopicState = z.infer<typeof DiscoveryTopicStateSchema>;

// --- Blind-spot review ---

export const BLIND_SPOT_REVIEW_STATUSES = ['pending', 'offered', 'complete'] as const;
export type BlindSpotReviewStatus = (typeof BLIND_SPOT_REVIEW_STATUSES)[number];

const BlindSpotReviewStateShape = z
  .object({
    status: z.enum(BLIND_SPOT_REVIEW_STATUSES),
    offeredPromptIds: z.array(idString()).max(30),
    selectedPromptIds: z.array(idString()).max(30),
    acknowledgedAt: z.iso.datetime().optional(),
  })
  .strict();

/**
 * The one required challenge pass before model discovery. "Complete" has to
 * mean a person was actually shown something and answered it — a review that
 * offered nothing and was silently marked done would satisfy the readiness
 * gate while doing none of the work the gate exists for.
 */
export const BlindSpotReviewStateSchema = BlindSpotReviewStateShape.superRefine((review, ctx) => {
  if (review.status === 'complete') {
    if (review.offeredPromptIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['offeredPromptIds'],
        message: 'a completed blind-spot review must have offered at least one prompt',
      });
    }
    if (review.acknowledgedAt === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['acknowledgedAt'],
        message: 'a completed blind-spot review must record when it was acknowledged',
      });
    }
  }

  const offered = new Set(review.offeredPromptIds);
  for (const selected of review.selectedPromptIds) {
    if (!offered.has(selected)) {
      ctx.addIssue({
        code: 'custom',
        path: ['selectedPromptIds'],
        message: `"${selected}" was selected but never offered`,
      });
    }
  }
});
export type BlindSpotReviewState = z.infer<typeof BlindSpotReviewStateSchema>;

// --- Atomic topic mappings ---

const TopicMappingShape = z
  .object({
    topicId: idString(),
    valueSummary: safeString(1000),
    importance: z.enum(IMPORTANCE_TIERS).optional(),
    origin: z.enum(['user', 'model'] as const),
    confidence: z.number().min(0).max(1),
    /** Whether this mapping must be ratified by a person before it takes effect. */
    requiresConfirmation: z.boolean(),
  })
  .strict();

/**
 * One atomic answer-to-topic mapping. A single natural response produces
 * several of these — "two kids in car seats, a big dog, and we cannot go
 * over forty thousand" is three mappings, which is what lets the model stop
 * asking about topics it has already been told.
 */
export const TopicMappingSchema = TopicMappingShape.superRefine((mapping, ctx) => {
  if (
    mapping.origin === 'model' &&
    mapping.importance === BLOCKING_TIER &&
    !mapping.requiresConfirmation
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['requiresConfirmation'],
      message: `a model-proposed "${BLOCKING_TIER}" mapping must require confirmation`,
    });
  }
});
export type TopicMapping = z.infer<typeof TopicMappingSchema>;

/** A mapping an option *would* produce if chosen; the origin and confidence are decided at response time. */
export const TopicMappingDraftSchema = z
  .object({
    topicId: idString(),
    valueSummary: safeString(1000),
    importance: z.enum(IMPORTANCE_TIERS).optional(),
  })
  .strict();
export type TopicMappingDraft = z.infer<typeof TopicMappingDraftSchema>;

// --- Bounded interactions ---

export const InteractionEscapeHatchesSchema = z
  .object({
    allowCustom: z.boolean(),
    allowNone: z.boolean(),
    allowUnsure: z.boolean(),
    allowDefer: z.boolean(),
  })
  .strict();
export type InteractionEscapeHatches = z.infer<typeof InteractionEscapeHatchesSchema>;

export const InteractionOptionSchema = z
  .object({
    id: idString(),
    label: safeString(200),
    detail: safeString(500).optional(),
    mapsTo: z.array(TopicMappingDraftSchema).min(1).max(5),
  })
  .strict();
export type InteractionOption = z.infer<typeof InteractionOptionSchema>;

const InteractionRequestShape = z
  .object({
    id: idString(),
    /** Every topic this one interaction may write to. An option cannot map outside this set. */
    topicIds: z.array(idString()).min(1).max(5),
    kind: z.enum(INTERACTION_KINDS),
    prompt: safeString(500),
    helpText: safeString(1000).optional(),
    options: z.array(InteractionOptionSchema).max(12),
    escapeHatches: InteractionEscapeHatchesSchema,
    requestedBy: z.enum(['model', 'core'] as const),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const InteractionRequestSchema = InteractionRequestShape.superRefine((request, ctx) => {
  if (OPTION_BEARING_KINDS.includes(request.kind) && request.options.length < 2) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: `"${request.kind}" needs at least two options; a single-option choice is not a choice`,
    });
  }

  if (!OPTION_BEARING_KINDS.includes(request.kind) && request.options.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: `"${request.kind}" does not take options`,
    });
  }

  const seen = new Set<string>();
  for (const option of request.options) {
    if (seen.has(option.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: `duplicate option id "${option.id}" would make a response ambiguous`,
      });
    }
    seen.add(option.id);
  }

  const declared = new Set(request.topicIds);
  for (const option of request.options) {
    for (const mapping of option.mapsTo) {
      if (!declared.has(mapping.topicId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: `option "${option.id}" maps to "${mapping.topicId}", which this interaction did not declare`,
        });
      }
    }
  }
});
export type InteractionRequest = z.infer<typeof InteractionRequestSchema>;

const InteractionResponseShape = z
  .object({
    interactionId: idString(),
    respondedBy: z.enum(['human', 'model'] as const),
    selectedOptionIds: z.array(idString()).max(12),
    customText: safeString(1000).optional(),
    escape: z.enum(INTERACTION_ESCAPES).optional(),
    mappings: z.array(TopicMappingSchema).max(10),
    respondedAt: z.iso.datetime(),
  })
  .strict();

export const InteractionResponseSchema = InteractionResponseShape.superRefine((response, ctx) => {
  if (response.escape !== undefined && response.selectedOptionIds.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['escape'],
      message: 'a response cannot both escape and select options',
    });
  }

  const empty =
    response.escape === undefined &&
    response.selectedOptionIds.length === 0 &&
    response.customText === undefined;
  if (empty) {
    ctx.addIssue({
      code: 'custom',
      path: ['selectedOptionIds'],
      message: 'a response must select something, say something, or escape',
    });
  }

  const seen = new Set<string>();
  for (const mapping of response.mappings) {
    if (seen.has(mapping.topicId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['mappings'],
        message: `two mappings compete over "${mapping.topicId}"`,
      });
    }
    seen.add(mapping.topicId);
  }
});
export type InteractionResponse = z.infer<typeof InteractionResponseSchema>;

// --- Next moves ---

export const NEXT_MOVE_KINDS = [
  'answer_topic',
  'confirm_inference',
  'review_blind_spots',
  'confirm_brief',
  'discover_candidates',
  'quick_pick',
  'compare_retained',
  'review_question',
  'await_investigation',
  'confirm_shortlist',
  'decide',
] as const;
export type NextMoveKind = (typeof NEXT_MOVE_KINDS)[number];

/**
 * The moves only a person may make. Structural rather than conventional: a
 * move of one of these kinds must declare `humanOnly`, and a `humanOnly`
 * move may not carry a `toolName` — so nothing that walks the move list
 * looking for tools to register can find one for these.
 */
export const HUMAN_ONLY_MOVE_KINDS = ['confirm_shortlist', 'decide'] as const;

/** Moves that name the specific topic they act on. */
const TOPIC_BEARING_MOVE_KINDS: readonly NextMoveKind[] = ['answer_topic', 'confirm_inference'];

const NextMoveShape = z
  .object({
    kind: z.enum(NEXT_MOVE_KINDS),
    label: safeString(200),
    reason: safeString(500),
    topicId: idString().optional(),
    requiredView: z.enum(DECISION_VIEWS).optional(),
    /** The WebMCP tool that performs this move, when one may. Absent for human-only moves by refinement below. */
    toolName: idString().optional(),
    humanOnly: z.boolean(),
    /** Whether taking this move may pull the pane away from where a person navigated. */
    mayInterruptHumanNavigation: z.boolean(),
  })
  .strict();

export const NextMoveSchema = NextMoveShape.superRefine((move, ctx) => {
  const mustBeHumanOnly = (HUMAN_ONLY_MOVE_KINDS as readonly string[]).includes(move.kind);

  if (mustBeHumanOnly && !move.humanOnly) {
    ctx.addIssue({
      code: 'custom',
      path: ['humanOnly'],
      message: `"${move.kind}" is a human-only move`,
    });
  }

  if (move.humanOnly && move.toolName !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['toolName'],
      message: 'a human-only move cannot be performed by a tool',
    });
  }

  if (TOPIC_BEARING_MOVE_KINDS.includes(move.kind) && move.topicId === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['topicId'],
      message: `"${move.kind}" must name the topic it acts on`,
    });
  }
});
export type NextMove = z.infer<typeof NextMoveSchema>;

// --- Candidate provenance ---

/**
 * Where a value came from. One vocabulary for candidates and for individual
 * attribute values, so the pane's provenance label means the same thing
 * wherever it appears.
 *
 * `curated_demo` is the load-bearing member: the bundled EPA catalog does
 * not carry cargo opening shape, child-seat layout, or reliability ratings,
 * so the hero cohort supplies them and every one of those values must be
 * able to say out loud that it is illustrative.
 */
export const DATA_PROVENANCE = [
  'catalog',
  'curated_demo',
  'user_supplied',
  'agent_discovered',
  'derived',
] as const;
export type DataProvenance = (typeof DATA_PROVENANCE)[number];

/**
 * The subset of `DATA_PROVENANCE` that can describe a whole candidate.
 * `derived` is excluded deliberately: an individual number can be computed
 * from other numbers, but a candidate is never computed — it is found.
 */
export const CANDIDATE_SOURCES = [
  'catalog',
  'curated_demo',
  'user_supplied',
  'agent_discovered',
] as const;
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];

export const ListingProvenanceSchema = z
  .object({
    listingId: idString(),
    seller: safeString(200),
    url: z.url().max(2000).optional(),
    observedAt: z.iso.datetime(),
  })
  .strict();
export type ListingProvenance = z.infer<typeof ListingProvenanceSchema>;

const CandidateProvenanceShape = z
  .object({
    level: z.enum(CANDIDATE_RESOLUTION_LEVELS),
    source: z.enum(CANDIDATE_SOURCES),
    /** The bundled EPA-derived record this candidate came from, when it came from one. */
    catalogRecordId: idString(300).optional(),
    /** Present only for listing-level candidates, and required for them. */
    listing: ListingProvenanceSchema.optional(),
    /** The sentence the pane shows when data is curated rather than measured. */
    disclosure: safeString(500).optional(),
  })
  .strict();

/**
 * The boundary between "a 2022 RAV4 Hybrid is a model that fits your brief"
 * and "this exact car is for sale near you at this price". The bundled
 * catalog can only support the first claim, so the second one is
 * unrepresentable without explicit listing provenance — and that provenance
 * is equally unrepresentable on a model-level candidate, which stops a
 * listing's details leaking onto a model card.
 */
export const CandidateProvenanceSchema = CandidateProvenanceShape.superRefine((provenance, ctx) => {
  if (provenance.level === 'listing' && provenance.listing === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['listing'],
      message: 'a listing-level candidate must carry its listing provenance',
    });
  }
  if (provenance.level === 'model' && provenance.listing !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['listing'],
      message: 'a model-level candidate cannot carry listing provenance',
    });
  }
});
export type CandidateProvenance = z.infer<typeof CandidateProvenanceSchema>;

// --- Quick Pick dispositions ---

/**
 * A human triage judgment on one candidate.
 *
 * Deliberately carries no `actor` field: a disposition is a human judgment
 * by construction, and the command that produces one is where an actor is
 * claimed and checked. A persisted record that an agent made a human
 * judgment should not be expressible at all.
 *
 * `previousDisposition` is required rather than optional because undo is a
 * P0 behavior — a record with nothing to undo back to is a record that
 * cannot be undone.
 *
 * Keep is explicitly *not* shortlist approval. It retains a candidate for
 * comparison and focuses deeper agent work on it; confirming the shortlist
 * is a separate, human-only `NextMove`.
 */
const CandidateDispositionRecordShape = z
  .object({
    entityId: idString(),
    disposition: z.enum(CANDIDATE_DISPOSITIONS),
    previousDisposition: z.enum(CANDIDATE_DISPOSITIONS),
    reason: safeString(500).optional(),
    decidedAt: z.iso.datetime(),
  })
  .strict();

export const CandidateDispositionRecordSchema = CandidateDispositionRecordShape;
export type CandidateDispositionRecord = z.infer<typeof CandidateDispositionRecordSchema>;

// --- Persisted discovery state ---

const DiscoveryStateShape = z
  .object({
    mode: z.enum(DECISION_MODES),
    topics: z.array(DiscoveryTopicStateSchema).max(100),
    blindSpotReview: BlindSpotReviewStateSchema,
    dispositions: z.array(CandidateDispositionRecordSchema).max(100),
    /** The interaction currently on screen, if any. */
    pendingInteraction: InteractionRequestSchema.nullable(),
    /** What kind of case this is, once the person has said. Drives conditional topics. */
    useCase: safeString(200).optional(),
    decisionFor: safeString(500).optional(),
    outcome: safeString(1000).optional(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const DiscoveryStateSchema = DiscoveryStateShape.superRefine((state, ctx) => {
  const topicIds = new Set<string>();
  for (const topic of state.topics) {
    if (topicIds.has(topic.topicId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['topics'],
        message: `duplicate state for topic "${topic.topicId}"`,
      });
    }
    topicIds.add(topic.topicId);
  }

  const entityIds = new Set<string>();
  for (const disposition of state.dispositions) {
    if (entityIds.has(disposition.entityId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['dispositions'],
        message: `duplicate disposition for "${disposition.entityId}"; only the latest is true`,
      });
    }
    entityIds.add(disposition.entityId);
  }
});
export type DiscoveryState = z.infer<typeof DiscoveryStateSchema>;

// --- Derived brief ---

const DecisionBriefShape = z
  .object({
    mode: z.enum(DECISION_MODES),
    useCase: safeString(200),
    decisionFor: safeString(500),
    outcome: safeString(1000),
    topics: z.array(DiscoveryTopicStateSchema).max(100),
    coverage: DiscoveryCoverageSchema,
    nextTopicId: idString().optional(),
    blindSpotReview: BlindSpotReviewStateSchema,
    /** True when a deferred topic means this output is not the whole picture. */
    provisional: z.boolean(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

/**
 * The projection the pane renders and `sift_get_case_context` returns. Not
 * persisted — `coverage` and `nextTopicId` are derived from `DiscoveryState`
 * plus the pinned pack, so storing them would create a second copy that can
 * disagree with the first.
 */
export const DecisionBriefSchema = DecisionBriefShape.superRefine((brief, ctx) => {
  const deferred = brief.topics.filter((topic) => topic.status === 'deferred');

  for (const topic of deferred) {
    if (brief.mode === 'companion' && topic.necessity === 'required') {
      ctx.addIssue({
        code: 'custom',
        path: ['topics'],
        message: `required topic "${topic.topicId}" cannot be deferred in companion mode`,
      });
    }
  }

  if (deferred.length > 0 && !brief.provisional) {
    ctx.addIssue({
      code: 'custom',
      path: ['provisional'],
      message: 'a brief with a deferred topic is provisional',
    });
  }
});
export type DecisionBrief = z.infer<typeof DecisionBriefSchema>;

// --- Pack-side declarations ---

/**
 * A deterministic applicability condition. Deliberately a single
 * topic/value test rather than an expression language: a pack author can say
 * "payload capacity only applies to a business case", and cannot say
 * anything that needs an evaluator to be safe.
 */
export const TopicConditionSchema = z
  .object({
    topicId: idString(),
    equalsAnyOf: z.array(safeString(200)).min(1).max(20),
  })
  .strict();
export type TopicCondition = z.infer<typeof TopicConditionSchema>;

export const OptionSeedSchema = z
  .object({
    id: idString(),
    label: safeString(200),
    detail: safeString(500).optional(),
    valueSummary: safeString(1000),
    importanceHint: z.enum(IMPORTANCE_TIERS).optional(),
  })
  .strict();
export type OptionSeed = z.infer<typeof OptionSeedSchema>;

const DiscoveryTopicTemplateShape = z
  .object({
    id: idString(),
    label: safeString(200),
    /** The pack's own phrasing. The model may reword it for context; it may not invent a topic. */
    question: safeString(500),
    necessity: z.enum(TOPIC_NECESSITIES),
    /** Higher is asked earlier. The core picks the highest-priority applicable unresolved topic. */
    priority: z.number().int().min(0).max(100),
    appliesWhen: TopicConditionSchema.optional(),
    allowedInteractions: z.array(z.enum(INTERACTION_KINDS)).min(1).max(9),
    optionSeeds: z.array(OptionSeedSchema).max(20),
    escapeHatches: InteractionEscapeHatchesSchema,
    /** Case attributes this topic's answer may write to. */
    mapsToAttributeIds: z.array(idString()).max(20),
    /** Criteria this topic's answer may weight. */
    mapsToCriterionIds: z.array(idString()).max(20),
    /** Whether a value here needs explicit human ratification before it constrains anything. */
    confirmationRequired: z.boolean(),
  })
  .strict();

export const DiscoveryTopicTemplateSchema = DiscoveryTopicTemplateShape.superRefine(
  (template, ctx) => {
    if (template.necessity === 'required' && template.escapeHatches.allowDefer) {
      ctx.addIssue({
        code: 'custom',
        path: ['escapeHatches', 'allowDefer'],
        message: 'a required topic cannot offer a defer escape hatch',
      });
    }
  },
);
export type DiscoveryTopicTemplate = z.infer<typeof DiscoveryTopicTemplateSchema>;

export const BlindSpotPromptTemplateSchema = z
  .object({
    id: idString(),
    label: safeString(200),
    detail: safeString(500),
    appliesWhen: TopicConditionSchema.optional(),
  })
  .strict();
export type BlindSpotPromptTemplate = z.infer<typeof BlindSpotPromptTemplateSchema>;

const PackDiscoveryDefinitionShape = z
  .object({
    topics: z.array(DiscoveryTopicTemplateSchema).max(60),
    blindSpots: z.array(BlindSpotPromptTemplateSchema).max(30),
  })
  .strict();

/**
 * A pack's declared discovery process. Optional on the manifest so that a
 * pack which declares none still compiles to the identical `compiledHash` it
 * always has — the same backward-compatibility reasoning `decisionGuide`
 * already documents in packs.ts.
 */
export const PackDiscoveryDefinitionSchema = PackDiscoveryDefinitionShape.superRefine(
  (definition, ctx) => {
    const ids = new Set<string>();
    for (const topic of definition.topics) {
      if (ids.has(topic.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['topics'],
          message: `duplicate topic id "${topic.id}"`,
        });
      }
      ids.add(topic.id);
    }

    const conditions = [
      ...definition.topics.map((topic) => ({ path: 'topics', condition: topic.appliesWhen })),
      ...definition.blindSpots.map((prompt) => ({
        path: 'blindSpots',
        condition: prompt.appliesWhen,
      })),
    ];

    for (const { path, condition } of conditions) {
      if (condition !== undefined && !ids.has(condition.topicId)) {
        ctx.addIssue({
          code: 'custom',
          path: [path],
          message: `condition references "${condition.topicId}", which this pack does not declare`,
        });
      }
    }
  },
);
export type PackDiscoveryDefinition = z.infer<typeof PackDiscoveryDefinitionSchema>;
