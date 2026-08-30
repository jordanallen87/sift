import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Clock, IdGenerator } from '@sift/core';
import type { ExecutionRequest, ExecutionResult } from '@sift/contracts';
import { ScriptedModelProvider } from './model-provider.js';
import { buildLocalSessionManager } from './session-adapter.js';
import {
  PROPOSE_RECOMMENDATION_TOOL_ID,
  SDK_INTERNAL_TOOL_NAMES,
  buildCarPurchaseFixtureTools,
  execute,
} from './strands-adapter.js';
import type { RuntimeEvent } from './event-normalizer.js';

const SKILLS_ROOT_DIR = fileURLToPath(new URL('../../skills', import.meta.url));
const FIXED_CLOCK: Clock = { now: () => '2026-01-01T00:00:00.000Z' };

function fixedIdGenerator(): IdGenerator {
  let counter = 0;
  return { next: (prefix) => `${prefix ?? 'id'}-${++counter}` };
}

let dir: string | undefined;
afterEach(() => {
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  }
});
function tempDataDir(): string {
  dir = mkdtempSync(join(tmpdir(), 'sift-strands-adapter-test-'));
  return dir;
}

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
      ],
      optionSummaries: [],
      evidenceCounts: { satisfied: 0, active: 1, blocked: 0, acceptedUncertainty: 0, open: 4 },
    },
    caseExtensions: [],
    availableSkills: ['deal-analysis', 'listing-normalizer'],
    availableSpecialists: ['deal-analyst'],
    allowedTools: ['listing-reader', PROPOSE_RECOMMENDATION_TOOL_ID],
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

const VALID_EXECUTION_RESULT: ExecutionResult = {
  obligationId: 'car.deal_normalization',
  disposition: 'evidence_found',
  claims: [
    {
      statement: 'The RAV4 out-the-door price is within the household budget.',
      stance: 'supports',
      confidence: 0.8,
      sourceIds: ['source-listing-candidate-rav4'],
    },
  ],
  evidenceResults: [
    {
      sourceId: 'source-listing-candidate-rav4',
      level: 'E1',
      verdict: 'pass',
      summary: 'Listing confirms advertised price and mileage.',
    },
  ],
  limitations: [],
  suggestedStatus: 'open',
};

function isRuntimeEvent(item: RuntimeEvent | ExecutionResult): item is RuntimeEvent {
  return 'sequence' in item;
}

async function drain(
  iterable: AsyncIterable<RuntimeEvent | ExecutionResult>,
): Promise<{ events: RuntimeEvent[]; result: ExecutionResult | undefined }> {
  const events: RuntimeEvent[] = [];
  let result: ExecutionResult | undefined;
  for await (const item of iterable) {
    if (isRuntimeEvent(item)) {
      events.push(item);
    } else {
      result = item;
    }
  }
  return { events, result };
}

interface InvokableToolLike {
  invoke(input: unknown, context?: unknown): Promise<unknown>;
}

function requireInvokable(entry: unknown): InvokableToolLike {
  if (
    typeof entry !== 'object' ||
    entry === null ||
    !('invoke' in entry) ||
    typeof (entry as { invoke?: unknown }).invoke !== 'function'
  ) {
    throw new Error('expected an invokable tool');
  }
  return entry as InvokableToolLike;
}

describe('buildCarPurchaseFixtureTools', () => {
  it('wraps every real car-purchase fixture tool plus the gated propose_recommendation tool', () => {
    const tools = buildCarPurchaseFixtureTools();
    const names = tools.map((entry) => ('name' in entry ? entry.name : undefined));
    expect(names).toEqual(
      expect.arrayContaining([
        'listing-reader',
        'ownership-calculator',
        'safety-reliability-lookup',
        'household-fit-matrix',
        PROPOSE_RECOMMENDATION_TOOL_ID,
      ]),
    );
  });

  it("invokes each fixture tool directly (the SDK's own public InvokableTool.invoke()) with no execution context, proving the optional `context?.cancelSignal` plumbing in every tool builder tolerates a missing context rather than throwing -- a real Strands Agent run always supplies a full ToolContext (cancelSignal included), so only a direct call like this ever exercises the omitted-context path", async () => {
    const tools = buildCarPurchaseFixtureTools();
    const byName = new Map(tools.map((entry) => ['name' in entry ? entry.name : undefined, entry]));

    const listingResult = await requireInvokable(byName.get('listing-reader')).invoke({
      candidateId: 'candidate-rav4',
    });
    expect(listingResult).toBeDefined();

    const ownershipResult = await requireInvokable(byName.get('ownership-calculator')).invoke({
      candidateId: 'candidate-rav4',
    });
    expect(ownershipResult).toBeDefined();

    const safetyResult = await requireInvokable(byName.get('safety-reliability-lookup')).invoke({
      candidateId: 'candidate-rav4',
    });
    expect(safetyResult).toBeDefined();

    const householdFitResult = await requireInvokable(byName.get('household-fit-matrix')).invoke({
      candidateId: 'candidate-rav4',
    });
    expect(householdFitResult).toBeDefined();
  });
});

// Deliberately not covered here, with reasons (verified empirically against
// the real installed @strands-agents/sdk@1.14.0, not guessed):
//
// - `describeError`'s `typeof error === 'string'` branch and its
//   `JSON.stringify` fallback: `agent.invoke()`, `restoreCaseSnapshot`, and
//   `saveCaseSnapshot` only ever reject/throw genuine `Error` instances
//   (confirmed: forcing a real ScriptedModelProvider beat-exhaustion throw,
//   below, always produces an `Error`, which the SDK propagates as-is) --
//   `describeError` is private/unexported, so there is no other way to feed
//   it a non-`Error` `unknown` value.
// - `extractSkillName`'s null/non-object/array guards, its `typeof value ===
//   'string'` false branch, and the `skillId !== undefined` false branch in
//   `execute()`'s own `AfterToolCallEvent` hook: the real `AgentSkills`
//   vended plugin's `skills` tool has its own Zod input schema requiring
//   `skill_name: z.string().min(1)` (verified in the installed SDK's
//   `dist/src/vended-plugins/skills/agent-skills.js`), so any tool call this
//   hook ever sees with `event.result.status === 'success'` already has a
//   well-formed string `skill_name` -- `extractSkillName` can only return
//   `undefined` via a shape the SDK's own tool dispatch would already have
//   rejected before `status: 'success'` was possible.
// - The `!parsed.success` (invalid/missing structuredOutput) branch of the
//   final `ExecutionResultSchema.safeParse(result?.structuredOutput)`:
//   `Agent` is configured with `structuredOutputSchema: ExecutionResultSchema`
//   (the identical schema object re-parsed here), and empirically the real
//   Agent loop never resolves `agent.invoke()` with an invalid/absent
//   structuredOutput -- it keeps re-prompting the model until either a valid
//   one is produced or the model provider itself runs out of scripted turns
//   and throws (the already-covered `invokeError` path below). Verified by
//   scripting 1, 2, and 10 text-only turns in a row: every case ends in the
//   provider's own "beat exhausted" throw, never a graceful invalid-result
//   return.
describe('execute()', () => {
  it('runs a real Agent through every plugin and intervention, ending in a validated ExecutionResult', async () => {
    const request = buildExecutionRequest();
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          { toolCalls: [{ name: 'listing-reader', input: { candidateId: 'candidate-rav4' } }] },
          { toolCalls: [{ name: 'skills', input: { skill_name: 'deal-analysis' } }] },
          {
            toolCalls: [
              {
                name: PROPOSE_RECOMMENDATION_TOOL_ID,
                input: { candidateIds: ['candidate-rav4'], rationale: 'fits stated budget' },
              },
            ],
          },
          { toolCalls: [{ name: 'strands_structured_output', input: VALID_EXECUTION_RESULT }] },
        ],
      },
    });
    provider.setBeat('turn');

    const { events, result } = await drain(
      execute(
        {
          model: provider,
          skillsRootDir: SKILLS_ROOT_DIR,
          clock: FIXED_CLOCK,
          idGenerator: fixedIdGenerator(),
          consequentialToolIds: [PROPOSE_RECOMMENDATION_TOOL_ID],
          resolveConfirmation: () => true,
        },
        request,
      ),
    );

    expect(result).toEqual(VALID_EXECUTION_RESULT);
    expect(events.every((event) => event.runId === 'run-1' && event.caseId === 'case-1')).toBe(
      true,
    );

    // Every category the required behavior list names genuinely appears.
    const categories = new Set(events.map((event) => event.category));
    expect(categories).toContain('tool');
    expect(categories).toContain('model');
    expect(categories).toContain('skill');
    expect(categories).toContain('context');
    expect(categories).toContain('intervention');

    const interventionKeys = events
      .filter((event) => event.category === 'intervention')
      .map((event) => `${String(event.attributes['handler'])}:${event.name}`);
    expect(interventionKeys).toContain('ScopeAuthorization:intervention.proceed');
    expect(interventionKeys).toContain('ConsequenceGuard:intervention.confirm');
    expect(interventionKeys).toContain('BudgetGuard:intervention.proceed');
    expect(interventionKeys).toContain('RetrySteering:intervention.proceed');

    expect(events.some((event) => event.name === 'skill.activated')).toBe(true);
    expect(events.some((event) => event.name === 'context.injected')).toBe(true);
    expect(
      events.some((event) => event.name === 'tool.listing-reader' && event.phase === 'finish'),
    ).toBe(true);
  });

  it('runs ownership-calculator, safety-reliability-lookup, and household-fit-matrix too, proving each genuinely executes with a real SDK-supplied ToolContext (cancelSignal included) rather than only listing-reader', async () => {
    const request = buildExecutionRequest({
      allowedTools: [
        'listing-reader',
        'ownership-calculator',
        'safety-reliability-lookup',
        'household-fit-matrix',
      ],
    });
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          {
            toolCalls: [{ name: 'ownership-calculator', input: { candidateId: 'candidate-rav4' } }],
          },
          {
            toolCalls: [
              { name: 'safety-reliability-lookup', input: { candidateId: 'candidate-rav4' } },
            ],
          },
          {
            toolCalls: [{ name: 'household-fit-matrix', input: { candidateId: 'candidate-rav4' } }],
          },
          { toolCalls: [{ name: 'strands_structured_output', input: VALID_EXECUTION_RESULT }] },
        ],
      },
    });
    provider.setBeat('turn');

    const { events, result } = await drain(
      execute(
        {
          model: provider,
          skillsRootDir: SKILLS_ROOT_DIR,
          clock: FIXED_CLOCK,
          idGenerator: fixedIdGenerator(),
        },
        request,
      ),
    );

    expect(result).toEqual(VALID_EXECUTION_RESULT);
    expect(
      events.some(
        (event) => event.name === 'tool.ownership-calculator' && event.phase === 'finish',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) => event.name === 'tool.safety-reliability-lookup' && event.phase === 'finish',
      ),
    ).toBe(true);
    expect(
      events.some(
        (event) => event.name === 'tool.household-fit-matrix' && event.phase === 'finish',
      ),
    ).toBe(true);
  });

  it('denies a tool call outside the declared allowlist before it ever executes', async () => {
    const request = buildExecutionRequest({ allowedTools: [] });
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          { toolCalls: [{ name: 'listing-reader', input: { candidateId: 'candidate-rav4' } }] },
        ],
      },
    });
    provider.setBeat('turn');

    const { events } = await drain(
      execute(
        {
          model: provider,
          skillsRootDir: SKILLS_ROOT_DIR,
          clock: FIXED_CLOCK,
          idGenerator: fixedIdGenerator(),
        },
        request,
      ),
    );

    const denyEvent = events.find(
      (event) => event.category === 'intervention' && event.name === 'intervention.deny',
    );
    expect(denyEvent).toBeDefined();
    expect(denyEvent?.attributes['handler']).toBe('ScopeAuthorization');
    // The denied tool never actually completed.
    expect(
      events.some((event) => event.name === 'tool.listing-reader' && event.phase === 'finish'),
    ).toBe(false);
  });

  it('denies a forbiddenToolIds tool via ConsequenceGuard even though it is within the declared allowlist', async () => {
    const request = buildExecutionRequest({
      allowedTools: ['listing-reader', 'ownership-calculator'],
    });
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          {
            toolCalls: [{ name: 'ownership-calculator', input: { candidateId: 'candidate-rav4' } }],
          },
          { toolCalls: [{ name: 'strands_structured_output', input: VALID_EXECUTION_RESULT }] },
        ],
      },
    });
    provider.setBeat('turn');

    const { events, result } = await drain(
      execute(
        {
          model: provider,
          skillsRootDir: SKILLS_ROOT_DIR,
          clock: FIXED_CLOCK,
          idGenerator: fixedIdGenerator(),
          forbiddenToolIds: ['ownership-calculator'],
        },
        request,
      ),
    );

    expect(result).toEqual(VALID_EXECUTION_RESULT);
    const denyEvent = events.find(
      (event) =>
        event.category === 'intervention' &&
        event.name === 'intervention.deny' &&
        event.attributes['handler'] === 'ConsequenceGuard',
    );
    expect(denyEvent).toBeDefined();
    expect(denyEvent?.summary).toContain('forbids');
    // The forbidden tool never actually completed.
    expect(
      events.some(
        (event) => event.name === 'tool.ownership-calculator' && event.phase === 'finish',
      ),
    ).toBe(false);
  });

  it('passes a custom alternativeTechniqueHint through to RetrySteering, which is exercised when the model repeats a prior query family', async () => {
    const request = buildExecutionRequest();
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          { toolCalls: [{ name: 'listing-reader', input: { candidateId: 'candidate-rav4' } }] },
          // Same tool + same normalized args as the prior call: RetrySteering's
          // matchesPriorQueryFamily rule guides (not denies) this second call.
          { toolCalls: [{ name: 'listing-reader', input: { candidateId: 'candidate-rav4' } }] },
          { toolCalls: [{ name: 'strands_structured_output', input: VALID_EXECUTION_RESULT }] },
        ],
      },
    });
    provider.setBeat('turn');

    const { events, result } = await drain(
      execute(
        {
          model: provider,
          skillsRootDir: SKILLS_ROOT_DIR,
          clock: FIXED_CLOCK,
          idGenerator: fixedIdGenerator(),
          alternativeTechniqueHint: 'Try manufacturer-published spec sheets instead.',
        },
        request,
      ),
    );

    expect(result).toEqual(VALID_EXECUTION_RESULT);
    const guideEvent = events.find(
      (event) =>
        event.category === 'intervention' &&
        event.name === 'intervention.guide' &&
        event.attributes['handler'] === 'RetrySteering',
    );
    expect(guideEvent).toBeDefined();
    expect(guideEvent?.summary).toContain('repeats a prior query family');
  });

  it('yields a run.failed error event and no ExecutionResult when structured output is never produced', async () => {
    const request = buildExecutionRequest();
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [{ text: 'I cannot decide yet.' }, { text: 'Still undecided.' }],
      },
    });
    provider.setBeat('turn');

    const { events, result } = await drain(
      execute(
        {
          model: provider,
          skillsRootDir: SKILLS_ROOT_DIR,
          clock: FIXED_CLOCK,
          idGenerator: fixedIdGenerator(),
        },
        request,
      ),
    );

    expect(result).toBeUndefined();
    const errorEvent = events.find((event) => event.category === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.name).toBe('run.failed');
  });

  it('saves and restores a real session snapshot when a sessionManager is supplied', async () => {
    const dataDir = tempDataDir();
    const sessionManager = buildLocalSessionManager(dataDir, 'case-1');
    const request = buildExecutionRequest();
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          { toolCalls: [{ name: 'strands_structured_output', input: VALID_EXECUTION_RESULT }] },
        ],
      },
    });
    provider.setBeat('turn');

    const { events, result } = await drain(
      execute(
        {
          model: provider,
          skillsRootDir: SKILLS_ROOT_DIR,
          clock: FIXED_CLOCK,
          idGenerator: fixedIdGenerator(),
          sessionManager,
          sessionId: 'case-1',
        },
        request,
      ),
    );

    expect(result).toEqual(VALID_EXECUTION_RESULT);
    expect(events.some((event) => event.name === 'session.snapshot_restored')).toBe(true);
    expect(events.some((event) => event.name === 'session.snapshot_saved')).toBe(true);
  });

  it('accepts and forwards an external AbortSignal to the underlying invocation', async () => {
    const request = buildExecutionRequest();
    const provider = new ScriptedModelProvider({
      beats: {
        turn: [
          { toolCalls: [{ name: 'strands_structured_output', input: VALID_EXECUTION_RESULT }] },
        ],
      },
    });
    provider.setBeat('turn');
    const controller = new AbortController();

    const { result } = await drain(
      execute(
        {
          model: provider,
          skillsRootDir: SKILLS_ROOT_DIR,
          clock: FIXED_CLOCK,
          idGenerator: fixedIdGenerator(),
        },
        request,
        controller.signal,
      ),
    );

    expect(result).toEqual(VALID_EXECUTION_RESULT);
  });
});

describe('SDK_INTERNAL_TOOL_NAMES', () => {
  it('names exactly the SDK/plugin-registered tools ScopeAuthorization and BudgetGuard must exempt', () => {
    expect(SDK_INTERNAL_TOOL_NAMES).toEqual(['strands_structured_output', 'skills']);
  });
});
