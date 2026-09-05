/**
 * Runs the real "Home Energy Guardian" demo trajectory end to end
 * (docs/specs/testing.md "Scenario tests": "execute the actual core, pack,
 * Strands adapter, scripted model, interventions, fixture tools, event
 * store, and API in process") and proves every required assertion from
 * docs/specs/demos-and-submission.md "Home Energy Guardian scenario" ->
 * "Required final assertions" genuinely passes against the real causal
 * trajectory -- not a scripted final-result shortcut (docs/engineering-principles.md).
 *
 * Writes the final snapshot, event log, trajectory, and assertion report to
 * `artifacts/verification/scenarios/home-energy-guardian/` (testing.md
 * "Scenario tests"), mirroring `car-purchase.scenario.test.ts` exactly.
 */
import { describe, expect, it } from 'vitest';
import { applyCaseEvent, deriveInsights, scoreCaseState } from '../../packages/core/src/index.js';
import { deriveScoredRecommendationFields } from '../../apps/agent/src/runtime/recommendation-scoring.js';
import {
  DemoScenarioSchema,
  type CaseEvent,
  type CaseState,
} from '../../packages/contracts/src/index.js';
import { checkAssertion, checkAssertions } from '../../packages/scenarios/src/assertions.js';
import { writeScenarioArtifacts } from '../../packages/scenarios/src/artifact-writer.js';
import { runHomeEnergyGuardianScenario } from '../../apps/agent/src/runtime/home-energy-guardian-scenario.js';
import { HOME_ENERGY_GUARDIAN_DEMO_SCENARIO } from './home-energy-guardian.scenario.js';

const SKILLS_ROOT_DIR = new URL('../../apps/agent/skills', import.meta.url).pathname;

// The real, read-only fixture tools every autonomous specialist may call
// (home-energy-guardian.ts's own manifest tools[], minus propose_inspection
// -- this pack's one deliberately consequential, human-confirmed effect).
const AUTONOMOUS_READ_ONLY_TOOL_IDS = new Set([
  'bill-reader',
  'usage-history-query',
  'tariff-lookup',
  'weather-lookup',
  'household-event-lookup',
  'calculator',
]);

function fixedIdGenerator(): { next: (prefix?: string) => string } {
  let counter = 0;
  return { next: (prefix) => `${prefix ?? 'id'}-${++counter}` };
}

describe('HOME_ENERGY_GUARDIAN_DEMO_SCENARIO', () => {
  it('is a genuinely valid DemoScenario', () => {
    const parsed = DemoScenarioSchema.safeParse(HOME_ENERGY_GUARDIAN_DEMO_SCENARIO);
    expect(parsed.success, JSON.stringify('error' in parsed ? parsed.error.issues : null)).toBe(
      true,
    );
  });
});

describe('Home Energy Guardian scenario: real causal trajectory', () => {
  it('runs the real six-node Swarm twice, a genuine GoalLoop reject-then-recover cycle, a genuine session-snapshot restart/restore, and satisfies every required assertion', async () => {
    let tickCounter = 0;
    const clock = {
      // Distinct, monotonic timestamps so ordering assertions over
      // `timestamp` (not just `sequence`) are meaningful.
      now: () => new Date(Date.UTC(2026, 7, 27, 0, 0, ++tickCounter)).toISOString(),
    };

    const { trajectory, caseId } = await runHomeEnergyGuardianScenario({
      clock,
      idGenerator: fixedIdGenerator(),
      skillsRootDir: SKILLS_ROOT_DIR,
    });

    const finalCaseState = trajectory.finalCaseState;
    expect(finalCaseState).toBeDefined();
    if (finalCaseState === undefined) return;

    // --- Every declarative assertion from demos-and-submission.md's
    // required list (the stable-id subset -- see
    // home-energy-guardian.scenario.ts's own header for why the one
    // dynamic-id assertion is checked separately below) ---
    const report = checkAssertions(trajectory, HOME_ENERGY_GUARDIAN_DEMO_SCENARIO.assertions);
    const failures = report.results.filter((entry) => !entry.passed);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);

    // --- Dynamic-id assertion built from the trajectory's own recorded caseId ---
    const snapshotAssertion = checkAssertion(trajectory, {
      kind: 'snapshot_restored',
      caseId,
    });
    expect(snapshotAssertion.passed, snapshotAssertion.message).toBe(true);
    expect(finalCaseState.id).toBe(caseId);

    // --- "no human action is emitted before the engine completes rate,
    // weather, and household-event investigation" ---
    const investigationSatisfiedEvents = trajectory.caseEvents.filter(
      (event): event is Extract<CaseEvent, { type: 'obligation.updated' }> =>
        event.type === 'obligation.updated' &&
        [
          'energy.anomaly',
          'energy.rate_change',
          'energy.weather',
          'energy.household_change',
        ].includes(event.payload.obligation.id) &&
        event.payload.obligation.status === 'satisfied',
    );
    expect(investigationSatisfiedEvents).toHaveLength(4);
    const firstHumanCriteriaEvent = trajectory.caseEvents.find(
      (event): event is Extract<CaseEvent, { type: 'criteria.updated' }> =>
        event.type === 'criteria.updated' &&
        event.payload.criteria.some(
          (criterion) => criterion.id === 'energy.conservation' && criterion.weight === 80,
        ),
    );
    expect(firstHumanCriteriaEvent).toBeDefined();
    for (const event of investigationSatisfiedEvents) {
      expect(event.sequence).toBeLessThan(firstHumanCriteriaEvent!.sequence);
    }

    // --- "all autonomous tools are fixture-backed and read-only" ---
    const autonomousToolIds = new Set(
      trajectory.toolCalls
        .map((call) => call.toolId)
        .filter(
          (toolId) =>
            toolId !== 'propose_inspection' &&
            toolId !== 'strands_structured_output' &&
            toolId !== 'skills',
        ),
    );
    expect(autonomousToolIds.size).toBeGreaterThan(0);
    for (const toolId of autonomousToolIds) {
      expect(AUTONOMOUS_READ_ONLY_TOOL_IDS.has(toolId), toolId).toBe(true);
    }

    // --- "criterion reweighting invalidates the prior recommendation" ---
    expect(trajectory.caseEvents.some((event) => event.type === 'recommendation.invalidated')).toBe(
      true,
    );
    const recommendationReadyEvents = trajectory.caseEvents.filter(
      (event) => event.type === 'recommendation.ready',
    );
    expect(recommendationReadyEvents).toHaveLength(2);
    expect(
      recommendationReadyEvents[0]?.type === 'recommendation.ready' &&
        recommendationReadyEvents[0].payload.recommendation.favoredOptionId,
    ).toBe('monitor-one-cycle');

    // --- The reweight genuinely decides the outcome, deterministically ---
    //
    // This scenario's central beat is reweighting `energy.conservation` to
    // 80%. That reweight used to change nothing measurable: the criterion
    // named no attribute, so 80% of the case's weight was unscorable and
    // the board's coverage sat at 20%. The pack now points it at
    // `energy.addresses_root_cause`, whose fixture values already encoded
    // the whole story -- only the HVAC inspection addresses the root cause.
    //
    // Asserted here rather than in a unit test because the thing worth
    // protecting is the CAUSAL CHAIN: a real Swarm run, a real reweight
    // through the real command path, and a ranking that moves as a
    // consequence. A pack edit that quietly unhooked the criterion again
    // would leave every unit test passing.
    const board = scoreCaseState(finalCaseState);
    const leader = board.options[0];
    expect(leader?.optionId).toBe('request-hvac-inspection');
    expect(leader?.coverage).toBe(1);

    const conservation = leader?.criteria.find(
      (line) => line.criterionId === 'energy.conservation',
    );
    expect(conservation?.status).toBe('scored');
    expect(conservation?.score).toBe(1);
    // The reweight put 80% of the case's weight here; if this drops back to
    // the pack's seeded 80/20 cost-favoring default (energy.conservation at
    // 20%, not this reweighted 80%) the beat has silently stopped happening.
    expect(conservation?.weight).toBeCloseTo(0.8, 10);

    // The deterministic leader and the Swarm's own favorite agree, so no
    // divergence limitation is emitted and confidence is high -- but never
    // certain, since coverage counts only the criteria this household
    // actually wrote down.
    const recomputed = deriveScoredRecommendationFields(
      finalCaseState,
      finalCaseState.recommendation?.favoredOptionId ?? null,
    );
    expect(recomputed.agreesWithScoreboard).toBe(true);
    expect(finalCaseState.recommendation?.confidence).toBe(recomputed.confidence);
    expect(finalCaseState.recommendation?.confidence).toBeGreaterThan(0.8);
    expect(finalCaseState.recommendation?.confidence).toBeLessThan(1);
    expect(finalCaseState.recommendation?.limitations.join(' ')).not.toContain(
      'scoring your criteria puts',
    );

    // And the claim Sift makes about WHY it leads is an experiment, not a
    // sentence: removing that criterion has to actually flip the top two.
    const decisive = deriveInsights(board).find((insight) => insight.kind === 'decisive_criterion');
    expect(decisive?.criterionIds).toEqual(['energy.conservation']);

    // --- "confirmation precedes proposal creation" (real causal order: the
    // round2 Swarm run -- which is the only place ConsequenceGuard's confirm
    // fires -- fully completes, and its confirm intervention is recorded in
    // the trajectory, before this scenario's own code ever appends the
    // proposal.proposed CaseEvent) ---
    expect(
      trajectory.interventions.some(
        (intervention) =>
          intervention.action === 'confirm' && intervention.handler === 'ConsequenceGuard',
      ),
    ).toBe(true);
    const proposalProposedEvent = trajectory.caseEvents.find(
      (event): event is Extract<CaseEvent, { type: 'proposal.proposed' }> =>
        event.type === 'proposal.proposed',
    );
    expect(proposalProposedEvent).toBeDefined();

    // --- "the trace contains AgentSkills activation, Context Injector use,
    // a real Swarm handoff, Guide, GoalLoop rejection and recovery, and
    // snapshot restoration" (structural, non-declarative-DSL parts) ---
    expect(trajectory.skillActivations.length).toBeGreaterThan(0);
    expect(trajectory.contextInjections.length).toBeGreaterThan(0);
    expect(trajectory.swarmHandoffs.length).toBeGreaterThan(0);
    expect(trajectory.goalValidationFailures.length).toBeGreaterThan(0);
    expect(trajectory.goalValidationPasses.length).toBeGreaterThan(0);
    expect(trajectory.snapshotRestorations).toHaveLength(1);

    // --- "no scheduling or purchase event exists; the demo does not
    // schedule anything" ---
    expect(finalCaseState.entities.map((entity) => entity.id).sort()).toEqual(
      [
        'change-rate-plan',
        'monitor-one-cycle',
        'request-energy-audit',
        'request-hvac-inspection',
      ].sort(),
    );
    expect(
      trajectory.caseEvents.every((event) => !/schedul|purchas|appointment/i.test(event.type)),
    ).toBe(true);
    expect(finalCaseState.proposal?.status).toBe('approved');
    expect(finalCaseState.proposal?.reviewedByActor).toBe('human');

    // --- "no decision.approved-shaped event ever has actor agent" ---
    expect(trajectory.agentApprovedProposalAttempts).toBe(0);
    const reviewedEvents = trajectory.caseEvents.filter(
      (event): event is Extract<CaseEvent, { type: 'proposal.reviewed' }> =>
        event.type === 'proposal.reviewed',
    );
    expect(reviewedEvents.length).toBeGreaterThan(0);
    for (const event of reviewedEvents) {
      if (event.payload.proposal.status === 'approved') {
        expect(event.payload.proposal.reviewedByActor).toBe('human');
      }
    }
    expect(finalCaseState.status).toBe('decided');

    // --- "the recommendation revises from monitor-one-cycle to
    // request-hvac-inspection and passes GoalLoop validation" ---
    expect(finalCaseState.recommendation?.favoredOptionId).toBe('request-hvac-inspection');

    // --- queued/specialist/skill/tool/evidence/recommendation/completion
    // events appear, and case events are strictly ordered ---
    trajectory.caseEvents.forEach((event, index) => {
      if (index === 0) return;
      expect(event.sequence).toBeGreaterThan(trajectory.caseEvents[index - 1]!.sequence);
    });
    expect(trajectory.humanActions.length).toBeGreaterThan(0);
    expect(trajectory.toolCalls.length).toBeGreaterThan(0);
    expect(trajectory.skillActivations.length).toBeGreaterThan(0);

    // --- "reload produces the same approved proposal and case evidence"
    // (replay every real CaseEvent via applyCaseEvent from an empty case,
    // the exact same replay-equivalence proof car-purchase's own test uses)
    // ---
    let replayed: CaseState | null = null;
    for (const event of trajectory.caseEvents) {
      replayed = applyCaseEvent(replayed, event);
    }
    expect(replayed).not.toBeNull();
    // `attributeDefinitions` (`AppendOptions.seedSnapshot`) and
    // `selectedOptionId`/`selectedEvidenceId`/`sources`
    // (`CaseStore.updateSelection`'s `SelectionPatch`) are never derivable
    // from `CaseEvent` replay alone -- see car-purchase.scenario.test.ts's
    // own identical comment on this exact, documented design
    // (`apps/agent/src/store/case-store.ts`'s module comment) for the full
    // reasoning.
    expect({ ...replayed, attributeDefinitions: [], selectedOptionId: null, sources: [] }).toEqual({
      ...finalCaseState,
      attributeDefinitions: [],
      selectedOptionId: null,
      sources: [],
    });

    // --- Write the required scenario artifacts ---
    const paths = writeScenarioArtifacts({
      scenarioId: 'home-energy-guardian',
      finalCaseState,
      eventLog: trajectory.caseEvents,
      trajectory,
      assertionReport: report,
    });
    expect(paths.dir).toContain('home-energy-guardian');
    expect(caseId).toBe(finalCaseState.id);
  });
});
