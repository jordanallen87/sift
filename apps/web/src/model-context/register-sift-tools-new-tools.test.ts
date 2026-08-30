/**
 * Behavioral tests for the five WebMCP tools this task adds
 * (`sift_get_option_details`, `sift_list_research`, `sift_search_catalog`,
 * `sift_set_view`, `sift_configure_comparison`;
 * docs/decisions/0006-webmcp-two-way-collaboration-contract.md). A new file
 * rather than an addition to the already-large `register-sift-tools.test.ts`
 * (~900 lines before this task), matching that file's own sibling
 * `register-sift-tools-catalog-case.test.ts` precedent for the identical
 * reason stated in that file's header comment: avoid merge-conflict risk
 * with concurrent work on the larger file.
 *
 * The critical correctness proof this file exists to carry (ADR 0006
 * decision 3, change-set §53/§54): "Show only safety and cargo" must never
 * mean "safety and cargo are the only things I care about." A PRESENTATION
 * tool call must never call any `SiftCommands` method and must leave
 * `criteria`/`recommendation` byte-for-byte unchanged -- see the `CRITICAL`
 * test inside the `sift_configure_comparison` describe block below.
 */
import { describe, expect, it, vi } from 'vitest';
import type { CaseState, Claim, EntityRecord, Recommendation, Source } from '@sift/contracts';
import type { SiftCommands } from '../api/sift-client.js';
import { createFakeSiftCommands } from '../test/fake-sift-commands.js';
import { buildFixtureCaseState } from '../test/fixtures.js';
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
    listPacks: () => [],
    ...(options.catalogAdapters !== undefined ? { catalogAdapters: options.catalogAdapters } : {}),
  });
  await handle.setActiveCase(caseId);
  return { adapter, commands };
}

/** Asserts every `SiftCommands` method on the fake client was never invoked -- the empirical half of "a presentation/read tool never mutates decision state." */
function expectNoCommandsCalled(commands: SiftCommands): void {
  for (const fn of Object.values(commands)) {
    expect(fn).not.toHaveBeenCalled();
  }
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

describe('sift_set_view (PRESENTATION)', () => {
  it('sets the view, echoes it back, and never calls any SiftCommands method', async () => {
    const caseState = buildFixtureCaseState({ eventSequence: 7 });
    const { adapter, commands } = await setUpWithActiveCase('case-1', {
      getActiveCase: () => caseState,
    });

    const result = await invokeTool<{ mode: string; focusedOptionId?: string }>(
      adapter,
      'sift_set_view',
      { caseId: 'case-1', mode: 'list', focusedOptionId: 'opt-1' },
    );

    expect(result.ok).toBe(true);
    expect(result.ui.changed).toBe(true);
    expect(result.data).toEqual({ mode: 'list', focusedOptionId: 'opt-1' });
    expect(result.sequence).toBe(7);
    // No CommandReceipt was ever produced -- this tool never reached
    // SiftCommands at all, so there is no commandId to report.
    expect(result.commandId).toBeUndefined();
    expectNoCommandsCalled(commands);
  });

  it('a later sift_get_case_context call reflects the view set this session', async () => {
    const caseState = buildFixtureCaseState();
    const { adapter } = await setUpWithActiveCase('case-1', { getActiveCase: () => caseState });

    await invokeTool(adapter, 'sift_set_view', { caseId: 'case-1', mode: 'board' });
    const result = await invokeTool<{ view: { mode: string } | null }>(
      adapter,
      'sift_get_case_context',
      {},
    );

    expect(result.data?.view).toEqual({ mode: 'board' });
  });

  it('resets to no session view (falls back to CaseState.view) once the active case changes', async () => {
    const caseState = buildFixtureCaseState();
    const adapter = new InMemoryModelContextAdapter();
    const commands = createFakeSiftCommands();
    const handle = await registerSiftTools({
      adapter,
      commands,
      getActiveCase: () => caseState,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');
    await invokeTool(adapter, 'sift_set_view', { caseId: 'case-1', mode: 'board' });

    await handle.setActiveCase('case-2');
    const result = await invokeTool<{ view: unknown }>(adapter, 'sift_get_case_context', {});

    expect(result.data?.view).toBeNull();
  });

  it('rejects a caseId that is not the active case', async () => {
    const { adapter } = await setUpWithActiveCase('case-1');
    const result = await invokeTool(adapter, 'sift_set_view', {
      caseId: 'some-other-case',
      mode: 'list',
    });
    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
  });

  it('returns VALIDATION when mode is missing', async () => {
    const { adapter } = await setUpWithActiveCase('case-1');
    const result = await invokeTool(adapter, 'sift_set_view', { caseId: 'case-1' });
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
  });
});

describe('sift_configure_comparison (PRESENTATION)', () => {
  it('configures compare fields and switches the view mode to compare', async () => {
    const caseState = buildFixtureCaseState();
    const { adapter } = await setUpWithActiveCase('case-1', { getActiveCase: () => caseState });

    const result = await invokeTool<{
      mode: string;
      compare?: { optionIds: string[] };
      visibleAttributeIds?: string[];
    }>(adapter, 'sift_configure_comparison', {
      caseId: 'case-1',
      optionIds: ['opt-1', 'opt-2'],
      visibleAttributeIds: ['price', 'safety'],
    });

    expect(result.ok).toBe(true);
    expect(result.data?.mode).toBe('compare');
    expect(result.data?.compare).toEqual({ optionIds: ['opt-1', 'opt-2'] });
    expect(result.data?.visibleAttributeIds).toEqual(['price', 'safety']);
  });

  it('returns VALIDATION when no configurable field is provided (a no-op call is rejected, not silently accepted)', async () => {
    const { adapter } = await setUpWithActiveCase('case-1');
    const result = await invokeTool(adapter, 'sift_configure_comparison', { caseId: 'case-1' });
    expect(result.error).toEqual({ code: 'VALIDATION', retryable: false });
  });

  it('CRITICAL (change-set §53/§54): "Show only safety and cargo" changes presentation only -- criteria and the recommendation stay byte-for-byte unchanged, and no SiftCommands method is ever called', async () => {
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
    const caseState = buildFixtureCaseState({
      criteria: originalCriteria,
      recommendation: readyRecommendation,
    });
    const { adapter, commands } = await setUpWithActiveCase('case-1', {
      getActiveCase: () => caseState,
    });

    // "Show only safety and cargo." -- a presentation request, per change-set
    // §54, never "safety and cargo are the only things I care about."
    const result = await invokeTool(adapter, 'sift_configure_comparison', {
      caseId: 'case-1',
      visibleAttributeIds: ['pref.safety', 'car.cargo_volume'],
    });

    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({
      visibleAttributeIds: ['pref.safety', 'car.cargo_volume'],
    });

    // The underlying case object -- the only source of truth this tool was
    // ever given -- was never mutated.
    expect(caseState.criteria).toEqual(originalCriteria);
    expect(caseState.recommendation).toEqual(readyRecommendation);

    // No SiftCommands method (in particular updateCriteria, the one method
    // that actually changes criteria) was ever reached.
    expectNoCommandsCalled(commands);

    // A subsequent read confirms criteria/recommendation are unchanged while
    // the view genuinely did change.
    const context = await invokeTool<{
      criteria: unknown;
      recommendation: unknown;
      view: { visibleAttributeIds?: string[] } | null;
    }>(adapter, 'sift_get_case_context', {});
    expect(context.data?.criteria).toEqual(originalCriteria);
    expect(context.data?.recommendation).toEqual(readyRecommendation);
    expect(context.data?.view?.visibleAttributeIds).toEqual(['pref.safety', 'car.cargo_volume']);
  });

  it('rejects a caseId that is not the active case', async () => {
    const { adapter } = await setUpWithActiveCase('case-1');
    const result = await invokeTool(adapter, 'sift_configure_comparison', {
      caseId: 'some-other-case',
      optionIds: ['opt-1'],
    });
    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
  });
});
