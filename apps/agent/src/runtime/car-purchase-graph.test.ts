import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Message, ModelStreamEvent, StreamOptions } from '@strands-agents/sdk';
import type { Clock, IdGenerator } from '@sift/core';
import {
  createCapabilityCatalog,
  compileCarPurchasePack,
  CAR_PURCHASE_MANIFEST,
} from '@sift/packs';
import type { ExecutionRequest, ExecutionResult } from '@sift/contracts';
import { PROPOSE_RECOMMENDATION_TOOL_ID } from './strands-adapter.js';
import { ScriptedModelProvider, type ScriptedModelProviderConfig } from './model-provider.js';
import {
  CAR_PURCHASE_GRAPH_NODE_IDS,
  CAR_PURCHASE_PARALLEL_SPECIALIST_IDS,
  createNodeDurationTracker,
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
      status: 'draft',
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

/**
 * A real `ScriptedModelProvider` whose `stream()` parks on a
 * caller-controlled promise before serving its scripted turn -- the
 * deterministic, timer-free stand-in for "this node is still working". Used
 * to hold one Graph node open while asserting what a consumer has *already*
 * received from the nodes that finished before it.
 */
class GatedModelProvider extends ScriptedModelProvider {
  /** True once a node's `Agent` has genuinely entered this provider's `stream()` and is parked on the gate. */
  streamEntered = false;
  private readonly gate: Promise<void>;
  private release: (() => void) | undefined;

  constructor(config: ScriptedModelProviderConfig) {
    super(config);
    this.gate = new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }

  /** Lets the parked node proceed. */
  open(): void {
    this.release?.();
  }

  override async *stream(
    messages: Message[],
    options?: StreamOptions,
  ): AsyncIterable<ModelStreamEvent> {
    this.streamEntered = true;
    await this.gate;
    yield* super.stream(messages, options);
  }
}

/** Runs the generator to completion in the background, appending each yielded event to `received` as it arrives. */
function consumeInBackground(
  gen: AsyncGenerator<RuntimeEvent, CarPurchaseGraphResult, undefined>,
): {
  received: RuntimeEvent[];
  done: () => boolean;
  completed: Promise<CarPurchaseGraphResult>;
} {
  const received: RuntimeEvent[] = [];
  let finished = false;
  const completed = (async () => {
    try {
      let next = await gen.next();
      while (!next.done) {
        received.push(next.value);
        next = await gen.next();
      }
      return next.value;
    } finally {
      finished = true;
    }
  })();
  return { received, done: () => finished, completed };
}

/** Flushes pending microtasks and macrotasks so everything that *can* progress has, without sleeping for a fixed duration. */
async function settleEventLoop(turns = 10): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/**
 * Advances the event loop until `predicate` holds. Bounded by a turn count
 * rather than a wall-clock timeout, so it is deterministic and never sleeps;
 * the bound is a failure guard, not a delay (the loop returns the moment the
 * condition is met).
 */
async function waitUntil(predicate: () => boolean, description: string): Promise<void> {
  for (let turn = 0; turn < 5000; turn += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`waitUntil: ${description} never became true`);
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

/**
 * Producer-side telemetry the car pack genuinely runs but, until this
 * suite, never recorded. Each of these asserts on the events the real
 * six-node Graph actually yielded -- never on a spy or a call count.
 */
describe('executeCarPurchaseGraph runtime telemetry', () => {
  it('emits a real goal.validated event for the GoalLoop the car pack actually runs', async () => {
    const { events, result } = await drain(executeCarPurchaseGraph(buildDeps()));

    const goalEvents = events.filter((event) => event.category === 'goal');
    expect(goalEvents).toHaveLength(1);
    expect(goalEvents[0]?.name).toBe('goal.validated');
    expect(goalEvents[0]?.level).toBe('info');
    expect(goalEvents[0]?.phase).toBe('finish');
    // Attributed to the node that owns the GoalLoop, and carrying the real
    // plugin's own 1-indexed attempt number.
    expect(goalEvents[0]?.agentId).toBe('decision-synthesizer');
    expect(goalEvents[0]?.obligationId).toBe('car.shortlist');
    expect(goalEvents[0]?.attributes['attempt']).toBe(1);
    expect(goalEvents[0]?.attributes['exhausted']).toBe(false);

    // The events describe the same run the returned GoalLoop result does.
    expect(goalEvents).toHaveLength(result.goalLoopResult?.attempts.length ?? 0);
  });

  it('emits one goal.validation_failed with the validator’s real feedback, then a goal.validated, when the first draft is rejected', async () => {
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

    const { events } = await drain(executeCarPurchaseGraph({ ...deps, modelFor: patchedModelFor }));

    const goalEvents = events.filter((event) => event.category === 'goal');
    expect(goalEvents.map((event) => event.name)).toEqual([
      'goal.validation_failed',
      'goal.validated',
    ]);
    expect(goalEvents[0]?.level).toBe('warn');
    // Not exhausted: attempt 1 failed but attempt 2 was still available, so
    // this is an `update`, not the run-ending `error` phase.
    expect(goalEvents[0]?.phase).toBe('update');
    expect(goalEvents[0]?.attributes['attempt']).toBe(1);
    expect(goalEvents[0]?.attributes['feedback']).toContain('must include text');
    expect(goalEvents[1]?.attributes['attempt']).toBe(2);
  });

  it('marks the final rejection exhausted when the GoalLoop runs out of attempts', async () => {
    const deps = buildDeps();
    const provider = new ScriptedModelProvider({
      beats: { turn: [{ text: '' }, { text: '' }] },
    });
    provider.setBeat('turn');
    const patchedModelFor: CarPurchaseGraphDeps['modelFor'] = (nodeId) =>
      nodeId === 'decision-synthesizer' ? provider : deps.modelFor(nodeId);

    const { events, result } = await drain(
      executeCarPurchaseGraph({ ...deps, modelFor: patchedModelFor }),
    );

    expect(result.goalLoopResult?.passed).toBe(false);
    const goalEvents = events.filter((event) => event.category === 'goal');
    expect(goalEvents.map((event) => event.name)).toEqual([
      'goal.validation_failed',
      'goal.validation_failed',
    ]);
    expect(goalEvents[0]?.attributes['exhausted']).toBe(false);
    expect(goalEvents[0]?.phase).toBe('update');
    expect(goalEvents[1]?.attributes['exhausted']).toBe(true);
    expect(goalEvents[1]?.phase).toBe('error');
  });

  it('records the token usage the model provider actually reported, per call and never accumulated', async () => {
    const deps = buildDeps();
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
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
            usage: { inputTokens: 900, outputTokens: 120, totalTokens: 1020 },
          },
          {
            text: 'Recommend candidate-rav4 per source-listing-candidate-rav4.',
            usage: { inputTokens: 1100, outputTokens: 60, totalTokens: 1160 },
          },
        ],
      },
    });
    provider.setBeat('turn');
    const patchedModelFor: CarPurchaseGraphDeps['modelFor'] = (nodeId) =>
      nodeId === 'decision-synthesizer' ? provider : deps.modelFor(nodeId);

    const { events } = await drain(executeCarPurchaseGraph({ ...deps, modelFor: patchedModelFor }));

    const synthesizerModelCalls = events.filter(
      (event) =>
        event.category === 'model' &&
        event.phase === 'finish' &&
        event.agentId === 'decision-synthesizer',
    );
    // The second call reports 1100/60/1160 -- its own usage -- not the
    // 2000/180/2180 the agent's cumulative Strands `Meter` holds by then.
    expect(synthesizerModelCalls.map((event) => event.tokenUsage)).toEqual([
      { input: 900, output: 120, total: 1020 },
      { input: 1100, output: 60, total: 1160 },
    ]);
  });

  it('omits tokenUsage on every model call whose provider reported no usage, rather than recording zeros', async () => {
    const { events } = await drain(executeCarPurchaseGraph(buildDeps()));

    // No provider in the default fixture declares usage, so every one of
    // them emits an all-zero ModelMetadataEvent -- the same thing a live
    // provider that reports no usage does. Absent, never `0`.
    const modelCalls = events.filter(
      (event) => event.category === 'model' && event.phase === 'finish',
    );
    expect(modelCalls.length).toBeGreaterThan(0);
    for (const event of modelCalls) {
      expect(event).not.toHaveProperty('tokenUsage');
    }
    expect(events.some((event) => event.tokenUsage !== undefined)).toBe(false);
  });

  it('measures every model and tool call duration from a real interval rather than a constant', async () => {
    // A 1000 ms-per-read stepping source: any recorded duration is a whole
    // number of steps, which sub-second wall-clock could not produce, and
    // is > 0, which a hard-coded constant or an unmeasured default could
    // not produce either.
    let ticks = 0;
    const nowMs = (): number => (ticks += 1000);

    const { events } = await drain(executeCarPurchaseGraph(buildDeps({ nowMs })));

    const timed = events.filter(
      (event) =>
        (event.category === 'model' || event.category === 'tool') &&
        (event.phase === 'finish' || event.phase === 'error'),
    );
    expect(timed.length).toBeGreaterThan(0);
    for (const event of timed) {
      expect(event.durationMs).toBeDefined();
      expect(event.durationMs).toBeGreaterThan(0);
      expect((event.durationMs ?? 0) % 1000).toBe(0);
    }

    // Start events close nothing, so they carry no duration.
    for (const event of events.filter((event) => event.phase === 'start')) {
      expect(event).not.toHaveProperty('durationMs');
    }
  });

  it('reports how long every Graph node really took, measured across its own execution', async () => {
    // Same 1000 ms-per-read stepping source as the model/tool duration test
    // above: a recorded node duration that is a positive whole number of
    // steps could not come from a hard-coded constant, an unmeasured
    // default, or sub-millisecond wall clock.
    let ticks = 0;
    const nowMs = (): number => (ticks += 1000);

    const { events } = await drain(executeCarPurchaseGraph(buildDeps({ nowMs })));

    const nodeFinishes = events.filter(
      (event) => event.category === 'graph' && event.phase === 'finish',
    );
    // Every one of the six real nodes reports one, not just the ones a
    // consumer happens to look at first.
    expect(nodeFinishes.map((event) => event.attributes['nodeId']).sort()).toEqual(
      [...CAR_PURCHASE_GRAPH_NODE_IDS].sort(),
    );
    for (const event of nodeFinishes) {
      expect(event.durationMs).toBeDefined();
      expect(event.durationMs).toBeGreaterThan(0);
      expect((event.durationMs ?? 0) % 1000).toBe(0);
    }

    // A node's start closes nothing, so it carries no duration: a surface
    // rendering an elapsed column has nothing to freeze yet. The key is
    // absent, not present-and-zero -- the same omit path a finish with no
    // observed start takes (`createNodeDurationTracker` returns `undefined`
    // there, never `0`).
    for (const event of events.filter(
      (event) => event.category === 'graph' && event.phase === 'start',
    )) {
      expect(event).not.toHaveProperty('durationMs');
    }
    expect(events.some((event) => event.category === 'graph' && event.durationMs === 0)).toBe(
      false,
    );
  });

  it('gives each of the four genuinely concurrent specialists its own duration, not one shared interval', async () => {
    let ticks = 0;
    const nowMs = (): number => (ticks += 1000);

    const { events } = await drain(executeCarPurchaseGraph(buildDeps({ nowMs })));

    const graphEvents = events.filter((event) => event.category === 'graph');
    const parallelPhases = graphEvents
      .filter((event) =>
        (CAR_PURCHASE_PARALLEL_SPECIALIST_IDS as readonly string[]).includes(
          String(event.attributes['nodeId']),
        ),
      )
      .map((event) => event.phase);
    // The hazard this test exists for is only real because the four
    // specialists are genuinely in flight together: all four starts land
    // before any of them finishes, so a single run-wide "last node start"
    // reading would anchor every one of the four finishes to whichever
    // specialist happened to start last.
    expect(parallelPhases).toEqual([
      'start',
      'start',
      'start',
      'start',
      'finish',
      'finish',
      'finish',
      'finish',
    ]);

    const durations = new Map<string, number | undefined>(
      graphEvents
        .filter((event) => event.phase === 'finish')
        .map((event) => [String(event.attributes['nodeId']), event.durationMs]),
    );
    for (const specialistId of CAR_PURCHASE_PARALLEL_SPECIALIST_IDS) {
      expect(durations.get(specialistId)).toBeGreaterThan(0);
    }
    // Four separate intervals, not four readings of one.
    const parallelDurations = CAR_PURCHASE_PARALLEL_SPECIALIST_IDS.map((id) => durations.get(id));
    expect(new Set(parallelDurations).size).toBe(parallelDurations.length);

    // `createNodeDurationTracker`'s own tests below hold the exact keying
    // proof: from outside the Graph the individual start readings are not
    // observable, so misattribution can only be pinned down against the
    // tracker directly, exactly as `event-normalizer.test.ts` pins down the
    // same hazard for the SDK's concurrent tool executor.
  });

  it('never stamps an estimatedCostUsd: no sourced price table exists to compute one from', async () => {
    const { events } = await drain(executeCarPurchaseGraph(buildDeps()));
    expect(events.some((event) => event.estimatedCostUsd !== undefined)).toBe(false);
  });

  it('records intervention.proceed at debug so the info stream is not drowned by handlers deciding to do nothing', async () => {
    const { events } = await drain(executeCarPurchaseGraph(buildDeps()));

    const interventions = events.filter((event) => event.category === 'intervention');
    const proceeds = interventions.filter((event) => event.name === 'intervention.proceed');

    // They genuinely dominate: this run records far more "a guard looked
    // and had no objection" than every other outcome combined.
    expect(proceeds.length).toBeGreaterThan(interventions.length - proceeds.length);

    // Recorded, not deleted -- each keeps the handler/stage/subject a
    // reader needs to audit that the guard ran.
    for (const event of proceeds) {
      expect(event.level).toBe('debug');
      expect(event.attributes['handler']).toBeTypeOf('string');
      expect(event.attributes['stage']).toBeTypeOf('string');
    }

    // The level a `?level=` filter (routes/debug.ts) acts on: nothing above
    // debug is a proceed, so filtering them out leaves only the decisions
    // that changed the run's course.
    const aboveDebug = events.filter((event) => event.level !== 'debug');
    expect(aboveDebug.some((event) => event.name === 'intervention.proceed')).toBe(false);
    expect(aboveDebug.length).toBeLessThan(events.length);
  });
});

/**
 * Streaming integrity: the generator must hand each `RuntimeEvent` to its
 * consumer AS THE GRAPH PRODUCES IT, not accumulate the whole six-node run
 * and drain it after `graph.invoke` resolves.
 *
 * These are deliberately not "the final event list looks right" assertions:
 * a buffered implementation produces an identical final list, so such a test
 * would prove nothing. Each test below instead holds a node open on a
 * caller-controlled gate (no timers, no sleeps) and asserts on what a
 * consumer has *already* received while later nodes are demonstrably still
 * pending.
 */
describe('createNodeDurationTracker', () => {
  it('gives each concurrently running node the interval between its own start and its own finish', () => {
    // The real Graph holds all four parallel specialists open at once, so
    // three of the four starts are still outstanding when the first one
    // finishes. A single "last node start" reading would hand every one of
    // them the same anchor; keying by node id is what keeps their intervals
    // from being swapped.
    let clock = 0;
    const tracker = createNodeDurationTracker(() => clock);

    clock = 100;
    tracker.noteNodeStart('deal-analyst');
    clock = 130;
    tracker.noteNodeStart('ownership-cost-analyst');
    clock = 160;
    tracker.noteNodeStart('safety-reliability-analyst');
    clock = 200;
    tracker.noteNodeStart('household-fit-analyst');

    // Finishing out of start order, as the real Graph genuinely does.
    clock = 260;
    expect(tracker.measureNode('safety-reliability-analyst')).toBe(100);
    clock = 300;
    expect(tracker.measureNode('deal-analyst')).toBe(200);
    clock = 340;
    expect(tracker.measureNode('household-fit-analyst')).toBe(140);
    clock = 500;
    expect(tracker.measureNode('ownership-cost-analyst')).toBe(370);
  });

  it('reports no duration at all -- not a zero -- for a node whose start was never observed', () => {
    const tracker = createNodeDurationTracker(() => 500);
    expect(tracker.measureNode('deal-analyst')).toBeUndefined();
  });

  it('measures a re-run node from its latest start, never a stale earlier one', () => {
    let clock = 0;
    const tracker = createNodeDurationTracker(() => clock);

    clock = 10;
    tracker.noteNodeStart('source-challenger');
    clock = 50;
    expect(tracker.measureNode('source-challenger')).toBe(40);

    clock = 400;
    tracker.noteNodeStart('source-challenger');
    clock = 430;
    expect(tracker.measureNode('source-challenger')).toBe(30);
  });
});

describe('executeCarPurchaseGraph streams events as the Graph progresses', () => {
  it('delivers the finished parallel specialists’ events while source-challenger is still running', async () => {
    const deps = buildDeps();
    const gated = new GatedModelProvider({
      beats: {
        turn: [{ toolCalls: [{ name: 'strands_structured_output', input: CHALLENGE_RESULT }] }],
      },
    });
    gated.setBeat('turn');
    const patchedModelFor: CarPurchaseGraphDeps['modelFor'] = (nodeId) =>
      nodeId === 'source-challenger' ? gated : deps.modelFor(nodeId);

    const consumer = consumeInBackground(
      executeCarPurchaseGraph({ ...deps, modelFor: patchedModelFor }),
    );

    // Let the Graph run as far as it possibly can. AND-semantics means all
    // four parallel specialists must complete before source-challenger is
    // eligible, and source-challenger then parks inside its gated model
    // call -- so once the gate is reached, and while it stays shut, the run
    // is provably mid-flight and cannot have finished.
    await waitUntil(() => gated.streamEntered, "source-challenger's gated model call");
    await settleEventLoop();
    expect(consumer.done()).toBe(false);

    // ...and the consumer already holds the earlier nodes' events.
    const early = [...consumer.received];
    expect(early.length).toBeGreaterThan(0);
    for (const specialistId of CAR_PURCHASE_PARALLEL_SPECIALIST_IDS) {
      expect(
        early.some(
          (event) =>
            event.category === 'graph' &&
            event.phase === 'finish' &&
            event.attributes['nodeId'] === specialistId,
        ),
        `expected node "${specialistId}"'s completion to have already been streamed`,
      ).toBe(true);
    }
    // Nothing downstream of the parked node has been invented ahead of time.
    expect(early.some((event) => event.agentId === 'decision-synthesizer')).toBe(false);

    gated.open();
    const result = await consumer.completed;
    expect(result.multiAgentResult.status).toBe('COMPLETED');
    // The early events are a genuine prefix of the whole stream, unchanged.
    expect(consumer.received.slice(0, early.length)).toEqual(early);
    expect(consumer.received.length).toBeGreaterThan(early.length);
  });

  it('yields in one gapless, strictly ascending sequence -- the ordering downstream duplicate suppression relies on', async () => {
    const { events } = await drain(executeCarPurchaseGraph(buildDeps()));

    // Every sequence the run allocated is delivered exactly once, in order,
    // with no gaps: `RunAccumulator.sequence` is monotonic from 0 and every
    // allocation is pushed in the same synchronous statement, so a dropped
    // or reordered event would show up here as a hole or an inversion.
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index));

    // Real Graph topology order survives streaming: every parallel
    // specialist's completion is streamed before source-challenger's, which
    // is streamed before decision-synthesizer's.
    const graphFinish = (nodeId: string): number =>
      events.findIndex(
        (event) =>
          event.category === 'graph' &&
          event.phase === 'finish' &&
          event.attributes['nodeId'] === nodeId,
      );
    for (const specialistId of CAR_PURCHASE_PARALLEL_SPECIALIST_IDS) {
      expect(graphFinish(specialistId)).toBeGreaterThanOrEqual(0);
      expect(graphFinish(specialistId)).toBeLessThan(graphFinish('source-challenger'));
    }
    expect(graphFinish('source-challenger')).toBeLessThan(graphFinish('decision-synthesizer'));
  });

  it('still delivers the events produced after the Graph resolves (the GoalLoop’s recorded attempts), last', async () => {
    const { events, result } = await drain(executeCarPurchaseGraph(buildDeps()));

    // `goalLoop.lastResult` is only readable once the run has finished, so
    // these are pushed after `graph.invoke` resolves -- the exact events a
    // "stop yielding when the run settles" implementation would drop.
    const goalIndexes = events.flatMap((event, index) =>
      event.category === 'goal' ? [index] : [],
    );
    expect(goalIndexes).toHaveLength(result.goalLoopResult?.attempts.length ?? 0);
    expect(goalIndexes).toEqual([events.length - 1]);
  });

  it('surfaces a mid-run Graph failure only after everything produced before it has been delivered', async () => {
    // A real orchestration bound tripped mid-run: `maxSteps: 5` lets the
    // four parallel specialists and source-challenger genuinely execute,
    // then the real Graph throws while scheduling the sixth node. (A failing
    // *node* is not usable here: the installed SDK deliberately turns one
    // into a FAILED NodeResult so parallel paths can continue -- see
    // `multiagent/graph.js`'s own header -- and never rejects `invoke`.)
    const deps = buildDeps();
    const boundedPack = {
      ...deps.pack,
      orchestration: { ...deps.pack.orchestration, maxSteps: 5 },
    };

    const consumer = consumeInBackground(executeCarPurchaseGraph({ ...deps, pack: boundedPack }));
    // Attach the rejection handler immediately so the failure is never an
    // unhandled rejection while the assertions below run.
    const outcome = consumer.completed.then(
      () => undefined,
      (error: unknown) => error,
    );

    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('max steps reached');

    // The four parallel specialists genuinely ran and were genuinely
    // delivered before the failure: an error does not swallow the stream.
    for (const specialistId of CAR_PURCHASE_PARALLEL_SPECIALIST_IDS) {
      expect(
        consumer.received.some((event) => event.agentId === specialistId),
        `expected node "${specialistId}"'s events to survive the mid-run failure`,
      ).toBe(true);
    }
    expect(consumer.received.map((event) => event.sequence)).toEqual(
      consumer.received.map((_, index) => index),
    );
  });
});
