import { describe, expect, it } from 'vitest';
import type { CaseState } from '@sift/contracts';
import { checkAssertion, checkAssertions } from './assertions.js';
import { emptyScenarioTrajectory, type ScenarioTrajectory } from './trajectory.js';

function minimalCaseState(overrides: Partial<CaseState> = {}): CaseState {
  return {
    schemaVersion: '1.0',
    id: 'case-1',
    title: 'Choose our next car',
    status: 'investigating',
    pack: {
      id: 'car-purchase',
      version: '1.0.0',
      compiledHash: 'a'.repeat(64),
      selectedBy: 'router',
      reasons: ['matched'],
    },
    attributeDefinitions: [],
    entities: [],
    criteria: [],
    obligations: [],
    caseExtensions: [],
    claims: [],
    sources: [],
    evidenceLinks: [],
    recommendation: null,
    proposal: null,
    activeFocus: null,
    selectedOptionId: null,
    selectedEvidenceId: null,
    eventSequence: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('checkAssertion', () => {
  it('passes specialist_invoked when the specialist ran', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      specialistsInvoked: ['deal-analyst', 'source-challenger'],
    };
    const outcome = checkAssertion(trajectory, {
      kind: 'specialist_invoked',
      specialistId: 'source-challenger',
    });
    expect(outcome.passed).toBe(true);
  });

  it('fails specialist_invoked when the specialist never ran', () => {
    const trajectory = emptyScenarioTrajectory();
    const outcome = checkAssertion(trajectory, {
      kind: 'specialist_invoked',
      specialistId: 'source-challenger',
    });
    expect(outcome.passed).toBe(false);
  });

  it('checks recommendation against the final case state', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      finalCaseState: minimalCaseState({
        recommendation: {
          id: 'rec-1',
          status: 'ready',
          favoredOptionId: 'candidate-crv',
          rationale: 'because',
          facts: [],
          hypotheses: [],
          confidence: 0.8,
          limitations: [],
          sourceIds: [],
          resolvedObligationIds: [],
          acceptedUncertaintyObligationIds: [],
          generatedAt: '2026-01-01T00:00:00.000Z',
        },
      }),
    };
    expect(
      checkAssertion(trajectory, { kind: 'recommendation', favoredOptionId: 'candidate-crv' })
        .passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, { kind: 'recommendation', favoredOptionId: 'candidate-rav4' })
        .passed,
    ).toBe(false);
  });

  it('checks readiness against evaluateReadiness over the final case state', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      finalCaseState: minimalCaseState(),
    };
    const outcome = checkAssertion(trajectory, { kind: 'readiness', ready: true, blockers: [] });
    expect(outcome.passed).toBe(true); // vacuously ready: zero obligations
  });

  it('fails a readiness assertion, with a message reporting the actual readiness and blockers, when the expected readiness does not match', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      finalCaseState: minimalCaseState(), // vacuously ready: true, blockers: []
    };
    const outcome = checkAssertion(trajectory, { kind: 'readiness', ready: false, blockers: [] });
    expect(outcome.passed).toBe(false);
    expect(outcome.message).toBe('readiness is true (expected false); blockers: ');
  });

  it('forbidden_event_absent for decision.approved.actor.agent reads the dedicated counter', () => {
    const clean = emptyScenarioTrajectory();
    expect(
      checkAssertion(clean, {
        kind: 'forbidden_event_absent',
        eventType: 'decision.approved.actor.agent',
      }).passed,
    ).toBe(true);

    const tainted: ScenarioTrajectory = { ...clean, agentApprovedProposalAttempts: 1 };
    expect(
      checkAssertion(tainted, {
        kind: 'forbidden_event_absent',
        eventType: 'decision.approved.actor.agent',
      }).passed,
    ).toBe(false);
  });

  it('forbidden_event_absent for a real CaseEvent type scans the event log', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      caseEvents: [
        {
          eventId: 'e1',
          caseId: 'case-1',
          sequence: 1,
          timestamp: '2026-01-01T00:00:00.000Z',
          type: 'case.created',
          payload: {
            title: 'Choose our next car',
            pack: {
              id: 'car-purchase',
              version: '1.0.0',
              compiledHash: 'a'.repeat(64),
              selectedBy: 'router',
              reasons: [],
            },
          },
        },
      ],
    };
    expect(
      checkAssertion(trajectory, { kind: 'forbidden_event_absent', eventType: 'case.created' })
        .passed,
    ).toBe(false);
    expect(
      checkAssertion(trajectory, { kind: 'forbidden_event_absent', eventType: 'proposal.reviewed' })
        .passed,
    ).toBe(true);
  });

  it('redaction_canary_absent fails when the canary appears anywhere in the trajectory', () => {
    const clean = emptyScenarioTrajectory();
    expect(
      checkAssertion(clean, { kind: 'redaction_canary_absent', canary: 'SIFT_TEST_SECRET_X' })
        .passed,
    ).toBe(true);

    const tainted: ScenarioTrajectory = {
      ...clean,
      humanActions: [{ action: 'leaked SIFT_TEST_SECRET_X somehow' }],
    };
    expect(
      checkAssertion(tainted, { kind: 'redaction_canary_absent', canary: 'SIFT_TEST_SECRET_X' })
        .passed,
    ).toBe(false);
  });
});

describe('checkAssertion: every remaining kind, pass and fail branch', () => {
  it('pack_selected', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      packSelections: [{ packId: 'car-purchase', reasons: ['matched shortlisted vehicles'] }],
    };
    expect(
      checkAssertion(trajectory, {
        kind: 'pack_selected',
        packId: 'car-purchase',
        reasonIncludes: 'shortlisted',
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'pack_selected',
        packId: 'home-energy-guardian',
        reasonIncludes: 'shortlisted',
      }).passed,
    ).toBe(false);
  });

  it('case_extension_defined', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      extensionsDefined: [{ definitionId: 'custom.dog_crate_fit', origin: 'agent_proposed' }],
    };
    expect(
      checkAssertion(trajectory, {
        kind: 'case_extension_defined',
        definitionId: 'custom.dog_crate_fit',
        origin: 'agent_proposed',
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'case_extension_defined',
        definitionId: 'custom.dog_crate_fit',
        origin: 'user',
      }).passed,
    ).toBe(false);
  });

  it('case_obligation_created', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      obligationsCreated: [
        { obligationId: 'case.custom.dog_crate_fit', criterionId: 'custom.dog_crate_fit' },
      ],
    };
    expect(
      checkAssertion(trajectory, {
        kind: 'case_obligation_created',
        obligationId: 'case.custom.dog_crate_fit',
        criterionId: 'custom.dog_crate_fit',
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'case_obligation_created',
        obligationId: 'case.custom.dog_crate_fit',
        criterionId: 'other',
      }).passed,
    ).toBe(false);
  });

  it('skill_activated', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      skillActivations: [{ skillId: 'deal-analysis', obligationId: 'car.deal_normalization' }],
    };
    expect(
      checkAssertion(trajectory, {
        kind: 'skill_activated',
        skillId: 'deal-analysis',
        obligationId: 'car.deal_normalization',
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'skill_activated',
        skillId: 'deal-analysis',
        obligationId: 'car.household_fit',
      }).passed,
    ).toBe(false);
  });

  it('graph_node', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      graphNodes: ['deal-analyst'],
    };
    expect(checkAssertion(trajectory, { kind: 'graph_node', nodeId: 'deal-analyst' }).passed).toBe(
      true,
    );
    expect(
      checkAssertion(trajectory, { kind: 'graph_node', nodeId: 'source-challenger' }).passed,
    ).toBe(false);
  });

  it('swarm_handoff', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      swarmHandoffs: [{ from: 'weather-analyst', to: 'home-systems-analyst' }],
    };
    expect(
      checkAssertion(trajectory, {
        kind: 'swarm_handoff',
        from: 'weather-analyst',
        to: 'home-systems-analyst',
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'swarm_handoff',
        from: 'weather-analyst',
        to: 'rate-analyst',
      }).passed,
    ).toBe(false);
  });

  it('context_injected', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      contextInjections: [{ fields: ['activeObligation', 'criteria', 'evidenceInventory'] }],
    };
    expect(
      checkAssertion(trajectory, {
        kind: 'context_injected',
        fields: ['activeObligation', 'criteria'],
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, { kind: 'context_injected', fields: ['somethingMissing'] }).passed,
    ).toBe(false);
  });

  it('goal_validation_failed', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      goalValidationFailures: [{ reason: 'the response makes claims without citing a source id' }],
    };
    expect(
      checkAssertion(trajectory, {
        kind: 'goal_validation_failed',
        reasonIncludes: 'without citing a source',
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'goal_validation_failed',
        reasonIncludes: 'unrelated reason',
      }).passed,
    ).toBe(false);
  });

  it('goal_recovered requires both a matching failure and a later pass', () => {
    const failedOnly: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      goalValidationFailures: [{ reason: 'the response makes claims without citing a source id' }],
    };
    expect(
      checkAssertion(failedOnly, {
        kind: 'goal_recovered',
        reasonIncludes: 'without citing a source',
      }).passed,
    ).toBe(false);

    const recovered: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      goalValidationFailures: [{ reason: 'the response makes claims without citing a source id' }],
      goalValidationPasses: [{ attempt: 2 }],
    };
    expect(
      checkAssertion(recovered, {
        kind: 'goal_recovered',
        reasonIncludes: 'without citing a source',
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(recovered, { kind: 'goal_recovered', reasonIncludes: 'unrelated reason' })
        .passed,
    ).toBe(false);
  });

  it('snapshot_restored', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      snapshotRestorations: [{ caseId: 'case-1' }],
    };
    expect(checkAssertion(trajectory, { kind: 'snapshot_restored', caseId: 'case-1' }).passed).toBe(
      true,
    );
    expect(checkAssertion(trajectory, { kind: 'snapshot_restored', caseId: 'case-2' }).passed).toBe(
      false,
    );
  });

  it('debug_event_correlated', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      debugCorrelations: [{ eventName: 'tool.listing-reader', activityType: 'tool.completed' }],
    };
    expect(
      checkAssertion(trajectory, {
        kind: 'debug_event_correlated',
        eventName: 'tool.listing-reader',
        activityType: 'tool.completed',
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'debug_event_correlated',
        eventName: 'tool.listing-reader',
        activityType: 'tool.failed',
      }).passed,
    ).toBe(false);
  });

  it('tool_called without a count requires at least one call; with a count requires an exact match', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      toolCalls: [{ toolId: 'propose_recommendation' }, { toolId: 'propose_recommendation' }],
    };
    expect(
      checkAssertion(trajectory, { kind: 'tool_called', toolId: 'propose_recommendation' }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'tool_called',
        toolId: 'propose_recommendation',
        count: 2,
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'tool_called',
        toolId: 'propose_recommendation',
        count: 1,
      }).passed,
    ).toBe(false);
    expect(
      checkAssertion(trajectory, { kind: 'tool_called', toolId: 'listing-reader' }).passed,
    ).toBe(false);
  });

  it('intervention', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      interventions: [{ action: 'confirm', handler: 'ConsequenceGuard' }],
    };
    expect(
      checkAssertion(trajectory, {
        kind: 'intervention',
        action: 'confirm',
        handler: 'ConsequenceGuard',
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'intervention',
        action: 'deny',
        handler: 'ConsequenceGuard',
      }).passed,
    ).toBe(false);
  });

  it('claim_linked', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      claims: [{ claimId: 'claim-1', sourceIds: ['source-a', 'source-b'] }],
    };
    expect(
      checkAssertion(trajectory, {
        kind: 'claim_linked',
        claimId: 'claim-1',
        sourceIds: ['source-a'],
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'claim_linked',
        claimId: 'claim-1',
        sourceIds: ['source-c'],
      }).passed,
    ).toBe(false);
  });

  it('evidence_stale checks both the trajectory list and the final case state', () => {
    const viaTrajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      staleEvidenceIds: ['ev-1'],
    };
    expect(
      checkAssertion(viaTrajectory, { kind: 'evidence_stale', evidenceId: 'ev-1' }).passed,
    ).toBe(true);
    expect(
      checkAssertion(viaTrajectory, { kind: 'evidence_stale', evidenceId: 'ev-2' }).passed,
    ).toBe(false);

    const viaCaseState: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      finalCaseState: minimalCaseState({
        evidenceLinks: [
          {
            id: 'ev-3',
            obligationId: 'car.deal_normalization',
            level: 'E1',
            verdict: 'degraded',
            disposition: 'included',
            summary: 'x',
            stale: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    };
    expect(
      checkAssertion(viaCaseState, { kind: 'evidence_stale', evidenceId: 'ev-3' }).passed,
    ).toBe(true);
  });

  it('obligation_status', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      finalCaseState: minimalCaseState({
        obligations: [
          {
            id: 'car.deal_normalization',
            label: 'Deal normalization',
            question: 'x?',
            category: 'deal',
            required: true,
            priority: 80,
            requiredEvidenceLevel: 'E2',
            maxAttempts: 2,
            acceptedUncertaintyAllowed: false,
            dependsOn: [],
            preferredSkills: [],
            preferredSpecialists: [],
            completionRule: {
              minimumEvidenceLevel: 'E2',
              minimumIndependentSources: 2,
              acceptedUncertaintyAllowed: false,
            },
            origin: 'pack',
            status: 'satisfied',
            attemptsUsed: 1,
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    };
    expect(
      checkAssertion(trajectory, {
        kind: 'obligation_status',
        obligationId: 'car.deal_normalization',
        status: 'satisfied',
      }).passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, {
        kind: 'obligation_status',
        obligationId: 'car.deal_normalization',
        status: 'blocked',
      }).passed,
    ).toBe(false);
    expect(
      checkAssertion(trajectory, {
        kind: 'obligation_status',
        obligationId: 'missing',
        status: 'open',
      }).passed,
    ).toBe(false);
  });

  it('human_action', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      humanActions: [{ action: 'approve_proposal:candidate-crv' }],
    };
    expect(
      checkAssertion(trajectory, { kind: 'human_action', action: 'approve_proposal:candidate-crv' })
        .passed,
    ).toBe(true);
    expect(
      checkAssertion(trajectory, { kind: 'human_action', action: 'reject_proposal' }).passed,
    ).toBe(false);
  });

  it('forbidden_event_absent for a real event type that never appears', () => {
    const trajectory = emptyScenarioTrajectory();
    expect(
      checkAssertion(trajectory, { kind: 'forbidden_event_absent', eventType: 'proposal.reviewed' })
        .passed,
    ).toBe(true);
  });

  it('readiness fails when the final case state is missing', () => {
    const trajectory = emptyScenarioTrajectory();
    const outcome = checkAssertion(trajectory, { kind: 'readiness', ready: true, blockers: [] });
    expect(outcome.passed).toBe(false);
    expect(outcome.message).toContain('no final case state');
  });

  it('recommendation fails when there is no final case state', () => {
    const trajectory = emptyScenarioTrajectory();
    expect(
      checkAssertion(trajectory, { kind: 'recommendation', favoredOptionId: 'candidate-crv' })
        .passed,
    ).toBe(false);
  });
});

describe('checkAssertions', () => {
  it('passes only when every assertion passes', () => {
    const trajectory: ScenarioTrajectory = {
      ...emptyScenarioTrajectory(),
      specialistsInvoked: ['deal-analyst'],
    };
    const report = checkAssertions(trajectory, [
      { kind: 'specialist_invoked', specialistId: 'deal-analyst' },
      { kind: 'specialist_invoked', specialistId: 'source-challenger' },
    ]);
    expect(report.passed).toBe(false);
    expect(report.results).toHaveLength(2);
    expect(report.results[0]?.passed).toBe(true);
    expect(report.results[1]?.passed).toBe(false);
  });
});
