/**
 * Registers the full imperative WebMCP tool catalog (docs/specs/webmcp.md
 * "Tool catalog") against a `ModelContextAdapter`. Every command-backed
 * tool's `execute` calls through the exact same `SiftCommands` client
 * visible controls will later use (CLAUDE.md "Non-negotiable product
 * truths": "Visible UI controls and WebMCP callbacks use the same command
 * implementation") -- there is no parallel fetch path anywhere in this
 * module for any WRITE/EXECUTION tool.
 *
 * The two global read-only tools (`sift_get_case_context`, `sift_list_packs`)
 * and the three case-scoped read tools this task adds
 * (`sift_get_option_details`, `sift_list_research`, `sift_search_catalog`)
 * are the deliberate exception: `SiftCommands`
 * (`apps/web/src/api/sift-client.ts`) only covers the architecture.md
 * "Shared command client" interface -- it has no query methods at all.
 * Rather than inventing an ad hoc `fetch` for routes outside this task's
 * scope, `registerSiftTools` takes `getActiveCase`/`listPacks` as *injected
 * data accessors* (a later integration task backs `getActiveCase` with
 * live, SSE-updated case state); the catalog-search tools default to the
 * real `GET /api/catalog/*` HTTP boundary (`catalog-search-adapter.ts`,
 * `../api/catalog-client.ts`) but stay swappable via the optional
 * `catalogAdapters` option for the same reason.
 *
 * The two presentation tools this task adds (`sift_set_view`,
 * `sift_configure_comparison`) are a THIRD kind of exception, and it is
 * flagged loudly rather than papered over: ADR 0005 already adds
 * `WorkspaceViewState`/`SelectionPatch.view` at the contract and
 * `CaseStore` layers, and ADR 0006 decision 3 specifies that a presentation
 * tool's implementation reach only `updateSelection()` -- but no
 * `CommandService` handler and no `SiftCommands` method exist yet to reach
 * that store method for `view` (confirmed directly: zero references to
 * `.view`/`setView`/`updateView` anywhere in
 * `apps/agent/src/services/command-service.ts`). Wiring that backend
 * command is outside this task's file ownership
 * (`apps/agent/**`/`packages/**` are both out of scope). Rather than
 * fabricating a call to a command that would 404 in production, these two
 * tools hold `WorkspaceViewState` in ordinary in-memory session state, owned
 * by this module and reset whenever the active case changes. This is
 * genuinely functional within one browser session (a `sift_get_case_context`
 * call after `sift_set_view` reflects the change) and, crucially, is
 * structurally incapable of reaching `append()`/invalidating a
 * recommendation, since it never calls a `SiftCommands` method at all -- but
 * it does NOT persist across a reload or sync to another viewer. Both tool
 * descriptions say this plainly. Once a real `SiftCommands` method for
 * `view` exists, these two builders should be rewritten as
 * `buildCaseScopedCommandTool` calls exactly like every other tool below,
 * and this comment (and the one on `sessionView` further down) should be
 * deleted.
 *
 * Registration lifecycle (docs/specs/webmcp.md "Registration lifecycle"):
 * `registerSiftTools` registers the global read tools once, under one
 * `AbortController` that only `disposeAll()` aborts. The returned handle's
 * `setActiveCase(caseId)` registers (or re-registers) the case-scoped tools
 * under a *fresh* `AbortController` each time, first aborting whichever one
 * it replaces -- so a case change or `setActiveCase(null)` (no active case)
 * always unregisters the previous case's tool generation before anything
 * new is registered under the same stable names. It also resets the
 * in-memory `sessionView` described above, since a view's `focusedOptionId`/
 * `visibleOptionIds` name entities scoped to one specific case.
 */
import type { z } from 'zod';
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
  WorkspaceViewStateSchema,
  type CaseState,
  type CommandReceipt,
  type CompiledDecisionPack,
  type DefineCaseAttributeInput,
  type FocusEvidenceInput,
  type FocusOptionInput,
  type RequestInvestigationInput,
  type RequestRevisionInput,
  type SelectPackInput,
  type SetEvidenceDispositionInput,
  type SubmitSourceInput,
  type UpdateCriteriaInput,
  type UpsertOptionInput,
  type WorkspaceViewState,
} from '@sift/contracts';
import type { SiftCommands } from '../api/sift-client.js';
import type { CatalogClientOptions } from '../api/catalog-client.js';
import type {
  ModelContextAdapter,
  WebMcpToolCallContext,
  WebMcpToolDefinition,
} from './adapter.js';
import {
  buildCaseContextSummary,
  buildOptionDetails,
  buildPackSummary,
  buildResearchSummary,
  type CaseContextSummary,
  type OptionDetailsSummary,
  type PackSummary,
  type ResearchSummary,
} from './case-context.js';
import {
  buildDefaultCatalogAdapters,
  type CatalogAdapter,
  type CatalogSearchOutput,
} from './catalog-search-adapter.js';
import {
  ConfigureComparisonInputSchema,
  GetOptionDetailsInputSchema,
  ListResearchInputSchema,
  SearchCatalogInputSchema,
  SetViewInputSchema,
  type ConfigureComparisonInput,
  type GetOptionDetailsInput,
  type ListResearchInput,
  type SearchCatalogInput,
  type SetViewInput,
} from './webmcp-local-schemas.js';
import {
  mapErrorToEnvelope,
  notActiveCaseEnvelope,
  runAbortable,
  toToolInputSchema,
  validationFailureEnvelope,
  type ToolEnvelope,
  type ToolEnvelopeUi,
} from './tool-support.js';

export const GLOBAL_SIFT_TOOL_NAMES = ['sift_get_case_context', 'sift_list_packs'] as const;

export const CASE_SCOPED_SIFT_TOOL_NAMES = [
  'sift_select_pack',
  'sift_focus_evidence',
  'sift_focus_option',
  'sift_upsert_option',
  'sift_update_criteria',
  'sift_define_case_attribute',
  'sift_submit_source',
  'sift_set_evidence_disposition',
  'sift_request_investigation',
  'sift_request_revision',
  'sift_get_option_details',
  'sift_list_research',
  'sift_search_catalog',
  'sift_set_view',
  'sift_configure_comparison',
] as const;

export const SIFT_WEBMCP_TOOL_NAMES = [
  ...GLOBAL_SIFT_TOOL_NAMES,
  ...CASE_SCOPED_SIFT_TOOL_NAMES,
] as const;
export type SiftWebMcpToolName = (typeof SIFT_WEBMCP_TOOL_NAMES)[number];

// --- Generic case-scoped command tool builder (WRITE / EXECUTION tools) ---

interface CaseScopedCommandToolParams<
  TInput extends { caseId: string },
  TReceipt extends CommandReceipt,
> {
  name: SiftWebMcpToolName;
  description: string;
  inputSchema: z.ZodTypeAny;
  activeCaseId: string;
  call: (input: TInput) => Promise<TReceipt>;
  successMessage: (input: TInput) => string;
  ui: (input: TInput, receipt: TReceipt) => ToolEnvelopeUi;
}

/**
 * Every case-scoped, command-backed tool shares this shape: validate the
 * raw input against the tool's real `@sift/contracts` schema, reject any
 * `caseId` that is not the currently active case, call the one shared
 * `SiftCommands` method, race it against the browser's per-call abort
 * signal, and map the outcome to an honest `SiftToolResult` envelope. No
 * branch here ever reports `ok: true` / `ui.changed: true` unless
 * `call(input)` actually resolved.
 */
function buildCaseScopedCommandTool<
  TInput extends { caseId: string },
  TReceipt extends CommandReceipt,
>(params: CaseScopedCommandToolParams<TInput, TReceipt>): WebMcpToolDefinition {
  const { name, description, inputSchema, activeCaseId, call, successMessage, ui } = params;
  return {
    name,
    description,
    inputSchema: toToolInputSchema(inputSchema),
    execute: async (rawInput: unknown, context?: WebMcpToolCallContext) => {
      const parsed = inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return validationFailureEnvelope();
      }
      // `safeParse` above already checked `rawInput` against `inputSchema`
      // at runtime; this cast reasserts that fact rather than bypassing it
      // (same discipline as `sift-client.ts`'s `validate` helper).
      const input = parsed.data as TInput;

      if (input.caseId !== activeCaseId) {
        return notActiveCaseEnvelope(input.caseId, activeCaseId);
      }

      try {
        const receipt = await runAbortable(() => call(input), context?.signal);
        const envelope: ToolEnvelope<CaseState> = {
          ok: true,
          message: successMessage(input),
          commandId: receipt.commandId,
          caseId: receipt.caseId,
          sequence: receipt.acceptedSequence,
          ui: ui(input, receipt),
        };
        if (receipt.snapshot !== undefined) {
          envelope.data = receipt.snapshot;
        }
        if (receipt.runId !== undefined) {
          envelope.runId = receipt.runId;
        }
        return envelope;
      } catch (error) {
        return mapErrorToEnvelope(error);
      }
    },
  };
}

// --- Generic case-scoped read tool builder (READ tools with a caseId) ---

interface CaseScopedReadToolParams<TInput extends { caseId: string }, TData> {
  name: SiftWebMcpToolName;
  description: string;
  inputSchema: z.ZodTypeAny;
  activeCaseId: string;
  /** Reads (never mutates) and returns a full envelope directly -- unlike the command builder above, a read can honestly report `ok: false` (e.g. `NOT_FOUND` for an unknown option id) without anything having been "called" at all. */
  read: (input: TInput) => ToolEnvelope<TData> | Promise<ToolEnvelope<TData>>;
}

function buildCaseScopedReadTool<TInput extends { caseId: string }, TData>(
  params: CaseScopedReadToolParams<TInput, TData>,
): WebMcpToolDefinition {
  const { name, description, inputSchema, activeCaseId, read } = params;
  return {
    name,
    description,
    inputSchema: toToolInputSchema(inputSchema),
    execute: async (rawInput: unknown, context?: WebMcpToolCallContext) => {
      const parsed = inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return validationFailureEnvelope();
      }
      const input = parsed.data as TInput;

      if (input.caseId !== activeCaseId) {
        return notActiveCaseEnvelope(input.caseId, activeCaseId);
      }

      try {
        return await runAbortable(() => Promise.resolve(read(input)), context?.signal);
      } catch (error) {
        return mapErrorToEnvelope(error);
      }
    },
  };
}

// --- Generic case-scoped presentation tool builder (PRESENTATION tools) ---
//
// See this module's header comment for why these do not yet call a
// `SiftCommands` method. `apply` is a PURE function from validated input to
// the `WorkspaceViewState` fields this call changes -- it never touches
// `criteria`, `recommendation`, or any other decision-relevant field, and it
// has no way to: `WorkspaceViewState` (`@sift/contracts`) has no field that
// could carry one.

interface CaseScopedPresentationToolParams<TInput extends { caseId: string }> {
  name: SiftWebMcpToolName;
  description: string;
  inputSchema: z.ZodTypeAny;
  activeCaseId: string;
  apply: (input: TInput) => Partial<WorkspaceViewState>;
  getActiveCase: () => CaseState | null;
  getSessionView: () => WorkspaceViewState | null;
  setSessionView: (next: WorkspaceViewState) => void;
  successMessage: (input: TInput) => string;
}

/** Merges `patch` onto `previous`, defaulting `mode` only when neither carries one -- `WorkspaceViewStateSchema.mode` is a required field, so a freshly-created view always needs a value for it. */
function mergeWorkspaceView(
  previous: WorkspaceViewState | null,
  patch: Partial<WorkspaceViewState>,
): WorkspaceViewState {
  return WorkspaceViewStateSchema.parse({
    mode: previous?.mode ?? 'list',
    ...previous,
    ...patch,
  });
}

function buildCaseScopedPresentationTool<TInput extends { caseId: string }>(
  params: CaseScopedPresentationToolParams<TInput>,
): WebMcpToolDefinition {
  const {
    name,
    description,
    inputSchema,
    activeCaseId,
    apply,
    getActiveCase,
    getSessionView,
    setSessionView,
    successMessage,
  } = params;
  return {
    name,
    description,
    inputSchema: toToolInputSchema(inputSchema),
    execute: async (rawInput: unknown, context?: WebMcpToolCallContext) => {
      const parsed = inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return validationFailureEnvelope();
      }
      const input = parsed.data as TInput;

      if (input.caseId !== activeCaseId) {
        return notActiveCaseEnvelope(input.caseId, activeCaseId);
      }

      try {
        return await runAbortable(() => {
          const patch = apply(input);
          const merged = mergeWorkspaceView(getSessionView(), patch);
          setSessionView(merged);

          const envelope: ToolEnvelope<WorkspaceViewState> = {
            ok: true,
            message: successMessage(input),
            caseId: activeCaseId,
            data: merged,
            ui: { changed: true },
          };
          const caseState = getActiveCase();
          if (caseState !== null) {
            envelope.sequence = caseState.eventSequence;
          }
          return Promise.resolve(envelope);
        }, context?.signal);
      } catch (error) {
        return mapErrorToEnvelope(error);
      }
    },
  };
}

// --- The ten pre-existing case-scoped command tools (docs/specs/webmcp.md "Tool catalog") ---

function buildSelectPackTool(commands: SiftCommands, activeCaseId: string): WebMcpToolDefinition {
  return buildCaseScopedCommandTool<SelectPackInput, CommandReceipt>({
    name: 'sift_select_pack',
    description: 'Selects a registered Decision Pack for a case that has no evidence yet.',
    inputSchema: SelectPackInputSchema,
    activeCaseId,
    call: (input) => commands.selectPack(input),
    successMessage: (input) =>
      `Decision Pack "${input.packId}" selected for case "${input.caseId}".`,
    ui: () => ({ changed: true }),
  });
}

function buildFocusEvidenceTool(
  commands: SiftCommands,
  activeCaseId: string,
): WebMcpToolDefinition {
  return buildCaseScopedCommandTool<FocusEvidenceInput, CommandReceipt>({
    name: 'sift_focus_evidence',
    description:
      'Changes the evidence item highlighted in the shared page. This is the primary WebMCP collaboration tool: the user can select an item manually, or ChatGPT can focus it before discussing or revising the case.',
    inputSchema: FocusEvidenceInputSchema,
    activeCaseId,
    call: (input) => commands.focusEvidence(input),
    successMessage: (input) => `Evidence "${input.evidenceId}" focused.`,
    ui: (input) => ({ changed: true, focusTarget: input.evidenceId }),
  });
}

function buildFocusOptionTool(commands: SiftCommands, activeCaseId: string): WebMcpToolDefinition {
  return buildCaseScopedCommandTool<FocusOptionInput, CommandReceipt>({
    name: 'sift_focus_option',
    description:
      "Changes the current option highlighted in the shared page and includes its safe summary in subsequent case context. This is the car-buying demo's primary shared-attention tool, but the contract works for any pack-defined option kind.",
    inputSchema: FocusOptionInputSchema,
    activeCaseId,
    call: (input) => commands.focusOption(input),
    successMessage: (input) => `Option "${input.optionId}" focused.`,
    ui: (input) => ({ changed: true, focusTarget: input.optionId }),
  });
}

function buildUpsertOptionTool(commands: SiftCommands, activeCaseId: string): WebMcpToolDefinition {
  return buildCaseScopedCommandTool<UpsertOptionInput, CommandReceipt>({
    name: 'sift_upsert_option',
    description:
      "Adds or updates one manually supplied option using the pack's declared fields plus typed case extensions. It accepts structured facts supplied by the user or ChatGPT; it does not fetch or scrape a URL.",
    inputSchema: UpsertOptionInputSchema,
    activeCaseId,
    call: (input) => commands.upsertOption(input),
    successMessage: (input) => `Option "${input.option.label}" saved.`,
    ui: (input) =>
      input.optionId !== undefined
        ? { changed: true, focusTarget: input.optionId }
        : { changed: true },
  });
}

function buildUpdateCriteriaTool(
  commands: SiftCommands,
  activeCaseId: string,
): WebMcpToolDefinition {
  return buildCaseScopedCommandTool<UpdateCriteriaInput, CommandReceipt>({
    name: 'sift_update_criteria',
    description:
      'Adds, removes, reweights, or relabels decision criteria. Removing a criterion referenced by a decided case is rejected. A successful update invalidates the comparison and recommendation, then asks the engine to recompute.',
    inputSchema: UpdateCriteriaInputSchema,
    activeCaseId,
    call: (input) => commands.updateCriteria(input),
    successMessage: () => 'Criteria updated.',
    ui: () => ({ changed: true }),
  });
}

function buildDefineCaseAttributeTool(
  commands: SiftCommands,
  activeCaseId: string,
): WebMcpToolDefinition {
  return buildCaseScopedCommandTool<DefineCaseAttributeInput, CommandReceipt>({
    name: 'sift_define_case_attribute',
    description:
      "Defines a typed case-specific concern that the installed pack did not anticipate. A WebMCP call made in response to the user's explicit request records origin `user`; an extension autonomously proposed by a runtime agent uses an internal proposal event and remains pending until the user confirms it through the visible UI.",
    inputSchema: DefineCaseAttributeInputSchema,
    activeCaseId,
    call: (input) => commands.defineCaseAttribute(input),
    successMessage: (input) => `Case attribute "${input.definition.id}" defined.`,
    ui: () => ({ changed: true }),
  });
}

function buildSubmitSourceTool(commands: SiftCommands, activeCaseId: string): WebMcpToolDefinition {
  return buildCaseScopedCommandTool<SubmitSourceInput, CommandReceipt>({
    name: 'sift_submit_source',
    description:
      'Submits a structured source discovered by the user or ChatGPT for bounded Sift investigation. This lets ChatGPT contribute research while Sift retains provenance, challenge, and readiness control.',
    inputSchema: SubmitSourceInputSchema,
    activeCaseId,
    call: (input) => commands.submitSource(input),
    successMessage: (input) => `Source "${input.source.title}" submitted for investigation.`,
    ui: () => ({ changed: true }),
  });
}

function buildSetEvidenceDispositionTool(
  commands: SiftCommands,
  activeCaseId: string,
): WebMcpToolDefinition {
  return buildCaseScopedCommandTool<SetEvidenceDispositionInput, CommandReceipt>({
    name: 'sift_set_evidence_disposition',
    description:
      'Lets the user tell the case to include, exclude, or question one evidence item. Exclusion preserves provenance and reason; it does not delete the source.',
    inputSchema: SetEvidenceDispositionInputSchema,
    activeCaseId,
    call: (input) => commands.setEvidenceDisposition(input),
    successMessage: (input) => `Evidence "${input.evidenceId}" marked "${input.disposition}".`,
    ui: (input) => ({ changed: true, focusTarget: input.evidenceId }),
  });
}

function buildRequestInvestigationTool(
  commands: SiftCommands,
  activeCaseId: string,
): WebMcpToolDefinition {
  return buildCaseScopedCommandTool<RequestInvestigationInput, CommandReceipt>({
    name: 'sift_request_investigation',
    description:
      'Requests the next bounded engine move or asks the engine to revisit one named obligation.',
    inputSchema: RequestInvestigationInputSchema,
    activeCaseId,
    // `commands.requestInvestigation` resolves a `RunReceipt`, which is
    // structurally a `CommandReceipt` with a required (not optional)
    // `runId` -- assignable wherever a `CommandReceipt` is expected.
    call: (input) => commands.requestInvestigation(input),
    successMessage: () => 'Investigation run requested.',
    ui: () => ({ changed: true }),
  });
}

function buildRequestRevisionTool(
  commands: SiftCommands,
  activeCaseId: string,
): WebMcpToolDefinition {
  // Deliberately calls `commands.requestRevision`, never
  // `commands.reviewProposal` -- `RequestRevisionInputSchema`
  // (`packages/contracts/src/commands.ts`) has no `decision`/`actor` field
  // at all, unlike `ReviewProposalInputSchema`, so there is no way to
  // misuse this tool to approve or reject anything even if a caller tried.
  // `reviewProposal` (the only `SiftCommands` method that *can* approve) is
  // never referenced anywhere in this file -- see this module's exported
  // `SIFT_WEBMCP_TOOL_NAMES` catalog and this task's contract test for the
  // proof that no approval-shaped tool is registered.
  return buildCaseScopedCommandTool<RequestRevisionInput, CommandReceipt>({
    name: 'sift_request_revision',
    description:
      'Attaches a human revision request to the pending recommendation and reopens affected obligations.',
    inputSchema: RequestRevisionInputSchema,
    activeCaseId,
    call: (input) => commands.requestRevision(input),
    successMessage: () => 'Revision request attached to the pending recommendation.',
    ui: (input) => ({ changed: true, focusTarget: input.proposalId }),
  });
}

// --- The five case-scoped tools this task adds ---

function buildGetOptionDetailsTool(
  getActiveCase: () => CaseState | null,
  activeCaseId: string,
): WebMcpToolDefinition {
  return buildCaseScopedReadTool<GetOptionDetailsInput, OptionDetailsSummary>({
    name: 'sift_get_option_details',
    description:
      'Returns full detail for one option: its complete attribute map (pack-defined and custom.* fields, each with value, status, confidence, and source ids), plus the claims and sources specifically linked to it. Use this when the bounded option list in sift_get_case_context is not enough -- for example, before explaining why one option is or is not a good fit, or before citing evidence for a specific option. It is read-only: it never changes which option is focused in the page; call sift_focus_option separately if the user should see this option highlighted.',
    inputSchema: GetOptionDetailsInputSchema,
    activeCaseId,
    read: (input) => {
      const caseState = getActiveCase();
      if (caseState === null) {
        return {
          ok: true,
          message: 'No case is currently active.',
          ui: { changed: false },
        };
      }
      const details = buildOptionDetails(caseState, input.optionId);
      if (details === null) {
        return {
          ok: false,
          message: `Option "${input.optionId}" was not found in case "${input.caseId}".`,
          caseId: caseState.id,
          sequence: caseState.eventSequence,
          ui: { changed: false },
          error: { code: 'NOT_FOUND', retryable: false },
        };
      }
      return {
        ok: true,
        message: `Detail returned for option "${input.optionId}".`,
        data: details,
        caseId: caseState.id,
        sequence: caseState.eventSequence,
        ui: { changed: false },
      };
    },
  });
}

function buildListResearchTool(
  getActiveCase: () => CaseState | null,
  activeCaseId: string,
): WebMcpToolDefinition {
  return buildCaseScopedReadTool<ListResearchInput, ResearchSummary>({
    name: 'sift_list_research',
    description:
      "Returns every source submitted to this case (title, publisher, URL, origin, verification status) and every claim recorded against it -- a fuller, dedicated view than the small research summary embedded in sift_get_case_context. Use this when the user asks what has been researched so far, or before deciding whether more research is needed. It never marks a source as trusted or changes any evidence disposition; source verification remains Sift's own to decide.",
    inputSchema: ListResearchInputSchema,
    activeCaseId,
    // `ListResearchInput` carries only `caseId` (already checked by the
    // generic wrapper before `read` runs) -- there is no further filter to
    // read from `input` yet.
    read: (_input: ListResearchInput) => {
      const caseState = getActiveCase();
      if (caseState === null) {
        return {
          ok: true,
          message: 'No case is currently active.',
          ui: { changed: false },
        };
      }
      const research = buildResearchSummary(caseState);
      return {
        ok: true,
        message: `${research.sources.total} source(s) and ${research.claims.total} claim(s) returned.`,
        data: research,
        caseId: caseState.id,
        sequence: caseState.eventSequence,
        ui: { changed: false },
      };
    },
  });
}

function buildSearchCatalogTool(
  getActiveCase: () => CaseState | null,
  activeCaseId: string,
  catalogAdapters: Record<string, CatalogAdapter>,
): WebMcpToolDefinition {
  return buildCaseScopedReadTool<SearchCatalogInput, CatalogSearchOutput & { packId: string }>({
    name: 'sift_search_catalog',
    description:
      "Searches Sift's own bundled catalog for the active Decision Pack's option type -- currently vehicle data for the car-purchase pack -- using pack-recognized filters (car-purchase recognizes year, make, model, and bodyStyle) plus optional free text. Use this to find real candidate options from what the user has described before adding any of them to the case; it never relies on the model's own knowledge of makes or models, and it never adds a result to the case by itself. Call sift_upsert_option separately once the user chooses a candidate. Returns an empty result, not an error, when the active pack has no catalog registered.",
    inputSchema: SearchCatalogInputSchema,
    activeCaseId,
    read: async (input) => {
      const caseState = getActiveCase();
      if (caseState === null) {
        return {
          ok: true,
          message: 'No case is currently active.',
          ui: { changed: false },
        };
      }
      const packId = caseState.pack.id;
      const adapter = catalogAdapters[packId];
      if (adapter === undefined) {
        return {
          ok: true,
          message: `No catalog is registered for pack "${packId}".`,
          data: { results: [], total: 0, packId },
          caseId: caseState.id,
          sequence: caseState.eventSequence,
          ui: { changed: false },
        };
      }
      const output = await adapter.search({
        ...(input.query !== undefined ? { query: input.query } : {}),
        filters: input.filters ?? {},
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.offset !== undefined ? { offset: input.offset } : {}),
      });
      return {
        ok: true,
        message: `${output.results.length} of ${output.total} catalog result(s) returned.`,
        data: { ...output, packId },
        caseId: caseState.id,
        sequence: caseState.eventSequence,
        ui: { changed: false },
      };
    },
  });
}

function buildSetViewTool(
  activeCaseId: string,
  getActiveCase: () => CaseState | null,
  getSessionView: () => WorkspaceViewState | null,
  setSessionView: (next: WorkspaceViewState) => void,
): WebMcpToolDefinition {
  return buildCaseScopedPresentationTool<SetViewInput>({
    name: 'sift_set_view',
    description:
      "Changes which workspace view is shown -- Quick Pick, List, Compare, or Board -- and optionally which option is focused or which options are visible. Use this when the user asks to see the case a different way, such as 'walk me through them instead' or 'show me a list.' This changes PRESENTATION ONLY: it can never add, remove, reweight, or relabel a criterion, and it can never invalidate the recommendation, because it never writes through the same path a decision change does. The chosen view currently holds only for this browser session; it is not yet saved across a reload.",
    inputSchema: SetViewInputSchema,
    activeCaseId,
    getActiveCase,
    getSessionView,
    setSessionView,
    apply: (input) => ({
      mode: input.mode,
      ...(input.focusedOptionId !== undefined ? { focusedOptionId: input.focusedOptionId } : {}),
      ...(input.visibleOptionIds !== undefined ? { visibleOptionIds: input.visibleOptionIds } : {}),
    }),
    successMessage: (input) => `Workspace view set to "${input.mode}".`,
  });
}

function buildConfigureComparisonTool(
  activeCaseId: string,
  getActiveCase: () => CaseState | null,
  getSessionView: () => WorkspaceViewState | null,
  setSessionView: (next: WorkspaceViewState) => void,
): WebMcpToolDefinition {
  return buildCaseScopedPresentationTool<ConfigureComparisonInput>({
    name: 'sift_configure_comparison',
    description:
      "Configures the Compare view: which options are shown side by side, which attribute rows are visible or pinned, and how rows are sorted. Use this when the user wants to narrow or reorganize what the comparison shows, such as 'show only safety and cargo' or 'show me the three finalists.' Do not confuse this with changing what the user cares about: showing or hiding a row changes what is DISPLAYED, never the decision's criteria, and it can never invalidate the recommendation -- use sift_update_criteria instead when the user actually wants a factor to start or stop mattering to the decision itself. The chosen configuration currently holds only for this browser session; it is not yet saved across a reload.",
    inputSchema: ConfigureComparisonInputSchema,
    activeCaseId,
    getActiveCase,
    getSessionView,
    setSessionView,
    apply: (input) => ({
      mode: 'compare',
      ...(input.optionIds !== undefined ? { compare: { optionIds: input.optionIds } } : {}),
      ...(input.visibleAttributeIds !== undefined
        ? { visibleAttributeIds: input.visibleAttributeIds }
        : {}),
      ...(input.pinnedAttributeIds !== undefined
        ? { pinnedAttributeIds: input.pinnedAttributeIds }
        : {}),
      ...(input.sort !== undefined ? { sort: input.sort } : {}),
    }),
    successMessage: () => 'Compare view configured.',
  });
}

function buildCaseScopedTools(
  commands: SiftCommands,
  activeCaseId: string,
  getActiveCase: () => CaseState | null,
  catalogAdapters: Record<string, CatalogAdapter>,
  getSessionView: () => WorkspaceViewState | null,
  setSessionView: (next: WorkspaceViewState) => void,
): WebMcpToolDefinition[] {
  return [
    buildSelectPackTool(commands, activeCaseId),
    buildFocusEvidenceTool(commands, activeCaseId),
    buildFocusOptionTool(commands, activeCaseId),
    buildUpsertOptionTool(commands, activeCaseId),
    buildUpdateCriteriaTool(commands, activeCaseId),
    buildDefineCaseAttributeTool(commands, activeCaseId),
    buildSubmitSourceTool(commands, activeCaseId),
    buildSetEvidenceDispositionTool(commands, activeCaseId),
    buildRequestInvestigationTool(commands, activeCaseId),
    buildRequestRevisionTool(commands, activeCaseId),
    buildGetOptionDetailsTool(getActiveCase, activeCaseId),
    buildListResearchTool(getActiveCase, activeCaseId),
    buildSearchCatalogTool(getActiveCase, activeCaseId, catalogAdapters),
    buildSetViewTool(activeCaseId, getActiveCase, getSessionView, setSessionView),
    buildConfigureComparisonTool(activeCaseId, getActiveCase, getSessionView, setSessionView),
  ];
}

// --- The two global read-only tools ---

function buildGetCaseContextTool(
  getActiveCase: () => CaseState | null,
  getSessionView: () => WorkspaceViewState | null,
): WebMcpToolDefinition {
  return {
    name: 'sift_get_case_context',
    description:
      'Returns the active case summary, selected pack ID/version/hash, pack-defined and case-defined criteria/attributes, options, readiness counts, current focus, selected option/evidence, recommendation, active run correlation, pending human action, case-defined custom-field definitions (label, reason, origin, confirmation state), a bounded research summary (source titles and publishers, not full excerpts), unresolved questions with their real question text, stale or conflicted signals, and the current workspace view. It omits private model messages and oversized source bodies. Call this to understand the case before acting and again afterward to see what changed; it never mutates anything.',
    inputSchema: toToolInputSchema(GetCaseContextInputSchema),
    execute: async (rawInput: unknown, context?: WebMcpToolCallContext) => {
      const parsed = GetCaseContextInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return validationFailureEnvelope();
      }
      try {
        // Reading `getActiveCase()` and projecting it is fully synchronous
        // -- `runAbortable` still races it against `context?.signal` (a
        // pre-aborted call must still report `UNAVAILABLE` rather than
        // reading state), but the worker itself has nothing to `await`.
        return await runAbortable(() => {
          const caseState = getActiveCase();
          if (caseState === null) {
            const envelope: ToolEnvelope<CaseContextSummary | null> = {
              ok: true,
              message: 'No case is currently active.',
              data: null,
              ui: { changed: false },
            };
            return Promise.resolve(envelope);
          }
          const envelope: ToolEnvelope<CaseContextSummary> = {
            ok: true,
            message: 'Active case context returned.',
            data: buildCaseContextSummary(caseState, getSessionView()),
            caseId: caseState.id,
            sequence: caseState.eventSequence,
            ui: { changed: false },
          };
          return Promise.resolve(envelope);
        }, context?.signal);
      } catch (error) {
        return mapErrorToEnvelope(error);
      }
    },
  };
}

function buildListPacksTool(
  listPacks: () => CompiledDecisionPack[] | Promise<CompiledDecisionPack[]>,
): WebMcpToolDefinition {
  return {
    name: 'sift_list_packs',
    description:
      'Returns installed compiled Decision Packs with descriptions, versions, hashes, and activation signals.',
    inputSchema: toToolInputSchema(ListPacksInputSchema),
    execute: async (rawInput: unknown, context?: WebMcpToolCallContext) => {
      const parsed = ListPacksInputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return validationFailureEnvelope();
      }
      try {
        return await runAbortable(async () => {
          const packs = await listPacks();
          const summaries: PackSummary[] = packs.map(buildPackSummary);
          const envelope: ToolEnvelope<PackSummary[]> = {
            ok: true,
            message: `${summaries.length} installed Decision Pack(s) returned.`,
            data: summaries,
            ui: { changed: false },
          };
          return envelope;
        }, context?.signal);
      } catch (error) {
        return mapErrorToEnvelope(error);
      }
    },
  };
}

// --- Registration entry point ---

export interface SiftToolRegistrationOptions {
  adapter: ModelContextAdapter;
  commands: SiftCommands;
  /** Synchronous accessor for the currently active case's canonical state (or `null`). Read fresh on every `sift_get_case_context` call, not captured once at registration time. */
  getActiveCase: () => CaseState | null;
  /** Accessor for the installed compiled Decision Pack catalog; sync or async. */
  listPacks: () => CompiledDecisionPack[] | Promise<CompiledDecisionPack[]>;
  /** Catalog adapters keyed by pack id, backing `sift_search_catalog`. Defaults to `buildDefaultCatalogAdapters()` (the real car-purchase vehicle adapter over `GET /api/catalog/*`) when omitted; tests substitute fakes here. */
  catalogAdapters?: Record<string, CatalogAdapter>;
  /** Forwarded to the default catalog adapters' underlying `catalog-client.ts` calls when `catalogAdapters` is not supplied (test-only `baseUrl`/`fetchImpl` injection). */
  catalogClientOptions?: CatalogClientOptions;
}

export interface SiftToolRegistrationHandle {
  /** Aborts and unregisters the currently-registered case-scoped tool set, if any, without touching the two global read tools. */
  disposeCaseTools: () => void;
  /**
   * Registers (or re-registers) the case-scoped tools bound to `caseId`,
   * first aborting any previously-registered case-scoped generation
   * (webmcp.md "Registration lifecycle": "Abort the previous registration
   * controller whenever the active case changes"). Pass `null` to dispose
   * only -- no case-scoped tools remain registered. Also resets the
   * in-memory `sift_set_view`/`sift_configure_comparison` session state --
   * see this module's header comment.
   */
  setActiveCase: (caseId: string | null) => Promise<void>;
  /** Aborts every registration this handle owns, global read tools included -- call on full unmount. */
  disposeAll: () => void;
}

/**
 * Registers the two global read tools immediately, then returns a handle a
 * caller (a later App-level integration task, per this task's brief) drives
 * as the active case changes over the component's lifetime.
 */
export async function registerSiftTools(
  options: SiftToolRegistrationOptions,
): Promise<SiftToolRegistrationHandle> {
  const { adapter, commands, getActiveCase, listPacks } = options;
  const catalogAdapters =
    options.catalogAdapters ?? buildDefaultCatalogAdapters(options.catalogClientOptions);

  if (!adapter.supported()) {
    // Graceful degradation (webmcp.md "Browser adapter": "When WebMCP is
    // unavailable, the website remains fully usable through visible
    // controls and shows a non-blocking ... notice"). Every handle method
    // below is a safe no-op: this module never throws or partially
    // registers tools on an unsupported browser, even if a caller forgets
    // to check `adapter.supported()` itself first. A later UI task reads
    // `adapter.supported()` directly to decide whether to render that
    // notice; this is the registration layer's own defense-in-depth half
    // of the same requirement.
    return {
      disposeCaseTools: () => undefined,
      setActiveCase: () => Promise.resolve(),
      disposeAll: () => undefined,
    };
  }

  const globalController = new AbortController();
  let caseController: AbortController | null = null;
  // In-memory, per-browser-session `WorkspaceViewState` for
  // `sift_set_view`/`sift_configure_comparison` -- see this module's header
  // comment for why no durable command exists yet. Reset to `null` (falls
  // back to `CaseState.view`, i.e. "no view chosen this session") whenever
  // the active case changes, since a view's `focusedOptionId`/
  // `visibleOptionIds`/`compare.optionIds` name entities scoped to one case.
  let sessionView: WorkspaceViewState | null = null;

  await adapter.registerTool(
    buildGetCaseContextTool(getActiveCase, () => sessionView),
    {
      signal: globalController.signal,
    },
  );
  await adapter.registerTool(buildListPacksTool(listPacks), { signal: globalController.signal });

  function disposeCaseTools(): void {
    caseController?.abort();
    caseController = null;
  }

  async function setActiveCase(caseId: string | null): Promise<void> {
    disposeCaseTools();
    sessionView = null;
    if (caseId === null) {
      return;
    }
    const controller = new AbortController();
    caseController = controller;
    const tools = buildCaseScopedTools(
      commands,
      caseId,
      getActiveCase,
      catalogAdapters,
      () => sessionView,
      (next) => {
        sessionView = next;
      },
    );
    for (const tool of tools) {
      await adapter.registerTool(tool, { signal: controller.signal });
    }
  }

  function disposeAll(): void {
    disposeCaseTools();
    globalController.abort();
  }

  return { disposeCaseTools, setActiveCase, disposeAll };
}
