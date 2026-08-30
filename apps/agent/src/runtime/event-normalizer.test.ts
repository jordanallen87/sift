import {
  Agent,
  AfterModelCallEvent,
  AfterToolCallEvent,
  BeforeModelCallEvent,
  BeforeToolCallEvent,
  Message,
  TextBlock,
  ToolResultBlock,
} from '@strands-agents/sdk';
import { describe, expect, it } from 'vitest';
import {
  createSequenceCounter,
  hashContent,
  normalizeAfterModelCall,
  normalizeAfterToolCall,
  normalizeBeforeModelCall,
  normalizeBeforeToolCall,
  normalizeContextInjection,
  normalizeGoalValidation,
  normalizeIntervention,
  normalizeRunError,
  normalizeSessionEvent,
  normalizeSkillActivation,
  redactValue,
  type NormalizerContext,
} from './event-normalizer.js';
import { ScriptedModelProvider } from './model-provider.js';
import type { InterventionEvent } from './interventions.js';

/** A real, minimally-constructed `Agent` -- used purely as the required `agent` field on real Strands hook event constructors, never invoked in this file. */
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

  it('uses info level for a proceed decision', () => {
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
    expect(normalizeIntervention(interventionEvent, CTX, 0).level).toBe('info');
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
