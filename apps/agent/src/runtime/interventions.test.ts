import {
  Agent,
  AfterModelCallEvent,
  AfterToolCallEvent,
  BeforeToolCallEvent,
  Message,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
} from '@strands-agents/sdk';
import { describe, expect, it } from 'vitest';
import type { Clock } from '@pax/core';
import { ScriptedModelProvider } from './model-provider.js';
import {
  BudgetGuard,
  ConsequenceGuard,
  EvidenceQualitySteering,
  OutputSanitizer,
  RetrySteering,
  ScopeAuthorization,
  ToolLedger,
  normalizeToolArgs,
  type InterventionEvent,
} from './interventions.js';

function buildStubAgent(): Agent {
  return new Agent({ model: new ScriptedModelProvider({ beats: {} }), printer: false });
}

const FIXED_CLOCK: Clock = { now: () => '2026-01-01T00:00:00.000Z' };

function beforeToolCall(agent: Agent, name: string, input: unknown, toolUseId = 'tool-use-1') {
  return new BeforeToolCallEvent({
    agent,
    toolUse: { name, toolUseId, input: input as never },
    tool: undefined,
    invocationState: {},
  });
}

function afterToolCall(
  agent: Agent,
  name: string,
  input: unknown,
  status: 'success' | 'error' = 'success',
  toolUseId = 'tool-use-1',
) {
  return new AfterToolCallEvent({
    agent,
    toolUse: { name, toolUseId, input: input as never },
    tool: undefined,
    result: new ToolResultBlock({ toolUseId, status, content: [new TextBlock('result')] }),
    invocationState: {},
  });
}

function afterModelCallEndTurn(agent: Agent, text: string) {
  return new AfterModelCallEvent({
    agent,
    model: agent.model,
    invocationState: {},
    attemptCount: 1,
    stopData: {
      message: new Message({ role: 'assistant', content: [new TextBlock(text)] }),
      stopReason: 'endTurn',
    },
  });
}

function collector(): { events: InterventionEvent[]; emit: (event: InterventionEvent) => void } {
  const events: InterventionEvent[] = [];
  return { events, emit: (event) => events.push(event) };
}

describe('ScopeAuthorization', () => {
  it('proceeds a tool call within the declared allowlist', () => {
    const { events, emit } = collector();
    const handler = new ScopeAuthorization({
      runId: 'run-1',
      obligationId: 'car.hard_constraints',
      clock: FIXED_CLOCK,
      emit,
      allowedTools: ['listing-reader'],
    });
    const action = handler.beforeToolCall(beforeToolCall(buildStubAgent(), 'listing-reader', {}));
    expect(action.type).toBe('proceed');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('intervention.proceed');
    expect(events[0]?.handler).toBe('ScopeAuthorization');
  });

  it('denies a tool call outside the declared allowlist', () => {
    const { events, emit } = collector();
    const handler = new ScopeAuthorization({
      runId: 'run-1',
      obligationId: 'car.hard_constraints',
      clock: FIXED_CLOCK,
      emit,
      allowedTools: ['listing-reader'],
    });
    const action = handler.beforeToolCall(beforeToolCall(buildStubAgent(), 'undeclared-tool', {}));
    expect(action.type).toBe('deny');
    expect(action.type === 'deny' && action.reason).toContain('undeclared-tool');
    expect(events[0]?.type).toBe('intervention.deny');
    expect(events[0]?.stage).toBe('before_tool');
  });
});

describe('ConsequenceGuard', () => {
  const baseDeps = {
    runId: 'run-1',
    obligationId: 'car.shortlist',
    clock: FIXED_CLOCK,
  };

  it('proceeds a tool with no consequential or forbidden effect', () => {
    const { emit } = collector();
    const handler = new ConsequenceGuard({
      ...baseDeps,
      emit,
      consequentialToolIds: ['propose_recommendation'],
    });
    const action = handler.beforeToolCall(beforeToolCall(buildStubAgent(), 'listing-reader', {}));
    expect(action.type).toBe('proceed');
  });

  it('confirms a consequential tool call without a preemptive response', () => {
    const { events, emit } = collector();
    const handler = new ConsequenceGuard({
      ...baseDeps,
      emit,
      consequentialToolIds: ['propose_recommendation'],
    });
    const action = handler.beforeToolCall(
      beforeToolCall(buildStubAgent(), 'propose_recommendation', {
        candidateIds: ['candidate-rav4'],
      }),
    );
    expect(action.type).toBe('confirm');
    expect(action.type === 'confirm' && action.response).toBeUndefined();
    expect(events[0]?.type).toBe('intervention.confirm');
  });

  it('confirms a consequential tool call with a preemptive response when resolveConfirmation is supplied', () => {
    const { emit } = collector();
    const handler = new ConsequenceGuard({
      ...baseDeps,
      emit,
      consequentialToolIds: ['propose_recommendation'],
      resolveConfirmation: () => true,
    });
    const action = handler.beforeToolCall(
      beforeToolCall(buildStubAgent(), 'propose_recommendation', {}),
    );
    expect(action.type).toBe('confirm');
    expect(action.type === 'confirm' && action.response).toBe(true);
  });

  it('denies a forbidden tool call unconditionally', () => {
    const { events, emit } = collector();
    const handler = new ConsequenceGuard({
      ...baseDeps,
      emit,
      consequentialToolIds: [],
      forbiddenToolIds: ['schedule_test_drive'],
    });
    const action = handler.beforeToolCall(
      beforeToolCall(buildStubAgent(), 'schedule_test_drive', {}),
    );
    expect(action.type).toBe('deny');
    expect(events[0]?.type).toBe('intervention.deny');
  });
});

describe('BudgetGuard', () => {
  it('proceeds calls within the tool-call budget', () => {
    const { emit } = collector();
    const handler = new BudgetGuard({
      runId: 'run-1',
      obligationId: 'car.hard_constraints',
      clock: FIXED_CLOCK,
      emit,
      maxToolCallsPerRun: 3,
    });
    const agent = buildStubAgent();
    expect(handler.beforeToolCall(beforeToolCall(agent, 'listing-reader', {})).type).toBe(
      'proceed',
    );
  });

  it('confirms the last call the budget permits', () => {
    const { emit } = collector();
    const handler = new BudgetGuard({
      runId: 'run-1',
      obligationId: 'car.hard_constraints',
      clock: FIXED_CLOCK,
      emit,
      maxToolCallsPerRun: 2,
    });
    const agent = buildStubAgent();
    expect(handler.beforeToolCall(beforeToolCall(agent, 'listing-reader', {})).type).toBe(
      'proceed',
    );
    expect(handler.beforeToolCall(beforeToolCall(agent, 'listing-reader', {})).type).toBe(
      'confirm',
    );
  });

  it('denies a call beyond the exhausted budget', () => {
    const { emit } = collector();
    const handler = new BudgetGuard({
      runId: 'run-1',
      obligationId: 'car.hard_constraints',
      clock: FIXED_CLOCK,
      emit,
      maxToolCallsPerRun: 2,
    });
    const agent = buildStubAgent();
    expect(handler.beforeToolCall(beforeToolCall(agent, 'listing-reader', {})).type).toBe(
      'proceed',
    );
    expect(handler.beforeToolCall(beforeToolCall(agent, 'listing-reader', {})).type).toBe(
      'confirm',
    );
    expect(handler.beforeToolCall(beforeToolCall(agent, 'listing-reader', {})).type).toBe('deny');
  });

  it('excludes SDK-internal tools from the budget entirely', () => {
    const { emit } = collector();
    const handler = new BudgetGuard({
      runId: 'run-1',
      obligationId: 'car.hard_constraints',
      clock: FIXED_CLOCK,
      emit,
      maxToolCallsPerRun: 1,
      excludedToolNames: ['strands_structured_output'],
    });
    const agent = buildStubAgent();
    expect(
      handler.beforeToolCall(beforeToolCall(agent, 'strands_structured_output', {})).type,
    ).toBe('proceed');
    expect(
      handler.beforeToolCall(beforeToolCall(agent, 'strands_structured_output', {})).type,
    ).toBe('proceed');
  });
});

describe('normalizeToolArgs', () => {
  it('normalizes semantically identical arguments in different key order to the same string', () => {
    expect(normalizeToolArgs({ a: 1, b: 2 })).toBe(normalizeToolArgs({ b: 2, a: 1 }));
  });

  it('normalizes different arguments to different strings', () => {
    expect(normalizeToolArgs({ a: 1 })).not.toBe(normalizeToolArgs({ a: 2 }));
  });
});

describe('ToolLedger', () => {
  it('counts failures for the same normalized tool call', () => {
    const ledger = new ToolLedger();
    const entry = {
      toolName: 'listing-reader',
      normalizedArgs: normalizeToolArgs({ candidateId: 'candidate-x' }),
      resultStatus: 'failure' as const,
      sourceIds: [],
      evidenceDelta: 0,
      timestamp: FIXED_CLOCK.now(),
    };
    ledger.record(entry);
    expect(ledger.failureCount('listing-reader', entry.normalizedArgs)).toBe(1);
    ledger.record(entry);
    expect(ledger.failureCount('listing-reader', entry.normalizedArgs)).toBe(2);
  });

  it('detects three consecutive calls with no new evidence', () => {
    const ledger = new ToolLedger();
    expect(ledger.lastCallsHaveNoNewEvidence(3)).toBe(false);
    for (let i = 0; i < 3; i++) {
      ledger.record({
        toolName: 'listing-reader',
        normalizedArgs: `args-${i}`,
        resultStatus: 'success',
        sourceIds: [],
        evidenceDelta: 0,
        timestamp: FIXED_CLOCK.now(),
      });
    }
    expect(ledger.lastCallsHaveNoNewEvidence(3)).toBe(true);
  });

  it('matches a prior query family for the same tool', () => {
    const ledger = new ToolLedger();
    ledger.record({
      toolName: 'listing-reader',
      normalizedArgs: 'family-a',
      resultStatus: 'success',
      sourceIds: [],
      evidenceDelta: 1,
      timestamp: FIXED_CLOCK.now(),
    });
    expect(ledger.matchesPriorQueryFamily('listing-reader', 'family-a')).toBe(true);
    expect(ledger.matchesPriorQueryFamily('listing-reader', 'family-b')).toBe(false);
  });
});

describe('RetrySteering', () => {
  const baseDeps = {
    runId: 'run-1',
    obligationId: 'car.deal_normalization',
    clock: FIXED_CLOCK,
  };

  it('proceeds the first call to a tool with no prior history', () => {
    const { emit } = collector();
    const handler = new RetrySteering({
      ...baseDeps,
      emit,
      ledger: new ToolLedger(),
      attemptsUsedForObligation: 0,
      maxAttemptsPerObligation: 2,
    });
    const action = handler.beforeToolCall(
      beforeToolCall(buildStubAgent(), 'listing-reader', { candidateId: 'a' }),
    );
    expect(action.type).toBe('proceed');
  });

  it('guides when the same normalized call has already failed twice', () => {
    const ledger = new ToolLedger();
    const args = normalizeToolArgs({ candidateId: 'a' });
    ledger.record({
      toolName: 'listing-reader',
      normalizedArgs: args,
      resultStatus: 'failure',
      sourceIds: [],
      evidenceDelta: 0,
      timestamp: FIXED_CLOCK.now(),
    });
    ledger.record({
      toolName: 'listing-reader',
      normalizedArgs: args,
      resultStatus: 'failure',
      sourceIds: [],
      evidenceDelta: 0,
      timestamp: FIXED_CLOCK.now(),
    });
    const { events, emit } = collector();
    const handler = new RetrySteering({
      ...baseDeps,
      emit,
      ledger,
      attemptsUsedForObligation: 0,
      maxAttemptsPerObligation: 3,
    });
    const action = handler.beforeToolCall(
      beforeToolCall(buildStubAgent(), 'listing-reader', { candidateId: 'a' }),
    );
    expect(action.type).toBe('guide');
    expect(events[0]?.type).toBe('intervention.guide');
    expect(events[0]?.reason).toContain('failed twice');
  });

  it('guides when the obligation attempt budget is already exhausted', () => {
    const { emit } = collector();
    const handler = new RetrySteering({
      ...baseDeps,
      emit,
      ledger: new ToolLedger(),
      attemptsUsedForObligation: 2,
      maxAttemptsPerObligation: 2,
    });
    const action = handler.beforeToolCall(beforeToolCall(buildStubAgent(), 'listing-reader', {}));
    expect(action.type).toBe('guide');
  });

  it('guides when the last three calls (to other tools/args, none failed or duplicated) produced no new evidence', () => {
    const ledger = new ToolLedger();
    for (let i = 0; i < 3; i++) {
      ledger.record({
        toolName: `listing-reader-${i}`,
        normalizedArgs: normalizeToolArgs({ candidateId: `candidate-${i}` }),
        resultStatus: 'success',
        sourceIds: [],
        evidenceDelta: 0,
        timestamp: FIXED_CLOCK.now(),
      });
    }
    const { events, emit } = collector();
    const handler = new RetrySteering({
      ...baseDeps,
      emit,
      ledger,
      attemptsUsedForObligation: 0,
      maxAttemptsPerObligation: 3,
    });
    const action = handler.beforeToolCall(
      beforeToolCall(buildStubAgent(), 'safety-reliability-lookup', { candidateId: 'new' }),
    );
    expect(action.type).toBe('guide');
    expect(events[0]?.reason).toContain('no new source or claim');
  });

  it('guides when a search repeats a prior query family', () => {
    const ledger = new ToolLedger();
    ledger.record({
      toolName: 'safety-reliability-lookup',
      normalizedArgs: normalizeToolArgs({ candidateId: 'outback' }),
      resultStatus: 'success',
      sourceIds: ['source-1'],
      evidenceDelta: 1,
      timestamp: FIXED_CLOCK.now(),
    });
    const { emit } = collector();
    const handler = new RetrySteering({
      ...baseDeps,
      emit,
      ledger,
      attemptsUsedForObligation: 0,
      maxAttemptsPerObligation: 3,
    });
    const action = handler.beforeToolCall(
      beforeToolCall(buildStubAgent(), 'safety-reliability-lookup', { candidateId: 'outback' }),
    );
    expect(action.type).toBe('guide');
  });

  it('includes the configured alternative technique hint in guidance feedback', () => {
    const { emit } = collector();
    const handler = new RetrySteering({
      ...baseDeps,
      emit,
      ledger: new ToolLedger(),
      attemptsUsedForObligation: 2,
      maxAttemptsPerObligation: 2,
      alternativeTechniqueHint: 'ask the household for a written test-drive note',
    });
    const action = handler.beforeToolCall(beforeToolCall(buildStubAgent(), 'listing-reader', {}));
    expect(action.type === 'guide' && action.feedback).toContain('ask the household');
  });

  it('records a successful afterToolCall into the ledger with a positive default evidence delta', () => {
    const ledger = new ToolLedger();
    const { emit } = collector();
    const handler = new RetrySteering({
      ...baseDeps,
      emit,
      ledger,
      attemptsUsedForObligation: 0,
      maxAttemptsPerObligation: 2,
    });
    handler.afterToolCall(
      afterToolCall(buildStubAgent(), 'listing-reader', { candidateId: 'a' }, 'success'),
    );
    expect(ledger.all).toHaveLength(1);
    expect(ledger.all[0]?.resultStatus).toBe('success');
    expect(ledger.all[0]?.evidenceDelta).toBe(1);
  });

  it('records a failed afterToolCall with a zero default evidence delta', () => {
    const ledger = new ToolLedger();
    const { emit } = collector();
    const handler = new RetrySteering({
      ...baseDeps,
      emit,
      ledger,
      attemptsUsedForObligation: 0,
      maxAttemptsPerObligation: 2,
    });
    handler.afterToolCall(
      afterToolCall(buildStubAgent(), 'listing-reader', { candidateId: 'a' }, 'error'),
    );
    expect(ledger.all[0]?.resultStatus).toBe('failure');
    expect(ledger.all[0]?.evidenceDelta).toBe(0);
  });

  it('uses a supplied evidenceDeltaOf/sourceIdsOf extractor instead of the default', () => {
    const ledger = new ToolLedger();
    const { emit } = collector();
    const handler = new RetrySteering({
      ...baseDeps,
      emit,
      ledger,
      attemptsUsedForObligation: 0,
      maxAttemptsPerObligation: 2,
      evidenceDeltaOf: () => 5,
      sourceIdsOf: () => ['source-listing-a'],
    });
    handler.afterToolCall(afterToolCall(buildStubAgent(), 'listing-reader', {}, 'success'));
    expect(ledger.all[0]?.evidenceDelta).toBe(5);
    expect(ledger.all[0]?.sourceIds).toEqual(['source-listing-a']);
  });
});

describe('EvidenceQualitySteering', () => {
  const deps = { runId: 'run-1', obligationId: 'car.shortlist', clock: FIXED_CLOCK };

  it('proceeds a mid-investigation toolUse turn without evaluating text', () => {
    const { emit } = collector();
    const handler = new EvidenceQualitySteering({ ...deps, emit });
    const event = new AfterModelCallEvent({
      agent: buildStubAgent(),
      model: buildStubAgent().model,
      invocationState: {},
      attemptCount: 1,
      stopData: {
        message: new Message({ role: 'assistant', content: [] }),
        stopReason: 'toolUse',
      },
    });
    expect(handler.afterModelCall(event).type).toBe('proceed');
  });

  it('proceeds a final response whose text is empty/whitespace-only, without evaluating source/certainty rules', () => {
    const { emit } = collector();
    const handler = new EvidenceQualitySteering({ ...deps, emit });
    const action = handler.afterModelCall(afterModelCallEndTurn(buildStubAgent(), '   '));
    expect(action.type).toBe('proceed');
  });

  it('guides a final response that cites no source id', () => {
    const { events, emit } = collector();
    const handler = new EvidenceQualitySteering({ ...deps, emit });
    const action = handler.afterModelCall(
      afterModelCallEndTurn(buildStubAgent(), 'The RAV4 is the best choice for this household.'),
    );
    expect(action.type).toBe('guide');
    expect(events[0]?.reason).toContain('source id');
  });

  it('guides a final response that asserts unsupported certainty even with a source id', () => {
    const { emit } = collector();
    const handler = new EvidenceQualitySteering({ ...deps, emit });
    const action = handler.afterModelCall(
      afterModelCallEndTurn(
        buildStubAgent(),
        'Per source-listing-rav4, the RAV4 is definitely the best choice.',
      ),
    );
    expect(action.type).toBe('guide');
  });

  it('proceeds a well-formed response with a source id and no unsupported certainty', () => {
    const { emit } = collector();
    const handler = new EvidenceQualitySteering({ ...deps, emit });
    const action = handler.afterModelCall(
      afterModelCallEndTurn(
        buildStubAgent(),
        'Per source-listing-rav4, the RAV4 fits the stated budget.',
      ),
    );
    expect(action.type).toBe('proceed');
  });
});

describe('OutputSanitizer', () => {
  const deps = { runId: 'run-1', obligationId: 'car.shortlist', clock: FIXED_CLOCK };

  it('proceeds text with no unsupported control content', () => {
    const { emit } = collector();
    const handler = new OutputSanitizer({ ...deps, emit });
    const action = handler.afterModelCall(
      afterModelCallEndTurn(buildStubAgent(), 'Plain safe text.'),
    );
    expect(action.type).toBe('proceed');
  });

  it('transforms and strips an HTML tag from displayable text in place', () => {
    const { events, emit } = collector();
    const handler = new OutputSanitizer({ ...deps, emit });
    const event = afterModelCallEndTurn(
      buildStubAgent(),
      'Safe text<script>alert(1)</script> continues.',
    );
    const action = handler.afterModelCall(event);
    expect(action.type).toBe('transform');
    expect(events[0]?.type).toBe('intervention.transform');

    if (action.type === 'transform') {
      action.apply(event);
    }
    const firstBlock = event.stopData?.message.content[0];
    expect(firstBlock?.type).toBe('textBlock');
    expect(firstBlock?.type === 'textBlock' && firstBlock.text).not.toContain('<script>');
    expect(firstBlock?.type === 'textBlock' && firstBlock.text).toContain('Safe text');
    expect(firstBlock?.type === 'textBlock' && firstBlock.text).toContain('continues.');
  });

  it('leaves non-text content blocks untouched and only replaces the text block(s) that actually changed', () => {
    const { emit } = collector();
    const handler = new OutputSanitizer({ ...deps, emit });
    const toolUse = new ToolUseBlock({
      name: 'listing-reader',
      toolUseId: 'tool-use-1',
      input: {},
    });
    const cleanText = new TextBlock('Already safe text.');
    const dirtyText = new TextBlock('Unsafe<script>alert(1)</script> text.');
    const event = new AfterModelCallEvent({
      agent: buildStubAgent(),
      model: buildStubAgent().model,
      invocationState: {},
      attemptCount: 1,
      stopData: {
        message: new Message({ role: 'assistant', content: [toolUse, cleanText, dirtyText] }),
        stopReason: 'endTurn',
      },
    });

    const action = handler.afterModelCall(event);
    expect(action.type).toBe('transform');
    if (action.type === 'transform') {
      action.apply(event);
    }

    const content = event.stopData?.message.content ?? [];
    // The non-text block is skipped entirely (same reference, untouched).
    expect(content[0]).toBe(toolUse);
    // The already-clean text block is left as the exact same instance --
    // sanitizing it would have been a no-op, so it is never replaced.
    expect(content[1]).toBe(cleanText);
    // Only the block that genuinely needed sanitizing was replaced.
    expect(content[2]).not.toBe(dirtyText);
    expect(content[2]?.type).toBe('textBlock');
    expect(content[2]?.type === 'textBlock' && content[2].text).not.toContain('<script>');
    expect(content[2]?.type === 'textBlock' && content[2].text).toContain('Unsafe');
  });

  it('proceeds when the model call produced no stopData (e.g. an error)', () => {
    const { emit } = collector();
    const handler = new OutputSanitizer({ ...deps, emit });
    const event = new AfterModelCallEvent({
      agent: buildStubAgent(),
      model: buildStubAgent().model,
      invocationState: {},
      attemptCount: 1,
      error: new Error('boom'),
    });
    expect(handler.afterModelCall(event).type).toBe('proceed');
  });
});
