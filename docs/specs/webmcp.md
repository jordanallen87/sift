# WebMCP Contract Specification

Official implementation references:

- [WebMCP repository and explainer](https://github.com/webmachinelearning/webmcp)
- [Current specification source](https://github.com/webmachinelearning/webmcp/blob/main/index.bs)

## Role of WebMCP

Sift is a normal browser application first. It registers structured tools with `document.modelContext` so ChatGPT's in-app browser agent can operate the active page directly. Tool callbacks reuse client commands and update the same case state rendered to the user.

WebMCP complements the Strands backend. WebMCP represents page interaction; Strands performs adaptive case work.

WebMCP is a genuinely **two-way** collaboration layer, not only a mutation channel (change-set §14, ADR 0006 decision 1). ChatGPT must be able to pull enough structured state out of Sift to conduct an informed conversation — what decision is being made, what the user wants, constraints and preferences, current options and selection, available and custom comparison fields, collected research, notes, unresolved questions, stale/conflicted evidence, the current recommendation, available actions, and the current workspace view — without reconstructing any of it from screen text. Read capability now covers this full list: the widened `sift_get_case_context` (see "Widened case context" below), `sift_get_option_details`, `sift_list_research`, `sift_list_notes`, `sift_search_catalog`, and `sift_get_decision_guide` together let ChatGPT reconstruct case state, pack-level guidance, research, and notes without screen-scraping. ADR 0006's decided target contract (the eight decisions listed in that ADR) is fully implemented as of this writing; the only remaining open item is the fate of `sift_list_packs`/`sift_select_pack` under the expanded catalog, which ADR 0006 explicitly left undecided (see the note under `sift_list_packs` below).

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

**Human authority is absolute and applies across every class.** No tool in this catalog may call `SiftCommands.reviewProposal`, the only method that can approve a decision proposal. `webmcp-contract.test.ts` asserts both the exact tool-name set and that no registered tool ever reaches `reviewProposal`, and that assertion is tightened (new expected count and name list) at every tool addition — it is never loosened into a subset or substring check, and it must never regress as this catalog grows (ADR 0006 decision 7).

## Tool catalog — implemented today

The following twenty-two tools exist in the repository today (`SIFT_WEBMCP_TOOL_NAMES`, `register-sift-tools.ts`; the exact count and name list are asserted by `webmcp-contract.test.ts`). Each is labeled with its authority class.

### `sift_get_case_context` — READ

Returns the active case summary, selected pack ID/version/hash, pack-defined and case-defined criteria/attributes, options, readiness counts, current focus, selected option/evidence, recommendation, active run correlation, pending human action, case-defined custom-field definitions (label, reason, origin, confirmation state), a bounded research summary (source titles and publishers, not full excerpts), unresolved questions with their real question text, stale or conflicted signals, and the current workspace view. It omits private model messages and oversized source bodies. Call this to understand the case before acting and again afterward to see what changed; it never mutates anything.

ADR 0006 decision 2's widening is implemented: `caseExtensions`, `sources`, `claims`, and `evidenceLinks` are no longer omitted wholesale. See "Widened case context" below for exactly what each addition contains and how it is bounded.

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

**Known gap, closed by a companion tool:** `value` is required on every attribute here, so this tool cannot express "this attribute is deliberately unknown," and it carries no `confidence` or `status` field. Rather than widening this tool's contract, ADR 0006 decision 4 added a narrower companion, `sift_set_option_attribute` (WRITE, documented below), which carries `status` (including `'unknown'`), `confidence`, and `sourceIds` for exactly one attribute on an existing option without disturbing any other attribute already recorded there. `sift_upsert_option` itself keeps its whole-option create/replace contract unchanged — use it to create an option or replace its full attribute set, and `sift_set_option_attribute` to update or add one field in place.

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

Submits a structured source discovered by the user or ChatGPT, and files it in the case's reference library. This lets ChatGPT contribute research while Sift retains provenance, challenge, and readiness control. Claims may be empty and obligationId may be omitted: a source with neither is a reference kept because it is relevant to the case (a paper, an article, a blog post, a spec sheet), and that is a first-class thing to store, not a degraded submission — supply claims and an obligationId only when the source actually answers a specific open question. Use tags (free-form, your own labels) so the library can be organised and browsed, and summary for your OWN account of why this reference matters — never a quotation, which belongs in excerpt. Set summaryFormat to markdown when the summary uses markdown; raw HTML is rejected. Call sift_list_research first to see which tags this case already uses, so related material files together instead of under a near-duplicate label.

Input:

```ts
{
  caseId: string
  expectedSequence: number
  obligationId?: string
  source: {
    url: string
    title: string
    publisher?: string
    publishedAt?: string
    retrievedAt: string
    excerpt?: string
    tags?: string[]
    summary?: string
    summaryFormat?: 'markdown'
    claims: Array<{ statement: string; appliesToEntityIds: string[] }>
  }
}
```

Effect: persists an unverified submitted source and starts no implicit network request. `source-challenger` must validate relevance, recency, contradiction, and support before it may satisfy an obligation.

`tags`/`summary`/`summaryFormat` are the reference-library fields (`SourceSchema`, `packages/contracts/src/case.ts`) and are persisted onto the `Source` record. `tags` are normalised conservatively before storage — trimmed, empties dropped, de-duplicated case-insensitively with the submitter's own casing preserved for display — and are never mapped onto a controlled vocabulary: a reference library exists to collect material nobody anticipated. `summary` is the submitter's own account of why the reference matters and is never conflated with `excerpt`, which is a quotation from the source. `summaryFormat` is stored only alongside a `summary`.

**Reference versus evidence.** A `Source` no `Claim.sourceIds`/`EvidenceLink.sourceId` names is a *reference*; one they name is *evidence*. Both are real records and both appear in the reference library UI (`apps/web/src/components/ReferenceLibrary.tsx`); the distinction is displayed, never used to rank or hide either kind.

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

### `sift_get_option_details` — READ

Returns full detail for one option: its complete attribute map (pack-defined and `custom.*` fields, each with value, status, confidence, and source ids), plus the claims and sources specifically linked to it (`Claim.entityId`, and any source referenced by the option's own attribute `sourceIds`). Use this when the bounded option list in `sift_get_case_context` is not enough — for example, before explaining why one option is or is not a good fit, or before citing evidence for a specific option. It is read-only: it never changes which option is focused in the page; call `sift_focus_option` separately if the user should see this option highlighted.

Input:

```ts
{ caseId: string; optionId: string }
```

Effect: read-only. Returns `NOT_FOUND` for an option id that does not exist on the case.

### `sift_list_research` — READ

Returns this case's whole reference library — every source submitted to it (title, publisher, URL, origin, verification status, its tags, and the submitter's own summary) and every claim recorded against it — a fuller, dedicated view than the small research summary embedded in `sift_get_case_context`. This is durable memory you wrote earlier and can read back: use it when the user asks what has been researched so far, before deciding whether more research is needed, before submitting a source you may already have filed, and to reuse the case's existing tags rather than inventing a near-duplicate label. It never marks a source as trusted or changes any evidence disposition; source verification remains Sift's own to decide.

Input:

```ts
{ caseId: string }
```

Effect: read-only. Bounded to 50 sources and 50 claims, most-recently-submitted first, with the true total reported alongside. Each source carries its `tags` (omitted when it has none) and its `summary`, truncated to 500 characters the same way `Claim.statement` and `CaseNote.body` already are; `excerpt` remains excluded from every model-facing projection.

**Naming note:** this is distinct from `CaseNote` (see `sift_list_notes`/`sift_add_note` below). "Research" here means the `Source`/`Claim`/`EvidenceLink` model (change-set §27), populated through `sift_submit_source` and the deterministic investigation engines. A `CaseNote` is a lighter-weight, non-evidentiary record — an observation, question, preference, or reminder — that never becomes a `Source`/`Claim` and never influences evidence validity or readiness; the two concepts are stored, projected, and read by entirely separate tools.

### `sift_search_catalog` — READ

ADR 0006 decision 5. A generic catalog search tool — not `sift_search_vehicles` — so a future non-automotive pack can register the same tool name against a different filter set rather than requiring a parallel `sift_search_<domain>` tool (change-set §20). Searches Sift's own bundled catalog for the active Decision Pack's option type — currently vehicle data for the car-purchase pack, via `@sift/catalog`'s query functions behind `GET /api/catalog/vehicles` — using pack-recognized filters (car-purchase recognizes `year`, `make`, `model`, and `bodyStyle`) plus optional free text. Use this to find real candidate options from what the user has described before adding any of them to the case; it never relies on the model's own knowledge of makes or models, and it never adds a result to the case by itself. Call `sift_upsert_option` separately once the user chooses a candidate. This closes the gap where the vehicle catalog was reachable only through direct HTTP routes and entirely invisible to WebMCP (change-set §19/§20).

Input:

```ts
{ caseId: string; query?: string; filters?: Record<string, string | number>; limit?: number; offset?: number }
```

Effect: read-only. Returns an empty result, not an error, when the active pack has no catalog adapter registered. No pack manifest field yet declares catalog availability/filter schema (`PresentationDefinitionSchema` has no such field); today's adapter selection is keyed by pack id in `apps/web/src/model-context/catalog-search-adapter.ts`, a stand-in for that declarative mechanism.

### `sift_set_view` — PRESENTATION

Changes which workspace view is shown — Quick Pick, List, Compare, or Board — and optionally which option is focused or which options are visible. Use this when the user asks to see the case a different way, such as "walk me through them instead" or "show me a list." This changes PRESENTATION ONLY: it can never add, remove, reweight, or relabel a criterion, and it can never invalidate the recommendation.

Input:

```ts
{ caseId: string; mode: 'quick_pick' | 'list' | 'compare' | 'board'; focusedOptionId?: string; visibleOptionIds?: string[] }
```

**Effect, genuinely durable:** this tool merges its input onto the active case's own current `WorkspaceViewState` (read live via the same accessor `sift_get_case_context` uses, never a locally cached copy) and sends the resulting full `WorkspaceViewState` to the real `setView` command (`SetViewInputSchema`, `packages/contracts/src/commands.ts`; `CommandService.setView`, `apps/agent/src/services/command-service.ts`). That handler routes through `CaseStore.updateSelection()`, never `append()`, so the write is structurally incapable of advancing `eventSequence` or invalidating a recommendation — proven by a test that appends a `ready` recommendation, calls this tool, and asserts `criteria`/`recommendation` are byte-for-byte unchanged. Because the write is durable, it survives a reload and is visible to every viewer of the case, not only the browser session that made the call — this previously persisted only in browser-session memory; that gap is closed. A `sift_get_case_context` call after this tool reflects the change once the caller's own state cache picks up the durable write (the same correlation `sift_focus_option`/`sift_focus_evidence` already exhibit).

### `sift_configure_comparison` — PRESENTATION

Configures the Compare view: which options are shown side by side (`WorkspaceViewState.compare.optionIds`), which attribute rows are visible or pinned, and how rows are sorted. Use this when the user wants to narrow or reorganize what the comparison shows, such as "show only safety and cargo" or "show me the three finalists." Do not confuse this with changing what the user cares about: showing or hiding a row changes what is DISPLAYED, never the decision's criteria, and it can never invalidate the recommendation — use `sift_update_criteria` instead when the user actually wants a factor to start or stop mattering to the decision itself (change-set §53/§54).

Input:

```ts
{
  caseId: string
  optionIds?: string[]
  visibleAttributeIds?: string[]
  pinnedAttributeIds?: string[]
  sort?: { fieldId: string; direction: 'asc' | 'desc' }
}
```

At least one field besides `caseId` is required; a call configuring nothing is rejected as `VALIDATION` rather than silently accepted as a no-op. Effect: the same genuinely durable `setView` write described under `sift_set_view` above (`mode: 'compare'` merged in automatically) — never held only in browser-session memory.

### `sift_get_decision_guide` — READ

ADR 0006 decision 6. Returns this case's Decision Pack's Decision Guide: reference data about the *class* of decision the pack covers, not this specific case — why this kind of decision matters, a suggested discovery approach, example discovery questions worth asking early, things this kind of decision commonly leaves unresolved, what research tends to help, when a custom field is worth creating, and which comparison views tend to help. Delivered through progressive disclosure rather than one large guide dumped into every tool response; see "Decision Guide" below for what this must not be. Call `sift_get_case_context` separately for the specifics of the actual case.

Input:

```ts
{ caseId: string }
```

Effect: read-only. Returns `ok: true` with no `data`, not an error, when the active pack declares no Decision Guide or no case is active.

### `sift_focus_question` — PRESENTATION

Change-set §52's remaining PRESENTATION-group tool: points the shared page at a specific unresolved question — an obligation id from `sift_get_case_context`'s `unresolvedQuestions` — the way `sift_focus_option`/`sift_focus_evidence` already focus an option or evidence item. Backed by `WorkspaceViewState.focusedQuestionId` (`packages/contracts/src/case.ts`), a field distinct from the system-owned `activeFocus` (the engine's own "currently investigating" pointer, not a user/model-settable selection).

Input:

```ts
{ caseId: string; questionId: string; expectedSequence: number }
```

Effect: the same genuinely durable `setView` write described under `sift_set_view` above — it can never resolve, skip, or change an obligation's status, and it can never invalidate the recommendation, because it never writes through the same path a decision change does.

### `sift_set_option_attribute` — WRITE

ADR 0006 decision 4. A narrower companion to `sift_upsert_option` for setting one attribute value (pack-defined or `custom.*`) on an existing option, merging it into that option's attribute map without disturbing any other attribute already recorded there — unlike `sift_upsert_option`, which replaces an option's entire attribute map. Carries full provenance on every call: `value` (omit it only when `status` is `'unknown'` — never invent a value Sift cannot support), `status` (`'asserted' | 'supported' | 'verified' | 'conflicted' | 'unknown'`), `confidence`, `origin`, and `sourceIds`. This is the tool that makes change-set §24/§25 real: "ChatGPT can create a comparison field and then populate that field across options using structured, provenance-aware values," including leaving a value explicitly unknown rather than inventing one.

Input:

```ts
{
  caseId: string
  optionId: string
  expectedSequence: number
  attribute: {
    definitionId: string
    label?: string
    value?: AttributeValue
    sourceIds?: string[]
    status?: 'asserted' | 'supported' | 'verified' | 'conflicted' | 'unknown'
    confidence?: number
    origin?: 'pack' | 'user' | 'agent_proposed'
  }
}
```

Effect: durable update via `append()`. **Be honest about which status your evidence actually justifies:** a specification, listing, or other indirect source can support `'asserted'` or `'supported'`, never `'verified'` — `'verified'` is a claim that a human, or an equivalent direct check, actually confirmed the fact firsthand. Sift enforces this in `packages/core` (`createAttributeRecord`, `attributeValueStatusInvariantError`) regardless of caller: a write claiming `status: 'verified'` from `origin: 'pack'` or `origin: 'agent_proposed'` is rejected; only `origin: 'user'` may claim it. That rejection reaches this tool's caller as an honest `VALIDATION` error, naming what was rejected and what would have been accepted, through the same generic error-mapping path every other command error uses — never silently downgraded to a weaker status or retried.

### `sift_list_notes` — READ

Returns every `CaseNote` recorded on this case (body, kind, who wrote it, and which options/question/sources it references), most-recently-added first. A note is an informal observation, preference, reminder, or open question — never evidence, a criterion, or a comparison field — so this list never affects readiness or the recommendation. Use this before adding a new note to avoid recording a duplicate. Call `sift_list_research` instead for externally-sourced research (sources and claims).

Input:

```ts
{ caseId: string }
```

Effect: read-only. Bounded to 50 notes, most-recently-added first, with the true total reported alongside.

### `sift_add_note` — WRITE

Records a `CaseNote`: a human's or ChatGPT's informal observation, preference, reminder, or open question attached to the case — for example "the seat position felt wrong on the test drive" or "need to check this Saturday." **A note is not evidence, not a criterion, and not a comparison field, and adding one never satisfies an obligation, changes readiness, or invalidates the recommendation — by construction, not by convention:** the command handler (`CommandService.addNote`) appends only a `note.added` event and touches nothing else; it has no code path that reads or writes any obligation, evidence link, case extension, or recommendation. Use `sift_submit_source` instead when the content is externally verifiable research that should influence the decision; use `sift_update_criteria` when the user wants a factor to start or stop mattering to the decision itself; use `sift_define_case_attribute` or `sift_set_option_attribute` when the user wants a new typed comparison field populated with a provenance-aware value. A note may optionally reference one or more options and one unresolved question (obligation), and may cite existing source ids purely for context — doing so creates no evidence link and changes no source's verification status.

Input:

```ts
{
  caseId: string
  expectedSequence: number
  origin?: 'user' | 'agent_proposed'
  note: {
    body: string
    kind?: 'observation' | 'research' | 'question' | 'preference' | 'reminder'
    optionIds?: string[]
    obligationId?: string
    sourceIds?: string[]
  }
}
```

Effect: durable update via `append()`, but never a `recommendation.invalidated` event and never a readiness/evidence change — the absence of that code path is the entire guarantee. Referencing an `optionIds` or `obligationId` value that does not exist on the case is rejected as a clean validation error rather than silently recorded as a dangling reference.

## Widened case context

ADR 0006 decision 2 specifies that `sift_get_case_context`'s projection stops deliberately excluding `sources`, `claims`, `evidenceLinks`, and `caseExtensions`. **This widening is implemented** (`apps/web/src/model-context/case-context.ts`). `CaseContextSummary` adds five fields beyond the original projection:

- `customFields` — bounded, most-recent-50, projection of `caseExtensions` down to each custom field's *definition* (`id`, `label`, `valueType`, `reason`, `origin`, `confirmation`) — the exact shape Strands' own Context Injector already uses (`CaseExtensionSummary`, `@sift/contracts`). This closes the specific gap where a `custom.laptop_work_fit` *value* was visible on `EntityRecord.attributes` with no way to learn what the field meant;
- `research` — a small (8-source) bounded summary of `sources` (title, publisher, URL, origin, verification, retrieved/published dates — **never** `Source.excerpt`, which can run up to 5000 characters) plus a `totalClaims` count. `sift_list_research` above returns the fuller, larger-bounded (50/50) version of the same data on demand;
- `unresolvedQuestions` — obligations not yet `satisfied`/`accepted_uncertainty`, with their real `ObligationTemplate.question` text, highest pack-declared `priority` first, bounded to 15;
- `staleOrConflicted` — up to 15 signals combining any attribute recorded `status: 'conflicted'`, any `Claim.stale`, and any `EvidenceLink.stale`;
- `view` — the current, durably-persisted `WorkspaceViewState` (see `sift_set_view`/`sift_configure_comparison`/`sift_focus_question` above for how it is set), read directly from `CaseState.view`.

Every collection above reports both a (possibly truncated) `items` array and a true `total`, so a caller can distinguish "there is nothing more" from "there is more; call the dedicated tool." `Source.excerpt` is omitted entirely rather than truncated-and-included — the strictest reading of "not full bodies" the underlying task specified. The pre-existing exclusion of private model messages and oversized payloads is unchanged; no chain-of-thought and no secrets enter the projection at any point.

## Decision Guide

A pack-level Decision Guide (change-set §17/§47, ADR 0006 decision 6) teaches ChatGPT how to collaborate with a particular class of decision — domain purpose, discovery strategy, suggested discovery questions, important unknowns, research guidance, custom-field guidance, and presentation guidance. **Status: implemented.** `DecisionGuideSchema` (`packages/contracts/src/packs.ts`) declares exactly these seven fields as a `.strict()`-validated, optional manifest field alongside `PresentationDefinitionSchema` (which still declares only `optionLabel`, `optionLabelPlural`, and `attributeGroups` — the guide is a sibling field, not an addition to that schema); both `car-purchase` and `home-energy-guardian` declare real content for every field (see `packs-and-routing.md`). Omitting the guide entirely cannot change a pack's `compiledHash`, since canonicalization filters `undefined` keys before hashing.

The Decision Guide is explicitly and permanently **declarative data, never executable prompt content, and never an attempt to override host or system instructions**:

- it is delivered through tool descriptions and structured tool output (`sift_get_decision_guide`, above), using progressive disclosure rather than one large guide dumped into every response;
- it must remain data a pack manifest declares, not a prompt string capable of instructing the model to disregard other instructions;
- it is not, and must never be presented as, a system prompt;
- tool descriptions and structured tool outputs remain the entire integration mechanism — there is no hidden injection path.

Any implementation of this capability that allows pack metadata to carry instructions aimed at the model's behavior outside the declared guidance fields is a defect against this specification, not an enhancement of it.

## Observability: WebMCP-originated commands

ADR 0006 decision 8 specifies that the command envelope gain an explicit origin marker. **Status: implemented.** Every command-backed tool in this catalog (all WRITE/EXECUTION/PRESENTATION tools) tags its call with `{ origin: 'webmcp' }` in exactly one shared place (`buildCaseScopedCommandTool`'s `execute`, `register-sift-tools.ts`), so no individual tool's call site can forget it. `SiftCommands` sends this as an `X-Sift-Command-Origin` request header — a sibling to the existing `X-Sift-Command-Id`/`Idempotency-Key` headers — and the server records it onto the activity trail's `safeDetails.origin` for every emitted activity event tied to that command.

**This is observability only, and never authorization.** Nothing in the command service, the policy layer, or any route reads `X-Sift-Command-Origin`/`commandOrigin` to make a permission decision — a command with and without the header produces byte-identical case state and an identical `eventSequence` advance. A visible page control that calls the identical `SiftCommands` method directly (outside this module) simply omits the origin option, byte-identical to the pre-marker behavior. Human-only verbs (`reviewProposal`) remain unreachable from WebMCP because the tool catalog never exposes them, independent of this field — sending `X-Sift-Command-Origin: webmcp` grants a caller no capability it did not already have. This does not create a second command path: every case-scoped tool still calls the identical `SiftCommands` method its matching UI control calls, preserving CLAUDE.md's shared-command-implementation rule; it only tags the existing path so the server-side activity/runtime event stores and the Runtime Inspector's developer view can distinguish and display WebMCP-originated commands (change-set §34, `debugging-and-observability.md`).

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
- a PRESENTATION tool call never advances `eventSequence` and never invalidates a recommendation. For `sift_focus_option`/`sift_focus_evidence`, proven by asserting the underlying store call reaches `updateSelection()` and not `append()`. For `sift_set_view`/`sift_configure_comparison`/`sift_focus_question`, proven the same way plus more strongly: the call reaches `commands.setView`, which routes through `updateSelection()`, and `criteria`/`recommendation` are asserted byte-for-byte unchanged before and after the call — composed across multiple presentation calls in the same session, not only in isolation (change-set §53/§54's "show only safety and cargo" ≠ "safety and cargo are the only things I care about");
- a note (`sift_add_note`) never satisfies an obligation, changes readiness, or invalidates the recommendation — proven by asserting no obligation/evidence/recommendation-touching code path is ever reached and no `recommendation.invalidated` event is ever produced by the call, not only by checking the end state;
- a write claiming `status: 'verified'` from a non-`'user'` origin (`sift_set_option_attribute`) is rejected as an honest `VALIDATION` error, never silently downgraded or retried at a lower status;
- the exact tool-name-set assertion (count and list) is updated at every tool addition, never loosened to a subset or substring check.
