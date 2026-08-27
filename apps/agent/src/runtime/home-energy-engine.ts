/**
 * The real, live, asynchronously-triggered Strands adapter for the
 * `home-energy-guardian` pack -- the Swarm-hero analog of
 * `car-purchase-engine.ts`. Before this file existed, `home-energy-guardian`
 * was never compiled or registered at boot (`server.ts` only ever wired
 * `car-purchase`), so `POST /api/cases/demo {demoId:
 * "home-energy-guardian"}` had no installed pack to resolve against at all
 * -- a real browser session clicking "Investigate my energy bill" hit a dead
 * end before a case could even be created, let alone investigated. This
 * closes that gap for the live server, without touching the already-proven
 * standalone Swarm construction/behavior (`home-energy-swarm.ts`,
 * `home-energy-swarm.test.ts`) or the untouched car-purchase live path.
 *
 * `createHomeEnergyEngine(deps).trigger(...)` is the one entry point,
 * mirroring `createCarPurchaseEngine`'s five responsibilities exactly:
 *
 *  1. determines whether this is `round1` or `round2` purely from the
 *     case's own current, real state (`determineHomeEnergyRound` below);
 *  2. builds the real `HomeEnergySwarmDeps` for the six-node Swarm from the
 *     live case snapshot (`buildHomeEnergySwarmDepsFromCase` below -- see
 *     that function's own comment for why this, not a car-purchase-style
 *     exported `buildGraphDeps`, is this task's version of "genuinely reuse
 *     the case-to-deps construction logic rather than re-deriving it from
 *     scratch");
 *  3. runs the real bounded `executeHomeEnergySwarm`, streaming every
 *     `RuntimeEvent` it yields into the real `ActivityStore` AS THE SWARM
 *     PROGRESSES (`drainSwarmToActivity` below) and, additively, into the
 *     real Runtime Inspector persistence path (`RuntimeEventStore`) --
 *     structurally the same two-destination fan-out
 *     `car-purchase-engine.ts`'s own `drainGraphToActivity` performs, but a
 *     genuinely parallel implementation here (not an import): that
 *     function's own signature is hard-typed to `CarPurchaseGraphResult`
 *     (the Graph's return shape) and its public-activity mapping switches
 *     on `category: 'graph'`, which this Swarm's `RuntimeEvent` stream never
 *     emits (it emits `category: 'swarm'` instead -- `swarm.node_started`/
 *     `swarm.node_completed`/`swarm.handoff`/`swarm.cycle_detected`/
 *     `swarm.timeout`, none of which `car-purchase-engine.ts` needs to
 *     handle). Neither file may be edited to generalize the other (this
 *     task's scope explicitly excludes touching `car-purchase-engine.ts`),
 *     so this is the documented "genuinely pack-specific, parallel
 *     implementation" case CLAUDE.md's task brief for this file
 *     anticipated;
 *  4. folds every specialist's validated context/final synthesis into real
 *     `CaseEvent`s via `car-purchase-scenario.ts`'s own exported, fully
 *     generic `foldExecutionResult`/`ensureSourcesExist`/
 *     `loadSnapshotOrThrow`/`extractCitedSourceIds`/`buildExecutionRequestFor`
 *     helpers -- read-only imports, genuinely reused rather than
 *     copy-pasted (none of those five functions reference anything
 *     car-purchase-specific; they operate purely on `@pax/contracts`
 *     types, `CaseStore`, and `ActivityStore`, exactly like this file's own
 *     `foldHomeEnergyRound1`/`foldHomeEnergyRound2` need);
 *  5. on completion, records the round's recommendation, and (round 2 only,
 *     and only when `decision-synthesizer` genuinely called
 *     `propose_inspection`) the pending inspection proposal -- deliberately
 *     never auto-approved, identical to car-purchase's own posture:
 *     `reviewProposal` is a separate command a human issues through the
 *     normal UI, wholly outside this engine;
 *  6. advances the run's `RunStore` status `running` -> `completed`, or
 *     `failed` with a real error activity event on any thrown error, via
 *     the identical last-resort `try`/`catch` shape `car-purchase-engine.ts`
 *     uses so a run can never hang forever or vanish silently.
 *
 * --- Round-1-vs-round-2 detection ---
 *
 * docs/specs/demos-and-submission.md "Home Energy Guardian scenario" ->
 * "Required sequence" step 10: "The user or ChatGPT reweights the criterion
 * from lowest immediate cost to long-term waste reduction." That is the one
 * durable, real fact this engine reads back from case state:
 * `determineHomeEnergyRound` compares the case's current `energy.cost`/
 * `energy.conservation` criterion weights and calls it `round2` exactly when
 * `energy.conservation`'s weight now exceeds `energy.cost`'s -- the direct,
 * persisted trace of that reweight, independent of which caller performed
 * it (visible UI control or a WebMCP `pax_update_criteria` call, per
 * CLAUDE.md "Visible UI controls and WebMCP callbacks use the same command
 * implementation"). A freshly started case (pack defaults: both weighted 50)
 * is `round1`.
 *
 * One honest, documented cosmetic limitation this round split inherits from
 * the already-built, already-tested `scripted-beats/home-energy-guardian.ts`
 * (not modified here -- out of this task's scope, and doing so would risk
 * destabilizing `home-energy-swarm.test.ts`'s own passing assertions against
 * it): that file's `round1` scripted beat narrates its cost/conservation
 * weighting as "80/20" in `decision-synthesizer`'s fixed response text,
 * matching the arithmetic that file's own module header documents (a
 * genuinely cost-heavy weighting is needed to make `monitor-one-cycle`
 * outscore `request-hvac-inspection` under `evaluateResponseOptions`'
 * real formula). A freshly started live case actually carries the pack's
 * *default* 50/50 weights at that point, not 80/20 -- so round 1's
 * recommendation rationale text names a specific weighting that does not
 * exactly match the case's true criteria at that moment, even though the
 * *system prompt* `decision-synthesizer` actually received does honestly
 * carry the case's real weights (`buildDecisionSynthesizerSystemPrompt` in
 * `home-energy-swarm.ts` bakes in `request.caseSummary.criteria` from the
 * live snapshot, unchanged). This is scripted-fixture flavor text, not a
 * correctness defect in this engine's own round detection, folding, or
 * event correlation -- recorded here rather than silently accepted.
 */
import type {
  CaseEvent,
  CaseState,
  CompiledDecisionPack,
  ExecutionResult,
  PublicActivityEventType,
  PublicActivityPhase,
} from '@pax/contracts';
import type { Clock, IdGenerator } from '@pax/core';
import {
  createCapabilityCatalog,
  HOME_ENERGY_GUARDIAN_MANIFEST,
  type PackRegistry,
} from '@pax/packs';
import { emptyScenarioTrajectory } from '@pax/scenarios';
import type { RunStatus } from '../db/schema.js';
import type { InvestigationEngine, RunStore } from '../services/run-service.js';
import type { ActivityStore } from '../store/activity-store.js';
import type { CaseStore } from '../store/case-store.js';
import type { RuntimeEventStore } from '../store/runtime-event-store.js';
import {
  buildExecutionRequestFor,
  ensureSourcesExist,
  extractCitedSourceIds,
  foldExecutionResult,
  loadSnapshotOrThrow,
} from './car-purchase-scenario.js';
import type { RuntimeEvent } from './event-normalizer.js';
import {
  HOME_ENERGY_SEQUENTIAL_SPECIALIST_IDS,
  executeHomeEnergySwarm,
  type HomeEnergySequentialSpecialistId,
  type HomeEnergySwarmDeps,
  type HomeEnergySwarmNodeId,
  type HomeEnergySwarmResult,
} from './home-energy-swarm.js';
import {
  RESPONSE_OPTIONS,
  buildHomeEnergySwarmScriptedProviders,
  scriptedModelFor,
  setScenarioBeat,
  type HomeEnergyScenarioBeat,
  type HomeEnergySwarmScriptedProviders,
} from './scripted-beats/home-energy-guardian.js';

/**
 * Exported for the same reason `car-purchase-scenario.ts`'s
 * `carPurchaseCapabilityCatalog` is: `server.ts` needs to compile and
 * register the exact real `home-energy-guardian` `CompiledDecisionPack`
 * this engine runs against, without duplicating the catalog-construction
 * logic `home-energy-swarm.test.ts`'s own (test-local) `energyCatalog()`
 * helper already proves.
 */
export function homeEnergyCapabilityCatalog() {
  return createCapabilityCatalog([
    ...HOME_ENERGY_GUARDIAN_MANIFEST.skills.map((skill) => ({
      id: skill.id,
      kind: 'skill' as const,
      version: '1.0.0',
    })),
    ...HOME_ENERGY_GUARDIAN_MANIFEST.specialists.map((specialist) => ({
      id: specialist.id,
      kind: 'specialist' as const,
      version: '1.0.0',
    })),
    ...HOME_ENERGY_GUARDIAN_MANIFEST.tools.map((tool) => ({
      id: tool.id,
      kind: 'tool' as const,
      version: '1.0.0',
    })),
  ]);
}

/**
 * Pure round detection from real case state. See this file's header
 * comment for the full reasoning. Exported for a fast, focused unit test
 * independent of running the real Swarm.
 */
export function determineHomeEnergyRound(caseState: CaseState): HomeEnergyScenarioBeat {
  const cost = caseState.criteria.find((criterion) => criterion.id === 'energy.cost');
  const conservation = caseState.criteria.find(
    (criterion) => criterion.id === 'energy.conservation',
  );
  if (cost === undefined || conservation === undefined) return 'round1';
  return conservation.weight > cost.weight ? 'round2' : 'round1';
}

export interface HomeEnergyEngineDeps {
  readonly caseStore: CaseStore;
  readonly activityStore: ActivityStore;
  readonly runStore: RunStore;
  readonly runtimeEventStore: RuntimeEventStore;
  readonly registry: PackRegistry;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly skillsRootDir: string;
}

export interface HomeEnergyEngine extends InvestigationEngine {
  /**
   * Fire-and-forget per `InvestigationEngine`, but returns the real
   * in-flight `Promise` -- production callers (`run-service.ts`) never
   * await it; tests may, to observe real completion deterministically.
   * Two triggers for the same `caseId` are serialized, mirroring
   * `CarPurchaseEngine.trigger`'s identical per-case queuing contract.
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
 * Translates one normalized `RuntimeEvent` from the live Swarm run into the
 * matching public `ActivityStore` event, where the normal workspace's
 * public vocabulary (`@pax/contracts` `PUBLIC_ACTIVITY_EVENT_TYPES`) has
 * one. `category: 'swarm'`'s `swarm.node_started`/`swarm.node_completed`
 * map onto the same `specialist.started`/`specialist.completed` public
 * types `car-purchase-engine.ts` derives from its own Graph's
 * `graph.node_completed` start/finish phases -- the public vocabulary does
 * not distinguish Graph nodes from Swarm nodes, both are simply "a
 * specialist is working". `swarm.handoff`/`swarm.cycle_detected`/
 * `swarm.timeout` have no direct public counterpart today (there is no
 * `PublicActivityEventType` for "control moved to a different specialist"),
 * so -- like car-purchase's own `model`/`context`/`goal`/`session`/`error`
 * exclusions -- they remain Runtime Inspector-only detail. `model`/
 * `context`/`goal` categories are likewise left out for the same reason.
 */
function appendActivityForSwarmEvent(
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
    case 'swarm': {
      if (event.name === 'swarm.node_started') {
        appendActivity(activityStore, clock, ctx.caseId, {
          ...shared,
          type: 'specialist.started',
          phase: 'active',
          summary: event.summary,
        });
      } else if (event.name === 'swarm.node_completed') {
        appendActivity(activityStore, clock, ctx.caseId, {
          ...shared,
          type: 'specialist.completed',
          phase: 'completed',
          summary: event.summary,
        });
      }
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
 * Drains the real Swarm's `RuntimeEvent` stream as it progresses, writing
 * each event down two parallel, additive paths: the public `ActivityStore`
 * projection (`appendActivityForSwarmEvent`) and the real Runtime Inspector
 * persistence path (`runtimeEventStore.append`). Structurally identical to
 * `car-purchase-engine.ts`'s own `drainGraphToActivity` -- see this file's
 * header comment for why it is a parallel implementation, not a shared
 * import.
 *
 * The same real-runId correction that function documents applies here too:
 * every `ExecutionRequest.runId` `buildExecutionRequestFor` builds is the
 * synthetic per-obligation `` `run-${obligationId}` `` id (never this
 * trigger's actual durable `runs.id`), and `executeHomeEnergySwarm`'s own
 * `RunAccumulator.runId` is stamped from whichever request the Swarm
 * started at -- never the real id a client queries via
 * `GET /api/debug/runs/:runId`. `ctx.runId`/`ctx.caseId` (the real ones
 * this engine was `trigger()`ed with) are substituted in before either
 * durable write, exactly like `car-purchase-engine.ts` does.
 */
async function drainSwarmToActivity(
  gen: AsyncGenerator<RuntimeEvent, HomeEnergySwarmResult, undefined>,
  ctx: { caseId: string; runId: string },
  activityStore: ActivityStore,
  runtimeEventStore: RuntimeEventStore,
  clock: Clock,
): Promise<HomeEnergySwarmResult> {
  let next = await gen.next();
  while (!next.done) {
    runtimeEventStore.append({ ...next.value, caseId: ctx.caseId, runId: ctx.runId });
    appendActivityForSwarmEvent(next.value, ctx, activityStore, clock);
    next = await gen.next();
  }
  return next.value;
}

function scenarioFoldDeps(deps: HomeEnergyEngineDeps): {
  clock: Clock;
  idGenerator: IdGenerator;
  skillsRootDir: string;
} {
  return { clock: deps.clock, idGenerator: deps.idGenerator, skillsRootDir: deps.skillsRootDir };
}

/** `energy.<x>` obligation id each sequential Swarm node's context resolves. Mirrors `home-energy-swarm.test.ts`'s own (test-local) `SEQUENTIAL_OBLIGATION_IDS` mapping. */
const SEQUENTIAL_OBLIGATION_ID: Record<HomeEnergySequentialSpecialistId, string> = {
  'anomaly-investigator': 'energy.anomaly',
  'rate-analyst': 'energy.rate_change',
  'weather-analyst': 'energy.weather',
  'home-systems-analyst': 'energy.household_change',
};

/**
 * Builds the real `HomeEnergySwarmDeps` from a live case snapshot + the real
 * compiled pack -- this task's own version of `buildGraphDeps`
 * (`car-purchase-scenario.ts`). No test-local equivalent could simply be
 * "widened and exported" the way `car-purchase-scenario.ts`'s own task did:
 * `home-energy-swarm.test.ts`'s `buildDeps` constructs every
 * `ExecutionRequest` from hand-authored fixture objects
 * (`buildExecutionRequest`/`specialistRequest`), not from a real
 * `CaseState`, so there is no case-shaped construction logic there to lift
 * out unchanged. What *is* genuinely reused is the underlying,
 * already-exported building blocks both that test and this engine need:
 * `car-purchase-scenario.ts`'s fully generic `buildExecutionRequestFor`
 * (reads only `CaseState`/`CompiledDecisionPack`/`obligationId` -- nothing
 * car-purchase-specific) for every `ExecutionRequest`, and
 * `scripted-beats/home-energy-guardian.ts`'s own already-exported
 * `scriptedModelFor` for `modelFor`.
 */
function buildHomeEnergySwarmDepsFromCase(
  caseState: CaseState,
  pack: CompiledDecisionPack,
  providers: HomeEnergySwarmScriptedProviders,
  deps: { clock: Clock; idGenerator: IdGenerator; skillsRootDir: string },
  start: HomeEnergySwarmNodeId | undefined,
): HomeEnergySwarmDeps {
  const specialistRequests = Object.fromEntries(
    HOME_ENERGY_SEQUENTIAL_SPECIALIST_IDS.map((specialistId) => [
      specialistId,
      buildExecutionRequestFor(caseState, pack, SEQUENTIAL_OBLIGATION_ID[specialistId]),
    ]),
  ) as HomeEnergySwarmDeps['specialistRequests'];

  return {
    pack,
    modelFor: scriptedModelFor(providers),
    skillsRootDir: deps.skillsRootDir,
    clock: deps.clock,
    idGenerator: deps.idGenerator,
    specialistRequests,
    responseOptionsRequest: buildExecutionRequestFor(caseState, pack, 'energy.response_options'),
    resolveConfirmation: () => true,
    ...(start !== undefined ? { start } : {}),
  };
}

const KNOWN_RESPONSE_OPTION_IDS = RESPONSE_OPTIONS.map((option) => option.optionId);

/**
 * Extracts which response-option id `decisionSynthesizerText` recommends.
 * Home Energy Guardian has no dedicated "propose a response option" tool
 * call the way car-purchase's `propose_recommendation`/this pack's own
 * `propose_inspection` are (the pack only gates the one *consequential*
 * option, `request-hvac-inspection`, behind a tool call -- the other three
 * response options are never "proposed" through a tool at all, per
 * `home-energy-guardian.ts`'s manifest). Round 2's inspection
 * recommendation is read directly off `HomeEnergySwarmResult.
 * proposedInspection.optionId` when present (the real tool-call input, not
 * text-parsed); this text-based extraction is the fallback used whenever no
 * tool call carries the answer (every round-1 outcome, and any round-2
 * outcome that does not recommend the inspection) -- both the scripted
 * `DECISION_TEXT_ROUND1`/`DECISION_TEXT_ROUND2` strings
 * (`scripted-beats/home-energy-guardian.ts`) always name the recommended
 * option id in parentheses immediately after "Recommend...", which this
 * regex targets first; a secondary substring scan against every known
 * option id is the fallback of last resort.
 *
 * Exported for the same direct-unit-testability reason as
 * `foldHomeEnergyRound1`/`foldHomeEnergyRound2` above.
 */
export function extractFavoredResponseOptionId(text: string): string | null {
  const match = /Recommend[^()]*\(([a-z0-9-]+)\)/i.exec(text);
  const fromRecommendClause = match?.[1]?.toLowerCase();
  if (
    fromRecommendClause !== undefined &&
    KNOWN_RESPONSE_OPTION_IDS.includes(fromRecommendClause)
  ) {
    return fromRecommendClause;
  }
  return KNOWN_RESPONSE_OPTION_IDS.find((id) => text.includes(id)) ?? null;
}

/** Every non-empty `limitations` entry any node's captured context carried, de-duplicated -- used to ground `Recommendation.limitations` in what the Swarm's specialists actually reported rather than inventing generic prose. */
function collectLimitations(
  contexts: Partial<Record<HomeEnergySwarmNodeId, ExecutionResult>>,
): string[] {
  const seen = new Set<string>();
  for (const context of Object.values(contexts)) {
    for (const limitation of context?.limitations ?? []) {
      seen.add(limitation);
    }
  }
  return [...seen];
}

/** `resolvedObligationIds`/`acceptedUncertaintyObligationIds` computed from the real, current obligation statuses -- never hardcoded, so this stays correct regardless of exactly which obligations the deterministic core (`advanceObligation`) resolved to which status. */
function obligationIdsByStatus(
  snapshot: CaseState,
  status: 'satisfied' | 'accepted_uncertainty',
): string[] {
  return snapshot.obligations.filter((obligation) => obligation.status === status).map((o) => o.id);
}

/**
 * Folds round 1: the four sequential specialists' contexts, then
 * `source-challenger`'s corroboration, then a synthesized `evidence_found`
 * result for `energy.response_options` from `decision-synthesizer`'s final
 * ranking text, then a soft initial `recommendation.ready` lean (no
 * proposal -- home-energy-guardian has no round-1-only proposal moment, the
 * Swarm's one consequential effect, `propose_inspection`, is only ever
 * exercised in round 2). Mirrors `car-purchase-engine.ts`'s `foldRound1`
 * shape using the same reused fold helpers.
 *
 * Exported for the same direct-unit-testability reason
 * `car-purchase-engine.ts`'s own `foldRound1`/`foldRound2` are: its
 * defensive "the real Swarm produced no context for node X" throw guards
 * can be tested directly against a hand-built plain-data
 * `HomeEnergySwarmResult`, without needing to coerce the real Swarm itself
 * into omitting a node's result.
 */
export function foldHomeEnergyRound1(
  deps: HomeEnergyEngineDeps,
  caseId: string,
  swarmResult: HomeEnergySwarmResult,
): CaseState {
  const scenarioDeps = scenarioFoldDeps(deps);
  const trajectory = emptyScenarioTrajectory();

  for (const specialistId of HOME_ENERGY_SEQUENTIAL_SPECIALIST_IDS) {
    const context = swarmResult.contexts[specialistId];
    if (context === undefined) {
      throw new Error(
        `home-energy-engine: round1 produced no context for "${specialistId}" on case "${caseId}"`,
      );
    }
    foldExecutionResult(
      deps.caseStore,
      deps.activityStore,
      caseId,
      context,
      scenarioDeps,
      trajectory,
      {
        attemptsToRecord: 1,
      },
    );
  }

  const challengeContext = swarmResult.contexts['source-challenger'];
  if (challengeContext === undefined) {
    throw new Error(
      `home-energy-engine: round1 produced no context for "source-challenger" on case "${caseId}"`,
    );
  }
  // source-challenger corroborates the evidence chain rather than making its
  // own attempt at an obligation -- mirrors car-purchase-engine.ts's
  // identical rationale for its own source-challenger fold.
  foldExecutionResult(
    deps.caseStore,
    deps.activityStore,
    caseId,
    challengeContext,
    scenarioDeps,
    trajectory,
    { attemptsToRecord: 0 },
  );

  const initialSnapshot = loadSnapshotOrThrow(deps.caseStore, caseId);
  const sourceIds = extractCitedSourceIds(swarmResult.decisionSynthesizerText);
  ensureSourcesExist(deps.caseStore, caseId, initialSnapshot.eventSequence, sourceIds, deps.clock);

  // foldExecutionResult re-loads the case fresh internally, so its return
  // value (not the pre-ensureSourcesExist snapshot above) is this
  // function's one live source of truth from here on.
  const snapshot = foldExecutionResult(
    deps.caseStore,
    deps.activityStore,
    caseId,
    {
      obligationId: 'energy.response_options',
      disposition: 'evidence_found',
      claims: [
        {
          statement: swarmResult.decisionSynthesizerText,
          stance: 'supports',
          confidence: 0.8,
          sourceIds,
        },
      ],
      evidenceResults: sourceIds.map((sourceId) => ({
        sourceId,
        level: 'E2' as const,
        verdict: 'pass' as const,
        summary: 'Cited in the response-options synthesis.',
      })),
      limitations: [],
      suggestedStatus: 'satisfied',
    },
    scenarioDeps,
    trajectory,
    { attemptsToRecord: 1 },
  );

  const favoredOptionId = extractFavoredResponseOptionId(swarmResult.decisionSynthesizerText);
  if (favoredOptionId === null) {
    throw new Error(
      `home-energy-engine: round1 decision-synthesizer text named no known response option for case "${caseId}"`,
    );
  }

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
        rationale: swarmResult.decisionSynthesizerText,
        facts: [],
        hypotheses: [],
        confidence: 0.75,
        limitations: collectLimitations(swarmResult.contexts),
        sourceIds,
        resolvedObligationIds: obligationIdsByStatus(snapshot, 'satisfied'),
        acceptedUncertaintyObligationIds: obligationIdsByStatus(snapshot, 'accepted_uncertainty'),
        generatedAt: deps.clock.now(),
      },
    },
  };
  const appended = deps.caseStore.append(caseId, [recommendationEvent], snapshot.eventSequence);
  if (appended.status !== 'applied') {
    throw new Error(
      `home-energy-engine: failed to record the round1 recommendation for case "${caseId}": status "${appended.status}"`,
    );
  }
  appendActivity(deps.activityStore, deps.clock, caseId, {
    type: 'recommendation.ready',
    phase: 'completed',
    summary: `Initial recommendation ready: favoring "${favoredOptionId}".`,
  });
  return appended.snapshot;
}

/**
 * Folds round 2: `decision-synthesizer`'s revised response-options ranking
 * (the only node the Swarm re-visits -- `home-energy-swarm.test.ts`'s own
 * round-2 case starts directly at `decision-synthesizer`, since nothing
 * about the confirmed anomaly/rate/weather/household-event evidence
 * changes, only the household's cost/conservation weighting), a revised
 * `recommendation.ready`, and -- only when `decision-synthesizer` genuinely
 * called `propose_inspection` -- a pending `proposal.proposed` requiring
 * human review. Mirrors `car-purchase-engine.ts`'s `foldRound2` shape,
 * simplified to this pack's actual round-2 scope (no stale-evidence
 * supersession or hard-constraints re-derivation obligation exists for this
 * pack).
 *
 * Exported for the same direct-unit-testability reason as
 * `foldHomeEnergyRound1` above.
 */
export function foldHomeEnergyRound2(
  deps: HomeEnergyEngineDeps,
  caseId: string,
  swarmResult: HomeEnergySwarmResult,
): CaseState {
  const scenarioDeps = scenarioFoldDeps(deps);
  const trajectory = emptyScenarioTrajectory();

  const initialSnapshot = loadSnapshotOrThrow(deps.caseStore, caseId);
  const sourceIds = extractCitedSourceIds(swarmResult.decisionSynthesizerText);
  ensureSourcesExist(deps.caseStore, caseId, initialSnapshot.eventSequence, sourceIds, deps.clock);

  // A re-synthesis corroborating/revising the same obligation, not a fresh
  // "attempt" at it (matches source-challenger's `attemptsToRecord: 0`
  // corroboration rationale above) -- `energy.response_options` is already
  // `satisfied` from round 1; this records the household's revised evidence
  // without consuming the obligation's own attempt budget a second time.
  // foldExecutionResult re-loads the case fresh internally, so its return
  // value (not the pre-ensureSourcesExist snapshot above) is this
  // function's one live source of truth from here on.
  let snapshot = foldExecutionResult(
    deps.caseStore,
    deps.activityStore,
    caseId,
    {
      obligationId: 'energy.response_options',
      disposition: 'evidence_found',
      claims: [
        {
          statement: swarmResult.decisionSynthesizerText,
          stance: 'supports',
          confidence: 0.85,
          sourceIds,
        },
      ],
      evidenceResults: sourceIds.map((sourceId) => ({
        sourceId,
        level: 'E2' as const,
        verdict: 'pass' as const,
        summary: 'Cited in the revised response-options synthesis.',
      })),
      limitations: [],
      suggestedStatus: 'satisfied',
    },
    scenarioDeps,
    trajectory,
    { attemptsToRecord: 0 },
  );

  const favoredOptionId =
    swarmResult.proposedInspection?.optionId ??
    extractFavoredResponseOptionId(swarmResult.decisionSynthesizerText);
  if (favoredOptionId === null) {
    throw new Error(
      `home-energy-engine: round2 decision-synthesizer text named no known response option for case "${caseId}"`,
    );
  }

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
        rationale: swarmResult.decisionSynthesizerText,
        facts: [],
        hypotheses: [],
        confidence: 0.85,
        limitations: collectLimitations(swarmResult.contexts),
        sourceIds,
        resolvedObligationIds: obligationIdsByStatus(snapshot, 'satisfied'),
        acceptedUncertaintyObligationIds: obligationIdsByStatus(snapshot, 'accepted_uncertainty'),
        generatedAt: deps.clock.now(),
      },
    },
  };
  const recAppend = deps.caseStore.append(caseId, [recommendationEvent], snapshot.eventSequence);
  if (recAppend.status !== 'applied') {
    throw new Error(
      `home-energy-engine: failed to record the round2 recommendation for case "${caseId}": status "${recAppend.status}"`,
    );
  }
  snapshot = recAppend.snapshot;
  appendActivity(deps.activityStore, deps.clock, caseId, {
    type: 'recommendation.ready',
    phase: 'completed',
    summary: `Revised recommendation ready: favoring "${favoredOptionId}".`,
  });

  if (swarmResult.proposedInspection === undefined) {
    // The reweighted criteria still did not favor the one consequential
    // option -- there is nothing pending human confirmation this round.
    return snapshot;
  }

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
      `home-energy-engine: failed to create the decision proposal for case "${caseId}": status "${proposalAppend.status}"`,
    );
  }
  appendActivity(deps.activityStore, deps.clock, caseId, {
    type: 'intervention.confirmation_required',
    phase: 'waiting',
    summary: 'A proposal to request an HVAC/thermostat inspection is awaiting human review.',
  });
  return proposalAppend.snapshot;
}

async function runOneInvestigation(
  params: { caseId: string; runId: string; obligationId: string },
  deps: HomeEnergyEngineDeps,
): Promise<void> {
  try {
    const initialSnapshot = deps.caseStore.load(params.caseId);
    if (initialSnapshot === undefined) {
      throw new Error(`home-energy-engine: case "${params.caseId}" was not found`);
    }
    const pack = deps.registry.get(initialSnapshot.pack.id, initialSnapshot.pack.version);
    if (pack === undefined) {
      throw new Error(
        `home-energy-engine: pinned pack "${initialSnapshot.pack.id}@${initialSnapshot.pack.version}" is not registered`,
      );
    }

    const round = determineHomeEnergyRound(initialSnapshot);
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

    const providers = buildHomeEnergySwarmScriptedProviders();
    setScenarioBeat(providers, round);
    const swarmDeps = buildHomeEnergySwarmDepsFromCase(
      initialSnapshot,
      pack,
      providers,
      scenarioFoldDeps(deps),
      round === 'round2' ? 'decision-synthesizer' : undefined,
    );

    const swarmResult = await drainSwarmToActivity(
      executeHomeEnergySwarm(swarmDeps),
      { caseId: params.caseId, runId: params.runId },
      deps.activityStore,
      deps.runtimeEventStore,
      deps.clock,
    );

    const finalSnapshot =
      round === 'round1'
        ? foldHomeEnergyRound1(deps, params.caseId, swarmResult)
        : foldHomeEnergyRound2(deps, params.caseId, swarmResult);

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
    // Same last-resort pattern car-purchase-engine.ts documents: logged
    // unconditionally first (a run must never silently stay
    // "running"/"queued" forever with no inspectable trace), then the two
    // durable writes are attempted best-effort.
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[pax] home-energy-engine: run "${params.runId}" for case "${params.caseId}" failed: ${message}`,
    );
    try {
      deps.runStore.updateStatus(params.runId, {
        status: 'failed',
        updatedAt: deps.clock.now(),
        result: { error: message },
      });
    } catch (updateError) {
      console.error(
        `[pax] home-energy-engine: failed to record run "${params.runId}" as failed:`,
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
        `[pax] home-energy-engine: failed to append a run.failed activity event for run "${params.runId}":`,
        activityError,
      );
    }
  }
}

/**
 * Builds the live `home-energy-guardian` `InvestigationEngine`. `RunService`
 * looks this up by pack id (`server.ts` registers it under
 * `'home-energy-guardian'`) and fires `trigger` after durably accepting a
 * run, without ever awaiting it.
 */
export function createHomeEnergyEngine(deps: HomeEnergyEngineDeps): HomeEnergyEngine {
  const inFlightByCase = new Map<string, Promise<void>>();

  function trigger(params: { caseId: string; runId: string; obligationId: string }): Promise<void> {
    const priorInFlight = inFlightByCase.get(params.caseId) ?? Promise.resolve();
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
