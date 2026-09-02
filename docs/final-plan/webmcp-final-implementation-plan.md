# Adaptive Vehicle Experience Technical Appendix

Status: superseded as an execution control document by [Sift Final Hackathon Execution Plan](./final-hackathon-execution-plan.md). Retained for detailed file-level research only. If this appendix conflicts with the canonical plan or [experience specification](./final-approved-experience.md), the canonical documents win.

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to execute this plan task by task. Use `superpowers:test-driven-development` for each behavior change and `superpowers:verification-before-completion` before marking any task complete.

**Goal:** Ship one coherent, conversation-led vehicle-selection journey, a judge-visible WebMCP proof, and a turn-by-turn UX evaluation harness before the September 3, 2026 deadline.

**Architecture:** ChatGPT is the conversational conductor. The deterministic Sift core owns canonical decision state, discovery coverage, authority, view policy, and readiness. The generalized vehicle pack declares domain process and bounded capabilities. WebMCP exposes lifecycle and active-case tools. Strands executes a persisted run plan. React renders projections of canonical state in standalone and narrow companion modes. The existing scenarios package and Playwright suite become the persona evaluation harness.

**Tech stack:** TypeScript, Zod contracts, React, Fastify agent service, WebMCP `document.modelContext.registerTool`, Vitest, Playwright, axe-core, pnpm workspace, SQLite/memory stores, existing Strands runtime adapter.

**Product specification:** [final delivery plan](./webmcp-final-delivery.md), [turn simulation](./car-conversation-simulation.md), [target journey](./target-car-journey.md), [harness specification](./ux-evaluation-harness.md), and [requirements ledger](./requirements-ledger.md).

## Global constraints

- P0 items in the final delivery plan are the only deadline-blocking scope.
- Keep model discovery and exact dealer listings as separate semantic levels.
- Never imply live price, inventory, availability, or dealer terms from the EPA catalog.
- ChatGPT may choose wording and one of the bounded next moves; it may not invent state transitions, bypass authority, or select undeclared views.
- Human changes beat model presentation requests until the stage requires a new view or the human explicitly returns control.
- In the ChatGPT/WebMCP journey, every pack-required discovery topic must be confirmed or not applicable before model search. Only standalone **Explore with gaps** may defer soft topics and produce provisional output.
- Elicitation is option-first when recognition is possible: pack seeds plus current context produce short suggestions with appropriate custom, none, unsure, and defer paths. Blank free-text questions are reserved for nuance.
- One response may resolve multiple discovery topics. Anything that becomes a blocker requires explicit human confirmation, and unknown compatibility is never treated as failure or success.
- One contextual blind-spot review is required before conversational model search.
- Run planning and safe read-only enrichment begin as facts stabilize; deeper work focuses after human triage. Recommendation output is a continuously recomputed list, not a one-time purchase instruction.
- Fixture-backed behavior must remain labeled and may not silently replace a catalog-created case in the hero journey.
- Preserve the committed `6edf2d1` ranking/decision-profile work and later release-documentation history through `da3ad9f`; Task 0 rechecks ownership before overlapping edits. Preserve the currently untracked `docs/final-plan` directory.
- Each task starts with a failing test, ends with the narrowest relevant verification, and commits only its owned files.

## Deadline allocation

Treat these as gates, not permission to use every hour in a window:

| Remaining window | Required outcome |
| --- | --- |
| T-42 to T-36 | Task 0 complete; contracts, vehicle semantics, and pack branches locked. |
| T-36 to T-26 | Conversational bootstrap, discovery, catalog, and durable Quick Pick loop working. |
| T-26 to T-18 | Thin real RunPlan proof, orientation shell, deterministic persona harness, and focused E2E passing. |
| T-18 | Feature freeze candidate. No new scope after this gate. |
| T-18 to T-10 | Real-host acceptance, blocking repairs, full verification, deploy, and final freeze. |
| Final 10 hours | Record/edit/upload video, verify public artifacts, finalize Devpost fields, and retain a submission buffer. |

If the feature-freeze candidate is not ready at T-18, cut P1 and visual embellishment immediately. Do not consume the recording/submission window with new architecture.

## Task 0: Integrate the active Claude session and freeze the baseline

**Requirements:** all; source-control safety prerequisite.

**Files:** no planned code edits. Inspect the current worktree, especially:

- commit `6edf2d1` and its `apps/web` ranking/decision-profile changes;
- its updated `tests/e2e/*-snapshots/*.png` baselines; and
- the release-documentation history through `da3ad9f` and the untracked `docs/final-plan` directory left behind by the concurrent amend/reset sequence.

**Steps:**

1. Record `git rev-parse --short HEAD`, `git branch --show-current`, and `git status --short` in the implementation run log.
2. Wait for or explicitly coordinate the Claude session's completion. Do not stash, discard, or overwrite its changes.
3. Review its diff and identify which P0 requirements it already addresses.
4. Run its claimed focused tests, then run:

   ```bash
   pnpm typecheck
   pnpm test:unit
   ```

5. If screenshot changes remain, verify that they correspond to intentional rendered changes before accepting them.
6. Update this plan's file ownership if the completed changes altered the mapped seams.
7. Create a clean integration commit or retain the user's existing commit structure; never mix unreviewed baseline changes with a new feature commit.

**Done when:** the baseline commit, dirty-file ownership, passing/failing tests, and accepted overlaps are known. No later task begins against an ambiguous worktree.

## Task 1: Add truthful vehicle and discovery contracts

**Requirements:** UX-04, UX-16–UX-22, WM-04, WM-08, WM-13, WM-14, CD-01, CD-02, CD-05.

**Owned files:**

- `packages/contracts/src/case.ts`
- `packages/contracts/src/case.test.ts`
- `packages/contracts/src/commands.ts`
- `packages/contracts/src/commands.test.ts`
- `packages/contracts/src/events.ts`
- `packages/contracts/src/events.test.ts`
- `packages/contracts/src/packs.ts`
- `packages/contracts/src/packs.test.ts`
- `packages/contracts/src/index.ts`

**Contract changes:**

- Add `EntityResolutionLevelSchema = z.enum(["model", "listing"])` to candidate entities; require listing provenance fields only for `listing`.
- Add `DiscoveryTopicStatusSchema = z.enum(["unknown", "inferred_pending", "confirmed", "deferred", "not_applicable", "blocked"])`.
- Add `DiscoveryTopicStateSchema` with `topicId`, `label`, `status`, `valueSummary`, `source`, `updatedAt`, and optional `blockingReason`.
- Add a user-facing importance classification for `must_work`, `matters_a_lot`, `nice_to_have`, and `needs_verification`; preserve the internal distinction between confirmed blockers and unresolved compatibility.
- Add `DecisionBriefSchema` with `useCase`, `decisionFor`, `outcome`, `coverage`, `nextTopicId`, `blindSpotReview`, `mode`, and `provisional`.
- Add pack-declared discovery topic templates, conditional applicability, priority, allowed mappings, and completion/readiness consequences.
- Add pack-declared bounded interaction types, option seeds/sources, allowed escape hatches, and confirmation policy.
- Add a typed interaction request/response contract whose response may propose several atomic topic mappings with origin and confidence.
- Add typed commands/events for confirming, correcting, deferring, and marking topics not applicable.
- Add a bounded `NextMoveSchema` that names the move, reason, required tool/view, and whether it may interrupt human navigation.

**TDD sequence:**

1. Add failing schema tests for a family brief, a landscaping brief, a deferred budget topic, and model/listing entities.
2. Add failing rejection tests for a listing without provenance, an unknown status, and a next move referencing an undeclared view.
3. Run:

   ```bash
   pnpm vitest run packages/contracts/src/case.test.ts packages/contracts/src/commands.test.ts packages/contracts/src/events.test.ts packages/contracts/src/packs.test.ts
   ```

   Confirm the new tests fail for missing behavior.
4. Implement the schemas and exports with backward-compatible parsing only where the existing stored state requires it.
5. Re-run the focused tests and `pnpm typecheck`.
6. Commit: `feat(contracts): model adaptive vehicle discovery state`.

**Done when:** contracts can represent the three personas, a deferred topic, and the model-to-listing transition without ambiguous candidate claims.

## Task 2: Make discovery derivation deterministic

**Requirements:** UX-04, UX-18, UX-19, WM-04, WM-08, WM-09, WM-12.

**Owned files:**

- `packages/core/src/discovery.ts` (new)
- `packages/core/src/discovery.test.ts` (new)
- `packages/core/src/create-case.ts`
- `packages/core/src/create-case.test.ts`
- `packages/core/src/reducer.ts`
- `packages/core/src/reducer.test.ts`
- `packages/core/src/readiness.ts`
- `packages/core/src/readiness.test.ts`
- `packages/core/src/index.ts`

**Behavior:**

- Compile pack topic templates into case-specific coverage.
- Choose the highest-value applicable unknown topic deterministically.
- Prefer a pending inference confirmation before asking an unrelated new question.
- Enforce mode-aware completion: conversational required topics may become confirmed or not applicable but not deferred before search; standalone soft topics may defer with provisional consequences.
- Validate every supported mapping from one response atomically and suppress future questions for topics already answered.
- Reject silent overwrites of human-confirmed values by a model-origin command.
- Require explicit confirmation before an inferred need becomes a blocker; keep unknown physical or accessibility compatibility in `needs_verification`.
- Derive `NextMove` and default view from state, not prompt prose.
- Mark standalone results provisional when material topics are deferred; distinguish later evidence/physical unknowns from incomplete discovery.

**TDD sequence:**

1. Write table-driven failing tests for the 20-turn golden simulation plus interruption, correction, skip, and resume branches.
2. Write failing ownership tests proving that model-origin updates cannot replace human-confirmed values.
3. Write failing readiness tests for complete conversational coverage, missing blind-spot review, standalone deferred soft topics, and blocked hard constraints.
4. Run the focused tests and confirm failure.
5. Implement pure derivation/reducer functions; keep language generation outside core.
6. Re-run focused tests, `pnpm test:unit`, and `pnpm typecheck`.
7. Commit: `feat(core): derive discovery coverage and next moves`.

**Done when:** the same state always yields the same allowed next moves, readiness consequence, and default pane view.

## Task 3: Generalize the car pack into vehicle selection

**Requirements:** UX-16, UX-17, UX-20, CD-03, CD-05, HK-06.

**Owned files:**

- `packages/packs/src/car-purchase.ts`
- `packages/packs/src/car-purchase.test.ts`
- `packages/packs/src/__snapshots__/car-purchase.test.ts.snap`
- `packages/packs/src/canonicalize.ts` and test only if compiler support is required

**Behavior:**

- Preserve the existing pack ID if changing it would break stored/demo cases, but change user-facing language to “Vehicle selection.”
- Declare shared topics for use case, occupants/operators, hard constraints, budget/cost boundary, usage pattern, environment, preferences, and evidence expectations.
- Make household-only topics conditional.
- Add operational topics for payload/towing, equipment access, worksite conditions, downtime risk, operating cost, and upfit needs.
- Define the model-discovery stage and optional exact-listing verification stage.
- Keep pack guidance structured and progressive; do not return all domain instructions at bootstrap.

**TDD sequence:**

1. Add failing pack conformance tests that compile personal/family, landscaping, and known-listing inputs.
2. Assert materially different applicable topics, suggested questions, criteria, obligations, and investigation steps for family versus landscaping.
3. Assert that neither path claims live listing data without listing provenance.
4. Update the pack and snapshots.
5. Run:

   ```bash
   pnpm vitest run packages/packs/src/car-purchase.test.ts packages/packs/src/canonicalize.test.ts
   pnpm test:pack
   ```

6. Commit: `feat(packs): generalize car purchase to adaptive vehicle selection`.

**Done when:** the two no-shortlist personas diverge structurally from the same pack and the informed shopper joins at the correct stage.

## Task 4: Expose a clean WebMCP bootstrap and active-case guide

**Requirements:** UX-03, UX-21, UX-22, WM-01–WM-06, WM-11, WM-13, WM-14.

**Owned files:**

- `apps/web/src/model-context/webmcp-local-schemas.ts`
- `apps/web/src/model-context/register-sift-tools.ts`
- `apps/web/src/model-context/register-sift-tools.test.ts`
- `apps/web/src/model-context/register-sift-tools-new-tools.test.ts`
- `apps/web/src/model-context/webmcp-contract.test.ts`
- `apps/web/src/model-context/case-context.ts`
- `apps/web/src/model-context/case-context.test.ts`
- `apps/web/src/api/sift-client.ts`
- `apps/web/src/api/sift-client.test.ts`
- `apps/agent/src/routes/cases.ts`
- `apps/agent/src/routes/cases.test.ts`
- `apps/agent/src/routes/packs.ts`
- `apps/agent/src/routes/packs.test.ts`

**Tool lifecycle:**

1. Pre-case tools: describe Sift, list matching packs, start/resume a case.
2. `sift_start_case` accepts natural intent, selected pack ID, optional known models/listings, and confirmed initial facts.
3. After activation, the tool surface exposes a pinned interaction guide, current context, valid next moves, discovery updates, catalog search, pane presentation, investigation, and human-authority actions.
4. A typed `sift_request_interaction`-style tool accepts one pack-valid interaction, context-specific suggestions, valid escape hatches, and allowed mappings; Sift—not the model—renders the component and persists its response.
5. Tool descriptions say when to use the tool, what changes state, and what requires confirmation.
6. Fresh load and case transition both publish readiness and recover cleanly from registration failure.

**TDD sequence:**

1. Add failing contract tests for the pre-case surface, `sift_start_case`, post-activation surface, bounded guide payload, valid/invalid generative interaction requests, response round-trip, and refresh recovery.
2. Add failing route tests for a family start, landscaping start, known-listing start, ambiguous pack selection, and invalid input.
3. Confirm failures with focused Vitest commands.
4. Implement the routes, client methods, schemas, and actual `registerTool` wiring.
5. Re-run focused tests, `pnpm test:contract`, `pnpm test:integration`, and `pnpm typecheck`.
6. Commit: `feat(webmcp): add conversational case bootstrap and guide`.

**Done when:** a new host session can move from “help me choose a car” to an active, correctly initialized case without manual launcher navigation.

## Task 5: Make catalog discovery constraint-aware and honest

**Requirements:** UX-05, UX-06, UX-16, CD-01–CD-04.

**Owned files:**

- `packages/catalog/data/vehicle-demo-profiles.json` (new)
- `packages/catalog/src/schema.ts`
- `packages/catalog/src/query.ts`
- `packages/catalog/src/query.test.ts`
- `packages/catalog/src/map-to-option.ts`
- `packages/catalog/src/map-to-option.test.ts`
- `apps/web/src/model-context/catalog-search-adapter.ts`
- `apps/web/src/model-context/catalog-search-adapter.test.ts`
- `apps/web/src/components/VehicleCatalogFlow.tsx`
- `apps/web/src/components/VehicleCatalogFlow.test.tsx`

**Behavior:**

- Retain the full 853-record EPA-derived model/year/trim catalog as the discovery universe.
- Add a curated hero cohort of roughly eight model profiles keyed to catalog records, with explicit `curated_demo` provenance for fields absent from EPA data.
- Filter only on fields the bundled catalog actually supports.
- Rank the remaining records with a transparent, deterministic match explanation.
- Map results as model-level candidates with catalog provenance.
- Show unavailable fields as unknown, not absent or satisfied.
- Label the transition to exact listings as a separate next step.
- Allow a normal catalog-created case to enter the real investigation path.
- Refactor/reuse the existing fictional car fixtures as model-level enrichment for the hero cohort; reserve exact fictional listings for the known-listing scenario.

**TDD sequence:**

1. Add failing query tests for family and landscaping constraints using existing catalog fields.
2. Add failing schema/mapping tests for curated hero profiles, explicit demo provenance, and model-level identity.
3. Add failing tests for explicit unknown live price/availability and the distinction between indicative demo price bands and real listing price.
4. Add a failing integration test proving a discovered catalog candidate can receive curated enrichment and start the hero investigation path without switching case identity.
5. Implement query/ranking/mapping changes and the UI labels.
6. Run focused tests plus:

   ```bash
   pnpm vitest run apps/agent/src/routes/catalog-case-integration.test.ts
   pnpm test:contract
   ```

7. Commit: `feat(catalog): discover and enrich demo model candidates`.

**Done when:** the no-shortlist flow produces a useful, bounded candidate set without making listing-level claims.

## Task 6: Persist direct human preference actions

**Requirements:** UX-05, UX-14, UX-15, WM-07, WM-09.

**Owned files:**

- `packages/contracts/src/commands.ts` and tests if Task 1 did not include dispositions
- `packages/core/src/reducer.ts` and tests
- `apps/agent/src/services/command-service.ts`
- `apps/agent/src/services/command-service.test.ts`
- `apps/web/src/components/QuickPickView.tsx`
- `apps/web/src/components/QuickPickView.test.tsx`
- `apps/web/src/model-context/case-context.ts`
- `apps/web/src/model-context/case-context.test.ts`
- `apps/web/src/app/App.tsx`
- `apps/web/src/app/App.test.tsx`

**Behavior:**

- Persist `keep`, `pass`, and `unsure` with human origin, timestamp, and optional reason.
- Keep focus/navigation separate from disposition.
- Expose dispositions and their state revision through the next case-context read.
- Prevent agent tools from silently reversing a human disposition.
- Give immediate accessible feedback in Quick Pick.

**TDD sequence:**

1. Add failing reducer/service tests for each disposition and protected ownership.
2. Add failing component tests for pointer, keyboard, feedback, and advance behavior.
3. Add a failing WebMCP round-trip test: pane action → state revision → next context response.
4. Implement the narrowest command and UI changes.
5. Run focused tests, `pnpm test:contract`, and `pnpm typecheck`.
6. Commit: `feat(workspace): persist human quick-pick judgments`.

**Done when:** the video can visibly prove both directions of the human–model WebMCP loop.

## Task 7: Continuously produce, focus, and revise a real investigation RunPlan

**Requirements:** AG-01–AG-05, AG-08, DX-03–DX-06, UX-07, UX-09.

**Owned files:**

- `packages/contracts/src/runtime.ts`
- `packages/contracts/src/runtime.test.ts`
- `apps/agent/src/runtime/run-plan.ts` (new)
- `apps/agent/src/runtime/run-plan.test.ts` (new)
- `apps/agent/src/services/run-service.ts`
- `apps/agent/src/services/run-service.test.ts`
- `apps/agent/src/runtime/event-normalizer.ts`
- `apps/agent/src/runtime/event-normalizer.test.ts`
- `apps/web/src/hooks/use-runtime-inspector.ts`
- `apps/web/src/hooks/use-runtime-inspector.test.ts`
- a new consumer projection component selected after Task 0; do not overwrite the dirty decision-profile implementation
- `apps/web/src/components/RuntimeInspector.tsx`
- `apps/web/src/components/RuntimeInspector.test.tsx`

**Behavior:**

- Build a validated run plan from current obligations, pack specialists, tool registry, policy, budget, and stop conditions.
- Start only safe, read-only, budgeted enrichment as confirmed facts make it useful; trigger bounded candidate enrichment after discovery and focus deeper work after Keep/Pass/Unsure.
- Persist the full capability decision: available, selected, and withheld specialists/tools with reasons.
- Revise the plan when a new concern or material criterion changes; preserve the prior revision and emit a correlated diff.
- Cancel/mark stale affected work, retain unaffected evidence, and deduplicate/cache equivalent work.
- Project a short consumer plan (“what Sift will check”) and a technical inspector trace from the same events.
- Keep scripted and adaptive runs visibly distinct.

**TDD sequence:**

1. Add failing plan-construction tests for the family case and landscaping case.
2. Add failing validation tests for an unknown tool, disallowed specialist, exceeded budget, and absent stop condition.
3. Add a failing revision test where a new cargo concern changes steps/tools and emits a plan diff.
4. Add failing UI tests for consumer plan, inspector capability reasons, and scripted/adaptive labels.
5. Implement plan derivation, validation, events, and projections.
6. Run focused tests, `pnpm test:integration`, `pnpm test:scenario`, and `pnpm typecheck`.
7. Commit: `feat(runtime): execute visible validated run plans`.

**Done when:** the run shown in the demo is produced from current state and its visible revision correlates to the user's new concern.

## Task 8: Add the persistent orientation shell and deterministic view director

**Requirements:** UX-08, UX-10–UX-13, UX-18, WM-12.

**Owned files:**

- `apps/web/src/components/DecisionOrientationShell.tsx` (new)
- `apps/web/src/components/DecisionOrientationShell.test.tsx` (new)
- `apps/web/src/components/ContextActionDock.tsx` (new)
- `apps/web/src/components/ContextActionDock.test.tsx` (new)
- `apps/web/src/components/LivingRecommendationList.tsx` (new)
- `apps/web/src/components/LivingRecommendationList.test.tsx` (new)
- `apps/web/src/components/DiscoveryInteraction.tsx` (new)
- `apps/web/src/components/DiscoveryInteraction.test.tsx` (new)
- `apps/web/src/components/view-director.ts` (new)
- `apps/web/src/components/view-director.test.ts` (new)
- `apps/web/src/components/WorkspaceAppBar.tsx`
- `apps/web/src/components/WorkspaceAppBar.test.tsx`
- `apps/web/src/components/WorkspaceViewSwitcher.tsx`
- `apps/web/src/components/WorkspaceViewSwitcher.test.tsx`
- `apps/web/src/app/App.tsx`
- `apps/web/src/app/App.test.tsx`
- `apps/web/src/styles/global.css`
- `apps/web/src/test/narrow-viewport.test.tsx`

**Behavior:**

- Persistent top shell shows decision, phase, coverage, current focus, latest change, next step, and provisional/blocked state.
- A persistent bottom dock exposes the current artifact's one or two primary actions without covering content or focus targets inside the iframe viewport.
- Narrow mode is a companion canvas; desktop mode may expose broader navigation without changing state semantics.
- Deterministic stage defaults select the first useful view.
- Valid model view requests may configure a pack-declared view.
- Explicit human navigation persists until a required stage transition or explicit release.
- Pane transitions are explained with a short “why this view” label when non-obvious.
- The active discovery topic renders a pack-valid, context-aware interaction with accessible selection, custom input, none/unsure/defer behavior, and no silent preselection.
- Budget distinguishes target, stretch, and absolute ceiling; decision factors distinguish Must work, Matters a lot, Nice to have, and Needs verification.
- The living recommendation list updates from canonical deterministic scoring/evidence, leads with **Current strongest fit** only when support exists, retains every active candidate and disposition, explains movement/coverage/unknowns, and never issues a purchase instruction.

**TDD sequence:**

1. Add failing pure-policy tests for each major stage and model/human precedence.
2. Add failing component tests for unknown, deferred, investigating, recommendation-ready, stale, and decided states, plus every allowed interaction and escape-hatch behavior.
3. Add failing 390/430/480/1440 viewport and keyboard/accessibility assertions.
4. Implement the shell and view director using canonical state from Tasks 1–2.
5. Run focused tests and focused Playwright specs without updating snapshots until behavior assertions pass.
6. Review visual diffs at every viewport, then update only intentional baselines.
7. Commit: `feat(web): add adaptive orientation shell and view director`.

**Done when:** at every recorded beat a novice can identify where they are and the single most useful next action without reading the chat history.

## Task 9: Extend scenarios into a persona UX harness

**Requirements:** EV-01–EV-06, EV-08.

**Owned files:**

- `packages/scenarios/src/persona.ts` (new)
- `packages/scenarios/src/persona.test.ts` (new)
- `packages/scenarios/src/turn-artifact.ts` (new)
- `packages/scenarios/src/turn-artifact.test.ts` (new)
- `packages/scenarios/src/ux-oracle.ts` (new)
- `packages/scenarios/src/ux-oracle.test.ts` (new)
- `packages/scenarios/src/ux-rubric.ts` (new)
- `packages/scenarios/src/ux-rubric.test.ts` (new)
- `packages/scenarios/src/artifact-writer.ts`
- `packages/scenarios/src/artifact-writer.test.ts`
- `packages/scenarios/src/index.ts`
- `packages/scenarios/personas/family-novice.json` (new)
- `packages/scenarios/personas/landscaping-owner.json` (new)
- `packages/scenarios/personas/known-listings.json` (new)
- `scripts/test-persona.ts` (new)
- `scripts/test-persona.test.ts` (new)
- `package.json`

**Turn artifact:**

- persona-visible input and chosen response;
- assistant output and tool calls/results;
- state before/after and normalized diff;
- discovery coverage, next move, view ownership, and rendered view;
- runtime events, run-plan revision, evidence/authority state;
- screenshot and accessibility snapshot paths;
- latency, token/cost data when available; and
- redaction manifest and deterministic assertions.

**Blocking oracle:**

- state/tool/UI correlation;
- truthful data/provenance and no unsupported claims;
- protected human authority;
- correct view and next action;
- no redundant question for a topic already answered in the same conversational or pane response;
- no missing custom/none/unsure/defer path where the pack declares it applicable;
- no inaccessible critical action or severe axe violation;
- no console/network failure;
- completion of the declared persona outcome; and
- fixture/live labeling.

**Diagnostic rubric:** score 1–5 with cited turn evidence for orientation, next-action clarity, relevance, efficiency, conversation–canvas coherence, control/flexibility, trust/evidence, and cognitive load. Report each dimension separately; do not collapse them into one release score.

**TDD sequence:**

1. Write failing schema tests for the three persona fixtures and a complete turn artifact.
2. Write failing oracle tests using intentionally inconsistent state/view, unsupported price, authority overwrite, redundant question, and missing next action.
3. Write failing report tests for per-dimension scores, objective metrics, median/range, and evidence citations.
4. Implement deterministic scripted persona actions first.
5. Add an optional model actor/evaluator adapter behind explicit environment configuration; deterministic CI must not require it.
6. Add `pnpm test:persona --persona <id>` and `pnpm test:persona` for all three.
7. Store artifacts under a gitignored bounded run directory and retain a curated sanitized report as submission evidence.
8. Run package tests and all three scripted personas.
9. Commit: `feat(scenarios): add turn-by-turn persona UX evaluation`.

**Done when:** every turn can be reconstructed from conversation through backend state to rendered pane, and a deterministic mismatch fails the run.

## Task 10: Prove the three golden journeys in Playwright

**Requirements:** UX-01, UX-16–UX-20, EV-03, EV-07.

**Owned files:**

- `tests/e2e/adaptive-vehicle-journey.spec.ts` (new)
- `tests/e2e/pages/sift-page.ts`
- `tests/e2e/helpers/turn-recorder.ts` (new)
- new snapshots owned by this spec only
- retire or narrow `tests/e2e/vehicle-catalog-journey.spec.ts` only after equivalent coverage exists

**Scenarios:**

1. **Family novice:** no shortlist → complete required discovery plus blind-spot review → model candidates with background enrichment → Quick Pick → new concern → plan revision → evidence → living recommendation list → human shortlist decision.
2. **Landscaping owner:** no shortlist → operational brief → operational criteria/plan/candidates structurally differ from family.
3. **Known listings:** exact listings provided → irrelevant discovery marked not applicable and all material gaps resolved → listing verification begins with explicit evidence gaps.

**TDD sequence:**

1. Add the tests against intended accessible roles/text and verify each fails before its dependent behavior is complete.
2. Reuse the existing 390/430/480/1440 projects, console/network guards, axe checks, keyboard paths, and production build.
3. Capture state/tool/runtime artifacts through stable APIs, not DOM scraping when a canonical source exists.
4. Update screenshots only after semantic assertions and accessibility checks pass.
5. Run each scenario twice from clean state to expose ordering/leakage issues.
6. Run the full E2E suite before commit.
7. Commit: `test(e2e): prove adaptive vehicle persona journeys`.

**Done when:** the family path completes twice without repair and the other personas prove meaningful branching rather than copy changes.

## Task 11: Run real-host acceptance and freeze the recording build

**Requirements:** WM-11, EV-07, HK-01, HK-04, HK-05.

**Owned files:**

- `docs/submissions/webmcp/host-acceptance.md` (new)
- `docs/submissions/webmcp/claim-evidence-matrix.md` (new)
- `docs/submissions/webmcp/requirements-checklist.md`

**Steps:**

1. Deploy the candidate build to the final public URL.
2. Open it in a fresh ChatGPT in-app browser or compatible WebMCP-enabled Chrome profile.
3. Record timestamp, build SHA, URL, host/version, discovered tools, transcript, case/run IDs, screenshots, and outcome.
4. Execute the family golden path using only the actions allowed in the recording.
5. Execute the WebMCP proof loop: conversation changes canvas → human changes pane → conversation reads the change.
6. Start the landscaping contrast and verify structural differences.
7. Test refresh/resume and one recoverable failure.
8. Log every spoken or written claim in the matrix with code, automated proof, visible proof, and limitation.
9. Fix any blocking product problem and repeat the host acceptance from clean state.
10. Freeze the successful build SHA. Only submission-document/video edits may follow unless the frozen build has a blocking defect.

**Done when:** the exact deployed build intended for recording has a complete, reproducible real-host acceptance record.

## Task 12: Replace the stale submission packet and record the video

**Requirements:** HK-01–HK-06 and every official deliverable.

**Owned files:**

- `README.md`
- `LICENSE` or existing top-level license placement
- `docs/submissions/webmcp/submission-details.md`
- `docs/submissions/webmcp/requirements-checklist.md`
- `docs/submissions/webmcp/demo-script.md`
- `docs/submissions/webmcp/claim-evidence-matrix.md`
- `docs/submissions/README.md`

**Steps:**

1. Rewrite the description around the adaptive decision experience and the exact four official questions.
2. Explain WebMCP implementation with real tool names and shared-state behavior.
3. Describe the person/model/Sift/Strands authority split truthfully.
4. Include the model-catalog/listing boundary and any remaining fixture limitation.
5. Put the open-source license where a judge can find it immediately.
6. Verify setup instructions from a clean clone or equivalent isolated checkout.
7. Replace the old seeded-case demo script with the 2:45–2:55 recording spine from the final delivery plan.
8. Record short, tested clips from the frozen build; assemble them without dead air or setup.
9. Add audio/captions, verify legibility at normal playback size, and keep the final export below three minutes.
10. Upload publicly to YouTube and verify access while signed out.
11. Run:

    ```bash
    pnpm test:submission
    pnpm verify:release
    ```

12. Verify the live URL and repository while signed out, then complete the Devpost fields.
13. Do not modify the submitted code after the deadline until the rules permit it.
14. Commit: `docs(submission): finalize WebMCP challenge package`.

**Done when:** every official deliverable is public, accessible, consistent with the frozen build, and represented in the final checklist.

## Required execution order and stop rules

```text
Task 0 baseline
  -> Tasks 1–3 state and pack semantics
  -> Tasks 4–6 bidirectional WebMCP product loop
  -> Task 7 real run-plan proof
  -> Task 8 coherent adaptive pane
  -> Task 9 harness
  -> Task 10 golden journeys
  -> Task 11 real-host acceptance and freeze
  -> Task 12 submission and recording
```

Tasks may overlap only when their owned files do not overlap and the shared contracts from the previous task are merged. If time pressure forces a cut:

1. never cut truthfulness, human authority, real-host proof, or the complete family path;
2. reduce inspector polish before reducing the underlying run-plan/event proof;
3. reduce model-scored evaluation before deterministic turn gates;
4. reduce landscaping depth before removing its structural contrast; and
5. reduce desktop polish before narrow companion clarity.

## Final verification

Run from the frozen candidate SHA:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:contract
pnpm test:integration
pnpm test:scenario
pnpm test:persona
pnpm test:e2e
pnpm test:deployed
pnpm test:submission
pnpm verify:release
```

Record pass/fail, duration, artifact path, and any accepted limitation. “Looks right in the demo” is not verification.
