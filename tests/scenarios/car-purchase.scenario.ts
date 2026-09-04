/**
 * The declarative `DemoScenario` for "Choose Our Next Car"
 * (docs/specs/testing.md "Scenario tests", `@sift/contracts` `scenario.ts`).
 *
 * `steps` documents the human/WebMCP-facing command sequence
 * (docs/specs/demos-and-submission.md "Required sequence") in the
 * `SCENARIO_COMMAND_NAMES` vocabulary the contracts package defines. Real
 * `caseId`/`expectedSequence` values are only known once the case actually
 * exists (assigned by the injected `IdGenerator` at run time), so the values
 * below are illustrative placeholders -- the real engine
 * (`apps/agent/src/runtime/car-purchase-scenario.ts`, driven by
 * `tests/scenarios/car-purchase.scenario.test.ts`) resolves the genuine
 * values itself rather than replaying these literally. This mirrors
 * `packages/scenarios/src/runner.ts`'s own documented scope: a fuller
 * generic runner that threads real ids between declarative steps for an
 * arbitrary pack is explicit, later follow-up work.
 *
 * `assertions` is what the scenario test actively checks (via
 * `@sift/scenarios`'s `checkAssertions`) against the real trajectory
 * `runCarPurchaseScenario` produces. Every kind here uses a stable,
 * predictable id (a specialist id, a pack-declared obligation id, a fixed
 * candidate id, ...) rather than a counter-generated one; a small number of
 * assertions that genuinely need a runtime-generated id (the specific stale
 * `EvidenceLink` id, the specific `Claim` id) are checked directly in the
 * test file from the trajectory's own recorded ids instead of duplicated
 * here as guessed literals.
 */
import type { DemoScenario } from '../../packages/contracts/src/index.js';
import { REAR_FACING_SEAT_OBLIGATION_ID } from '../../apps/agent/src/runtime/scripted-beats/car-purchase.js';
import { REAR_FACING_SEAT_GRADES } from '../../apps/agent/src/runtime/car-purchase-scenario.js';

export const CAR_PURCHASE_DEMO_SCENARIO: DemoScenario = {
  id: 'car-purchase-demo',
  packId: 'car-purchase',
  seed: {
    demoId: 'car-purchase',
    fixtureBundleId: 'car-purchase',
    clockIso: '2026-08-27T00:00:00.000Z',
  },
  steps: [
    {
      command: 'startDemo',
      input: { demoId: 'car-purchase' },
      description: 'Start the Choose Our Next Car demo.',
    },
    {
      command: 'focusOption',
      input: { caseId: 'case-1', optionId: 'candidate-rav4', expectedSequence: 0 },
      description: 'The user selects candidate-rav4 in the page.',
    },
    {
      command: 'requestInvestigation',
      input: { caseId: 'case-1', obligationId: 'car.deal_normalization', expectedSequence: 0 },
      description: 'ChatGPT calls sift_get_case_context, then requests focused deal investigation.',
    },
    {
      command: 'updateCriteria',
      input: {
        caseId: 'case-1',
        expectedSequence: 0,
        operations: [
          { op: 'reweight', criterionId: 'pref.driving_comfort', weight: 25 },
          { op: 'reweight', criterionId: 'pref.ownership_cost', weight: 15 },
        ],
      },
      description: 'Driving comfort matters more to us than fuel economy.',
    },
    {
      command: 'defineCaseAttribute',
      input: {
        caseId: 'case-1',
        expectedSequence: 0,
        definition: {
          id: 'custom.rear_facing_seat_behind_driver',
          label: 'Rear-facing seat fits behind the driver',
          valueType: 'enum',
          appliesTo: ['candidate'],
          allowedValues: [...REAR_FACING_SEAT_GRADES],
          orderedValues: [...REAR_FACING_SEAT_GRADES],
          evidenceExpectation: 'verification',
          comparison: 'higher_better',
          reason:
            "A second child arrives in three months; a rear-facing seat has to go behind the driver without pushing the driver's seat forward.",
        },
      },
      description:
        'ChatGPT calls sift_define_case_attribute for the rear-facing-car-seat requirement.',
    },
    {
      command: 'reviewCaseExtension',
      input: { caseId: 'case-1', extensionId: 'ext-1', decision: 'confirm', expectedSequence: 0 },
      description: 'The user confirms the new case-specific concern through the visible UI.',
    },
    {
      command: 'updateCriteria',
      input: {
        caseId: 'case-1',
        expectedSequence: 0,
        operations: [
          {
            op: 'add',
            criterion: {
              id: 'custom.rear_facing_seat_behind_driver',
              label: 'Rear-facing seat fits behind the driver',
              kind: 'hard_constraint',
              weight: 20,
              direction: 'higher_better',
              appliesToAttribute: 'custom.rear_facing_seat_behind_driver',
            },
          },
        ],
      },
      description: 'ChatGPT calls sift_update_criteria to add the new rear-facing-seat criterion.',
    },
    {
      command: 'reviewProposal',
      input: {
        caseId: 'case-1',
        proposalId: 'proposal-1',
        actor: 'human',
        decision: 'approve',
        expectedSequence: 0,
      },
      description:
        'The user approves the shortlist (candidate-crv + candidate-outback) through the visible UI.',
    },
  ],
  assertions: [
    { kind: 'pack_selected', packId: 'car-purchase', reasonIncludes: 'shortlisted vehicles' },
    { kind: 'specialist_invoked', specialistId: 'deal-analyst' },
    { kind: 'specialist_invoked', specialistId: 'ownership-cost-analyst' },
    { kind: 'specialist_invoked', specialistId: 'safety-reliability-analyst' },
    { kind: 'specialist_invoked', specialistId: 'household-fit-analyst' },
    { kind: 'specialist_invoked', specialistId: 'source-challenger' },
    { kind: 'specialist_invoked', specialistId: 'decision-synthesizer' },
    { kind: 'graph_node', nodeId: 'deal-analyst' },
    { kind: 'graph_node', nodeId: 'ownership-cost-analyst' },
    { kind: 'graph_node', nodeId: 'safety-reliability-analyst' },
    { kind: 'graph_node', nodeId: 'household-fit-analyst' },
    { kind: 'graph_node', nodeId: 'source-challenger' },
    { kind: 'graph_node', nodeId: 'decision-synthesizer' },
    {
      kind: 'skill_activated',
      skillId: 'listing-normalizer',
      obligationId: 'car.deal_normalization',
    },
    { kind: 'skill_activated', skillId: 'deal-analysis', obligationId: 'car.deal_normalization' },
    { kind: 'skill_activated', skillId: 'ownership-cost', obligationId: 'car.ownership_cost' },
    {
      kind: 'skill_activated',
      skillId: 'safety-reliability',
      obligationId: 'car.safety_reliability',
    },
    { kind: 'skill_activated', skillId: 'household-fit', obligationId: 'car.household_fit' },
    { kind: 'context_injected', fields: ['activeObligation', 'evidenceInventory', 'criteria'] },
    { kind: 'tool_called', toolId: 'listing-reader' },
    { kind: 'tool_called', toolId: 'ownership-calculator' },
    { kind: 'tool_called', toolId: 'safety-reliability-lookup' },
    { kind: 'tool_called', toolId: 'household-fit-matrix' },
    { kind: 'tool_called', toolId: 'propose_recommendation', count: 2 },
    { kind: 'intervention', action: 'confirm', handler: 'ConsequenceGuard' },
    {
      kind: 'case_extension_defined',
      definitionId: 'custom.rear_facing_seat_behind_driver',
      origin: 'agent_proposed',
    },
    {
      kind: 'case_obligation_created',
      obligationId: REAR_FACING_SEAT_OBLIGATION_ID,
      criterionId: 'custom.rear_facing_seat_behind_driver',
    },
    { kind: 'obligation_status', obligationId: 'car.deal_normalization', status: 'satisfied' },
    { kind: 'obligation_status', obligationId: 'car.hard_constraints', status: 'satisfied' },
    {
      kind: 'obligation_status',
      obligationId: 'car.safety_reliability',
      status: 'accepted_uncertainty',
    },
    { kind: 'obligation_status', obligationId: 'car.household_fit', status: 'satisfied' },
    {
      kind: 'obligation_status',
      obligationId: REAR_FACING_SEAT_OBLIGATION_ID,
      status: 'satisfied',
    },
    { kind: 'obligation_status', obligationId: 'car.shortlist', status: 'satisfied' },
    { kind: 'readiness', ready: true, blockers: [] },
    { kind: 'recommendation', favoredOptionId: 'candidate-crv' },
    { kind: 'human_action', action: 'focus_option:candidate-rav4' },
    {
      kind: 'human_action',
      action: 'confirm_case_extension:custom.rear_facing_seat_behind_driver',
    },
    { kind: 'human_action', action: 'approve_proposal:candidate-crv+candidate-outback' },
    { kind: 'forbidden_event_absent', eventType: 'decision.approved.actor.agent' },
  ],
};
