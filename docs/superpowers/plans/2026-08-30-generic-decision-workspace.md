# Implementation plan — Generic Decision Workspace (Sift)

Status: **active**
Date opened: 2026-08-30
Requirements: `docs/change-sets/2026-08-30-generic-decision-workspace.md` (approved, authoritative input)
Audit: `docs/audits/2026-08-30-generic-decision-workspace-audit.md`
Decisions: ADR 0004 (workspace IA), ADR 0005 (view state and option views), ADR 0006 (WebMCP contract)

## Context

`docs/superpowers/plans/2026-08-26-pax-hackathon-build.md` is 178/179 complete and closed; its one
open item is a human-only demo recording. This is a **new plan**, not a continuation of that one.

It exists because the project owner reported the shipped workspace as "virtually unusable" and
supplied a change set that redefines the product: from an agent-runtime dashboard that happens to
be about cars, into a generic decision workspace where ChatGPT is a first-class collaborator.

The audit found the engine underneath is sound. This is a presentation and contract expansion, not
a core rewrite — which bounds the risk and shapes the sequencing below.

## Global constraints

These bind every task. A task that violates one is not done, regardless of its own tests.

1. **Human authority is absolute.** No WebMCP tool may approve a consequential decision.
   `webmcp-contract.test.ts` asserts no tool reaches `reviewProposal`; that test is tightened as
   tools are added, never loosened.
2. **Presentation is not decision mutation** (change set §54). Enforced structurally, not by
   convention: presentation state writes through `updateSelection()` (no event, no `eventSequence`
   advance, cannot invalidate a recommendation); decision state writes through `append()`.
3. **The deterministic core owns truth.** Case state, evidence validity, and readiness are decided
   by `packages/core`, never by a model.
4. **Never render what cannot be true.** No region renders from a field nothing writes, and no
   empty conceptual region renders merely because a `CaseState` field exists (§5).
5. **Consumer and developer views are two projections of the same events** (§35). Never two
   sources of truth.
6. **No test is weakened to reach green.** No skipping, no focusing, no lowered thresholds, no
   loosened visual tolerance, no mock replacing a real integration.
7. **Both heroes stay distinct** (§55). Energy Guardian is not redesigned around shopping views.
   Note the coupling risk: `home-energy-guardian-scenario.ts:113-119` imports helpers from
   `car-purchase-scenario.ts` and inherits changes made there.
8. **The canonical viewport is 390–480px**, designed natively, not a shrunk desktop.
9. **Specs are updated before acceptance behavior changes** (CLAUDE.md). This rule was violated
   once already and is the direct cause of the regression this plan repairs.

## Sequencing rationale

The change set's §68 proposes phases A–J and warns against one giant UI rewrite. That ordering is
adopted with two deviations, both deliberate:

- **The rename went first** (already complete, commit `0977fdc`). It is mechanical and fully gated
  by the existing suite; doing it after the feature work would have meant renaming everything twice.
- **Phase B precedes Phase A's completion.** The view-state contract is a dependency of the IA, not
  a consequence of it: the new workspace *is* a view switcher, so building the IA first would mean
  building it twice.

## Phase 0 — completed

- [x] Persist the approved change set as a citable baseline (`9a16c30`)
- [x] Pre-implementation audit per §1 (`c09de43`)
- [x] Full rename Pax → Sift including packages, with legacy-database adoption (`0977fdc`)
- [x] ADR 0004 — consumer workspace information architecture
- [x] ADR 0005 — workspace view state and option views
- [x] ADR 0006 — WebMCP two-way collaboration contract

## Phase A — information architecture and the consumer/developer boundary

Fixes the reported defect directly. Depends on Phase B's contract for the view switcher, so land
B1–B2 first.

- [ ] **A1. Remove what cannot be true.** Delete the unreachable `activeFocus` rendering
      (`App.tsx:703-727`) and the four never-assigned `CaseStatus` values
      (`investigating`/`waiting`/`ready`/`failed`) from the contract, reducer, and
      `CaseHeader`'s label map. Delete the orphaned `EvidenceList.tsx` and its 9 tests.
      *Done when:* no code path can produce a removed status; no component renders from a field
      nothing writes; suite green.
- [ ] **A2. Empty regions stop rendering.** All eleven from audit §2. Empty states become compact
      and attached to the region that owns them.
      *Done when:* a test asserts each region is absent (not merely empty) when it has no content.
- [ ] **A3. Merge the answer and the next action into one hero.** Resolves the
      "Our pick: READY FOR REVIEW" / "Your decision: no proposal pending" contradiction.
- [ ] **A4. Compress case identity.** Title and live status only; pack id/version/compiled hash,
      `commandId`, and `runId` leave the consumer surface.
- [ ] **A5. Developer mode.** An explicit entry point; `RuntimeInspector` is extended, not
      duplicated (§34). The activity ledger moves here.
- [ ] **A6. Consumer terminology.** Extend `activity-labels.ts` (the existing mapping layer) rather
      than building a new one. Cover §4's table and §48's consumer↔dev pairs.
- [ ] **A7. The above-the-fold invariant.** A Playwright assertion that the recommendation
      region's top edge is within the first viewport height at 390/430/480.
      *This is the regression gate for the defect that has now occurred twice.*
- [ ] **A10. The workspace is very tall once a case is seeded.** Observed in the regenerated
      390px baseline: ~3379px, because the comparison table is always expanded inside the view
      switcher and "Manage options" also renders open. Everything is legible and the critical
      above-the-fold property holds (the hero is first), so this is a design refinement rather
      than a defect — but change set §64 asks this work to REDUCE apparent complexity, and an
      always-expanded full attribute table works against that. Consider collapsing lower attribute
      groups by default, or defaulting the switcher to Quick Pick or List rather than Compare.
- [ ] **A9. Relabel the hero's command-status block.** Found by live inspection at 430px after the
      Phase A restructure: the hero renders "Nothing's been looked into yet" directly above a block
      headed "INVESTIGATION STATUS — COMPLETED" describing `Added option "2022 Subaru Outback
      Premium AWD"`. Both statements are individually true — nothing *has* been investigated, and
      the last *command* did complete — but read together they contradict, which is a milder form
      of the exact defect this phase removed ("Our pick: READY" above "no proposal pending"). The
      block reports command status, not investigation status, and must be labelled as such; it
      should also not appear at all when the only completed command was fixture seeding the user
      never issued.
- [ ] **A8. Tighten the visual gate.** `maxDiffPixelRatio: 0.01` was permissive enough that a whole
      product rename passed with stale baselines. Lower it, or add a text-content assertion
      alongside the pixel check, so a copy change cannot pass silently.

## Phase B — workspace view state

- [ ] **B1. `WorkspaceViewState` contract** in `packages/contracts` per ADR 0005: mode, focused
      option, visible/pinned attributes, visible options, sort, filters, board columns, Quick Pick
      queue position.
- [ ] **B2. Persist via `SelectionPatch`/`updateSelection()`** — extend the existing patch type and
      both store implementations, plus the shared store-contract conformance test.
      *Done when:* a test proves a view change persists across reload AND does not advance
      `eventSequence` AND does not invalidate a ready recommendation.
- [ ] **B3. Width-mode detection** for the narrow/expanded IA split. None exists today.

## Phase C — the four option views

- [ ] **C1. Quick Pick** — one option dominant; Pass/Maybe/Shortlist; gestures optional, buttons
      mandatory (§49); queue order, end-of-queue, duplicate handling.
- [ ] **C2. List** — rich compact cards; pack presentation metadata drives prominence.
- [ ] **C3. Compare** — configurable rows and option subset; head-to-head at narrow width;
      multi-column when expanded. Rewrites `OptionComparison`, which today has no narrowing axis.
- [ ] **C4. Board** — Considering / Top choices / Need to verify / Out. Keyboard alternative to
      drag is mandatory. Moving an option never silently eliminates it.
- [ ] **C5. Custom fields render first-class** beside native ones, marked as added for this
      comparison, with no raw `custom.*` id in consumer UI.
- [ ] **C6. Extract the duplicated evidence-strength predicate.** `meetsEvidenceExpectation`
      (comparing `AttributeRecord.status` against a definition's declared `evidenceExpectation`)
      was written in `QuickPickView.tsx` and then copied verbatim into `OptionListView.tsx`. This
      is the single judgment that decides whether a value counts as "well supported" versus "needs
      checking", so two copies can drift into telling the user two different things about the same
      attribute. Extract to one shared, separately-tested module and have both views import it.

`FindingsSheet` is retained as the research surface and is NOT repurposed (ADR 0005).

## Phase D — Decision Profile

- [ ] **D1. Projection** from existing criteria/attributes/extensions — no competing source of truth.
- [ ] **D2. Editing** with simplified priority language; exact weights behind advanced.
- [x] **D1/D2/D3 (partial). Decision Profile projection and view.** Derived purely from existing
      `CaseState` — criteria, attribute definitions, confirmed extensions — with no new stored
      state, per §15's prohibition on a competing source of truth. Weight bands replace raw
      percentages by default (§42) with exact weights behind a closed disclosure. "Missing
      information" derives from exactly three real signals: a hard constraint with no target, a
      criterion with no target and no resolvable measuring attribute, and an extension awaiting
      confirmation.
- [ ] **D4. `suggestedQuestions` (§16) — deliberately NOT implemented, and blocked.** Generating
      plausible discovery questions from nothing would be fabricated content, which is the exact
      failure mode this product exists to avoid. Honestly implementing it requires the pack-level
      Decision Guide (§47, plan task E4), which does not exist in `CaseState` today. Blocked on E4,
      not skipped — the omission is documented in `decision-profile.ts`'s own header.

## Phase E — WebMCP read, context, and guide

- [ ] **E1. Widen the case-context projection** to §14's list. Critically, custom-field
      *definitions* are invisible today because `extension.defined` writes only to `caseExtensions`,
      which the projection excludes — while their *values* leak through in `EntityRecord.attributes`.
- [ ] **E2. Read tools** — decision guide, option details, research list, notes list.
- [ ] **E3. Catalog search exposed to ChatGPT**, generic with pack-declared filters (§20). Today
      the catalog is HTTP-only and unreachable from WebMCP.
- [ ] **E4. Pack-level Decision Guide** as declarative data — explicitly not prompt injection.

### Phase E outcome and remaining gaps (2026-08-30)

Catalog widened 12 -> 17 tools across four authority classes. Case context now carries custom-field
definitions (closing the gap where `custom.*` values were visible to the model but their meaning was
not), a research summary, real unresolved-question text, stale/conflicted signals, and the current
view — every collection reporting `{items, total}` so truncation is never silent. `sift_search_catalog`
is generic over a pack-keyed adapter rather than vehicle-specific.

Verified directly, not taken on report: the contract test asserts exactly 17 tools and that none
reaches `reviewProposal`; the §54 boundary test asserts `criteria` and `recommendation` are unchanged
AND that no `SiftCommands` method is called at all.

Genuinely not built, each blocked on something real rather than skipped:

- [ ] **E5. `sift_set_view` / `sift_configure_comparison` persist only for the session.** No backend
      command reaches `updateSelection()` for `view`, so the contract field exists with no writer.
      The tools hold view state in memory, which is functional within a session and reflected by
      `sift_get_case_context`, but does not survive reload or reach another viewer. Both the tool
      descriptions and `webmcp.md` say so explicitly — an overclaiming description would be worse
      than a missing tool, because ChatGPT would act on a page state that isn't real. Needs a
      command wired to the existing persistence path.
- [ ] **E6. `sift_set_option_attribute`.** ADR 0006 decision 4. `upsertOption` replaces an entity's
      whole attributes map, so it cannot stand in for a scoped single-attribute write.
- [ ] **E7. `sift_get_decision_guide`.** Needs the pack-manifest fields from §46/§47 in
      `packages/contracts`. Also blocks D4 (`suggestedQuestions`).
- [ ] **E8. `sift_focus_question`.** `WorkspaceViewState` has no focused-question field, and
      `activeFocus` is system-owned rather than model-settable.

## Phase F — custom fields as a hero capability

The audit found this pipeline incomplete end-to-end; each item below closes a specific break.

- [ ] **F1. Agent-proposed origin becomes reachable.** `DefineCaseAttributeInputSchema` has no
      `origin` field and the handler hardcodes `'user'`, so §23's confirmation path cannot be
      exercised — `CaseExtensionReviewCard` reviews a state nothing can produce.
- [ ] **F2. A custom field can create an obligation.** `deriveObligations` supports
      `CaseExtensionObligationTemplate` but is never called with one from `command-service.ts`.
- [ ] **F3. Provenance-complete value population.** A narrower attribute-value operation carrying
      `status` (including `unknown`), `confidence`, `origin`, and `sourceIds` — none of which
      `UpsertOptionInput` can express today.
- [ ] **F4. Dependent invalidation.** Populating or confirming a custom field must invalidate a
      ready recommendation where the dependency requires it; today only `updateCriteria` and
      `setEvidenceDisposition` do.
- [ ] **F5. Honest uncertainty.** Specification research may support "likely"; it may not assert
      "verified". Human observation can strengthen or replace it.

## Phase G — research and notes

- [ ] **G1. `submitSource` stops discarding claims.** It parses `source.claims[]` and never uses
      them, so model-gathered findings are silently dropped.
- [ ] **G2. `CaseNote`** — new event-sourced concept, migration, memory + sqlite stores, shared
      contract test. Notes never auto-promote to evidence.
- [ ] **G3. WebMCP write capability** for research and notes, with descriptions that distinguish
      source vs note vs criterion vs comparison field (§29).

## Phase H — model-controlled presentation

- [ ] **H1. Presentation tools** — set view, focus option, focus question, configure comparison.
      Narrow typed operations, never one arbitrary UI-mutation object.
- [ ] **H2. Shared focus both directions** — page selection visible to ChatGPT; ChatGPT focus
      visible on the page, in all four views.
- [ ] **H3. Prove the boundary.** A test that a presentation tool changes the view and provably
      does not alter criteria or invalidate a recommendation.

## Phase I — developer view integration

- [ ] **I1. Record WebMCP tool calls.** None are recorded anywhere today; §34 requires them
      visible. Carry an origin marker on the command envelope rather than forking the command path.
- [ ] **I2. Consumer↔developer correlation** — a consumer event opens its exact runtime event.
- [ ] **I3. Surface what already exists but is hidden**: `redactions` is populated and never
      rendered; `stateDiff` is declared, never populated, never rendered — either populate it or
      remove it, but do not ship a dead field.

## Phase J — end-to-end, docs, release

- [ ] **J1. Playwright journey** per §61, at all four viewports, no horizontal overflow.
- [ ] **J2. Spec updates** per §65 — product, architecture, packs/routing, pack authoring, WebMCP,
      testing, demos/submission, value proposition, debugging/observability, README, demo scripts.
- [ ] **J3. Fix the `agentcore.test.ts` conflict-probe fragility.** The test "returns a 409 conflict
      envelope with the latest snapshot for a stale expectedSequence"
      (`agentcore.test.ts:157-171`) intermittently returns 403 `POLICY` instead of 409 `CONFLICT`.
      Root cause identified: it probes sequence-conflict behavior using `selectPack`, which is
      **policy-gated** — it only applies to a case that has no evidence yet — against a case created
      by `startDemo()`, which seeds evidence. So the response depends on whether the policy check or
      the sequence check decides first, and the assertion is not actually isolating the behavior it
      names. The fix is to probe conflict with a command that is not policy-gated, so a genuine
      stale-sequence conflict is the only thing that can be observed. Reproduced once during the
      rename gate; passes standalone and on re-run. Not caused by the rename — the same suite passed
      2267/2267 immediately after it.
- [ ] **J5. Harden `submitCustomConcern`'s success-banner wait.** `tests/e2e/pages/sift-page.ts:348`
      waits for `custom-concern-form-success` to become visible after `defineCaseAttribute`
      resolves. Under full-suite parallelism (8 workers) this exceeded its timeout once, failing
      `vehicle-catalog-journey` at right-pane-390; it passed standalone and on a full re-run
      (40/40). Distinct from J3: that one is state-dependent, this one is genuinely timing.
      The fix is a longer bounded wait on the real signal, NOT a removed or weakened assertion.
- [ ] **J4. Full `pnpm verify` green**, deployed check, completion report per §70.

## Verification strategy

Per-task: focused failing test → implement → focused green → package gate. Per-phase: full
`pnpm verify`. Live browser verification at 390/430/480 for every phase that changes rendering —
the audit's headline defect was invisible to a green suite and was only found by looking.

## Known risks

1. **Scope.** Quick Pick, Board-over-options, Decision Profile, `CaseNote`, the projection layer,
   catalog-over-WebMCP, and ~10 tools are net-new construction. Only the engine and the
   attribute/evidence storage model are reusable as-is.
2. **Shared scenario helpers.** Changes to `car-purchase-scenario.ts` propagate into Home Energy
   Guardian.
3. **Baseline churn.** The IA change invalidates most visual baselines. Each must be inspected,
   not blind-updated.
4. **The exact-tool-set contract test** must be updated deliberately with every tool addition.
