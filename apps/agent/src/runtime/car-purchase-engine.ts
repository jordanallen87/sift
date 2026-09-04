/**
 * The real, live, asynchronously-triggered Strands adapter for the
 * `car-purchase` pack -- the "separate, not-yet-built task" `run-service.ts`
 * documents in its own header comment ("The Strands adapter that actually
 * executes a run against the selected obligation is a separate, not-yet-
 * built task"). Before this file existed, `POST /api/cases/:caseId/run`
 * only ever created a durable `runs` row and a `run.queued` activity event;
 * nothing ever advanced it past `queued`, and no specialist, skill, tool, or
 * evidence event was ever produced by a real browser session. This closes
 * that gap for the live server, without touching the already-proven
 * in-process demo-trajectory proof (`car-purchase-scenario.ts`,
 * `tests/scenarios/car-purchase.scenario.test.ts`).
 *
 * `createCarPurchaseEngine(deps).trigger(...)` is the one entry point:
 * given a real, already-durably-accepted run (`caseId`/`runId`/
 * `obligationId`), it
 *
 *  1. determines whether this is `round1` or `round2` purely from the
 *     case's own current, real state (`determineCarPurchaseRound` below --
 *     no external test-only flag, unlike `scripted-beats/car-purchase.ts`'s
 *     `setScenarioBeat`, which a real live trigger has no equivalent of to
 *     call);
 *  2. builds the real `ExecutionRequest`s for the four parallel specialists
 *     plus `source-challenger`/`decision-synthesizer` from the live
 *     snapshot, reusing `car-purchase-scenario.ts`'s own `buildGraphDeps`
 *     (exported for exactly this reuse -- see that file's header comment
 *     added alongside this task);
 *  3. runs the real six-node `executeCarPurchaseGraph`, streaming every
 *     `RuntimeEvent` it yields into the real `ActivityStore` AS THE GRAPH
 *     PROGRESSES (`drainGraphToActivity` below) -- never buffered until the
 *     end, matching architecture.md "Command and event flow": "Runtime
 *     activity events stream immediately" -- and, additively (this task),
 *     into the real Runtime Inspector persistence path
 *     (`store/runtime-event-store.ts`'s `RuntimeEventStore`, writing to the
 *     `runtime_events` table `db/schema.ts` declared but that had no writer
 *     anywhere in this codebase before this task). Both writes happen from
 *     the exact same drained `RuntimeEvent`, so `runtime_events` and
 *     `activity_events` stay two honest projections of one real stream, not
 *     two independently-derived ones;
 *  4. folds every specialist's validated `ExecutionResult` into real
 *     `CaseEvent`s via the scenario's own `foldExecutionResult`/
 *     `ensureSourcesExist` (also reused, not reimplemented -- both had
 *     their `caseStore`/`activityStore` parameter types widened from the
 *     scenario's concrete `MemoryCaseStore`/`InMemoryActivityStore` to the
 *     real `CaseStore`/`ActivityStore` interfaces so they genuinely accept
 *     the live SQLite-backed stores; see that file's own inline comments at
 *     each widened signature);
 *  5. on completion, records the round's recommendation/proposal following
 *     the exact same decision shape `car-purchase-scenario.ts` proves for
 *     round1 (a soft `recommendation.ready` lean, no proposal yet) and
 *     round2 (superseding stale round-1 evidence, resolving
 *     `car.hard_constraints`/`car.shortlist` deterministically, a revised
 *     `recommendation.ready`, and a pending `proposal.proposed` --
 *     deliberately never auto-approved: CLAUDE.md "The model may propose
 *     candidate events and recommendations. It may never approve a
 *     consequential decision." -- `reviewProposal` is a separate command a
 *     human issues through the normal UI, wholly outside this engine);
 *  6. advances the run's `RunStore` status `running` -> `completed`, or
 *     `failed` with a real error activity event on any thrown error --
 *     this function's own internal `try`/`catch` never lets a failure hang
 *     the run forever or vanish silently.
 *
 * --- Round-1-vs-round-2 state detection ---
 *
 * `scripted-beats/car-purchase.ts`'s scenario-only `setScenarioBeat` flips
 * every scripted provider between `'round1'`/`'round2'` from an external
 * call the test harness controls. A live trigger has no such caller -- the
 * round must be read from the case's own persisted state. The signal is
 * whether this case has gained **any confirmed case extension**: a `custom.*`
 * attribute a human has accepted (`extension.definition.confirmation ===
 * 'confirmed'`, `command-service.ts`'s `defineCaseAttribute`/
 * `reviewCaseExtension`). That is the durable fact that is true if and only
 * if the household has already gone through the WebMCP-driven
 * concern-and-criteria beat round 2 investigates. A *pending* (not yet
 * human-reviewed) or *rejected* extension is deliberately still `round1`:
 * round 2's household-fit investigation and hard-constraint disqualification
 * only make sense once a human has actually accepted the concern as real.
 *
 * The trigger is deliberately NOT keyed to any particular attribute id. It
 * used to test for the literal `custom.dog_crate_fit`, which made the pack's
 * story ("an unanticipated concern triggers another pass") false for every
 * household whose concern was anything else: no round 2, no revised
 * shortlist, and -- because round 2 is the only path that emits
 * `proposal.proposed` -- no approval control at all, which is the product's
 * central claim. Everything downstream of the trigger is likewise driven off
 * the extension the case actually carries: `ensureCaseExtensionObligations`
 * derives `case.<attributeId>` for each confirmed extension (the same
 * convention `command-service.ts`'s `synthesizeUserConcernObligationTemplate`
 * already mints), round 2 folds `household-fit-analyst`'s result against that
 * obligation, and `deriveUnestablishedAttributeLimitations` names attributes
 * by the case's own labels.
 *
 * Deriving the obligation here is a fallback, not the primary path:
 * `command-service.ts`'s `updateCriteria` already derives a case-extension
 * obligation generically for a newly-added criterion that needs an evidence
 * question, so on the normal route the obligation exists before this engine
 * runs and `ensureCaseExtensionObligations` is an early-returning no-op. It
 * still closes the case where a concern was defined (`defineCaseAttribute`)
 * without a criterion ever being added for it. It deliberately does not also
 * add `linkedCriterionId`/`linkedObligationId` back onto the `CaseExtension`
 * record itself (a cosmetic completion of a separately documented gap) --
 * see the dated `docs/build-log.md` entry for this task.
 */
import type {
  AttributeDefinition,
  CaseEvent,
  CaseExtension,
  CaseState,
  CompiledDecisionPack,
  Criterion,
  EntityRecord,
  EvidenceLink,
  ObligationTemplate,
  PublicActivityEvent,
  PublicActivityEventType,
  PublicActivityPhase,
} from '@sift/contracts';
import {
  deriveObligations,
  type CaseExtensionObligationTemplate,
  type Clock,
  type IdGenerator,
} from '@sift/core';
import type { PackRegistry } from '@sift/packs';
import { emptyScenarioTrajectory } from '@sift/scenarios';
import type { RunStatus } from '../db/schema.js';
import type { InvestigationEngine, RunStore } from '../services/run-service.js';
import type { ActivityStore } from '../store/activity-store.js';
import type { CaseStore } from '../store/case-store.js';
import type { RuntimeEventStore } from '../store/runtime-event-store.js';
import { diffJsonValues, normalizeCaseStateChange } from './event-normalizer.js';
import {
  CAR_PURCHASE_PARALLEL_SPECIALIST_IDS,
  executeCarPurchaseGraph,
  type CarPurchaseGraphResult,
} from './car-purchase-graph.js';
import {
  buildGraphDeps,
  ensureSourcesExist,
  entityLabelsById,
  extractCitedSourceIds,
  foldExecutionResult,
  humanizeDecisionText,
  loadSnapshotOrThrow,
  type CarPurchaseScenarioDeps,
} from './car-purchase-scenario.js';
import type { RuntimeEvent } from './event-normalizer.js';
import {
  buildCarPurchaseScriptedProviders,
  setScenarioBeat,
  type CarPurchaseScenarioBeat,
} from './scripted-beats/car-purchase.js';
import { deriveScoredRecommendationFields, mergeLimitations } from './recommendation-scoring.js';

/**
 * The exact candidate id set the deterministic car-purchase demo fixture
 * seeds (`buildCarPurchaseCandidateEntities`, `server.ts`'s
 * `buildCarPurchaseCandidateEntities` call site, and this file's own
 * `seedRealCandidates`-shaped test helper). This engine's entire scripted
 * two-round investigation -- `HARD_CONSTRAINTS_SUMMARY`'s named sentence,
 * `TEASER_PRICE_SOURCE_ID`, and every scripted provider in
 * `scripted-beats/car-purchase.ts` -- is written specifically around these
 * four candidates, not a generic shortlist. See
 * docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md "Decision"
 * §4.
 */
export const DETERMINISTIC_DEMO_CANDIDATE_IDS = [
  'candidate-rav4',
  'candidate-crv',
  'candidate-cx5',
  'candidate-outback',
] as const;

/**
 * True only when `caseState`'s entity id set is EXACTLY the deterministic
 * demo's four candidate ids (no more, no fewer, regardless of order) -- see
 * docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md "Decision"
 * §4. A catalog-built case (via `startCase` + `upsertOption`) will virtually
 * never match this exactly, even if it happens to contain a RAV4 -- its
 * entity ids come from `idGenerator.next('option')`, not these literal
 * fixture strings. Order-independent (a `Set` comparison) because nothing
 * about entity array order is a durable contract elsewhere in this codebase.
 */
export function isDeterministicCarPurchaseDemoCase(caseState: CaseState): boolean {
  const actualIds = new Set(caseState.entities.map((entity) => entity.id));
  if (actualIds.size !== DETERMINISTIC_DEMO_CANDIDATE_IDS.length) return false;
  return DETERMINISTIC_DEMO_CANDIDATE_IDS.every((demoId) => actualIds.has(demoId));
}

/** The real `source-dealer-offer-candidate-rav4` teaser-price evidence link(s) round 2 supersedes -- see `car-purchase-scenario.ts`'s identical rationale at its own round-2 fold. */
const TEASER_PRICE_SOURCE_ID = 'source-dealer-offer-candidate-rav4';

const HARD_CONSTRAINTS_SUMMARY =
  'Every candidate meets the household feature requirements (AWD, adaptive cruise, blind-spot monitoring, forward collision warning, 2 LATCH anchors). candidate-crv, candidate-cx5, and candidate-outback meet the maximum-budget requirement; candidate-rav4 does not.';

/**
 * Every `custom.*` concern this case has legitimately gained AND a human has
 * accepted, in the order the case recorded them (`CaseState.caseExtensions`
 * is append-ordered, so this is deterministic without sorting). A pending or
 * rejected extension is deliberately excluded -- see this file's header
 * comment.
 */
export function confirmedCaseExtensions(caseState: CaseState): CaseExtension[] {
  return caseState.caseExtensions.filter(
    (extension) => extension.definition.confirmation === 'confirmed',
  );
}

/**
 * The case-scoped obligation id one confirmed extension derives, byte-
 * identical to the convention `command-service.ts`'s
 * `synthesizeUserConcernObligationTemplate` already mints for a newly-added
 * criterion (`` `case.${criterion.id}` ``) and to the demo's own long-standing
 * `case.custom.dog_crate_fit`. `linkedCriterionId` wins when the reducer has
 * already linked one, so an extension whose criterion id differs from its
 * attribute id still converges on the SAME obligation record rather than
 * producing a confusing duplicate.
 */
export function caseExtensionObligationId(extension: CaseExtension): string {
  return `case.${extension.linkedCriterionId ?? extension.definition.id}`;
}

/**
 * Pure round detection from real case state. See this file's header comment
 * for the full reasoning. Exported directly for a fast, focused unit test
 * independent of running the real Graph.
 */
export function determineCarPurchaseRound(caseState: CaseState): CarPurchaseScenarioBeat {
  return confirmedCaseExtensions(caseState).length > 0 ? 'round2' : 'round1';
}

/**
 * The attributes this case says matter, in a stable order: every confirmed
 * extension's own `custom.*` attribute first (the concerns the household
 * added, which is what a round-2 recommendation is about), then every
 * attribute an active criterion measures -- singly via `appliesToAttribute`
 * or as one part of a composite via `composedOfAttributes`. Deduplicated,
 * first occurrence wins.
 */
function ratedAttributeIds(caseState: CaseState): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (attributeId: string | undefined): void => {
    if (attributeId === undefined || seen.has(attributeId)) return;
    seen.add(attributeId);
    ordered.push(attributeId);
  };

  for (const extension of confirmedCaseExtensions(caseState)) {
    push(extension.definition.id);
  }
  for (const criterion of caseState.criteria) {
    if (criterion.status !== 'active') continue;
    push(criterion.appliesToAttribute);
    for (const composed of criterion.composedOfAttributes ?? []) push(composed);
  }
  return ordered;
}

/** The attribute definition this case can resolve for `attributeId`, from the pinned pack or from a confirmed extension. `undefined` when a criterion names an attribute neither declares. */
function attributeDefinitionFor(
  attributeId: string,
  caseState: CaseState,
  pack: CompiledDecisionPack,
): AttributeDefinition | undefined {
  const packAttribute = pack.attributes.find((attribute) => attribute.id === attributeId);
  if (packAttribute !== undefined) return packAttribute;
  return confirmedCaseExtensions(caseState).find(
    (extension) => extension.definition.id === attributeId,
  )?.definition;
}

/** The label a person actually reads for `attributeId` -- never the raw id if anything on the case names it. */
function attributeLabelFor(
  attributeId: string,
  definition: AttributeDefinition | undefined,
  caseState: CaseState,
  entities: readonly EntityRecord[],
): string {
  if (definition !== undefined) return definition.label;
  const criterion: Criterion | undefined = caseState.criteria.find(
    (entry) => entry.appliesToAttribute === attributeId,
  );
  if (criterion !== undefined) return criterion.label;
  for (const entity of entities) {
    const record = entity.attributes[attributeId];
    if (record !== undefined) return record.label;
  }
  return attributeId;
}

/**
 * The recommendation limitations this engine can state as measured fact:
 * for each attribute the case says matters (`ratedAttributeIds`), how many
 * of the entities it applies to actually carry an established value for it.
 *
 * This replaces two unconditional English sentences the round-2 fold used to
 * attach to every recommendation ("Whether both dog crates fit behind the
 * second row remains unverified for every candidate.", "Driving comfort
 * remains unverified for every candidate."). Both asserted coverage the
 * engine never checked, named one hardcoded concern, and -- because
 * `mergeLimitations` puts engine-authored lines ahead of derived ones --
 * rendered first, so populating either column produced a flat contradiction
 * on the first line a person read. CLAUDE.md: a limitation must be true when
 * it is stated.
 *
 * "Established" is `status !== 'unknown'`, i.e. the record carries a real
 * value (`AttributeRecordSchema` requires `value` for every non-`unknown`
 * status). The partial wording deliberately does not say the covered
 * candidates are *verified* -- `verified` is a specific human attestation in
 * this product's vocabulary and a `supported` value is not one.
 *
 * Exported for a focused unit test: this is pure over `(CaseState,
 * CompiledDecisionPack)` and needs no Graph, store, or clock.
 */
export function deriveUnestablishedAttributeLimitations(
  caseState: CaseState,
  pack: CompiledDecisionPack,
): string[] {
  const limitations: string[] = [];
  for (const attributeId of ratedAttributeIds(caseState)) {
    const definition = attributeDefinitionFor(attributeId, caseState, pack);
    const applicable =
      definition === undefined
        ? caseState.entities
        : caseState.entities.filter((entity) => definition.appliesTo.includes(entity.kind));
    if (applicable.length === 0) continue;

    const established = applicable.filter((entity) => {
      const record = entity.attributes[attributeId];
      return record !== undefined && record.status !== 'unknown';
    }).length;
    if (established === applicable.length) continue;

    const label = attributeLabelFor(attributeId, definition, caseState, applicable);
    limitations.push(
      established === 0
        ? `${label}: not established for any candidate on this case.`
        : `${label}: established for only ${established} of the ${applicable.length} candidates.`,
    );
  }
  return limitations;
}

export interface CarPurchaseEngineDeps {
  readonly caseStore: CaseStore;
  readonly activityStore: ActivityStore;
  readonly runStore: RunStore;
  /**
   * The real Runtime Inspector persistence path (`store/runtime-event-store.ts`,
   * this task): every `RuntimeEvent` the real Graph run yields is durably
   * appended here in the same pass `drainGraphToActivity` already uses to
   * project the public `ActivityStore` narration -- additively, so the
   * proven `ActivityStore` projection is unchanged. See
   * `drainGraphToActivity`'s own comment below.
   */
  readonly runtimeEventStore: RuntimeEventStore;
  readonly registry: PackRegistry;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly skillsRootDir: string;
}

export interface CarPurchaseEngine extends InvestigationEngine {
  /**
   * Fire-and-forget per `InvestigationEngine`, but returns the real
   * in-flight `Promise` -- production callers (`run-service.ts`) never
   * await it; tests may, to observe real completion deterministically
   * without polling or a fixed sleep. Two triggers for the same `caseId`
   * are serialized (a second run for a case with one already in flight
   * starts only after the first settles), so this engine never runs two
   * concurrent Graph passes against the same case's mutable state.
   */
  trigger(params: { caseId: string; runId: string; obligationId: string }): Promise<void>;
}

function appendActivity(
  activityStore: ActivityStore,
  clock: Clock,
  caseId: string,
  fields: {
    runId?: string;
    obligationId?: string;
    agentId?: string;
    /** The synthetic id of the exact correlated `runtime_events` row this activity event was derived from (I2: "a consumer-visible activity event should open its exact corresponding runtime event"). Omitted for engine-level bookkeeping events (`run.started`/`.completed`/`.failed`) that were never themselves one normalized `RuntimeEvent`. */
    debugEventId?: string;
    type: PublicActivityEventType;
    phase: PublicActivityPhase;
    summary: string;
    /**
     * Small, published, machine-readable facts a consumer surface can render
     * beside the summary -- `PublicActivityEvent.safeDetails`
     * (`packages/contracts/src/events.ts`), which `ActivityStore` already
     * persists and replays as the `activity_events.data` column.
     *
     * "Safe" is the whole contract: this rides on the sanitized *public*
     * stream, so only closed, non-user-shaped values belong here. Never a
     * user-entered note, a model's private reasoning, a raw tool payload, a
     * header, or anything credential-shaped -- those stay in the Runtime
     * Inspector's own detail, behind `event-normalizer.ts`'s redaction.
     */
    safeDetails?: NonNullable<PublicActivityEvent['safeDetails']>;
  },
): void {
  activityStore.append({
    timestamp: clock.now(),
    caseId,
    ...(fields.runId !== undefined ? { runId: fields.runId } : {}),
    ...(fields.obligationId !== undefined ? { obligationId: fields.obligationId } : {}),
    ...(fields.agentId !== undefined ? { agentId: fields.agentId } : {}),
    ...(fields.debugEventId !== undefined ? { debugEventId: fields.debugEventId } : {}),
    type: fields.type,
    phase: fields.phase,
    summary: fields.summary,
    ...(fields.safeDetails !== undefined ? { safeDetails: fields.safeDetails } : {}),
  });
}

/**
 * Translates one normalized `RuntimeEvent` (`event-normalizer.ts`) from the
 * live Graph run into the matching public `ActivityStore` event, if the
 * normal workspace's public vocabulary (`@sift/contracts`
 * `PUBLIC_ACTIVITY_EVENT_TYPES`) has one. `model`/`context`/`goal`/
 * `session`/`error`-category events (and `intervention.proceed`/`.deny`/
 * `.transform`) have no direct public counterpart today; they remain
 * Runtime Inspector-only detail. Persisting the full `RuntimeDebugEvent`
 * stream itself (the `runtime_events` table `db/schema.ts` already
 * declares) is the separate, not-yet-built Runtime Inspector persistence
 * task CLAUDE.md names -- genuinely out of this task's scope; see the dated
 * `docs/build-log.md` entry.
 */
function appendActivityForRuntimeEvent(
  event: RuntimeEvent,
  ctx: { caseId: string; runId: string },
  activityStore: ActivityStore,
  clock: Clock,
  /** The synthetic id `runtimeEventStore.append` minted for this exact `event` (I2). Every `appendActivity` call below stamps it, so the resulting `PublicActivityEvent` resolves back to this precise `runtime_events` row. */
  debugEventId: string,
): void {
  const shared = {
    runId: ctx.runId,
    debugEventId,
    ...(event.obligationId !== undefined ? { obligationId: event.obligationId } : {}),
    ...(event.agentId !== undefined ? { agentId: event.agentId } : {}),
  };

  switch (event.category) {
    case 'graph': {
      if (event.name !== 'graph.node_completed') return;
      appendActivity(activityStore, clock, ctx.caseId, {
        ...shared,
        type: event.phase === 'start' ? 'specialist.started' : 'specialist.completed',
        phase: event.phase === 'start' ? 'active' : 'completed',
        summary: event.summary,
        // How long this specialist genuinely took, forwarded onto the
        // public stream so a consumer surface can freeze a running elapsed
        // time at the node's real duration rather than leaving the column
        // blank. `car-purchase-graph.ts` measures it across the node's own
        // real start/finish hooks and OMITS it when nothing measured that
        // node, so this spread carries a real figure or nothing at all --
        // never a zero and never an estimate.
        //
        // Safe to publish: a single integer millisecond count read from a
        // clock, with no string leaf a note, payload, header, or credential
        // could reach -- the same reasoning `event-normalizer.ts`'s
        // `CallMetrics` records for keeping `durationMs` out of
        // `redactValue`.
        ...(event.durationMs !== undefined
          ? { safeDetails: { durationMs: event.durationMs } }
          : {}),
      });
      return;
    }
    case 'skill': {
      appendActivity(activityStore, clock, ctx.caseId, {
        ...shared,
        type: 'skill.activated',
        phase: 'completed',
        summary: event.summary,
      });
      return;
    }
    case 'tool': {
      const type =
        event.phase === 'start'
          ? 'tool.started'
          : event.phase === 'error'
            ? 'tool.failed'
            : 'tool.completed';
      const phase =
        event.phase === 'start' ? 'active' : event.phase === 'error' ? 'failed' : 'completed';
      appendActivity(activityStore, clock, ctx.caseId, {
        ...shared,
        type,
        phase,
        summary: event.summary,
      });
      return;
    }
    case 'intervention': {
      if (event.name === 'intervention.guide') {
        appendActivity(activityStore, clock, ctx.caseId, {
          ...shared,
          type: 'intervention.guided',
          phase: 'completed',
          summary: event.summary,
        });
      } else if (event.name === 'intervention.confirm') {
        appendActivity(activityStore, clock, ctx.caseId, {
          ...shared,
          type: 'intervention.confirmation_required',
          phase: 'waiting',
          summary: event.summary,
        });
      }
      return;
    }
    default:
      return;
  }
}

/**
 * Drains the real Graph's `RuntimeEvent` stream as it progresses, writing
 * each event down two parallel, additive paths: the proven public
 * `ActivityStore` projection (`appendActivityForRuntimeEvent`, unchanged by
 * this task) and the real Runtime Inspector persistence path
 * (`runtimeEventStore.append`, this task's own gap-closing addition --
 * `db/schema.ts`'s `runtime_events` table had no writer before it). Every
 * yielded `RuntimeEvent` is already a fully-formed, correlated
 * `RuntimeDebugEvent` (traceId/sequence/category/etc. all stamped by
 * `car-purchase-graph.ts`'s own `RunAccumulator`) -- this function does not
 * re-derive or duplicate any of that, it only fans the same real event out
 * to both durable destinations.
 *
 * One real correction is applied before the `runtimeEventStore` write,
 * mirroring one `appendActivityForRuntimeEvent` already silently makes for
 * the `ActivityStore` write two lines below: each parallel specialist's
 * `ExecutionRequest.runId` (`car-purchase-scenario.ts`'s
 * `buildExecutionRequestFor`: `` `run-${obligationId}` ``) is a synthetic,
 * per-obligation id, not this trigger's actual durable `runs.id` --
 * `RunAccumulator.runId` (what every yielded `RuntimeEvent` is actually
 * stamped with) is `shortlistRequest.runId` specifically
 * (`'run-car.shortlist'`), one value shared by every node in a single Graph
 * run but still never the real `runs.id` a client queries via
 * `GET /api/debug/runs/:runId`. `appendActivityForRuntimeEvent` already
 * substitutes `ctx.runId`/`ctx.caseId` (the real ones this engine was
 * `trigger()`ed with) instead of trusting `event.runId`/`event.caseId` for
 * exactly this reason; persisting the *uncorrected* synthetic id to
 * `runtime_events` would both violate its real foreign key against
 * `runs.id` and silently collide round 1 with round 2 (both graph runs mint
 * the identical synthetic `'run-car.shortlist'`). Every other field --
 * `sequence`, `traceId` (genuinely fresh per real Graph invocation,
 * `car-purchase-graph.ts`'s own `deps.idGenerator.next('trace')`),
 * `category`/`name`/`phase`/`level`/`attributes`/`payload`/etc. -- is the
 * real, untouched value the Graph produced; nothing here is fabricated.
 *
 * `onTraceId` is handed the trace each persisted event actually carries,
 * so `runOneInvestigation` can record that same id -- not a second,
 * separately minted one -- on the `runs` row. See its doc comment there.
 */
interface DrainResult {
  readonly result: CarPurchaseGraphResult;
  /**
   * The highest `sequence` any drained `RuntimeEvent` used, or `-1` if the
   * Graph yielded none. `runOneInvestigation` uses `lastSequence + 1` as the
   * safe next sequence for this run's one additional, real
   * `case.state_changed` event (I3) -- guaranteed not to collide with any
   * sequence the Graph itself already used, since `RunAccumulator.sequence`
   * (`car-purchase-graph.ts`) is monotonic for the run's whole lifetime and
   * this event is appended only after the drain loop above has fully
   * finished.
   */
  readonly lastSequence: number;
}

async function drainGraphToActivity(
  gen: AsyncGenerator<RuntimeEvent, CarPurchaseGraphResult, undefined>,
  ctx: { caseId: string; runId: string },
  activityStore: ActivityStore,
  runtimeEventStore: RuntimeEventStore,
  clock: Clock,
  onTraceId: (traceId: string) => void,
): Promise<DrainResult> {
  let next = await gen.next();
  let lastSequence = -1;
  while (!next.done) {
    const persisted = runtimeEventStore.append({
      ...next.value,
      caseId: ctx.caseId,
      runId: ctx.runId,
    });
    onTraceId(persisted.traceId);
    appendActivityForRuntimeEvent(next.value, ctx, activityStore, clock, persisted.id);
    lastSequence = persisted.sequence;
    next = await gen.next();
  }
  return { result: next.value, lastSequence };
}

/**
 * The `ObligationTemplate` one confirmed extension derives, built from the
 * extension's own definition and (when the case has one) the criterion the
 * household added for it. Every field mirrors `command-service.ts`'s
 * `synthesizeUserConcernObligationTemplate`, which documents each choice at
 * length; the shapes are kept identical so a concern that reaches BOTH paths
 * converges on one obligation record rather than two rival descriptions of
 * the same question. Nothing here is invented from the pack: an unanticipated
 * concern has no installed skill or specialist, so both preference lists stay
 * empty rather than naming one that might not be able to investigate it.
 */
function caseExtensionObligationTemplate(
  extension: CaseExtension,
  criterion: Criterion | undefined,
): ObligationTemplate {
  const label = criterion?.label ?? extension.definition.label;
  return {
    id: caseExtensionObligationId(extension),
    label,
    question: criterion?.question ?? `What should be established about "${label}"?`,
    category: 'user_concern',
    required: true,
    // The household's own weight when it added a criterion; otherwise the
    // midpoint of the 0-100 scale, which asserts neither urgency nor
    // triviality about a concern nobody has weighted yet.
    priority: criterion?.weight ?? 50,
    requiredEvidenceLevel: 'E1',
    maxAttempts: 2,
    acceptedUncertaintyAllowed: true,
    dependsOn: [],
    preferredSkills: [],
    preferredSpecialists: [],
    completionRule: {
      minimumEvidenceLevel: 'E1',
      minimumIndependentSources: 0,
      acceptedUncertaintyAllowed: true,
    },
    origin: 'case_extension',
  };
}

/**
 * Derives and durably appends `case.<attributeId>` for every confirmed case
 * extension that does not already have its obligation, whatever that
 * attribute happens to be. See this file's header comment for why this is a
 * fallback rather than the primary derivation path.
 */
function ensureCaseExtensionObligations(
  deps: CarPurchaseEngineDeps,
  caseId: string,
  pack: CompiledDecisionPack,
  snapshot: CaseState,
  extensions: readonly CaseExtension[],
): CaseState {
  let current = snapshot;
  for (const extension of extensions) {
    const obligationId = caseExtensionObligationId(extension);
    if (current.obligations.some((obligation) => obligation.id === obligationId)) {
      continue;
    }
    const criterion = current.criteria.find(
      (entry) => entry.id === (extension.linkedCriterionId ?? extension.definition.id),
    );
    const template: CaseExtensionObligationTemplate = {
      template: caseExtensionObligationTemplate(extension, criterion),
      criterionId: extension.linkedCriterionId ?? extension.definition.id,
    };
    const nextObligations = deriveObligations(pack, [template], current.obligations, deps.clock);
    const derived = nextObligations.find((obligation) => obligation.id === obligationId);
    if (derived === undefined) {
      throw new Error(
        `car-purchase-engine: failed to derive the "${obligationId}" obligation for case "${caseId}"`,
      );
    }
    const event: CaseEvent = {
      eventId: deps.idGenerator.next('event'),
      caseId,
      sequence: current.eventSequence + 1,
      timestamp: deps.clock.now(),
      type: 'obligation.updated',
      payload: { obligation: derived },
    };
    const appended = deps.caseStore.append(caseId, [event], current.eventSequence);
    if (appended.status !== 'applied') {
      throw new Error(
        `car-purchase-engine: failed to append the derived "${obligationId}" obligation for case "${caseId}": status "${appended.status}"`,
      );
    }
    appendActivity(deps.activityStore, deps.clock, caseId, {
      obligationId,
      type: 'obligation.updated',
      phase: 'completed',
      summary: `Derived a case obligation for the household's confirmed concern: "${derived.label}".`,
    });
    current = appended.snapshot;
  }
  return current;
}

function scenarioDepsFrom(deps: CarPurchaseEngineDeps): CarPurchaseScenarioDeps {
  return { clock: deps.clock, idGenerator: deps.idGenerator, skillsRootDir: deps.skillsRootDir };
}

/**
 * Folds round 1: every parallel specialist plus `source-challenger`, then a
 * soft initial `recommendation.ready` lean (no proposal yet). Mirrors
 * `car-purchase-scenario.ts`'s own round-1 fold.
 *
 * Exported (mirroring `car-purchase-scenario.ts`'s own `drainGraph` export,
 * this task) purely so its defensive "the real Graph produced no result for
 * node X" throw guards can be unit-tested directly against a hand-built
 * `CarPurchaseGraphResult` -- a plain data object, not a Strands SDK
 * instance -- without needing to coerce the real Graph itself into omitting
 * a node's result.
 */
export function foldRound1(
  deps: CarPurchaseEngineDeps,
  caseId: string,
  graphResult: CarPurchaseGraphResult,
): CaseState {
  const scenarioDeps = scenarioDepsFrom(deps);
  const trajectory = emptyScenarioTrajectory();

  for (const specialistId of CAR_PURCHASE_PARALLEL_SPECIALIST_IDS) {
    const result = graphResult.executionResults[specialistId];
    if (result === undefined) {
      throw new Error(
        `car-purchase-engine: round1 produced no ExecutionResult for "${specialistId}" on case "${caseId}"`,
      );
    }
    const attemptsToRecord =
      specialistId === 'safety-reliability-analyst'
        ? 3
        : specialistId === 'household-fit-analyst'
          ? 2
          : 1;
    foldExecutionResult(
      deps.caseStore,
      deps.activityStore,
      caseId,
      result,
      scenarioDeps,
      trajectory,
      {
        attemptsToRecord,
      },
    );
  }

  const challenge = graphResult.executionResults['source-challenger'];
  if (challenge === undefined) {
    throw new Error(
      `car-purchase-engine: round1 produced no ExecutionResult for "source-challenger" on case "${caseId}"`,
    );
  }
  let snapshot = foldExecutionResult(
    deps.caseStore,
    deps.activityStore,
    caseId,
    challenge,
    scenarioDeps,
    trajectory,
    {
      attemptsToRecord: 0,
    },
  );

  if (graphResult.proposedRecommendation === undefined) {
    throw new Error(
      `car-purchase-engine: round1 decision-synthesizer never called propose_recommendation for case "${caseId}"`,
    );
  }
  const sourceIds = extractCitedSourceIds(graphResult.decisionSynthesizerText);
  ensureSourcesExist(deps.caseStore, caseId, snapshot.eventSequence, sourceIds, deps.clock);
  snapshot = loadSnapshotOrThrow(deps.caseStore, caseId);

  const favoredOptionId = graphResult.proposedRecommendation.candidateIds[0] ?? null;
  // Change-set §34 / DoD item 34: `rationale` is rendered verbatim to the
  // user by `RecommendationCard.tsx`, so every raw `candidate-*`/`source-*`
  // token in the synthesizer's text has to become the real label or
  // publisher the case already carries. Ordering is load-bearing and is
  // documented on `humanizeDecisionText` itself: this must run AFTER
  // `extractCitedSourceIds` above, because humanizing removes the very
  // tokens that function matches on.
  const rationale = humanizeDecisionText(
    graphResult.decisionSynthesizerText,
    entityLabelsById(snapshot.entities),
  );
  // The model proposed `favoredOptionId`; the deterministic scoreboard
  // supplies the numbers attached to it. When the two disagree, the
  // proposal stands but `limitations` says so outright and confidence is
  // capped -- see recommendation-scoring.ts for why neither silently
  // overwriting nor silently accepting is acceptable here.
  const scored = deriveScoredRecommendationFields(snapshot, favoredOptionId);
  const recommendationEvent: CaseEvent = {
    eventId: deps.idGenerator.next('event'),
    caseId,
    sequence: snapshot.eventSequence + 1,
    timestamp: deps.clock.now(),
    type: 'recommendation.ready',
    payload: {
      recommendation: {
        id: deps.idGenerator.next('rec'),
        status: 'ready',
        favoredOptionId,
        rationale,
        facts: scored.facts,
        hypotheses: [],
        confidence: scored.confidence,
        limitations: mergeLimitations(
          ["The favored candidate's deal terms are still under review."],
          scored.limitations,
        ),
        sourceIds,
        resolvedObligationIds: [],
        acceptedUncertaintyObligationIds: [],
        generatedAt: deps.clock.now(),
      },
    },
  };
  const appended = deps.caseStore.append(caseId, [recommendationEvent], snapshot.eventSequence);
  if (appended.status !== 'applied') {
    throw new Error(
      `car-purchase-engine: failed to record the round1 recommendation for case "${caseId}": status "${appended.status}"`,
    );
  }
  appendActivity(deps.activityStore, deps.clock, caseId, {
    type: 'recommendation.ready',
    phase: 'completed',
    summary: `Initial recommendation ready${favoredOptionId !== null ? `: favoring "${favoredOptionId}"` : ''}.`,
  });
  return appended.snapshot;
}

/**
 * Folds round 2: supersedes stale round-1 evidence, folds the revised
 * specialist results, resolves `car.hard_constraints`/`car.shortlist`
 * deterministically, records the revised recommendation, and creates (never
 * approves) the decision proposal. Mirrors `car-purchase-scenario.ts`'s own
 * round-2 fold.
 *
 * Exported for the same direct-unit-testability reason as `foldRound1`
 * above.
 */
export function foldRound2(
  deps: CarPurchaseEngineDeps,
  caseId: string,
  pack: CompiledDecisionPack,
  graphResult: CarPurchaseGraphResult,
): CaseState {
  const scenarioDeps = scenarioDepsFrom(deps);
  const trajectory = emptyScenarioTrajectory();

  let snapshot = loadSnapshotOrThrow(deps.caseStore, caseId);
  // The concerns this case actually gained and a human actually accepted --
  // the same signal `determineCarPurchaseRound` used to decide a round-2 pass
  // is underway. Never one hardcoded attribute id: fabricating the demo's own
  // dog-crate obligation onto a case that raised a different concern would put
  // a question nobody asked in front of the household.
  const extensions = confirmedCaseExtensions(snapshot);
  snapshot = ensureCaseExtensionObligations(deps, caseId, pack, snapshot, extensions);
  // Round 2 runs one household-fit investigation, so its result is folded
  // against one obligation: the first accepted concern in case order. Any
  // further accepted concerns keep their own derived obligations open, which
  // is the honest state for a question nothing investigated
  // (packs-and-routing.md "Unsupported concerns remain explicit unknowns").
  const investigatedExtensionObligationId =
    extensions[0] !== undefined ? caseExtensionObligationId(extensions[0]) : undefined;

  const dealResult = graphResult.executionResults['deal-analyst'];
  if (dealResult === undefined) {
    throw new Error(
      `car-purchase-engine: round2 produced no ExecutionResult for "deal-analyst" on case "${caseId}"`,
    );
  }

  const staleLinks = snapshot.evidenceLinks.filter(
    (link) => link.sourceId === TEASER_PRICE_SOURCE_ID && !link.stale,
  );
  if (staleLinks.length > 0) {
    const markStaleEvents: CaseEvent[] = staleLinks.map((link, index) => ({
      eventId: deps.idGenerator.next('event'),
      caseId,
      sequence: snapshot.eventSequence + 1 + index,
      timestamp: deps.clock.now(),
      type: 'evidence.conflicted',
      payload: {
        evidenceLink: { ...link, stale: true, updatedAt: deps.clock.now() },
        conflictingEvidenceIds: [],
      },
    }));
    const staleAppend = deps.caseStore.append(caseId, markStaleEvents, snapshot.eventSequence);
    if (staleAppend.status !== 'applied') {
      throw new Error(
        `car-purchase-engine: failed to supersede round1 teaser-price evidence for case "${caseId}": status "${staleAppend.status}"`,
      );
    }
    snapshot = staleAppend.snapshot;
    appendActivity(deps.activityStore, deps.clock, caseId, {
      type: 'evidence.conflicted',
      phase: 'completed',
      summary: `Superseded ${staleLinks.length} round-1 evidence link(s) with the final round-2 comparison.`,
    });
  }

  snapshot = foldExecutionResult(
    deps.caseStore,
    deps.activityStore,
    caseId,
    dealResult,
    scenarioDeps,
    trajectory,
    {
      attemptsToRecord: 1,
    },
  );

  const householdFitResult = graphResult.executionResults['household-fit-analyst'];
  if (householdFitResult === undefined) {
    throw new Error(
      `car-purchase-engine: round2 produced no ExecutionResult for "household-fit-analyst" on case "${caseId}"`,
    );
  }
  snapshot = foldExecutionResult(
    deps.caseStore,
    deps.activityStore,
    caseId,
    householdFitResult,
    scenarioDeps,
    trajectory,
    {
      attemptsToRecord: 2,
      // Routes the round-2 household-fit findings to this case's own accepted
      // concern. With no accepted concern the result stays on the obligation
      // it was produced for, rather than being attached to one that does not
      // exist on this case.
      ...(investigatedExtensionObligationId !== undefined
        ? { obligationIdOverride: investigatedExtensionObligationId }
        : {}),
    },
  );

  const challengeResult = graphResult.executionResults['source-challenger'];
  if (challengeResult === undefined) {
    throw new Error(
      `car-purchase-engine: round2 produced no ExecutionResult for "source-challenger" on case "${caseId}"`,
    );
  }
  snapshot = foldExecutionResult(
    deps.caseStore,
    deps.activityStore,
    caseId,
    challengeResult,
    scenarioDeps,
    trajectory,
    {
      attemptsToRecord: 0,
    },
  );

  // car.hard_constraints: deterministic core-level resolution, not a Graph
  // node (see this file's header comment / car-purchase-scenario.ts's
  // identical rationale).
  ensureSourcesExist(
    deps.caseStore,
    caseId,
    snapshot.eventSequence,
    [TEASER_PRICE_SOURCE_ID],
    deps.clock,
  );
  snapshot = loadSnapshotOrThrow(deps.caseStore, caseId);
  const hardConstraintsEvidence: EvidenceLink = {
    id: deps.idGenerator.next('ev'),
    obligationId: 'car.hard_constraints',
    sourceId: TEASER_PRICE_SOURCE_ID,
    level: 'E1',
    verdict: 'pass',
    disposition: 'included',
    summary: HARD_CONSTRAINTS_SUMMARY,
    stale: false,
    createdAt: deps.clock.now(),
    updatedAt: deps.clock.now(),
  };
  const hcEvent: CaseEvent = {
    eventId: deps.idGenerator.next('event'),
    caseId,
    sequence: snapshot.eventSequence + 1,
    timestamp: deps.clock.now(),
    type: 'evidence.accepted',
    payload: { evidenceLink: hardConstraintsEvidence },
  };
  const hcAppend = deps.caseStore.append(caseId, [hcEvent], snapshot.eventSequence);
  if (hcAppend.status !== 'applied') {
    throw new Error(
      `car-purchase-engine: failed to record car.hard_constraints evidence for case "${caseId}": status "${hcAppend.status}"`,
    );
  }
  snapshot = foldExecutionResult(
    deps.caseStore,
    deps.activityStore,
    caseId,
    {
      obligationId: 'car.hard_constraints',
      disposition: 'evidence_found',
      claims: [],
      evidenceResults: [],
      limitations: [],
      suggestedStatus: 'satisfied',
    },
    scenarioDeps,
    trajectory,
    { attemptsToRecord: 1 },
  );

  if (graphResult.proposedRecommendation === undefined) {
    throw new Error(
      `car-purchase-engine: round2 decision-synthesizer never called propose_recommendation for case "${caseId}"`,
    );
  }
  const shortlistSourceIds = extractCitedSourceIds(graphResult.decisionSynthesizerText);
  ensureSourcesExist(
    deps.caseStore,
    caseId,
    snapshot.eventSequence,
    shortlistSourceIds,
    deps.clock,
  );
  snapshot = foldExecutionResult(
    deps.caseStore,
    deps.activityStore,
    caseId,
    {
      obligationId: 'car.shortlist',
      disposition: 'evidence_found',
      claims: [
        {
          statement: graphResult.decisionSynthesizerText,
          stance: 'supports',
          confidence: 0.85,
          sourceIds: shortlistSourceIds,
        },
      ],
      evidenceResults: shortlistSourceIds.map((sourceId) => ({
        sourceId,
        level: 'E2' as const,
        verdict: 'pass' as const,
        summary: 'Cited in the final shortlist synthesis.',
      })),
      limitations: [],
      suggestedStatus: 'satisfied',
    },
    scenarioDeps,
    trajectory,
    { attemptsToRecord: 1 },
  );

  const favoredOptionId = graphResult.proposedRecommendation.candidateIds[0] ?? null;
  // Same §34 consumer-text rule as round 1 above. Round 2's snapshot is the
  // post-fold one, so `entityLabelsById` resolves against the current
  // entities rather than a stale pre-run copy.
  const rationale = humanizeDecisionText(
    graphResult.decisionSynthesizerText,
    entityLabelsById(snapshot.entities),
  );
  // The model proposed `favoredOptionId`; the deterministic scoreboard
  // supplies the numbers attached to it. When the two disagree, the
  // proposal stands but `limitations` says so outright and confidence is
  // capped -- see recommendation-scoring.ts for why neither silently
  // overwriting nor silently accepting is acceptable here.
  const scored = deriveScoredRecommendationFields(snapshot, favoredOptionId);
  const recommendationEvent: CaseEvent = {
    eventId: deps.idGenerator.next('event'),
    caseId,
    sequence: snapshot.eventSequence + 1,
    timestamp: deps.clock.now(),
    type: 'recommendation.ready',
    payload: {
      recommendation: {
        id: deps.idGenerator.next('rec'),
        status: 'ready',
        favoredOptionId,
        rationale,
        facts: scored.facts,
        hypotheses: [],
        confidence: scored.confidence,
        // Measured from this case's own attribute records and named from its
        // own labels -- see deriveUnestablishedAttributeLimitations for what
        // these replaced and why. Merged ahead of the scoreboard's derived
        // lines as before; the difference is that these are now true when
        // stated, and disappear entirely once a column is populated.
        limitations: mergeLimitations(
          deriveUnestablishedAttributeLimitations(snapshot, pack),
          scored.limitations,
        ),
        sourceIds: shortlistSourceIds,
        resolvedObligationIds: [
          'car.hard_constraints',
          'car.deal_normalization',
          'car.ownership_cost',
          'car.household_fit',
          // Only the concern round 2 actually folded evidence against is
          // claimed as resolved.
          ...(investigatedExtensionObligationId !== undefined
            ? [investigatedExtensionObligationId]
            : []),
          'car.shortlist',
        ],
        acceptedUncertaintyObligationIds: ['car.safety_reliability'],
        generatedAt: deps.clock.now(),
      },
    },
  };
  const recAppend = deps.caseStore.append(caseId, [recommendationEvent], snapshot.eventSequence);
  if (recAppend.status !== 'applied') {
    throw new Error(
      `car-purchase-engine: failed to record the round2 recommendation for case "${caseId}": status "${recAppend.status}"`,
    );
  }
  snapshot = recAppend.snapshot;
  appendActivity(deps.activityStore, deps.clock, caseId, {
    type: 'recommendation.ready',
    phase: 'completed',
    summary: `Revised recommendation ready${favoredOptionId !== null ? `: favoring "${favoredOptionId}"` : ''}.`,
  });

  // Sift proposes; only a human may approve via the separate `reviewProposal`
  // command (never called here -- see this file's header comment).
  const proposalEvent: CaseEvent = {
    eventId: deps.idGenerator.next('event'),
    caseId,
    sequence: snapshot.eventSequence + 1,
    timestamp: deps.clock.now(),
    type: 'proposal.proposed',
    payload: {
      proposal: {
        id: deps.idGenerator.next('proposal'),
        recommendationId: recommendationEvent.payload.recommendation.id,
        status: 'pending',
        createdAt: deps.clock.now(),
      },
    },
  };
  const proposalAppend = deps.caseStore.append(caseId, [proposalEvent], snapshot.eventSequence);
  if (proposalAppend.status !== 'applied') {
    throw new Error(
      `car-purchase-engine: failed to create the decision proposal for case "${caseId}": status "${proposalAppend.status}"`,
    );
  }
  appendActivity(deps.activityStore, deps.clock, caseId, {
    type: 'intervention.confirmation_required',
    phase: 'waiting',
    summary: 'A revised decision proposal is awaiting human review.',
  });
  return proposalAppend.snapshot;
}

async function runOneInvestigation(
  params: { caseId: string; runId: string; obligationId: string },
  deps: CarPurchaseEngineDeps,
): Promise<void> {
  try {
    const initialSnapshot = deps.caseStore.load(params.caseId);
    if (initialSnapshot === undefined) {
      throw new Error(`car-purchase-engine: case "${params.caseId}" was not found`);
    }
    const pack = deps.registry.get(initialSnapshot.pack.id, initialSnapshot.pack.version);
    if (pack === undefined) {
      throw new Error(
        `car-purchase-engine: pinned pack "${initialSnapshot.pack.id}@${initialSnapshot.pack.version}" is not registered`,
      );
    }

    // A catalog-built case (startCase + upsertOption) fails fast and
    // honestly here, before any scripted round/graph work starts -- see
    // isDeterministicCarPurchaseDemoCase's own doc comment and
    // docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md
    // "Decision" §4. This is a deliberate, disclosed scope boundary, not a
    // crash and not a fabricated result built around a fixture the case has
    // no real relationship to.
    if (!isDeterministicCarPurchaseDemoCase(initialSnapshot)) {
      const message =
        'Guided investigation currently runs only against the deterministic example case. ' +
        "This case's vehicles were added directly — you can still compare them, add your own " +
        'criteria, submit your own sources, and record findings yourself; automated ' +
        "investigation for custom shortlists isn't available yet.";
      deps.runStore.updateStatus(params.runId, {
        status: 'failed',
        updatedAt: deps.clock.now(),
        result: { error: message },
      });
      appendActivity(deps.activityStore, deps.clock, params.caseId, {
        runId: params.runId,
        obligationId: params.obligationId,
        type: 'run.failed',
        phase: 'failed',
        summary: message,
      });
      return;
    }

    const round = determineCarPurchaseRound(initialSnapshot);

    deps.runStore.updateStatus(params.runId, {
      status: 'running',
      updatedAt: deps.clock.now(),
    });
    appendActivity(deps.activityStore, deps.clock, params.caseId, {
      runId: params.runId,
      obligationId: params.obligationId,
      type: 'run.started',
      phase: 'active',
      summary: `Investigation started (${round === 'round1' ? 'initial' : 'revised'} pass).`,
    });

    const providers = buildCarPurchaseScriptedProviders();
    setScenarioBeat(providers, round);
    const graphDeps = buildGraphDeps(initialSnapshot, pack, providers, scenarioDepsFrom(deps));

    // --- One trace per run, not two. The Runtime Inspector's Overview
    // renders `runs.trace_id` under "Trace"; the Timeline below it renders
    // `runtime_events`, every one of which is stamped with the trace the
    // real Graph mints internally (`car-purchase-graph.ts`'s
    // `RunAccumulator.traceId`). This engine used to mint a *second*,
    // unrelated `trace-*` id for the run row, so the id on screen matched
    // no event anywhere -- a correlation field that correlated to nothing.
    // The Graph's id is the canonical one (the events are the thing being
    // identified), so the run row now records the id its own events carry,
    // written as soon as the first event is persisted: an in-flight run
    // shows a usable trace, and so does a run that later fails mid-drain.
    let recordedTraceId: string | undefined;
    const recordTraceId = (candidate: string): string => {
      if (recordedTraceId === undefined) {
        recordedTraceId = candidate;
        deps.runStore.updateStatus(params.runId, {
          status: 'running',
          updatedAt: deps.clock.now(),
          traceId: candidate,
        });
      }
      return recordedTraceId;
    };

    const { result: graphResult, lastSequence } = await drainGraphToActivity(
      executeCarPurchaseGraph(graphDeps),
      { caseId: params.caseId, runId: params.runId },
      deps.activityStore,
      deps.runtimeEventStore,
      deps.clock,
      recordTraceId,
    );

    const finalSnapshot =
      round === 'round1'
        ? foldRound1(deps, params.caseId, graphResult)
        : foldRound2(deps, params.caseId, pack, graphResult);

    // --- I3: one real, whole-run before/after case-state diff (see
    // event-normalizer.ts's normalizeCaseStateChange doc comment for why
    // this is a whole-run diff, not a per-CaseEvent one). Skipped only when
    // the run genuinely changed nothing (never expected for a completed
    // investigation, but a defensive guard against a vacuous event). ---
    const stateDiff = diffJsonValues(initialSnapshot, finalSnapshot);
    if (stateDiff.length > 0) {
      deps.runtimeEventStore.append(
        normalizeCaseStateChange(
          { stateDiff },
          {
            // The same one trace the run row and every other event for
            // this run carry. A trace is minted here only if the Graph
            // yielded no events at all (never expected) -- and
            // `recordTraceId` puts that id on the run row too, so the
            // Overview's "Trace" still names this run's one event rather
            // than nothing.
            traceId: recordedTraceId ?? recordTraceId(deps.idGenerator.next('trace')),
            caseId: params.caseId,
            runId: params.runId,
            obligationId: params.obligationId,
          },
          lastSequence + 1,
        ),
      );
    }

    deps.runStore.updateStatus(params.runId, {
      status: 'completed',
      updatedAt: deps.clock.now(),
      result: { round, favoredOptionId: finalSnapshot.recommendation?.favoredOptionId ?? null },
    });
    appendActivity(deps.activityStore, deps.clock, params.caseId, {
      runId: params.runId,
      type: 'run.completed',
      phase: 'completed',
      summary: `Investigation completed (${round === 'round1' ? 'initial' : 'revised'} pass).`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Logged unconditionally first (the same last-resort pattern app.ts's
    // own top-level error middleware uses) -- the run must never silently
    // stay "running"/"queued" forever, and there must always be a real,
    // inspectable trace of what happened (CLAUDE.md "never hang forever or
    // silently swallow the failure"). The two durable writes below are
    // still attempted best-effort (most failures leave both perfectly
    // writable), but neither is guaranteed: a case that no longer exists at
    // all (e.g. deleted mid-run by a concurrent `resetDemo`) makes both the
    // `runs` and `activity_events` foreign keys unsatisfiable, in which case
    // this console line is the only surviving trace.
    console.error(
      `[sift] car-purchase-engine: run "${params.runId}" for case "${params.caseId}" failed: ${message}`,
    );
    try {
      deps.runStore.updateStatus(params.runId, {
        status: 'failed',
        updatedAt: deps.clock.now(),
        result: { error: message },
      });
    } catch (updateError) {
      console.error(
        `[sift] car-purchase-engine: failed to record run "${params.runId}" as failed:`,
        updateError,
      );
    }
    try {
      appendActivity(deps.activityStore, deps.clock, params.caseId, {
        runId: params.runId,
        obligationId: params.obligationId,
        type: 'run.failed',
        phase: 'failed',
        summary: `Investigation failed: ${message}`,
      });
    } catch (activityError) {
      console.error(
        `[sift] car-purchase-engine: failed to append a run.failed activity event for run "${params.runId}":`,
        activityError,
      );
    }
  }
}

/**
 * Builds the live `car-purchase` `InvestigationEngine`. `RunService` looks
 * this up by pack id (`server.ts` registers it under `'car-purchase'`) and
 * fires `trigger` after durably accepting a run, without ever awaiting it.
 */
export function createCarPurchaseEngine(deps: CarPurchaseEngineDeps): CarPurchaseEngine {
  const inFlightByCase = new Map<string, Promise<void>>();

  function trigger(params: { caseId: string; runId: string; obligationId: string }): Promise<void> {
    const priorInFlight = inFlightByCase.get(params.caseId) ?? Promise.resolve();
    // `runOneInvestigation` never rejects (its own internal try/catch turns
    // every failure into a `RunStore`/`ActivityStore` state transition
    // instead), so this chain never needs a `.catch` to keep queued runs
    // for the same case from being abandoned by an earlier one's failure.
    const thisRun = priorInFlight.then(() => runOneInvestigation(params, deps));
    inFlightByCase.set(params.caseId, thisRun);
    void thisRun.finally(() => {
      if (inFlightByCase.get(params.caseId) === thisRun) {
        inFlightByCase.delete(params.caseId);
      }
    });
    return thisRun;
  }

  return { trigger };
}

// Re-exported so a caller that only imports this module still has the
// concrete `RunStatus` vocabulary `runStore.load(...).status` returns.
export type { RunStatus };
