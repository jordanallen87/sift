import { fileURLToPath } from 'node:url';
import { Agent, Message, TextBlock, tool, type ToolResultBlock } from '@strands-agents/sdk';
import { AgentSkills } from '@strands-agents/sdk/vended-plugins/skills';
import { ContextInjector } from '@strands-agents/sdk/vended-plugins/context-injector';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import type { ExecutionRequest } from '@pax/contracts';
import {
  createSequenceCounter,
  type NormalizerContext,
  type RuntimeEvent,
} from './event-normalizer.js';
import { ScopeAuthorization, type InterventionEvent } from './interventions.js';
import { ScriptedModelProvider } from './model-provider.js';
import {
  STUB_RECOMMENDATION_VALIDATOR,
  buildContextInjector,
  buildDecisionSynthesizerAgent,
  buildSkillsPlugin,
  projectCaseContext,
  renderCaseContextText,
} from './plugins.js';

const SKILLS_ROOT_DIR = fileURLToPath(new URL('../../skills', import.meta.url));

const CTX: NormalizerContext = {
  traceId: 'trace-1',
  runId: 'run-1',
  caseId: 'case-1',
  obligationId: 'car.deal_normalization',
};

function buildExecutionRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    runId: 'run-1',
    caseId: 'case-1',
    pack: { id: 'car-purchase', version: '1.0.0', compiledHash: 'a'.repeat(64) },
    obligation: {
      id: 'car.deal_normalization',
      label: 'Deal normalization',
      question: "What is each candidate's comparable out-the-door price?",
      category: 'deal',
      required: true,
      priority: 80,
      requiredEvidenceLevel: 'E2',
      maxAttempts: 2,
      acceptedUncertaintyAllowed: false,
      dependsOn: [],
      preferredSkills: ['deal-analysis'],
      preferredSpecialists: ['deal-analyst'],
      completionRule: {
        minimumEvidenceLevel: 'E2',
        minimumIndependentSources: 2,
        acceptedUncertaintyAllowed: false,
      },
      origin: 'pack',
      status: 'active',
      attemptsUsed: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    caseSummary: {
      caseId: 'case-1',
      title: 'Choose our next car',
      status: 'investigating',
      criteria: [
        {
          id: 'pref.ownership_cost',
          label: '5-year ownership cost',
          kind: 'preference',
          weight: 30,
          direction: 'lower_better',
          origin: 'pack',
          status: 'active',
        },
        {
          id: 'custom.rear_crate_fit',
          label: 'Both dog crates fit behind the second row',
          kind: 'hard_constraint',
          weight: 100,
          direction: 'higher_better',
          origin: 'user',
          status: 'active',
        },
      ],
      optionSummaries: [],
      evidenceCounts: { satisfied: 1, active: 2, blocked: 0, acceptedUncertainty: 0, open: 3 },
    },
    caseExtensions: [
      {
        id: 'ext-1',
        label: 'Rear cargo crate fit',
        valueType: 'boolean',
        reason: 'household wants confirmation both crates fit',
        origin: 'user',
        confirmation: 'confirmed',
      },
      {
        id: 'ext-2',
        label: 'Agent-proposed pet odor concern',
        valueType: 'boolean',
        reason: 'agent noticed a review mentioning pet odor complaints',
        origin: 'agent_proposed',
        confirmation: 'pending',
      },
    ],
    availableSkills: ['deal-analysis', 'listing-normalizer'],
    availableSpecialists: ['deal-analyst'],
    allowedTools: ['listing-reader'],
    priorAttempts: [],
    limits: {
      maxAttemptsPerObligation: 2,
      maxToolCallsPerRun: 12,
      maxGraphNodeExecutionsPerRun: 6,
      modelRequestTimeoutMs: 120_000,
      totalRunTimeoutMs: 300_000,
    },
    ...overrides,
  };
}

function buildStubAgent(): Agent {
  return new Agent({ model: new ScriptedModelProvider({ beats: {} }), printer: false });
}

describe('buildSkillsPlugin', () => {
  it('builds a real AgentSkills plugin pointed at the given skills directory', () => {
    const plugin = buildSkillsPlugin(SKILLS_ROOT_DIR);
    expect(plugin).toBeInstanceOf(AgentSkills);
  });

  it('honors explicit strict/maxResourceFiles options', () => {
    const plugin = buildSkillsPlugin(SKILLS_ROOT_DIR, { strict: true, maxResourceFiles: 5 });
    expect(plugin).toBeInstanceOf(AgentSkills);
  });

  it('a real Agent with the plugin exposes skill metadata up front and activates the real deal-analysis SKILL.md on request', async () => {
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          { toolCalls: [{ name: 'skills', input: { skill_name: 'deal-analysis' } }] },
          { text: 'Activated deal-analysis.' },
        ],
      },
    });
    provider.setBeat('turn');

    const skillsPlugin = buildSkillsPlugin(SKILLS_ROOT_DIR);
    const agent = new Agent({ model: provider, plugins: [skillsPlugin], printer: false });
    const result = await agent.invoke('Investigate the deal for candidate-rav4.');
    expect(result.stopReason).toBe('endTurn');

    // Progressive disclosure: skill metadata (name) is injected into the
    // system prompt on the very first call, before any skill is activated.
    const firstCallSystemPrompt = provider.callLog[0]?.options?.systemPrompt;
    const systemPromptText =
      typeof firstCallSystemPrompt === 'string'
        ? firstCallSystemPrompt
        : JSON.stringify(firstCallSystemPrompt);
    expect(systemPromptText).toContain('deal-analysis');

    // Full instructions load only once activated -- verify the real
    // apps/agent/skills/deal-analysis/SKILL.md content reached the
    // conversation via the real skills tool's result (nested inside the
    // toolResultBlock's own content array).
    const toolResultTexts = agent.messages
      .flatMap((message) => message.content)
      .filter((block): block is ToolResultBlock => block.type === 'toolResultBlock')
      .flatMap((block) => block.content)
      .filter((block): block is TextBlock => block.type === 'textBlock')
      .map((block) => block.text);
    expect(toolResultTexts.some((text) => text.includes('car.hard_constraints'))).toBe(true);
  });
});

describe('projectCaseContext', () => {
  it('projects the active obligation, evidence inventory, and remaining budgets', () => {
    const projection = projectCaseContext(buildExecutionRequest());
    expect(projection.activeObligation.id).toBe('car.deal_normalization');
    expect(projection.evidenceInventory).toEqual({
      satisfied: 1,
      active: 2,
      blocked: 0,
      acceptedUncertainty: 0,
      open: 3,
    });
    expect(projection.remainingBudgets.attemptsRemaining).toBe(2);
  });

  it('reduces remaining attempts as prior attempts accumulate', () => {
    const request = buildExecutionRequest({
      priorAttempts: [
        {
          attemptNumber: 1,
          resultStatus: 'no_new_evidence',
          sourceIds: [],
          evidenceDelta: 0,
          timestamp: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(projectCaseContext(request).remainingBudgets.attemptsRemaining).toBe(1);
  });

  it('includes criteria with origin labels', () => {
    const projection = projectCaseContext(buildExecutionRequest());
    expect(projection.criteria).toEqual([
      {
        id: 'pref.ownership_cost',
        label: '5-year ownership cost',
        origin: 'pack',
        weight: 30,
        direction: 'lower_better',
      },
      {
        id: 'custom.rear_crate_fit',
        label: 'Both dog crates fit behind the second row',
        origin: 'user',
        weight: 100,
        direction: 'higher_better',
      },
    ]);
  });

  it('includes only confirmed case extensions, excluding pending/rejected ones', () => {
    const projection = projectCaseContext(buildExecutionRequest());
    expect(projection.confirmedExtensions).toHaveLength(1);
    expect(projection.confirmedExtensions[0]?.id).toBe('ext-1');
  });
});

describe('renderCaseContextText', () => {
  it('renders a deterministic string containing the active obligation and criteria, excluding unconfirmed extensions', () => {
    const projection = projectCaseContext(buildExecutionRequest());
    const text = renderCaseContextText(projection);
    expect(text).toContain('car.deal_normalization');
    expect(text).toContain('custom.rear_crate_fit');
    expect(text).toContain('ext-1');
    expect(text).not.toContain('ext-2');
    expect(renderCaseContextText(projection)).toBe(text);
  });
});

describe('buildContextInjector', () => {
  it('builds a real ContextInjector and emits a context.injected event with field names and a content hash, never raw content', async () => {
    const events: RuntimeEvent[] = [];
    const sequence = createSequenceCounter();
    const request = buildExecutionRequest();
    const injector = buildContextInjector(request, {
      ctx: CTX,
      sequence,
      emit: (event) => events.push(event),
    });
    expect(injector).toBeInstanceOf(ContextInjector);

    const provider = new ScriptedModelProvider({ beats: { turn: [{ text: 'ok' }] } });
    provider.setBeat('turn');
    const agent = new Agent({ model: provider, plugins: [injector], printer: false });
    await agent.invoke('Investigate.');

    expect(events).toHaveLength(1);
    expect(events[0]?.category).toBe('context');
    expect(events[0]?.name).toBe('context.injected');
    const fields = events[0]?.attributes['fields'];
    expect(fields).toEqual(
      expect.arrayContaining([
        'activeObligation',
        'evidenceInventory',
        'remainingBudgets',
        'criteria',
      ]),
    );
    expect(JSON.stringify(events[0])).not.toContain('custom.rear_crate_fit');
  });
});

describe('decision-synthesizer GoalLoop', () => {
  it('rejects an unsupported draft with exact feedback and passes on the second attempt', async () => {
    const provider = new ScriptedModelProvider({
      beats: {
        synth: [
          { text: 'Choose the RAV4 because it is nice.' },
          { text: 'Choose the RAV4 per source-listing-rav4 and source-dealer-offer-rav4.' },
        ],
      },
    });
    provider.setBeat('synth');

    const { agent, goalLoop } = buildDecisionSynthesizerAgent({
      model: provider,
      systemPrompt: 'Synthesize a source-linked shortlist recommendation.',
      validator: STUB_RECOMMENDATION_VALIDATOR,
      maxAttempts: 2,
    });

    const result = await agent.invoke('Synthesize the shortlist recommendation.');
    expect(result.stopReason).toBe('endTurn');
    expect(result.toString()).toContain('source-listing-rav4');

    const goalResult = goalLoop.lastResult(agent);
    expect(goalResult?.passed).toBe(true);
    expect(goalResult?.stopReason).toBe('satisfied');
    expect(goalResult?.attempts).toHaveLength(2);
    expect(goalResult?.attempts[0]?.passed).toBe(false);
    expect(goalResult?.attempts[0]?.feedback).toContain('source id');
    expect(goalResult?.attempts[1]?.passed).toBe(true);
  });

  it('exhausts maxAttempts and reports a failed, not silently-published, result', async () => {
    const provider = new ScriptedModelProvider({
      beats: { synth: [{ text: 'no sources here' }, { text: 'still no sources' }] },
    });
    provider.setBeat('synth');

    const { agent, goalLoop } = buildDecisionSynthesizerAgent({
      model: provider,
      systemPrompt: 'Synthesize a source-linked shortlist recommendation.',
      validator: STUB_RECOMMENDATION_VALIDATOR,
      maxAttempts: 2,
    });

    await agent.invoke('Synthesize the shortlist recommendation.');
    const goalResult = goalLoop.lastResult(agent);
    expect(goalResult?.passed).toBe(false);
    expect(goalResult?.stopReason).toBe('maxAttempts');
    expect(goalResult?.attempts).toHaveLength(2);
  });

  it('is its own distinct Agent instance, never sharing identity with another agent', () => {
    const { agent } = buildDecisionSynthesizerAgent({
      model: new ScriptedModelProvider({ beats: {} }),
      systemPrompt: 'Synthesize.',
      validator: STUB_RECOMMENDATION_VALIDATOR,
    });
    expect(agent.id).toBe('decision-synthesizer');
    expect(agent).not.toBe(buildStubAgent());
  });

  it('accepts explicit tools and interventions, both genuinely wired into the Agent', async () => {
    const calls: string[] = [];
    const echoTool = tool({
      name: 'echo-tool',
      description: 'test tool',
      inputSchema: z.object({ text: z.string() }),
      callback: (input) => {
        calls.push(input.text);
        return { echoed: input.text };
      },
    });
    const interventionEvents: InterventionEvent[] = [];
    const scope = new ScopeAuthorization({
      runId: 'run-1',
      obligationId: 'car.shortlist',
      clock: { now: () => '2026-01-01T00:00:00.000Z' },
      emit: (event) => interventionEvents.push(event),
      allowedTools: ['echo-tool'],
    });

    const provider = new ScriptedModelProvider({
      beats: {
        synth: [
          { toolCalls: [{ name: 'echo-tool', input: { text: 'hi' } }] },
          { text: 'Choose the RAV4 per source-listing-rav4.' },
        ],
      },
    });
    provider.setBeat('synth');

    const { agent } = buildDecisionSynthesizerAgent({
      model: provider,
      systemPrompt: 'Synthesize.',
      validator: STUB_RECOMMENDATION_VALIDATOR,
      tools: [echoTool],
      interventions: [scope],
    });

    await agent.invoke('Synthesize.');
    expect(calls).toEqual(['hi']);
    expect(interventionEvents.some((event) => event.type === 'intervention.proceed')).toBe(true);
  });
});

describe('STUB_RECOMMENDATION_VALIDATOR', () => {
  it('rejects an empty response', () => {
    const outcome = STUB_RECOMMENDATION_VALIDATOR(
      new Message({ role: 'assistant', content: [new TextBlock('')] }),
      buildStubAgent(),
    );
    expect(outcome).not.toBe(true);
  });

  it('rejects a response with no source id', () => {
    const outcome = STUB_RECOMMENDATION_VALIDATOR(
      new Message({ role: 'assistant', content: [new TextBlock('Choose the RAV4.')] }),
      buildStubAgent(),
    );
    expect(outcome).toMatchObject({ passed: false });
  });

  it('passes a response that cites a source id', () => {
    const outcome = STUB_RECOMMENDATION_VALIDATOR(
      new Message({
        role: 'assistant',
        content: [new TextBlock('Choose the RAV4 per source-listing-rav4.')],
      }),
      buildStubAgent(),
    );
    expect(outcome).toMatchObject({ passed: true });
  });
});
