# ADR 0005: Workspace View State and Option Views

Status: accepted
Date: 2026-08-30

## Context

`docs/change-sets/2026-08-30-generic-decision-workspace.md` ("the change set") reframes Sift as
a generic AI-assisted decision workspace and requires four distinct ways of looking at a case's
options — Quick Pick, List, Compare, and Board (§8–§12) — plus a shared, model-writable view state
so that "ChatGPT can manipulate the SAME view through WebMCP" and "focusing through WebMCP should
visibly focus the page" (§13). Its own pre-implementation audit,
`docs/audits/2026-08-30-generic-decision-workspace-audit.md` ("the audit"), inspected the live
code — not the build log, which it explicitly distrusts ("Do not infer implementation state from
old build-log entries if newer code differs," change-set §1) — and is the evidentiary basis for
this ADR. This work sits on top of ADR 0002 (answer-first layout) and ADR 0003 (vehicle catalog
and normal case creation); neither prior ADR introduced multiple views over options, so neither
had to decide how a view's state persists or whether existing multi-tab UI could be reused.

Before any option-view component could be designed, two questions had to be settled, because
getting either wrong would either violate a stated correctness requirement or waste the
implementation budget rebuilding something that looks reusable but is not.

**First: how does view state persist without becoming a decision mutation?** The change set states
this as a named risk, not a stylistic preference. §54, "UI action vs decision mutation": "Do not
confuse 'Show only safety and cargo.' with 'Safety and cargo are the only things I care about.'
The first changes presentation. The second changes criteria. WebMCP contracts and application UI
must preserve this distinction. This is a key correctness requirement." §32 restates the same
boundary through a worked example ("Forget fuel economy for now. Show me what my wife cares
about." should change comparison rows, "without necessarily changing the underlying Decision
Profile"). The audit confirms the codebase already has a mechanism built for exactly this
distinction: reading `apps/agent/src/store/case-store.ts:108-142` (audit §6), `SelectionPatch`/
`updateSelection()` is "a deliberate, documented escape hatch for `CaseState` fields no
`CaseEvent` touches," and the audit calls this "the single most valuable architectural finding in
the audit" precisely because "presentation state → `updateSelection()` → cannot advance sequence,
cannot invalidate a recommendation" while "decision state → `append()` → real event, real
sequence, real invalidation." The audit also confirms, by direct search, that no view-state
contract exists yet at all: "searched `workspaceview|viewmode|quickpick|visibleattributeids|
pinnedattributeids|boardcolumn|headtohead`, zero matches, positive control `selectedOptionId` → 24
matches. `CaseStateSchema` (`packages/contracts/src/case.ts:315-348`) has no view/mode/sort/filter
field." Independently confirmed by reading `packages/contracts/src/case.ts:315–348` directly: the
`.strict()`-validated `CaseStateSchema` object has no field for it today.

**Second: is `FindingsSheet`'s existing three-tab List/Table/Kanban a foundation for the four new
option views?** Superficially it looks like one — it already has a Radix `Tabs`-driven sheet with
three named views. The audit warns against this reading directly: "Critically —
`FindingsSheet`'s List/Table/Kanban is NOT a foundation for §8–§12... Treating this as 'we already
have three views' would be a planning error" (audit §5). Reading
`apps/web/src/components/FindingsSheet.tsx` in full confirms the audit's claim rather than merely
repeating it. Its own header comment describes it as "The 'What Sift found' review surface"
(`FindingsSheet.tsx:2`), reached "from the closed-by-default `DisclosureSection` row" of ADR
0002's answer-first layout. Its `FindingsSheetProps.items` is `EvidenceItemData[]`
(`FindingsSheet.tsx:44–51`); `countByDisposition`/`groupByDisposition`
(`FindingsSheet.tsx:73–93`) key exclusively off `item.evidenceLink.disposition`; the Kanban tab's
three columns are literally `EVIDENCE_DISPOSITIONS` — `included`/`excluded`/`questioned`
(`FindingsSheet.tsx:157–161`, `246–248`) — an evidence-review vocabulary, not an option-status
vocabulary. Every row in every tab renders `claim?.statement ?? evidenceLink.summary`
(`FindingsSheet.tsx:224`, `263`), never an `EntityRecord` field. No `EntityRecord` type is
imported anywhere in the file. `OptionComparison.tsx`, by contrast, genuinely does iterate options
(`EntityRecord[]`, `OptionComparison.tsx:26`) and attribute definitions
(`AttributeDefinition[]`, `:27`) — but its props are exactly
`{ options, attributeDefinitions, presentation, selectedOptionId }`
(`OptionComparison.tsx:25–31`), with no prop, hook, or local state anywhere in the file that
narrows which options or which attribute rows render: every applicable option becomes a column
(`OptionComparison.tsx:125–148`) and every applicable attribute definition becomes a row
(`:163–205`) unconditionally.

**Third, confirmed directly rather than only via the audit:** narrow and expanded modes do not
exist as distinct information architectures today. `apps/web/src/app/App.tsx:671` hard-codes
`max-w-[480px]` on the case workspace's root `<div>` with no responsive breakpoint variant
alongside it; the same literal `max-w-[480px]` appears with no breakpoint override in
`apps/web/src/components/VehicleCatalogFlow.tsx:237` and
`apps/web/src/components/DemoLauncher.tsx:111`. A repository-wide search of `apps/web/src` for
`matchMedia` or `useMediaQuery` returns zero matches. Whatever a desktop viewport currently
renders is the identical narrow-pane layout, capped at the same 480px, never given a second
information architecture.

## Decision

1. **`WorkspaceViewState` is added to `CaseState` and persists exclusively through the existing
   `SelectionPatch`/`updateSelection()` path — no new `CaseEvent` variant is introduced for it.**
   This is the central decision this ADR records. `case-store.ts`'s own module comment on
   `SelectionPatch` states the mechanism precisely: "a narrow, separately-documented escape hatch
   for `CaseState` fields no `CaseEvent` variant ever touches: `selectedOptionId`/
   `selectedEvidenceId`/`activeFocus`, and `sources`" (`case-store.ts:109–111`), because
   "`CaseEventSchema`'s discriminated union... has *no* event variant that ever touches these
   fields at all — `applyCaseEvent`'s `switch` has no case that sets `selectedOptionId`,
   `selectedEvidenceId`, `activeFocus`, or `sources` for any of its twelve event types"
   (`:116–119`). Critically, the comment states what `updateSelection()` does *not* do: it "patches
   the field(s) directly and persists the resulting snapshot, but does **not** append any
   `case_events` row and does **not** advance `eventSequence` — there is no domain event to
   record" (`:126–129`), while it "still supports the same idempotency-key deduplication `append()`
   does (sharing the same `idempotency_keys` table/mechanism)" (`:130–132`), so a retried WebMCP
   `set_view`/`focus_option` call is still safe under duplicate delivery. `WorkspaceViewState`
   becomes a fifth field carried by `SelectionPatch` (`case-store.ts:137–142` today declares
   exactly `selectedOptionId`, `selectedEvidenceId`, `activeFocus`, `sources`), written by the same
   `updateSelection()` call `command-service.ts` already uses for focus and selection today.

   The reason this is the correct design, not merely a convenient reuse of existing plumbing, is
   that it makes change-set §54's requirement ("presentation filtering ≠ criterion mutation... a
   key correctness requirement") true *by construction* rather than by convention. `append()` is
   documented as "the sole write/read path" through which "every canonical mutation in Sift flows"
   (`case-store.ts:8`), and it is `append()` — not `updateSelection()` — that runs events through
   `applyCaseEvent`, advances `eventSequence`, and is the only pathway any recommendation-staleness
   or readiness-invalidation logic is wired to observe (the audit independently confirms, at §7,
   that today only `updateCriteria` and `setEvidenceDisposition` invalidate a recommendation,
   because those are the only two command handlers that call `append()` with an event that changes
   decision-relevant state). A view change routed through `updateSelection()` therefore cannot
   reach any invalidation logic at all — not because a developer remembered to exclude it, but
   because the code path that performs invalidation is never invoked for a selection-only patch.
   This is a stronger guarantee than a written rule a future contributor could violate by adding an
   `if` branch in the wrong place; it is a guarantee enforced by which store method a command
   handler calls. That is why no new `view.changed`-style `CaseEvent` is introduced: adding one
   would route view changes back through `append()`/`applyCaseEvent`, reopening exactly the
   coupling this decision exists to close.

2. **Four option views exist, each answering a different question posed directly by the change
   set, not four cosmetic renderings of one data set.** §8 states this as a requirement: "These are
   not cosmetic renderings of identical information — each solves a different decision task."
   Quick Pick (§9) is the triage question — "a single option should dominate the pane," with
   Pass/Maybe/Shortlist actions, aimed at a user who wants to be shown one option at a time rather
   than asked to scan a table. List (§10) answers "*Tell me about each option*": a compact,
   information-dense card per option showing "identity; price; high-value attributes; strengths;
   concerns; unresolved information; current fit; relevant source-backed findings," explicitly not
   "dumping every available field." Compare (§11) answers "*How do these options differ?*" through
   a configurable table/head-to-head view. Board (§12) answers "*Where does each option currently
   stand?*" through movable status columns ("Considering; Top choices; Need to verify; Out"),
   distinct from Compare because it represents decision-narrowing progress rather than attribute
   values. Because each view targets a different task, `WorkspaceViewState.mode` is a closed union
   (`'quick_pick' | 'list' | 'compare' | 'board'`, per the change set's own sketch at §13) rather
   than a set of independently-toggleable display flags on one component.

3. **`FindingsSheet` is retained unmodified in its current role — reviewing evidence — and is not
   repurposed into any of the four option views.** The audit's own conclusion is adopted directly:
   treating its three tabs as "we already have three views" "would be a planning error" (audit
   §5). The evidence for this is in the file itself, not only in the audit's summary of it: every
   view in `FindingsSheet.tsx` iterates `EvidenceItemData[]` and keys off
   `evidenceLink.id`/`evidenceLink.disposition`/`claim.statement`
   (`FindingsSheet.tsx:44–51, 73–93, 213–224, 257–263`); its Kanban columns are the evidence
   dispositions `included`/`excluded`/`questioned` (`:53–63, 157–161, 246–271`), a concept that
   describes whether a piece of evidence is trusted, not where an option stands in a decision; and
   no `EntityRecord` — the option type `OptionComparison` genuinely iterates — appears anywhere in
   the file. What *does* carry forward from `FindingsSheet` into the new option-view components is
   narrower than "the component": the `Sheet`/`SheetContent`/`SheetHeader`/`SheetBody` shell
   (`apps/web/src/components/ui/sheet.tsx`) and the Radix `Tabs`/`TabsList`/`TabsTrigger`/
   `TabsContent` mechanism it composes (`FindingsSheet.tsx:35–42`) are generic UI primitives worth
   reusing as a container; the row/column iteration logic inside each tab is not, and must be
   written fresh against `EntityRecord`/`AttributeDefinition` for List, Compare, and Board.
   `FindingsSheet` keeps its existing `EvidenceItemData` contract, `data-testid`s, and test suite
   untouched by this change.

4. **Narrow and expanded modes are two intentional information architectures, not one layout
   scaled by CSS breakpoint — and today neither the distinction nor a breakpoint mechanism exists
   at all.** `apps/web/src/app/App.tsx:671`, `VehicleCatalogFlow.tsx:237`, and
   `DemoLauncher.tsx:111` all hard-code an identical `max-w-[480px]` with no `md:`/`lg:` override
   anywhere alongside it, and a search of `apps/web/src` for `matchMedia`/`useMediaQuery` returns
   zero matches — confirmed directly, not merely accepted from the audit. The change set requires
   the opposite of today's single-width layout: "Responsive behavior must alter INFORMATION
   ARCHITECTURE where appropriate, not merely CSS widths. Example: at expanded width 4 vehicle
   columns may be useful; at 390px a two-option head-to-head comparison may be far more usable"
   (§7). This ADR records that building expanded mode is from-scratch construction for each
   view, not a refinement of an existing responsive rule set: Compare's narrow mode is a two-option
   head-to-head selected from `compare.optionIds`, its expanded mode is a multi-column table over
   `visibleOptionIds`; Board's narrow mode is likely one column at a time with paging controls,
   its expanded mode all configured columns side by side; Quick Pick is narrow-native and, per
   §6/§7, is not expected to grow a meaningfully different expanded-mode layout beyond more
   surrounding context. No existing component or hook in `apps/web/src` provides a starting point
   for the width-detection mechanism itself; introducing it (a `useMediaQuery`-style hook keyed to
   the same 390/430/480/expanded set of viewports `testing.md` already treats as canonical) is new
   surface area this ADR authorizes.

5. **Comparison configurability — which options and which attribute rows are visible, which rows
   are pinned, sort order, and filters — is a first-class, WebMCP-addressable contract, not a
   later UI nicety.** The change set states the requirement directly at §11: "the model must be
   able to configure which fields/rows appear," illustrated by "Show me the three finalists and
   only the things that matter most to me," and again at §58 as a "deliberate showcase" demo
   moment where ChatGPT "changes view to Compare; limits candidates; sets visible rows; includes
   dynamic custom fields; page visibly reconfigures without click automation." `OptionComparison`
   as it exists today cannot do any of this: its full prop list is `options`,
   `attributeDefinitions`, `presentation`, `selectedOptionId`
   (`OptionComparison.tsx:25–31`), and its rendering logic unconditionally maps every option in
   `options` to a column (`:125–148`) and every attribute definition applicable to those options'
   kinds to a row (`:77–82, 163–205`) — there is no prop, piece of local state, or hook anywhere in
   the file that could narrow either axis. `WorkspaceViewState.compare` (per the change set's
   sketch at §13: `optionIds`, plus the outer `visibleAttributeIds`/`pinnedAttributeIds`/`sort`/
   `filters`) becomes the source that a rebuilt comparison component reads to decide which columns
   and rows to render, and a WebMCP presentation tool (`sift_configure_comparison`, per §52,
   specified in the sibling ADR 0006) writes it through the exact `updateSelection()` path decided
   in §1 above — so that reconfiguring what is visible can never, by construction, also mutate
   `criteria`.

6. **Custom (`custom.*`) fields render as ordinary comparison rows, subtly marked as added for
   this comparison, and their raw ids never reach consumer UI.** §26 states this precisely: custom
   fields must not render "as weird developer extensions," should be indicated with something like
   a "`Custom`" badge or "small sparkle/icon" meaning "Added for your comparison," and "Do not
   expose raw IDs such as `custom.laptop_work_fit` in normal UI." Today there is no mechanism to
   make this distinction, confirmed by reading the schema, not only the UI: the base
   `AttributeDefinitionSchema` that `CaseState.attributeDefinitions` is typed as
   (`packages/contracts/src/case.ts:322`, `packages/contracts/src/attributes.ts:220–233`) carries
   no origin or custom marker at all — that provenance (`origin`, `confirmation`, `proposedBy`,
   `createdAt`) exists only on the separate `CaseAttributeDefinitionSchema`
   (`attributes.ts:258–266`), which extends the base schema but is not the type
   `CaseState.attributeDefinitions` actually stores, and lives cross-referenced instead inside
   `caseExtensions` (`case.ts:326–335`). `OptionComparison` is never even passed `caseExtensions`
   as a prop, so it has no way to look this provenance up even if it wanted to; today it can only
   render `definition.label` (`OptionComparison.tsx:180`) identically for a pack-native and a
   case-defined attribute. The `custom.` id namespace itself is validated but, per its own schema
   comment, "this id is rendered directly in the generic UI" (`attributes.ts:247`) with no
   humanizing step today. The new comparison component must therefore recognize the `custom.`
   prefix (or, more robustly, cross-reference `caseExtensions` by `attributeDefinitions[].id`) to
   apply the visual "Added for your comparison" marker and to substitute the field's human
   `label` for its id everywhere a raw id might otherwise leak.

7. **What persists versus what is ephemeral follows §50 directly.** View mode, the focused option,
   visible/pinned attribute ids, board column placement per option, and Quick Pick queue position
   all persist via `updateSelection()` (durable, survives reload) because §50 either requires or
   strongly favors it: "Must persist... Questions/obligations; recommendation; human decision" sit
   alongside "Likely persist or restore: selected option; current view; visible comparison fields;
   shortlist categories; Quick Pick status — if these are important to shared WebMCP context," and
   they are — §13 requires that "case data must remain distinct from ephemeral presentation state
   where appropriate" while simultaneously requiring that the browser and ChatGPT share the same
   view, which is only possible if that shared state outlives a single request. §50's closing line
   states the exclusion directly: "Avoid storing purely transient animation details. The browser
   and ChatGPT must agree on shared focus/view state" — so hover state, in-flight swipe/drag
   animation, and any other per-render visual transition stay as local React component state and
   never touch `CaseState` or `WorkspaceViewState`.

## Consequences

- `CaseStateSchema` (`packages/contracts/src/case.ts:315–348`) gains a `view` field. It is both
  `.optional()` and `.nullable()`, which is a deliberate departure from `activeFocus`'s plain
  `.nullable()` pattern at `case.ts:341`: `activeFocus` has existed since the first migration, so
  every persisted snapshot already carries the key, whereas `view` is added to a schema that must
  keep parsing snapshots written before it existed. A plain `.nullable()` would have made every
  pre-existing row fail validation on read. Covered by a test that parses a snapshot with no `view`
  key at all. Every
  place in the codebase that treats a `CaseState` diff as evidence of a decision change —
  Runtime Inspector state diffs, any future "case changed" WebMCP notification, and recommendation
  staleness checks — must treat `view` the same way it must already implicitly treat
  `selectedOptionId`/`selectedEvidenceId`/`activeFocus`/`sources`: a field whose change is not a
  decision event. Because those fields only ever change through `updateSelection()`
  (`case-store.ts:255–262`), which never advances `eventSequence`, this exclusion is structural
  for `view` too rather than something each future consumer must independently remember.
- `SelectionPatch` (`case-store.ts:137–142`) and `updateSelection()`'s call sites in
  `command-service.ts` both grow a `view` parameter; `memory-case-store.ts` and
  `sqlite-case-store.ts` both need the corresponding patch-and-persist logic, and the shared
  `case-store-contract.ts` suite — which the audit notes already proves `activeFocus`'s identical
  plumbing works (`case-store-contract.ts:361–406`) — gains the equivalent coverage for `view`.
- The WebMCP presentation tools recorded in ADR 0006 (`sift_set_view`, `sift_focus_option`,
  `sift_configure_comparison`, and any Quick Pick/board-configuration equivalent) all depend on
  this contract: they are specified to write through `updateSelection()`, never `append()`, and
  §1's guarantee — that a selection-only patch cannot reach recommendation-invalidation logic — is
  the property that makes it safe for those tools to be called freely and repeatedly without
  human confirmation, unlike `sift_update_criteria` or `sift_submit_source`.
- `OptionComparison.tsx` (or its successor component built for this change set) requires real
  rewritten logic, not additive props: today's unconditional "every option is a column, every
  applicable attribute is a row" rendering (`:125–148`, `:163–205`) must be replaced with rendering
  driven by `WorkspaceViewState.compare.optionIds`, `visibleAttributeIds`, `pinnedAttributeIds`,
  `sort`, and `filters`, plus the `custom.*` marking logic from Decision 6.
- `FindingsSheet.tsx` is unchanged by this ADR; its 9-plus existing tests and `EvidenceItemData`
  contract remain the source of truth for evidence review, separate from the new List/Compare/
  Board option-view components' own test suites.
- Building genuine narrow/expanded information architectures (Decision 4) requires a new
  width-detection mechanism in `apps/web/src` (none exists today) and, per view, a deliberate
  narrow-mode layout distinct from its expanded-mode layout — this is new implementation surface,
  not a CSS-only follow-up, and should be scoped and tested per view rather than as one shared
  "responsive" pass.
