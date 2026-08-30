import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Clock, IdGenerator } from '@sift/core';
import {
  createCapabilityCatalog,
  compileCarPurchasePack,
  CAR_PURCHASE_MANIFEST,
} from '@sift/packs';
import type { ExecutionRequest, ExecutionResult } from '@sift/contracts';
import { PROPOSE_RECOMMENDATION_TOOL_ID } from './strands-adapter.js';
import { ScriptedModelProvider } from './model-provider.js';
import {
  CAR_PURCHASE_GRAPH_NODE_IDS,
  CAR_PURCHASE_PARALLEL_SPECIALIST_IDS,
  executeCarPurchaseGraph,
  type CarPurchaseGraphDeps,
  type CarPurchaseGraphResult,
} from './car-purchase-graph.js';
import type { RuntimeEvent } from './event-normalizer.js';

const SKILLS_ROOT_DIR = fileURLToPath(new URL('../../skills', import.meta.url));
const FIXED_CLOCK: Clock = { now: () => '2026-08-27T00:00:00.000Z' };

function fixedIdGenerator(): IdGenerator {
  let counter = 0;
  return { next: (prefix) => `${prefix ?? 'id'}-${++counter}` };
}

function carPurchaseCatalog() {
  return createCapabilityCatalog([
    ...CAR_PURCHASE_MANIFEST.skills.map((skill) => ({
      id: skill.id,
      kind: 'skill' as const,
      version: '1.0.0',
    })),
    ...CAR_PURCHASE_MANIFEST.specialists.map((specialist) => ({
      id: specialist.id,
      kind: 'specialist' as const,
      version: '1.0.0',
    })),
    ...CAR_PURCHASE_MANIFEST.tools.map((tool) => ({
      id: tool.id,
      kind: 'tool' as const,
      version: '1.0.0',
    })),
  ]);
}

function baseObligation(
  overrides: Partial<ExecutionRequest['obligation']> = {},
): ExecutionRequest['obligation'] {
  return {
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
    ...overrides,
  };
}

function buildExecutionRequest(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    runId: 'run-1',
    caseId: 'case-1',
    pack: { id: 'car-purchase', version: '1.0.0', compiledHash: 'a'.repeat(64) },
    obligation: baseObligation(),
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
      ],
      optionSummaries: [],
      evidenceCounts: { satisfied: 0, active: 1, blocked: 0, acceptedUncertainty: 0, open: 4 },
    },
    caseExtensions: [],
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

const DEAL_RESULT: ExecutionResult = {
  obligationId: 'car.deal_normalization',
  disposition: 'evidence_found',
  claims: [
    {
      statement: 'RAV4 advertised at $27,995, within the household budget.',
      stance: 'supports',
      confidence: 0.7,
      sourceIds: ['source-listing-candidate-rav4'],
    },
  ],
  evidenceResults: [
    {
      sourceId: 'source-listing-candidate-rav4',
      level: 'E1',
      verdict: 'pass',
      summary: 'Listing.',
    },
  ],
  limitations: [],
  suggestedStatus: 'open',
};

const OWNERSHIP_RESULT: ExecutionResult = {
  obligationId: 'car.ownership_cost',
  disposition: 'evidence_found',
  claims: [
    {
      statement: 'RAV4 has the lowest 5-year ownership cost of the four candidates.',
      stance: 'supports',
      confidence: 0.9,
      sourceIds: ['source-ownership-calculator-candidate-rav4'],
    },
  ],
  evidenceResults: [
    {
      sourceId: 'source-ownership-calculator-candidate-rav4',
      level: 'E3',
      verdict: 'pass',
      summary: 'Ownership cost computed.',
    },
  ],
  limitations: [],
  suggestedStatus: 'satisfied',
};

const SAFETY_RESULT: ExecutionResult = {
  obligationId: 'car.safety_reliability',
  disposition: 'evidence_found',
  claims: [
    {
      statement: 'RAV4 rates Top Safety Pick+ with uncontested Above Average reliability.',
      stance: 'supports',
      confidence: 0.85,
      sourceIds: ['source-national-crash-safety-consortium'],
    },
  ],
  evidenceResults: [
    {
      sourceId: 'source-national-crash-safety-consortium',
      level: 'E1',
      verdict: 'pass',
      summary: 'Crash safety.',
    },
  ],
  limitations: [],
  suggestedStatus: 'open',
};

const HOUSEHOLD_FIT_RESULT: ExecutionResult = {
  obligationId: 'car.household_fit',
  disposition: 'evidence_found',
  claims: [
    {
      statement: 'RAV4 known cargo dimensions fit household needs; crate fit remains unverified.',
      stance: 'neutral',
      confidence: 0.5,
      sourceIds: ['source-household-fit-candidate-rav4'],
    },
  ],
  evidenceResults: [
    {
      sourceId: 'source-household-fit-candidate-rav4',
      level: 'E1',
      verdict: 'pass',
      summary: 'Known cargo specs.',
    },
  ],
  limitations: ['Dog crate fit cannot be confirmed from specifications alone.'],
  suggestedStatus: 'accepted_uncertainty',
};

const CHALLENGE_RESULT: ExecutionResult = {
  obligationId: 'car.deal_normalization',
  disposition: 'evidence_found',
  claims: [
    {
      statement:
        "RAV4's true out-the-door price ($33,291.30) exceeds the household's $32,000 budget by $1,291.30.",
      stance: 'opposes',
      confidence: 0.95,
      sourceIds: ['source-dealer-offer-candidate-rav4'],
    },
  ],
  evidenceResults: [
    {
      sourceId: 'source-dealer-offer-candidate-rav4',
      level: 'E2',
      verdict: 'degraded',
      summary: 'Teaser-price conflict confirmed and documented.',
    },
  ],
  limitations: [],
  suggestedStatus: 'open',
};

function buildDeps(overrides: Partial<CarPurchaseGraphDeps> = {}): CarPurchaseGraphDeps {
  const pack = compileCarPurchasePack(carPurchaseCatalog(), FIXED_CLOCK);

  const providers = new Map<string, ScriptedModelProvider>();
  function providerFor(
    nodeId: string,
    turns: ConstructorParameters<typeof ScriptedModelProvider>[0]['beats']['turn'],
  ): void {
    const provider = new ScriptedModelProvider({ beats: { turn: turns } });
    providers.set(nodeId, provider);
  }

  providerFor('deal-analyst', [
    { toolCalls: [{ name: 'strands_structured_output', input: DEAL_RESULT }] },
  ]);
  providerFor('ownership-cost-analyst', [
    { toolCalls: [{ name: 'strands_structured_output', input: OWNERSHIP_RESULT }] },
  ]);
  providerFor('safety-reliability-analyst', [
    { toolCalls: [{ name: 'strands_structured_output', input: SAFETY_RESULT }] },
  ]);
  providerFor('household-fit-analyst', [
    { toolCalls: [{ name: 'strands_structured_output', input: HOUSEHOLD_FIT_RESULT }] },
  ]);
  providerFor('source-challenger', [
    { toolCalls: [{ name: 'strands_structured_output', input: CHALLENGE_RESULT }] },
  ]);
  providerFor('decision-synthesizer', [
    {
      toolCalls: [
        {
          name: PROPOSE_RECOMMENDATION_TOOL_ID,
          input: {
            candidateIds: ['candidate-rav4'],
            rationale: 'strongest ownership cost and safety',
          },
        },
      ],
    },
    { text: 'Recommend candidate-rav4 per source-listing-candidate-rav4.' },
  ]);

  for (const provider of providers.values()) {
    provider.setBeat('turn');
  }

  const specialistRequests = {
    'deal-analyst': buildExecutionRequest({ obligation: baseObligation() }),
    'ownership-cost-analyst': buildExecutionRequest({
      obligation: baseObligation({
        id: 'car.ownership_cost',
        label: 'Ownership cost',
        category: 'ownership_cost',
        preferredSpecialists: ['ownership-cost-analyst'],
      }),
    }),
    'safety-reliability-analyst': buildExecutionRequest({
      obligation: baseObligation({
        id: 'car.safety_reliability',
        label: 'Safety and reliability',
        category: 'safety_reliability',
        acceptedUncertaintyAllowed: true,
        preferredSpecialists: ['safety-reliability-analyst', 'source-challenger'],
      }),
    }),
    'household-fit-analyst': buildExecutionRequest({
      obligation: baseObligation({
        id: 'car.household_fit',
        label: 'Household fit',
        category: 'household_fit',
        acceptedUncertaintyAllowed: true,
        preferredSpecialists: ['household-fit-analyst'],
      }),
    }),
  };

  const shortlistRequest = buildExecutionRequest({
    obligation: baseObligation({
      id: 'car.shortlist',
      label: 'Shortlist recommendation',
      category: 'shortlist',
      priority: 10,
      dependsOn: [
        'car.hard_constraints',
        'car.deal_normalization',
        'car.ownership_cost',
        'car.safety_reliability',
        'car.household_fit',
      ],
      preferredSpecialists: ['decision-synthesizer', 'source-challenger'],
    }),
  });

  return {
    pack,
    modelFor: (nodeId) => {
      const provider = providers.get(nodeId);
      if (provider === undefined) {
        throw new Error(`test buildDeps: no scripted provider registered for node "${nodeId}"`);
      }
      return provider;
    },
    skillsRootDir: SKILLS_ROOT_DIR,
    clock: FIXED_CLOCK,
    idGenerator: fixedIdGenerator(),
    specialistRequests,
    shortlistRequest,
    resolveConfirmation: () => true,
    ...overrides,
  };
}

function isRuntimeEvent(item: unknown): item is RuntimeEvent {
  return typeof item === 'object' && item !== null && 'sequence' in item;
}

async function drain(
  gen: AsyncGenerator<RuntimeEvent, CarPurchaseGraphResult, undefined>,
): Promise<{ events: RuntimeEvent[]; result: CarPurchaseGraphResult }> {
  const events: RuntimeEvent[] = [];
  let next = await gen.next();
  while (!next.done) {
    if (isRuntimeEvent(next.value)) events.push(next.value);
    next = await gen.next();
  }
  return { events, result: next.value };
}

describe('CAR_PURCHASE_GRAPH_NODE_IDS', () => {
  it('names exactly the six pack-declared specialists', () => {
    expect([...CAR_PURCHASE_GRAPH_NODE_IDS].sort()).toEqual(
      [
        'deal-analyst',
        'ownership-cost-analyst',
        'safety-reliability-analyst',
        'household-fit-analyst',
        'source-challenger',
        'decision-synthesizer',
      ].sort(),
    );
  });
});

describe('executeCarPurchaseGraph', () => {
  it('runs the real six-node Graph, waiting for all four parallel specialists before source-challenger, and source-challenger before decision-synthesizer', async () => {
    const { events, result } = await drain(executeCarPurchaseGraph(buildDeps()));

    // AND-semantics dependency proof: source-challenger only starts once
    // every parallel specialist has genuinely finished.
    const finishIndex = (id: string): number => result.nodeFinishOrder.indexOf(id);
    const startIndex = (id: string): number => result.nodeStartOrder.indexOf(id);

    for (const specialistId of CAR_PURCHASE_PARALLEL_SPECIALIST_IDS) {
      expect(finishIndex(specialistId)).toBeGreaterThanOrEqual(0);
      expect(finishIndex(specialistId)).toBeLessThan(startIndex('source-challenger'));
    }
    expect(finishIndex('source-challenger')).toBeLessThan(startIndex('decision-synthesizer'));

    expect(result.multiAgentResult.status).toBe('COMPLETED');
    expect(events.length).toBeGreaterThan(0);
  });

  it('captures a validated ExecutionResult per parallel specialist and source-challenger', async () => {
    const { result } = await drain(executeCarPurchaseGraph(buildDeps()));
    expect(result.executionResults['deal-analyst']).toEqual(DEAL_RESULT);
    expect(result.executionResults['ownership-cost-analyst']).toEqual(OWNERSHIP_RESULT);
    expect(result.executionResults['safety-reliability-analyst']).toEqual(SAFETY_RESULT);
    expect(result.executionResults['household-fit-analyst']).toEqual(HOUSEHOLD_FIT_RESULT);
    expect(result.executionResults['source-challenger']).toEqual(CHALLENGE_RESULT);
  });

  it('captures the decision-synthesizer propose_recommendation call and its GoalLoop-validated text', async () => {
    const { result } = await drain(executeCarPurchaseGraph(buildDeps()));
    expect(result.proposedRecommendation).toEqual({
      candidateIds: ['candidate-rav4'],
      rationale: 'strongest ownership cost and safety',
    });
    expect(result.decisionSynthesizerText).toContain('candidate-rav4');
    expect(result.goalLoopResult?.passed).toBe(true);
  });

  it('genuinely wires skills, context injection, and interventions for every parallel specialist and source-challenger', async () => {
    const { events } = await drain(executeCarPurchaseGraph(buildDeps()));
    for (const nodeId of [...CAR_PURCHASE_PARALLEL_SPECIALIST_IDS, 'source-challenger']) {
      expect(
        events.some((event) => event.category === 'context' && event.agentId === nodeId),
        `expected a context.injected event for node "${nodeId}"`,
      ).toBe(true);
      expect(
        events.some((event) => event.category === 'intervention' && event.agentId === nodeId),
        `expected an intervention event for node "${nodeId}"`,
      ).toBe(true);
    }
    // decision-synthesizer's ConsequenceGuard genuinely confirms the
    // propose_recommendation tool call.
    expect(
      events.some(
        (event) =>
          event.category === 'intervention' &&
          event.agentId === 'decision-synthesizer' &&
          event.name === 'intervention.confirm',
      ),
    ).toBe(true);
  });

  it('emits a graph.node_completed event per node in real completion order', async () => {
    const { events, result } = await drain(executeCarPurchaseGraph(buildDeps()));
    const graphEvents = events.filter((event) => event.category === 'graph');
    expect(graphEvents.length).toBeGreaterThanOrEqual(CAR_PURCHASE_GRAPH_NODE_IDS.length);
    expect(result.nodeFinishOrder.sort()).toEqual([...CAR_PURCHASE_GRAPH_NODE_IDS].sort());
  });

  it('throws before any node runs when the compiled pack declares no specialist matching a required Graph node id', async () => {
    const deps = buildDeps();
    const brokenPack = {
      ...deps.pack,
      specialists: deps.pack.specialists.filter((specialist) => specialist.id !== 'deal-analyst'),
    };

    await expect(drain(executeCarPurchaseGraph({ ...deps, pack: brokenPack }))).rejects.toThrow(
      /declares no specialist "deal-analyst"/,
    );
  });

  it('DEFAULT_VALIDATOR rejects an empty decision-synthesizer response, then accepts a corrected retry (GoalLoop maxAttempts: 2)', async () => {
    // An empty response passes through EvidenceQualitySteering untouched
    // (interventions.ts's EvidenceQualitySteering.afterModelCall only
    // steers a non-empty, uncited *endTurn* response -- an empty one
    // `proceed()`s immediately), so it reaches DEFAULT_VALIDATOR directly
    // and fails on its own empty-text check, independent of any other
    // intervention.
    const deps = buildDeps();
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          { text: '' },
          { text: 'Recommend candidate-rav4 per source-listing-candidate-rav4.' },
        ],
      },
    });
    provider.setBeat('turn');
    const patchedModelFor: CarPurchaseGraphDeps['modelFor'] = (nodeId) =>
      nodeId === 'decision-synthesizer' ? provider : deps.modelFor(nodeId);

    const { result } = await drain(executeCarPurchaseGraph({ ...deps, modelFor: patchedModelFor }));

    expect(result.goalLoopResult?.passed).toBe(true);
    expect(result.goalLoopResult?.attempts).toHaveLength(2);
    expect(result.goalLoopResult?.attempts[0]?.passed).toBe(false);
    expect(result.goalLoopResult?.attempts[0]?.feedback).toContain('must include text');
    expect(result.goalLoopResult?.attempts[1]?.passed).toBe(true);
  });

  it('completes with no explicit resolveConfirmation resolver when decision-synthesizer never calls the consequential propose_recommendation tool', async () => {
    const deps = buildDeps();
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          {
            text: 'Still evaluating candidates per source-listing-candidate-rav4; no clear leader has emerged yet.',
          },
        ],
      },
    });
    provider.setBeat('turn');
    const patchedModelFor: CarPurchaseGraphDeps['modelFor'] = (nodeId) =>
      nodeId === 'decision-synthesizer' ? provider : deps.modelFor(nodeId);

    // Deliberately omit resolveConfirmation: ConsequenceGuard is still
    // constructed for every node (the real code path this exercises), but
    // never actually asked to resolve a confirmation since the tool it
    // guards is never called.
    const { resolveConfirmation: _unused, ...depsWithoutConfirmation } = deps;
    void _unused;

    const { result } = await drain(
      executeCarPurchaseGraph({ ...depsWithoutConfirmation, modelFor: patchedModelFor }),
    );

    expect(result.goalLoopResult?.passed).toBe(true);
    expect(result.proposedRecommendation).toBeUndefined();
  });

  it("bakes confirmed case-specific concerns and a non-empty criteria list into decision-synthesizer's system prompt", async () => {
    const deps = buildDeps({
      shortlistRequest: {
        ...buildDeps().shortlistRequest,
        caseExtensions: [
          {
            id: 'custom.pet_odor',
            label: 'Lingering pet odor concern',
            valueType: 'string',
            reason: 'Household reported a lingering pet odor after the last inspection.',
            origin: 'user',
            confirmation: 'confirmed',
          },
        ],
      },
    });
    const providers = new Map<string, ScriptedModelProvider>();
    const patchedModelFor: CarPurchaseGraphDeps['modelFor'] = (nodeId) => deps.modelFor(nodeId);
    void providers;

    await drain(executeCarPurchaseGraph({ ...deps, modelFor: patchedModelFor }));

    // The decision-synthesizer provider instance is whatever buildDeps()
    // registered -- retrieve it the same way modelFor does.
    const synthesizerProvider = deps.modelFor('decision-synthesizer') as ScriptedModelProvider;
    const systemPrompt = synthesizerProvider.callLog[0]?.options?.systemPrompt;
    const promptText =
      typeof systemPrompt === 'string' ? systemPrompt : JSON.stringify(systemPrompt);
    expect(promptText).toContain('Confirmed case-specific concerns: Lingering pet odor concern');
  });

  it('falls back to "(none)" criteria text and omits the confirmed-concerns line when the case has no criteria or confirmed extensions', async () => {
    const base = buildDeps();
    const deps = buildDeps({
      shortlistRequest: {
        ...base.shortlistRequest,
        caseExtensions: [],
        caseSummary: { ...base.shortlistRequest.caseSummary, criteria: [] },
      },
    });

    await drain(executeCarPurchaseGraph(deps));

    const synthesizerProvider = deps.modelFor('decision-synthesizer') as ScriptedModelProvider;
    const systemPrompt = synthesizerProvider.callLog[0]?.options?.systemPrompt;
    const promptText =
      typeof systemPrompt === 'string' ? systemPrompt : JSON.stringify(systemPrompt);
    expect(promptText).toContain('Current criteria: (none).');
    expect(promptText).not.toContain('Confirmed case-specific concerns');
  });

  it('overrides GoalLoop.maxAttempts via goalLoopMaxAttempts, surviving two empty-response failures the default maxAttempts: 2 would not', async () => {
    const deps = buildDeps();
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          { text: '' },
          { text: '' },
          {
            toolCalls: [
              {
                name: PROPOSE_RECOMMENDATION_TOOL_ID,
                input: { candidateIds: ['candidate-rav4'], rationale: 'third time is the charm' },
              },
            ],
          },
          { text: 'Recommend candidate-rav4 per source-listing-candidate-rav4.' },
        ],
      },
    });
    provider.setBeat('turn');
    const patchedModelFor: CarPurchaseGraphDeps['modelFor'] = (nodeId) =>
      nodeId === 'decision-synthesizer' ? provider : deps.modelFor(nodeId);

    const { result } = await drain(
      executeCarPurchaseGraph({ ...deps, modelFor: patchedModelFor, goalLoopMaxAttempts: 3 }),
    );

    expect(result.goalLoopResult?.attempts).toHaveLength(3);
    expect(result.goalLoopResult?.attempts[0]?.passed).toBe(false);
    expect(result.goalLoopResult?.attempts[1]?.passed).toBe(false);
    expect(result.goalLoopResult?.passed).toBe(true);
    expect(result.proposedRecommendation).toEqual({
      candidateIds: ['candidate-rav4'],
      rationale: 'third time is the charm',
    });
  });

  it('runs the real Graph without an explicit maxConcurrency when the compiled pack orchestration omits it', async () => {
    // compilePack requires a "graph" orchestration to declare maxConcurrency
    // (packages/packs/src/compiler.ts), so every real compiled pack always
    // has one -- this constructs the one CompiledDecisionPack shape the
    // compiler itself would reject, purely to exercise the Graph
    // constructor's own optional-field default.
    const deps = buildDeps();
    const packWithoutConcurrency = {
      ...deps.pack,
      orchestration: { ...deps.pack.orchestration, maxConcurrency: undefined },
    };

    const { result } = await drain(
      executeCarPurchaseGraph({ ...deps, pack: packWithoutConcurrency }),
    );
    expect(result.multiAgentResult.status).toBe('COMPLETED');
  });

  it('throws before any node runs when skillsRootDir has no skill subdirectories', async () => {
    const deps = buildDeps();
    const emptyRoot = mkdtempSync(join(tmpdir(), 'sift-empty-skills-'));
    writeFileSync(join(emptyRoot, 'not-a-skill.txt'), 'just a file, not a skill directory');
    try {
      await expect(
        drain(executeCarPurchaseGraph({ ...deps, skillsRootDir: emptyRoot })),
      ).rejects.toThrow(/has no skill subdirectories/);
    } finally {
      rmSync(emptyRoot, { recursive: true, force: true });
    }
  });

  it("captureProposal's BeforeToolCallEvent hook ignores a tool call other than propose_recommendation before the real one arrives", async () => {
    const deps = buildDeps();
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          // strands_structured_output is one of SDK_INTERNAL_TOOL_NAMES, so
          // ScopeAuthorization allows it through even though it is not
          // decision-synthesizer's own consequential tool -- exercising the
          // real "some other tool fired first" branch in the module's own
          // BeforeToolCallEvent hook without needing an invalid/denied call.
          {
            toolCalls: [
              { name: 'strands_structured_output', input: { note: 'not the real proposal shape' } },
            ],
          },
          {
            toolCalls: [
              {
                name: PROPOSE_RECOMMENDATION_TOOL_ID,
                input: {
                  candidateIds: ['candidate-rav4'],
                  rationale: 'confirmed after reflection',
                },
              },
            ],
          },
          { text: 'Recommend candidate-rav4 per source-listing-candidate-rav4.' },
        ],
      },
    });
    provider.setBeat('turn');
    const patchedModelFor: CarPurchaseGraphDeps['modelFor'] = (nodeId) =>
      nodeId === 'decision-synthesizer' ? provider : deps.modelFor(nodeId);

    const { result } = await drain(executeCarPurchaseGraph({ ...deps, modelFor: patchedModelFor }));

    expect(result.proposedRecommendation).toEqual({
      candidateIds: ['candidate-rav4'],
      rationale: 'confirmed after reflection',
    });
  });

  it('denies a tool call outside a specialist node declared allowlist before it ever executes', async () => {
    const deps = buildDeps();
    // Redirect deal-analyst's scripted turn to attempt a tool it was never
    // granted (ownership-calculator is not in deal-analyst's allowedTools).
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          {
            toolCalls: [{ name: 'ownership-calculator', input: { candidateId: 'candidate-rav4' } }],
          },
          { toolCalls: [{ name: 'strands_structured_output', input: DEAL_RESULT }] },
        ],
      },
    });
    provider.setBeat('turn');
    const patchedModelFor: CarPurchaseGraphDeps['modelFor'] = (nodeId) =>
      nodeId === 'deal-analyst' ? provider : deps.modelFor(nodeId);

    const { events } = await drain(executeCarPurchaseGraph({ ...deps, modelFor: patchedModelFor }));
    const denyEvent = events.find(
      (event) =>
        event.category === 'intervention' &&
        event.name === 'intervention.deny' &&
        event.agentId === 'deal-analyst',
    );
    expect(denyEvent).toBeDefined();
  });
});
