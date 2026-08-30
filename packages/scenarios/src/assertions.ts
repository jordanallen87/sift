/**
 * `checkAssertion`/`checkAssertions`: evaluates every `ScenarioAssertion`
 * kind (`@sift/contracts` `scenario.ts`, docs/specs/testing.md "Scenario
 * tests") against an observed `ScenarioTrajectory` (`trajectory.ts`) plus
 * its `finalCaseState`.
 *
 * Pure and apps-agnostic -- see `trajectory.ts`'s header for why this file
 * never imports `@strands-agents/sdk` or an `apps/agent` module.
 */
import { evaluateReadiness } from '@sift/core';
import type { ScenarioAssertion } from '@sift/contracts';
import type { ScenarioTrajectory } from './trajectory.js';

export interface AssertionCheckResult {
  readonly assertion: ScenarioAssertion;
  readonly passed: boolean;
  readonly message: string;
}

export interface AssertionReport {
  readonly passed: boolean;
  readonly results: readonly AssertionCheckResult[];
}

function result(
  assertion: ScenarioAssertion,
  passed: boolean,
  message: string,
): AssertionCheckResult {
  return { assertion, passed, message };
}

/** Evaluates exactly one `ScenarioAssertion` against `trajectory`. */
export function checkAssertion(
  trajectory: ScenarioTrajectory,
  assertion: ScenarioAssertion,
): AssertionCheckResult {
  const caseState = trajectory.finalCaseState;

  switch (assertion.kind) {
    case 'pack_selected': {
      const match = trajectory.packSelections.find(
        (selection) =>
          selection.packId === assertion.packId &&
          selection.reasons.some((reason) => reason.includes(assertion.reasonIncludes)),
      );
      return result(
        assertion,
        match !== undefined,
        match !== undefined
          ? `pack "${assertion.packId}" was selected with a reason including "${assertion.reasonIncludes}"`
          : `no pack selection for "${assertion.packId}" included a reason containing "${assertion.reasonIncludes}"`,
      );
    }

    case 'case_extension_defined': {
      const match = trajectory.extensionsDefined.some(
        (extension) =>
          extension.definitionId === assertion.definitionId &&
          extension.origin === assertion.origin,
      );
      return result(
        assertion,
        match,
        match
          ? `case extension "${assertion.definitionId}" was defined with origin "${assertion.origin}"`
          : `case extension "${assertion.definitionId}" with origin "${assertion.origin}" was never defined`,
      );
    }

    case 'case_obligation_created': {
      const match = trajectory.obligationsCreated.some(
        (obligation) =>
          obligation.obligationId === assertion.obligationId &&
          obligation.criterionId === assertion.criterionId,
      );
      return result(
        assertion,
        match,
        match
          ? `obligation "${assertion.obligationId}" was created from criterion "${assertion.criterionId}"`
          : `no obligation "${assertion.obligationId}" linked to criterion "${assertion.criterionId}" was created`,
      );
    }

    case 'skill_activated': {
      const match = trajectory.skillActivations.some(
        (activation) =>
          activation.skillId === assertion.skillId &&
          activation.obligationId === assertion.obligationId,
      );
      return result(
        assertion,
        match,
        match
          ? `skill "${assertion.skillId}" was activated for obligation "${assertion.obligationId}"`
          : `skill "${assertion.skillId}" was never activated for obligation "${assertion.obligationId}"`,
      );
    }

    case 'specialist_invoked': {
      const match = trajectory.specialistsInvoked.includes(assertion.specialistId);
      return result(
        assertion,
        match,
        match
          ? `specialist "${assertion.specialistId}" was invoked`
          : `specialist "${assertion.specialistId}" was never invoked`,
      );
    }

    case 'graph_node': {
      const match = trajectory.graphNodes.includes(assertion.nodeId);
      return result(
        assertion,
        match,
        match
          ? `graph node "${assertion.nodeId}" executed`
          : `graph node "${assertion.nodeId}" never executed`,
      );
    }

    case 'swarm_handoff': {
      const match = trajectory.swarmHandoffs.some(
        (handoff) => handoff.from === assertion.from && handoff.to === assertion.to,
      );
      return result(
        assertion,
        match,
        match
          ? `a swarm handoff from "${assertion.from}" to "${assertion.to}" occurred`
          : `no swarm handoff from "${assertion.from}" to "${assertion.to}" occurred`,
      );
    }

    case 'context_injected': {
      const match = trajectory.contextInjections.some((injection) =>
        assertion.fields.every((field) => injection.fields.includes(field)),
      );
      return result(
        assertion,
        match,
        match
          ? `context was injected with fields [${assertion.fields.join(', ')}]`
          : `no context injection carried every field in [${assertion.fields.join(', ')}]`,
      );
    }

    case 'goal_validation_failed': {
      const match = trajectory.goalValidationFailures.some((failure) =>
        failure.reason.includes(assertion.reasonIncludes),
      );
      return result(
        assertion,
        match,
        match
          ? `a goal validation failure included "${assertion.reasonIncludes}"`
          : `no goal validation failure included "${assertion.reasonIncludes}"`,
      );
    }

    case 'goal_recovered': {
      const failed = trajectory.goalValidationFailures.some((failure) =>
        failure.reason.includes(assertion.reasonIncludes),
      );
      const recovered = failed && trajectory.goalValidationPasses.length > 0;
      return result(
        assertion,
        recovered,
        recovered
          ? `a goal validation failure included "${assertion.reasonIncludes}" and a later attempt passed`
          : !failed
            ? `no goal validation failure included "${assertion.reasonIncludes}"`
            : `a goal validation failure included "${assertion.reasonIncludes}" but no later attempt passed`,
      );
    }

    case 'snapshot_restored': {
      const match = trajectory.snapshotRestorations.some(
        (restoration) => restoration.caseId === assertion.caseId,
      );
      return result(
        assertion,
        match,
        match
          ? `a session snapshot was restored for case "${assertion.caseId}"`
          : `no session snapshot was restored for case "${assertion.caseId}"`,
      );
    }

    case 'debug_event_correlated': {
      const match = trajectory.debugCorrelations.some(
        (correlation) =>
          correlation.eventName === assertion.eventName &&
          correlation.activityType === assertion.activityType,
      );
      return result(
        assertion,
        match,
        match
          ? `debug event "${assertion.eventName}" correlated with activity type "${assertion.activityType}"`
          : `debug event "${assertion.eventName}" never correlated with activity type "${assertion.activityType}"`,
      );
    }

    case 'redaction_canary_absent': {
      const serialized = JSON.stringify(trajectory);
      const found = serialized.includes(assertion.canary);
      return result(
        assertion,
        !found,
        !found
          ? `redaction canary "${assertion.canary}" never appeared in the trajectory`
          : `redaction canary "${assertion.canary}" leaked into the trajectory`,
      );
    }

    case 'tool_called': {
      const count = trajectory.toolCalls.filter((call) => call.toolId === assertion.toolId).length;
      const passed = assertion.count === undefined ? count > 0 : count === assertion.count;
      return result(
        assertion,
        passed,
        passed
          ? `tool "${assertion.toolId}" was called ${count} time(s)`
          : `tool "${assertion.toolId}" was called ${count} time(s), expected ${assertion.count ?? 'at least 1'}`,
      );
    }

    case 'intervention': {
      const match = trajectory.interventions.some(
        (intervention) =>
          intervention.action === assertion.action && intervention.handler === assertion.handler,
      );
      return result(
        assertion,
        match,
        match
          ? `handler "${assertion.handler}" produced a "${assertion.action}" intervention`
          : `handler "${assertion.handler}" never produced a "${assertion.action}" intervention`,
      );
    }

    case 'claim_linked': {
      const match = trajectory.claims.some(
        (claim) =>
          claim.claimId === assertion.claimId &&
          assertion.sourceIds.every((sourceId) => claim.sourceIds.includes(sourceId)),
      );
      return result(
        assertion,
        match,
        match
          ? `claim "${assertion.claimId}" is linked to source(s) [${assertion.sourceIds.join(', ')}]`
          : `claim "${assertion.claimId}" is not linked to every source in [${assertion.sourceIds.join(', ')}]`,
      );
    }

    case 'evidence_stale': {
      const fromCaseState = caseState?.evidenceLinks.find(
        (link) => link.id === assertion.evidenceId,
      )?.stale;
      const match =
        fromCaseState === true || trajectory.staleEvidenceIds.includes(assertion.evidenceId);
      return result(
        assertion,
        match,
        match
          ? `evidence "${assertion.evidenceId}" is stale`
          : `evidence "${assertion.evidenceId}" is not stale`,
      );
    }

    case 'obligation_status': {
      const obligation = caseState?.obligations.find((item) => item.id === assertion.obligationId);
      const match = obligation?.status === assertion.status;
      return result(
        assertion,
        match,
        match
          ? `obligation "${assertion.obligationId}" has status "${assertion.status}"`
          : `obligation "${assertion.obligationId}" has status "${obligation?.status ?? '(missing)'}", expected "${assertion.status}"`,
      );
    }

    case 'readiness': {
      if (caseState === undefined) {
        return result(assertion, false, 'no final case state was recorded');
      }
      const readiness = evaluateReadiness(caseState);
      const blockersMatch = assertion.blockers.every((blocker) =>
        readiness.blockers.some((actual) => actual.includes(blocker)),
      );
      const passed = readiness.ready === assertion.ready && blockersMatch;
      return result(
        assertion,
        passed,
        passed
          ? `readiness is ${readiness.ready} with the expected blockers`
          : `readiness is ${readiness.ready} (expected ${assertion.ready}); blockers: ${readiness.blockers.join(' | ')}`,
      );
    }

    case 'recommendation': {
      const match = caseState?.recommendation?.favoredOptionId === assertion.favoredOptionId;
      return result(
        assertion,
        match,
        match
          ? `recommendation favors "${assertion.favoredOptionId}"`
          : `recommendation favors "${caseState?.recommendation?.favoredOptionId ?? '(none)'}", expected "${assertion.favoredOptionId}"`,
      );
    }

    case 'human_action': {
      const match = trajectory.humanActions.some((action) => action.action === assertion.action);
      return result(
        assertion,
        match,
        match
          ? `human action "${assertion.action}" occurred`
          : `human action "${assertion.action}" never occurred`,
      );
    }

    case 'forbidden_event_absent': {
      if (assertion.eventType === 'decision.approved.actor.agent') {
        const passed = trajectory.agentApprovedProposalAttempts === 0;
        return result(
          assertion,
          passed,
          passed
            ? 'no proposal was ever approved with actor "agent"'
            : `${trajectory.agentApprovedProposalAttempts} proposal(s) were approved with actor "agent"`,
        );
      }
      const found = trajectory.caseEvents.some((event) => event.type === assertion.eventType);
      return result(
        assertion,
        !found,
        !found
          ? `event type "${assertion.eventType}" never appears in the case event log`
          : `event type "${assertion.eventType}" appears in the case event log`,
      );
    }
  }
}

/** Evaluates every `ScenarioAssertion`, returning a report where `passed` is true only when every assertion passed. */
export function checkAssertions(
  trajectory: ScenarioTrajectory,
  assertions: readonly ScenarioAssertion[],
): AssertionReport {
  const results = assertions.map((assertion) => checkAssertion(trajectory, assertion));
  return { passed: results.every((entry) => entry.passed), results };
}
