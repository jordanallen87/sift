/**
 * Behavioral tests for seven WebMCP tools defined outside `@sift/contracts`
 * (`sift_get_option_details`, `sift_list_research`, `sift_search_catalog`,
 * `sift_set_view`, `sift_configure_comparison`, `sift_get_decision_guide`,
 * `sift_focus_question`; docs/decisions/0006-webmcp-two-way-collaboration-
 * contract.md). A new file rather than an addition to the already-large
 * `register-sift-tools.test.ts` (~900 lines before the first of these tasks),
 * matching that file's own sibling `register-sift-tools-catalog-case.test.ts`
 * precedent for the identical reason stated in that file's header comment:
 * avoid merge-conflict risk with concurrent work on the larger file. The
 * later two tools (`sift_get_decision_guide`, `sift_focus_question`) are
 * appended to this same file rather than a further sibling file, per this
 * task's own brief: extend existing infrastructure/tests instead of writing
 * a parallel version.
 *
 * The critical correctness proof this file exists to carry (ADR 0006
 * decision 3, change-set §53/§54): "Show only safety and cargo" must never
 * mean "safety and cargo are the only things I care about." Now that
 * `sift_set_view`/`sift_configure_comparison`/`sift_focus_question` genuinely
 * persist through `commands.setView`, this is proven differently than when
 * they were session-only in-memory state: a PRESENTATION tool call must reach
 * `commands.setView` and ONLY `commands.setView` -- never `updateCriteria`,
 * never `reviewProposal`, never any other `SiftCommands` method -- and must
 * leave `criteria`/`recommendation` byte-for-byte unchanged. See the
 * `CRITICAL` test inside the `sift_configure_comparison` describe block
 * below, extended to also cover `sift_focus_question`, and this file's own
 * `expectOnlyCommandCalled` helper.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  CaseState,
  Claim,
  CompiledDecisionPack,
  DecisionGuide,
  EntityRecord,
  Recommendation,
  Source,
} from '@sift/contracts';
import type { SiftCommands } from '../api/sift-client.js';
import { buildFakeCommandReceipt, createFakeSiftCommands } from '../test/fake-sift-commands.js';
import { buildFixtureCaseState, buildFixtureCompiledPack } from '../test/fixtures.js';
import { InMemoryModelContextAdapter } from './adapter.js';
import { registerSiftTools } from './register-sift-tools.js';
import type { CatalogAdapter } from './catalog-search-adapter.js';

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

/** Same explicitly-generic wrapper as `register-sift-tools.test.ts`'s own. */
async function invokeTool<TData = unknown>(
  adapter: InMemoryModelContextAdapter,
  name: string,
  input: unknown,
): Promise<AnyToolResult<TData>> {
  return adapter.invoke<unknown, AnyToolResult<TData>>(name, input);
}

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function buildEntity(overrides: Partial<EntityRecord> = {}): EntityRecord {
  return {
    id: 'opt-1',
    kind: 'candidate',
    label: 'Toyota RAV4',
    attributes: {},
    createdAt: FIXED_TIMESTAMP,
    updatedAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function buildSource(overrides: Partial<Source> = {}): Source {
  return {
    id: 'src-1',
    url: 'https://example.com/review',
    title: 'Independent review',
    retrievedAt: FIXED_TIMESTAMP,
    origin: 'user_submitted',
    verification: 'unverified',
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

function buildClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    obligationId: 'obl-1',
    statement: 'Good fuel economy.',
    stance: 'supports',
    confidence: 0.6,
    sourceIds: ['src-1'],
    stale: false,
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

interface SetUpOptions {
  getActiveCase?: () => CaseState | null;
  commandsOverrides?: Partial<SiftCommands>;
  catalogAdapters?: Record<string, CatalogAdapter>;
  listPacks?: () => CompiledDecisionPack[] | Promise<CompiledDecisionPack[]>;
}

async function setUpWithActiveCase(
  caseId: string,
  options: SetUpOptions = {},
): Promise<{ adapter: InMemoryModelContextAdapter; commands: SiftCommands }> {
  const adapter = new InMemoryModelContextAdapter();
  const commands = createFakeSiftCommands(options.commandsOverrides);
  const handle = await registerSiftTools({
    adapter,
    commands,
    getActiveCase: options.getActiveCase ?? (() => null),
    listPacks: options.listPacks ?? (() => []),
    ...(options.catalogAdapters !== undefined ? { catalogAdapters: options.catalogAdapters } : {}),
  });
  await handle.setActiveCase(caseId);
  return { adapter, commands };
}

describe('sift_get_option_details', () => {
  it('returns the full option plus claims/sources linked to it by entityId and by attribute sourceIds', async () => {
    const entity = buildEntity({
      id: 'opt-1',
      attributes: {
        price: {
          definitionId: 'price',
          label: 'Price',
          value: { type: 'money', amount: 28_000, currency: 'USD' },
          origin: 'user',
          sourceIds: ['src-2'],
          status: 'asserted',
          updatedAt: FIXED_TIMESTAMP,
        },
      },
    });
    const caseState = buildFixtureCaseState({
      entities: [entity],
      claims: [buildClaim({ id: 'claim-1', entityId: 'opt-1', sourceIds: ['src-1'] })],
      sources: [buildSource({ id: 'src-1' }), buildSource({ id: 'src-2', title: 'Price listing' })],
    });
    const { adapter } = await setUpWithActiveCase('case-1', { getActiveCase: () => caseState });

    const result = await invokeTool<{
      optionId: string;
      option: EntityRecord;
      relatedClaims: { items: unknown[]; total: number };
      relatedSources: { items: { id: string }[]; total: number };
    }>(adapter, 'sift_get_option_details', { caseId: 'case-1', optionId: 'opt-1' });

    expect(result.ok).toBe(true);
    expect(result.data?.optionId).toBe('opt-1');
    expect(result.data?.option).toEqual(entity);
    expect(result.data?.relatedClaims.total).toBe(1);
    expect(result.data?.relatedSources.items.map((source) => source.id).sort()).toEqual([
      'src-1',
      'src-2',
    ]);
  });

  it('returns NOT_FOUND, never a fabricated empty detail record, for an unknown option id', async () => {
    const caseState = buildFixtureCaseState({ entities: [] });
    const { adapter } = await setUpWithActiveCase('case-1', { getActiveCase: () => caseState });

    const result = await invokeTool(adapter, 'sift_get_option_details', {
      caseId: 'case-1',
      optionId: 'missing',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
  });

  it('rejects a caseId that is not the active case, without reading case state', async () => {
    const getActiveCase = vi.fn().mockReturnValue(buildFixtureCaseState());
    const { adapter } = await setUpWithActiveCase('case-1', { getActiveCase });

    const result = await invokeTool(adapter, 'sift_get_option_details', {
      caseId: 'some-other-case',
      optionId: 'opt-1',
    });

    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
    expect(getActiveCase).not.toHaveBeenCalled();
  });

  it('returns VALIDATION for malformed input', async () => {
    const { adapter } = await setUpWithActiveCase('case-1');
    const result = await invokeTool(adapter, 'sift_get_option_details', { caseId: 'case-1' });
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
  });
});

describe('sift_list_research', () => {
  it('returns bounded sources and claims for the active case', async () => {
    const caseState = buildFixtureCaseState({
      sources: [buildSource({ id: 'src-1' }), buildSource({ id: 'src-2' })],
      claims: [buildClaim({ id: 'claim-1' })],
    });
    const { adapter } = await setUpWithActiveCase('case-1', { getActiveCase: () => caseState });

    const result = await invokeTool<{
      sources: { items: { id: string }[]; total: number };
      claims: { items: { id: string }[]; total: number };
    }>(adapter, 'sift_list_research', { caseId: 'case-1' });

    expect(result.ok).toBe(true);
    expect(result.data?.sources.total).toBe(2);
    expect(result.data?.claims.total).toBe(1);
  });

  it('never includes a raw Source.excerpt in its projection ("source titles/publishers, NOT full bodies")', async () => {
    const caseState = buildFixtureCaseState({
      sources: [buildSource({ id: 'src-1', excerpt: 'x'.repeat(4000) })],
    });
    const { adapter } = await setUpWithActiveCase('case-1', { getActiveCase: () => caseState });

    const result = await invokeTool<{ sources: { items: Record<string, unknown>[] } }>(
      adapter,
      'sift_list_research',
      { caseId: 'case-1' },
    );

    expect(result.data?.sources.items[0]).not.toHaveProperty('excerpt');
  });

  it('reports "No case is currently active" honestly rather than fabricating research when getActiveCase() is null', async () => {
    const { adapter } = await setUpWithActiveCase('case-1', { getActiveCase: () => null });
    const result = await invokeTool(adapter, 'sift_list_research', { caseId: 'case-1' });
    expect(result).toEqual({
      ok: true,
      message: 'No case is currently active.',
      ui: { changed: false },
    });
  });
});

describe('sift_search_catalog', () => {
  it("delegates to the catalog adapter registered for the active case's pack and maps results", async () => {
    const caseState = buildFixtureCaseState({
      pack: {
        id: 'car-purchase',
        version: '1.0.0',
        compiledHash: 'a'.repeat(64),
        selectedBy: 'user',
        reasons: [],
      },
    });
    const search = vi.fn().mockResolvedValue({
      results: [{ id: 'veh-1', label: '2024 Toyota RAV4', fields: { year: 2024 } }],
      total: 1,
    });
    const fakeAdapter: CatalogAdapter = { recognizedFilterKeys: ['year'], search };
    const { adapter } = await setUpWithActiveCase('case-1', {
      getActiveCase: () => caseState,
      catalogAdapters: { 'car-purchase': fakeAdapter },
    });

    const result = await invokeTool<{ results: unknown[]; total: number; packId: string }>(
      adapter,
      'sift_search_catalog',
      { caseId: 'case-1', query: 'RAV4', filters: { year: 2024 } },
    );

    expect(result.ok).toBe(true);
    expect(result.data?.results).toHaveLength(1);
    expect(result.data?.packId).toBe('car-purchase');
    expect(search).toHaveBeenCalledWith({ query: 'RAV4', filters: { year: 2024 } });
  });

  it('returns an honest empty result, not an error, when no adapter is registered for the active pack', async () => {
    const caseState = buildFixtureCaseState({
      pack: {
        id: 'unknown-pack',
        version: '1.0.0',
        compiledHash: 'a'.repeat(64),
        selectedBy: 'user',
        reasons: [],
      },
    });
    const { adapter } = await setUpWithActiveCase('case-1', {
      getActiveCase: () => caseState,
      catalogAdapters: {},
    });

    const result = await invokeTool<{ results: unknown[]; total: number }>(
      adapter,
      'sift_search_catalog',
      { caseId: 'case-1' },
    );

    expect(result.ok).toBe(true);
    expect(result.data?.results).toEqual([]);
    expect(result.data?.total).toBe(0);
  });

  it('returns VALIDATION for a filters bag carrying more keys than the bound allows', async () => {
    const { adapter } = await setUpWithActiveCase('case-1');
    const filters = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 'v']));
    const result = await invokeTool(adapter, 'sift_search_catalog', { caseId: 'case-1', filters });
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
  });
});

/**
 * Asserts exactly one `SiftCommands` method (`only`) was invoked, and every
 * other method was never invoked -- the empirical half of "a presentation
 * tool reaches `commands.setView` and nothing else" (in particular, never
 * `updateCriteria`/`reviewProposal`), now that `sift_set_view`/
 * `sift_configure_comparison`/`sift_focus_question` are real command-backed
 * writes rather than in-memory-only state.
 */
function expectOnlyCommandCalled(commands: SiftCommands, only: keyof SiftCommands): void {
  for (const [name, fn] of Object.entries(commands)) {
    if (name === only) {
      expect(fn).toHaveBeenCalled();
    } else {
      expect(fn).not.toHaveBeenCalled();
    }
  }
}

describe('sift_set_view (PRESENTATION)', () => {
  it('merges its patch onto the active case’s current view and calls commands.setView with the full result, tagged origin: webmcp', async () => {
    const caseState = buildFixtureCaseState({
      eventSequence: 7,
      view: { mode: 'list', compare: { optionIds: ['opt-9'] } },
    });
    const receipt = buildFakeCommandReceipt({ caseId: 'case-1', acceptedSequence: 8 });
    const setView = vi.fn().mockResolvedValue(receipt);
    const { adapter, commands } = await setUpWithActiveCase('case-1', {
      getActiveCase: () => caseState,
      commandsOverrides: { setView },
    });

    const result = await invokeTool(adapter, 'sift_set_view', {
      caseId: 'case-1',
      expectedSequence: 7,
      mode: 'board',
      focusedOptionId: 'opt-1',
    });

    expect(result.ok).toBe(true);
    expect(result.commandId).toBe(receipt.commandId);
    expect(result.sequence).toBe(8);
    expect(result.ui.changed).toBe(true);
    expect(result.ui.focusTarget).toBe('opt-1');
    expect(commands.setView).toHaveBeenCalledWith(
      {
        caseId: 'case-1',
        expectedSequence: 7,
        // `compare` carried over from the case's existing view -- a
        // partial patch merges onto the current view, it does not replace
        // it wholesale.
        view: { mode: 'board', compare: { optionIds: ['opt-9'] }, focusedOptionId: 'opt-1' },
      },
      { origin: 'webmcp' },
    );
    expectOnlyCommandCalled(commands, 'setView');
  });

  it('reflects a view set through sift_set_view once the caller applies the resulting state (state sync itself is a later task)', async () => {
    let caseState = buildFixtureCaseState({ view: null });
    const adapter = new InMemoryModelContextAdapter();
    const handle = await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands({
        setView: vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' })),
      }),
      getActiveCase: () => caseState,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    const setResult = await invokeTool(adapter, 'sift_set_view', {
      caseId: 'case-1',
      expectedSequence: 1,
      mode: 'board',
    });
    expect(setResult.ok).toBe(true);

    // Same pattern as `register-sift-tools.test.ts`'s own
    // `sift_focus_evidence` "reflects a selection" test: this registration
    // layer calls `SiftCommands` and reports an honest envelope, but does
    // not itself own live case-state sync (a later event-stream task's
    // responsibility) -- the test applies the resulting change the way a
    // real SSE-driven cache would.
    caseState = { ...caseState, view: { mode: 'board' } };

    const contextResult = await invokeTool<{ view: { mode: string } | null }>(
      adapter,
      'sift_get_case_context',
      {},
    );
    expect(contextResult.data?.view).toEqual({ mode: 'board' });
  });

  it('rejects a caseId that is not the active case, without calling SiftCommands', async () => {
    const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const { adapter } = await setUpWithActiveCase('case-1', { commandsOverrides: { setView } });
    const result = await invokeTool(adapter, 'sift_set_view', {
      caseId: 'some-other-case',
      expectedSequence: 1,
      mode: 'list',
    });
    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
    expect(setView).not.toHaveBeenCalled();
  });

  it('returns VALIDATION and never calls SiftCommands when mode is missing', async () => {
    const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const { adapter } = await setUpWithActiveCase('case-1', { commandsOverrides: { setView } });
    const result = await invokeTool(adapter, 'sift_set_view', {
      caseId: 'case-1',
      expectedSequence: 1,
    });
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
    expect(setView).not.toHaveBeenCalled();
  });

  it('returns VALIDATION and never calls SiftCommands when expectedSequence is missing', async () => {
    const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const { adapter } = await setUpWithActiveCase('case-1', { commandsOverrides: { setView } });
    const result = await invokeTool(adapter, 'sift_set_view', {
      caseId: 'case-1',
      mode: 'list',
    });
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
    expect(setView).not.toHaveBeenCalled();
  });

  /**
   * The half of the two-way loop that was missing entirely.
   *
   * `WorkspaceViewState.filters` is a real, durable field: the human-facing
   * `FilterSheet` writes it and `applyWorkspaceFilters` genuinely reads it,
   * so a person can narrow the list to "under $30k" by hand. The model
   * could not -- `SetViewInputSchema` accepted `mode`/`focusedOptionId`/
   * `visibleOptionIds` and nothing else -- so the single most natural thing
   * a person says in chat ("only show me the ones under $30k") had no tool
   * call behind it at all. These tests pin the capability AND the shape it
   * borrows: `WorkspaceFilterSchema` from `@sift/contracts`, never a
   * re-declared local copy that could drift from what the store accepts.
   */
  describe('filters', () => {
    const UNDER_30K = { fieldId: 'price', operator: 'less_than', value: '30000' } as const;

    it('accepts filters and merges them onto the current view, leaving every other view field intact', async () => {
      const caseState = buildFixtureCaseState({
        eventSequence: 5,
        view: { mode: 'list', focusedOptionId: 'opt-3' },
      });
      const receipt = buildFakeCommandReceipt({ caseId: 'case-1', acceptedSequence: 6 });
      const setView = vi.fn().mockResolvedValue(receipt);
      const { adapter, commands } = await setUpWithActiveCase('case-1', {
        getActiveCase: () => caseState,
        commandsOverrides: { setView },
      });

      const result = await invokeTool(adapter, 'sift_set_view', {
        caseId: 'case-1',
        expectedSequence: 5,
        mode: 'list',
        filters: [UNDER_30K],
      });

      expect(result.ok).toBe(true);
      expect(commands.setView).toHaveBeenCalledWith(
        {
          caseId: 'case-1',
          expectedSequence: 5,
          view: { mode: 'list', focusedOptionId: 'opt-3', filters: [UNDER_30K] },
        },
        { origin: 'webmcp' },
      );
      // Still presentation and nothing else: a filter narrows what is
      // VISIBLE, and must never reach `updateCriteria` -- "only show me the
      // ones under $30k" is not "budget is now the only thing I care about."
      expectOnlyCommandCalled(commands, 'setView');
    });

    it('replaces the whole filter array rather than appending to it, so "actually, just show me everything" is expressible', async () => {
      const caseState = buildFixtureCaseState({
        eventSequence: 2,
        view: { mode: 'list', filters: [UNDER_30K] },
      });
      const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
      const { adapter, commands } = await setUpWithActiveCase('case-1', {
        getActiveCase: () => caseState,
        commandsOverrides: { setView },
      });

      await invokeTool(adapter, 'sift_set_view', {
        caseId: 'case-1',
        expectedSequence: 2,
        mode: 'list',
        filters: [],
      });

      expect(commands.setView).toHaveBeenCalledWith(
        { caseId: 'case-1', expectedSequence: 2, view: { mode: 'list', filters: [] } },
        { origin: 'webmcp' },
      );
    });

    it('says what it filtered by, not only which view it landed on', async () => {
      const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
      const { adapter } = await setUpWithActiveCase('case-1', {
        getActiveCase: () => buildFixtureCaseState({ eventSequence: 1 }),
        commandsOverrides: { setView },
      });

      const result = await invokeTool(adapter, 'sift_set_view', {
        caseId: 'case-1',
        expectedSequence: 1,
        mode: 'list',
        filters: [UNDER_30K, { fieldId: 'awd', operator: 'equals', value: 'true' }],
      });

      // A receipt that reported only `Workspace view set to "list".` would
      // under-report what the call actually did, and the model would have
      // no signal that its filter reached the page.
      expect(result.message).toContain('2 filter');
      expect(result.ok).toBe(true);
    });

    it('reports an unchanged filter set honestly when a call sets no filters at all', async () => {
      const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
      const { adapter } = await setUpWithActiveCase('case-1', {
        getActiveCase: () => buildFixtureCaseState({ eventSequence: 1 }),
        commandsOverrides: { setView },
      });

      const result = await invokeTool(adapter, 'sift_set_view', {
        caseId: 'case-1',
        expectedSequence: 1,
        mode: 'list',
      });

      expect(result.message).toBe('Workspace view set to "list".');
    });

    it('rejects an operator WorkspaceFilterSchema does not declare, without calling SiftCommands', async () => {
      const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
      const { adapter } = await setUpWithActiveCase('case-1', { commandsOverrides: { setView } });
      const result = await invokeTool(adapter, 'sift_set_view', {
        caseId: 'case-1',
        expectedSequence: 1,
        mode: 'list',
        filters: [{ fieldId: 'price', operator: 'roughly_under', value: '30000' }],
      });
      expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
      expect(setView).not.toHaveBeenCalled();
    });

    it('rejects a filter value carrying markup, because it reuses the contract’s own guarded string', async () => {
      const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
      const { adapter } = await setUpWithActiveCase('case-1', { commandsOverrides: { setView } });
      const result = await invokeTool(adapter, 'sift_set_view', {
        caseId: 'case-1',
        expectedSequence: 1,
        mode: 'list',
        filters: [{ fieldId: 'color', operator: 'equals', value: '<script>alert(1)</script>' }],
      });
      expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
      expect(setView).not.toHaveBeenCalled();
    });

    it('rejects more filters than WorkspaceViewState itself would hold', async () => {
      const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
      const { adapter } = await setUpWithActiveCase('case-1', { commandsOverrides: { setView } });
      const result = await invokeTool(adapter, 'sift_set_view', {
        caseId: 'case-1',
        expectedSequence: 1,
        mode: 'list',
        filters: Array.from({ length: 51 }, (_, index) => ({
          fieldId: `field-${index}`,
          operator: 'equals' as const,
          value: 'x',
        })),
      });
      expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
      expect(setView).not.toHaveBeenCalled();
    });
  });
});

describe('sift_configure_comparison (PRESENTATION)', () => {
  it('configures compare fields, switches the view mode to compare, and calls commands.setView', async () => {
    const caseState = buildFixtureCaseState({ view: null });
    const receipt = buildFakeCommandReceipt({ caseId: 'case-1', acceptedSequence: 3 });
    const setView = vi.fn().mockResolvedValue(receipt);
    const { adapter, commands } = await setUpWithActiveCase('case-1', {
      getActiveCase: () => caseState,
      commandsOverrides: { setView },
    });

    const result = await invokeTool(adapter, 'sift_configure_comparison', {
      caseId: 'case-1',
      expectedSequence: 4,
      optionIds: ['opt-1', 'opt-2'],
      visibleAttributeIds: ['price', 'safety'],
    });

    expect(result.ok).toBe(true);
    expect(result.ui.changed).toBe(true);
    expect(commands.setView).toHaveBeenCalledWith(
      {
        caseId: 'case-1',
        expectedSequence: 4,
        view: {
          mode: 'compare',
          compare: { optionIds: ['opt-1', 'opt-2'] },
          visibleAttributeIds: ['price', 'safety'],
        },
      },
      { origin: 'webmcp' },
    );
  });

  it('returns VALIDATION and never calls SiftCommands when no configurable field is provided (a no-op call is rejected, not silently accepted)', async () => {
    const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const { adapter } = await setUpWithActiveCase('case-1', { commandsOverrides: { setView } });
    const result = await invokeTool(adapter, 'sift_configure_comparison', {
      caseId: 'case-1',
      expectedSequence: 1,
    });
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
    expect(setView).not.toHaveBeenCalled();
  });

  it('CRITICAL (change-set §53/§54): "Show only safety and cargo" changes presentation only -- criteria and the recommendation stay byte-for-byte unchanged, and only commands.setView is ever called, never updateCriteria/reviewProposal/any other command', async () => {
    const readyRecommendation: Recommendation = {
      id: 'rec-1',
      status: 'ready',
      favoredOptionId: 'opt-1',
      rationale: 'Option 1 best balances the household priorities.',
      facts: [],
      hypotheses: [],
      confidence: 0.8,
      limitations: [],
      sourceIds: [],
      resolvedObligationIds: [],
      acceptedUncertaintyObligationIds: [],
      generatedAt: FIXED_TIMESTAMP,
    };
    const originalCriteria = [
      {
        id: 'pref.safety',
        label: 'Safety',
        kind: 'preference' as const,
        weight: 40,
        direction: 'higher_better' as const,
        origin: 'pack' as const,
        status: 'active' as const,
      },
      {
        id: 'pref.fuel_economy',
        label: 'Fuel economy',
        kind: 'preference' as const,
        weight: 20,
        direction: 'higher_better' as const,
        origin: 'pack' as const,
        status: 'active' as const,
      },
    ];
    let caseState = buildFixtureCaseState({
      criteria: originalCriteria,
      recommendation: readyRecommendation,
      view: null,
    });
    const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
    // `commands` is the exact object passed to `registerSiftTools` below --
    // `expectOnlyCommandCalled` later reads its methods directly, not a
    // second, freshly-created fake with its own unrelated `vi.fn()`s.
    const commands = createFakeSiftCommands({ setView });
    const adapter = new InMemoryModelContextAdapter();
    const handle = await registerSiftTools({
      adapter,
      commands,
      getActiveCase: () => caseState,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    // "Show only safety and cargo." -- a presentation request, per change-set
    // §54, never "safety and cargo are the only things I care about."
    const result = await invokeTool(adapter, 'sift_configure_comparison', {
      caseId: 'case-1',
      expectedSequence: 1,
      visibleAttributeIds: ['pref.safety', 'car.cargo_volume'],
    });

    expect(result.ok).toBe(true);
    expect(setView).toHaveBeenCalledWith(
      {
        caseId: 'case-1',
        expectedSequence: 1,
        view: { mode: 'compare', visibleAttributeIds: ['pref.safety', 'car.cargo_volume'] },
      },
      { origin: 'webmcp' },
    );

    // The underlying case object -- the only source of truth this tool was
    // ever given -- was never mutated by the tool itself (the fake command
    // mock does not mutate it either).
    expect(caseState.criteria).toEqual(originalCriteria);
    expect(caseState.recommendation).toEqual(readyRecommendation);

    // Only `setView` was ever reached -- in particular, `updateCriteria`
    // (the one method that actually changes criteria) and `reviewProposal`
    // were not.
    expect(setView).toHaveBeenCalledTimes(1);

    // The caller applies the resulting state the way a real SSE-driven cache
    // would (same pattern as `sift_focus_evidence`'s own reflects-test), then
    // confirms criteria/recommendation are unchanged while the view genuinely
    // did change.
    caseState = {
      ...caseState,
      view: { mode: 'compare', visibleAttributeIds: ['pref.safety', 'car.cargo_volume'] },
    };
    const context = await invokeTool<{
      criteria: unknown;
      recommendation: unknown;
      view: { visibleAttributeIds?: string[]; focusedQuestionId?: string } | null;
    }>(adapter, 'sift_get_case_context', {});
    expect(context.data?.criteria).toEqual(originalCriteria);
    expect(context.data?.recommendation).toEqual(readyRecommendation);
    expect(context.data?.view?.visibleAttributeIds).toEqual(['pref.safety', 'car.cargo_volume']);

    // Extending this same CRITICAL proof (rather than a second parallel
    // test) to `sift_focus_question`: pointing at an unresolved question is
    // presentation too, and must leave the same guarantees intact while
    // composing cleanly onto the compare configuration set moments ago.
    const focusResult = await invokeTool(adapter, 'sift_focus_question', {
      caseId: 'case-1',
      expectedSequence: 1,
      questionId: 'obl-1',
    });
    expect(focusResult.ok).toBe(true);
    expect(setView).toHaveBeenCalledWith(
      {
        caseId: 'case-1',
        expectedSequence: 1,
        view: {
          mode: 'compare',
          visibleAttributeIds: ['pref.safety', 'car.cargo_volume'],
          focusedQuestionId: 'obl-1',
        },
      },
      { origin: 'webmcp' },
    );

    expect(caseState.criteria).toEqual(originalCriteria);
    expect(caseState.recommendation).toEqual(readyRecommendation);
    expectOnlyCommandCalled(commands, 'setView');

    caseState = {
      ...caseState,
      view: {
        mode: 'compare',
        visibleAttributeIds: ['pref.safety', 'car.cargo_volume'],
        focusedQuestionId: 'obl-1',
      },
    };
    const contextAfterFocus = await invokeTool<{
      criteria: unknown;
      recommendation: unknown;
      view: { visibleAttributeIds?: string[]; focusedQuestionId?: string } | null;
    }>(adapter, 'sift_get_case_context', {});
    expect(contextAfterFocus.data?.criteria).toEqual(originalCriteria);
    expect(contextAfterFocus.data?.recommendation).toEqual(readyRecommendation);
    expect(contextAfterFocus.data?.view?.focusedQuestionId).toBe('obl-1');
    // The earlier configure-comparison field survives in the merged view --
    // `mergeWorkspaceView` composes onto the case's current view rather than
    // replacing it wholesale.
    expect(contextAfterFocus.data?.view?.visibleAttributeIds).toEqual([
      'pref.safety',
      'car.cargo_volume',
    ]);
  });

  it('rejects a caseId that is not the active case, without calling SiftCommands', async () => {
    const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const { adapter } = await setUpWithActiveCase('case-1', { commandsOverrides: { setView } });
    const result = await invokeTool(adapter, 'sift_configure_comparison', {
      caseId: 'some-other-case',
      expectedSequence: 1,
      optionIds: ['opt-1'],
    });
    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
    expect(setView).not.toHaveBeenCalled();
  });
});

const FIXTURE_DECISION_GUIDE: DecisionGuide = {
  domainPurpose: 'Help a household choose among a small shortlist of candidate cars.',
  discoveryStrategy: 'Establish hard constraints first, then gather comparative evidence.',
  suggestedQuestions: ['What is the total budget, including taxes and fees?'],
  importantUnknowns: ['Whether the vehicle physically fits the household garage.'],
  researchGuidance: 'Prefer independent reviews and verified ownership-cost data.',
  customFieldGuidance:
    'Create a custom field only when no pack-defined attribute already covers it.',
  presentationGuidance: 'Show price and total cost of ownership together.',
};

describe('sift_get_decision_guide', () => {
  it("returns the active case's pack Decision Guide as typed fields, resolved from the injected pack catalog", async () => {
    const caseState = buildFixtureCaseState({
      pack: {
        id: 'car-purchase',
        version: '1.0.0',
        compiledHash: 'a'.repeat(64),
        selectedBy: 'user',
        reasons: [],
      },
    });
    const pack = buildFixtureCompiledPack({ decisionGuide: FIXTURE_DECISION_GUIDE });
    const { adapter } = await setUpWithActiveCase('case-1', {
      getActiveCase: () => caseState,
      listPacks: () => [pack],
    });

    const result = await invokeTool<{
      packId: string;
      packVersion: string;
      guide: DecisionGuide;
    }>(adapter, 'sift_get_decision_guide', { caseId: 'case-1' });

    expect(result.ok).toBe(true);
    expect(result.data?.packId).toBe('car-purchase');
    expect(result.data?.packVersion).toBe('1.0.0');
    // Structured typed fields, never one concatenated prose blob -- each
    // field survives independently in the response.
    expect(result.data?.guide.domainPurpose).toBe(FIXTURE_DECISION_GUIDE.domainPurpose);
    expect(result.data?.guide.suggestedQuestions).toEqual(
      FIXTURE_DECISION_GUIDE.suggestedQuestions,
    );
    expect(result.data?.guide.presentationGuidance).toBe(
      FIXTURE_DECISION_GUIDE.presentationGuidance,
    );
  });

  it('returns ok:true with no guide, not an error, when the active pack declares none', async () => {
    const caseState = buildFixtureCaseState();
    const pack = buildFixtureCompiledPack(); // no decisionGuide override
    const { adapter } = await setUpWithActiveCase('case-1', {
      getActiveCase: () => caseState,
      listPacks: () => [pack],
    });

    const result = await invokeTool(adapter, 'sift_get_decision_guide', { caseId: 'case-1' });

    expect(result.ok).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.error).toBeUndefined();
  });

  it('returns ok:true with no guide, not an error, when the active pack is absent from the injected pack catalog', async () => {
    const caseState = buildFixtureCaseState();
    const { adapter } = await setUpWithActiveCase('case-1', {
      getActiveCase: () => caseState,
      listPacks: () => [],
    });

    const result = await invokeTool(adapter, 'sift_get_decision_guide', { caseId: 'case-1' });

    expect(result.ok).toBe(true);
    expect(result.data).toBeUndefined();
  });

  it('reports "No case is currently active" honestly rather than fabricating a guide when getActiveCase() is null', async () => {
    const { adapter } = await setUpWithActiveCase('case-1', { getActiveCase: () => null });
    const result = await invokeTool(adapter, 'sift_get_decision_guide', { caseId: 'case-1' });
    expect(result).toEqual({
      ok: true,
      message: 'No case is currently active.',
      ui: { changed: false },
    });
  });

  it('rejects a caseId that is not the active case', async () => {
    const { adapter } = await setUpWithActiveCase('case-1');
    const result = await invokeTool(adapter, 'sift_get_decision_guide', {
      caseId: 'some-other-case',
    });
    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
  });

  it('returns VALIDATION for malformed input', async () => {
    const { adapter } = await setUpWithActiveCase('case-1');
    const result = await invokeTool(adapter, 'sift_get_decision_guide', {});
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
  });
});

describe('sift_focus_question (PRESENTATION)', () => {
  it('merges focusedQuestionId onto the active case’s current view and calls commands.setView, tagged origin: webmcp', async () => {
    const caseState = buildFixtureCaseState({
      eventSequence: 9,
      view: { mode: 'list', visibleOptionIds: ['opt-1'] },
    });
    const receipt = buildFakeCommandReceipt({ caseId: 'case-1', acceptedSequence: 10 });
    const setView = vi.fn().mockResolvedValue(receipt);
    const { adapter, commands } = await setUpWithActiveCase('case-1', {
      getActiveCase: () => caseState,
      commandsOverrides: { setView },
    });

    const result = await invokeTool(adapter, 'sift_focus_question', {
      caseId: 'case-1',
      expectedSequence: 9,
      questionId: 'obl-1',
    });

    expect(result.ok).toBe(true);
    expect(result.commandId).toBe(receipt.commandId);
    expect(result.sequence).toBe(10);
    expect(result.ui.changed).toBe(true);
    expect(result.ui.focusTarget).toBe('obl-1');
    expect(commands.setView).toHaveBeenCalledWith(
      {
        caseId: 'case-1',
        expectedSequence: 9,
        view: { mode: 'list', visibleOptionIds: ['opt-1'], focusedQuestionId: 'obl-1' },
      },
      { origin: 'webmcp' },
    );
    expectOnlyCommandCalled(commands, 'setView');
  });

  it('reflects a question focused through sift_focus_question once the caller applies the resulting state (state sync itself is a later task)', async () => {
    let caseState = buildFixtureCaseState({ view: null });
    const adapter = new InMemoryModelContextAdapter();
    const handle = await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands({
        setView: vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' })),
      }),
      getActiveCase: () => caseState,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    const focusResult = await invokeTool(adapter, 'sift_focus_question', {
      caseId: 'case-1',
      expectedSequence: 1,
      questionId: 'obl-2',
    });
    expect(focusResult.ok).toBe(true);

    caseState = { ...caseState, view: { mode: 'list', focusedQuestionId: 'obl-2' } };

    const contextResult = await invokeTool<{ view: { focusedQuestionId?: string } | null }>(
      adapter,
      'sift_get_case_context',
      {},
    );
    expect(contextResult.data?.view?.focusedQuestionId).toBe('obl-2');
  });

  it('rejects a caseId that is not the active case, without calling SiftCommands', async () => {
    const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const { adapter } = await setUpWithActiveCase('case-1', { commandsOverrides: { setView } });
    const result = await invokeTool(adapter, 'sift_focus_question', {
      caseId: 'some-other-case',
      expectedSequence: 1,
      questionId: 'obl-1',
    });
    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
    expect(setView).not.toHaveBeenCalled();
  });

  it('returns VALIDATION and never calls SiftCommands when questionId is missing', async () => {
    const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const { adapter } = await setUpWithActiveCase('case-1', { commandsOverrides: { setView } });
    const result = await invokeTool(adapter, 'sift_focus_question', {
      caseId: 'case-1',
      expectedSequence: 1,
    });
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
    expect(setView).not.toHaveBeenCalled();
  });

  it('returns VALIDATION and never calls SiftCommands when expectedSequence is missing', async () => {
    const setView = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const { adapter } = await setUpWithActiveCase('case-1', { commandsOverrides: { setView } });
    const result = await invokeTool(adapter, 'sift_focus_question', {
      caseId: 'case-1',
      questionId: 'obl-1',
    });
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
    expect(setView).not.toHaveBeenCalled();
  });
});
