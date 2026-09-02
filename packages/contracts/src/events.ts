/**
 * `PublicActivityEvent` (docs/specs/architecture.md "Real-time event
 * contract", verbatim) and the canonical internal `CaseEvent` discriminated
 * union.
 *
 * `CaseEvent` itself is not named as a TS interface anywhere in the spec
 * set; it is grounded in architecture.md's "Command and event flow" step 3
 * ("The command handler emits one or more domain events") and step 4
 * ("Events append and the derived snapshot updates atomically"), and in
 * `applyCaseEvent(caseState, event): CaseState` (architecture.md
 * "Deterministic core"). The discriminant tags reuse `PublicActivityEvent`'s
 * own vocabulary where a domain event has a direct public counterpart
 * (`evidence.accepted`, `evidence.conflicted`, `obligation.updated`,
 * `recommendation.invalidated`, `recommendation.ready`); the remaining tags
 * (case creation, pack selection, option upsert, criteria change, extension
 * defined/confirmed, proposal reviewed) follow the same `noun.verb_past`
 * convention for the domain events that have no public-event equivalent.
 */
import { z } from 'zod';
import {
  CaseNoteSchema,
  CasePackPinSchema,
  ClaimSchema,
  DecisionProposalSchema,
  EntityRecordSchema,
  EvidenceLinkSchema,
  ObligationStateSchema,
  RecommendationSchema,
  CriterionSchema,
} from './case.js';
import { CaseExtensionReviewDecisionSchema, CaseExtensionSchema } from './extensions.js';
import {
  BlindSpotReviewStateSchema,
  DECISION_MODES,
  CandidateDispositionRecordSchema,
  DiscoveryTopicStateSchema,
  InteractionRequestSchema,
  InteractionResponseSchema,
} from './discovery.js';

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

// --- Bounded JsonValue ---
// pack-authoring.md: "Arbitrary functions, class instances, recursive
// unbounded JSON, HTML, and executable expressions are rejected." Used for
// `PublicActivityEvent.safeDetails` and (via `.unknown()` fallback
// elsewhere) intentionally *not* reused for RuntimeDebugEvent's `attributes`/
// `payload`, which the spec itself types as `unknown` -- see runtime.ts.
// Recursion is bounded to a fixed depth (rather than left open through
// `z.lazy`) so a maximally nested payload cannot be constructed at all,
// genuinely satisfying "unbounded" rejection rather than merely truncating.

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const JSON_VALUE_MAX_DEPTH = 4;

function boundedJsonValueSchema(depth: number): z.ZodType<JsonValue> {
  const primitive = z.union([z.string().max(4000), z.number(), z.boolean(), z.null()]);
  if (depth <= 0) {
    return primitive;
  }
  const nested = boundedJsonValueSchema(depth - 1);
  return z.union([primitive, z.array(nested).max(200), z.record(z.string(), nested)]);
}

export const JsonValueSchema: z.ZodType<JsonValue> = boundedJsonValueSchema(JSON_VALUE_MAX_DEPTH);

// --- PublicActivityEvent (architecture.md "Real-time event contract") ---

export const PUBLIC_ACTIVITY_EVENT_TYPES = [
  'command.accepted',
  // The continuous RunPlan (apps/agent/src/runtime/run-plan.ts). These are
  // public, not developer-only, because the plan revision *is* the visible
  // proof of the product's central claim: raising a new concern revises
  // work already under way instead of restarting it. A person watching the
  // pane should see that happen, and see what was kept.
  'plan.created',
  'plan.revised',
  'run.queued',
  'run.started',
  'run.completed',
  'run.failed',
  'specialist.started',
  'specialist.completed',
  'skill.activated',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'intervention.guided',
  'intervention.confirmation_required',
  'evidence.accepted',
  'evidence.conflicted',
  'obligation.updated',
  'recommendation.invalidated',
  'recommendation.ready',
  'draft.withheld',
  'case.snapshot',
] as const;
export type PublicActivityEventType = (typeof PUBLIC_ACTIVITY_EVENT_TYPES)[number];

export const PUBLIC_ACTIVITY_PHASES = [
  'queued',
  'active',
  'waiting',
  'completed',
  'failed',
] as const;
export type PublicActivityPhase = (typeof PUBLIC_ACTIVITY_PHASES)[number];

export const PublicActivityEventSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    eventId: idString(),
    sequence: z.number().int().min(0),
    timestamp: z.iso.datetime(),
    caseId: idString(),
    commandId: idString().optional(),
    runId: idString().optional(),
    obligationId: idString().optional(),
    agentId: idString().optional(),
    type: z.enum(PUBLIC_ACTIVITY_EVENT_TYPES),
    phase: z.enum(PUBLIC_ACTIVITY_PHASES),
    summary: safeString(2000),
    safeDetails: z.record(z.string(), JsonValueSchema).optional(),
    debugEventId: idString().optional(),
  })
  .strict();
export type PublicActivityEvent = z.infer<typeof PublicActivityEventSchema>;

/**
 * The `safeDetails` key marking an activity event as a PRESENTATION-ONLY
 * command -- one that wrote through `CaseStore.updateSelection` (patching
 * the snapshot durably, appending no `CaseEvent`, never advancing
 * `eventSequence`) rather than through `append`. Exactly three commands
 * qualify today: `setView`, `focusOption`, and `focusEvidence`.
 *
 * Declared here, in the shared contract, rather than as a string literal at
 * either end: the emitter (`apps/agent/src/services/command-service.ts`)
 * and the reader (`apps/web/src/app/App.tsx`'s `deriveReceiptFromEvents`)
 * are in different packages, and a typo in either one would silently
 * reintroduce the defect below rather than fail a build.
 *
 * These events are still emitted, still replayed, and still fully visible in
 * the activity stream and Runtime Inspector -- an agent-driven
 * `sift_set_view` call genuinely is something a person should be able to see
 * ChatGPT do. This flag exists so a *consumer* can tell the two classes
 * apart, not to hide anything.
 *
 * The consumer that needs it: the workspace hero's "Latest command" block,
 * which answers "what did Sift last do about my decision." Filtering the
 * option list by body style is not an answer to that question. Found in the
 * running product at 390px -- picking a filter chip surfaced "Latest command
 * / Set workspace view to "quick_pick". / Completed" directly beneath a hero
 * still reading "Nothing's been looked into yet.", which is both internal
 * jargon and a non-sequitur to someone shopping for a car.
 */
export const PRESENTATION_ONLY_ACTIVITY_DETAIL = 'presentationOnly';

// --- CaseEvent ---

const CaseEventBaseSchema = z.object({
  eventId: idString(),
  caseId: idString(),
  sequence: z.number().int().min(0),
  timestamp: z.iso.datetime(),
  commandId: idString().optional(),
});

export const CaseCreatedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('case.created'),
  payload: z
    .object({
      title: safeString(300),
      pack: CasePackPinSchema,
      /**
       * Which presentation this case was created through. Optional: a case
       * created before this field existed replays unchanged, and the
       * reducer treats an absent mode as `companion` -- the canonical
       * primary experience, and the only one that existed when those cases
       * were written. Present when a standalone entry point created the
       * case, because only `standalone` may defer a soft topic.
       */
      mode: z.enum(DECISION_MODES).optional(),
    })
    .strict(),
}).strict();

export const CasePackSelectedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('case.pack_selected'),
  payload: z
    .object({
      pack: CasePackPinSchema,
    })
    .strict(),
}).strict();

export const OptionUpsertedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('option.upserted'),
  payload: z
    .object({
      entity: EntityRecordSchema,
    })
    .strict(),
}).strict();

export const CriteriaUpdatedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('criteria.updated'),
  payload: z
    .object({
      criteria: z.array(CriterionSchema).max(200),
    })
    .strict(),
}).strict();

export const EvidenceAcceptedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('evidence.accepted'),
  payload: z
    .object({
      evidenceLink: EvidenceLinkSchema,
      claim: ClaimSchema.optional(),
    })
    .strict(),
}).strict();

export const EvidenceConflictedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('evidence.conflicted'),
  payload: z
    .object({
      evidenceLink: EvidenceLinkSchema,
      conflictingEvidenceIds: z.array(idString()).max(50),
    })
    .strict(),
}).strict();

export const ObligationUpdatedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('obligation.updated'),
  payload: z
    .object({
      obligation: ObligationStateSchema,
    })
    .strict(),
}).strict();

export const ExtensionDefinedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('extension.defined'),
  payload: z
    .object({
      extension: CaseExtensionSchema,
    })
    .strict(),
}).strict();

export const ExtensionConfirmedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('extension.confirmed'),
  payload: z
    .object({
      extensionId: idString(),
      decision: CaseExtensionReviewDecisionSchema,
    })
    .strict(),
}).strict();

/**
 * docs/change-sets/2026-08-30-generic-decision-workspace.md §28 "Notes":
 * "Add a generic `CaseNote` concept ... Not every thought belongs as
 * evidence, criterion, or attribute." Notes are event-sourced (`append()`,
 * not `updateSelection()`) like every other canonical case record --
 * `applyCaseEvent`'s fold for this event (reducer.ts) only ever appends onto
 * `CaseState.notes`, never touching `obligations`, `recommendation`, or
 * `evidenceLinks`, which is the concrete mechanism behind "notes never
 * auto-promote to evidence" (see `CaseNoteSchema`'s own doc comment,
 * case.ts).
 */
export const NoteAddedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('note.added'),
  payload: z
    .object({
      note: CaseNoteSchema,
    })
    .strict(),
}).strict();

export const RecommendationInvalidatedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('recommendation.invalidated'),
  payload: z
    .object({
      recommendationId: idString(),
      reason: safeString(2000),
    })
    .strict(),
}).strict();

export const RecommendationReadyEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('recommendation.ready'),
  payload: z
    .object({
      recommendation: RecommendationSchema,
    })
    .strict(),
}).strict();

export const ProposalReviewedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('proposal.reviewed'),
  payload: z
    .object({
      proposal: DecisionProposalSchema,
    })
    .strict(),
}).strict();

/**
 * Real, confirmed gap in the original `CaseEvent` taxonomy, added while
 * building the car-purchase scenario engine
 * (apps/agent/src/runtime/car-purchase-scenario.ts): no event anywhere in
 * this file ever moves `CaseState.proposal` from `null` to a real, pending
 * `DecisionProposal` -- `proposal.reviewed` only ever *reviews* an
 * already-existing one (`policy.ts`'s `reviewProposal` throws
 * `ValidationFailedError` when `caseState.proposal === null`). Something has
 * to create the first pending proposal once a Strands run (car-purchase's
 * `propose_recommendation` tool, gated by `ConsequenceGuard`'s `Confirm`)
 * produces one; this is that event. `applyCaseEvent` (`reducer.ts`) folds it
 * exactly like `recommendation.ready` folds a `Recommendation` -- a plain
 * field replacement, no business-rule validation (whether a proposal may
 * legally be created right now, e.g. "only when none is already pending", is
 * the command/engine layer's job, matching this file's own "dumb reducer"
 * convention documented in `reducer.ts`'s header comment).
 */
export const ProposalProposedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('proposal.proposed'),
  payload: z
    .object({
      proposal: DecisionProposalSchema,
    })
    .strict(),
}).strict();

// --- Adaptive discovery events ---
//
// Discovery is event-sourced like every other canonical case record, which
// is what makes the pane's coverage indicator, ChatGPT's next-turn readback,
// and the persona harness's turn diff three views of one truth rather than
// three independently maintained copies of it.

export const DiscoveryTopicUpdatedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('discovery.topic_updated'),
  payload: z
    .object({
      topic: DiscoveryTopicStateSchema,
      /** What produced this change, so the Runtime Inspector can correlate a tool call to a state diff. */
      cause: z.enum(['response', 'confirmation', 'correction', 'proposal', 'blind_spot'] as const),
    })
    .strict(),
}).strict();

export const DiscoveryInteractionRequestedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('discovery.interaction_requested'),
  payload: z
    .object({
      interaction: InteractionRequestSchema,
    })
    .strict(),
}).strict();

export const DiscoveryInteractionAnsweredEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('discovery.interaction_answered'),
  payload: z
    .object({
      response: InteractionResponseSchema,
    })
    .strict(),
}).strict();

export const DiscoveryBlindSpotReviewedEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('discovery.blind_spot_reviewed'),
  payload: z
    .object({
      review: BlindSpotReviewStateSchema,
    })
    .strict(),
}).strict();

/**
 * A Quick Pick judgment. Carries the record including what it replaced, so
 * an undo is a normal forward event rather than a deletion -- the history of
 * what a person considered and rejected stays intact, which is what "Pass
 * preserves history and may be undone" requires.
 */
export const CandidateDispositionSetEventSchema = CaseEventBaseSchema.extend({
  type: z.literal('candidate.disposition_set'),
  payload: z
    .object({
      disposition: CandidateDispositionRecordSchema,
    })
    .strict(),
}).strict();

export const DiscoveryCaseEventSchema = z.discriminatedUnion('type', [
  DiscoveryTopicUpdatedEventSchema,
  DiscoveryInteractionRequestedEventSchema,
  DiscoveryInteractionAnsweredEventSchema,
  DiscoveryBlindSpotReviewedEventSchema,
  CandidateDispositionSetEventSchema,
]);
export type DiscoveryCaseEvent = z.infer<typeof DiscoveryCaseEventSchema>;

export const CaseEventSchema = z.discriminatedUnion('type', [
  CaseCreatedEventSchema,
  CasePackSelectedEventSchema,
  OptionUpsertedEventSchema,
  CriteriaUpdatedEventSchema,
  EvidenceAcceptedEventSchema,
  EvidenceConflictedEventSchema,
  ObligationUpdatedEventSchema,
  ExtensionDefinedEventSchema,
  ExtensionConfirmedEventSchema,
  NoteAddedEventSchema,
  RecommendationInvalidatedEventSchema,
  RecommendationReadyEventSchema,
  ProposalProposedEventSchema,
  ProposalReviewedEventSchema,
  DiscoveryTopicUpdatedEventSchema,
  DiscoveryInteractionRequestedEventSchema,
  DiscoveryInteractionAnsweredEventSchema,
  DiscoveryBlindSpotReviewedEventSchema,
  CandidateDispositionSetEventSchema,
]);
export type CaseEvent = z.infer<typeof CaseEventSchema>;
