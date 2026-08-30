# WebMCP Contract Specification

Official implementation references:

- [WebMCP repository and explainer](https://github.com/webmachinelearning/webmcp)
- [Current specification source](https://github.com/webmachinelearning/webmcp/blob/main/index.bs)

## Role of WebMCP

Sift is a normal browser application first. It registers structured tools with `document.modelContext` so ChatGPT's in-app browser agent can operate the active page directly. Tool callbacks reuse client commands and update the same case state rendered to the user.

WebMCP complements the Strands backend. WebMCP represents page interaction; Strands performs adaptive case work.

WebMCP is a genuinely **two-way** collaboration layer, not only a mutation channel (change-set §14, ADR 0006 decision 1). ChatGPT must be able to pull enough structured state out of Sift to conduct an informed conversation — what decision is being made, what the user wants, constraints and preferences, current options and selection, available and custom comparison fields, collected research, notes, unresolved questions, stale/conflicted evidence, the current recommendation, available actions, and the current workspace view — without reconstructing any of it from screen text. Read capability is expanded to cover this list over time; see "Tool catalog — specified, not yet implemented" below for what remains to be built.

Every tool in this catalog operates identically on a demo case (`startDemo`) and a normal, user-built case (`startCase` + `upsertOption`, docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md) — none of them branch on how the case was created. This is a structural consequence of the registration lifecycle below (tools re-register against whatever the active case snapshot currently is) rather than special-cased logic; `sift_get_case_context` in particular is exactly as useful describing a shortlist a person just built from the vehicle catalog as it is describing the deterministic example case. The one exception is `sift_request_investigation` against a catalog-built `car-purchase` case: the tool call itself still succeeds (the run is durably accepted and a `RunReceipt` returned, exactly as usual), but the run then fails quickly and honestly rather than executing guided investigation, since the deterministic Strands engine behind that pack currently only knows how to investigate the checked-in example case's four candidates (ADR 0003 §4). ChatGPT and the page both observe this the normal way any run failure is observed — a `run.failed` activity event with a clear, human-readable explanation, and `sift_get_case_context`'s active-run correlation reflecting the failed status — not a distinct WebMCP error shape. Every other tool remains fully functional on a catalog-built case.

## Browser adapter

All browser-specific access is isolated behind:

```ts
interface ModelContextAdapter {
  supported(): boolean
  registerTool(definition: WebMcpToolDefinition, options?: { signal?: AbortSignal }): Promise<void>
}
```

Production uses `document.modelContext`. Tests inject an in-memory adapter that captures registrations and executes callbacks with schema validation.

When WebMCP is unavailable, the website remains fully usable through visible controls and shows a non-blocking `WebMCP unavailable in this browser` notice.

## Registration lifecycle

- Register global read tools when the application mounts.
- Register case tools only when an active case snapshot exists.
- Register proposal-review context only while a proposal is pending; final approval remains a visible human UI action.
- Abort the previous registration controller whenever the active case changes or the component unmounts.
- Tool names are stable across Decision Packs. Pack-specific meaning is expressed through current case context, declarative schemas, and labels, not dynamically invented tool names.

## Tool authority classes

Every tool belongs to exactly one of four authority classes (ADR 0006 decision 3, translating change-set §52's proposed grouping to the `sift_*` catalog). The class is enforced by which storage path a tool's implementation is wired to call — not only by tool description wording, so ChatGPT cannot be relied on alone to keep presentation and decision changes separate (change-set §53/§54: "Do not confuse 'Show only safety and cargo.' with 'Safety and cargo are the only things I care about.' The first changes presentation. The second changes criteria. ... This is a key correctness requirement"):

- **READ** — no mutation. Returns case, catalog, or guidance state.
- **WRITE** — mutates decision-relevant state through `append()` (see `architecture.md`). Can invalidate evidence, readiness, or the recommendation when the change is material.
- **PRESENTATION** — mutates only `WorkspaceViewState`/selection/focus fields through `updateSelection()` (see `architecture.md`, ADR 0005). This path structurally cannot advance `eventSequence` or invalidate a recommendation — not because a rule says so, but because the invalidation code is never invoked for a selection-only patch. A presentation tool's implementation is restricted to reach only `updateSelection()`.
- **EXECUTION** — starts or steers a bounded Strands engine run. Returns a `RunReceipt`; work continues asynchronously and streams through the normal event contract.

**Human authority is absolute and applies across every class.** No tool in this catalog — present or specified — may call `SiftCommands.reviewProposal`, the only method that can approve a decision proposal. `webmcp-contract.test.ts` asserts both the exact tool-name set and that no registered tool ever reaches `reviewProposal`, and that assertion is tightened (new expected count and name list) at every tool addition — it is never loosened into a subset or substring check, and it must never regress as this catalog grows (ADR 0006 decision 7).

## Tool catalog — implemented today

The following twelve tools exist in the repository today. Each is labeled with its authority class.

### `sift_get_case_context` — READ

Returns the active case summary, selected pack ID/version/hash, pack-defined and case-defined criteria/attributes, options, readiness counts, current focus, selected option/evidence, recommendation, active run correlation, and pending human action. It omits private model messages and oversized source bodies.

**Current limitation, target state specified:** the live projection also omits `sources`, `claims`, `evidenceLinks`, and `caseExtensions` entirely — so research, evidence conflicts, and, most consequentially, custom-field *definitions* are invisible to ChatGPT today, even though a custom field's *value* already leaks through on each option's attributes. ADR 0006 decision 2 specifies widening this projection; see "Widened case context" below for the target shape. This is not yet implemented.

Input: empty object.
Effect: read-only.

### `sift_list_packs` — READ

Returns installed compiled Decision Packs with descriptions, versions, hashes, and activation signals.

Input: empty object.
Effect: read-only.

**Fate under the expanded catalog is an open question** (ADR 0006's own "Open question"): change-set §52's proposed READ/WRITE/PRESENTATION/EXECUTION enumeration has no counterpart for `sift_list_packs` or `sift_select_pack`, and nothing in the change set says whether pack selection remains a WebMCP capability once a case is normally created through the catalog/shortlist flow (ADR 0003) rather than through pack selection on an empty case. Both tools are carried forward unchanged until that decision is made explicitly.

### `sift_select_pack` — WRITE

Selects a registered Decision Pack for a case that has no evidence yet.

Input:

```ts
{ caseId: string; packId: string; expectedSequence: number }
```

Effect: durable case update via `append()`. The result explains why selection succeeded or why an evidence-bearing case cannot be reinterpreted. See the open-question note under `sift_list_packs` above.

### `sift_focus_evidence` — PRESENTATION

Changes the evidence item highlighted in the shared page. This is a primary WebMCP collaboration tool: the user can select an item manually, or ChatGPT can focus it before discussing or revising the case.

Input:

```ts
{ caseId: string; evidenceId: string; expectedSequence: number }
```

Effect: visible selection state only via `updateSelection()`; no evidence is deleted or changed, and it cannot invalidate a recommendation.

### `sift_focus_option` — PRESENTATION

Changes the current option highlighted in the shared page and includes its safe summary in subsequent case context. This is the car-buying demo's primary shared-attention tool, but the contract works for any pack-defined option kind.

Input:

```ts
{ caseId: string; optionId: string; expectedSequence: number }
```

Effect: visible selection state only via `updateSelection()`. It does not change ranking or evidence.

### `sift_upsert_option` — WRITE

Adds or updates one manually supplied option using the pack's declared fields plus typed case extensions. It accepts structured facts supplied by the user or ChatGPT; it does not fetch or scrape a URL.

Input:

```ts
{
  caseId: string
  optionId?: string
  expectedSequence: number
  option: {
    label: string
    kind: string
    attributes: Array<{
      definitionId: string
      label?: string
      value: AttributeValue
      sourceIds?: string[]
    }>
  }
}
```

Effect: durable update via `append()`. The demo packs permit at most five options. Unknown `definitionId` values are accepted only under the compiled pack's extension policy and must include a valid `custom.*` definition. Changed facts invalidate affected evidence, obligations, scores, and recommendations.

**Known gap, target state specified:** `value` is required on every attribute, so this tool cannot express "this attribute is deliberately unknown," and it carries no `confidence` or `status` field, so a caller cannot preserve evidence status. `AttributeRecordSchema` already supports `status: 'unknown'`, `confidence`, and `origin`; the gap is in this command's input contract, not the storage model. ADR 0006 decision 4 specifies a narrower companion tool, `sift_set_option_attribute`, to close it — see "Tool catalog — specified, not yet implemented" below. `sift_upsert_option` keeps its current whole-option create/replace contract unchanged.

### `sift_update_criteria` — WRITE

Adds, removes, reweights, or relabels decision criteria. Removing a criterion referenced by a decided case is rejected. A successful update invalidates the comparison and recommendation, then asks the engine to recompute.

Input:

```ts
{
  caseId: string
  expectedSequence: number
  operations: Array<
    | {
        op: 'add'
        criterion: {
          id: string
          label: string
          kind: 'hard_constraint' | 'preference' | 'consideration'
          weight: number
          direction: 'higher_better' | 'lower_better' | 'target' | 'qualitative'
          target?: AttributeValue
          appliesToAttribute?: string
          question?: string
        }
      }
    | { op: 'remove'; criterionId: string }
    | { op: 'reweight'; criterionId: string; weight: number }
    | { op: 'rename'; criterionId: string; label: string }
  >
}
```

Effect: durable update via `append()` plus deterministic invalidation. Weights must be integers from 0 through 100 and are normalized for comparison. Adding an unknown criterion creates a typed case extension; when its question requires evidence, the core derives a case-specific obligation from the pack's `userConcern` template. Protected pack criteria cannot be removed.

**This tool changes criteria, never presentation.** "Show me only safety and cargo" is a `sift_configure_comparison` (PRESENTATION) call, never a `sift_update_criteria` (WRITE) call — see change-set §53/§54 and "Tool authority classes" above. A tool description alone must never be the only thing preventing that confusion; the two tools are wired to different storage paths.

### `sift_define_case_attribute` — WRITE

Defines a typed case-specific concern that the installed pack did not anticipate. A WebMCP call made in response to the user's explicit request records origin `user`; an extension autonomously proposed by a runtime agent uses an internal proposal event and remains pending until the user confirms it through the visible UI.

Input:

```ts
{
  caseId: string
  expectedSequence: number
  definition: {
    id: `custom.${string}`
    label: string
    valueType: AttributeValue['type']
    appliesTo: string[]
    unit?: string
    allowedValues?: string[]
    evidenceExpectation: 'assertion' | 'source' | 'corroborated' | 'verification'
    comparison: 'none' | 'lower_better' | 'higher_better' | 'target' | 'constraint'
    reason: string
  }
}
```

Effect: durable case extension via `append()` when the pack permits it. It never changes or republishes the installed pack.

### `sift_submit_source` — WRITE

Submits a structured source discovered by the user or ChatGPT for bounded Sift investigation. This lets ChatGPT contribute research while Sift retains provenance, challenge, and readiness control.

Input:

```ts
{
  caseId: string
  expectedSequence: number
  source: {
    url: string
    title: string
    publisher?: string
    publishedAt?: string
    retrievedAt: string
    excerpt?: string
    claims: Array<{ statement: string; appliesToEntityIds: string[] }>
  }
}
```

Effect: persists an unverified submitted source and starts no implicit network request. `source-challenger` must validate relevance, recency, contradiction, and support before it may satisfy an obligation.

### `sift_set_evidence_disposition` — WRITE

Lets the user tell the case to include, exclude, or question one evidence item. Exclusion preserves provenance and reason; it does not delete the source.

Input:

```ts
{
  caseId: string
  evidenceId: string
  disposition: 'included' | 'excluded' | 'questioned'
  reason: string
  expectedSequence: number
}
```

Effect: durable update via `append()`; affected obligations and recommendations become stale and are reevaluated.

### `sift_request_investigation` — EXECUTION

Requests the next bounded engine move or asks the engine to revisit one named obligation.

Input:

```ts
{ caseId: string; obligationId?: string; expectedSequence: number }
```

Effect: starts a run and returns a `RunReceipt`. Duplicate idempotency keys return the existing run.

### `sift_request_revision` — EXECUTION

Attaches a human revision request to the pending recommendation and reopens affected obligations.

Input:

```ts
{ caseId: string; proposalId: string; instructions: string; expectedSequence: number }
```

Effect: durable update via `append()`. It cannot approve or reject the decision.

## Tool catalog — specified, not yet implemented

The tools below are ADR 0006's decided target contract. **None of them exist in the repository yet.** They are documented here so the contract this catalog must grow into is unambiguous, not as a claim of current behavior. Implementing any of them requires: adding the tool's command input/handler, registering it in `register-sift-tools.ts`, and updating `webmcp-contract.test.ts`'s exact tool-name-set assertion to the new count and name list (never loosened — see "Tool authority classes" above).

The catalog is deliberately kept to a small number of coherent typed operations rather than one tool per field or filter (change-set §52: "Keep the tool catalog understandable. Do not create dozens of tiny tools if a few coherent typed operations suffice").

### `sift_set_option_attribute` — WRITE

ADR 0006 decision 4. A narrower companion to `sift_upsert_option` for setting one attribute value (pack-defined or `custom.*`) on an existing option, with `status` (including `'unknown'`), `confidence`, and `sourceIds` all expressible on the call — the exact set of fields `sift_upsert_option`'s required-`value` shape cannot carry today. This is the tool that makes change-set §24/§25 real: "ChatGPT can create a comparison field and then populate that field across options using structured, provenance-aware values," including leaving a value explicitly unknown rather than inventing one. `AttributeRecordSchema` already supports every field this needs; only the command input contract is missing.

### `sift_search_catalog` — READ

ADR 0006 decision 5. A generic catalog search tool — not `sift_search_vehicles` — so a future non-automotive pack can register the same tool name against a different filter set rather than requiring a parallel `sift_search_<domain>` tool (change-set §20). The active Decision Pack declares catalog availability and its filter schema; `@sift/catalog`'s vehicle-specific query functions remain the car-purchase pack's adapter behind this generic contract. This closes the gap where the vehicle catalog is reachable only through direct HTTP routes and is entirely invisible to WebMCP today (change-set §19/§20).

### `sift_get_decision_guide` — READ

ADR 0006 decision 6. Returns pack-level guidance about the class of decision being made — important discovery questions, useful starter fields, important hard constraints, recommended research categories, which attributes should not be inferred, useful default comparison views — delivered through progressive disclosure rather than one large guide dumped into every tool response. See "Decision Guide" below for what this must not be.

### Presentation-configuration tools — PRESENTATION

Change-set §52's PRESENTATION group, translated to the `sift_*` catalog and ADR 0005's `WorkspaceViewState` contract: `sift_set_view` (change the active workspace view mode), `sift_focus_question` (focus a Question/obligation the way `sift_focus_option`/`sift_focus_evidence` already focus an option or evidence item), and `sift_configure_comparison` (set `WorkspaceViewState.compare`'s visible option IDs, visible/pinned attribute IDs, sort, and filters — the tool behind the "show me the finalists and only what matters most" demo moment, change-set §11/§58). Every tool in this group is specified to write exclusively through `updateSelection()`, per ADR 0005 decision 1 and ADR 0006 decision 3, so it is structurally incapable of invalidating a recommendation regardless of how it is called.

### Research and notes read/write tools

Change-set §52 also proposes `sift_list_research`, `sift_list_notes`, and `sift_add_note` (plus an `sift_get_option_details` read tool, whose exact shape ADR 0006 does not itself decide). These depend on the `CaseNote`/research event-model design that change-set §28/§51 describes, which is a companion persistence decision, not restated by ADR 0006 or this document. Until that persistence design is settled and implemented, these tools do not exist, and no research/notes read capability is available through WebMCP beyond what the widened `sift_get_case_context` below provides.

## Widened case context

ADR 0006 decision 2 specifies that `sift_get_case_context`'s projection stops deliberately excluding `sources`, `claims`, `evidenceLinks`, and `caseExtensions`. **This widening is not yet implemented.** The target shape adds:

- `caseExtensions`, so a custom field's *definition* (label, type, why it exists, who added it) becomes visible to ChatGPT alongside the value that already leaks through on `EntityRecord.attributes` — closing the specific gap where a `custom.laptop_work_fit` value is visible with no way to learn what the field means;
- bounded projections of `sources`, `claims`, and `evidenceLinks`, so research and provenance are queryable rather than requiring reconstruction from screen text.

"Bounded" is not optional. A `Source.excerpt` can run up to 5000 characters; a widened projection must truncate or summarize excerpts rather than including them verbatim per source. The existing exclusion of private model messages and oversized payloads is preserved unchanged — only the four deliberately-omitted `CaseState` fields above are added back, and only in bounded form. No chain-of-thought and no secrets enter the projection at any point.

## Decision Guide

A pack-level Decision Guide is specified (change-set §17/§47, ADR 0006 decision 6) to teach ChatGPT how to collaborate with a particular class of decision — important discovery questions, useful starter fields, important hard constraints, recommended research categories, attributes that should not be inferred without evidence, and recommended default comparison views. **This is specified, not yet implemented**; `PresentationDefinitionSchema` today declares only `optionLabel`, `optionLabelPlural`, and `attributeGroups` (see `packs-and-routing.md` and `pack-authoring.md`).

The Decision Guide is explicitly and permanently **declarative data, never executable prompt content, and never an attempt to override host or system instructions**:

- it is delivered through tool descriptions and structured tool output (`sift_get_decision_guide`, once implemented), using progressive disclosure rather than one large guide dumped into every response;
- it must remain data a pack manifest declares, not a prompt string capable of instructing the model to disregard other instructions;
- it is not, and must never be presented as, a system prompt;
- tool descriptions and structured tool outputs remain the entire integration mechanism — there is no hidden injection path.

Any implementation of this capability that allows pack metadata to carry instructions aimed at the model's behavior outside the declared guidance fields is a defect against this specification, not an enhancement of it.

## Observability: WebMCP-originated commands

ADR 0006 decision 8 specifies that the command envelope gain an explicit origin marker — alongside the existing `X-Sift-Command-Id`/`Idempotency-Key` headers, a sibling marker (e.g. `X-Sift-Command-Origin`) records that a command was issued by a registered WebMCP tool rather than a direct UI action. **This marker does not exist yet.** It does not create a second command path: every case-scoped tool still calls the identical `SiftCommands` method its matching UI control calls, preserving CLAUDE.md's shared-command-implementation rule; it only tags the existing path so the server-side activity/runtime event stores and the Runtime Inspector's developer view can distinguish and display WebMCP-originated commands (change-set §34, `debugging-and-observability.md`).

## Tool result envelope

Every tool, in every authority class, returns:

```ts
interface SiftToolResult<T> {
  ok: boolean
  message: string
  data?: T
  commandId?: string
  runId?: string
  caseId?: string
  sequence?: number
  ui: {
    changed: boolean
    focusTarget?: string
  }
  error?: {
    code: 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'POLICY' | 'UNAVAILABLE' | 'INTERNAL'
    retryable: boolean
  }
}
```

Tool callbacks must return honest failure envelopes and must not claim a mutation occurred when it did not.

Mutating tools (WRITE, PRESENTATION, EXECUTION) return after command acceptance rather than waiting for the entire investigation. ChatGPT and the page correlate subsequent work through `commandId` and `runId`; the right-pane UI continues to update from the event stream while the conversation remains usable.

## Cancellation and concurrency

- Each callback accepts the browser-provided abort signal and forwards it to fetch.
- Cancellation produces `UNAVAILABLE` with `retryable: true` and does not apply a late response.
- Mutations include `expectedSequence`. Conflicts return the latest sequence so ChatGPT can call `sift_get_case_context` before retrying. This applies to WRITE and PRESENTATION tools alike: `updateSelection()` honors the same optimistic-concurrency and idempotency-key mechanism `append()` uses (see `architecture.md`), even though it never advances `eventSequence` itself.
- Retried mutations reuse an idempotency key derived from the browser tool call ID.

## Automated contract requirements

Tests must verify:

- exact tool names, descriptions, JSON schemas, and authority-class assignment;
- global versus case-scoped registration;
- unregister-on-case-change and unregister-on-unmount;
- unsupported-browser fallback;
- callback and visible-control equivalence;
- success, validation, not-found, policy, conflict, abort, and server-error envelopes;
- UI state update after tool completion;
- selected evidence included in subsequent case context;
- selected option included in subsequent case context;
- generic option upsert and pack-specific visible-form equivalence, five-option demo limit, typed custom attributes, and no implicit URL fetch;
- a new user criterion/attribute creates a case extension without mutating the compiled pack;
- submitted sources remain unverified until source challenge and retain provenance;
- no tool of any class ever calls `reviewProposal`, and no tool name is approval-shaped;
- no tool operates on a case other than the active case without an explicit matching `caseId`;
- a PRESENTATION tool call never advances `eventSequence` and never invalidates a recommendation, proven by asserting the underlying store call reaches `updateSelection()` and not `append()`;
- the exact tool-name-set assertion (count and list) is updated at every tool addition, never loosened to a subset or substring check.
