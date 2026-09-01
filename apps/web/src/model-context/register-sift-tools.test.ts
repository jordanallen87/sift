/**
 * Behavioral tests for every registered Sift WebMCP tool's `execute` callback
 * (docs/specs/webmcp.md "Tool catalog", "Tool result envelope",
 * "Cancellation and concurrency"). Catalog-shape/contract assertions
 * (exact names/descriptions/JSON schemas, registration-lifecycle mechanics,
 * unsupported-browser fallback, the no-approval-tool proof) live in the
 * dedicated `webmcp-contract.test.ts` instead of being duplicated here.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SiftCommands } from '../api/sift-client.js';
import { SiftClientError } from '../api/sift-client.js';
import {
  buildFakeCommandReceipt,
  buildFakeRunReceipt,
  createFakeSiftCommands,
} from '../test/fake-sift-commands.js';
import {
  buildFixtureCaseState,
  buildFixtureCompiledPack,
  buildFixtureObligation,
} from '../test/fixtures.js';
import { InMemoryModelContextAdapter } from './adapter.js';
import {
  GLOBAL_SIFT_TOOL_NAMES,
  registerSiftTools,
  type SiftWebMcpToolName,
} from './register-sift-tools.js';

interface AnyToolResult<TData = unknown> {
  ok: boolean;
  message: string;
  data?: TData;
  commandId?: string;
  runId?: string;
  caseId?: string;
  sequence?: number;
  ui: { changed: boolean; focusTarget?: string };
  error?: { code: string; retryable: boolean };
}

/**
 * Thin, explicitly-generic wrapper around `adapter.invoke` used by every
 * test below. `InMemoryModelContextAdapter.invoke<TInput, TOutput>` defaults
 * `TOutput` to `unknown` when a call site supplies no type argument (there
 * is no parameter position for TypeScript to infer it from) -- calling
 * through this single, explicitly-typed helper instead of casting the
 * `unknown` result at each of the many call sites below keeps every
 * assertion genuinely type-checked against `AnyToolResult` (optionally
 * narrowed to a specific `data` shape via `TData`).
 */
async function invokeTool<TData = unknown>(
  adapter: InMemoryModelContextAdapter,
  name: string,
  input: unknown,
  context?: { signal?: AbortSignal },
): Promise<AnyToolResult<TData>> {
  return adapter.invoke<unknown, AnyToolResult<TData>>(name, input, context);
}

async function setUpWithActiveCase(
  caseId: string,
  overrides: Partial<SiftCommands> = {},
): Promise<{ adapter: InMemoryModelContextAdapter; commands: SiftCommands }> {
  const adapter = new InMemoryModelContextAdapter();
  const commands = createFakeSiftCommands(overrides);
  const handle = await registerSiftTools({
    adapter,
    commands,
    getActiveCase: () => null,
    listPacks: () => [],
  });
  await handle.setActiveCase(caseId);
  return { adapter, commands };
}

describe('registerSiftTools: registration lifecycle', () => {
  it('registers only the two global read tools when no case is ever activated', async () => {
    const adapter = new InMemoryModelContextAdapter();
    await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => null,
      listPacks: () => [],
    });

    expect([...adapter.registeredToolNames].sort()).toEqual([...GLOBAL_SIFT_TOOL_NAMES].sort());
  });

  it('registers the twenty case-scoped tools once an active case is set', async () => {
    const { adapter } = await setUpWithActiveCase('case-1');
    expect(adapter.registeredToolNames).toHaveLength(22);
    expect(adapter.registeredToolNames).toContain('sift_select_pack');
    expect(adapter.registeredToolNames).toContain('sift_request_revision');
    expect(adapter.registeredToolNames).toContain('sift_get_option_details');
    expect(adapter.registeredToolNames).toContain('sift_list_research');
    expect(adapter.registeredToolNames).toContain('sift_search_catalog');
    expect(adapter.registeredToolNames).toContain('sift_set_view');
    expect(adapter.registeredToolNames).toContain('sift_configure_comparison');
    expect(adapter.registeredToolNames).toContain('sift_get_decision_guide');
    expect(adapter.registeredToolNames).toContain('sift_focus_question');
    expect(adapter.registeredToolNames).toContain('sift_set_option_attribute');
    expect(adapter.registeredToolNames).toContain('sift_list_notes');
    expect(adapter.registeredToolNames).toContain('sift_add_note');
  });

  it('aborts the previous case-scoped generation when the active case changes', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const commands = createFakeSiftCommands();
    const handle = await registerSiftTools({
      adapter,
      commands,
      getActiveCase: () => null,
      listPacks: () => [],
    });

    await handle.setActiveCase('case-1');
    const generationOne = adapter.getRegisteredTool('sift_focus_evidence');

    await handle.setActiveCase('case-2');
    const generationTwo = adapter.getRegisteredTool('sift_focus_evidence');

    expect(generationOne).toBeDefined();
    expect(generationTwo).toBeDefined();
    expect(generationOne).not.toBe(generationTwo);

    // The currently-registered tool is scoped to case-2 now; a caseId that
    // was valid under the old (now-superseded) generation is rejected.
    const result = await invokeTool(adapter, 'sift_focus_evidence', {
      caseId: 'case-1',
      evidenceId: 'ev-1',
      expectedSequence: 1,
    });
    expect(result.error?.code).toBe('NOT_FOUND');
  });

  it('setActiveCase(null) unregisters the case-scoped tools, leaving only the two global tools', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const commands = createFakeSiftCommands();
    const handle = await registerSiftTools({
      adapter,
      commands,
      getActiveCase: () => null,
      listPacks: () => [],
    });

    await handle.setActiveCase('case-1');
    expect(adapter.registeredToolNames).toHaveLength(22);

    await handle.setActiveCase(null);
    expect([...adapter.registeredToolNames].sort()).toEqual([...GLOBAL_SIFT_TOOL_NAMES].sort());
  });

  it('disposeAll unregisters every tool, global read tools included', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const commands = createFakeSiftCommands();
    const handle = await registerSiftTools({
      adapter,
      commands,
      getActiveCase: () => null,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    handle.disposeAll();

    expect(adapter.registeredToolNames).toEqual([]);
  });

  it('degrades gracefully on an unsupported adapter: never throws, never registers a tool', async () => {
    const registerTool = vi.fn();
    const unsupportedAdapter = {
      supported: () => false,
      registerTool,
    };

    const handle = await registerSiftTools({
      adapter: unsupportedAdapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => null,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');
    handle.disposeCaseTools();
    handle.disposeAll();

    expect(registerTool).not.toHaveBeenCalled();
  });
});

interface CaseToolFixture {
  toolName: SiftWebMcpToolName;
  commandMethod: keyof SiftCommands;
  buildInput: (caseId: string) => Record<string, unknown>;
  expectedFocusTarget?: (input: Record<string, unknown>) => string | undefined;
}

const CASE_TOOL_FIXTURES: CaseToolFixture[] = [
  {
    toolName: 'sift_select_pack',
    commandMethod: 'selectPack',
    buildInput: (caseId) => ({ caseId, packId: 'car-purchase', expectedSequence: 1 }),
  },
  {
    toolName: 'sift_focus_evidence',
    commandMethod: 'focusEvidence',
    buildInput: (caseId) => ({ caseId, evidenceId: 'ev-1', expectedSequence: 1 }),
    expectedFocusTarget: (input) => input['evidenceId'] as string,
  },
  {
    toolName: 'sift_focus_option',
    commandMethod: 'focusOption',
    buildInput: (caseId) => ({ caseId, optionId: 'opt-1', expectedSequence: 1 }),
    expectedFocusTarget: (input) => input['optionId'] as string,
  },
  {
    toolName: 'sift_upsert_option',
    commandMethod: 'upsertOption',
    buildInput: (caseId) => ({
      caseId,
      optionId: 'opt-1',
      expectedSequence: 1,
      option: {
        label: 'Honda Civic LX',
        kind: 'car',
        attributes: [
          {
            definitionId: 'price',
            value: { type: 'money', amount: 25_000, currency: 'USD' },
          },
        ],
      },
    }),
    expectedFocusTarget: (input) => input['optionId'] as string,
  },
  {
    toolName: 'sift_update_criteria',
    commandMethod: 'updateCriteria',
    buildInput: (caseId) => ({
      caseId,
      expectedSequence: 1,
      operations: [{ op: 'reweight', criterionId: 'crit-1', weight: 40 }],
    }),
  },
  {
    toolName: 'sift_define_case_attribute',
    commandMethod: 'defineCaseAttribute',
    buildInput: (caseId) => ({
      caseId,
      expectedSequence: 1,
      definition: {
        id: 'custom.trunk_space',
        label: 'Trunk space',
        valueType: 'number',
        appliesTo: ['car'],
        evidenceExpectation: 'assertion',
        comparison: 'higher_better',
        reason: 'The user explicitly cares about cargo room.',
      },
    }),
  },
  {
    toolName: 'sift_submit_source',
    commandMethod: 'submitSource',
    buildInput: (caseId) => ({
      caseId,
      expectedSequence: 1,
      source: {
        url: 'https://example.com/review',
        title: 'Independent review',
        retrievedAt: '2026-01-01T00:00:00.000Z',
        claims: [{ statement: 'Good fuel economy.', appliesToEntityIds: ['opt-1'] }],
      },
    }),
  },
  {
    toolName: 'sift_set_evidence_disposition',
    commandMethod: 'setEvidenceDisposition',
    buildInput: (caseId) => ({
      caseId,
      evidenceId: 'ev-1',
      disposition: 'excluded',
      reason: 'Duplicate of another source.',
      expectedSequence: 1,
    }),
    expectedFocusTarget: (input) => input['evidenceId'] as string,
  },
  {
    toolName: 'sift_request_investigation',
    commandMethod: 'requestInvestigation',
    buildInput: (caseId) => ({ caseId, expectedSequence: 1 }),
  },
  {
    toolName: 'sift_request_revision',
    commandMethod: 'requestRevision',
    buildInput: (caseId) => ({
      caseId,
      proposalId: 'prop-1',
      instructions: 'Reweight comfort higher.',
      expectedSequence: 1,
    }),
    expectedFocusTarget: (input) => input['proposalId'] as string,
  },
  {
    toolName: 'sift_set_option_attribute',
    commandMethod: 'setOptionAttribute',
    buildInput: (caseId) => ({
      caseId,
      optionId: 'opt-1',
      expectedSequence: 1,
      attribute: {
        definitionId: 'price',
        value: { type: 'money', amount: 25_000, currency: 'USD' },
        status: 'asserted',
        origin: 'user',
      },
    }),
    expectedFocusTarget: (input) => input['optionId'] as string,
  },
  {
    toolName: 'sift_add_note',
    commandMethod: 'addNote',
    buildInput: (caseId) => ({
      caseId,
      expectedSequence: 1,
      note: { body: 'The seat position felt wrong on the test drive.' },
    }),
  },
];

describe.each(CASE_TOOL_FIXTURES)(
  '$toolName',
  ({ toolName, commandMethod, buildInput, expectedFocusTarget }) => {
    it('calls the shared SiftCommands method and returns an honest success envelope', async () => {
      const isRunTool = toolName === 'sift_request_investigation';
      const receipt = isRunTool
        ? buildFakeRunReceipt({ caseId: 'case-1', acceptedSequence: 5, runId: 'run-9' })
        : buildFakeCommandReceipt({ caseId: 'case-1', acceptedSequence: 5 });
      const commandMock = vi.fn().mockResolvedValue(receipt);
      const { adapter, commands } = await setUpWithActiveCase('case-1', {
        [commandMethod]: commandMock,
      });

      const input = buildInput('case-1');
      const result = await invokeTool(adapter, toolName, input);

      expect(commands[commandMethod]).toHaveBeenCalledWith(input, { origin: 'webmcp' });
      expect(commandMock).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(true);
      expect(result.commandId).toBe(receipt.commandId);
      expect(result.caseId).toBe('case-1');
      expect(result.sequence).toBe(5);
      expect(result.ui.changed).toBe(true);
      if (expectedFocusTarget) {
        expect(result.ui.focusTarget).toBe(expectedFocusTarget(input));
      }
      if (isRunTool) {
        expect(result.runId).toBe('run-9');
      }
    });

    it('rejects a caseId that is not the active case, without calling SiftCommands', async () => {
      const commandMock = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
      const { adapter } = await setUpWithActiveCase('case-1', {
        [commandMethod]: commandMock,
      });

      const input = buildInput('some-other-case');
      const result = await invokeTool(adapter, toolName, input);

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
      expect(commandMock).not.toHaveBeenCalled();
    });

    it('returns VALIDATION and never calls SiftCommands for malformed input', async () => {
      const commandMock = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
      const { adapter } = await setUpWithActiveCase('case-1', {
        [commandMethod]: commandMock,
      });

      // Every real input schema is `.strict()`; an unexpected extra field
      // is guaranteed to fail validation regardless of the tool's own
      // required fields.
      const result = await invokeTool(adapter, toolName, {
        caseId: 'case-1',
        thisFieldDoesNotExist: true,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
      expect(commandMock).not.toHaveBeenCalled();
    });
  },
);

describe('sift_upsert_option: optionId-dependent ui.focusTarget', () => {
  it('omits ui.focusTarget when optionId is not given (creating a brand-new option)', async () => {
    const receipt = buildFakeCommandReceipt({ caseId: 'case-1', acceptedSequence: 5 });
    const commandMock = vi.fn().mockResolvedValue(receipt);
    const { adapter } = await setUpWithActiveCase('case-1', { upsertOption: commandMock });

    const input = {
      caseId: 'case-1',
      expectedSequence: 1,
      option: {
        label: 'Honda Civic LX',
        kind: 'car',
        attributes: [
          { definitionId: 'price', value: { type: 'money', amount: 25_000, currency: 'USD' } },
        ],
      },
    };
    const result = await invokeTool(adapter, 'sift_upsert_option', input);

    expect(result.ok).toBe(true);
    expect(result.ui.changed).toBe(true);
    expect(result.ui.focusTarget).toBeUndefined();
    expect(commandMock).toHaveBeenCalledWith(input, { origin: 'webmcp' });
  });
});

describe('error envelope mapping (shared plumbing exercised through sift_select_pack)', () => {
  it('maps a POLICY rejection to an honest, unsuccessful envelope', async () => {
    const { adapter } = await setUpWithActiveCase('case-1', {
      selectPack: vi.fn().mockRejectedValue(
        new SiftClientError('Case already has evidence and cannot be reinterpreted.', {
          status: 409,
          code: 'POLICY',
          retryable: false,
        }),
      ),
    });

    const result = await invokeTool(adapter, 'sift_select_pack', {
      caseId: 'case-1',
      packId: 'home-energy-guardian',
      expectedSequence: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Case already has evidence and cannot be reinterpreted.');
    expect(result.error).toEqual({ code: 'POLICY', retryable: false });
  });

  it('maps a CONFLICT rejection and surfaces the latest sequence when the error carries one', async () => {
    const { adapter } = await setUpWithActiveCase('case-1', {
      selectPack: vi.fn().mockRejectedValue(
        new SiftClientError('Stale expectedSequence.', {
          status: 409,
          code: 'CONFLICT',
          retryable: true,
          details: { actualSequence: 7 },
        }),
      ),
    });

    const result = await invokeTool(adapter, 'sift_select_pack', {
      caseId: 'case-1',
      packId: 'home-energy-guardian',
      expectedSequence: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'CONFLICT', retryable: true });
    expect(result.sequence).toBe(7);
  });

  it('maps a NOT_FOUND rejection honestly', async () => {
    const { adapter } = await setUpWithActiveCase('case-1', {
      selectPack: vi.fn().mockRejectedValue(
        new SiftClientError('Pack not found.', {
          status: 404,
          code: 'NOT_FOUND',
          retryable: false,
        }),
      ),
    });

    const result = await invokeTool(adapter, 'sift_select_pack', {
      caseId: 'case-1',
      packId: 'not-a-real-pack',
      expectedSequence: 1,
    });

    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
  });

  it('maps a SiftClientError that carries no code (the documented sift-client.ts parsing gap for an as-yet-unparsed error shape) to INTERNAL rather than an undefined code', async () => {
    const { adapter } = await setUpWithActiveCase('case-1', {
      selectPack: vi.fn().mockRejectedValue(
        new SiftClientError('Something went wrong.', {
          status: 500,
          retryable: false,
        }),
      ),
    });

    const result = await invokeTool(adapter, 'sift_select_pack', {
      caseId: 'case-1',
      packId: 'car-purchase',
      expectedSequence: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Something went wrong.');
    expect(result.error).toEqual({ code: 'INTERNAL', retryable: false });
  });

  it('maps any unexpected thrown error to INTERNAL and never claims success', async () => {
    const { adapter } = await setUpWithActiveCase('case-1', {
      selectPack: vi.fn().mockRejectedValue(new Error('unexpected server error')),
    });

    const result = await invokeTool(adapter, 'sift_select_pack', {
      caseId: 'case-1',
      packId: 'car-purchase',
      expectedSequence: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'INTERNAL', retryable: false });
  });

  it('maps a pre-aborted call to UNAVAILABLE/retryable:true without ever calling SiftCommands', async () => {
    const commandMock = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const { adapter } = await setUpWithActiveCase('case-1', { selectPack: commandMock });

    const controller = new AbortController();
    controller.abort();

    const result = await invokeTool(
      adapter,
      'sift_select_pack',
      { caseId: 'case-1', packId: 'car-purchase', expectedSequence: 1 },
      { signal: controller.signal },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'UNAVAILABLE', retryable: true });
    expect(commandMock).not.toHaveBeenCalled();
  });

  it('maps a mid-flight abort to UNAVAILABLE and discards the late response', async () => {
    let resolveCommand!: (receipt: ReturnType<typeof buildFakeCommandReceipt>) => void;
    const pending = new Promise<ReturnType<typeof buildFakeCommandReceipt>>((resolve) => {
      resolveCommand = resolve;
    });
    const { adapter } = await setUpWithActiveCase('case-1', {
      selectPack: vi.fn().mockReturnValue(pending),
    });

    const controller = new AbortController();
    const resultPromise = invokeTool(
      adapter,
      'sift_select_pack',
      { caseId: 'case-1', packId: 'car-purchase', expectedSequence: 1 },
      { signal: controller.signal },
    );

    controller.abort();
    const result = await resultPromise;

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'UNAVAILABLE', retryable: true });

    // The command eventually "completes" after the tool already reported
    // cancellation -- this must not retroactively change anything the
    // caller already observed.
    resolveCommand(buildFakeCommandReceipt());
    await Promise.resolve();
    expect(result.ok).toBe(false);
  });

  it('rejects normally (not via abort) while a live, unaborted signal is attached, still mapping to an honest error envelope', async () => {
    const { adapter } = await setUpWithActiveCase('case-1', {
      selectPack: vi
        .fn()
        .mockRejectedValue(new Error('downstream failure, unrelated to cancellation')),
    });

    const controller = new AbortController();
    const result = await invokeTool(
      adapter,
      'sift_select_pack',
      { caseId: 'case-1', packId: 'car-purchase', expectedSequence: 1 },
      { signal: controller.signal },
    );

    expect(controller.signal.aborted).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'INTERNAL', retryable: false });
  });

  it('includes the receipt snapshot in data when the server returns one', async () => {
    const snapshot = buildFixtureCaseState({ id: 'case-1' });
    const { adapter } = await setUpWithActiveCase('case-1', {
      selectPack: vi
        .fn()
        .mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1', snapshot })),
    });

    const result = await invokeTool(adapter, 'sift_select_pack', {
      caseId: 'case-1',
      packId: 'car-purchase',
      expectedSequence: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(snapshot);
  });
});

describe('sift_get_case_context', () => {
  it('reports no active case honestly when none exists, without inventing data', async () => {
    const adapter = new InMemoryModelContextAdapter();
    await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => null,
      listPacks: () => [],
    });

    const result = await invokeTool(adapter, 'sift_get_case_context', {});

    expect(result).toEqual({
      ok: true,
      message: 'No case is currently active.',
      data: null,
      ui: { changed: false },
    });
  });

  it('projects the active case to exactly the fields webmcp.md specifies', async () => {
    const caseState = buildFixtureCaseState({
      selectedEvidenceId: 'ev-1',
      selectedOptionId: 'opt-1',
      eventSequence: 42,
    });
    const adapter = new InMemoryModelContextAdapter();
    await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => caseState,
      listPacks: () => [],
    });

    const result = await invokeTool<{
      caseId: string;
      pack: { id: string; version: string; compiledHash: string };
      selectedEvidenceId: string | null;
      selectedOptionId: string | null;
    }>(adapter, 'sift_get_case_context', {});

    expect(result.ok).toBe(true);
    expect(result.caseId).toBe('case-1');
    expect(result.sequence).toBe(42);
    expect(result.data?.caseId).toBe('case-1');
    expect(result.data?.selectedEvidenceId).toBe('ev-1');
    expect(result.data?.selectedOptionId).toBe('opt-1');
    expect(result.data?.pack).toEqual({
      id: 'car-purchase',
      version: '1.0.0',
      compiledHash: 'a'.repeat(64),
    });
  });

  it('counts obligations by status into readiness', async () => {
    const caseState = buildFixtureCaseState({
      obligations: [
        buildFixtureObligation({ id: 'obl-1', status: 'open' }),
        buildFixtureObligation({ id: 'obl-2', status: 'satisfied' }),
        buildFixtureObligation({ id: 'obl-3', status: 'satisfied' }),
        buildFixtureObligation({ id: 'obl-4', status: 'blocked' }),
      ],
    });
    const adapter = new InMemoryModelContextAdapter();
    await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => caseState,
      listPacks: () => [],
    });

    const result = await invokeTool<{ readiness: Record<string, number> }>(
      adapter,
      'sift_get_case_context',
      {},
    );

    expect(result.data?.readiness).toEqual({
      open: 1,
      active: 0,
      satisfied: 2,
      accepted_uncertainty: 0,
      blocked: 1,
      total: 4,
    });
  });

  it('surfaces a pending proposal as pendingHumanAction', async () => {
    const caseState = buildFixtureCaseState({
      proposal: {
        id: 'prop-1',
        recommendationId: 'rec-1',
        status: 'pending',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    const adapter = new InMemoryModelContextAdapter();
    await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => caseState,
      listPacks: () => [],
    });

    const result = await invokeTool<{ pendingHumanAction: unknown }>(
      adapter,
      'sift_get_case_context',
      {},
    );

    expect(result.data?.pendingHumanAction).toEqual({
      kind: 'review_proposal',
      proposalId: 'prop-1',
    });
  });

  it('reflects a selection made through sift_focus_evidence once the caller applies the resulting state (state sync itself is a later task)', async () => {
    let caseState = buildFixtureCaseState({ selectedEvidenceId: null });
    const adapter = new InMemoryModelContextAdapter();
    const handle = await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands({
        focusEvidence: vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' })),
      }),
      getActiveCase: () => caseState,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    const focusResult = await invokeTool(adapter, 'sift_focus_evidence', {
      caseId: 'case-1',
      evidenceId: 'ev-2',
      expectedSequence: 1,
    });
    expect(focusResult.ok).toBe(true);

    // This registration layer calls SiftCommands and reports an honest
    // envelope; it does not itself own live case-state sync (a later
    // event-stream task's responsibility). The test applies the resulting
    // change the way a real SSE-driven cache would, then confirms the read
    // tool's projection picks it up on the next call.
    caseState = { ...caseState, selectedEvidenceId: 'ev-2' };

    const contextResult = await invokeTool<{ selectedEvidenceId: string | null }>(
      adapter,
      'sift_get_case_context',
      {},
    );
    expect(contextResult.data?.selectedEvidenceId).toBe('ev-2');
  });

  it('surfaces activeRun with the runId when activeFocus carries one', async () => {
    const caseState = buildFixtureCaseState({
      activeFocus: {
        obligationId: 'car.hard_constraints',
        reason: 'Investigating the household budget constraint.',
        runId: 'run-42',
        since: '2026-01-01T00:00:00.000Z',
      },
    });
    const adapter = new InMemoryModelContextAdapter();
    await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => caseState,
      listPacks: () => [],
    });

    const result = await invokeTool<{ activeRun: { runId: string } | null }>(
      adapter,
      'sift_get_case_context',
      {},
    );

    expect(result.data?.activeRun).toEqual({ runId: 'run-42' });
  });

  it('reports activeRun as null when activeFocus exists but carries no runId (no run is currently correlated)', async () => {
    const caseState = buildFixtureCaseState({
      activeFocus: {
        obligationId: 'car.hard_constraints',
        reason: 'Awaiting a source before starting a run.',
        since: '2026-01-01T00:00:00.000Z',
      },
    });
    const adapter = new InMemoryModelContextAdapter();
    await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => caseState,
      listPacks: () => [],
    });

    const result = await invokeTool<{ activeRun: { runId: string } | null }>(
      adapter,
      'sift_get_case_context',
      {},
    );

    expect(result.data?.activeRun).toBeNull();
  });

  it('returns VALIDATION for a non-empty input without reading case state', async () => {
    const getActiveCase = vi.fn().mockReturnValue(null);
    const adapter = new InMemoryModelContextAdapter();
    await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase,
      listPacks: () => [],
    });

    const result = await invokeTool(adapter, 'sift_get_case_context', { unexpected: true });

    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
    expect(getActiveCase).not.toHaveBeenCalled();
  });
});

// --- The reference library across the WebMCP boundary ---
//
// Sift is where the model keeps durable context and memory, so the two
// halves have to meet: what `sift_submit_source` writes must be what
// `sift_list_research` can read back. These tests pin both directions at the
// real tool boundary rather than only at the projection helper.

describe('sift_submit_source and sift_list_research: the reference library round-trip', () => {
  it('forwards tags, summary, and summaryFormat to commands.submitSource untouched', async () => {
    const submitSource = vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
    const { adapter } = await setUpWithActiveCase('case-1', { submitSource });

    const input = {
      caseId: 'case-1',
      expectedSequence: 1,
      source: {
        url: 'https://example.com/paper',
        title: 'Long-term reliability study',
        retrievedAt: '2026-01-01T00:00:00.000Z',
        tags: ['Reliability', 'Research paper'],
        summary: 'Ten-year failure rates, **by drivetrain**.',
        summaryFormat: 'markdown',
        claims: [],
      },
    };
    const result = await invokeTool(adapter, 'sift_submit_source', input);

    expect(result.ok).toBe(true);
    expect(submitSource).toHaveBeenCalledWith(input, expect.anything());
  });

  it('accepts a reference with no claims and no obligationId (a source kept because it is relevant is not a degraded submission)', async () => {
    const submitSource = vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
    const { adapter } = await setUpWithActiveCase('case-1', { submitSource });

    const result = await invokeTool(adapter, 'sift_submit_source', {
      caseId: 'case-1',
      expectedSequence: 1,
      source: {
        url: 'https://example.com/blog',
        title: 'A blog post worth keeping',
        retrievedAt: '2026-01-01T00:00:00.000Z',
        tags: ['Background'],
        claims: [],
      },
    });

    expect(result.ok).toBe(true);
    expect(submitSource).toHaveBeenCalledTimes(1);
  });

  it('reads the stored tags and summary back out through sift_list_research', async () => {
    const caseState = buildFixtureCaseState({
      sources: [
        {
          id: 'src-1',
          url: 'https://example.com/paper',
          title: 'Long-term reliability study',
          retrievedAt: '2026-01-01T00:00:00.000Z',
          tags: ['Reliability', 'Research paper'],
          summary: 'Ten-year failure rates, by drivetrain.',
          summaryFormat: 'markdown',
          origin: 'user_submitted',
          verification: 'unverified',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const adapter = new InMemoryModelContextAdapter();
    const handle = await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => caseState,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    const result = await invokeTool<{
      sources: { items: { id: string; tags?: string[]; summary?: string }[] };
    }>(adapter, 'sift_list_research', { caseId: 'case-1' });

    expect(result.ok).toBe(true);
    expect(result.data?.sources.items[0]?.tags).toEqual(['Reliability', 'Research paper']);
    expect(result.data?.sources.items[0]?.summary).toBe('Ten-year failure rates, by drivetrain.');
  });
});

describe('sift_list_packs', () => {
  it('projects installed packs to description, version, hash, and activation signals', async () => {
    const pack = buildFixtureCompiledPack();
    const adapter = new InMemoryModelContextAdapter();
    await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => null,
      listPacks: () => [pack],
    });

    const result = await invokeTool(adapter, 'sift_list_packs', {});

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      {
        packId: 'car-purchase',
        version: '1.0.0',
        name: 'Choose Our Next Car',
        description: pack.identity.description,
        compiledHash: pack.compiledHash,
        activation: pack.activation,
      },
    ]);
  });

  it('supports an async listPacks accessor', async () => {
    const pack = buildFixtureCompiledPack();
    const adapter = new InMemoryModelContextAdapter();
    await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => null,
      listPacks: () => Promise.resolve([pack]),
    });

    const result = await invokeTool<unknown[]>(adapter, 'sift_list_packs', {});

    expect(result.data).toHaveLength(1);
  });

  it('returns VALIDATION and never calls listPacks for malformed input (ListPacksInputSchema is `.strict().object({})`, so any field at all is rejected)', async () => {
    const listPacks = vi.fn().mockReturnValue([]);
    const adapter = new InMemoryModelContextAdapter();
    await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => null,
      listPacks,
    });

    const result = await invokeTool(adapter, 'sift_list_packs', { thisFieldDoesNotExist: true });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
    expect(listPacks).not.toHaveBeenCalled();
  });
});

describe('callback-vs-envelope equivalence', () => {
  // A true visible-control-equivalence test (rendering a real UI control and
  // asserting it dispatches the identical SiftCommands call) is explicitly
  // out of scope for this pass: no visible control calls these commands yet
  // (a later integration task wires that, per this task's brief). This
  // test instead proves the in-scope half: calling a command directly
  // through the shared `SiftCommands` client and calling the same command
  // through its WebMCP tool produce envelopes built from the exact same
  // `CommandReceipt` -- there is no second, divergent path.
  it('builds the tool envelope from the same CommandReceipt fields the shared client returns', async () => {
    const receipt = buildFakeCommandReceipt({ caseId: 'case-1', acceptedSequence: 3 });
    const commandMock = vi.fn().mockResolvedValue(receipt);
    const { adapter, commands } = await setUpWithActiveCase('case-1', { selectPack: commandMock });
    const input = { caseId: 'case-1', packId: 'car-purchase', expectedSequence: 1 };

    const directReceipt = await commands.selectPack(input);
    const toolResult = await invokeTool(adapter, 'sift_select_pack', input);

    expect(toolResult.commandId).toBe(directReceipt.commandId);
    expect(toolResult.caseId).toBe(directReceipt.caseId);
    expect(toolResult.sequence).toBe(directReceipt.acceptedSequence);
    expect(commandMock).toHaveBeenCalledTimes(2);
  });
});

describe('no tool can approve or reject a decision proposal', () => {
  it('never calls commands.reviewProposal from any of the twenty-two registered tools', async () => {
    const reviewProposal = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const { adapter, commands } = await setUpWithActiveCase('case-1', { reviewProposal });

    for (const fixture of CASE_TOOL_FIXTURES) {
      await invokeTool(adapter, fixture.toolName, fixture.buildInput('case-1'));
    }
    await invokeTool(adapter, 'sift_get_case_context', {});
    await invokeTool(adapter, 'sift_list_packs', {});
    // The seven tools with no `SiftCommands` dependency at all (four reads
    // plus sift_get_decision_guide, sift_list_research, sift_list_notes) --
    // empirically invoked here too rather than only reasoned about
    // structurally.
    await invokeTool(adapter, 'sift_get_option_details', { caseId: 'case-1', optionId: 'opt-1' });
    await invokeTool(adapter, 'sift_list_research', { caseId: 'case-1' });
    await invokeTool(adapter, 'sift_list_notes', { caseId: 'case-1' });
    await invokeTool(adapter, 'sift_search_catalog', { caseId: 'case-1' });
    await invokeTool(adapter, 'sift_get_decision_guide', { caseId: 'case-1' });
    // The three PRESENTATION tools -- genuinely reach `commands.setView` now
    // (never `reviewProposal`), so `expectedSequence` is supplied for real.
    await invokeTool(adapter, 'sift_set_view', {
      caseId: 'case-1',
      mode: 'list',
      expectedSequence: 1,
    });
    await invokeTool(adapter, 'sift_configure_comparison', {
      caseId: 'case-1',
      visibleAttributeIds: ['price'],
      expectedSequence: 1,
    });
    await invokeTool(adapter, 'sift_focus_question', {
      caseId: 'case-1',
      questionId: 'obl-1',
      expectedSequence: 1,
    });

    expect(commands.reviewProposal).not.toHaveBeenCalled();
    expect(reviewProposal).not.toHaveBeenCalled();
  });

  it('the CATALOG itself still exposes no proposal-approval tool, after ADR 0011 let pre-authorized case extensions land confirmed', async () => {
    // ADR 0011 widened what a PACK may pre-authorize: a model may now add a
    // typed comparison column, and its values, to a case whose pack allows
    // it, landing confirmed rather than pending. That is a decision about
    // how far a case may be EXTENDED. It says nothing about who may DECIDE
    // one, and this asserts that boundary is still intact structurally --
    // not "reviewProposal happened not to be called", but "no tool that
    // could approve a proposal is registered at all".
    const { adapter } = await setUpWithActiveCase('case-1');
    const toolNames = adapter.registeredToolNames;

    expect(toolNames).not.toContain('sift_review_proposal');
    expect(toolNames.some((name) => /approve|review_proposal|decide/i.test(name))).toBe(false);
    // And the catalog is genuinely populated -- so the assertion above is
    // about absence, not about an empty registry.
    expect(toolNames).toContain('sift_define_case_attribute');
  });
});
