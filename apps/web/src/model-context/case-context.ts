/**
 * Read-side projections for the Sift WebMCP read tools (`sift_get_case_context`,
 * `sift_list_packs`, `sift_get_option_details`, `sift_list_research`;
 * docs/specs/webmcp.md "Tool catalog"). Kept out of `register-sift-tools.ts` so
 * the projection logic -- which fields a case context summary carries, how
 * research/custom-field/question data is bounded -- is separately readable
 * from the registration/dispatch plumbing.
 *
 * `sift_get_case_context`'s effect text (webmcp.md) lists what it returns.
 * `buildCaseContextSummary` below projects `CaseState` to that field list,
 * widened per docs/decisions/0006-webmcp-two-way-collaboration-contract.md
 * decision 2: `caseExtensions`, `sources`, `claims`, and `evidenceLinks` are
 * no longer omitted wholesale. Each is instead projected in bounded form --
 * custom-field *definitions* (not raw `CaseExtension` records), a research
 * summary of source titles/publishers (never a `Source.excerpt` body, which
 * can run up to 5000 characters per `packages/contracts/src/case.ts:162`),
 * unresolved questions with their real `ObligationTemplate.question` text,
 * and a small set of stale/conflicted signals. No chain-of-thought, no
 * secrets, and no oversized source bodies enter the projection -- the
 * pre-existing exclusion of "private model messages" (which live in the
 * runtime/telemetry event log, never in `CaseState`) is unchanged; only the
 * four previously-omitted `CaseState` fields are added back, and only in
 * bounded form.
 */
import {
  OBLIGATION_STATUSES,
  type ActiveFocus,
  type AttributeDefinition,
  type CaseExtension,
  type CaseExtensionSummary,
  type CaseNote,
  type CaseNoteKind,
  type CaseAttributeOrigin,
  type CaseState,
  type Claim,
  type ClaimStance,
  type CompiledDecisionPack,
  type Criterion,
  type DecisionGuide,
  type EntityRecord,
  type ObligationState,
  type ObligationStatus,
  type PackActivation,
  type Recommendation,
  type Source,
  type SourceOrigin,
  type SourceVerification,
  type WorkspaceViewState,
} from '@sift/contracts';

export type ReadinessCounts = Record<ObligationStatus, number> & { total: number };

export interface PendingHumanAction {
  kind: 'review_proposal';
  proposalId: string;
}

// --- Bounding helpers (CLAUDE.md "Keep it BOUNDED... Bound every array.") ---
//
// Every collection below is capped to a small, named maximum and reports its
// true `total` alongside the (possibly truncated) `items` -- so a caller can
// tell the difference between "there is nothing more" and "there is more,
// call the dedicated tool for the rest" rather than a silently incomplete
// list. `bound` always takes the FIRST `max` entries of whatever order the
// caller already arranged (most-recent-first for research, highest-priority-
// first for questions), so callers order their array before calling this.

export interface BoundedList<T> {
  items: T[];
  total: number;
}

function bound<T>(items: readonly T[], max: number): BoundedList<T> {
  return { items: items.slice(0, max), total: items.length };
}

/** Truncates free text to `maxLength`, appending a single-character ellipsis marker when truncated. Never used on titles/labels short enough to fit their own schema bound untouched -- only on longer free text (claim statements, stale-signal labels) that could otherwise carry an unbounded amount of content into model context. */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

// --- Custom-field (case extension) definitions ---
//
// docs/decisions/0006-webmcp-two-way-collaboration-contract.md's central
// finding: `extension.defined` writes only to `CaseState.caseExtensions`
// (`packages/core/src/reducer.ts`), never to `attributeDefinitions`, so a
// custom field's *definition* was invisible even though its *value* already
// leaks through `EntityRecord.attributes`. `CaseExtensionSummary`
// (`@sift/contracts`, `packages/contracts/src/extensions.ts`) is already the
// exact bounded shape Strands' own Context Injector uses for this purpose
// (id/label/valueType/reason/origin/confirmation, deliberately omitting
// `proposedBy`/timestamps/downstream links) -- reused here rather than
// inventing a parallel shape.

const MAX_CUSTOM_FIELDS = 50;

function buildCaseExtensionSummary(extension: CaseExtension): CaseExtensionSummary {
  return {
    id: extension.definition.id,
    label: extension.definition.label,
    valueType: extension.definition.valueType,
    reason: extension.definition.reason,
    origin: extension.definition.origin,
    confirmation: extension.definition.confirmation,
  };
}

// --- Research (sources + claims) ---
//
// change-set §27: "Existing source/evidence capabilities should be surfaced
// coherently." Deliberately excludes `Source.excerpt` entirely (never
// truncates-and-includes it) -- the task this module implements specifies
// "source titles/publishers, NOT full bodies," and omitting the field
// outright is the strictest, least error-prone way to guarantee an oversized
// excerpt never reaches model context even if a future edit forgets to keep
// a truncation bound in sync with the schema's 5000-character maximum.

export interface SourceSummary {
  id: string;
  title: string;
  publisher?: string;
  url: string;
  origin: SourceOrigin;
  verification: SourceVerification;
  retrievedAt: string;
  publishedAt?: string;
}

export function buildSourceSummary(source: Source): SourceSummary {
  return {
    id: source.id,
    title: source.title,
    ...(source.publisher !== undefined ? { publisher: source.publisher } : {}),
    url: source.url,
    origin: source.origin,
    verification: source.verification,
    retrievedAt: source.retrievedAt,
    ...(source.publishedAt !== undefined ? { publishedAt: source.publishedAt } : {}),
  };
}

const CLAIM_STATEMENT_MAX = 280;

export interface ClaimSummary {
  id: string;
  obligationId: string;
  entityId?: string;
  statement: string;
  stance: ClaimStance;
  confidence: number;
  sourceIds: string[];
  stale: boolean;
}

export function buildClaimSummary(claim: Claim): ClaimSummary {
  return {
    id: claim.id,
    obligationId: claim.obligationId,
    ...(claim.entityId !== undefined ? { entityId: claim.entityId } : {}),
    statement: truncate(claim.statement, CLAIM_STATEMENT_MAX),
    stance: claim.stance,
    confidence: claim.confidence,
    sourceIds: claim.sourceIds,
    stale: claim.stale,
  };
}

/** Most-recently-submitted first: `CaseState.sources`/`claims` are append-only, so reversing puts the newest entries where `bound`'s head-slice keeps them. */
function mostRecentFirst<T>(items: readonly T[]): T[] {
  return [...items].reverse();
}

const MAX_CONTEXT_RESEARCH_SOURCES = 8;

export interface CaseContextResearchSummary {
  sources: BoundedList<SourceSummary>;
  totalClaims: number;
}

function buildContextResearchSummary(caseState: CaseState): CaseContextResearchSummary {
  return {
    sources: bound(
      mostRecentFirst(caseState.sources).map(buildSourceSummary),
      MAX_CONTEXT_RESEARCH_SOURCES,
    ),
    totalClaims: caseState.claims.length,
  };
}

// --- sift_list_research: a deliberately larger, dedicated projection ---
//
// Distinct from `CaseContextResearchSummary` above (which stays small since
// it rides along on every `sift_get_case_context` call): `sift_list_research`
// is a call the model makes specifically to review research, so it can
// afford a larger bound.

const MAX_RESEARCH_SOURCES = 50;
const MAX_RESEARCH_CLAIMS = 50;

export interface ResearchSummary {
  sources: BoundedList<SourceSummary>;
  claims: BoundedList<ClaimSummary>;
}

export function buildResearchSummary(caseState: CaseState): ResearchSummary {
  return {
    sources: bound(
      mostRecentFirst(caseState.sources).map(buildSourceSummary),
      MAX_RESEARCH_SOURCES,
    ),
    claims: bound(mostRecentFirst(caseState.claims).map(buildClaimSummary), MAX_RESEARCH_CLAIMS),
  };
}

// --- sift_list_notes: CaseNote projection (change-set §28/§29) ---
//
// A `CaseNote` is real, first-class content -- but deliberately NOT
// `Source`/`Claim`/`EvidenceLink`: it is not evidence, carries no
// verification/disposition, and never satisfies an obligation or moves
// readiness (`CaseNoteSchema`'s own doc comment, `packages/contracts/src/
// case.ts`). This projection exists purely so a caller can review what has
// already been noted; it grants a note no new authority in the process.
//
// `body` is truncated the same way `buildClaimSummary` truncates
// `Claim.statement` above -- both are user/model-authored free text capped
// at 2000 characters by their real schema, and this module's own convention
// (see `buildContextResearchSummary`/`buildResearchSummary`) is to bound
// long free text consistently rather than let one long note dominate the
// tool's output.

const NOTE_BODY_MAX = 500;
const MAX_NOTES = 50;

export interface NoteSummary {
  id: string;
  body: string;
  kind: CaseNoteKind;
  origin: CaseAttributeOrigin;
  authoredBy: string;
  optionIds: string[];
  obligationId?: string;
  sourceIds: string[];
  createdAt: string;
}

export function buildNoteSummary(note: CaseNote): NoteSummary {
  return {
    id: note.id,
    body: truncate(note.body, NOTE_BODY_MAX),
    kind: note.kind,
    origin: note.origin,
    authoredBy: note.authoredBy,
    optionIds: note.optionIds,
    ...(note.obligationId !== undefined ? { obligationId: note.obligationId } : {}),
    sourceIds: note.sourceIds,
    createdAt: note.createdAt,
  };
}

export interface NotesSummary {
  notes: BoundedList<NoteSummary>;
}

/** `caseState.notes` is `.optional()` (`CaseStateSchema`) so a snapshot persisted before `CaseNote` existed still parses -- `?? []` treats an absent field identically to a present-but-empty array, matching how every other optional collection projection in this module behaves. */
export function buildNotesSummary(caseState: CaseState): NotesSummary {
  return {
    notes: bound(mostRecentFirst(caseState.notes ?? []).map(buildNoteSummary), MAX_NOTES),
  };
}

// --- sift_get_option_details: one option's full attributes plus linked research ---

const MAX_OPTION_RELATED_CLAIMS = 30;
const MAX_OPTION_RELATED_SOURCES = 30;

export interface OptionDetailsSummary {
  optionId: string;
  option: EntityRecord;
  relatedClaims: BoundedList<ClaimSummary>;
  relatedSources: BoundedList<SourceSummary>;
}

/**
 * Returns `null` when `optionId` does not name a real entity on this case --
 * the caller (`register-sift-tools.ts`) maps that to an honest `NOT_FOUND`
 * envelope rather than fabricating an empty detail record.
 *
 * "Related" is derived from two genuinely-populated linkages, not one:
 * `Claim.entityId` (set by `CommandService.submitSource` when a submitted
 * claim names this option in `appliesToEntityIds`) and each attribute's own
 * `AttributeRecord.sourceIds` (set by any command/engine that recorded that
 * attribute with provenance). A source counts as related if it backs either
 * kind of linkage.
 */
export function buildOptionDetails(
  caseState: CaseState,
  optionId: string,
): OptionDetailsSummary | null {
  const option = caseState.entities.find((entity) => entity.id === optionId);
  if (option === undefined) {
    return null;
  }

  const relatedClaims = caseState.claims.filter((claim) => claim.entityId === optionId);
  const relatedSourceIds = new Set<string>();
  for (const claim of relatedClaims) {
    for (const sourceId of claim.sourceIds) relatedSourceIds.add(sourceId);
  }
  for (const attribute of Object.values(option.attributes)) {
    for (const sourceId of attribute.sourceIds) relatedSourceIds.add(sourceId);
  }
  const relatedSources = caseState.sources.filter((source) => relatedSourceIds.has(source.id));

  return {
    optionId,
    option,
    relatedClaims: bound(
      mostRecentFirst(relatedClaims).map(buildClaimSummary),
      MAX_OPTION_RELATED_CLAIMS,
    ),
    relatedSources: bound(
      mostRecentFirst(relatedSources).map(buildSourceSummary),
      MAX_OPTION_RELATED_SOURCES,
    ),
  };
}

// --- Unresolved questions ---
//
// `ObligationState` extends `ObligationTemplateSchema`
// (`packages/contracts/src/packs.ts`), so every obligation already carries a
// real `question: string` -- no separate "Question" type exists or is
// needed. "Unresolved" means not yet `satisfied` or `accepted_uncertainty`;
// ordered by the pack's own `priority` field, highest first, so a bounded
// slice keeps the questions the pack considers most important.

const MAX_UNRESOLVED_QUESTIONS = 15;
const UNRESOLVED_OBLIGATION_STATUSES: ReadonlySet<ObligationStatus> = new Set([
  'open',
  'active',
  'blocked',
]);

export interface UnresolvedQuestionSummary {
  obligationId: string;
  question: string;
  category: string;
  status: ObligationStatus;
  required: boolean;
  priority: number;
}

function buildUnresolvedQuestions(
  obligations: readonly ObligationState[],
): BoundedList<UnresolvedQuestionSummary> {
  const unresolved = obligations
    .filter((obligation) => UNRESOLVED_OBLIGATION_STATUSES.has(obligation.status))
    .slice()
    .sort((a, b) => b.priority - a.priority)
    .map((obligation) => ({
      obligationId: obligation.id,
      question: obligation.question,
      category: obligation.category,
      status: obligation.status,
      required: obligation.required,
      priority: obligation.priority,
    }));
  return bound(unresolved, MAX_UNRESOLVED_QUESTIONS);
}

// --- Stale / conflicted signals ---
//
// Three real, independently-populated staleness/conflict signals already
// exist on `CaseState`: an attribute record explicitly carrying
// `status: 'conflicted'`, a `Claim.stale`/`EvidenceLink.stale` flag set once
// supporting information is invalidated. Combined into one small, bounded
// list rather than three separate fields, matching change-set §52's "Do not
// create dozens of tiny tools/fields if a few coherent ones suffice."

const MAX_STALE_OR_CONFLICTED = 15;
const STALE_LABEL_MAX = 200;

export type StaleOrConflictedKind = 'attribute' | 'claim' | 'evidence';
export type StaleOrConflictedReason = 'conflicted' | 'stale';

export interface StaleOrConflictedSignal {
  kind: StaleOrConflictedKind;
  id: string;
  label: string;
  entityId?: string;
  reason: StaleOrConflictedReason;
}

function buildStaleOrConflictedSignals(caseState: CaseState): BoundedList<StaleOrConflictedSignal> {
  const signals: StaleOrConflictedSignal[] = [];

  for (const entity of caseState.entities) {
    for (const record of Object.values(entity.attributes)) {
      if (record.status === 'conflicted') {
        signals.push({
          kind: 'attribute',
          id: `${entity.id}:${record.definitionId}`,
          label: truncate(`${entity.label} — ${record.label}`, STALE_LABEL_MAX),
          entityId: entity.id,
          reason: 'conflicted',
        });
      }
    }
  }

  for (const claim of caseState.claims) {
    if (claim.stale) {
      signals.push({
        kind: 'claim',
        id: claim.id,
        label: truncate(claim.statement, STALE_LABEL_MAX),
        ...(claim.entityId !== undefined ? { entityId: claim.entityId } : {}),
        reason: 'stale',
      });
    }
  }

  for (const link of caseState.evidenceLinks) {
    if (link.stale) {
      signals.push({
        kind: 'evidence',
        id: link.id,
        label: truncate(link.summary, STALE_LABEL_MAX),
        reason: 'stale',
      });
    }
  }

  return bound(signals, MAX_STALE_OR_CONFLICTED);
}

// --- CaseContextSummary ---

export interface CaseContextSummary {
  caseId: string;
  title: string;
  status: CaseState['status'];
  pack: { id: string; version: string; compiledHash: string };
  criteria: Criterion[];
  attributeDefinitions: AttributeDefinition[];
  options: EntityRecord[];
  readiness: ReadinessCounts;
  activeFocus: ActiveFocus | null;
  selectedOptionId: string | null;
  selectedEvidenceId: string | null;
  recommendation: Recommendation | null;
  activeRun: { runId: string } | null;
  pendingHumanAction: PendingHumanAction | null;
  eventSequence: number;
  /** Case-defined custom-field (`custom.*`) *definitions* -- label, why it exists, origin, confirmation state. Closes the gap where a `custom.*` value was visible on `options[].attributes` with no way to learn what the field meant. */
  customFields: BoundedList<CaseExtensionSummary>;
  /** Bounded research summary: source titles/publishers, never `Source.excerpt` bodies. See `sift_list_research` for the fuller, dedicated projection. */
  research: CaseContextResearchSummary;
  /** Obligations not yet `satisfied`/`accepted_uncertainty`, with their real `question` text, highest pack-declared priority first. */
  unresolvedQuestions: BoundedList<UnresolvedQuestionSummary>;
  /** Attributes recorded `status: 'conflicted'`, plus claims/evidence links flagged `stale`. */
  staleOrConflicted: BoundedList<StaleOrConflictedSignal>;
  /**
   * The current workspace view (mode, focus, visible/pinned comparison
   * fields, sort) -- `CaseState.view` itself, genuinely persisted through
   * `sift_set_view`/`sift_configure_comparison`/`sift_focus_question`
   * (`register-sift-tools.ts`, `commands.setView`). `null` for any case no
   * presentation tool has touched yet. The optional `overrideView` parameter
   * below remains for a caller that needs to project some OTHER
   * `WorkspaceViewState` than the one already on `caseState` (e.g. a not-yet
   * -persisted value); `register-sift-tools.ts` no longer passes one.
   */
  view: WorkspaceViewState | null;
}

function countObligationsByStatus(obligations: CaseState['obligations']): ReadinessCounts {
  const counts = Object.fromEntries(OBLIGATION_STATUSES.map((status) => [status, 0])) as Record<
    ObligationStatus,
    number
  >;
  for (const obligation of obligations) {
    counts[obligation.status] += 1;
  }
  return { ...counts, total: obligations.length };
}

/**
 * Projects full canonical `CaseState` down to exactly the fields
 * `sift_get_case_context` is specified to return (docs/specs/webmcp.md
 * "Widened case context"). `overrideView` defaults to `null` (no override,
 * i.e. project `caseState.view` itself) so every existing direct call
 * site/test that only cares about the `CaseState`-derived fields keeps
 * working unchanged; `register-sift-tools.ts` no longer passes one, now that
 * `sift_set_view`/`sift_configure_comparison`/`sift_focus_question` persist
 * through `commands.setView` onto `CaseState.view` directly rather than
 * tracking a separate in-memory copy.
 */
export function buildCaseContextSummary(
  caseState: CaseState,
  overrideView: WorkspaceViewState | null = null,
): CaseContextSummary {
  return {
    caseId: caseState.id,
    title: caseState.title,
    status: caseState.status,
    pack: {
      id: caseState.pack.id,
      version: caseState.pack.version,
      compiledHash: caseState.pack.compiledHash,
    },
    criteria: caseState.criteria,
    attributeDefinitions: caseState.attributeDefinitions,
    options: caseState.entities,
    readiness: countObligationsByStatus(caseState.obligations),
    activeFocus: caseState.activeFocus,
    selectedOptionId: caseState.selectedOptionId,
    selectedEvidenceId: caseState.selectedEvidenceId,
    recommendation: caseState.recommendation,
    activeRun: caseState.activeFocus?.runId ? { runId: caseState.activeFocus.runId } : null,
    pendingHumanAction:
      caseState.proposal !== null && caseState.proposal.status === 'pending'
        ? { kind: 'review_proposal', proposalId: caseState.proposal.id }
        : null,
    eventSequence: caseState.eventSequence,
    customFields: bound(caseState.caseExtensions.map(buildCaseExtensionSummary), MAX_CUSTOM_FIELDS),
    research: buildContextResearchSummary(caseState),
    unresolvedQuestions: buildUnresolvedQuestions(caseState.obligations),
    staleOrConflicted: buildStaleOrConflictedSignals(caseState),
    view: overrideView ?? caseState.view ?? null,
  };
}

export interface PackSummary {
  packId: string;
  version: string;
  name: string;
  description: string;
  compiledHash: string;
  activation: PackActivation;
}

/** Projects a full `CompiledDecisionPack` manifest down to `sift_list_packs`'s specified return shape: "descriptions, versions, hashes, and activation signals." */
export function buildPackSummary(pack: CompiledDecisionPack): PackSummary {
  return {
    packId: pack.identity.id,
    version: pack.identity.version,
    name: pack.identity.name,
    description: pack.identity.description,
    compiledHash: pack.compiledHash,
    activation: pack.activation,
  };
}

// --- Decision Guide (sift_get_decision_guide; ADR 0006 decision 6) ---
//
// `guide` is returned as the full typed `DecisionGuide` object -- named
// fields (`domainPurpose`, `discoveryStrategy`, `suggestedQuestions`, ...),
// never flattened into one prose string. This is the load-bearing half of
// the "declarative data, not an instruction channel" guarantee described on
// `DecisionGuideSchema` itself (`packages/contracts/src/packs.ts`): a
// consumer that received one concatenated blob would have no structural way
// to tell "the pack author's description of this domain" apart from "an
// instruction for me to follow," even though the schema itself already keeps
// every field free of executable/HTML content. Keeping the seven fields
// separate and named preserves that distinction all the way to the caller.

export interface DecisionGuideSummary {
  packId: string;
  packVersion: string;
  guide: DecisionGuide;
}

/**
 * Finds the compiled pack matching `packId` among `packs` (matched by
 * `identity.id` only -- the same "pack id, not exact pinned hash" lookup
 * `sift_search_catalog`'s `catalogAdapters[packId]` already uses, since a
 * Decision Guide describes the class of decision a pack id represents, not
 * one exact compiled revision of it) and projects its optional
 * `decisionGuide` field. Returns `null`, never throws, when the pack is not
 * present in `packs` or declares no guide -- both honest, non-error outcomes
 * (`packs.ts`: "a pack that declares no Decision Guide must still compile").
 */
export function findDecisionGuide(
  packs: readonly CompiledDecisionPack[],
  packId: string,
): DecisionGuideSummary | null {
  const pack = packs.find((candidate) => candidate.identity.id === packId);
  if (pack?.decisionGuide === undefined) {
    return null;
  }
  return {
    packId: pack.identity.id,
    packVersion: pack.identity.version,
    guide: pack.decisionGuide,
  };
}
