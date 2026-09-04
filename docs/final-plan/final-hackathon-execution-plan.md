# Sift Final Hackathon Execution Plan


Status: approved by the user on September 2, 2026 for implementation by Claude Code, followed by an independent Codex review and test pass. This plan and [the canonical experience specification](./final-approved-experience.md) supersede older planning documents when they conflict.

**Goal:** Freeze and ship one exceptionally polished, conversation-led Vehicle Selection demonstration that proves non-trivial bidirectional WebMCP, adaptive pack behavior, real agent-plan revision, and human decision authority before the September 3, 2026 deadline.

**Architecture:** ChatGPT conducts the conversation and chooses among bounded next moves. A Decision Pack declares the required discovery topics, interaction grammar, evidence expectations, and capabilities. Sift core owns canonical state, coverage, authority, ranking, invalidation, and view requirements. The pane projects that state and captures direct human judgment. Strands executes an inspectable, versioned RunPlan. The external data may be deterministic and curated; every product behavior shown to judges must be real.

**Tech stack:** pnpm TypeScript monorepo, Zod, React, Fastify, WebMCP `document.modelContext.registerTool`, Strands runtime adapters, Vitest, Playwright, axe-core, and the existing scenarios/artifact stack.

**Spec:** [Final adaptive decision experience](./final-approved-experience.md). The older [detailed implementation appendix](./webmcp-final-implementation-plan.md) contains additional file-level notes but may not broaden this plan.

## Scope lock

### The winning proof

The recording proves one causal loop:

1. A person states an outcome in conversation.
2. ChatGPT starts Vehicle Selection and Sift immediately shows phase, coverage, and next action.
3. One natural answer fills several discovery topics; one bounded pane interaction resolves the next high-value gap.
4. A blind-spot check completes required coverage.
5. Sift discovers model-level candidates from the real bundled catalog and enriches a disclosed curated cohort.
6. The person uses Keep / Pass / Unsure in Quick Pick; ChatGPT reads the durable result.
7. A new concern revises already-running agent work, reuses unaffected work, and changes evidence/recommendations.
8. The living recommendation list explains the current leader, alternatives, tradeoffs, unknowns, coverage, and test-drive checks.
9. A 10–15 second landscaping-business opening proves the same pack creates a materially different brief and plan.

### Non-negotiable P0

- Bidirectional WebMCP state changes are real.
- Required conversational discovery cannot be skipped.
- One response may populate several topics without repetition.
- Consequential inference cannot become a blocker without human confirmation.
- Candidate identity, data provenance, unknowns, and model-versus-listing semantics are truthful.
- Quick Pick dispositions are canonical, undoable, and distinct from shortlist approval.
- The RunPlan and its visible revision are event-derived, not animated theater.
- The narrow pane always shows orientation and a clear next action.
- Human-only shortlist/final authority is structurally enforced.
- Three persona hard-gate journeys, two clean family runs, and one real-host acceptance pass succeed.
- Every spoken claim maps to code, tests, visible proof, and a stated limitation.

### Conditional P1

Only do these after every P0 gate passes:

- richer inspector visualization;
- broader standalone polish;
- extra truthful catalog filters;
- in-product “How Sift works” content; and
- additional model-based UX repetitions beyond the required release sample.

### Explicitly cut

- live dealer inventory, local availability, pricing feeds, transactions, and negotiation;
- arbitrary generated HTML or a general GenUI framework;
- public SDK, marketplace, or commercialization work;
- a second complete landscaping or Energy story in the WebMCP video;
- accessibility compatibility as a headline claim without reliable source data;
- elaborate agent animation or a full Runtime Inspector redesign;
- full standalone-desktop redesign;
- autonomous control of the real ChatGPT UI in CI;
- production auth, tenancy, billing, scaling, or operations; and
- any AWS-specific build or recording work before the WebMCP freeze.

## Execution rules

- [ ] Re-read this plan and the canonical spec at the start of every execution session.
- [ ] Recheck `git status --short`, branch, and HEAD before touching files; preserve user and concurrent-session changes.
- [ ] Do not begin a task whose owned files overlap an active coding session until ownership is reconciled.
- [ ] Start every behavior with a failing test and record the failure before implementation.
- [ ] Keep each task independently reviewable and commit only its owned files.
- [ ] Never call a fixture-backed event “live”; label curated and deterministic provider data in UI and submission copy.
- [ ] Cut P1 immediately if any P0 or recording-buffer gate is at risk.
- [ ] Do not silently weaken deterministic assertions to make a journey pass.
- [ ] Do not regenerate screenshot baselines unless a human-visible change is intentional and reviewed.
- [ ] Update the matching documentation in the same task as the behavior; do not postpone documentation to submission week.
- [ ] End every task with a completion report covering tests, documentation, format/lint, clean-code scan, risk, and rollback.

## Docs to update during implementation

These are implementation deliverables, not optional cleanup:

### Product and architecture

- [ ] `docs/decisions/0009-adaptive-decision-experience.md` (new) — record the accepted responsibility, mode, state, and fidelity decisions in Task 1.
- [ ] `docs/specs/product.md` — replace the old car journey with the approved outcome, modes, data boundary, Quick Pick semantics, living recommendation list, and human authority during Tasks 1–5.
- [ ] `docs/specs/architecture.md` — document discovery state, ownership, next-move derivation, and conversation/core/pane/runtime responsibilities during Tasks 1–4.
- [ ] `docs/specs/packs-and-routing.md` — document generalized Vehicle Selection branches and activation/routing behavior during Tasks 3–4.
- [ ] `docs/specs/pack-authoring.md` — document discovery topics, option seeds, bounded interaction grammar, and authority declarations during Task 3.

### APIs and runtime

- [ ] `docs/specs/webmcp.md` — document every lifecycle/interaction tool, request/response example, progressive disclosure rule, error behavior, and reconnect path during Task 4.
- [ ] `docs/specs/strands-runtime.md` — document continuous RunPlan triggers, revisions, reuse/cancellation, budgets, and protected state during Task 6.
- [ ] `docs/specs/debugging-and-observability.md` — document causal event fields and the consumer/developer projections during Task 6.
- [ ] Add TSDoc to every new exported contract/core function and update comments that describe replaced Quick Pick or RunPlan behavior in the same task.

### User, testing, and release documentation

- [ ] `docs/specs/demos-and-submission.md` — document the frozen product proof, data labels, acceptance gates, and two-hackathon relationship during Tasks 9–10.
- [ ] `docs/demo/webmcp-script.md` and `docs/demo/recording-checklist.md` — replace stale recording guidance during Task 10.
- [ ] `docs/submissions/webmcp/demo-script.md`, `submission-details.md`, and `requirements-checklist.md` — finalize from the frozen build during Task 10.
- [ ] `docs/submissions/webmcp/host-acceptance.md` and `claim-evidence-matrix.md` (new) — preserve real-host and claim proof during Task 10.
- [ ] `README.md` and `docs/specs/README.md` — update product framing, setup, test commands, pack proof, limitations, and authoritative-doc links during Task 10.

Documentation verification at freeze requires working relative links, accurate examples/commands, no placeholder markers, and no contradictory active specification.

## Task 0: Establish the integration checkpoint

**Files:** no planned product edits. Record the checkpoint in `docs/build-log.md` or the repository's current implementation log; do not create a second log if one already exists.

- [ ] Record `git rev-parse --short HEAD`, `git branch --show-current`, and `git status --short`.
- [ ] Confirm the Claude Code session has stopped, or map its exact file ownership and avoid those files.
- [ ] Inspect changes since `6edf2d1` through the current HEAD, including UI/ranking work and accepted snapshots.
- [ ] If the user's separate discovery engine is in scope and its path is available, inspect it now and record explicit keep/adapt/retire decisions; otherwise proceed with the repository-native discovery design and log the engine as non-blocking external input.
- [ ] Run `pnpm typecheck` and `pnpm test:unit`; record existing failures without repairing unrelated work.
- [ ] Create an isolated worktree only after the baseline is known if the chosen execution workflow requires it.

**Gate:** baseline ownership, current failures, and overlaps are unambiguous. No implementation task starts before this gate.

## Task 1: Model discovery and interaction truthfully

**Owned files:**

- `packages/contracts/src/discovery.ts` (new)
- `packages/contracts/src/discovery.test.ts` (new)
- `packages/contracts/src/case.ts`
- `packages/contracts/src/case.test.ts`
- `packages/contracts/src/commands.ts`
- `packages/contracts/src/commands.test.ts`
- `packages/contracts/src/events.ts`
- `packages/contracts/src/events.test.ts`
- `packages/contracts/src/packs.ts`
- `packages/contracts/src/packs.test.ts`
- `packages/contracts/src/index.ts`

**Required contracts:**

```ts
type DecisionMode = 'companion' | 'standalone';
type DiscoveryTopicStatus =
  | 'unknown'
  | 'inferred_pending'
  | 'confirmed'
  | 'deferred'
  | 'not_applicable'
  | 'blocked';
type ImportanceTier =
  | 'must_work'
  | 'matters_a_lot'
  | 'nice_to_have'
  | 'needs_verification';
type CandidateResolutionLevel = 'model' | 'listing';
type CandidateDisposition = 'unreviewed' | 'keep' | 'pass' | 'unsure';
```

- [ ] Write failing schema tests for family, landscaping, known-listing, multi-topic response, pending blocker confirmation, standalone deferral, and model/listing cases.
- [ ] Add typed discovery topics, coverage, decision brief, interaction request/response, atomic mappings with origin/confidence, dispositions, undo metadata, and bounded next moves.
- [ ] Make listing provenance required only for listing-level candidates.
- [ ] Reject unknown interaction types, undeclared views, invalid option mappings, and model attempts to perform human-only actions.
- [ ] Run focused contract tests and `pnpm typecheck`.
- [ ] Commit `feat(contracts): model adaptive decision discovery`.

**Gate:** all three personas and every authority/data boundary can be represented without overloaded fields or prompt-only convention.

## Task 2: Derive readiness, next moves, and authority in core

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

**Required public functions:**

```ts
deriveDiscoveryReadiness(caseState, pack): DiscoveryReadiness;
applyDiscoveryResponse(caseState, response, actor): CaseState;
deriveNextMoves(caseState, pack): NextMove[];
```

- [ ] Write failing table tests for multi-topic extraction, deduplication, pending inference, correction, custom input, blind-spot completion, mode-aware deferral, no-result constraints, reload/resume, and tie output.
- [ ] Compile pack topics into case-specific coverage and choose the highest-value applicable unresolved topic deterministically.
- [ ] Require required companion topics to be confirmed/not applicable before discovery; allow only standalone soft deferral and mark output provisional.
- [ ] Prevent model-origin updates from overwriting human-confirmed state or performing shortlist/final approval.
- [ ] Preserve unknown as unknown and disputed as disputed throughout readiness and ranking inputs.
- [ ] Derive the next move and required default view from state, not generated prose.
- [ ] Run focused tests, `pnpm test:unit`, and `pnpm typecheck`.
- [ ] Commit `feat(core): derive adaptive discovery and next moves`.

**Gate:** identical state always produces identical readiness, allowed actions, and required pane state.

## Task 3: Generalize Vehicle Selection and create the honest demo cohort

**Owned files:**

- `packages/packs/src/car-purchase.ts`
- `packages/packs/src/car-purchase.test.ts`
- `packages/packs/src/__snapshots__/car-purchase.test.ts.snap`
- `packages/catalog/src/schema.ts`
- `packages/catalog/src/schema.test.ts` (new)
- `packages/catalog/src/query.ts`
- `packages/catalog/src/query.test.ts`
- `packages/catalog/src/map-to-option.ts`
- `packages/catalog/src/map-to-option.test.ts`
- `packages/catalog/data/vehicle-demo-profiles.json` (new)

- [ ] Write failing pack conformance snapshots for family, landscaping, and known-listing branches.
- [ ] Preserve the pack ID if migration would destabilize stored cases; change user-facing language to Vehicle Selection.
- [ ] Declare conditional topics, option seeds, allowed interaction patterns, blind-spot rules, evidence expectations, specialists, tools, and authority limits.
- [ ] Make household and operational topics conditional; do not ask irrelevant personal questions.
- [ ] Add roughly eight stable `curated_demo` model profiles and provenance labels for decision-relevant fields absent from EPA data.
- [ ] Extend bounded catalog filtering/ranking only for fields actually present; never infer live price or availability.
- [ ] Refactor existing fictional car fixtures into model-level enrichment where useful; retain exact fictional listings only for the known-listing persona.
- [ ] Prove the full 853-record catalog remains the discovery universe and the hero case is not secretly replaced by a seeded case.
- [ ] Run pack/catalog tests, `pnpm test:pack`, and `pnpm typecheck`.
- [ ] Commit `feat(vehicle): support adaptive model discovery`.

**Gate:** family and business inputs produce materially different compiled briefs and plans from one pack, while every candidate claim has truthful provenance.

## Task 4: Expose the complete WebMCP lifecycle and bounded GenUI loop

**Owned files:**

- `apps/web/src/api/sift-client.ts`
- `apps/web/src/api/sift-client.test.ts`
- `apps/web/src/model-context/register-sift-tools.ts`
- `apps/web/src/model-context/register-sift-tools.test.ts`
- `apps/web/src/model-context/webmcp-contract.test.ts`
- `apps/web/src/model-context/case-context.ts`
- `apps/web/src/model-context/case-context.test.ts`
- `apps/agent/src/routes/cases.ts`
- `apps/agent/src/routes/cases.test.ts`
- `apps/agent/src/routes/commands.ts`
- `apps/agent/src/routes/commands.test.ts`
- `apps/agent/src/routes/packs.ts`
- `apps/agent/src/routes/packs.test.ts`

**Required tool surface:**

- `sift_list_packs`
- `sift_start_case`
- `sift_get_case_context`
- `sift_get_interaction_context`
- `sift_request_interaction`
- a typed response/mapping command exposed under the repository's naming convention

- [ ] Write failing lifecycle tests for fresh registration, unambiguous activation, ambiguity, resume/new choice, active-case re-registration, and reconnect.
- [ ] Write failing hostile-input tests for undeclared components/options/views and invalid topic mappings.
- [ ] Register a minimal global surface and progressively disclose pack/case context after activation.
- [ ] Return the pinned pack guide, current coverage, allowed next moves, available views, interaction grammar, and authority limits without dumping every pack detail.
- [ ] Persist pane responses and make them readable through `sift_get_case_context` on the next model turn.
- [ ] Ensure direct human navigation wins until a state-required transition or explicit return of control.
- [ ] Run focused WebMCP tests, `pnpm test:contract`, and `pnpm typecheck`.
- [ ] Commit `feat(webmcp): add adaptive case lifecycle`.

**Gate:** a fresh WebMCP-capable host can start/resume a case and prove both conversation→pane and pane→conversation changes through typed tools.

## Task 5: Persist Quick Pick and living recommendations

**Owned files:**

- `apps/web/src/components/QuickPickView.tsx`
- `apps/web/src/components/QuickPickView.test.tsx`
- `apps/web/src/components/WorkspaceViewSwitcher.tsx`
- `apps/web/src/components/WorkspaceViewSwitcher.test.tsx`
- `apps/web/src/components/RecommendationHero.tsx`
- `apps/web/src/components/RecommendationHero.test.tsx`
- `apps/web/src/components/RecommendationCard.tsx`
- `apps/web/src/components/RecommendationCard.test.tsx`
- `apps/web/src/app/App.tsx`
- `apps/web/src/app/App.test.tsx`
- `apps/agent/src/routes/commands.ts`
- `apps/agent/src/routes/commands.test.ts`
- `apps/web/src/lib/evidence-expectation.ts`
- `apps/web/src/lib/evidence-expectation.test.ts`

- [ ] Write failing tests proving automatic Quick Pick entry, Keep/Pass/Unsure persistence, undo, custom reason, reload, and model readback.
- [ ] Keep disposition distinct from focus, shortlist, and final approval in contracts, copy, and reducer behavior.
- [ ] Recompute the living list after disposition/evidence changes without hiding active alternatives.
- [ ] Show “Current strongest supported fit” only when deterministic evidence supports a leader; otherwise show a tie/group.
- [ ] Show decisive reasons, tradeoffs, coverage, disputes, unknowns, what could change, and test-drive checks.
- [ ] Run component, route, reducer, and focused WebMCP tests.
- [ ] Commit `feat(vehicle): persist triage and living recommendations`.

**Gate:** the human action visibly changes canonical state and the next conversational move; no UI copy tells the person what to buy.

## Task 6: Produce and revise a real continuous RunPlan

**Owned files:**

- `apps/agent/src/runtime/run-plan.ts` (new)
- `apps/agent/src/runtime/run-plan.test.ts` (new)
- `apps/agent/src/services/run-service.ts`
- `apps/agent/src/services/run-service.test.ts`
- `apps/agent/src/runtime/event-normalizer.ts`
- `apps/agent/src/runtime/event-normalizer.test.ts`
- `apps/agent/src/runtime/car-purchase-engine.ts`
- `apps/agent/src/runtime/car-purchase-engine.test.ts`
- `apps/agent/src/runtime/car-purchase-graph.ts`
- `apps/agent/src/runtime/car-purchase-graph.test.ts`
- `apps/agent/src/routes/runs.ts`
- `apps/agent/src/routes/runs.test.ts`

- [ ] Write failing tests for initial plan creation, safe early work, candidate enrichment, Keep/Unsure focus, concern-driven revision, unaffected-result reuse, affected-work cancellation/staleness, deduplication, budgets, and stop conditions.
- [ ] Construct a persisted `RunPlan` from pack capabilities, confirmed state, candidates, evidence needs, and budgets.
- [ ] Start only safe read-only work while discovery stabilizes; focus expensive/deep work after human triage.
- [ ] On a new concern, issue a new plan version, preserve unaffected accepted evidence, and stale/cancel only affected work.
- [ ] Emit normalized plan/agent/skill/tool/evidence events with causal IDs suitable for consumer progress and developer proof.
- [ ] Prevent runtime work from mutating human-protected state.
- [ ] Run focused runtime tests, `pnpm test:integration`, and `pnpm typecheck`.
- [ ] Commit `feat(runtime): execute evolving vehicle run plans`.

**Gate:** the exact plan revision shown in the demo is generated from a real concern/state change and explains what changed, what was reused, and why.

## Task 7: Build the persistent companion frame and deterministic view director

**Owned files:**

- `apps/web/src/app/App.tsx`
- `apps/web/src/app/App.test.tsx`
- `apps/web/src/components/WorkspaceViewSwitcher.tsx`
- `apps/web/src/components/WorkspaceViewSwitcher.test.tsx`
- `apps/web/src/components/DecisionOrientationShell.tsx` (new)
- `apps/web/src/components/ContextActionDock.tsx` (new)
- `apps/web/src/components/DiscoveryInteraction.tsx` (new)
- the relevant style/token files under `apps/web/src/styles/`
- colocated component tests and `apps/web/src/test/narrow-viewport.test.tsx`

- [ ] Write failing component tests for every major phase and viewport: 390, 430, 480, and 1440 CSS pixels.
- [ ] Render decision/pack, phase, required coverage, current focus, latest meaningful change, next action, and route to completion in a sticky top shell.
- [ ] Render no more than two current actions in a sticky bottom dock.
- [ ] Ensure the document reserves shell/dock space, handles iframe safe areas/on-screen keyboard, preserves visible focus, and never covers errors or final content.
- [ ] Render one dominant artifact at a time: brief, interaction, candidates, Quick Pick, comparison, progress/evidence, recommendations, or human confirmation.
- [ ] Derive required transitions from `NextMove`; accept only bounded presentation requests and respect active human navigation.
- [ ] Add clear `curated_demo`, provisional, unknown, disputed, and human-only labels.
- [ ] Run component tests, keyboard/accessibility tests, `pnpm lint`, and `pnpm typecheck`.
- [ ] Commit `feat(web): create adaptive companion frame`.

**Gate:** at every hero turn, a novice can answer “what am I doing, where am I, what changed, and what should I do next?” without reading the chat history.

## Task 8: Turn scenarios into the persona UX harness

**Owned files:**

- `packages/contracts/src/scenario.ts`
- `packages/contracts/src/scenario.test.ts`
- `packages/scenarios/src/trajectory.ts`
- `packages/scenarios/src/runner.ts`
- `packages/scenarios/src/assertions.ts`
- `packages/scenarios/src/artifact-writer.ts`
- their tests
- `packages/scenarios/fixtures/personas/` (new)
- `scripts/test-persona.ts` (new)
- `package.json`

- [ ] Write failing harness tests for persona inputs, turn artifacts, deterministic hard gates, diagnostic scores, and artifact redaction.
- [ ] Add family novice, landscaping owner, and known-listing shopper personas.
- [ ] Capture each turn's chat, tools, state before/after/diff, coverage, next move, RunPlan/events, view/ownership, visible controls, screenshot path, accessibility snapshot, latency, and cost.
- [ ] Fail on state/UI contradiction, unsupported claim, authority violation, incomplete companion discovery, blocker inference, missing next action, broken persistent frame, fabricated progress, serious accessibility issue, console/network error, or outcome dead-end.
- [ ] Add diagnostic 1–5 scores for orientation, next-action clarity, relevance, efficiency, conversation–canvas coherence, control/flexibility, trust/evidence, and cognitive load; require cited turn evidence.
- [ ] Add `pnpm test:persona` backed by `tsx scripts/test-persona.ts`.
- [ ] Run scenario unit tests and `pnpm test:scenario`.
- [ ] Commit `test(ux): add adaptive decision persona harness`.

**Gate:** every failure points to the exact turn, state diff, view, assertion, and screenshot needed for repair.

## Task 9: Prove and polish the golden journeys

**Owned files:**

- `tests/e2e/adaptive-vehicle-journey.spec.ts` (new)
- `tests/e2e/pages/sift-page.ts`
- `tests/e2e/helpers/layout-assertions.ts`
- `tests/e2e/helpers/axe.ts`
- only intentionally changed screenshot baselines

- [ ] Write the family end-to-end test before final UI repair and confirm it fails at the first missing behavior.
- [ ] Prove conversation activation, multi-topic discovery, bounded interaction, blind-spot completion, honest candidates, automatic Quick Pick, pane readback, RunPlan revision, recommendation update, and human shortlist authority.
- [ ] Add the short landscaping divergence assertion and the known-listing convergence journey.
- [ ] Assert 390/430/480 narrow layouts and 1440 standalone layout, keyboard operation, focus visibility, live-region behavior, no clipping/overlap, no console errors, and no unexpected network failures.
- [ ] Run one model diagnostic pass, fix cited P0 UX failures, and repeat deterministic tests after every repair.
- [ ] Require all hard gates, median ≥4 in every diagnostic dimension, and no orientation/next-action turn below 3.
- [ ] Run the family journey twice from clean state without manual intervention.
- [ ] Run `pnpm test:e2e`, `pnpm verify`, and `pnpm verify:release`.
- [ ] Review every changed screenshot manually before accepting it.
- [ ] Commit `test(e2e): prove the adaptive vehicle journey`.

**Gate:** the product—not narration—makes the thesis obvious and the recorded path is repeatable.

## Task 10: Real-host acceptance, public proof, and submission freeze

**Owned files:**

- `docs/submissions/webmcp/host-acceptance.md` (new)
- `docs/submissions/webmcp/claim-evidence-matrix.md` (new)
- `docs/submissions/webmcp/demo-script.md`
- `docs/submissions/webmcp/submission-details.md`
- `docs/submissions/webmcp/requirements-checklist.md`
- `docs/submissions/shared-release-checklist.md`
- `README.md`
- deployment/release files only when required by the current hosting path

- [ ] Refresh the official WebMCP rules and deadline from first-party sources before final submission work.
- [ ] In a fresh real ChatGPT/WebMCP-capable host, record tool discovery, activation, both-direction state control, reconnect/resume, case/run IDs, transcript, screenshots, and outcome.
- [ ] Map every UI, narration, README, and submission claim to implementation, automated proof, visible proof, data provenance, and limitation; remove unsupported claims.
- [ ] Verify signed-out live URL, signed-out public repository, visible license, setup steps, test steps, and required source/assets.
- [ ] Lock the final script to 2:45–2:55 and the beat sequence in the canonical spec.
- [ ] Freeze the build; after freeze, accept only submission blockers, broken claims, or recording-critical defects.
- [ ] Record tested clips, edit out setup/loading/live typing, confirm audio and duration, upload publicly, and recheck the public video.
- [ ] Run `pnpm test:deployed`, `pnpm test:submission`, and `pnpm verify:release` against the actual public artifacts.
- [ ] Present the final packet to the user for the requested triple-check before the irreversible/public submission action.
- [ ] Commit `docs(submission): freeze the WebMCP entry`.

**Gate:** every official deliverable works for a judge with no local context, and the video shows the working product in the first 15 seconds.

## Task 11: Choose the AWS hero only after WebMCP is frozen

- [ ] Evaluate whether Vehicle Selection has fully real Graph/RunPlan/agent/evidence execution and a coherent AWS-visible causal story.
- [ ] If yes, reuse the frozen Vehicle hero and emphasize the runtime architecture.
- [ ] If no, use Home Energy Guardian, whose Swarm, skills, interventions, GoalLoop, source challenge, and session path are currently deeper.
- [ ] Keep both entries consistent with the same Sift product thesis and truthfulness boundary.
- [ ] Create a separate AWS execution plan only after the choice; do not reopen WebMCP scope.

## Release command sequence

Run narrow checks after each task. Run this complete sequence only at the freeze candidate:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:pack
pnpm test:integration
pnpm test:contract
pnpm test:scenario
pnpm test:persona
pnpm test:e2e
pnpm verify
pnpm verify:release
```

After deployment, also run:

```bash
pnpm test:deployed
pnpm test:submission
```

`test:live` and `test:observability` are currently staged, not implemented. They may not appear as release evidence unless Task 8 or Task 10 replaces their staged scripts with real checks.

## Definition of done

- [ ] The family hero completes twice from clean state without repair.
- [ ] All three persona hard-gate journeys pass.
- [ ] Diagnostic thresholds pass with inspectable, turn-cited evidence.
- [ ] A real host proves the expected tools and both directions of shared control.
- [ ] The visible plan revision is causal and real.
- [ ] Every claim has implementation, automated proof, visible proof, provenance, and limitation.
- [ ] The public deployment, repository, license, setup, and tests work while signed out.
- [ ] The public video is under three minutes and starts with the product working.
- [ ] No surface implies unsupported live inventory, price, availability, compatibility, or authority.
- [ ] The user has reviewed the final packet before submission.

## Inputs and decisions still required from the user

Before implementation begins:

1. **Satisfied:** the user approved [the canonical experience](./final-approved-experience.md) and this execution plan on September 2, 2026.
2. **Satisfied:** Claude Code is the selected implementation executor. Codex will independently review and retest after Claude reports completion.
3. Claude must establish the current branch/HEAD/worktree ownership at Task 0 and preserve unrelated or concurrent work.
4. The discovery-engine repository/path is non-blocking unless the user supplies it before Task 2 completes.
5. No additional visual/brand constraint was supplied; refine the existing design system within the approved experience.

Before public submission, but not before implementation:

1. Permission/timing to make the repository public and the final repository/live URLs.
2. Eligibility/registration confirmations and personal form fields.
3. Approval of the public description, thumbnail/screenshots, architecture diagram, video, and final submission action.
