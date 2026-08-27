/**
 * Focused unit tests for `home-energy-guardian-scenario.ts`'s pure/near-pure
 * helper functions, exercised directly rather than only incidentally through
 * the full two-round scenario run
 * (`tests/scenarios/home-energy-guardian.scenario.test.ts`, which remains
 * the authoritative end-to-end proof). Mirrors
 * `car-purchase-scenario.test.ts`'s own pattern: this covers defensive
 * per-event-shape branches (`drainSwarm`) and a defensive data-shape
 * fallback (`collectLimitations`) the real, fully-scripted two-round Swarm
 * run never actually takes -- `event-normalizer.ts` always supplies a
 * well-formed `skillId`/`toolName`/`nodeId`/`from`/`to`/`feedback`/`attempt`
 * for every real event it emits, only ever names a `goal` category event
 * `goal.validated`/`goal.validation_failed`, and the real Swarm always
 * populates every node's `contexts` entry it visits.
 */
import { describe, expect, it } from 'vitest';
import { emptyScenarioTrajectory } from '@pax/scenarios';
import type { ExecutionResult } from '@pax/contracts';
import type { RuntimeEvent } from './event-normalizer.js';
import type { HomeEnergySwarmResult } from './home-energy-swarm.js';
import { collectLimitations, drainSwarm } from './home-energy-guardian-scenario.js';

const FIXED_TIMESTAMP = '2026-08-27T00:00:00.000Z';

describe('collectLimitations', () => {
  const CONTEXT_WITH_LIMITATIONS: ExecutionResult = {
    obligationId: 'energy.weather',
    disposition: 'evidence_found',
    claims: [],
    evidenceResults: [],
    limitations: ['Weather explains only part of the gap.'],
    suggestedStatus: 'accepted_uncertainty',
  };

  it('de-duplicates non-empty limitations across every context', () => {
    const contexts: HomeEnergySwarmResult['contexts'] = {
      'weather-analyst': CONTEXT_WITH_LIMITATIONS,
      'home-systems-analyst': {
        ...CONTEXT_WITH_LIMITATIONS,
        obligationId: 'energy.household_change',
      },
    };
    expect(collectLimitations(contexts)).toEqual(['Weather explains only part of the gap.']);
  });

  it('skips a context entirely absent from the map (an empty contexts object) without throwing', () => {
    expect(collectLimitations({})).toEqual([]);
  });

  it('falls back past a context whose entry is genuinely undefined (the real defensive `context?.limitations ?? []` guard) rather than throwing', () => {
    // `HomeEnergySwarmResult['contexts']` is `Partial<Record<...>>`, so under
    // `exactOptionalPropertyTypes` a well-typed object literal can only
    // *omit* a key, never assign it `undefined` directly -- this cast
    // constructs the one runtime shape (a key genuinely present with value
    // `undefined`) the production `context?.limitations ?? []` guard exists
    // to defend against.
    const contexts = {
      'anomaly-investigator': undefined,
      'rate-analyst': CONTEXT_WITH_LIMITATIONS,
    } as unknown as HomeEnergySwarmResult['contexts'];
    expect(collectLimitations(contexts)).toEqual(['Weather explains only part of the gap.']);
  });
});

describe('drainSwarm', () => {
  const FAKE_SWARM_RESULT = {
    multiAgentResult: {},
    nodeStartOrder: [],
    nodeFinishOrder: [],
    contexts: {},
    decisionSynthesizerText: '',
    proposedInspection: undefined,
    goalLoopResult: undefined,
  } as unknown as HomeEnergySwarmResult;

  function fakeEvent(overrides: Partial<RuntimeEvent> = {}): RuntimeEvent {
    return {
      schemaVersion: '1.0',
      sequence: 0,
      timestamp: FIXED_TIMESTAMP,
      traceId: 'trace-1',
      caseId: 'case-1',
      runId: 'run-1',
      category: 'tool',
      name: 'test.event',
      phase: 'finish',
      level: 'info',
      summary: 'synthetic test event',
      attributes: {},
      redactions: [],
      ...overrides,
    };
  }

  async function* stream(
    events: readonly RuntimeEvent[],
  ): AsyncGenerator<RuntimeEvent, HomeEnergySwarmResult, undefined> {
    // No real async work: this synthetic generator only needs to satisfy
    // drainSwarm's real AsyncGenerator input type.
    await Promise.resolve();
    for (const event of events) yield event;
    return FAKE_SWARM_RESULT;
  }

  it('ignores a skill.activated event whose skillId is not a string or whose obligationId is missing, but records a well-formed one', async () => {
    const trajectory = emptyScenarioTrajectory();
    const result = await drainSwarm(
      stream([
        fakeEvent({
          category: 'skill',
          name: 'skill.activated',
          attributes: { skillId: 42 },
          obligationId: 'energy.anomaly',
        }),
        fakeEvent({
          category: 'skill',
          name: 'skill.activated',
          attributes: { skillId: 'bill-normalizer' },
          obligationId: undefined,
        }),
        fakeEvent({
          category: 'skill',
          name: 'skill.activated',
          attributes: { skillId: 'bill-normalizer' },
          obligationId: 'energy.anomaly',
        }),
      ]),
      trajectory,
    );
    expect(trajectory.skillActivations).toEqual([
      { skillId: 'bill-normalizer', obligationId: 'energy.anomaly' },
    ]);
    expect(result).toBe(FAKE_SWARM_RESULT);
  });

  it('ignores a context.injected event whose fields attribute is not an array', async () => {
    const trajectory = emptyScenarioTrajectory();
    await drainSwarm(
      stream([
        fakeEvent({
          category: 'context',
          name: 'context.injected',
          attributes: { fields: 'not-an-array' },
        }),
        fakeEvent({
          category: 'context',
          name: 'context.injected',
          attributes: { fields: ['title', 99, 'criteria'] },
        }),
      ]),
      trajectory,
    );
    expect(trajectory.contextInjections).toEqual([{ fields: ['title', 'criteria'] }]);
  });

  it('ignores a finished tool event whose toolName attribute is not a string', async () => {
    const trajectory = emptyScenarioTrajectory();
    await drainSwarm(
      stream([
        fakeEvent({ category: 'tool', phase: 'finish', attributes: { toolName: 7 } }),
        fakeEvent({ category: 'tool', phase: 'finish', attributes: { toolName: 'calculator' } }),
      ]),
      trajectory,
    );
    expect(trajectory.toolCalls).toEqual([{ toolId: 'calculator' }]);
  });

  it('ignores a swarm.handoff event whose "from" or "to" attribute is not a string', async () => {
    const trajectory = emptyScenarioTrajectory();
    await drainSwarm(
      stream([
        fakeEvent({
          category: 'swarm',
          name: 'swarm.handoff',
          attributes: { from: 1, to: 'rate-analyst' },
        }),
        fakeEvent({
          category: 'swarm',
          name: 'swarm.handoff',
          attributes: { from: 'anomaly-investigator', to: 2 },
        }),
        fakeEvent({
          category: 'swarm',
          name: 'swarm.handoff',
          attributes: { from: 'anomaly-investigator', to: 'rate-analyst' },
        }),
      ]),
      trajectory,
    );
    expect(trajectory.swarmHandoffs).toEqual([
      { from: 'anomaly-investigator', to: 'rate-analyst' },
    ]);
  });

  it('records a finished swarm node once, ignoring a duplicate swarm.node_completed for the same node id', async () => {
    const trajectory = emptyScenarioTrajectory();
    await drainSwarm(
      stream([
        fakeEvent({
          category: 'swarm',
          name: 'swarm.node_completed',
          attributes: { nodeId: 'anomaly-investigator' },
        }),
        fakeEvent({
          category: 'swarm',
          name: 'swarm.node_completed',
          attributes: { nodeId: 'anomaly-investigator' },
        }),
      ]),
      trajectory,
    );
    expect(trajectory.specialistsInvoked).toEqual(['anomaly-investigator']);
  });

  it("falls back to the event summary when a goal.validation_failed event's feedback attribute is not a string, and uses the feedback string when it is", async () => {
    const trajectory = emptyScenarioTrajectory();
    await drainSwarm(
      stream([
        fakeEvent({
          category: 'goal',
          name: 'goal.validation_failed',
          summary: 'GoalLoop rejected the draft: no source citation.',
          attributes: {},
        }),
        fakeEvent({
          category: 'goal',
          name: 'goal.validation_failed',
          summary: 'unused',
          attributes: { feedback: 'Must cite at least one source.' },
        }),
      ]),
      trajectory,
    );
    expect(trajectory.goalValidationFailures).toEqual([
      { reason: 'GoalLoop rejected the draft: no source citation.' },
      { reason: 'Must cite at least one source.' },
    ]);
  });

  it("falls back to attempt 0 when a goal.validated event's attempt attribute is not a number, and uses the real attempt number when it is", async () => {
    const trajectory = emptyScenarioTrajectory();
    await drainSwarm(
      stream([
        fakeEvent({ category: 'goal', name: 'goal.validated', attributes: {} }),
        fakeEvent({ category: 'goal', name: 'goal.validated', attributes: { attempt: 2 } }),
      ]),
      trajectory,
    );
    expect(trajectory.goalValidationPasses).toEqual([{ attempt: 0 }, { attempt: 2 }]);
  });

  it('ignores a "goal" category event whose name is neither goal.validation_failed nor goal.validated', async () => {
    const trajectory = emptyScenarioTrajectory();
    await drainSwarm(
      stream([fakeEvent({ category: 'goal', name: 'goal.something_else', attributes: {} })]),
      trajectory,
    );
    expect(trajectory.goalValidationFailures).toEqual([]);
    expect(trajectory.goalValidationPasses).toEqual([]);
  });
});
