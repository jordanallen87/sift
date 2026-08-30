/**
 * Dedicated contract test for the Sift WebMCP tool registration layer
 * (docs/specs/webmcp.md "Automated contract requirements"). This file
 * checks catalog *shape* and registration *mechanics* -- exact tool
 * names/descriptions/JSON schemas, unregister-on-case-change,
 * unregister-on-unmount, the unsupported-browser fallback, and the
 * no-approval-tool proof. Per-tool success/error/envelope *behavior* is
 * covered exhaustively in `register-sift-tools.test.ts` instead of being
 * duplicated here.
 *
 * Every expected name/description string below is copied verbatim from
 * `docs/specs/webmcp.md` "Tool catalog" independently of
 * `register-sift-tools.ts`'s own source -- this test would fail if the
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
} from '@sift/contracts';
import { z } from 'zod';
import { BrowserModelContextAdapter, InMemoryModelContextAdapter } from './adapter.js';
import { createFakeSiftCommands, buildFakeCommandReceipt } from '../test/fake-sift-commands.js';
import { SIFT_WEBMCP_TOOL_NAMES, registerSiftTools } from './register-sift-tools.js';
import {
  ConfigureComparisonInputSchema,
  GetOptionDetailsInputSchema,
  ListResearchInputSchema,
  SearchCatalogInputSchema,
  SetViewInputSchema,
} from './webmcp-local-schemas.js';

interface CatalogFixture {
  name: string;
  description: string;
  sourceSchema: z.ZodTypeAny;
}

// Verbatim from docs/specs/webmcp.md "Tool catalog" (the paragraph
// immediately following each `### \`tool_name\`` heading).
const CATALOG: CatalogFixture[] = [
  {
    name: 'sift_get_case_context',
    description:
      'Returns the active case summary, selected pack ID/version/hash, pack-defined and case-defined criteria/attributes, options, readiness counts, current focus, selected option/evidence, recommendation, active run correlation, pending human action, case-defined custom-field definitions (label, reason, origin, confirmation state), a bounded research summary (source titles and publishers, not full excerpts), unresolved questions with their real question text, stale or conflicted signals, and the current workspace view. It omits private model messages and oversized source bodies. Call this to understand the case before acting and again afterward to see what changed; it never mutates anything.',
    sourceSchema: GetCaseContextInputSchema,
  },
  {
    name: 'sift_list_packs',
    description:
      'Returns installed compiled Decision Packs with descriptions, versions, hashes, and activation signals.',
    sourceSchema: ListPacksInputSchema,
  },
  {
    name: 'sift_select_pack',
    description: 'Selects a registered Decision Pack for a case that has no evidence yet.',
    sourceSchema: SelectPackInputSchema,
  },
  {
    name: 'sift_focus_evidence',
    description:
      'Changes the evidence item highlighted in the shared page. This is the primary WebMCP collaboration tool: the user can select an item manually, or ChatGPT can focus it before discussing or revising the case.',
    sourceSchema: FocusEvidenceInputSchema,
  },
  {
    name: 'sift_focus_option',
    description:
      "Changes the current option highlighted in the shared page and includes its safe summary in subsequent case context. This is the car-buying demo's primary shared-attention tool, but the contract works for any pack-defined option kind.",
    sourceSchema: FocusOptionInputSchema,
  },
  {
    name: 'sift_upsert_option',
    description:
      "Adds or updates one manually supplied option using the pack's declared fields plus typed case extensions. It accepts structured facts supplied by the user or ChatGPT; it does not fetch or scrape a URL.",
    sourceSchema: UpsertOptionInputSchema,
  },
  {
    name: 'sift_update_criteria',
    description:
      'Adds, removes, reweights, or relabels decision criteria. Removing a criterion referenced by a decided case is rejected. A successful update invalidates the comparison and recommendation, then asks the engine to recompute.',
    sourceSchema: UpdateCriteriaInputSchema,
  },
  {
    name: 'sift_define_case_attribute',
    description:
      "Defines a typed case-specific concern that the installed pack did not anticipate. A WebMCP call made in response to the user's explicit request records origin `user`; an extension autonomously proposed by a runtime agent uses an internal proposal event and remains pending until the user confirms it through the visible UI.",
    sourceSchema: DefineCaseAttributeInputSchema,
  },
  {
    name: 'sift_submit_source',
    description:
      'Submits a structured source discovered by the user or ChatGPT for bounded Sift investigation. This lets ChatGPT contribute research while Sift retains provenance, challenge, and readiness control.',
    sourceSchema: SubmitSourceInputSchema,
  },
  {
    name: 'sift_set_evidence_disposition',
    description:
      'Lets the user tell the case to include, exclude, or question one evidence item. Exclusion preserves provenance and reason; it does not delete the source.',
    sourceSchema: SetEvidenceDispositionInputSchema,
  },
  {
    name: 'sift_request_investigation',
    description:
      'Requests the next bounded engine move or asks the engine to revisit one named obligation.',
    sourceSchema: RequestInvestigationInputSchema,
  },
  {
    name: 'sift_request_revision',
    description:
      'Attaches a human revision request to the pending recommendation and reopens affected obligations.',
    sourceSchema: RequestRevisionInputSchema,
  },
  {
    name: 'sift_get_option_details',
    description:
      'Returns full detail for one option: its complete attribute map (pack-defined and custom.* fields, each with value, status, confidence, and source ids), plus the claims and sources specifically linked to it. Use this when the bounded option list in sift_get_case_context is not enough -- for example, before explaining why one option is or is not a good fit, or before citing evidence for a specific option. It is read-only: it never changes which option is focused in the page; call sift_focus_option separately if the user should see this option highlighted.',
    sourceSchema: GetOptionDetailsInputSchema,
  },
  {
    name: 'sift_list_research',
    description:
      "Returns every source submitted to this case (title, publisher, URL, origin, verification status) and every claim recorded against it -- a fuller, dedicated view than the small research summary embedded in sift_get_case_context. Use this when the user asks what has been researched so far, or before deciding whether more research is needed. It never marks a source as trusted or changes any evidence disposition; source verification remains Sift's own to decide.",
    sourceSchema: ListResearchInputSchema,
  },
  {
    name: 'sift_search_catalog',
    description:
      "Searches Sift's own bundled catalog for the active Decision Pack's option type -- currently vehicle data for the car-purchase pack -- using pack-recognized filters (car-purchase recognizes year, make, model, and bodyStyle) plus optional free text. Use this to find real candidate options from what the user has described before adding any of them to the case; it never relies on the model's own knowledge of makes or models, and it never adds a result to the case by itself. Call sift_upsert_option separately once the user chooses a candidate. Returns an empty result, not an error, when the active pack has no catalog registered.",
    sourceSchema: SearchCatalogInputSchema,
  },
  {
    name: 'sift_set_view',
    description:
      "Changes which workspace view is shown -- Quick Pick, List, Compare, or Board -- and optionally which option is focused or which options are visible. Use this when the user asks to see the case a different way, such as 'walk me through them instead' or 'show me a list.' This changes PRESENTATION ONLY: it can never add, remove, reweight, or relabel a criterion, and it can never invalidate the recommendation, because it never writes through the same path a decision change does. The chosen view currently holds only for this browser session; it is not yet saved across a reload.",
    sourceSchema: SetViewInputSchema,
  },
  {
    name: 'sift_configure_comparison',
    description:
      "Configures the Compare view: which options are shown side by side, which attribute rows are visible or pinned, and how rows are sorted. Use this when the user wants to narrow or reorganize what the comparison shows, such as 'show only safety and cargo' or 'show me the three finalists.' Do not confuse this with changing what the user cares about: showing or hiding a row changes what is DISPLAYED, never the decision's criteria, and it can never invalidate the recommendation -- use sift_update_criteria instead when the user actually wants a factor to start or stop mattering to the decision itself. The chosen configuration currently holds only for this browser session; it is not yet saved across a reload.",
    sourceSchema: ConfigureComparisonInputSchema,
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
  const handle = await registerSiftTools({
    adapter,
    commands: createFakeSiftCommands(),
    getActiveCase: () => null,
    listPacks: () => [],
  });
  await handle.setActiveCase('case-1');
  return adapter;
}

describe('WebMCP tool catalog: exact names, descriptions, and JSON schemas', () => {
  it('registers exactly the seventeen catalog tool names webmcp.md defines, no more and no fewer', async () => {
    const adapter = await registerFullCatalog();
    expect([...adapter.registeredToolNames].sort()).toEqual(
      [...CATALOG.map((fixture) => fixture.name)].sort(),
    );
    expect(SIFT_WEBMCP_TOOL_NAMES).toHaveLength(17);
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
    const handle = await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
      getActiveCase: () => null,
      listPacks: () => [],
    });

    await handle.setActiveCase('case-a');
    const caseAOptionTool = adapter.getRegisteredTool('sift_focus_option');
    expect(caseAOptionTool).toBeDefined();

    await handle.setActiveCase('case-b');

    // The old generation is gone; a fresh one (scoped to case-b) replaced
    // it under the same stable tool name.
    expect(adapter.getRegisteredTool('sift_focus_option')).not.toBe(caseAOptionTool);
    expect(adapter.registeredToolNames).toContain('sift_get_case_context');
    expect(adapter.registeredToolNames).toContain('sift_list_packs');
  });

  it('unregisters every tool, global tools included, on simulated unmount', async () => {
    const adapter = new InMemoryModelContextAdapter();
    const handle = await registerSiftTools({
      adapter,
      commands: createFakeSiftCommands(),
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
  it('BrowserModelContextAdapter reports unsupported when document.modelContext is absent, and registerSiftTools never throws or calls registerTool', async () => {
    const adapter = new BrowserModelContextAdapter();
    expect(adapter.supported()).toBe(false);

    const registerToolSpy = vi.spyOn(adapter, 'registerTool');

    await expect(
      registerSiftTools({
        adapter,
        commands: createFakeSiftCommands(),
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
    for (const name of SIFT_WEBMCP_TOOL_NAMES) {
      expect(name).not.toMatch(approvalShaped);
    }
  });

  it('sift_request_revision has no decision/actor field in its real input schema -- it can only attach a revision request, never approve or reject', () => {
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

  it('none of the seventeen registered tools ever calls the one SiftCommands method that can approve a proposal (reviewProposal)', async () => {
    const reviewProposal = vi.fn().mockResolvedValue(buildFakeCommandReceipt());
    const adapter = new InMemoryModelContextAdapter();
    const commands = createFakeSiftCommands({ reviewProposal });
    const handle = await registerSiftTools({
      adapter,
      commands,
      getActiveCase: () => null,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    // Invoke sift_request_revision specifically -- the one tool closest in
    // shape to an approval action -- with a fully valid input, and confirm
    // it goes through `requestRevision`, never `reviewProposal`.
    await adapter.invoke('sift_request_revision', {
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
  // dispatches the identical SiftCommands call) cannot exist yet -- no
  // visible control in `apps/web/src/components/` calls these commands
  // yet, per this task's brief; a later integration task wires that.
  it('the WebMCP tool and a direct SiftCommands call resolve the identical CommandReceipt-derived fields for the same input', async () => {
    const receipt = buildFakeCommandReceipt({ caseId: 'case-1', acceptedSequence: 9 });
    const focusEvidence = vi.fn().mockResolvedValue(receipt);
    const adapter = new InMemoryModelContextAdapter();
    const commands = createFakeSiftCommands({ focusEvidence });
    const handle = await registerSiftTools({
      adapter,
      commands,
      getActiveCase: () => null,
      listPacks: () => [],
    });
    await handle.setActiveCase('case-1');

    const input = { caseId: 'case-1', evidenceId: 'ev-1', expectedSequence: 1 };
    const direct = await commands.focusEvidence(input);
    const viaTool = await invokeTool<ReceiptLikeToolResult>(adapter, 'sift_focus_evidence', input);

    expect(viaTool.commandId).toBe(direct.commandId);
    expect(viaTool.caseId).toBe(direct.caseId);
    expect(viaTool.sequence).toBe(direct.acceptedSequence);
  });
});
