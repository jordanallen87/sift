import {
  Agent,
  AfterModelCallEvent,
  AfterToolCallEvent,
  BeforeModelCallEvent,
  BeforeToolCallEvent,
  Message,
  TextBlock,
  ToolResultBlock,
  type ToolUseData,
} from '@strands-agents/sdk';
import { describe, expect, it } from 'vitest';
import type { JsonPatchOperation } from '@sift/contracts';
import {
  createRuntimeMetricsTracker,
  createSequenceCounter,
  diffJsonValues,
  hashContent,
  normalizeAfterModelCall,
  normalizeAfterToolCall,
  normalizeBeforeModelCall,
  normalizeBeforeToolCall,
  normalizeCaseStateChange,
  normalizeContextInjection,
  normalizeGoalValidation,
  normalizeIntervention,
  normalizeRunError,
  normalizeSessionEvent,
  normalizeSkillActivation,
  redactValue,
  type NormalizerContext,
  type RuntimeEvent,
} from './event-normalizer.js';
import { ScriptedModelProvider } from './model-provider.js';
import type { InterventionEvent } from './interventions.js';

/** A real, minimally-constructed `Agent` -- used purely as the required `agent` field on real Strands hook event constructors. `createRuntimeMetricsTracker`'s own describe blocks build and genuinely invoke their own agents instead. */
function buildStubAgent(): Agent {
  return new Agent({ model: new ScriptedModelProvider({ beats: {} }), printer: false });
}

const CTX: NormalizerContext = {
  traceId: 'trace-1',
  runId: 'run-1',
  caseId: 'case-1',
  obligationId: 'car.hard_constraints',
  agentId: 'case-orchestrator',
};

describe('createSequenceCounter', () => {
  it('returns a monotonically increasing sequence starting at 0 by default', () => {
    const next = createSequenceCounter();
    expect(next()).toBe(0);
    expect(next()).toBe(1);
    expect(next()).toBe(2);
  });

  it('honors an explicit start value', () => {
    const next = createSequenceCounter(5);
    expect(next()).toBe(5);
    expect(next()).toBe(6);
  });
});

describe('hashContent', () => {
  it('is deterministic for identical input', () => {
    expect(hashContent('hello world')).toBe(hashContent('hello world'));
  });

  it('differs for different input', () => {
    expect(hashContent('hello world')).not.toBe(hashContent('hello there'));
  });

  it('returns a lowercase 64-character hex SHA-256 digest', () => {
    expect(hashContent('sift')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('redactValue', () => {
  it('redacts a value under a credential-shaped key name', () => {
    const { value, redactions } = redactValue({ authorization: 'irrelevant-value', ok: 'fine' });
    expect(value).toEqual({ authorization: '[REDACTED]', ok: 'fine' });
    expect(redactions).toHaveLength(1);
    expect(redactions[0]?.path).toBe('authorization');
  });

  it('does not redact Sift correlation fields such as sessionId', () => {
    const { value, redactions } = redactValue({ sessionId: 'session-abc', caseId: 'case-1' });
    expect(value).toEqual({ sessionId: 'session-abc', caseId: 'case-1' });
    expect(redactions).toHaveLength(0);
  });

  it('redacts a seeded secret canary embedded in a string value regardless of key name', () => {
    const { value, redactions } = redactValue({
      note: 'the key is SIFT_TEST_SECRET_abc123 -- do not log',
    });
    expect(value).toEqual({ note: 'the key is [REDACTED] -- do not log' });
    expect(redactions.length).toBeGreaterThan(0);
  });

  it('redacts an AWS-access-key-shaped value', () => {
    // Built by concatenation, not a literal secret-shaped string, so the
    // repo's own source-integrity scanner (scripts/check-source.ts) does not
    // mistake this test fixture for a real credential.
    const awsAccessKeyShapedValue = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
    const { value } = redactValue(`key=${awsAccessKeyShapedValue}`);
    expect(value).toBe('key=[REDACTED]');
  });

  it('redacts a Bearer token value', () => {
    const { value } = redactValue({ header: 'Bearer abc123.def456' });
    expect(value).toEqual({ header: '[REDACTED]' });
  });

  it('walks nested arrays and objects', () => {
    const { value, redactions } = redactValue({ items: [{ token: 'secret-value' }] });
    expect(value).toEqual({ items: [{ token: '[REDACTED]' }] });
    expect(redactions).toHaveLength(1);
    expect(redactions[0]?.path).toBe('items[0].token');
  });

  it('passes through ordinary values unredacted', () => {
    const { value, redactions } = redactValue({ candidateId: 'candidate-rav4', mileage: 12000 });
    expect(value).toEqual({ candidateId: 'candidate-rav4', mileage: 12000 });
    expect(redactions).toHaveLength(0);
  });
});

describe('normalizeBeforeToolCall / normalizeAfterToolCall', () => {
  it('normalizes a real BeforeToolCallEvent into a tool.<name> start event', () => {
    const agent = buildStubAgent();
    const beforeEvent = new BeforeToolCallEvent({
      agent,
      toolUse: {
        name: 'listing-reader',
        toolUseId: 'tool-use-1',
        input: { candidateId: 'candidate-rav4' },
      },
      tool: undefined,
      invocationState: {},
    });

    const debugEvent = normalizeBeforeToolCall(beforeEvent, CTX, 0);
    expect(debugEvent.category).toBe('tool');
    expect(debugEvent.name).toBe('tool.listing-reader');
    expect(debugEvent.phase).toBe('start');
    expect(debugEvent.sequence).toBe(0);
    expect(debugEvent.traceId).toBe('trace-1');
    expect(debugEvent.attributes['toolName']).toBe('listing-reader');
    expect(debugEvent.payload).toEqual({ candidateId: 'candidate-rav4' });
  });

  it('normalizes a successful AfterToolCallEvent into a finish event', () => {
    const agent = buildStubAgent();
    const event = new AfterToolCallEvent({
      agent,
      toolUse: { name: 'listing-reader', toolUseId: 'tool-use-1', input: {} },
      tool: undefined,
      result: new ToolResultBlock({
        toolUseId: 'tool-use-1',
        status: 'success',
        content: [new TextBlock('ok')],
      }),
      invocationState: {},
    });

    const debugEvent = normalizeAfterToolCall(event, CTX, 1);
    expect(debugEvent.phase).toBe('finish');
    expect(debugEvent.level).toBe('info');
    expect(debugEvent.attributes['status']).toBe('success');
  });

  it('normalizes a failed AfterToolCallEvent into an error event', () => {
    const agent = buildStubAgent();
    const event = new AfterToolCallEvent({
      agent,
      toolUse: { name: 'listing-reader', toolUseId: 'tool-use-1', input: {} },
      tool: undefined,
      result: new ToolResultBlock({
        toolUseId: 'tool-use-1',
        status: 'error',
        content: [new TextBlock('not found')],
      }),
      invocationState: {},
    });

    const debugEvent = normalizeAfterToolCall(event, CTX, 2);
    expect(debugEvent.phase).toBe('error');
    expect(debugEvent.level).toBe('error');
  });
});

describe('normalizeBeforeModelCall', () => {
  it('falls back to "unknown" for modelId and omits projectedInputTokens when the real Model reports neither (no test in strands-adapter.test.ts\'s real Agent runs ever sees this: a real ScriptedModelProvider always has a configured modelId)', () => {
    const agent = buildStubAgent();
    // `updateConfig` is the SDK's own real public API (`Model.updateConfig`,
    // used identically by `strands-adapter.ts`'s wiring) -- not a bypass of
    // it -- and is the only way to put a real Model instance into the
    // `modelId: undefined` state a differently-configured live provider
    // could genuinely report.
    agent.model.updateConfig({ modelId: undefined } as unknown as Parameters<
      typeof agent.model.updateConfig
    >[0]);
    const event = new BeforeModelCallEvent({
      agent,
      model: agent.model,
      invocationState: {},
    });

    const debugEvent = normalizeBeforeModelCall(event, CTX, 0);
    expect(debugEvent.category).toBe('model');
    expect(debugEvent.phase).toBe('start');
    expect(debugEvent.attributes['modelId']).toBe('unknown');
    expect(debugEvent.attributes).not.toHaveProperty('projectedInputTokens');
  });
});

describe('normalizeAfterModelCall', () => {
  it('normalizes a completed model call, including the stop reason', () => {
    const agent = buildStubAgent();
    const event = new AfterModelCallEvent({
      agent,
      model: agent.model,
      invocationState: {},
      attemptCount: 1,
      stopData: {
        message: new Message({ role: 'assistant', content: [new TextBlock('done')] }),
        stopReason: 'endTurn',
      },
    });

    const debugEvent = normalizeAfterModelCall(event, CTX, 3);
    expect(debugEvent.category).toBe('model');
    expect(debugEvent.phase).toBe('finish');
    expect(debugEvent.attributes['stopReason']).toBe('endTurn');
    expect(debugEvent.attributes['attemptCount']).toBe(1);
  });

  it('normalizes a failed model call as an error event', () => {
    const agent = buildStubAgent();
    const event = new AfterModelCallEvent({
      agent,
      model: agent.model,
      invocationState: {},
      attemptCount: 2,
      error: new Error('boom'),
    });

    const debugEvent = normalizeAfterModelCall(event, CTX, 4);
    expect(debugEvent.phase).toBe('error');
    expect(debugEvent.level).toBe('error');
  });
});

/**
 * These drive a *real* `Agent` over a real `ScriptedModelProvider` and read
 * the resulting events, rather than hand-constructing an `AfterModelCallEvent`
 * with a stub agent: token usage never appears on the hook event itself
 * (`hooks/events.d.ts` -- it carries only agent/model/stopData/error/
 * attemptCount/invocationState), it reaches the runtime through the agent's
 * own `Meter`, which only accumulates when the provider genuinely emits a
 * `ModelMetadataEvent`. Anything short of a real invocation would prove
 * nothing about that path.
 */
describe('createRuntimeMetricsTracker (model calls)', () => {
  /** A monotonic millisecond source that advances a fixed `stepMs` on every read, so a measured interval is exact rather than wall-clock-dependent. */
  function steppingClock(stepMs: number): () => number {
    let value = 0;
    return () => (value += stepMs);
  }

  async function runScriptedModelCalls(
    turns: ConstructorParameters<typeof ScriptedModelProvider>[0]['beats']['turn'],
    now: () => number,
  ): Promise<RuntimeEvent[]> {
    const provider = new ScriptedModelProvider({ beats: { turn: turns } });
    provider.setBeat('turn');
    const agent = new Agent({ model: provider, printer: false });
    const tracker = createRuntimeMetricsTracker(now);
    const sequence = createSequenceCounter();
    const events: RuntimeEvent[] = [];
    agent.addHook(BeforeModelCallEvent, (event) => {
      tracker.noteModelCallStart(event);
    });
    agent.addHook(AfterModelCallEvent, (event) => {
      events.push(normalizeAfterModelCall(event, CTX, sequence(), tracker.measureModelCall(event)));
    });
    await agent.invoke('go');
    return events;
  }

  it('stamps the token usage the model provider actually reported onto the model.call finish event', async () => {
    const events = await runScriptedModelCalls(
      [
        {
          text: 'done',
          usage: { inputTokens: 120, outputTokens: 34, totalTokens: 154 },
        },
      ],
      steppingClock(7),
    );

    expect(events).toHaveLength(1);
    expect(events[0]?.tokenUsage).toEqual({ input: 120, output: 34, total: 154 });
  });

  it('measures the real interval between the before and after model-call hooks', async () => {
    // The stepping clock is read once by `noteModelCallStart` (t=9) and once
    // by `measureModelCall` (t=18): a genuinely measured difference, not a
    // constant baked into the producer.
    const events = await runScriptedModelCalls([{ text: 'done' }], steppingClock(9));
    expect(events[0]?.durationMs).toBe(9);
  });

  it('omits tokenUsage entirely -- not a zeroed object -- when the provider reports no usage', async () => {
    // ScriptedModelProvider emits a real ModelMetadataEvent whose usage is
    // all zeros when a turn declares none, which is exactly the shape a
    // provider that does not report usage produces. The honest record of
    // that is an absent field.
    const events = await runScriptedModelCalls([{ text: 'done' }], steppingClock(3));

    expect(events[0]).not.toHaveProperty('tokenUsage');
    expect(events[0]?.tokenUsage).toBeUndefined();
  });

  it('reports each model call’s own usage, not the agent’s running total', async () => {
    // Strands's `agent.metrics.accumulatedUsage` is cumulative across the
    // whole agent, and `routes/debug.ts` sums `tokenUsage` across events for
    // its run overview -- so stamping the accumulated figure on every event
    // would over-count the run. Two consecutive model calls on one agent
    // must therefore report 100/40/140 and then 60/10/70, never 100/40/140
    // and 160/50/210.
    const events = await runScriptedModelCalls(
      [
        {
          text: '',
          toolCalls: [{ name: 'missing-tool', input: {} }],
          usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
        },
        { text: 'done', usage: { inputTokens: 60, outputTokens: 10, totalTokens: 70 } },
      ],
      steppingClock(2),
    );

    expect(events).toHaveLength(2);
    expect(events[0]?.tokenUsage).toEqual({ input: 100, output: 40, total: 140 });
    expect(events[1]?.tokenUsage).toEqual({ input: 60, output: 10, total: 70 });
  });

  it('leaves durationMs and tokenUsage off entirely when normalizeAfterModelCall is called without a tracker', () => {
    const agent = buildStubAgent();
    const event = new AfterModelCallEvent({
      agent,
      model: agent.model,
      invocationState: {},
      attemptCount: 1,
      stopData: {
        message: new Message({ role: 'assistant', content: [new TextBlock('done')] }),
        stopReason: 'endTurn',
      },
    });

    const debugEvent = normalizeAfterModelCall(event, CTX, 0);
    expect(debugEvent).not.toHaveProperty('durationMs');
    expect(debugEvent).not.toHaveProperty('tokenUsage');
  });
});

describe('createRuntimeMetricsTracker (tool calls)', () => {
  function toolUse(toolUseId: string): ToolUseData {
    return { name: 'listing-reader', toolUseId, input: {} };
  }

  function afterToolCallEvent(agent: Agent, toolUseId: string): AfterToolCallEvent {
    return new AfterToolCallEvent({
      agent,
      toolUse: toolUse(toolUseId),
      tool: undefined,
      result: new ToolResultBlock({
        toolUseId,
        status: 'success',
        content: [new TextBlock('ok')],
      }),
      invocationState: {},
    });
  }

  it('attributes a duration to the right call when two calls to the same tool overlap', () => {
    // The SDK ships a ConcurrentToolExecutor, so two in-flight calls to one
    // tool are real. Keying by the model-issued toolUseId is what keeps
    // their measured intervals from being swapped.
    const agent = buildStubAgent();
    let clock = 0;
    const tracker = createRuntimeMetricsTracker(() => clock);
    const sequence = createSequenceCounter();

    clock = 100;
    tracker.noteToolCallStart(
      new BeforeToolCallEvent({
        agent,
        toolUse: toolUse('tool-use-a'),
        tool: undefined,
        invocationState: {},
      }),
    );
    clock = 130;
    tracker.noteToolCallStart(
      new BeforeToolCallEvent({
        agent,
        toolUse: toolUse('tool-use-b'),
        tool: undefined,
        invocationState: {},
      }),
    );

    clock = 175;
    const eventB = afterToolCallEvent(agent, 'tool-use-b');
    const debugB = normalizeAfterToolCall(eventB, CTX, sequence(), tracker.measureToolCall(eventB));
    clock = 190;
    const eventA = afterToolCallEvent(agent, 'tool-use-a');
    const debugA = normalizeAfterToolCall(eventA, CTX, sequence(), tracker.measureToolCall(eventA));

    expect(debugB.durationMs).toBe(45);
    expect(debugA.durationMs).toBe(90);
  });

  it('omits durationMs when no matching tool-call start was observed', () => {
    const agent = buildStubAgent();
    const tracker = createRuntimeMetricsTracker(() => 500);
    const event = afterToolCallEvent(agent, 'tool-use-unobserved');

    const debugEvent = normalizeAfterToolCall(event, CTX, 0, tracker.measureToolCall(event));
    expect(debugEvent).not.toHaveProperty('durationMs');
  });

  it('never reports an estimatedCostUsd: Sift has no sourced price table to compute one from', () => {
    const agent = buildStubAgent();
    let clock = 0;
    const tracker = createRuntimeMetricsTracker(() => clock);
    clock = 10;
    tracker.noteToolCallStart(
      new BeforeToolCallEvent({
        agent,
        toolUse: toolUse('tool-use-a'),
        tool: undefined,
        invocationState: {},
      }),
    );
    clock = 40;
    const event = afterToolCallEvent(agent, 'tool-use-a');

    const debugEvent = normalizeAfterToolCall(event, CTX, 0, tracker.measureToolCall(event));
    expect(debugEvent.durationMs).toBe(30);
    expect(debugEvent).not.toHaveProperty('estimatedCostUsd');
  });
});

describe('normalizeSkillActivation', () => {
  it('produces a skill.activated event carrying skill id, obligation id, and reason', () => {
    const debugEvent = normalizeSkillActivation(
      {
        skillId: 'deal-analysis',
        reason: 'activated via the skills tool',
        agentId: 'case-orchestrator',
      },
      CTX,
      0,
    );
    expect(debugEvent.category).toBe('skill');
    expect(debugEvent.name).toBe('skill.activated');
    expect(debugEvent.obligationId).toBe('car.hard_constraints');
    expect(debugEvent.attributes['skillId']).toBe('deal-analysis');
    expect(debugEvent.attributes['reason']).toBe('activated via the skills tool');
  });

  it('omits obligationId and agentId from attributes when neither the context nor params supply them', () => {
    // Real gap: every other test in this describe block uses CTX, which
    // always carries an obligationId, and always passes params.agentId --
    // so the `ctx.obligationId !== undefined`/`params.agentId !== undefined`
    // conditional spreads never see their false side. A skill can activate
    // outside any obligation-scoped run (e.g. a future non-obligation-bound
    // context), so both fields are genuinely optional.
    const ctxWithoutObligation: NormalizerContext = {
      traceId: 'trace-1',
      runId: 'run-1',
      caseId: 'case-1',
    };
    const debugEvent = normalizeSkillActivation(
      { skillId: 'deal-analysis', reason: 'activated via the skills tool' },
      ctxWithoutObligation,
      0,
    );
    expect(debugEvent.obligationId).toBeUndefined();
    expect(debugEvent.attributes).not.toHaveProperty('obligationId');
    expect(debugEvent.attributes).not.toHaveProperty('agentId');
    expect(debugEvent.attributes['skillId']).toBe('deal-analysis');
  });
});

describe('normalizeContextInjection', () => {
  it('carries only field names and a content hash, never raw content', () => {
    const debugEvent = normalizeContextInjection(
      { fields: ['activeObligation', 'criteria'], contentHash: hashContent('secret case text') },
      CTX,
      0,
    );
    expect(debugEvent.category).toBe('context');
    expect(debugEvent.name).toBe('context.injected');
    expect(debugEvent.attributes['fields']).toEqual(['activeObligation', 'criteria']);
    expect(JSON.stringify(debugEvent)).not.toContain('secret case text');
  });
});

describe('normalizeIntervention', () => {
  it('maps an InterventionEvent onto the matching RuntimeDebugEvent category and level', () => {
    const interventionEvent: InterventionEvent = {
      type: 'intervention.deny',
      handler: 'ScopeAuthorization',
      runId: 'run-1',
      obligationId: 'car.hard_constraints',
      stage: 'before_tool',
      subject: 'unlisted-tool',
      reason: 'tool is not in the declared allowlist',
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    const debugEvent = normalizeIntervention(interventionEvent, CTX, 0);
    expect(debugEvent.category).toBe('intervention');
    expect(debugEvent.name).toBe('intervention.deny');
    expect(debugEvent.level).toBe('warn');
    expect(debugEvent.attributes['handler']).toBe('ScopeAuthorization');
    expect(debugEvent.attributes['stage']).toBe('before_tool');
  });

  // Deliberately changed from the original `expect(...).toBe('info')`.
  // Six intervention handlers run on every tool call and most of them
  // proceed, so proceed events swamped the stream (a real car run recorded
  // 122 `BudgetGuard: tool is excluded from the run tool-call budget`
  // proceeds out of 245 events). They still carry real audit value -- proof
  // each guard genuinely ran -- so they are recorded, not dropped; `debug`
  // is the level `routes/debug.ts`'s `?level=` filter and `countsByLevel`
  // breakdown can act on to keep them out of the `info` stream. See
  // `INTERVENTION_LEVEL` in event-normalizer.ts.
  it('records a proceed decision at debug level so a level filter can separate it from outcomes that changed the run', () => {
    const interventionEvent: InterventionEvent = {
      type: 'intervention.proceed',
      handler: 'BudgetGuard',
      runId: 'run-1',
      obligationId: 'car.hard_constraints',
      stage: 'before_tool',
      subject: 'listing-reader',
      reason: 'within budget',
      timestamp: '2026-01-01T00:00:00.000Z',
    };
    const debugEvent = normalizeIntervention(interventionEvent, CTX, 0);
    expect(debugEvent.level).toBe('debug');
    // Demoted, not deleted: every attribute a reader needs survives.
    expect(debugEvent.name).toBe('intervention.proceed');
    expect(debugEvent.attributes['handler']).toBe('BudgetGuard');
    expect(debugEvent.attributes['subject']).toBe('listing-reader');
    expect(debugEvent.summary).toBe('BudgetGuard: within budget');
  });

  it('keeps every intervention outcome that changed the run above debug level', () => {
    const base = {
      handler: 'ConsequenceGuard',
      runId: 'run-1',
      obligationId: 'car.hard_constraints',
      stage: 'before_tool',
      subject: 'propose_recommendation',
      reason: 'requires human confirmation',
      timestamp: '2026-01-01T00:00:00.000Z',
    } satisfies Omit<InterventionEvent, 'type'>;

    expect(normalizeIntervention({ ...base, type: 'intervention.guide' }, CTX, 0).level).toBe(
      'info',
    );
    expect(normalizeIntervention({ ...base, type: 'intervention.confirm' }, CTX, 1).level).toBe(
      'info',
    );
    expect(normalizeIntervention({ ...base, type: 'intervention.transform' }, CTX, 2).level).toBe(
      'info',
    );
    expect(normalizeIntervention({ ...base, type: 'intervention.deny' }, CTX, 3).level).toBe(
      'warn',
    );
  });
});

describe('normalizeGoalValidation', () => {
  it('names a rejection goal.validation_failed', () => {
    const debugEvent = normalizeGoalValidation(
      { attempt: 1, passed: false, feedback: 'missing a source id', exhausted: false },
      CTX,
      0,
    );
    expect(debugEvent.name).toBe('goal.validation_failed');
    expect(debugEvent.level).toBe('warn');
    expect(debugEvent.attributes['feedback']).toBe('missing a source id');
  });

  it('names a pass goal.validated', () => {
    const debugEvent = normalizeGoalValidation(
      { attempt: 2, passed: true, exhausted: false },
      CTX,
      0,
    );
    expect(debugEvent.name).toBe('goal.validated');
    expect(debugEvent.level).toBe('info');
  });

  it('marks an exhausted rejection as an error-phase event', () => {
    const debugEvent = normalizeGoalValidation(
      { attempt: 2, passed: false, exhausted: true },
      CTX,
      0,
    );
    expect(debugEvent.phase).toBe('error');
  });
});

describe('normalizeSessionEvent', () => {
  it('normalizes a session save', () => {
    const debugEvent = normalizeSessionEvent({ kind: 'snapshot_saved' }, CTX, 0);
    expect(debugEvent.category).toBe('session');
    expect(debugEvent.name).toBe('session.snapshot_saved');
  });

  it('normalizes a restore that found no prior snapshot', () => {
    const debugEvent = normalizeSessionEvent(
      { kind: 'snapshot_restored', restored: false },
      CTX,
      0,
    );
    expect(debugEvent.name).toBe('session.snapshot_restored');
    expect(debugEvent.attributes['restored']).toBe(false);
    expect(debugEvent.summary).toContain('No prior session snapshot');
  });

  it('includes a snapshotId in attributes when the caller provides one (neither existing test above ever does)', () => {
    const debugEvent = normalizeSessionEvent(
      { kind: 'snapshot_restored', snapshotId: 'snapshot-1', restored: true },
      CTX,
      0,
    );
    expect(debugEvent.attributes['snapshotId']).toBe('snapshot-1');
    expect(debugEvent.summary).toBe('Restored a session snapshot.');
  });
});

describe('normalizeRunError', () => {
  it('produces an error-category, error-level event', () => {
    const debugEvent = normalizeRunError('agent invocation failed: boom', CTX, 0);
    expect(debugEvent.category).toBe('error');
    expect(debugEvent.name).toBe('run.failed');
    expect(debugEvent.level).toBe('error');
    expect(debugEvent.summary).toBe('agent invocation failed: boom');
  });
});

describe('diffJsonValues', () => {
  it('returns no operations for identical plain objects', () => {
    expect(diffJsonValues({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toEqual([]);
  });

  it('reports a "replace" for a changed primitive field', () => {
    const ops = diffJsonValues({ status: 'draft' }, { status: 'active' });
    expect(ops).toEqual([{ op: 'replace', path: '/status', value: 'active' }]);
  });

  it('reports an "add" for a key that only exists after', () => {
    const ops = diffJsonValues({}, { recommendation: { id: 'rec-1' } });
    expect(ops).toEqual([{ op: 'add', path: '/recommendation', value: { id: 'rec-1' } }]);
  });

  it('reports a "remove" for a key that only existed before', () => {
    const ops = diffJsonValues({ proposal: { id: 'p-1' } }, {});
    expect(ops).toEqual([{ op: 'remove', path: '/proposal' }]);
  });

  it('treats a key present in both with null before and an object after as a "replace" (key presence never changed, only its value)', () => {
    const ops = diffJsonValues({ recommendation: null }, { recommendation: { id: 'rec-1' } });
    expect(ops).toEqual([{ op: 'replace', path: '/recommendation', value: { id: 'rec-1' } }]);
  });

  it('recurses into nested plain objects, reporting only the sub-field that actually changed', () => {
    const before = { recommendation: { favoredOptionId: null, rationale: 'r1' } };
    const after = { recommendation: { favoredOptionId: 'candidate-rav4', rationale: 'r1' } };
    const ops = diffJsonValues(before, after);
    expect(ops).toEqual([
      { op: 'replace', path: '/recommendation/favoredOptionId', value: 'candidate-rav4' },
    ]);
  });

  it('replaces an array wholesale when its contents differ, rather than diffing individual elements', () => {
    const ops = diffJsonValues(
      { criteria: [{ id: 'a' }] },
      { criteria: [{ id: 'a' }, { id: 'b' }] },
    );
    expect(ops).toEqual([{ op: 'replace', path: '/criteria', value: [{ id: 'a' }, { id: 'b' }] }]);
  });

  it('reports no diff for a deeply-equal array passed by a different reference', () => {
    const ops = diffJsonValues({ items: [{ id: 'a' }] }, { items: [{ id: 'a' }] });
    expect(ops).toEqual([]);
  });

  it('escapes "~" and "/" in a field name per RFC 6901', () => {
    const ops = diffJsonValues({ 'a/b~c': 1 }, { 'a/b~c': 2 });
    expect(ops).toEqual([{ op: 'replace', path: '/a~1b~0c', value: 2 }]);
  });
});

describe('normalizeCaseStateChange', () => {
  it('produces a category "case" event carrying the given stateDiff verbatim', () => {
    const stateDiff: JsonPatchOperation[] = [{ op: 'replace', path: '/status', value: 'active' }];
    const debugEvent = normalizeCaseStateChange({ stateDiff }, CTX, 0);
    expect(debugEvent.category).toBe('case');
    expect(debugEvent.name).toBe('case.state_changed');
    expect(debugEvent.phase).toBe('finish');
    expect(debugEvent.stateDiff).toEqual(stateDiff);
    expect(debugEvent.summary).toContain('1 field');
  });

  it('pluralizes the summary for more than one changed field', () => {
    const stateDiff: JsonPatchOperation[] = [
      { op: 'replace', path: '/status', value: 'active' },
      { op: 'add', path: '/proposal', value: { id: 'p-1' } },
    ];
    const debugEvent = normalizeCaseStateChange({ stateDiff }, CTX, 0);
    expect(debugEvent.summary).toContain('2 fields');
  });
});

describe('buildCorrelation (exercised through any normalizer -- normalizeRunError here, since it needs no other fixture)', () => {
  it('stamps spanId, parentSpanId, and requestId onto the correlation when the NormalizerContext provides them (forward-compat OTEL fields -- module header: "carries spanId/parentSpanId fields for forward compatibility"; CTX never sets them, so no other test in this file exercises this)', () => {
    const ctxWithOtel: NormalizerContext = {
      ...CTX,
      spanId: 'span-1',
      parentSpanId: 'span-0',
      requestId: 'request-1',
    };
    const debugEvent = normalizeRunError('boom', ctxWithOtel, 0);
    expect(debugEvent.spanId).toBe('span-1');
    expect(debugEvent.parentSpanId).toBe('span-0');
    expect(debugEvent.requestId).toBe('request-1');
  });
});
