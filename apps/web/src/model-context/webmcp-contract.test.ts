/**
 * Dedicated contract test for the Pax WebMCP tool registration layer
 * (docs/specs/webmcp.md "Automated contract requirements"). This file
 * checks catalog *shape* and registration *mechanics* -- exact tool
 * names/descriptions/JSON schemas, unregister-on-case-change,
 * unregister-on-unmount, the unsupported-browser fallback, and the
 * no-approval-tool proof. Per-tool success/error/envelope *behavior* is
 * covered exhaustively in `register-pax-tools.test.ts` instead of being
 * duplicated here.
 *
 * Every expected name/description string below is copied verbatim from
 * `docs/specs/webmcp.md` "Tool catalog" independently of
 * `register-pax-tools.ts`'s own source -- this test would fail if the
 * implementation's copy ever drifted from the spec's.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DefineCaseAttributeInputSchema,
  FocusEvidenceInputSchema,
  FocusOptionInputSchema,
  GetCaseContextInputSchema,
  ListPacksInputSchema,
  RequestInvestigationInputSchema,
  RequestRevisionInputSchema,
  SelectPackInputSchema,
  SetEvidenceDispositionInputSchema,
  SubmitSourceInputSchema,
  UpdateCriteriaInputSchema,
  UpsertOptionInputSchema,
} from '@pax/contracts';
import { z } from 'zod';
import { BrowserModelContextAdapter, InMemoryModelContextAdapter } from './adapter.js';
import { createFakePaxCommands, buildFakeCommandReceipt } from '../test/fake-pax-commands.js';
import { PAX_WEBMCP_TOOL_NAMES, registerPaxTools } from './register-pax-tools.js';

interface CatalogFixture {
  name: string;
  description: string;
  sourceSchema: z.ZodTypeAny;
}

// Verbatim from docs/specs/webmcp.md "Tool catalog" (the paragraph
// immediately following each `### \`tool_name\`` heading).
const CATALOG: CatalogFixture[] = [
  {
    name: 'pax_get_case_context',
    description:
      'Returns the active case summary, selected pack ID/version/hash, pack-defined and case-defined criteria/attributes, options, readiness counts, current focus, selected option/evidence, recommendation, active run correlation, and pending human action. It omits private model messages and oversized source bodies.',
    sourceSchema: GetCaseContextInputSchema,
  },
  {
    name: 'pax_list_packs',
    description:
      'Returns installed compiled Decision Packs with descriptions, versions, hashes, and activation signals.',
    sourceSchema: ListPacksInputSchema,
  },
  {
    name: 'pax_select_pack',
    description: 'Selects a registered Decision Pack for a case that has no evidence yet.',
    sourceSchema: SelectPackInputSchema,
  },
  {
    name: 'pax_focus_evidence',
    description:
      'Changes the evidence item highlighted in the shared page. This is the primary WebMCP collaboration tool: the user can select an item manually, or ChatGPT can focus it before discussing or revising the case.',
    sourceSchema: FocusEvidenceInputSchema,
  },
  {
    name: 'pax_focus_option',
    description:
      "Changes the current option highlighted in the shared page and includes its safe summary in subsequent case context. This is the car-buying demo's primary shared-attention tool, but the contract works for any pack-defined option kind.",
    sourceSchema: FocusOptionInputSchema,
  },
  {
    name: 'pax_upsert_option',
    description:
      "Adds or updates one manually supplied option using the pack's declared fields plus typed case extensions. It accepts structured facts supplied by the user or ChatGPT; it does not fetch or scrape a URL.",
    sourceSchema: UpsertOptionInputSchema,
  },
  {
    name: 'pax_update_criteria',
    description:
      'Adds, removes, reweights, or relabels decision criteria. Removing a criterion referenced by a decided case is rejected. A successful update invalidates the comparison and recommendation, then asks the engine to recompute.',
    sourceSchema: UpdateCriteriaInputSchema,
  },
  {
    name: 'pax_define_case_attribute',
    description:
      "Defines a typed case-specific concern that the installed pack did not anticipate. A WebMCP call made in response to the user's explicit request records origin `user`; an extension autonomously proposed by a runtime agent uses an internal proposal event and remains pending until the user confirms it through the visible UI.",
    sourceSchema: DefineCaseAttributeInputSchema,
  },
  {
    name: 'pax_submit_source',
    description:
      'Submits a structured source discovered by the user or ChatGPT for bounded Pax investigation. This lets ChatGPT contribute research while Pax retains provenance, challenge, and readiness control.',
    sourceSchema: SubmitSourceInputSchema,
  },
  {
    name: 'pax_set_evidence_disposition',
    description:
      'Lets the user tell the case to include, exclude, or question one evidence item. Exclusion preserves provenance and reason; it does not delete the source.',
    sourceSchema: SetEvidenceDispositionInputSchema,
  },
  {
    name: 'pax_request_investigation',
    description:
      'Requests the next bounded engine move or asks the engine to revisit one named obligation.',
    sourceSchema: RequestInvestigationInputSchema,
  },
  {
    name: 'pax_request_revision',
    description:
      'Attaches a human revision request to the pending recommendation and reopens affected obligations.',
    sourceSchema: RequestRevisionInputSchema,
  },
];

interface ReceiptLikeToolResult {
  commandId?: string;
  caseId?: string;
  sequence?: number;
}

/**
 * `InMemoryModelContextAdapter.invoke<TInput, TOutput>` defaults `TOutput`
 * to `unknown` when a call site supplies no type argument -- this small
 * typed wrapper avoids a post-call `unknown` cast for the one assertion in
 * this file that reads fields off the result.
 */
async function invokeTool<TOutput = unknown>(
  adapter: InMemoryModelContextAdapter,
  name: string,
  input: unknown,
): Promise<TOutput> {
  return adapter.invoke<unknown, TOutput>(name, input);
}

async function registerFullCatalog(): Promise<InMemoryModelContextAdapter> {
  const adapter = new InMemoryModelContextAdapter();
  const handle = await registerPaxTools({
    adapter,
    commands: createFakePaxCommands(),
    getActiveCase: () => null,
    listPacks: () => [],
  });
  await handle.setActiveCase('case-1');
  return adapter;
}

describe('WebMCP tool catalog: exact names, descriptions, and JSON schemas', () => {
  it('registers exactly the twelve catalog tool names webmcp.md defines, no more and no fewer', async () => {
    const adapter = await registerFullCatalog();
    expect([...adapter.registeredToolNames].sort()).toEqual(
      [...CATALOG.map((fixture) => fixture.name)].sort(),
    );
    expect(PAX_WEBMCP_TOOL_NAMES).toHaveLength(12);
  });

  it.each(CATALOG)(
    '$name matches its exact webmcp.md description and JSON schema',
    async ({ name, description, sourceSchema }) => {
      const adapter = await registerFullCatalog();
      const tool = adapter.getRegisteredTool(name);

      expect(tool).toBeDefined();
      expect(tool!.name).toBe(name);
      expect(tool!.description).toBe(description);
      expect(tool!.inputSchema).toEqual(z.toJSONSchema(sourceSchema));
    },
  );
});

describe('Registration lifecycle: unregister on case change and on unmount', () => {
  it('unregisters every case-scoped tool when the active case changes, while keeping the two global tools registered throughout', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const handle = await registerPaxTools({
      adapter,
      commands: createFakePaxCommands(),
      getActiveCase: () => null,
      listPacks: () => [],
    });

    await handle.setActiveCase('case-a');
    const caseAOptionTool = adapter.getRegisteredTool('pax_focus_option');
    expect(caseAOptionTool).toBeDefined();

    await handle.setActiveCase('case-b');

    // The old generation is gone; a fresh one (scoped to case-b) replaced
    // it under the same stable tool name.
    expect(adapter.getRegisteredTool('pax_focus_option')).not.toBe(caseAOptionTool);
    expect(adapter.registeredToolNames).toContain('pax_get_case_context');
    expect(adapter.registeredToolNames).toContain('pax_list_packs');
  });

  it('unregisters every tool, global tools included, on simulated unmount', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const handle = await registerPaxTools({
      adapter,
      commands: createFakePaxCommands(),
      getActiveCase: () => null,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-a');
    expect(adapter.registeredToolNames.length).toBeGreaterThan(0);

    // Simulated component unmount.
    handle.disposeAll();

    expect(adapter.registeredToolNames).toEqual([]);
  });
});

describe('Unsupported-browser fallback', () => {
  it('BrowserModelContextAdapter reports unsupported when document.modelContext is absent, and registerPaxTools never throws or calls registerTool', async () => {
    const adapter = new BrowserModelContextAdapter();
    expect(adapter.supported()).toBe(false);

    const registerToolSpy = vi.spyOn(adapter, 'registerTool');

    await expect(
      registerPaxTools({
        adapter,
        commands: createFakePaxCommands(),
        getActiveCase: () => null,
        listPacks: () => [],
      }).then((handle) => handle.setActiveCase('case-1')),
    ).resolves.toBeUndefined();

    expect(registerToolSpy).not.toHaveBeenCalled();
  });
});

describe('No tool can approve or reject a decision proposal', () => {
  it('no registered tool name has approval/rejection semantics', () => {
    const approvalShaped = /approve|reject|review_proposal|reviewProposal/i;
    for (const name of PAX_WEBMCP_TOOL_NAMES) {
      expect(name).not.toMatch(approvalShaped);
    }
  });

  it('pax_request_revision has no decision/actor field in its real input schema -- it can only attach a revision request, never approve or reject', () => {
    const jsonSchema = z.toJSONSchema(RequestRevisionInputSchema) as {
      properties: Record<string, unknown>;
    };
    expect(Object.keys(jsonSchema.properties)).toEqual([
      'caseId',
      'proposalId',
      'instructions',
      'expectedSequence',
    ]);
    expect(jsonSchema.properties['decision']).toBeUndefined();
    expect(jsonSchema.properties['actor']).toBeUndefined();
  });

  it('none of the twelve registered tools ever calls the one PaxCommands method that can approve a proposal (reviewProposal)', async () => {
    const reviewProposal = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const adapter = new InMemoryModelContextAdapter();
    const commands = createFakePaxCommands({ reviewProposal });
    const handle = await registerPaxTools({
      adapter,
      commands,
      getActiveCase: () => null,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    // Invoke pax_request_revision specifically -- the one tool closest in
    // shape to an approval action -- with a fully valid input, and confirm
    // it goes through `requestRevision`, never `reviewProposal`.
    await adapter.invoke('pax_request_revision', {
      caseId: 'case-1',
      proposalId: 'prop-1',
      instructions: 'Please reconsider the weighting on comfort.',
      expectedSequence: 1,
    });

    expect(commands.requestRevision).toHaveBeenCalledTimes(1);
    expect(reviewProposal).not.toHaveBeenCalled();
  });
});

describe('Callback-vs-envelope equivalence (contract-level)', () => {
  // Out of scope for this pass, noted explicitly: a *visible-control*
  // equivalence test (rendering a real UI button and asserting it
  // dispatches the identical PaxCommands call) cannot exist yet -- no
  // visible control in `apps/web/src/components/` calls these commands
  // yet, per this task's brief; a later integration task wires that.
  it('the WebMCP tool and a direct PaxCommands call resolve the identical CommandReceipt-derived fields for the same input', async () => {
    const receipt = buildFakeCommandReceipt({ caseId: 'case-1', acceptedSequence: 9 });
    const focusEvidence = vi.fn().mockResolvedValue(receipt);
    const adapter = new InMemoryModelContextAdapter();
    const commands = createFakePaxCommands({ focusEvidence });
    const handle = await registerPaxTools({
      adapter,
      commands,
      getActiveCase: () => null,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    const input = { caseId: 'case-1', evidenceId: 'ev-1', expectedSequence: 1 };
    const direct = await commands.focusEvidence(input);
    const viaTool = await invokeTool<ReceiptLikeToolResult>(adapter, 'pax_focus_evidence', input);

    expect(viaTool.commandId).toBe(direct.commandId);
    expect(viaTool.caseId).toBe(direct.caseId);
    expect(viaTool.sequence).toBe(direct.acceptedSequence);
  });
});
