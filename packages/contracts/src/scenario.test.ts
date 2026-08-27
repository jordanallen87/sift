import { describe, expect, it } from 'vitest';
import { DemoScenarioSchema, ScenarioAssertionSchema, ScenarioStepSchema } from './scenario.js';

describe('ScenarioStepSchema', () => {
  it('parses a valid step naming a real PaxCommands method', () => {
    const result = ScenarioStepSchema.safeParse({
      command: 'upsertOption',
      input: {
        caseId: 'case-1',
        expectedSequence: 1,
        option: { label: 'x', kind: 'car', attributes: [] },
      },
      description: 'Add the first candidate car.',
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects a command name that is not a real PaxCommands method', () => {
    expect(ScenarioStepSchema.safeParse({ command: 'deleteCase', input: {} }).success).toBe(false);
  });
});

describe('ScenarioAssertionSchema', () => {
  const cases: unknown[] = [
    { kind: 'pack_selected', packId: 'car-purchase', reasonIncludes: 'User selected' },
    { kind: 'case_extension_defined', definitionId: 'custom.dog_crate_fit', origin: 'user' },
    {
      kind: 'case_obligation_created',
      obligationId: 'case.case-1.dog-crate-fit',
      criterionId: 'custom.dog_crate_fit',
    },
    { kind: 'skill_activated', skillId: 'deal-analysis', obligationId: 'car.deal_normalization' },
    { kind: 'specialist_invoked', specialistId: 'deal-analyst' },
    { kind: 'graph_node', nodeId: 'deal-analyst' },
    { kind: 'swarm_handoff', from: 'weather-analyst', to: 'home-systems-analyst' },
    { kind: 'context_injected', fields: ['criteria', 'evidenceInventory'] },
    { kind: 'goal_validation_failed', reasonIncludes: 'missing source linkage' },
    { kind: 'goal_recovered', reasonIncludes: 'missing source linkage' },
    { kind: 'snapshot_restored', caseId: 'case-1' },
    { kind: 'debug_event_correlated', eventName: 'tool.finish', activityType: 'tool.completed' },
    { kind: 'redaction_canary_absent', canary: 'SECRET_CANARY_1' },
    { kind: 'tool_called', toolId: 'listing-reader', count: 2 },
    { kind: 'tool_called', toolId: 'listing-reader' },
    { kind: 'intervention', action: 'guide', handler: 'RetrySteering' },
    { kind: 'claim_linked', claimId: 'claim-1', sourceIds: ['src-1', 'src-2'] },
    { kind: 'evidence_stale', evidenceId: 'ev-1' },
    { kind: 'obligation_status', obligationId: 'car.deal_normalization', status: 'satisfied' },
    { kind: 'readiness', ready: false, blockers: ['car.household_fit'] },
    { kind: 'recommendation', favoredOptionId: 'car-1' },
    { kind: 'human_action', action: 'approve' },
    { kind: 'forbidden_event_absent', eventType: 'proposal.auto_approved' },
  ];

  it.each(cases.map((value) => [value] as const))('parses %j', (value) => {
    const result = ScenarioAssertionSchema.safeParse(value);
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an unlisted assertion kind', () => {
    expect(ScenarioAssertionSchema.safeParse({ kind: 'vibes_check' }).success).toBe(false);
  });

  it('rejects an intervention assertion with an unlisted action', () => {
    expect(
      ScenarioAssertionSchema.safeParse({ kind: 'intervention', action: 'allow', handler: 'x' })
        .success,
    ).toBe(false);
  });
});

describe('DemoScenarioSchema', () => {
  it('parses a minimal, valid demo scenario', () => {
    const result = DemoScenarioSchema.safeParse({
      id: 'car-purchase-happy-path',
      packId: 'car-purchase',
      seed: {
        demoId: 'car-purchase',
        fixtureBundleId: 'car-purchase-default',
        clockIso: '2026-08-27T00:00:00.000Z',
      },
      steps: [{ command: 'startDemo', input: { demoId: 'car-purchase' } }],
      assertions: [
        { kind: 'pack_selected', packId: 'car-purchase', reasonIncludes: 'User selected' },
      ],
    });
    expect(result.success, JSON.stringify('error' in result ? result.error : null)).toBe(true);
  });

  it('rejects an unrecognized top-level key', () => {
    expect(
      DemoScenarioSchema.safeParse({
        id: 'x',
        packId: 'car-purchase',
        seed: {
          demoId: 'car-purchase',
          fixtureBundleId: 'x',
          clockIso: '2026-08-27T00:00:00.000Z',
        },
        steps: [],
        assertions: [],
        extra: true,
      }).success,
    ).toBe(false);
  });
});
