# Pre-implementation audit — Generic Decision Workspace change set

Status: **complete**
Date: 2026-08-30
Audits: `docs/change-sets/2026-08-30-generic-decision-workspace.md` §1 (mandatory pre-implementation audit)
Baseline commit: `9a16c30` — `pnpm verify` green 10/10 at this commit.

## Method and confidence

Three parallel audits inspected the live code, not the build log (§1 explicitly forbids inferring
state from old build-log entries). Every load-bearing claim below was **independently re-verified**
by the orchestrator before being recorded here; claims are labelled `VERIFIED` where a second,
separate check was run, and `REPORTED` where they rest on a single audit pass.

Searches used `/usr/bin/grep` by absolute path — the bare `grep` in this environment is a `ugrep`
wrapper that silently under-reports — and every "zero matches" conclusion is paired with a named
positive control. Where a check produced a shell error rather than a real negative, it was re-run
rather than recorded as an absence.

---

## 1. The headline finding: the implementation has drifted from its own spec

`docs/specs/product.md:55-69` is the authoritative contract for the workspace. It specifies **9
regions**, with "Our pick" third, and states two acceptance properties directly:

> "This is deliberately the first substantial content the user reaches."
> "…primary actions remain visible without scrolling."

The shipped implementation renders **11 regions**. Two of them — `WorkspaceStatusHeader` (the
4-stage tracker + next-step banner) and `WebMcpStatus` — appear in **no spec and no ADR**. `VERIFIED`:
a repo-wide search of `docs/` finds `WorkspaceStatusHeader` mentioned only in `docs/build-log.md`,
which is a narrative log, not a contract.

Measured consequence, at 430px against the real production build: the page is **2040px tall and
"Our pick" begins at roughly y=950** — below the fold on a 900px pane. Reaching the answer requires
scrolling past the case header, the tracker, the WebMCP notice, and a "What Pax is doing" card that
(see §4) is structurally incapable of saying anything.

This matters beyond the immediate defect. `docs/decisions/0002-answer-first-workspace-layout.md`
exists **because the project owner reported this exact problem before**, in those words: *"a full
scroll to reach the recommendation on every case — a real usability defect the project owner
identified directly against the live product."* The fix was specified, then silently regressed by
later additions.

**Root cause is process, not code.** Two regions were added to the primary workspace without
updating `product.md`'s region list, violating `docs/engineering-principles.md`'s rule *"update the affected spec before
changing acceptance behavior."* Nothing in the test suite measures whether the answer is above the
fold, so no gate caught it.

**Required remediation:** the corrected layout needs a machine-checked invariant, not just a
corrected spec — an assertion that the recommendation region's top edge falls within the first
viewport height at 390/430/480. Without that, this regresses a third time.

---

## 2. The consumer UI renders eleven regions unconditionally

§5 of the change set: *"Do not render an empty conceptual region merely because CaseState contains a
corresponding field."*

`REPORTED` — eleven regions render a full card/heading regardless of content:

| Region | Empty copy shown |
|---|---|
| `ApprovalCard.tsx:114` "Your decision" | "No proposal is pending review yet." |
| `RecommendationCard.tsx:107` "Our pick" | "No recommendation yet…" |
| `CaseExtensionReviewCard.tsx:82` "Proposed concern" | "No agent-proposed concern is pending review." |
| `LiveRunStatus.tsx:73` "Latest command" | "No command has been sent yet." |
| `ReadinessPanel.tsx:179` "Still checking" | "No case is open yet…" |
| `ActivityTimeline.tsx:178` "Pax's work so far" | "No case is open yet…" |
| `OptionEditor.tsx:132` | "No candidates entered yet…" |
| `OptionComparison.tsx:105` | "Add at least one candidate…" |
| `FindingsSheet.tsx:144` | "No evidence has been gathered yet." |
| `App.tsx:728` "What Pax is doing" | "Nothing is being actively investigated right now." |
| `EvidenceList.tsx:68` | *(orphaned — never mounted, see §5)* |

This is the literal "stack of unrelated cards" §62/§64 names. Worse, two of these cards are
**structurally guaranteed** to be empty (§4).

---

## 3. Raw internal identifiers leak to end users — two independent root causes

Both `VERIFIED` by direct file inspection.

**Cause A — the recommendation rationale is a hand-authored literal containing raw IDs.**
`apps/agent/src/runtime/scripted-beats/car-purchase.ts:509`:

```
'Recommend candidate-rav4 per source-national-crash-safety-consortium,
 source-northfield-vehicle-safety-lab, and source-consumer-drive-index -- …'
```

This string is assigned verbatim to `Recommendation.rationale`
(`car-purchase-scenario.ts:737`) and rendered raw by `RecommendationCard.tsx:153`. The same file
proves real names *were* available at authoring time (line 121 uses "2022 Toyota RAV4 XLE Hybrid
AWD") — they simply were not substituted here. The identical pattern exists in
`scripted-beats/home-energy-guardian.ts:163`.

**Cause B — `Source.title` is assigned the source's own ID, discarding real fixture metadata.**
`apps/agent/src/runtime/car-purchase-scenario.ts:205-214` builds every `Source` with
`title: sourceId` and a synthesized `url`, throwing away what the fixture actually contains
(`packages/scenarios/fixtures/car-purchase/safety-reliability-sources.json`): `publisherName`
("National Crash Safety Consortium"), `reportTitle` ("Compact and Midsize Crossover Crashworthiness
Ratings, Model Years 2022-2023"), a real `url`, `publishedAt`, `retrievedAt`, `methodologyNote`.

Aggravating detail: a correct publisher mapping **already exists and is used** (`publisherFor()`,
`car-purchase-scenario.ts:155-172`) — but `RecommendationCard.tsx:251` renders `source.title`, the
one field that is broken. `home-energy-guardian-scenario.ts:113-119` imports and reuses this exact
function, so it inherits the defect, and its source IDs match none of `publisherFor`'s branches,
falling through to the generic `'Fixture source (fictional)'`.

**Neither cause is a rendering bug.** `RecommendationCard` is a faithful renderer of bad input. The
fixes belong in the scenario/scripted-beat layer, and no ID→label resolution helper exists anywhere
in the repo to paper over it (`REPORTED`: searched `labelFor|resolveLabel|entityLabel|idToLabel|…`,
zero matches, positive controls `candidateLabel` → 2 hits and `publisherFor` → 8 hits both
confirmed the search worked).

---

## 4. Two subsystems are dead in production while the UI still renders them

**`CaseState.activeFocus` can never be non-null in production.** `VERIFIED` by direct search: the
only production writes are `create-case.ts:70` and `reducer.ts:76`, both setting `null`. The store
layer *supports* writing it (`memory-case-store.ts:169`, `sqlite-case-store.ts:310`) and a contract
test proves the plumbing works (`case-store-contract.ts:361-406`) — but **no production caller ever
passes it**. Positive control: `selectedOptionId` is genuinely written at
`command-service.ts:495`.

Consequence: `App.tsx:703-727`, which renders the focused obligation, active skill, and active
specialist, is unreachable code. Every user has always seen the empty branch: *"Nothing is being
actively investigated right now."*

**Four of six `CaseStatus` values are never assigned.** `REPORTED` — the only status writes in the
entire repo set `'draft'` (at creation) and `'decided'` (on approval, `reducer.ts:194-203`).
`'investigating'`, `'waiting'`, `'ready'`, and `'failed'` are declared in the contract and have full
label coverage in `CaseHeader.tsx:50-57`, but nothing produces them. This is why the header badge
reads **DRAFT** beside a completed investigation and a ready recommendation — `recommendation.ready`
does not touch `status` at all.

**Disposition.** The project owner's direction is explicit: *"If they arent getting changed then
remove them."* Applying that literally to each:

- The **unused `CaseStatus` values** are removed. §37 replaces this lifecycle vocabulary wholesale
  (Find / Shortlist / Compare / Review / Decide), so the old enum members have no future.
- **`activeFocus` is retained but must be genuinely populated.** It is not "unchanged": §39 asks for
  exactly this capability in consumer language (*"Currently checking — Whether the Forester's lower
  price still holds after dealer fees"*). The store plumbing already exists and is tested, so the
  work is wiring a real writer, not building a subsystem. What gets **deleted** is the current dead
  rendering; what replaces it must derive from real data or not render at all.

This distinction is recorded here rather than decided silently, because "remove it" and "make it
true" produce very different products, and §39 is the tiebreaker.

---

## 5. What genuinely exists and is reusable

The engine underneath is sound. This change set is a presentation and contract expansion, **not** a
core rewrite — a finding worth stating plainly, because it bounds the risk.

**Reuse as-is:** the deterministic core (reducer, readiness, policy, evidence governance);
`DynamicAttributeField.tsx` (10 typed variants, pure, no domain coupling);
`attribute-value-format.ts`; `activity-labels.ts` — notably this **already is** the
internal→consumer mapping layer §48 asks for (`intervention.guided` → "Agent redirected"); the 13
shadcn `ui/` primitives; `AppProviders`; `WebMcpStatus` (already matches §45's "keep subtle").

**Reuse with changes:** `OptionComparison` (correct concept — it is genuinely over options, not
evidence — but has zero configurability); `OptionEditor`; `RecommendationCard`; `ApprovalCard`
(human-only `actor` is hard-coded with no prop to override — structurally correct);
`CustomConcernForm` and `CaseExtensionReviewCard`, which **already implement a real portion of
§22/§23** including the user-originated vs agent-proposed confirmation split; `RuntimeInspector`,
which already **is** §33's developer view and needs extension, not replacement.

**Repurpose (structurally useful, aimed at the wrong concept):** `App.tsx`'s stacked-card
composition; `CaseHeader`; `WorkspaceStatusHeader` + `workspace-status.ts`; `ReadinessPanel`
(→ §40's "To Check"); `ActivityTimeline` (this is developer content sitting in the consumer
workspace); `LiveRunStatus`; `EvidenceCard`.

**Retire:** `EvidenceList.tsx` — `VERIFIED` orphan. It is imported by nothing; every surviving
reference is a code comment or a stale test *name* in `App.test.tsx:409`. 9 tests attached.

**Critically — `FindingsSheet`'s List/Table/Kanban is NOT a foundation for §8–§12.** `REPORTED` with
strong evidence: all three views iterate `EvidenceItemData` and key off `evidenceLink.id` /
`evidenceLink.disposition` / `claim.statement`. The kanban's columns are
`included`/`excluded`/`questioned` — an evidence-review concept, not option status. No
`EntityRecord` appears in the file. The Sheet shell and Radix `Tabs` mechanism carry forward; the
row/column iteration must be rewritten against options. Treating this as "we already have three
views" would be a planning error.

---

## 6. Contracts: what the change set needs that does not exist

**No workspace view state exists at all.** `REPORTED` — searched
`workspaceview|viewmode|quickpick|visibleattributeids|pinnedattributeids|boardcolumn|headtohead`,
zero matches; positive control `selectedOptionId` → 24 matches. `CaseStateSchema`
(`packages/contracts/src/case.ts:315-348`) has no view/mode/sort/filter field.

**But the architecture already provides the right seam for it.** `VERIFIED` by reading
`apps/agent/src/store/case-store.ts:108-142`: `SelectionPatch`/`updateSelection()` is a
deliberate, documented escape hatch for `CaseState` fields no `CaseEvent` touches. It **persists
durably** to the snapshot (survives reload) but **appends no `case_events` row and never advances
`eventSequence`**, while still honouring idempotency keys.

This is the single most valuable architectural finding in the audit. §54 makes
"presentation ≠ decision mutation" a stated correctness requirement, and the codebase already
enforces exactly that split at the persistence layer:

- presentation state → `updateSelection()` → cannot advance sequence, **cannot invalidate a recommendation**
- decision state → `append()` → real event, real sequence, real invalidation

`WorkspaceViewState` therefore follows an existing, tested pattern rather than requiring a new
concept. `focusOption`/`focusEvidence` already travel this path.

**`UpsertOptionInput` cannot express what §24/§25 require.** `REPORTED` with the schema quoted
(`packages/contracts/src/commands.ts:99-122`): `OptionAttributeInputSchema` carries
`definitionId`, `label`, `value`, `sourceIds` — and `value` is **required**. There is no way to
submit "this attribute is deliberately unknown", and no `confidence` or `status` field, so a caller
cannot preserve evidence status. `AttributeRecordSchema` **does** support
`status: 'asserted'|'supported'|'verified'|'conflicted'|'unknown'`, `confidence`, `origin`, and
`sourceIds` — the storage model is adequate; the **command input is the bottleneck**. This
substantiates §25's own suspicion and justifies a narrower `set_option_attribute` operation.

**Missing from `AttributeRecord` for §24:** no structured uncertainty (why unknown / what would
resolve it) and no method-of-determination distinguishing specification research from human
observation — precisely the distinction §24 and §26 require ("likely" vs "verified comfortable").

**Case context is far too thin for §14.** `buildCaseContextSummary`
(`apps/web/src/model-context/case-context.ts:74-99`) deliberately excludes `sources`, `claims`,
`evidenceLinks`, and `caseExtensions`. Consequences: research is invisible to ChatGPT; stale/
conflicted state is invisible; and **custom-field definitions are invisible** — because
`extension.defined` writes only to `caseExtensions` (`reducer.ts:149-153`), never to
`attributeDefinitions`. Custom-field *values* do leak through inside `EntityRecord.attributes`,
so the model can see a `custom.*` value with no way to learn what the field means.

Gap against §14's fourteen required items: 5 present, 3 partial, **6 absent** (what the user wants,
custom fields, research, notes, available actions, current view).

**WebMCP tool catalog.** 12 tools today. Of §52's proposed catalog, **10 are missing entirely**:
`get_decision_guide`, `search_options`, `get_option_details`, `list_research`, `list_notes`,
`set_option_attribute`, `add_note`, `focus_question`, `set_view`, `configure_comparison`. Two
existing tools (`list_packs`, `select_pack`) have no counterpart in §52 — their fate is
**unresolved by the change set text** and needs an explicit decision.

**Human authority is intact and tested.** `webmcp-contract.test.ts:256` asserts no tool ever calls
`reviewProposal`. This guarantee must survive the expansion; the test is the guard.

**Catalog is unreachable from WebMCP.** `REPORTED` — `@pax/catalog`'s query surface is imported only
by `apps/agent/src/routes/catalog*.ts`; `apps/web` imports only `@pax/catalog/browser` (validation
and mapping helpers, no `searchVehicles`). `register-pax-tools.ts` contains zero catalog references.
§19/§20 are entirely unmet.

**No note concept exists.** `REPORTED` — zero matches for `casenote|note\.created|note\.updated`.

**Events.** 13 `CaseEvent` types. Nothing covers notes, workspace view, scoped attribute-value
updates (`option.upserted` replaces a whole `EntityRecord`), or research linkage. Migrations are
hand-run drizzle-kit SQL against a content-hashed `schema_migrations` ledger; adding a persisted
concept follows an established memory-store + sqlite-store + shared contract-test pattern.

**Test surface that will need updating:** `webmcp-contract.test.ts:151-157` asserts the **exact**
12-name tool set and `toHaveLength(12)`. This is correct and should stay strict — it simply must be
updated deliberately as tools are added, never loosened.

---

## 7. The custom-field and research pipelines are incomplete end-to-end

This is the most consequential functional finding in the audit, and it directly undercuts the
change set's two hero capabilities (§22 custom fields, §27 research). All `REPORTED` from direct
code reads, high confidence.

**§23's agent-proposed path is unreachable through the wired command.**
`DefineCaseAttributeInputSchema` (`commands.ts:161-167`) carries **no `origin` field at all**, and
the handler hardcodes `origin: 'user'` (`command-service.ts:517`). The domain layer fully supports
`agent_proposed` → `confirmation: 'pending'` (`packages/core/src/extensions.ts:79-196`, well
tested), and the human review path is completely wired (`reviewCaseExtension`, emitting
`extension.confirmed`). Only the command input is missing the field. `CaseExtensionReviewCard`
therefore renders a review UI for a state nothing can currently produce.

**A custom field never creates an obligation.** `extension.defined`/`extension.confirmed` only
upsert the `caseExtensions` array (`reducer.ts:149-173`). `deriveObligations`
(`packages/core/src/obligations.ts:92-119`) *does* natively support turning a
`CaseExtensionObligationTemplate` into a live `ObligationState`, and `criterionNeedsEvidenceQuestion`
(`criteria.ts:249-267`) exists as the pure predicate — but `deriveObligations` is never called from
`command-service.ts` (zero matches). So change-set §60's required custom-field lifecycle step 6
("case obligation created if needed") has no implementation path.

**A populated custom value cannot carry the provenance §24 demands.** The wire format looks
adequate — `OptionAttributeInputSchema` accepts `definitionId` (works for `custom.*`), `value`,
`sourceIds` — and `createAttributeRecord` (`packages/core/src/attributes.ts:382-407`) is a general
constructor accepting `status`/`confidence`/`origin`. But the call site
(`command-service.ts:416-426`) **hardcodes `origin: 'user'` and `status: 'asserted'`, and drops
`confidence` entirely**, while the schema makes `value` required. Net effect, confirmed by the
code's own comment at `command-service.ts:135-140`: an attribute with `status: 'unknown'` can only
be produced by direct fixture seeding, never by any live command. §24 requires exactly the
opposite — agent-origin attribution, retained confidence, and explicit unknowns.

**Populating a custom field does not invalidate the recommendation.** Only `updateCriteria`
(`command-service.ts:809-811`) and `setEvidenceDisposition` (`:945-947`) invalidate. Neither
`upsertOption` nor `defineCaseAttribute`/`reviewCaseExtension` does.

**`submitSource` silently discards submitted claims.** `SubmitSourceInputSchema` accepts
`source.claims[]` with `statement` and `appliesToEntityIds` — and the handler
(`command-service.ts:854-900`) **parses but never uses them**. No `Claim` record is created, no
option linkage happens. Per the code's own comment (`:50-54`), the schema carries no `obligationId`
to link them to. The `Source` itself does persist correctly with `origin`/`verification`
provenance and survives reload. But §27's core promise — that model-gathered research becomes
durable, option-linked, queryable findings — is unmet at the claim level.

**Runtime Inspector is a two-tab slice, and WebMCP calls are invisible to it.** It renders Overview
and Timeline only (by deliberate design, per its own header comment). `stateDiff` is a **dead field
end-to-end** — declared on `RuntimeDebugEvent`, never populated by any producer, never rendered.
`redactions` is genuinely populated (`event-normalizer.ts:94-183`) but never surfaced. Graph and
Swarm events *are* emitted with real category literals, but have no visualization.

Most importantly for §34: **no WebMCP tool call is recorded anywhere.** Tool registration is
entirely client-side and calls the same `PaxCommands` HTTP client the UI uses — which correctly
satisfies docs/engineering-principles.md's "same command implementation" rule, but means the server cannot distinguish a
WebMCP-originated call from a UI click. `runtimeEventStore.append` is invoked only from the two
Strands engines. Since "showing WebMCP calls" is an explicit §34 requirement and a hackathon
judging asset, this needs deliberate design — most likely an origin marker on the command envelope.

**Pack presentation metadata is almost entirely absent.** `PresentationDefinitionSchema`
(`packages/contracts/src/packs.ts:214-231`) declares exactly three things: `optionLabel`,
`optionLabelPlural`, `attributeGroups`. Of §46's twelve wanted declarations, **twelve are absent**
and only the attribute-grouping mechanism carries over. §46 and §47 (Decision Guide) are 100%
net-new.

---

## 8. Rename blast radius (Pax → Sift)

Counts below were re-verified by the auditing agent after it found a first-pass overcount; figures
marked *second-hand* were spot-checked for plausibility but not exhaustively re-run.

**9 workspace packages:** root `pax`; `@pax/agent`; `@pax/web`; `@pax/catalog`, `@pax/contracts`,
`@pax/core`, `@pax/packs`, `@pax/scenarios`, `@pax/ui`.

**279 `@pax/*` import statements**, reconciling exactly: `@pax/contracts` 164, `@pax/core` 50,
`@pax/packs` 34, `@pax/scenarios` 14, `@pax/packs/src/fixtures/manifest.js` 10,
`@pax/catalog/browser` 4, `@pax/catalog` 3. Zero `require()`, zero dynamic `import()`.
`@pax/ui` exists but is **never imported** — worth questioning whether it should survive at all.

**Two facts that make this much cheaper than feared:**

1. **Zero tsconfig path aliases.** Packages resolve purely through pnpm workspace linking, so
   there is no alias table to keep in sync — renaming is `package.json` `name` fields plus import
   specifiers.
2. **All 9 `PAX_*` environment variables funnel through one Zod schema** in
   `apps/agent/src/config.ts:37-104` (`PAX_EXECUTION_TARGET`, `PAX_DATA_DIR`,
   `PAX_AUTHORING_ENABLED`, `PAX_DEBUG_ENABLED`, `PAX_DEBUG_PAYLOAD_MODE`,
   `PAX_DEBUG_RETENTION_DAYS`, `PAX_MODEL_ID`, `PAX_PUBLIC_ORIGIN`), plus `PAX_DEPLOYED_URL` read
   only in `scripts/test-deployed.ts:42`. One choke point, not a scatter.

**12 `pax_*` WebMCP tool names**, ~322 total occurrences across code and docs *(second-hand)*.
`webmcp-contract.test.ts:156` length-asserts the catalog, so the rename is compiler- and
test-enforced rather than silent.

**Data paths:** `.pax-data` (default `PAX_DATA_DIR`) and `SQLITE_FILE_NAME = 'pax.sqlite'`
(`apps/agent/src/db/connection.ts:31`), referenced across ~15 files including
`apps/agent/drizzle.config.ts:14,20`, `session-adapter.ts`, `authoring/cli.ts`,
`scripts/check-source.ts:52`, `tests/e2e/helpers/test-server.ts:24`, and four docs.

**Docker:** three spots — `Dockerfile:51` (`pnpm --filter @pax/web build`) and `Dockerfile:85`
(`CMD ... @pax/agent start`) plus a comment. No committed `railway.json`; Railway project config
lives in CLI state. Project name `pax-hackathon` appears ~50 times across scripts and docs
*(second-hand)*.

**~21 genuinely user-visible "Pax" strings** in `apps/web/src/**/*.tsx` (e.g. "What Pax is doing",
"Start a Pax case", "Pax selected this Decision Pack automatically"), as distinguished from ~61
non-visible code identifiers (`PaxCommands`, `usePaxCommands`, `PaxClientError`, `registerPaxTools`,
…). The two buckets rename on different schedules and must not be conflated.

**The deployment trap, confirmed.** The Railway service persists its database to a mounted volume
at `/data/pax.sqlite` (`docs/specs/architecture.md:256`). Renaming that path without a migration
makes the deployed data silently vanish into a fresh, empty database — the failure would look like
"the demo lost all its cases" during judging. This must be handled deliberately: either keep the
on-disk filename while renaming everything else, or perform a one-time rename-on-boot guarded by an
existence check. It must be **verified against the live deployment**, not assumed.

---

## 9. Standing risks for the plan

1. **Regression-proofing is mandatory, not optional.** The answer-above-the-fold property has now
   been specified once and lost once. It needs an executable assertion.
2. **Scope is genuinely large.** Quick Pick, Board-over-options, Decision Profile, `CaseNote`,
   the consumer/developer projection layer, catalog-over-WebMCP, and ~10 new tools are all net-new
   construction, not refactors. Only the engine and the attribute/evidence storage model are reusable
   as-is.
3. **Two heroes must not converge.** §55 forbids redesigning Energy Guardian around shopping views.
   Every generic workspace change must be checked against the Swarm demo, whose scenario reuses
   `car-purchase-scenario.ts`'s helpers directly (`home-energy-guardian-scenario.ts:113-119`) and
   will therefore inherit changes made there.
4. **`docs/planning/plans/2026-08-26-pax-hackathon-build.md` is 178/179 complete and closed.**
   This change set needs its own plan; it is not a continuation of that one.
