# ADR 0006: WebMCP Two-Way Collaboration Contract

Status: accepted
Date: 2026-08-30

## Context

`docs/change-sets/2026-08-30-generic-decision-workspace.md` §14 states the requirement plainly:
"The current WebMCP design is mutation-heavy. The revised product should make WebMCP a genuine
TWO-WAY collaboration layer," and lists what ChatGPT must be able to understand — what decision is
being made, what the user wants, constraints, preferences, current options, current selection,
available comparison fields, custom fields, research already collected, notes, unresolved
questions, stale/conflicted information, current recommendation, available actions, current
workspace view — closing with "Do not require the model to reconstruct this from screen text."

The live catalog does not meet this bar. `register-sift-tools.ts:86-104` declares
`GLOBAL_SIFT_TOOL_NAMES` (`sift_get_case_context`, `sift_list_packs` — 2 tools) and
`CASE_SCOPED_SIFT_TOOL_NAMES` (10 tools: `sift_select_pack`, `sift_focus_evidence`,
`sift_focus_option`, `sift_upsert_option`, `sift_update_criteria`, `sift_define_case_attribute`,
`sift_submit_source`, `sift_set_evidence_disposition`, `sift_request_investigation`,
`sift_request_revision`) — 12 tools total, 2 of them reads. Every case-scoped tool is a mutation;
none of them let ChatGPT ask a question about the case without changing it.

The one read tool that does cover case state, `sift_get_case_context`, is thinner than it looks.
`buildCaseContextSummary` (`apps/web/src/model-context/case-context.ts:74-99`) projects `CaseState`
to a fixed field list, and the module's own header comment (`case-context.ts:8-23`) states the
omission deliberately: `sift_get_case_context`'s effect text lists what it returns and "omits
private model messages and oversized source bodies," and the comment reasons from that sentence to
justify dropping `sources`, `claims`, `evidenceLinks`, and `caseExtensions` from the summary
entirely — noting that a `Source.excerpt` can run up to 5000 characters
(`packages/contracts/src/case.ts:162`, `excerpt: safeString(5000).optional()`), so a source-bearing
projection needs bounding, not omission. The `CaseContextSummary` interface
(`case-context.ts:44-60`) confirms the gap directly: no `sources`, `claims`, `evidenceLinks`, or
`caseExtensions` field exists anywhere on it.

The most damaging instance of this gap is custom fields. `extension.defined` writes only to
`CaseState.caseExtensions` (`packages/core/src/reducer.ts:149-153`,
`caseExtensions: upsertById(caseState.caseExtensions, event.payload.extension)`) — it never touches
`attributeDefinitions`. Since the context summary omits `caseExtensions`, a custom field's
*definition* (its label, type, why it exists, who added it) is invisible to ChatGPT. Meanwhile its
*value* is not: `EntityRecord.attributes` is an open `Record` keyed by any attribute id, including
`custom.*` (`packages/contracts/src/case.ts:54-69`, "Keyed by AttributeDefinition id (pack-defined
or `custom.*`); an open `Record`, not `.strict()`"), and `options: caseState.entities`
(`case-context.ts:86`) is very much part of the projection. The net effect: ChatGPT can see a
`custom.laptop_work_fit` value on an option with no way to learn what that field means.

Tool authority is unstructured. `sift_focus_option`/`sift_focus_evidence` already persist through a
separate mechanism from the other eight case-scoped tools: `SelectionPatch`/`updateSelection()`
(`apps/agent/src/store/case-store.ts:108-142`, `192-199`) is a deliberate escape hatch for
`CaseState` fields no `CaseEvent` variant ever touches (`selectedOptionId`, `selectedEvidenceId`,
`activeFocus`, `sources`). It persists durably but "does **not** append any `case_events` row and
does **not** advance `eventSequence`" — it structurally cannot invalidate a recommendation, unlike
`append()`, which every other case-scoped tool calls through `CommandService`. This mirrors the
persistence split recorded in the companion decision from this same change-set pass, ADR 0005
(presentation state vs. decision-mutating state) — but nothing in the WebMCP layer currently uses
that split to distinguish tool *kinds*. Change-set §53/§54 draws the line explicitly: "Do not
confuse 'Show only safety and cargo.' with 'Safety and cargo are the only things I care about.' The
first changes presentation. The second changes criteria" (`change-sets/2026-08-30-generic-decision-
workspace.md:1000-1004`). Today that distinction exists only in prose (tool descriptions), not in
which storage path a tool can reach.

`UpsertOptionInput` cannot express what change-set §24 requires. `OptionAttributeInputSchema`
(`packages/contracts/src/commands.ts:99-106`) makes `value` required
(`value: AttributeValueSchema`, no `.optional()`), and carries no `confidence` or `status` field.
The handler, `CommandService.upsertOption` (`apps/agent/src/services/command-service.ts:416-426`),
hardcodes `origin: 'user'` and `status: 'asserted'` on every call to `createAttributeRecord` and
never passes `confidence` at all. The code's own comment on this exact bottleneck
(`command-service.ts:135-140`) says it directly: "`upsertOption` cannot be reused to seed these
instead: `OptionAttributeInputSchema.value` is required and the handler hardcodes
`status: 'asserted'`, so an entity carrying a legitimately `status: 'unknown'` attribute (no value —
CLAUDE.md 'never fabricate') can only be expressed as a direct `option.upserted` event." Meanwhile
`AttributeRecordSchema` (`packages/contracts/src/attributes.ts:162-201`) already supports
`status: 'asserted' | 'supported' | 'verified' | 'conflicted' | 'unknown'` (`ATTRIBUTE_STATUSES`,
line 158), `confidence: z.number().min(0).max(1).optional()` (line 171), and
`origin: z.enum(ATTRIBUTE_ORIGINS)` (line 167, `'pack' | 'user' | 'agent_proposed'`) — the storage
model is adequate; the command input is the bottleneck. The same authority gap exists one command
over: `DefineCaseAttributeInputSchema` (`commands.ts:161-167`) carries no `origin` field at all;
`CommandService.defineCaseAttribute` accepts an `origin` parameter that defaults to `'user'`
(`command-service.ts:514-517`), but `routes/commands.ts:60` — the one place the wire contract
reaches this method — calls `service.defineCaseAttribute(commandId, input)` with no third argument,
so every command that can currently reach this handler through HTTP or WebMCP resolves to
`origin: 'user'`. Change-set §23's "agent-generated idea" path (ChatGPT proposes a concern, the user
confirms it) is unreachable through the wire contract as it stands today.

The vehicle catalog is invisible to WebMCP entirely. `apps/agent/src/routes/catalog.ts` imports
`searchVehicles`, `listMakes`, `listModels`, `listYears`, `listBodyStyles` from `@sift/catalog` and
exposes them as `GET /api/catalog/*` HTTP routes only; `apps/web` imports only
`@sift/catalog/browser` (`VehicleCatalogRecordSchema`, `mapCatalogRecordToOption` — validation and
mapping helpers, no query function). `register-sift-tools.ts` contains zero catalog references.
Change-set §19/§20 are entirely unmet, and §20 warns against the alternative of hard-coding a
car-specific contract: "Avoid making the generic WebMCP contract permanently car-specific... A
vehicle adapter may be pack-specific" but "avoid hard-coding the entire browser/client/domain layer
around `VehicleCatalog`" (`change-sets/2026-08-30-generic-decision-workspace.md:488-499`).

Change-set §17 asks for a pack-level "Decision Guide" — discovery questions, useful starter fields,
research categories, catalog filters, default comparison views — delivered to ChatGPT as structured
guidance, while drawing a hard line: "Do NOT implement this as hidden prompt injection or an attempt
to override host instructions... it must remain data, not executable prompts capable of overriding
system authority... do not attempt prompt injection... tool descriptions and structured tool outputs
remain the integration mechanism" (`change-sets/2026-08-30-generic-decision-
workspace.md:416-417, 897-900`). `PresentationDefinitionSchema`
(`packages/contracts/src/packs.ts:214-231`) currently declares exactly `optionLabel`,
`optionLabelPlural`, and `attributeGroups` — nothing resembling a Decision Guide exists in pack
metadata today.

Human authority is intact and tested, and this decision must keep it that way.
`webmcp-contract.test.ts:151-157` asserts the exact tool-name set — `expect(SIFT_WEBMCP_TOOL_NAMES).
toHaveLength(12)` — and a separate suite (`webmcp-contract.test.ts:236-279`) asserts no tool name is
approval-shaped and that none of the twelve ever calls `SiftCommands.reviewProposal`, the only method
that can approve a decision proposal.

Finally, WebMCP calls are unobservable. Change-set §34 requires the developer view to expose "WebMCP
tool calls; registered tools; tool inputs/results" among other runtime detail
(`change-sets/2026-08-30-generic-decision-workspace.md:726-736`), but nothing records this anywhere.
Every case-scoped tool's `call` closure invokes a `SiftCommands` method directly (e.g.
`register-sift-tools.ts:229`, `call: (input) => commands.upsertOption(input)`) — the identical HTTP
client the UI's own controls call, which is correct under CLAUDE.md's "Visible UI controls and
WebMCP callbacks use the same command implementation" rule, but it means there is only one code path
and nothing on it says which caller triggered a given command. `WebMcpToolCallContext`
(`apps/web/src/model-context/adapter.ts:56-59`) carries only `signal`. `CommandCallOptions`
(`apps/web/src/api/sift-client.ts:100-105`) carries only `signal` and an optional `commandId`
override — no field anywhere marks a call as WebMCP-originated. The server-side command route and
the runtime/activity event stores therefore cannot distinguish a WebMCP-originated command from a
UI button click, even though both already flow through the same `X-Sift-Command-Id` header
mechanism (`sift-client.ts:38-48`).

## Decision

1. **WebMCP becomes genuinely two-way.** Read capability is expanded to cover §14's full list —
   what the user wants, current options and selection, available comparison fields, custom fields,
   collected research, notes, unresolved questions, stale/conflicted state, the current
   recommendation, available actions, and the current workspace view. Concretely this means the two
   global read tools grow into a broader read surface, translating §52's proposed READ column to the
   `sift_` prefix: a widened `sift_get_case_context` (Decision 2), a Decision Guide read (Decision
   6), a generic catalog search (Decision 5), and read tools over research and notes once those
   concepts exist as persisted data. This ADR fixes the WebMCP *contract* shape; it does not itself
   specify the `CaseNote`/research event model change-set §28/§51 describes — that persistence
   design is a companion decision, not restated here.

2. **The case-context projection is widened.** `buildCaseContextSummary` stops deliberately
   excluding `sources`, `claims`, `evidenceLinks`, and `caseExtensions`. The widened projection adds
   `caseExtensions` so custom-field *definitions* become visible alongside the values that already
   leak through `EntityRecord.attributes`, and adds bounded projections of `sources`/`claims`/
   `evidenceLinks` so research and provenance are queryable rather than reconstructed from screen
   text. "Bounded" is not optional: source excerpts (up to 5000 characters each,
   `case.ts:162`) must be truncated or summarized in the projection, not included verbatim per
   source. No chain-of-thought, no secrets, and no oversized source bodies enter the projection —
   the existing exclusion rule that protects "private model messages" is preserved; only the
   deliberately-omitted `CaseState` fields are added back, and only in bounded form.

3. **Tools are classified by authority, and presentation tools cannot mutate decisions.** Four
   classes: READ (no mutation), WRITE (decision state — invalidates evidence/readiness/
   recommendation when the change is material), PRESENTATION (view/focus state only), EXECUTION
   (starts or steers a bounded engine run). This mirrors ADR 0005's persistence split at the tool
   layer: a presentation tool's `call` implementation is restricted to reach only
   `updateSelection()`/`SelectionPatch` (`case-store.ts:108-142`), which structurally cannot advance
   `eventSequence` or invalidate a recommendation, exactly as `sift_focus_option`/`sift_focus_evidence`
   already do today. A WRITE tool reaches `append()` and can invalidate. §53/§54's distinction —
   "Show only safety and cargo" is a presentation change, not "safety and cargo are all I care
   about" — is enforced by which command a tool's implementation is wired to call, not by hoping the
   tool description alone steers ChatGPT correctly.

4. **A narrower attribute-value operation is added.** `sift_upsert_option` keeps its current
   contract (whole-option create/replace), but a new `sift_set_option_attribute` tool is added for
   the case §25 describes: setting one attribute value (pack-defined or `custom.*`) with `status`
   (including `'unknown'`, matching `AttributeRecordSchema`'s existing support), `confidence`, and
   `sourceIds` all expressible on the call — the exact set `OptionAttributeInputSchema` cannot carry
   today. `AttributeRecordSchema` already supports every field this needs
   (`attributes.ts:162-201`); this decision changes only the command input contract, per the code's
   own comment at `command-service.ts:135-140` acknowledging that the input schema, not the storage
   model, is the bottleneck.

5. **Catalog search is exposed to ChatGPT generically.** A new tool — `sift_search_catalog`, not
   `sift_search_vehicles` — is added, with the active Decision Pack declaring catalog availability
   and its filter schema, per change-set §20. `@sift/catalog`'s vehicle-specific `searchVehicles`
   remains the car-purchase pack's adapter behind that generic contract; the WebMCP-facing tool name,
   input shape, and registration path are not vehicle-specific, so a future pack (e.g. laptops) can
   register the same tool name with a different filter set rather than requiring a parallel
   `sift_search_<domain>` tool.

6. **A pack-level Decision Guide, as declarative data.** Delivered through tool descriptions and
   structured tool output (progressive disclosure — not one large guide dumped into every response),
   not as a hidden system-prompt override. This is explicitly not prompt injection and not an
   attempt to override host instructions, per change-set §17/§47's own boundary: "it must remain
   data, not executable prompts capable of overriding system authority... tool descriptions and
   structured tool outputs remain the integration mechanism." The guide lives in pack metadata
   (extending `PresentationDefinitionSchema` or a sibling schema — the exact shape is a
   pack-authoring/contracts task, not restated here) and is exposed through a read tool, not injected
   into every other tool's response.

7. **Human authority is absolute and stays test-guarded.** No tool in the expanded catalog may reach
   `SiftCommands.reviewProposal`. `webmcp-contract.test.ts:236-279`'s guarantee — no approval-shaped
   tool name, and `reviewProposal` is never called by any registered tool — is preserved unchanged
   in kind. The exact-name-set assertion at `webmcp-contract.test.ts:151-157`
   (`toHaveLength(12)`) is deliberately tightened as tools are added: it must be updated to the new
   exact count and name list at each step, never loosened, relaxed to a substring check, or dropped.

8. **WebMCP calls become observable.** The command envelope gains an explicit origin marker —
   alongside the existing `X-Sift-Command-Id`/`Idempotency-Key` headers (`sift-client.ts:38-48`), a
   sibling marker (e.g. an `X-Sift-Command-Origin` header, or an equivalent field threaded through
   `CommandCallOptions` and `WebMcpToolCallContext`) records that a given command was issued by a
   registered WebMCP tool rather than a direct UI action. This does not create a second command path
   — every case-scoped tool still calls the identical `SiftCommands` method the matching UI control
   calls, satisfying CLAUDE.md's shared-command-implementation rule — it only tags the existing path
   so the server-side activity/runtime event stores, and therefore the Runtime Inspector's developer
   view (§34), can distinguish and display WebMCP-originated commands.

## Open question

§52's proposed catalog has no counterpart for `sift_list_packs` or `sift_select_pack`. Both exist
today (`register-sift-tools.ts:86,88`) and are fully implemented and tested, but the change set's
READ/WRITE/PRESENTATION/EXECUTION enumeration does not mention either, and nothing in the change set
says whether pack selection remains a WebMCP capability once a case is normally created through
`startCase`/the catalog flow (ADR 0003) rather than through pack selection on an empty case. This
ADR does not resolve their fate — implementing the expanded catalog requires an explicit decision
(carry both forward unchanged, retire one or both, or fold pack listing into a broader read tool)
before the tool set is finalized.

## Consequences

- `docs/specs/webmcp.md` must be rewritten: its "Tool catalog" section currently documents exactly
  twelve tools by exact input/effect shape, and every one of the eight decisions above changes that
  contract (new tools, a widened `sift_get_case_context` effect description, and a stated
  READ/WRITE/PRESENTATION/EXECUTION classification that does not exist in the spec today).
- `webmcp-contract.test.ts`'s exact-tool-set assertions (`:151-157`, `:236-279`) must be updated
  deliberately at each tool addition — new expected name, new expected length, new coverage for the
  no-`reviewProposal` and no-approval-shaped-name guarantees — never loosened into a subset or
  substring check.
- The tool catalog must stay comprehensible rather than fragmenting into dozens of tiny tools. §52 is
  explicit: "Keep the tool catalog understandable. Do not create dozens of tiny tools if a few
  coherent typed operations suffice" (`change-sets/2026-08-30-generic-decision-workspace.md:976-977`).
  Decision 4's `sift_set_option_attribute` and Decision 5's `sift_search_catalog` are each one new
  typed tool covering a class of calls, not one tool per field or per filter.
- Any new PRESENTATION-class state (view mode, pinned/visible comparison fields, board columns, Quick
  Pick position) should extend `SelectionPatch`/`CaseState` through the same `updateSelection()`
  mechanism ADR 0005 documents, rather than inventing a second non-event-sourced escape hatch.
- The origin-marker addition (Decision 8) is a small, additive change to the existing command
  envelope and client options interfaces; it does not require a second dispatch path or a change to
  how any existing tool calls its underlying `SiftCommands` method.

## Update (2026-08-30)

All eight decisions above are implemented. `docs/specs/webmcp.md` documents the resulting 22-tool
catalog (`SIFT_WEBMCP_TOOL_NAMES`), including `sift_set_option_attribute`, `sift_get_decision_guide`,
and `sift_focus_question` (Decisions 4 and 6, and the presentation gap this ADR's Decision 3 implied),
plus `sift_list_notes`/`sift_add_note` once the companion `CaseNote` persistence design this ADR
deliberately left unrestated (Decision 1's own caveat) landed separately. The origin marker (Decision
8) ships as an `X-Sift-Command-Origin` header recorded onto the activity trail's `safeDetails.origin`
— observability only, as specified, never a permission check. `POST /api/cases/:caseId/run` reads the
same header through the same reader and additionally records it on the durable `runs.origin` column,
so a run started by `sift_request_investigation` is distinguishable from one started by a click after
the fact, not only while the request is in flight. The "Open question" above (the fate of
`sift_list_packs`/`sift_select_pack`) remains genuinely open: both tools were carried forward
unchanged, which resolves nothing about their eventual fate one way or the other.
