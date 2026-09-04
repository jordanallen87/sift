/**
 * Runs the real "Choose Our Next Car" demo trajectory end to end
 * (docs/specs/testing.md "Scenario tests": "execute the actual core, pack,
 * Strands adapter, scripted model, interventions, fixture tools, event
 * store, and API in process") and proves every required assertion from
 * docs/specs/demos-and-submission.md "Choose Our Next Car scenario" ->
 * "Required final assertions" genuinely passes against the real causal
 * trajectory -- not a scripted final-result shortcut (CLAUDE.md).
 *
 * Writes the final snapshot, event log, trajectory, and assertion report to
 * `artifacts/verification/scenarios/car-purchase/` (testing.md "Scenario
 * tests").
 */
import { describe, expect, it } from 'vitest';
import { applyCaseEvent, scoreCaseState } from '../../packages/core/src/index.js';
import { deriveScoredRecommendationFields } from '../../apps/agent/src/runtime/recommendation-scoring.js';
import {
  DemoScenarioSchema,
  type CaseEvent,
  type CaseState,
} from '../../packages/contracts/src/index.js';
import { checkAssertion, checkAssertions } from '../../packages/scenarios/src/assertions.js';
import { writeScenarioArtifacts } from '../../packages/scenarios/src/artifact-writer.js';
import { runCarPurchaseScenario } from '../../apps/agent/src/runtime/car-purchase-scenario.js';
import { REAR_FACING_SEAT_OBLIGATION_ID } from '../../apps/agent/src/runtime/scripted-beats/car-purchase.js';
import { CAR_PURCHASE_DEMO_SCENARIO } from './car-purchase.scenario.js';

const SKILLS_ROOT_DIR = new URL('../../apps/agent/skills', import.meta.url).pathname;

function fixedIdGenerator(): { next: (prefix?: string) => string } {
  let counter = 0;
  return { next: (prefix) => `${prefix ?? 'id'}-${++counter}` };
}

describe('CAR_PURCHASE_DEMO_SCENARIO', () => {
  it('is a genuinely valid DemoScenario', () => {
    const parsed = DemoScenarioSchema.safeParse(CAR_PURCHASE_DEMO_SCENARIO);
    expect(parsed.success, JSON.stringify('error' in parsed ? parsed.error.issues : null)).toBe(
      true,
    );
  });
});

describe('Choose Our Next Car scenario: real causal trajectory', () => {
  it('runs the real six-node Graph twice, two full rounds of specialists/skills/tools/interventions/evidence, and satisfies every required assertion', async () => {
    let tickCounter = 0;
    const clock = {
      // Distinct, monotonic timestamps so ordering assertions over
      // `timestamp` (not just `sequence`) are meaningful.
      now: () => new Date(Date.UTC(2026, 7, 27, 0, 0, ++tickCounter)).toISOString(),
    };

    const { trajectory, caseId } = await runCarPurchaseScenario({
      clock,
      idGenerator: fixedIdGenerator(),
      skillsRootDir: SKILLS_ROOT_DIR,
    });

    const finalCaseState = trajectory.finalCaseState;
    expect(finalCaseState).toBeDefined();
    if (finalCaseState === undefined) return;

    // --- Every declarative assertion from demos-and-submission.md's
    // required list (the stable-id subset -- see car-purchase.scenario.ts's
    // own header for why a few dynamic-id ones are checked separately
    // below) ---
    const report = checkAssertions(trajectory, CAR_PURCHASE_DEMO_SCENARIO.assertions);
    const failures = report.results.filter((entry) => !entry.passed);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);

    // --- Dynamic-id assertions built from the trajectory's own recorded ids ---
    expect(trajectory.staleEvidenceIds.length).toBeGreaterThan(0);
    const staleAssertion = checkAssertion(trajectory, {
      kind: 'evidence_stale',
      evidenceId: trajectory.staleEvidenceIds[0]!,
    });
    expect(staleAssertion.passed, staleAssertion.message).toBe(true);

    expect(trajectory.claims.length).toBeGreaterThan(0);
    const firstClaim = trajectory.claims[0]!;
    const claimAssertion = checkAssertion(trajectory, {
      kind: 'claim_linked',
      claimId: firstClaim.claimId,
      sourceIds: [...firstClaim.sourceIds],
    });
    expect(claimAssertion.passed, claimAssertion.message).toBe(true);

    // --- "every included material claim has at least one source" ---
    for (const claim of trajectory.claims) {
      expect(claim.sourceIds.length).toBeGreaterThan(0);
    }

    // --- "advertised and normalized out-the-door prices remain separately visible" ---
    const rav4 = finalCaseState.entities.find((entity) => entity.id === 'candidate-rav4');
    expect(rav4).toBeDefined();
    const advertised = rav4?.attributes['car.advertised_price']?.value;
    const outTheDoor = rav4?.attributes['car.out_the_door_price']?.value;
    expect(advertised).toEqual({ type: 'money', amount: 27995, currency: 'USD' });
    expect(outTheDoor).toEqual({ type: 'money', amount: 33291.3, currency: 'USD' });

    // --- "the selected candidate in WebMCP context matches the page selection" ---
    expect(finalCaseState.selectedOptionId).toBe('candidate-rav4');

    // --- "a subjective unknown becomes a test-drive question rather than an invented score" ---
    //
    // Three separate unknowns, and all three must survive the whole run:
    // the pack's own `car.rear_cargo_crate_fit` and
    // `car.driving_comfort_rating` (seeded unknown, never fabricated), plus
    // the case's own `custom.rear_facing_seat_behind_driver` column, which
    // nobody publishes and no specialist in this fixture can establish.
    // The last one is the one the demo rests on: it carries real weight and
    // stays explicitly unanswered for EVERY candidate, including the one
    // the recommendation ends up favoring.
    for (const candidate of finalCaseState.entities) {
      const comfort = candidate.attributes['car.driving_comfort_rating'];
      const crateFit = candidate.attributes['car.rear_cargo_crate_fit'];
      const seatFit = candidate.attributes['custom.rear_facing_seat_behind_driver'];
      expect(comfort?.status).toBe('unknown');
      expect('value' in (comfort ?? {})).toBe(false);
      expect(crateFit?.status).toBe('unknown');
      expect('value' in (crateFit ?? {})).toBe(false);
      expect(seatFit === undefined || seatFit.status === 'unknown').toBe(true);
      expect('value' in (seatFit ?? {})).toBe(false);
    }
    const rearFacingSeatObligation = finalCaseState.obligations.find(
      (obligation) => obligation.id === REAR_FACING_SEAT_OBLIGATION_ID,
    );
    expect(rearFacingSeatObligation?.question).toMatch(/behind the driver/i);

    // The household's own grade scale is pinned on the case, worst first, so
    // a later run that DOES answer the question ranks against a declared
    // ordinal scale rather than an inferred one (`scoreCase` refuses to read
    // an order out of `allowedValues`).
    const seatExtension = finalCaseState.caseExtensions.find(
      (item) => item.definition.id === 'custom.rear_facing_seat_behind_driver',
    );
    expect(seatExtension?.definition.valueType).toBe('enum');
    expect(seatExtension?.definition.orderedValues).toEqual([
      'Driver seat must move forward',
      'Fits with driver seat back',
      'Fits with room to spare',
    ]);

    // --- "custom.rear_facing_seat_behind_driver persists as a typed case extension, creates
    // a case obligation, and does not change the compiled pack hash" ---
    const extension = seatExtension;
    expect(extension?.definition.confirmation).toBe('confirmed');
    expect(extension?.linkedObligationId).toBe(REAR_FACING_SEAT_OBLIGATION_ID);
    expect(rearFacingSeatObligation).toBeDefined();
    const packHashesSeen = new Set(
      trajectory.caseEvents
        .filter(
          (event): event is Extract<CaseEvent, { type: 'case.created' }> =>
            event.type === 'case.created',
        )
        .map((event) => event.payload.pack.compiledHash),
    );
    expect(packHashesSeen.size).toBe(1);
    expect(finalCaseState.pack.compiledHash).toBe([...packHashesSeen][0]);

    // --- "the recommendation changes after deal normalization and criteria reweighting" ---
    expect(finalCaseState.recommendation?.favoredOptionId).toBe('candidate-crv');
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
    ).toBe('candidate-rav4');

    // --- The ranking is the deterministic core's, not the model's ---
    //
    // CLAUDE.md gives the core "case state, evidence validity, readiness,
    // and human authority", and a ranking is a claim about a case. Until
    // `scoreCase` existed, the persisted recommendation carried
    // `confidence: 0.85` and `facts: []` -- a constant and an empty list,
    // both presented to a person as findings. These assertions prove, on
    // the real end-to-end trajectory rather than on unit fixtures, that
    // every number attached to the recommendation is now a reproducible
    // function of the case.
    const recommendation = finalCaseState.recommendation;
    expect(recommendation).toBeDefined();

    // Recomputing from the final snapshot must reproduce exactly what was
    // persisted during the run. If a constant had survived anywhere, or if
    // the engine and the workspace scored differently, this diverges.
    const recomputed = deriveScoredRecommendationFields(
      finalCaseState,
      recommendation?.favoredOptionId ?? null,
    );
    expect(recommendation?.confidence).toBe(recomputed.confidence);
    expect(recommendation?.facts).toEqual(recomputed.facts);
    expect(recommendation?.facts.length).toBeGreaterThan(0);

    // The scoreboard the workspace renders is the same computation.
    const board = scoreCaseState(finalCaseState);
    expect(board.options.length).toBeGreaterThan(1);
    const favored = board.options.find(
      (option) => option.optionId === recommendation?.favoredOptionId,
    );
    expect(favored?.total).not.toBeNull();

    // --- "an unknown is never a zero", proven against real fixture data ---
    //
    // The scenario deliberately leaves driving comfort and seat fit as
    // explicit unknowns (asserted above). The criteria that measure them
    // must therefore be reported as UNSCORED rather than scored zero, and
    // the resulting shortfall must show up as reduced coverage. A scorer
    // that quietly treated those unknowns as zeros would still produce a
    // ranking, a confidence figure, and a plausible-looking board -- this
    // is the assertion that catches it.
    const comfortLine = favored?.criteria.find(
      (line) => line.criterionId === 'pref.driving_comfort',
    );
    expect(comfortLine?.status).toBe('unknown');
    expect(comfortLine?.score).toBeNull();
    expect(favored?.coverage).toBeLessThan(1);
    expect(favored?.coverage).toBeGreaterThan(0);

    // Confidence is bounded by coverage, so an incompletely-researched
    // recommendation can never claim certainty.
    expect(recommendation?.confidence).toBeLessThan(1);
    expect(recommendation?.confidence).toBeGreaterThan(0);

    // --- "a disputed fact is not a settled one", proven against real
    // fixture data ---
    //
    // The Outback's `car.reliability_rating` lands `conflicted` in this
    // trajectory (the `car.safety_reliability` obligation ends
    // `accepted_uncertainty`), and it is a part of the composite
    // `pref.safety_reliability` criterion. Averaging a contested rating in
    // with two settled ones and reporting the result as settled is how a
    // dispute disappears into a ranking, so the whole line must read
    // `disputed`.
    const outback = board.options.find((option) => option.optionId === 'candidate-outback');
    const safetyLine = outback?.criteria.find(
      (line) => line.criterionId === 'pref.safety_reliability',
    );
    expect(safetyLine?.status).toBe('disputed');
    expect(safetyLine?.score).not.toBeNull();
    expect(outback?.disputedCriterionIds).toContain('pref.safety_reliability');

    // --- The model's favorite is NOT the deterministic leader here, and
    // the product says so ---
    //
    // Worth pinning as a scenario assertion rather than treating as an
    // accident of the fixtures: the model recommends the CR-V on grounds
    // (driving comfort, rear-facing seat fit) that nobody has established,
    // while the
    // Outback leads everything that WAS measured. Silently overwriting the
    // model's pick, or silently accepting it, would each hide a real
    // disagreement between two things this product asks people to trust.
    expect(recomputed.agreesWithScoreboard).toBe(false);
    expect(board.options[0]?.optionId).toBe('candidate-outback');
    expect(recommendation?.limitations.join(' ')).toContain('scoring your criteria puts');

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

    // --- queued/specialist/skill/tool/evidence/recommendation/completion
    // events appear, and case events are strictly ordered ---
    trajectory.caseEvents.forEach((event, index) => {
      if (index === 0) return;
      expect(event.sequence).toBeGreaterThan(trajectory.caseEvents[index - 1]!.sequence);
    });
    expect(trajectory.humanActions.length).toBeGreaterThan(0);
    expect(trajectory.toolCalls.length).toBeGreaterThan(0);
    expect(trajectory.skillActivations.length).toBeGreaterThan(0);

    // --- "reload produces the same decided snapshot" (replay every real
    // CaseEvent via applyCaseEvent from an empty case) ---
    let replayed: CaseState | null = null;
    for (const event of trajectory.caseEvents) {
      replayed = applyCaseEvent(replayed, event);
    }
    expect(replayed).not.toBeNull();
    // `attributeDefinitions` (`AppendOptions.seedSnapshot`) and
    // `selectedOptionId`/`selectedEvidenceId`/`sources`
    // (`CaseStore.updateSelection`'s `SelectionPatch`) are, by this
    // codebase's own documented design
    // (`apps/agent/src/store/case-store.ts`'s module comment), never
    // derivable from `CaseEvent` replay alone -- the real `CaseStore`
    // persists the full patched snapshot directly rather than re-deriving
    // these fields from the event log on every load. A real reload
    // (`CaseStore.load`) returns exactly that persisted snapshot, which is
    // what this test's own `finalCaseState` already came from throughout --
    // so the genuine "does replay of the real event-sourced fields agree
    // with what is actually persisted" proof is everything *except* those
    // three fields matching exactly, patched in from the same persisted
    // snapshot replay alone can never reconstruct.
    expect({ ...replayed, attributeDefinitions: [], selectedOptionId: null, sources: [] }).toEqual({
      ...finalCaseState,
      attributeDefinitions: [],
      selectedOptionId: null,
      sources: [],
    });

    // --- Write the required scenario artifacts ---
    const paths = writeScenarioArtifacts({
      scenarioId: 'car-purchase',
      finalCaseState,
      eventLog: trajectory.caseEvents,
      trajectory,
      assertionReport: report,
    });
    expect(paths.dir).toContain('car-purchase');
    expect(caseId).toBe(finalCaseState.id);
  });
});
