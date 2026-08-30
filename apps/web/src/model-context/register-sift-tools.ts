/**
 * Registers the full imperative WebMCP tool catalog (docs/specs/webmcp.md
 * "Tool catalog") against a `ModelContextAdapter`. Every tool's `execute`
 * calls through the exact same `SiftCommands` client visible controls will
 * later use (CLAUDE.md "Non-negotiable product truths": "Visible UI
 * controls and WebMCP callbacks use the same command implementation") --
 * there is no parallel fetch path anywhere in this module for the ten
 * command-backed tools.
 *
 * The two read-only tools (`sift_get_case_context`, `sift_list_packs`) are the
 * one deliberate exception, and it is a real gap worth flagging rather than
 * papering over: `SiftCommands` (`apps/web/src/api/sift-client.ts`) only
 * covers the architecture.md "Shared command client" interface -- commands
 * and `requestInvestigation` -- it has no query methods at all, and no
 * lightweight `GET /api/cases/:caseId` / `GET /api/packs` client exists yet
 * anywhere in `@sift/web` (confirmed: `AppProviders.tsx`'s own doc comment
 * defers "the event stream (SSE) and query-cache providers" to a later
 * task). Rather than inventing an ad hoc `fetch` for those two routes here
 * (which risks guessing at a response shape a later task would have to
 * un-invent) or guessing at server route wiring outside this task's scope,
 * `registerSiftTools` takes `getActiveCase`/`listPacks` as *injected data
 * accessors*. A later integration task backs `getActiveCase` with live,
 * SSE-updated case state and `listPacks` with a real `GET /api/packs`
 * fetch; this module owns the read tools' honest projection, validation,
 * and envelope behavior, fully tested here against injected fixtures.
 *
 * Registration lifecycle (docs/specs/webmcp.md "Registration lifecycle"):
 * `registerSiftTools` registers the two global read tools once, under one
 * `AbortController` that only `disposeAll()` aborts. The returned handle's
 * `setActiveCase(caseId)` registers (or re-registers) the ten case-scoped
 * tools under a *fresh* `AbortController` each time, first aborting
 * whichever one it replaces -- so a case change or `setActiveCase(null)`
 * (no active case) always unregisters the previous case's tool generation
 * before anything new is registered under the same stable names.
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
} from '@sift/contracts';
import type { SiftCommands } from '../api/sift-client.js';
import type {
  ModelContextAdapter,
  WebMcpToolCallContext,
  WebMcpToolDefinition,
} from './adapter.js';
import {
  buildCaseContextSummary,
  buildPackSummary,
  type CaseContextSummary,
  type PackSummary,
} from './case-context.js';
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
] as const;

export const SIFT_WEBMCP_TOOL_NAMES = [
  ...GLOBAL_SIFT_TOOL_NAMES,
  ...CASE_SCOPED_SIFT_TOOL_NAMES,
] as const;
export type SiftWebMcpToolName = (typeof SIFT_WEBMCP_TOOL_NAMES)[number];

// --- Generic case-scoped command tool builder ---

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

// --- The ten case-scoped tools (docs/specs/webmcp.md "Tool catalog") ---

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

function buildCaseScopedTools(
  commands: SiftCommands,
  activeCaseId: string,
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
  ];
}

// --- The two global read-only tools ---

function buildGetCaseContextTool(getActiveCase: () => CaseState | null): WebMcpToolDefinition {
  return {
    name: 'sift_get_case_context',
    description:
      'Returns the active case summary, selected pack ID/version/hash, pack-defined and case-defined criteria/attributes, options, readiness counts, current focus, selected option/evidence, recommendation, active run correlation, and pending human action. It omits private model messages and oversized source bodies.',
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
            data: buildCaseContextSummary(caseState),
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
}

export interface SiftToolRegistrationHandle {
  /** Aborts and unregisters the currently-registered case-scoped tool set, if any, without touching the two global read tools. */
  disposeCaseTools: () => void;
  /**
   * Registers (or re-registers) the ten case-scoped tools bound to
   * `caseId`, first aborting any previously-registered case-scoped
   * generation (webmcp.md "Registration lifecycle": "Abort the previous
   * registration controller whenever the active case changes"). Pass
   * `null` to dispose only -- no case-scoped tools remain registered.
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

  await adapter.registerTool(buildGetCaseContextTool(getActiveCase), {
    signal: globalController.signal,
  });
  await adapter.registerTool(buildListPacksTool(listPacks), { signal: globalController.signal });

  function disposeCaseTools(): void {
    caseController?.abort();
    caseController = null;
  }

  async function setActiveCase(caseId: string | null): Promise<void> {
    disposeCaseTools();
    if (caseId === null) {
      return;
    }
    const controller = new AbortController();
    caseController = controller;
    for (const tool of buildCaseScopedTools(commands, caseId)) {
      await adapter.registerTool(tool, { signal: controller.signal });
    }
  }

  function disposeAll(): void {
    disposeCaseTools();
    globalController.abort();
  }

  return { disposeCaseTools, setActiveCase, disposeAll };
}
