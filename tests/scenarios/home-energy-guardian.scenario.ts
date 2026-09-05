/**
 * The declarative `DemoScenario` for "Home Energy Guardian"
 * (docs/specs/testing.md "Scenario tests", `@sift/contracts` `scenario.ts`),
 * the Swarm-hero analog of `car-purchase.scenario.ts`.
 *
 * `steps` documents the human/WebMCP-facing command sequence
 * (docs/specs/demos-and-submission.md "Home Energy Guardian scenario" ->
 * "Required sequence") in the `SCENARIO_COMMAND_NAMES` vocabulary the
 * contracts package defines. Real `caseId`/`proposalId`/`expectedSequence`
 * values are only known once the case actually exists (assigned by the
 * injected `IdGenerator` at run time), so the values below are illustrative
 * placeholders -- the real engine
 * (`apps/agent/src/runtime/home-energy-guardian-scenario.ts`, driven by
 * `tests/scenarios/home-energy-guardian.scenario.test.ts`) resolves the
 * genuine values itself rather than replaying these literally, exactly
 * mirroring `car-purchase.scenario.ts`'s own documented scope.
 *
 * `assertions` is what the scenario test actively checks (via
 * `@sift/scenarios`'s `checkAssertions`) against the real trajectory
 * `runHomeEnergyGuardianScenario` produces. Every kind here uses a stable,
 * predictable id (a specialist id, a pack-declared obligation id, a fixed
 * response-option id, ...) rather than a counter-generated one; the one
 * assertion that genuinely needs a runtime-generated id
 * (`snapshot_restored`'s real `caseId`) is checked directly in the test file
 * from the trajectory's own recorded case id instead of duplicated here as a
 * guessed literal, exactly mirroring `car-purchase.scenario.ts`'s own
 * documented rationale for its `evidence_stale`/`claim_linked` checks.
 */
import type { DemoScenario } from '../../packages/contracts/src/index.js';

export const HOME_ENERGY_GUARDIAN_DEMO_SCENARIO: DemoScenario = {
  id: 'home-energy-guardian-demo',
  packId: 'home-energy-guardian',
  seed: {
    demoId: 'home-energy-guardian',
    fixtureBundleId: 'energy',
    clockIso: '2026-08-27T00:00:00.000Z',
  },
  steps: [
    {
      command: 'startDemo',
      input: { demoId: 'home-energy-guardian' },
      description: 'A deterministic watcher creates the case after detecting the 42% bill anomaly.',
    },
    {
      command: 'updateCriteria',
      input: {
        caseId: 'case-1',
        expectedSequence: 0,
        operations: [
          { op: 'reweight', criterionId: 'energy.cost', weight: 20 },
          { op: 'reweight', criterionId: 'energy.conservation', weight: 80 },
        ],
      },
      description: 'Long-term waste matters more than the cheapest immediate option.',
    },
    {
      command: 'requestInvestigation',
      input: { caseId: 'case-1', obligationId: 'energy.response_options', expectedSequence: 0 },
      description: 'ChatGPT calls sift_update_criteria, then sift_request_investigation.',
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
        'The user approves requesting an HVAC/thermostat inspection through the visible UI.',
    },
  ],
  assertions: [
    {
      kind: 'pack_selected',
      packId: 'home-energy-guardian',
      reasonIncludes: 'home-energy-guardian',
    },
    { kind: 'specialist_invoked', specialistId: 'anomaly-investigator' },
    { kind: 'specialist_invoked', specialistId: 'rate-analyst' },
    { kind: 'specialist_invoked', specialistId: 'weather-analyst' },
    { kind: 'specialist_invoked', specialistId: 'home-systems-analyst' },
    { kind: 'specialist_invoked', specialistId: 'source-challenger' },
    { kind: 'specialist_invoked', specialistId: 'decision-synthesizer' },
    { kind: 'skill_activated', skillId: 'bill-normalizer', obligationId: 'energy.anomaly' },
    { kind: 'skill_activated', skillId: 'rate-plan-analysis', obligationId: 'energy.rate_change' },
    { kind: 'skill_activated', skillId: 'weather-comparison', obligationId: 'energy.weather' },
    {
      kind: 'skill_activated',
      skillId: 'home-event-correlation',
      obligationId: 'energy.household_change',
    },
    { kind: 'context_injected', fields: ['activeObligation', 'evidenceInventory', 'criteria'] },
    { kind: 'tool_called', toolId: 'bill-reader' },
    { kind: 'tool_called', toolId: 'tariff-lookup' },
    { kind: 'tool_called', toolId: 'calculator' },
    { kind: 'tool_called', toolId: 'weather-lookup' },
    { kind: 'tool_called', toolId: 'household-event-lookup' },
    { kind: 'tool_called', toolId: 'propose_inspection', count: 1 },
    { kind: 'intervention', action: 'guide', handler: 'RetrySteering' },
    { kind: 'intervention', action: 'confirm', handler: 'ConsequenceGuard' },
    // The third of the three intervention outcomes docs/engineering-principles.md
    // requires to be visible. `anomaly-investigator` reaches for
    // `household-event-lookup` -- granted to `home-systems-analyst`, not to
    // it -- and ScopeAuthorization denies the call before it executes. Until
    // 2026-09-05 this was proven only by a unit test that patched the
    // provider on purpose, so `deny` appeared in no report a judge reads.
    { kind: 'intervention', action: 'deny', handler: 'ScopeAuthorization' },
    { kind: 'swarm_handoff', from: 'weather-analyst', to: 'home-systems-analyst' },
    { kind: 'goal_validation_failed', reasonIncludes: 'cite at least one source' },
    { kind: 'goal_recovered', reasonIncludes: 'cite at least one source' },
    { kind: 'obligation_status', obligationId: 'energy.anomaly', status: 'satisfied' },
    { kind: 'obligation_status', obligationId: 'energy.rate_change', status: 'satisfied' },
    { kind: 'obligation_status', obligationId: 'energy.weather', status: 'satisfied' },
    { kind: 'obligation_status', obligationId: 'energy.household_change', status: 'satisfied' },
    { kind: 'obligation_status', obligationId: 'energy.response_options', status: 'satisfied' },
    { kind: 'readiness', ready: true, blockers: [] },
    { kind: 'recommendation', favoredOptionId: 'request-hvac-inspection' },
    { kind: 'human_action', action: 'update_criteria:cost_to_conservation' },
    { kind: 'human_action', action: 'approve_proposal:request-hvac-inspection' },
    { kind: 'forbidden_event_absent', eventType: 'decision.approved.actor.agent' },
  ],
};
