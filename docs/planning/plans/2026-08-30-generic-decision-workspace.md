# Implementation plan — Generic Decision Workspace (Sift)

Status: **reopened** (2026-08-31) — Phase K below. Phases 0–J complete (2026-08-30), see
`docs/completion-report-2026-08-30.md`.

**Why this reopened, recorded so the decomposition failure is not repeated.** Change-set §7
("Expanded mode vs narrow mode") is an app-wide information-architecture requirement. This plan
decomposed it into exactly two tasks — **B3** (a width-detection hook) and **C3** (Compare's
narrow/expanded switch). Both were implemented correctly and honestly, so both were checked off
and the plan reported complete. But no task ever existed for the 480px shell width cap, for the
catalog browse's expanded IA, or for List and Board. The result shipped and deployed: three
components each independently pinned `max-w-[480px]`, so at a 1440px viewport the entire product
rendered in a 448px column surrounded by empty grey, and expanded mode was structurally
unreachable rather than merely unwired.

`docs/specs/product.md` §100 *did* record the shortfall in writing ("remains open work rather
than something this build claims"). Writing a gap down is not scheduling it. The lesson for the
next plan: when a requirement is app-wide, at least one task must own the app-wide surface, or
the per-component tasks will each pass while the requirement fails. See **ADR 0007**.
Date opened: 2026-08-30
Requirements: `docs/change-sets/2026-08-30-generic-decision-workspace.md` (approved, authoritative input)
Audit: `docs/audits/2026-08-30-generic-decision-workspace-audit.md`
Decisions: ADR 0004 (workspace IA), ADR 0005 (view state and option views), ADR 0006 (WebMCP contract)

## Context

`docs/planning/plans/2026-08-26-pax-hackathon-build.md` is 178/179 complete and closed; its one
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
9. **Specs are updated before acceptance behavior changes** (docs/engineering-principles.md). This rule was violated
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

- [x] **A1. Remove what cannot be true.** Delete the unreachable `activeFocus` rendering
      (`App.tsx:703-727`) and the four never-assigned `CaseStatus` values
      (`investigating`/`waiting`/`ready`/`failed`) from the contract, reducer, and
      `CaseHeader`'s label map. Delete the orphaned `EvidenceList.tsx` and its 9 tests.
      *Done when:* no code path can produce a removed status; no component renders from a field
      nothing writes; suite green.
- [x] **A2. Empty regions stop rendering.** All eleven from audit §2. Empty states become compact
      and attached to the region that owns them.
      *Done when:* a test asserts each region is absent (not merely empty) when it has no content.
- [x] **A3. Merge the answer and the next action into one hero.** Resolves the
      "Our pick: READY FOR REVIEW" / "Your decision: no proposal pending" contradiction.
- [x] **A4. Compress case identity.** Title and live status only; pack id/version/compiled hash,
      `commandId`, and `runId` leave the consumer surface.
- [x] **A5. Developer mode.** An explicit entry point; `RuntimeInspector` is extended, not
      duplicated (§34). The activity ledger moves here.
      *Done 2026-08-30:* a "Developer view" control on `CaseHeader`, and a new Activity tab inside
      the existing `RuntimeInspector` that **reuses** `ActivityTimeline` rather than duplicating it.
      This also made `ActivityTimeline` reachable — it was previously rendered only inside an
      Inspector that itself had no persistent entry point.
- [x] **A6. Consumer terminology.** Extend `activity-labels.ts` (the existing mapping layer) rather
      than building a new one. Cover §4's table and §48's consumer↔dev pairs.
      Its test file went from 61 lines of generic checks to exhaustive per-type assertions plus
      explicit no-internal-id and no-engine-jargon tests — the mapping layer is only worth having if
      something proves every entry in it.
- [x] **A11 (added mid-plan). One source of truth for the view.** `App.tsx` derives the active view
      from the persisted `CaseState.view`, with an optimistic local override for responsiveness that
      is dropped once the persisted value catches up, so the persisted field resumes sole authority
      and can reflect an externally-driven change (a real `sift_set_view` call). User changes write
      through the real `setView` command. Found by inspection, not by a failing test — each half was
      individually correct.
      *Known limitation:* the write's rejection is swallowed (`.catch(() => undefined)`), so a failed
      persist leaves the optimistic view showing with no signal. Low-stakes for presentation state
      and deliberately not made noisy, but it is a silent failure and is recorded rather than
      hidden.
- [x] **A7. The above-the-fold invariant.** A Playwright assertion that the recommendation
      region's top edge is within the first viewport height at 390/430/480.
      *This is the regression gate for the defect that has now occurred twice.*
- [x] **A10. The workspace is very tall once a case is seeded.** Observed in the regenerated
      390px baseline: ~3379px, because the comparison table is always expanded inside the view
      switcher and "Manage options" also renders open. Everything is legible and the critical
      above-the-fold property holds (the hero is first), so this is a design refinement rather
      than a defect — but change set §64 asks this work to REDUCE apparent complexity, and an
      always-expanded full attribute table works against that. Consider collapsing lower attribute
      groups by default, or defaulting the switcher to Quick Pick or List rather than Compare.
- [x] **A9. Relabel the hero's command-status block.** Found by live inspection at 430px after the
      Phase A restructure: the hero renders "Nothing's been looked into yet" directly above a block
      headed "INVESTIGATION STATUS — COMPLETED" describing `Added option "2022 Subaru Outback
      Premium AWD"`. Both statements are individually true — nothing *has* been investigated, and
      the last *command* did complete — but read together they contradict, which is a milder form
      of the exact defect this phase removed ("Our pick: READY" above "no proposal pending"). The
      block reports command status, not investigation status, and must be labelled as such; it
      should also not appear at all when the only completed command was fixture seeding the user
      never issued.
- [x] **A8. Tighten the visual gate.** `maxDiffPixelRatio: 0.01` was permissive enough that a whole
      product rename passed with stale baselines. Lower it, or add a text-content assertion
      alongside the pixel check, so a copy change cannot pass silently.

## Phase B — workspace view state

- [x] **B1. `WorkspaceViewState` contract** in `packages/contracts` per ADR 0005: mode, focused
      option, visible/pinned attributes, visible options, sort, filters, board columns, Quick Pick
      queue position.
- [x] **B2. Persist via `SelectionPatch`/`updateSelection()`** — extend the existing patch type and
      both store implementations, plus the shared store-contract conformance test.
      *Done when:* a test proves a view change persists across reload AND does not advance
      `eventSequence` AND does not invalidate a ready recommendation.
- [x] **B3. Width-mode detection** for the narrow/expanded IA split. None exists today.
      *Done 2026-08-30:* `apps/web/src/hooks/use-width-mode.ts`, SSR/JSDOM-safe (defaults to
      `narrow` when `matchMedia` is absent rather than throwing), listener cleaned up on unmount,
      and genuinely consumed — it drives `OptionCompareView`'s `layout`, which was hardcoded before.

## Phase C — the four option views

- [x] **C1. Quick Pick** — one option dominant; Pass/Maybe/Shortlist; gestures optional, buttons
      mandatory (§49); queue order, end-of-queue, duplicate handling.
- [x] **C2. List** — rich compact cards; pack presentation metadata drives prominence.
- [x] **C3. Compare** — configurable rows and option subset; head-to-head at narrow width;
      multi-column when expanded. Rewrites `OptionComparison`, which today has no narrowing axis.
- [x] **C4. Board** — Considering / Top choices / Need to verify / Out. Keyboard alternative to
      drag is mandatory. Moving an option never silently eliminates it.
- [x] **C5. Custom fields render first-class** beside native ones, marked as added for this
      comparison, with no raw `custom.*` id in consumer UI.
- [x] **C6. Extract the duplicated evidence-strength predicate.** `meetsEvidenceExpectation`
      (comparing `AttributeRecord.status` against a definition's declared `evidenceExpectation`)
      was written in `QuickPickView.tsx` and then copied verbatim into `OptionListView.tsx`. This
      is the single judgment that decides whether a value counts as "well supported" versus "needs
      checking", so two copies can drift into telling the user two different things about the same
      attribute. Extract to one shared, separately-tested module and have both views import it.

`FindingsSheet` is retained as the research surface and is NOT repurposed (ADR 0005).

## Phase D — Decision Profile

- [x] **D1. Projection** from existing criteria/attributes/extensions — no competing source of truth.
- [x] **D2. Editing** with simplified priority language; exact weights behind advanced.
- [~] **D1/D2/D3 (partial). Decision Profile projection and view — BUILT BUT NOT MOUNTED.**
      Found 2026-08-30 by the spec audit and confirmed directly: `DecisionProfileView` appears
      nowhere in `App.tsx` and is not even exported from `apps/web/src/index.ts`. About 43 passing
      tests guard a component no user can reach, so DoD items 15 and 16 fail outright. Same class of
      defect as A11 — each half individually correct, nothing testing the seam between them.
      Reassigned to the agent that owns `App.tsx`. The projection itself, described below, is sound.

      Derived purely from existing
      `CaseState` — criteria, attribute definitions, confirmed extensions — with no new stored
      state, per §15's prohibition on a competing source of truth. Weight bands replace raw
      percentages by default (§42) with exact weights behind a closed disclosure. "Missing
      information" derives from exactly three real signals: a hard constraint with no target, a
      criterion with no target and no resolvable measuring attribute, and an extension awaiting
      confirmation.
- [x] **D4. `suggestedQuestions` (§16) — was blocked on E4, now unblocked and implemented.**
      Derived from exactly three real sources — pack-guide questions, unmet-obligation questions,
      and a criterion's own declared question — never generated. Empty list renders nothing.
      The original refusal, preserved below, was correct at the time and is why this is honest now:

  > Generating
      plausible discovery questions from nothing would be fabricated content, which is the exact
      failure mode this product exists to avoid. Honestly implementing it requires the pack-level
      Decision Guide (§47, plan task E4), which does not exist in `CaseState` today. Blocked on E4,
      not skipped — the omission is documented in `decision-profile.ts`'s own header.

## Phase E — WebMCP read, context, and guide

- [x] **E1. Widen the case-context projection** to §14's list. Critically, custom-field
      *definitions* are invisible today because `extension.defined` writes only to `caseExtensions`,
      which the projection excludes — while their *values* leak through in `EntityRecord.attributes`.
- [x] **E2. Read tools** — option details, research list. (Decision guide and notes list land with
      E7 and G3 respectively — both had no backing contract when this phase ran.)
- [x] **E3. Catalog search exposed to ChatGPT**, generic with pack-declared filters (§20). Today
      the catalog is HTTP-only and unreachable from WebMCP.
- [x] **E4/E7 (contract half). Pack-level Decision Guide** as declarative data.
      `DecisionGuideSchema` (`packages/contracts/src/packs.ts:293`) is seven fixed, bounded,
      `.strict()` fields; `decisionGuide` is optional on the manifest and both hero packs now declare
      real content. **Hash stability verified independently of the agent's own test:**
      `canonicalize.ts:62` filters `undefined` keys before hashing, so an omitted guide is
      *structurally incapable* of changing an existing pack's `compiledHash` — which matters because
      cases pin that hash, and a drift would have invalidated every already-pinned case.

      **Correction on the safety claim, because the stronger version is not true.** The schema does
      not make prompt injection impossible, and it must not be described as if it does. `safeString`
      rejects HTML and `javascript:`; it does not reject English. A pack author can still write
      persuasive prose in `discoveryStrategy`. What *is* true, and is the real guarantee:
      (a) there is no free-form `instructions`/`systemPrompt`-shaped field for such content to
      occupy as a first-class slot, and `.strict()` rejects an added one; (b) the guide is consumed
      as typed JSON in named fields and never concatenated into a system prompt; and, decisively,
      (c) **no tool path reaches approval** — human authority is enforced in the deterministic core,
      not by the model declining to be persuaded. Defense in depth, stated accurately.

### Phase E outcome and remaining gaps (2026-08-30)

Catalog widened 12 -> 17 tools in this phase, and 17 -> 20 as the four gaps below closed. Every
addition tightened the human-authority assertion; it has never been loosened.

Case context now carries custom-field
definitions (closing the gap where `custom.*` values were visible to the model but their meaning was
not), a research summary, real unresolved-question text, stale/conflicted signals, and the current
view — every collection reporting `{items, total}` so truncation is never silent. `sift_search_catalog`
is generic over a pack-keyed adapter rather than vehicle-specific.

Verified directly, not taken on report: the contract test asserts exactly 17 tools and that none
reaches `reviewProposal`; the §54 boundary test asserts `criteria` and `recommendation` are unchanged
AND that no `SiftCommands` method is called at all.

The four items below were genuinely not built when this phase closed, each blocked on something real
rather than skipped. **All four are now done** — the disclosures are kept because they are the
record of what was true at the time, and because an honest gap that later closes is worth more than
a gap that was quietly papered over.

**Backend halves landed 2026-08-30** (verified against the code, not the agent's report):

- `setView` (`command-service.ts`) routes through `updateSelection()` and never `append()`. Its test
  appends a **ready recommendation first**, then asserts `eventSequence` and `recommendation` are
  both EXACTLY unchanged while `view` persists — re-checked through a fresh `caseStore.load()`, so
  the guarantee is proven against durable state rather than a returned object. That is §54 made
  structural.
- `setOptionAttribute` merges one attribute into the entity's existing map
  (`{ ...existing.attributes, [definitionId]: record }`) rather than replacing it, resolves the
  definition from **both** `attributeDefinitions` and `caseExtensions` (so custom fields are
  first-class here), enforces the value/status invariant through the same `createAttributeRecord`
  the domain layer already owns, reuses the existing `option.upserted` event, and reuses
  `upsertOption`'s narrow `criteriaDependOnAttributes` invalidation rule rather than inventing one.
- `WorkspaceViewStateSchema` gained optional `focusedQuestionId`.

**A gap in the wave plan, found by an agent stopping at a boundary rather than crossing it.**
`apps/web/src/api/sift-client.ts` — the shared `SiftCommands` interface every page control and every
WebMCP tool dispatches through — was assigned to **no agent in any brief**. That was an
orchestration error, not an agent error. Three separate tasks (E5, E6, and the A11 view-truth fix)
were each independently blocked on it, and the agent that hit it first correctly reported a blocker
instead of reaching across ownership or adding a parallel `fetch` that would have bypassed the
shared client entirely.

Resolved by the orchestrator directly: `setView`, `setOptionAttribute`, and `addNote` added to the
interface and implementation following the existing `genericCommand` pattern, with matching stubs in
`fake-sift-commands.ts`. Verified green (812/812 web tests, clean web typecheck) before unblocking
the two waiting agents.

The WebMCP tools that expose all three remain open below.

- [x] **E5. RESOLVED — the session-only mechanism was deleted, not layered over.** All three
      presentation tools (`sift_set_view`, `sift_configure_comparison`, `sift_focus_question`) now
      merge their narrow patch onto the real `CaseState.view` and call `commands.setView(...)`, a
      genuine durable write through `updateSelection()`. Each gained a required `expectedSequence`.
      The now-false "does not persist" disclaimer was removed from the descriptions **and** the
      contract-test fixtures — a stale warning on a tool that now persists is the same overclaiming
      defect in reverse.
- [x] **E6. `sift_set_option_attribute`** shipped as a WRITE tool over the scoped backend command.
      The concurrent domain rule rejecting a model-origin `verified` claim is honored *by
      construction* — no special-case retry or swallow; the rejection flows through the existing
      generic error mapping to the caller.

      Original entry, kept because the reasoning was right at the time:

  > **E5. `sift_set_view` / `sift_configure_comparison` persist only for the session.** No backend
      command reaches `updateSelection()` for `view`, so the contract field exists with no writer.
      The tools hold view state in memory, which is functional within a session and reflected by
      `sift_get_case_context`, but does not survive reload or reach another viewer. Both the tool
      descriptions and `webmcp.md` say so explicitly — an overclaiming description would be worse
      than a missing tool, because ChatGPT would act on a page state that isn't real. Needs a
      command wired to the existing persistence path.
- [x] **E6. `sift_set_option_attribute`.** *(Shipped; see the Phase E summary above.)* ADR 0006 decision 4. `upsertOption` replaces an entity's
      whole attributes map, so it cannot stand in for a scoped single-attribute write.
- [x] **E7. `sift_get_decision_guide`** — shipped as a READ tool returning `{packId, packVersion,
      guide}` as typed fields, resolved against the active case's pinned pack, with an honest
      no-data response when the pack declares no guide. Described as reference data about this class
      of decision, never as guidance to obey.
- [x] **E8. `sift_focus_question`** — shipped as a PRESENTATION tool over
      `WorkspaceViewState.focusedQuestionId`. The existing §54 boundary test was **extended** to
      cover it rather than duplicated into a second parallel version.

## Phase F — custom fields as a hero capability

The audit found this pipeline incomplete end-to-end; each item below closes a specific break.

- [x] **F1. Agent-proposed origin becomes reachable.** `DefineCaseAttributeInputSchema` has no
      `origin` field and the handler hardcodes `'user'`, so §23's confirmation path cannot be
      exercised — `CaseExtensionReviewCard` reviews a state nothing can produce.
      *Verified 2026-08-30:* `commands.ts:205` now carries a top-level `origin` enum.
- [x] **F2. A custom field can create an obligation.** `deriveObligations` supports
      `CaseExtensionObligationTemplate` but is never called with one from `command-service.ts`.
      *Verified 2026-08-30:* `command-service.ts:973` calls it with a synthesized user-concern
      template, gated on the pack's real `extensionPolicy.allowCaseObligations` manifest flag.
- [x] **F3. Provenance-complete value population.** A narrower attribute-value operation carrying
      `status` (including `unknown`), `confidence`, `origin`, and `sourceIds` — none of which
      `UpsertOptionInput` can express today.
      *Verified 2026-08-30:* `OptionAttributeInputSchema` (`commands.ts:121`) carries all four.
      The *scoped single-attribute* command is task E6.
- [x] **F4. Dependent invalidation.** Populating or confirming a custom field must invalidate a
      ready recommendation where the dependency requires it; today only `updateCriteria` and
      `setEvidenceDisposition` do.
      *Verified 2026-08-30:* `upsertOption` (`command-service.ts:505`) and `reviewCaseExtension`
      (`:749`) both invalidate, and `upsertOption` narrows to definitions a criterion depends on
      rather than invalidating on every write.
- [x] **F5. Honest uncertainty.** Specification research may support "likely"; it may not assert
      "verified". Human observation can strengthen or replace it.
      **Marked complete in error on 2026-08-30 and reopened the same day.** The orchestrator checked
      F1–F4 against the code and then assumed F5 from their pattern instead of verifying it. The
      independent DoD audit (item 26) caught it, and re-checking confirmed the audit: there is **no
      rule anywhere in `packages/core` constraining an attribute's `status` by its `origin`**. Grep
      for a status-vs-origin rule in `attributes.ts` returns nothing. So a model-origin write can
      self-certify a value as `verified`, which is precisely what this item forbids — and it
      undermines the product's central claim that the deterministic core, not the model, owns
      evidence validity. Reassigned with the enforcement placed in `createAttributeRecord`, the one
      domain chokepoint both `upsertOption` and `setOptionAttribute` already call.
      *Closed 2026-08-30.* `createAttributeRecord` now rejects `status: 'verified'` unless
      `origin === 'user'`. Both `agent_proposed` (a model's own inference) and `pack` (pre-authored
      reference data) are barred, because neither is a live human attestation — §26's "human
      observation can strengthen or replace it" is exactly the distinction. The rejection is loud,
      not a silent downgrade, and names both what was refused and what would have been acceptable:
      *"only origin \"user\" (a human attestation) may claim \"verified\" — specification research
      or pack-authored data may claim at most \"supported\"."* A silent downgrade would have been
      its own dishonesty: the caller would believe it recorded something it did not.

## Phase G — research and notes

- [x] **G1. `submitSource` stops discarding claims.** It parses `source.claims[]` and never uses
      them, so model-gathered findings are silently dropped.
      *Verified 2026-08-30:* `command-service.ts:1120-1182` turns claims into durable option-linked
      `Claim` records, and reports an unlinked count in the activity summary rather than dropping
      them silently.
- [x] **G2. `CaseNote`** — new event-sourced concept, migration, memory + sqlite stores, shared
      contract test. Notes never auto-promote to evidence.
      *Done 2026-08-30.* `CaseNoteSchema` + `note.added` event + reducer fold (a pure append that
      touches nothing else) + `addNote` command, round-tripped through the shared store-contract
      fixture so the memory and SQLite implementations cannot drift. The defining test exists and
      passes: *"never touches obligations, readiness, or a ready recommendation (notes never
      auto-promote to evidence)"*.
      Two judgment calls worth recording, both verified rather than accepted:
      **No migration, correctly.** `cases.snapshot` (`db/schema.ts:35`) stores the whole `CaseState`
      as one JSON blob, so a new array field needs no schema change — this was checked against the
      table definition, not assumed, because getting it wrong would have meant a silent data loss on
      the live deployment.
      **`notes` is `.optional()`, not `.default([])`.** Zod's `.default()` would have made `notes`
      *required* on the inferred TS type, forcing edits to `CaseState` literals in packages the
      agent did not own. Same reasoning as `view`'s existing precedent.
      One detail nobody asked for and it was right: the public activity summary is asserted **not**
      to echo the raw note body. A note is user-entered free text and does not belong in the
      sanitized activity stream.
- [x] **G3. WebMCP write capability** for research and notes, with descriptions that distinguish
      source vs note vs criterion vs comparison field (§29).

## Phase H — model-controlled presentation

- [x] **H1. Presentation tools** — set view, focus option, focus question, configure comparison.
      Narrow typed operations, never one arbitrary UI-mutation object.
- [x] **H2. Shared focus both directions** — page selection visible to ChatGPT; ChatGPT focus
      visible on the page, in all four views.
- [x] **H3. Prove the boundary.** A test that a presentation tool changes the view and provably
      does not alter criteria or invalidate a recommendation.

## Phase I — developer view integration

- [x] **I1. Record WebMCP tool calls.** None are recorded anywhere today; §34 requires them
      visible. Carry an origin marker on the command envelope rather than forking the command path.
      *Done 2026-08-30.* `X-Sift-Command-Origin` header (mirroring the existing `Idempotency-Key`
      pattern, since body schemas are `.strict()`), validated against a closed one-member
      `COMMAND_ORIGINS` enum, threaded through the **unchanged** dispatch switch into
      `PublicActivityEvent.safeDetails.origin`. No second command path, per docs/engineering-principles.md's requirement
      that visible controls and WebMCP callbacks share one implementation — a command with and
      without the header produces identical case state and an identical `eventSequence` advance,
      which is asserted rather than assumed.
      Recorded onto the **activity** trail rather than `runtime_events`, a correct call: the runtime
      store requires a non-optional `runId` and is written only during bounded Strands runs, so a
      plain WebMCP command has no run to attach to.
      *Sending side wired by the orchestrator* (`sift-client.ts` was the unassigned file above):
      `CommandCallOptions.origin` sends the header when present. Omitting it is byte-identical to
      prior behavior, and that asymmetry is the point — it is what distinguishes a model-issued
      command from a human's click.
      **This is observability, never authorization.** Nothing downstream reads it for a policy
      decision. A client could set it to anything; that falsifies a log line and nothing more. Human
      authority holds because the tool catalog never exposes the human-only verbs, not because this
      field is trusted.
- [~] **I2. Consumer↔developer correlation** — a consumer event opens its exact runtime event.
      *Producer and destination done 2026-08-30:* `debugEventId` was declared but nothing ever set
      it; both engines now thread the persisted runtime event's id into every derived activity
      event, and `RuntimeInspector` accepts `focusEventId`, opening to its Timeline and scrolling to
      the match. **Remaining: the trigger itself** — an "Inspect event" affordance on
      `ActivityTimeline` threaded through `App.tsx`. Correctly reported as a cross-boundary gap
      rather than reached into; reassigned to the agent that owns those files.
- [x] **I3. Surface what already exists but is hidden**: `redactions` is populated and never
      rendered; `stateDiff` is declared, never populated, never rendered — either populate it or
      remove it, but do not ship a dead field.
      *Done 2026-08-30, both halves, and they were two different diseases.* `redactions` was
      genuinely populated and merely invisible — the Timeline now shows each entry's `path` and
      `reason`, never the withheld value (`Redaction` does not carry one, so that is structural).
      `stateDiff` had no producer anywhere outside test literals; the choice was populate-or-delete
      and it was populated honestly: `diffJsonValues(initialSnapshot, finalSnapshot)` over the real
      `CaseState` before and after a completed run, guarded so a run that changed nothing emits no
      vacuous event, and passed through the existing redaction path unchanged. Arrays and primitives
      are replaced wholesale rather than index-diffed — a deliberate correctness choice over a
      prettier diff that could misattribute a shifted element.

## Phase J — end-to-end, docs, release

- [x] **J1. Playwright journey** per §61, at all four viewports, no horizontal overflow.
- [x] **J2. Spec updates** per §65 — product, architecture, packs/routing, pack authoring, WebMCP,
      testing, demos/submission, value proposition, debugging/observability, README, demo scripts.
- [x] **J3. Fix the `agentcore.test.ts` conflict probe.** ~~Root cause: it probes sequence-conflict
      behavior using `selectPack`, which is policy-gated.~~ **That root cause was wrong, and the
      correction matters more than the fix.** Verified by reading the code on 2026-08-30:
      `CommandService.selectPack` (`command-service.ts:371-421`) contains **zero** `policyFailure`
      calls, and the only helper it calls before appending — `loadForMutation` — can return exactly
      `not_found`, `conflict`, or `ok`. A 403 `POLICY` is **structurally unreachable** for this
      request. The three `policyFailure` sites live in `updateCriteria` (`:1060`, `:1091`, `:1106`)
      and one at `:1540`; `routes/commands.test.ts` uses `updateCriteria` (removing a protected
      criterion) for its own 403 test, immediately beside its `selectPack` conflict test. So the 403
      recorded during the rename gate was almost certainly that neighbouring test in the same run,
      misattributed here — a reminder that a failure fingerprint copied between sessions is a
      hypothesis, not evidence.
      *What was actually wrong, and is now fixed:* the test asserted only `status === 409` while its
      name promised "a conflict envelope with the latest snapshot". It now asserts the full
      `HttpConflictResponse` — `error.code`, both sequences, and the returned snapshot's id and
      `eventSequence`. Strictly stronger, never weaker. 22/22 consecutive full-file runs green.
- [x] **J5. Harden `submitCustomConcern`'s success-banner wait.** `tests/e2e/pages/sift-page.ts:348`
      waits for `custom-concern-form-success` to become visible after `defineCaseAttribute`
      resolves. Under full-suite parallelism (8 workers) this exceeded its timeout once, failing
      `vehicle-catalog-journey` at right-pane-390; it passed standalone and on a full re-run
      (40/40). Distinct from J3: that one turned out to be a weak assertion, this one is genuinely
      timing. The fix is a longer bounded wait on the real signal, NOT a removed or weakened
      assertion.
      *Fixed 2026-08-30:* the banner was confirmed by reading `CustomConcernForm` to have **no
      auto-hide** — so the flake was never the banner vanishing before Playwright looked, it was the
      whole request→commit chain outrunning a short default timeout under 8-worker contention. A
      `waitForResponse` on the literal `POST .../commands/defineCaseAttribute` is now armed *before*
      the click (so it cannot miss a response that lands early) and awaited first, then the banner
      assertion runs unchanged with a bound matching the file's existing convention. Purely
      additive: the exact `data-testid` is still required to appear, and the shared helper the
      error-path spec uses is untouched.
- [x] **J4. Full `pnpm verify` green**, deployed check, completion report per §70.
      *Done 2026-08-30.* `pnpm verify` PASSED 10/10 (`2026-08-30T19-58-54-918Z-bf0c4e84`); coverage
      97.77% lines / 94.58% branches; mutation score 92.31 against a break threshold of 80;
      `test:deployed` 11 passed / 1 honest skip against a genuinely redeployed service; report at
      `docs/completion-report-2026-08-30.md`.
      **`verify:release` fails exactly one check, correctly:** `release-metadata-public-urls`
      requires the two demo-video URLs, which are human-recorded deliverables. No URL was fabricated
      to turn the gate green — the gate is doing its job by refusing.

## Verification strategy

Per-task: focused failing test → implement → focused green → package gate. Per-phase: full
`pnpm verify`. Live browser verification at 390/430/480 for every phase that changes rendering —
the audit's headline defect was invisible to a green suite and was only found by looking.

## Execution log — parallel waves (2026-08-30)

Remaining work is being executed by parallel subagents under strict, disjoint file ownership, with
the orchestrator verifying each agent's load-bearing claims against the actual code rather than
accepting its report. The wave boundaries exist because several tasks collide on the same files —
`packages/contracts/src/{case,commands,events}.ts`, `apps/agent/src/services/command-service.ts`,
`apps/agent/src/routes/commands.ts`, and `apps/web/src/model-context/**` are each single-owner per
wave.

- **Wave 1** — A9/A10/C6/B3 (workspace UI); E5/E6/E8 backend commands; E7 pack Decision Guide + D4;
  I2/I3 Runtime Inspector; J3/J5 test root causes.
- **Wave 2** — G2 `CaseNote` (contracts/core/agent); E5–E8 + H1–H3 WebMCP tools; A5 developer-mode
  entry point + A6 consumer terminology + A2 empty-region audit.
- **Wave 3** — I1 WebMCP call recording; G3 notes/research tools + `CaseNotes` surface; J2 spec
  updates per §65.
- **Wave 4** — A8 visual gate, J1 §61 journey, baseline regeneration with human visual inspection,
  full `pnpm verify`, deployed check, §70 completion report.

Checkbox state before this run was stale — many Phase A/C/E/F/G items shipped in commits
`5078db3`..`e767096` without being marked. Boxes flipped above were each re-verified against the
code on 2026-08-30, with the verifying reference recorded inline; they were not marked from commit
messages.

## The raw-id leak, closed on the path that actually ships (orchestrator, 2026-08-30)

DoD item 34 — no raw internal id in consumer text — was fixed in the scenario harness by the
honesty-fixes agent, which then correctly flagged that **the identical defect also lived in the live
engines** (`car-purchase-engine.ts`, `home-energy-engine.ts`) that its brief forbade it from
touching. That distinction matters more than it sounds: the harness is what tests run, the engines
are what the deployed product runs. Fixing only the harness would have made the suite green while
the user still read *"Recommend candidate-rav4 per source-national-crash-safety-consortium"*.

Closed by the orchestrator, test-first. The failing assertion came first and failed for exactly the
right reason (`expected 'Recommend candidate-rav4 per source-n…' not to match /\bcandidate-[a-z0-9-]+/i`),
then both `recommendation.ready` sites (round 1 and round 2) were routed through the already-tested
`humanizeDecisionText`/`entityLabelsById` helpers rather than a second copy of that logic.

Two details that are load-bearing rather than incidental:
- Humanizing must run **after** `extractCitedSourceIds`, because it removes the very tokens that
  function matches on. Both call sites are ordered accordingly and say so.
- The regression test also asserts the rationale is still longer than 20 characters — a test that
  only forbids ids would pass just as happily against an empty string, which would "fix" the leak by
  deleting the answer.

One honest limitation carried forward from the agent: `scripted-beats/home-energy-guardian.ts`'s
decision text was deliberately left raw, because `home-energy-engine.ts` parses its exact
parenthetical format with a regex. Changing the text would break the parser. Recorded rather than
forced.

## Orphan scan (orchestrator, 2026-08-30)

The "built, tested, never mounted" defect appeared twice in one night (Decision Profile; the
activity→trace trigger), so every component was swept for the same pattern rather than waiting for a
third instance. Method: for each `components/*.tsx`, search all non-test `.tsx` for its JSX tag.

Exactly two orphans, and they are different problems:

- **`DecisionProfileView`** — a real gap. Built, ~43 tests, not mounted, not even exported from the
  barrel. Reassigned; see Phase D.
- **`OptionComparison`** — genuinely dead code, not a gap. ADR 0005 superseded it with
  `OptionCompareView` (plan task C3, "Rewrites `OptionComparison`"). It survives only as an
  `index.ts` export and a handful of comments that already describe it as superseded. Per the
  owner's standing instruction — *"If they arent getting changed then remove them"* — it should be
  deleted along with its export and tests. Deferred only because `index.ts` is currently owned by an
  in-flight agent.

One correction to the spec audit: it reported `ActivityTimeline` as "rendered nowhere". It is
rendered — inside `RuntimeInspector.tsx`. The audit's underlying point survives in a stronger form:
the Inspector itself has no persistent entry point (it appears only when a live run receipt exists),
so `ActivityTimeline` is unreachable *transitively*, which is why a naive tag search missed it. That
is task A5.

## Known risks

1. **Scope.** Quick Pick, Board-over-options, Decision Profile, `CaseNote`, the projection layer,
   catalog-over-WebMCP, and ~10 tools are net-new construction. Only the engine and the
   attribute/evidence storage model are reusable as-is.
2. **Shared scenario helpers.** Changes to `car-purchase-scenario.ts` propagate into Home Energy
   Guardian.
3. **Baseline churn.** The IA change invalidates most visual baselines. Each must be inspected,
   not blind-updated.
4. **The exact-tool-set contract test** must be updated deliberately with every tool addition.

---

## Phase K — expanded-width information architecture (2026-08-31)

Closes change-set §7 and `docs/specs/product.md` §69/§100. See **ADR 0007** for the decision, the
spec conflict it resolves, and why the failure was invisible to every existing gate.

- [x] **K1. One shared shell.** Replace the three independently-pinned `max-w-[480px]` caps
      (`App.tsx` ×2, `VehicleCatalogFlow.tsx`, `DemoLauncher.tsx`) with a single `.page-shell`
      class: 480px max at narrow, `--shell-width-max` (1280px) above 481px, centred. Add
      `.option-grid` (`auto-fill`/`minmax`) so column count adapts continuously without new
      breakpoints and collapses to one column at narrow width on its own.
      *Done when:* no `max-w-[480px]` remains in non-test `apps/web/src`, and a 1440px viewport
      measures a container materially wider than 448px.
- [x] **K2. Catalog browse expanded IA.** Results become a responsive card grid at expanded
      width, single-column list at narrow, with genuinely more per card rather than wider
      whitespace. Adds the Fuel type filter, whose query/route/client plumbing already shipped
      but had no UI control.
- [x] **K3. List and Board expanded IA.** Closes §100's named gap. Both take `layout` as a prop
      threaded from `WorkspaceViewSwitcher`, extending ADR 0005 decision 4's Compare contract
      rather than inventing a second mechanism — this is also what keeps the expanded layouts
      testable, since `matchMedia` is absent in jsdom.
- [x] **K4. Spec and doc truth.** ADR 0007 written; `design-system.md`'s stale "single-column at
      every width" paragraph corrected; `product.md` §100 rewritten to describe what List and
      Board actually do at each width.
- [x] **K5. Baselines regenerated and inspected as a set** at 390/430/480/1440. The 1440 project
      stops being a near-duplicate of 480 and starts testing a distinct layout. Inspect, do not
      blind-accept — the previous 1440 baselines encoded the capped layout, which is exactly why
      pixel equality proved nothing.
- [x] **K6. Full `pnpm verify` green, redeploy, and verify the live desktop layout** at 1440
      against the deployed build rather than a local one.

### Known gap recorded, not silently carried

The horizontal-overflow assertion measures `document.scrollWidth`, so clipping *inside* a
container is invisible to it. That is how both the capped Compare table and a truncated catalog
spec line passed. Closing it is follow-up work; recorded here so it is not rediscovered from
scratch.
