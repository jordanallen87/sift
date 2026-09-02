/**
 * The adaptive-discovery WebMCP surface.
 *
 * Three tools, and one absence that matters as much as any of them.
 *
 * `sift_get_interaction_context` is how a model finds out what Sift already
 * knows, what it still needs, and what it is allowed to do about it — the
 * bounded alternative to dumping every pack detail into the conversation.
 * `sift_request_interaction` is the entire surface a model has for asking
 * Sift to render something: a fixed grammar with a closed option list, no
 * markup, and no way to preselect an answer. `sift_record_discovery` is how
 * a model writes what it heard, and it can only ever `propose`.
 *
 * The absence: **there is no tool for Quick Pick, no tool for the
 * blind-spot review, and no tool for confirming a shortlist.** Those are the
 * person's. A test below walks the entire registered catalog and asserts
 * nothing resembling them exists, because "we did not add one" is a promise
 * that needs a test to stay true as the catalog grows.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CaseState, CompiledDecisionPack, PackDiscoveryDefinition } from '@sift/contracts';
import type { SiftCommands } from '../api/sift-client.js';
import { createFakeSiftCommands } from '../test/fake-sift-commands.js';
import { buildFixtureCaseState, buildFixtureCompiledPack } from '../test/fixtures.js';
import { InMemoryModelContextAdapter } from './adapter.js';
import { registerSiftTools } from './register-sift-tools.js';

interface AnyToolResult<TData = unknown> {
  ok: boolean;
  message: string;
  data?: TData;
  caseId?: string;
  sequence?: number;
  ui: { changed: boolean };
  error?: { code: string; retryable: boolean };
}

const AT = '2026-09-02T00:00:00.000Z';

const DISCOVERY: PackDiscoveryDefinition = {
  topics: [
    {
      id: 'vehicle.use_case',
      label: 'What this vehicle is for',
      question: 'What will this vehicle mainly be used for?',
      necessity: 'required',
      priority: 100,
      allowedInteractions: ['single_select'],
      optionSeeds: [
        { id: 'seed.family', label: 'Family', valueSummary: 'family' },
        { id: 'seed.business', label: 'Business', valueSummary: 'business' },
      ],
      escapeHatches: { allowCustom: true, allowNone: false, allowUnsure: false, allowDefer: false },
      mapsToAttributeIds: [],
      mapsToCriterionIds: [],
      confirmationRequired: true,
    },
    {
      id: 'vehicle.budget',
      label: 'Budget',
      question: 'What is your budget?',
      necessity: 'required',
      priority: 90,
      allowedInteractions: ['range', 'free_text'],
      optionSeeds: [],
      escapeHatches: { allowCustom: true, allowNone: false, allowUnsure: true, allowDefer: false },
      mapsToAttributeIds: [],
      mapsToCriterionIds: [],
      confirmationRequired: true,
    },
  ],
  blindSpots: [
    { id: 'blindspot.parking', label: 'Where it parks', detail: 'Garage or street size.' },
  ],
};

function packWithDiscovery(): CompiledDecisionPack {
  return buildFixtureCompiledPack({ discovery: DISCOVERY });
}

async function setUp(
  options: {
    caseState?: CaseState | null;
    commandsOverrides?: Partial<SiftCommands>;
    packs?: CompiledDecisionPack[];
  } = {},
): Promise<{ adapter: InMemoryModelContextAdapter; commands: SiftCommands }> {
  const adapter = new InMemoryModelContextAdapter();
  const commands = createFakeSiftCommands(options.commandsOverrides);
  const caseState = options.caseState === undefined ? buildFixtureCaseState() : options.caseState;
  const handle = await registerSiftTools({
    adapter,
    commands,
    getActiveCase: () => caseState,
    listPacks: () => options.packs ?? [packWithDiscovery()],
  });
  if (caseState !== null) await handle.setActiveCase(caseState.id);
  return { adapter, commands };
}

function invoke<TData = unknown>(
  adapter: InMemoryModelContextAdapter,
  name: string,
  input: unknown,
): Promise<AnyToolResult<TData>> {
  return adapter.invoke<unknown, AnyToolResult<TData>>(name, input);
}

interface InteractionContextData {
  mode: string;
  coverage: { requiredTotal: number; requiredResolved: number };
  nextTopic: { topicId: string; question: string; allowedInteractions: string[] } | null;
  nextMoves: { kind: string; humanOnly: boolean; toolName?: string }[];
  readyToDiscover: boolean;
  humanOnlyActions: string[];
}

describe('sift_get_interaction_context', () => {
  it('tells the model what is still unknown and what to ask next', async () => {
    const { adapter } = await setUp();

    const result = await invoke<InteractionContextData>(
      adapter,
      'sift_get_interaction_context',
      {},
    );

    expect(result.ok).toBe(true);
    expect(result.data?.coverage.requiredTotal).toBe(2);
    expect(result.data?.coverage.requiredResolved).toBe(0);
    expect(result.data?.nextTopic?.topicId).toBe('vehicle.use_case');
    expect(result.data?.nextTopic?.question).toBe('What will this vehicle mainly be used for?');
  });

  it('returns the interaction grammar the pack allows for that topic', async () => {
    // Without this the model has to guess a kind and get rejected, or Sift
    // has to dump the whole pack into the conversation. This is the bounded
    // middle: the grammar for the one question actually being asked.
    const { adapter } = await setUp();

    const result = await invoke<InteractionContextData>(
      adapter,
      'sift_get_interaction_context',
      {},
    );

    expect(result.data?.nextTopic?.allowedInteractions).toEqual(['single_select']);
  });

  it('names the human-only actions so a model knows what it must not attempt', async () => {
    const { adapter } = await setUp();

    const result = await invoke<InteractionContextData>(
      adapter,
      'sift_get_interaction_context',
      {},
    );

    expect(result.data?.humanOnlyActions).toContain('confirm_shortlist');
    expect(result.data?.humanOnlyActions).toContain('decide');
  });

  it('never offers a tool for a human-only move', async () => {
    const { adapter } = await setUp();

    const result = await invoke<InteractionContextData>(
      adapter,
      'sift_get_interaction_context',
      {},
    );

    for (const move of result.data?.nextMoves ?? []) {
      if (move.humanOnly) expect(move.toolName).toBeUndefined();
    }
  });

  it('reports honestly when no case is active', async () => {
    const { adapter } = await setUp({ caseState: null });

    const result = await invoke(adapter, 'sift_get_interaction_context', {});

    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
  });

  it('changes nothing', async () => {
    const { adapter, commands } = await setUp();

    const result = await invoke(adapter, 'sift_get_interaction_context', {});

    expect(result.ui.changed).toBe(false);
    expect(commands.updateDiscovery).not.toHaveBeenCalled();
  });
});

describe('sift_request_interaction', () => {
  const validInteraction = {
    id: 'interaction-1',
    topicIds: ['vehicle.use_case'],
    kind: 'single_select',
    prompt: 'What will this vehicle mainly be used for?',
    options: [
      {
        id: 'opt-family',
        label: 'Family',
        mapsTo: [{ topicId: 'vehicle.use_case', valueSummary: 'family' }],
      },
      {
        id: 'opt-business',
        label: 'Business',
        mapsTo: [{ topicId: 'vehicle.use_case', valueSummary: 'business' }],
      },
    ],
    escapeHatches: { allowCustom: true, allowNone: false, allowUnsure: false, allowDefer: false },
    requestedBy: 'model',
    createdAt: AT,
  };

  it('renders a bounded interaction through the command path', async () => {
    const { adapter, commands } = await setUp();

    const result = await invoke(adapter, 'sift_request_interaction', {
      caseId: 'case-1',
      expectedSequence: 0,
      interaction: validInteraction,
    });

    expect(result.ok, result.message).toBe(true);
    expect(commands.requestInteraction).toHaveBeenCalledTimes(1);
  });

  it('refuses markup in the prompt before it ever reaches the server', async () => {
    const { adapter, commands } = await setUp();

    const result = await invoke(adapter, 'sift_request_interaction', {
      caseId: 'case-1',
      expectedSequence: 0,
      interaction: { ...validInteraction, prompt: '<script>alert(1)</script>' },
    });

    expect(result.ok).toBe(false);
    expect(commands.requestInteraction).not.toHaveBeenCalled();
  });

  it('refuses an option that would write to an undeclared topic', async () => {
    const { adapter, commands } = await setUp();

    const result = await invoke(adapter, 'sift_request_interaction', {
      caseId: 'case-1',
      expectedSequence: 0,
      interaction: {
        ...validInteraction,
        options: [
          validInteraction.options[0],
          {
            id: 'opt-sneaky',
            label: 'Business',
            mapsTo: [{ topicId: 'vehicle.budget', valueSummary: 'Unlimited' }],
          },
        ],
      },
    });

    expect(result.ok).toBe(false);
    expect(commands.requestInteraction).not.toHaveBeenCalled();
  });

  it('has no way to preselect an answer', async () => {
    const { adapter, commands } = await setUp();

    const result = await invoke(adapter, 'sift_request_interaction', {
      caseId: 'case-1',
      expectedSequence: 0,
      interaction: { ...validInteraction, defaultSelectedOptionIds: ['opt-family'] },
    });

    expect(result.ok).toBe(false);
    expect(commands.requestInteraction).not.toHaveBeenCalled();
  });
});

describe('sift_record_discovery', () => {
  it('records what the model heard as a proposal', async () => {
    const { adapter, commands } = await setUp();

    const result = await invoke(adapter, 'sift_record_discovery', {
      caseId: 'case-1',
      expectedSequence: 0,
      operations: [
        {
          topicId: 'vehicle.use_case',
          valueSummary: 'Sounds like a family car',
          confidence: 0.7,
        },
      ],
    });

    expect(result.ok, result.message).toBe(true);
    expect(commands.updateDiscovery).toHaveBeenCalledTimes(1);
  });

  it('always sends actor "agent" and op "propose", whatever the model asks for', async () => {
    // The tool's own input schema has no field for an actor and no field for
    // an operation. A model cannot ask to confirm, because there is nowhere
    // to put the request.
    const { adapter, commands } = await setUp();

    await invoke(adapter, 'sift_record_discovery', {
      caseId: 'case-1',
      expectedSequence: 0,
      operations: [{ topicId: 'vehicle.budget', valueSummary: 'Around 40,000', confidence: 0.6 }],
    });

    const call = vi.mocked(commands.updateDiscovery).mock.calls[0]?.[0];
    expect(call?.actor).toBe('agent');
    expect(call?.operations[0]?.op).toBe('propose');
  });

  it('rejects an attempt to smuggle in a confirmation', async () => {
    const { adapter, commands } = await setUp();

    const result = await invoke(adapter, 'sift_record_discovery', {
      caseId: 'case-1',
      expectedSequence: 0,
      actor: 'human',
      operations: [
        { topicId: 'vehicle.budget', valueSummary: 'Ceiling 40,000', confidence: 1, op: 'confirm' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(commands.updateDiscovery).not.toHaveBeenCalled();
  });
});

describe('the tools that deliberately do not exist', () => {
  it('registers no tool for Quick Pick, the blind-spot review, or the shortlist', async () => {
    // Keep, Pass, Unsure, "none of these", and "yes, these are the ones I
    // want to go and drive" are the person's judgments. The product's whole
    // claim rests on a model being unable to make them, so the absence is
    // asserted rather than assumed.
    const { adapter } = await setUp();

    const names = adapter.registeredToolNames;

    for (const forbidden of [
      'sift_set_candidate_disposition',
      'sift_complete_blind_spot_review',
      'sift_confirm_shortlist',
      'sift_review_proposal',
      'sift_quick_pick',
      'sift_decide',
    ]) {
      expect(names, `${forbidden} must never be registered`).not.toContain(forbidden);
    }
  });

  it('registers no tool whose name suggests approving a decision', async () => {
    const { adapter } = await setUp();

    for (const name of adapter.registeredToolNames) {
      expect(name).not.toMatch(/approve|confirm_shortlist|_decide$/);
    }
  });
});
