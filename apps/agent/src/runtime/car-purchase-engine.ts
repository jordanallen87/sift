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
 * --- Round-1-vs-round-2 state detection (the one genuinely new judgment
 * call this task adds) ---
 *
 * `scripted-beats/car-purchase.ts`'s scenario-only `setScenarioBeat` flips
 * every scripted provider between `'round1'`/`'round2'` from an external
 * call the test harness controls. A live trigger has no such caller -- the
 * round must be read from the case's own persisted state. The signal used
 * is exactly the one CLAUDE.md's task brief for this file names: whether
 * the household's `custom.dog_crate_fit` case extension has been
 * **confirmed** (`extension.definition.confirmation === 'confirmed'`,
 * `command-service.ts`'s `reviewCaseExtension`) -- the one durable fact that
 * is true if and only if the household has already gone through the
 * WebMCP-driven "two dog crates" concern-and-criteria-reweight beat this
 * demo's round 2 investigates. A *pending* (not yet human-reviewed) or
 * *rejected* extension is deliberately still `round1`: round 2's dog-crate
 * household-fit investigation and hard-constraint disqualification only
 * make sense once a human has actually accepted the concern as real.
 *
 * This does not depend on the derived `case.custom.dog_crate_fit`
 * *obligation* existing yet, because nothing durably creates it before this
 * engine runs: `command-service.ts`'s own header comment documents that
 * `updateCriteria`/`defineCaseAttribute` do not derive a case obligation for
 * a newly-added user concern (a real, separately-documented, deliberately
 * deferred gap in that file, not fixed here). This engine closes exactly
 * the missing-obligation half of that gap for its own round-2 trigger,
 * once it has already independently decided a round-2 run is underway:
 * `ensureDogCrateObligation` derives and durably appends
 * `case.custom.dog_crate_fit` (reusing `dogCrateObligationTemplate` and
 * `@pax/core`'s `deriveObligations`, exactly like `car-purchase-scenario.ts`
 * does inline) if it is not already present, before folding round 2's
 * `household-fit-analyst` result against it. It deliberately does not also
 * add `linkedCriterionId`/`linkedObligationId` back onto the `CaseExtension`
 * record itself (a cosmetic completion of the same documented gap,
 * genuinely out of this task's scope) -- see the dated `docs/build-log.md`
 * entry for this task.
 */
import type {
  CaseEvent,
  CaseState,
  CompiledDecisionPack,
  EvidenceLink,
  PublicActivityEventType,
  PublicActivityPhase,
} from '@pax/contracts';
import {
  deriveObligations,
  type CaseExtensionObligationTemplate,
  type Clock,
  type IdGenerator,
} from '@pax/core';
import type { PackRegistry } from '@pax/packs';
import { emptyScenarioTrajectory } from '@pax/scenarios';
import type { RunStatus } from '../db/schema.js';
import type { InvestigationEngine, RunStore } from '../services/run-service.js';
import type { ActivityStore } from '../store/activity-store.js';
import type { CaseStore } from '../store/case-store.js';
import type { RuntimeEventStore } from '../store/runtime-event-store.js';
import {
  CAR_PURCHASE_PARALLEL_SPECIALIST_IDS,
  executeCarPurchaseGraph,
  type CarPurchaseGraphResult,
} from './car-purchase-graph.js';
import {
  buildGraphDeps,
  dogCrateObligationTemplate,
  ensureSourcesExist,
  extractCitedSourceIds,
  foldExecutionResult,
  loadSnapshotOrThrow,
  type CarPurchaseScenarioDeps,
} from './car-purchase-scenario.js';
import type { RuntimeEvent } from './event-normalizer.js';
import {
  buildCarPurchaseScriptedProviders,
  DOG_CRATE_FIT_OBLIGATION_ID,
  setScenarioBeat,
  type CarPurchaseScenarioBeat,
} from './scripted-beats/car-purchase.js';

/** The typed `custom.*` case-attribute id the household's confirmed two-dog-crate concern is defined under (`command-service.ts` `defineCaseAttribute`). See this file's header comment. */
export const DOG_CRATE_EXTENSION_ID = 'custom.dog_crate_fit';

/** The real `source-dealer-offer-candidate-rav4` teaser-price evidence link(s) round 2 supersedes -- see `car-purchase-scenario.ts`'s identical rationale at its own round-2 fold. */
const TEASER_PRICE_SOURCE_ID = 'source-dealer-offer-candidate-rav4';

const HARD_CONSTRAINTS_SUMMARY =
  'Every candidate meets the household feature requirements (AWD, adaptive cruise, blind-spot monitoring, forward collision warning, 2 LATCH anchors). candidate-crv, candidate-cx5, and candidate-outback meet the maximum-budget requirement; candidate-rav4 does not.';

/**
 * Pure round detection from real case state. See this file's header comment
 * for the full reasoning. Exported directly for a fast, focused unit test
 * independent of running the real Graph.
 */
export function determineCarPurchaseRound(caseState: CaseState): CarPurchaseScenarioBeat {
  const dogCrateConfirmed = caseState.caseExtensions.some(
    (extension) =>
      extension.definition.id === DOG_CRATE_EXTENSION_ID &&
      extension.definition.confirmation === 'confirmed',
  );
  return dogCrateConfirmed ? 'round2' : 'round1';
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
    type: PublicActivityEventType;
    phase: PublicActivityPhase;
    summary: string;
  },
): void {
  activityStore.append({
    timestamp: clock.now(),
    caseId,
    ...(fields.runId !== undefined ? { runId: fields.runId } : {}),
    ...(fields.obligationId !== undefined ? { obligationId: fields.obligationId } : {}),
    ...(fields.agentId !== undefined ? { agentId: fields.agentId } : {}),
    type: fields.type,
    phase: fields.phase,
    summary: fields.summary,
  });
}

/**
 * Translates one normalized `RuntimeEvent` (`event-normalizer.ts`) from the
 * live Graph run into the matching public `ActivityStore` event, if the
 * normal workspace's public vocabulary (`@pax/contracts`
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
): void {
  const shared = {
    runId: ctx.runId,
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
 */
async function drainGraphToActivity(
  gen: AsyncGenerator<RuntimeEvent, CarPurchaseGraphResult, undefined>,
  ctx: { caseId: string; runId: string },
  activityStore: ActivityStore,
  runtimeEventStore: RuntimeEventStore,
  clock: Clock,
): Promise<CarPurchaseGraphResult> {
  let next = await gen.next();
  while (!next.done) {
    runtimeEventStore.append({ ...next.value, caseId: ctx.caseId, runId: ctx.runId });
    appendActivityForRuntimeEvent(next.value, ctx, activityStore, clock);
    next = await gen.next();
  }
  return next.value;
}

/** Derives and durably appends `case.custom.dog_crate_fit` if it is not already present. See this file's header comment. */
function ensureDogCrateObligation(
  deps: CarPurchaseEngineDeps,
  caseId: string,
  pack: CompiledDecisionPack,
  snapshot: CaseState,
): CaseState {
  if (snapshot.obligations.some((obligation) => obligation.id === DOG_CRATE_FIT_OBLIGATION_ID)) {
    return snapshot;
  }
  const template: CaseExtensionObligationTemplate = {
    template: dogCrateObligationTemplate(),
    criterionId: DOG_CRATE_EXTENSION_ID,
  };
  const nextObligations = deriveObligations(pack, [template], snapshot.obligations, deps.clock);
  const derived = nextObligations.find(
    (obligation) => obligation.id === DOG_CRATE_FIT_OBLIGATION_ID,
  );
  if (derived === undefined) {
    throw new Error(
      `car-purchase-engine: failed to derive the "${DOG_CRATE_FIT_OBLIGATION_ID}" obligation for case "${caseId}"`,
    );
  }
  const event: CaseEvent = {
    eventId: deps.idGenerator.next('event'),
    caseId,
    sequence: snapshot.eventSequence + 1,
    timestamp: deps.clock.now(),
    type: 'obligation.updated',
    payload: { obligation: derived },
  };
  const appended = deps.caseStore.append(caseId, [event], snapshot.eventSequence);
  if (appended.status !== 'applied') {
    throw new Error(
      `car-purchase-engine: failed to append the derived "${DOG_CRATE_FIT_OBLIGATION_ID}" obligation for case "${caseId}": status "${appended.status}"`,
    );
  }
  appendActivity(deps.activityStore, deps.clock, caseId, {
    obligationId: DOG_CRATE_FIT_OBLIGATION_ID,
    type: 'obligation.updated',
    phase: 'completed',
    summary: `Derived a case obligation for the household's confirmed concern: "${derived.label}".`,
  });
  return appended.snapshot;
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
        rationale: graphResult.decisionSynthesizerText,
        facts: [],
        hypotheses: [],
        confidence: 0.75,
        limitations: ["The favored candidate's deal terms are still under review."],
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
  snapshot = ensureDogCrateObligation(deps, caseId, pack, snapshot);

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
    { attemptsToRecord: 2, obligationIdOverride: DOG_CRATE_FIT_OBLIGATION_ID },
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
        rationale: graphResult.decisionSynthesizerText,
        facts: [],
        hypotheses: [],
        confidence: 0.85,
        limitations: [
          'Whether both dog crates fit behind the second row remains unverified for every candidate.',
          'Driving comfort remains unverified for every candidate.',
        ],
        sourceIds: shortlistSourceIds,
        resolvedObligationIds: [
          'car.hard_constraints',
          'car.deal_normalization',
          'car.ownership_cost',
          'car.household_fit',
          DOG_CRATE_FIT_OBLIGATION_ID,
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

  // Pax proposes; only a human may approve via the separate `reviewProposal`
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

    const round = determineCarPurchaseRound(initialSnapshot);
    const traceId = deps.idGenerator.next('trace');

    deps.runStore.updateStatus(params.runId, {
      status: 'running',
      updatedAt: deps.clock.now(),
      traceId,
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

    const graphResult = await drainGraphToActivity(
      executeCarPurchaseGraph(graphDeps),
      { caseId: params.caseId, runId: params.runId },
      deps.activityStore,
      deps.runtimeEventStore,
      deps.clock,
    );

    const finalSnapshot =
      round === 'round1'
        ? foldRound1(deps, params.caseId, graphResult)
        : foldRound2(deps, params.caseId, pack, graphResult);

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
      `[pax] car-purchase-engine: run "${params.runId}" for case "${params.caseId}" failed: ${message}`,
    );
    try {
      deps.runStore.updateStatus(params.runId, {
        status: 'failed',
        updatedAt: deps.clock.now(),
        result: { error: message },
      });
    } catch (updateError) {
      console.error(
        `[pax] car-purchase-engine: failed to record run "${params.runId}" as failed:`,
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
        `[pax] car-purchase-engine: failed to append a run.failed activity event for run "${params.runId}":`,
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
