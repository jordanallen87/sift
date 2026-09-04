/**
 * Behavioral tests for the two notes-and-research WebMCP tools this task
 * adds (`sift_list_notes`, `sift_add_note`; docs/change-sets/2026-08-30-
 * generic-decision-workspace.md §28 "Notes" / §29 "WebMCP should be able to
 * add research and notes"). A new sibling file rather than an addition to
 * `register-sift-tools.test.ts`/`register-sift-tools-new-tools.test.ts`,
 * matching those files' own established precedent (see either file's header
 * comment) for adding a tool's dedicated coverage as its own file.
 *
 * `sift_add_note`'s shared-plumbing coverage (success envelope carrying
 * `options.origin: 'webmcp'`, rejecting a non-active caseId, VALIDATION on
 * malformed input) lives in `register-sift-tools.test.ts`'s
 * `CASE_TOOL_FIXTURES` table instead of being duplicated here -- this file
 * only covers what is genuinely specific to notes.
 *
 * The central correctness proof this file exists to carry (docs/engineering-principles.md "notes
 * never auto-promote to evidence" / this task's own brief constraint 4):
 * adding a note through the WebMCP tool path must never satisfy an
 * obligation, change readiness, or invalidate a recommendation. The
 * DEEP version of that proof -- that `CommandService.addNote`'s own reducer
 * path never touches `obligations`/`recommendation` -- already lives in
 * `apps/agent/src/services/command-service.test.ts` ("never touches
 * obligations, readiness, or a ready recommendation"), outside this task's
 * file ownership. What this file proves at the WebMCP registration boundary
 * is the honest complement: the tool calls `commands.addNote` and ONLY
 * `commands.addNote` (never any obligation/evidence/recommendation-touching
 * `SiftCommands` method), and faithfully relays whatever `obligations`/
 * `recommendation` the server-reported receipt snapshot carries, without
 * this registration layer doing anything extra to them -- the identical
 * "reaches exactly one command, structurally cannot reach any other" style
 * of proof `register-sift-tools-new-tools.test.ts` already uses for the
 * PRESENTATION-group tools (`sift_set_view`/`sift_configure_comparison`/
 * `sift_focus_question` reaching `commands.setView` and nothing else).
 */
import { describe, expect, it, vi } from 'vitest';
import type { CaseNote, Recommendation, SiftAddNoteToolInputSchema } from '@sift/contracts';
import type { z } from 'zod';
import type { SiftCommands } from '../api/sift-client.js';
import { buildFakeCommandReceipt, createFakeSiftCommands } from '../test/fake-sift-commands.js';
import { buildFixtureCaseState, buildFixtureObligation } from '../test/fixtures.js';
import { InMemoryModelContextAdapter } from './adapter.js';
import { registerSiftTools } from './register-sift-tools.js';
import type { NoteSummary } from './case-context.js';

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

async function invokeTool<TData = unknown>(
  adapter: InMemoryModelContextAdapter,
  name: string,
  input: unknown,
): Promise<AnyToolResult<TData>> {
  return adapter.invoke<unknown, AnyToolResult<TData>>(name, input);
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

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

function buildNote(overrides: Partial<CaseNote> = {}): CaseNote {
  return {
    id: 'note-1',
    body: 'The seat position felt wrong on the test drive.',
    kind: 'observation',
    origin: 'user',
    authoredBy: 'user',
    optionIds: [],
    sourceIds: [],
    createdAt: FIXED_TIMESTAMP,
    ...overrides,
  };
}

describe('sift_list_notes', () => {
  it('reports no active case honestly when getActiveCase() has no snapshot yet, without inventing data', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const handle = await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => null,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    const result = await invokeTool(adapter, 'sift_list_notes', { caseId: 'case-1' });

    expect(result).toEqual({
      ok: true,
      message: 'No case is currently active.',
      ui: { changed: false },
    });
  });

  it('returns every note, most-recently-added first, when the case has notes', async () => {
    const caseState = buildFixtureCaseState({
      id: 'case-1',
      notes: [
        buildNote({ id: 'note-1', body: 'First.' }),
        buildNote({ id: 'note-2', body: 'Second.' }),
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

    const result = await invokeTool<{ notes: { items: NoteSummary[]; total: number } }>(
      adapter,
      'sift_list_notes',
      { caseId: 'case-1' },
    );

    expect(result.ok).toBe(true);
    expect(result.data?.notes.items.map((n) => n.id)).toEqual(['note-2', 'note-1']);
    expect(result.data?.notes.total).toBe(2);
    expect(result.ui.changed).toBe(false);
  });

  it('returns an empty (not missing) notes list when the case has no notes field at all', async () => {
    const caseState = buildFixtureCaseState({ id: 'case-1' });
    expect(caseState.notes).toBeUndefined();
    const adapter = new InMemoryModelContextAdapter();
    const handle = await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => caseState,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    const result = await invokeTool<{ notes: { items: NoteSummary[]; total: number } }>(
      adapter,
      'sift_list_notes',
      { caseId: 'case-1' },
    );

    expect(result.ok).toBe(true);
    expect(result.data?.notes.items).toEqual([]);
    expect(result.data?.notes.total).toBe(0);
  });

  it('rejects a caseId that is not the active case, without reading any case state', async () => {
    const { adapter } = await setUpWithActiveCase('case-1');
    const result = await invokeTool(adapter, 'sift_list_notes', { caseId: 'some-other-case' });
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'NOT_FOUND', retryable: false });
  });
});

describe('sift_add_note: honest, provenance-bearing write; never touches obligations/readiness/recommendation', () => {
  it('carries a note draft (kind, optionIds, obligationId, sourceIds) through to commands.addNote unchanged', async () => {
    const addNote = vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
    const { adapter } = await setUpWithActiveCase('case-1', { addNote });

    const input: z.infer<typeof SiftAddNoteToolInputSchema> = {
      caseId: 'case-1',
      expectedSequence: 1,
      origin: 'user',
      note: {
        body: 'Dealer said the timing belt was done at 90k.',
        kind: 'research',
        optionIds: ['opt-1'],
        obligationId: 'obl-1',
        sourceIds: ['src-1'],
      },
    };
    await invokeTool(adapter, 'sift_add_note', input);

    expect(addNote).toHaveBeenCalledWith(input, { origin: 'webmcp' });
  });

  it('reaches commands.addNote and ONLY commands.addNote -- never a SiftCommands method that could satisfy an obligation, invalidate a recommendation, or approve a decision', async () => {
    const addNote = vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
    const updateCriteria = vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
    const setEvidenceDisposition = vi
      .fn()
      .mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
    const reviewProposal = vi.fn().mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
    const requestInvestigation = vi
      .fn()
      .mockResolvedValue(buildFakeCommandReceipt({ caseId: 'case-1' }));
    const { adapter } = await setUpWithActiveCase('case-1', {
      addNote,
      updateCriteria,
      setEvidenceDisposition,
      reviewProposal,
      requestInvestigation,
    });

    await invokeTool(adapter, 'sift_add_note', {
      caseId: 'case-1',
      expectedSequence: 1,
      note: { body: 'Need to check this Saturday.' },
    });

    expect(addNote).toHaveBeenCalledTimes(1);
    expect(updateCriteria).not.toHaveBeenCalled();
    expect(setEvidenceDisposition).not.toHaveBeenCalled();
    expect(reviewProposal).not.toHaveBeenCalled();
    expect(requestInvestigation).not.toHaveBeenCalled();
  });

  it('relays the receipt snapshot faithfully -- a case with an open required obligation and a ready recommendation reports both UNCHANGED after adding a note (constraint: adding a note must not satisfy an obligation, change readiness, or invalidate a recommendation)', async () => {
    const openObligation = buildFixtureObligation({
      id: 'obl-1',
      required: true,
      status: 'open',
    });
    const readyRecommendation: Recommendation = {
      id: 'rec-1',
      status: 'ready',
      favoredOptionId: null,
      rationale: 'because',
      facts: [],
      hypotheses: [],
      confidence: 0.5,
      limitations: [],
      sourceIds: [],
      resolvedObligationIds: [],
      acceptedUncertaintyObligationIds: [],
      generatedAt: FIXED_TIMESTAMP,
    };
    const beforeState = buildFixtureCaseState({
      id: 'case-1',
      obligations: [openObligation],
      recommendation: readyRecommendation,
    });
    // The snapshot a real `CommandService.addNote` would return: the note
    // appended, obligations/recommendation byte-for-byte the same as before
    // (this is exactly what apps/agent's own command-service.test.ts proves
    // the real reducer does -- this fake only needs to relay it honestly).
    const afterState = { ...beforeState, notes: [buildNote()], eventSequence: 2 };
    const addNote = vi
      .fn()
      .mockResolvedValue(
        buildFakeCommandReceipt({ caseId: 'case-1', acceptedSequence: 2, snapshot: afterState }),
      );
    const { adapter } = await setUpWithActiveCase('case-1', { addNote });

    const result = await invokeTool<typeof afterState>(adapter, 'sift_add_note', {
      caseId: 'case-1',
      expectedSequence: 1,
      note: { body: 'Dealer said they may waive the package.' },
    });

    expect(result.ok).toBe(true);
    expect(result.data?.obligations).toEqual([openObligation]);
    expect(result.data?.recommendation).toEqual(readyRecommendation);
    expect(result.data?.notes).toHaveLength(1);
  });
});
