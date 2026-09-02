# Claude Code Autonomous Implementation Prompt

Copy the complete prompt below into the Claude Code session working on this repository.

---

You are the primary implementation agent for the Sift hackathon-final build in `/Users/jordanallen/IdeaProjects/pax`.

The user has approved the product design and execution plan. This is no longer a brainstorming or replanning task. Implement the approved plan end to end, test it aggressively, repair defects, update the documentation alongside the code, and leave a release-candidate build for an independent Codex review. Work autonomously through the complete P0 scope. Do not stop after an audit, plan, contract layer, partial vertical slice, or passing unit suite.

## Authority and precedence

Read these files completely before making changes, in this order:

1. `CLAUDE.md`
2. `docs/final-plan/final-approved-experience.md`
3. `docs/final-plan/final-hackathon-execution-plan.md`
4. `docs/final-plan/README.md`
5. `docs/final-plan/hackathon-scope-triage.md`
6. `docs/final-plan/webmcp-final-implementation-plan.md`
7. `docs/final-plan/requirements-ledger.md`
8. the active specifications and decisions required by `CLAUDE.md`

Precedence is explicit:

1. the user's current prompt;
2. `docs/final-plan/final-approved-experience.md`;
3. `docs/final-plan/final-hackathon-execution-plan.md`;
4. `CLAUDE.md`;
5. active specifications and older plans.

The canonical experience and execution plan override older documents wherever they disagree about scope, product behavior, demo priority, or execution order. Treat older documents as current-state context and migrate them during implementation. Do not reopen approved product decisions and do not restore anything listed under **Explicitly cut**.

## Approved product outcome

Build one exceptionally polished, conversation-led Vehicle Selection hero that proves:

- natural WebMCP activation from a fresh conversation;
- adaptive, pack-driven discovery rather than a fixed questionnaire;
- one answer filling several topics without redundant questions;
- bounded context-aware interactions with custom/none/unsure escape paths;
- explicit confirmation before an inference becomes a blocker;
- one contextual blind-spot review before discovery;
- truthful model-level discovery across the bundled 853-record EPA catalog plus a clearly labeled curated hero cohort;
- automatic, durable, undoable Keep / Pass / Unsure Quick Pick;
- pane-to-conversation readback of the person's actions;
- real continuous RunPlan creation, focus, revision, reuse, cancellation/staleness, skills/tools/agents, and evidence effects;
- a living recommendation list with a supported leader or honest tie, all active alternatives, tradeoffs, coverage, disputes, unknowns, what could change, and test-drive checks;
- structural human authority over shortlist confirmation and final choice;
- a persistent narrow-pane orientation shell and contextual action dock; and
- a brief landscaping-business opening that produces a materially different brief, questions, criteria, and plan from the same Vehicle Selection pack.

The product must make the thesis visible without narration:

> Conversation is the conductor. Sift is the decision system.

The external world may be curated or fixture-backed when disclosed. The product behavior may not be simulated. WebMCP calls, canonical state mutations, pane readback, RunPlan/events, ranking, invalidation, human authority, and UI cause-and-effect shown to judges must execute for real.

## Initial repository and source-control procedure

At handoff, the last observed shared checkout was `main` at `da3ad9f`, with `docs/final-plan/` untracked. Treat that only as a snapshot and verify reality yourself.

1. Run and record:

   ```bash
   git status --short
   git branch --show-current
   git rev-parse --short HEAD
   git log --oneline -12
   ```

2. Preserve all user and concurrent-session changes. Never use `git reset --hard`, destructive checkout, broad clean commands, or force push. Never amend or rewrite unrelated commits.
3. Inspect every untracked file under `docs/final-plan/`. They are approved work, not disposable scratch files.
4. If git is writable, commit the approved planning package and `CLAUDE.md` precedence notice as a docs-only checkpoint before product edits. Do not stage unrelated files.
5. Determine whether another process/session owns overlapping files. If so, avoid overlap or create an isolated worktree/branch from the correct current state. Do not discard its work.
6. Record the baseline, ownership, existing failures, and chosen isolation strategy in `docs/build-log.md`.

## Execution behavior

Use `docs/final-plan/final-hackathon-execution-plan.md` as the sole task control plane.

- Execute Tasks 0 through 10 in order. Task 11 begins only after the WebMCP build is frozen.
- Maintain the plan checkboxes truthfully. Mark an item complete only after its implementation, docs, focused tests, and gate pass.
- Use test-driven development for every behavior change: create the failing behavioral test, run and record the expected failure, implement the smallest coherent production behavior, rerun the focused test, then run the parent gate.
- Update the corresponding active specification and TSDoc in the same task as the code. Follow the plan's **Docs to update during implementation** checklist.
- Make coherent milestone commits when git is available. Each commit should contain only the task's owned behavior, tests, and documentation.
- Reuse existing components, contracts, stores, routes, catalog code, scenarios, and Strands integrations. Extend the current architecture; do not start a parallel application or rewrite working subsystems without evidence that the seam cannot support the approved behavior.
- Use the current installed APIs and primary official documentation when platform behavior is uncertain. Do not invent WebMCP or Strands APIs.
- Continue through context compaction by keeping `docs/build-log.md`, plan checkboxes, test evidence, and commits current.
- Do not ask the user to choose routine implementation details. Make the smallest decision consistent with the canonical documents and document consequential decisions.

The separate discovery-engine repository is non-blocking. If the user provides its path before Task 2 completes, inspect it and record keep/adapt/retire decisions. Otherwise implement the repository-native deterministic discovery contract and continue.

## Scope discipline and deadline rule

P0 is mandatory. P1 is conditional. The explicit cut list is closed.

Optimize in this order:

1. complete repeatable hero journey;
2. obvious orientation and next action;
3. genuine bidirectional WebMCP proof;
4. truthful agent/evidence cause and effect;
5. deterministic regression coverage and human authority;
6. demo clarity;
7. visual polish; and
8. breadth.

If schedule or complexity threatens the feature-freeze/recording buffer, cut P1 immediately. Do not cut a P0 behavior, weaken a release assertion, fabricate progress, or replace real product behavior with a scripted screen. Do not spend the recording window building a generalized framework.

Do not implement before the WebMCP freeze:

- live dealer inventory, local availability, pricing feeds, transactions, or negotiation;
- arbitrary generated HTML or a general GenUI framework;
- a public SDK, marketplace, or commercialization layer;
- a full second landscaping or Energy story in the WebMCP video;
- a complete Runtime Inspector redesign or elaborate agent animation;
- a full standalone redesign;
- production auth/tenancy/billing/scaling; or
- AWS-specific feature or video work.

## UX and visual quality contract

The 390–480 px companion pane is the primary experience. Desktop remains functional but is not allowed to consume hero-path polish time.

For every major state, prove that a novice can answer from the pane alone:

1. What decision am I making?
2. What phase am I in?
3. What has been covered or changed?
4. What is currently in focus?
5. What should I do next?
6. How do I reach the outcome?

The top orientation shell and bottom contextual action dock must remain visible without covering content, errors, focus, or the on-screen keyboard. Show one dominant artifact at a time. Use at most two primary actions. Preserve focus, keyboard use, accessible names, contrast, live-region behavior, safe areas, and responsive behavior at `390x844`, `430x900`, `480x900`, and `1440x1000`.

Run the persona UX harness for:

- a novice family buyer with no shortlist;
- a landscaping-business owner with no shortlist; and
- an informed shopper with known listings.

Deterministic hard gates are blocking. Model UX scoring is diagnostic and must cite exact turn artifacts. Release thresholds are median at least 4/5 in every dimension and no orientation/next-action turn below 3.

Open and inspect screenshots, traces, videos, accessibility snapshots, console logs, and diffs. Pixel equality is not visual review. Never update a baseline merely because it changed.

## Test and repair contract

For each failure:

1. read the complete error and artifact set;
2. reproduce with the narrowest command;
3. classify it as implementation, contract, fixture, environment, flake, or specification conflict;
4. repair the causal defect;
5. rerun the focused test and then the parent gate.

Never skip, focus, delete, weaken, or silently rewrite a test to make a gate pass. Never convert an unknown to zero, disputed to settled, fixture-backed to live, model candidate to dealer listing, Keep to shortlist approval, or visible animation to runtime proof.

If the same failure fingerprint survives three materially different repairs, create `artifacts/verification/latest/BLOCKED.md` with exact evidence and continue all independent work. Stop only if the unresolved external condition blocks every remaining P0 task.

Run the task-specific checks in the plan. At the freeze candidate, run the complete deterministic sequence:

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

After deployment, run:

```bash
pnpm test:deployed
pnpm test:submission
```

`test:live` and `test:observability` are currently staged, not evidence. Do not cite them unless you replace their staged implementations with real checks.

The family hero must pass twice from a clean state without manual repair. All three persona hard-gate journeys must pass. The real WebMCP host must prove fresh tool discovery and both directions of shared state control before the recording build is called frozen.

## Demo and judge-proof target

Build and validate the exact 2:45–2:55 story in the canonical experience:

1. fresh conversational activation and immediate orientation;
2. multi-topic discovery, bounded interaction, and blind-spot coverage;
3. honest model discovery;
4. human Quick Pick and model readback;
5. a new concern causing a visible real RunPlan revision;
6. living recommendations and test-drive shortlist;
7. brief family-versus-landscaping adaptation proof;
8. concise tool → state → plan → pane causal proof; and
9. the closing thesis.

Maintain `docs/submissions/webmcp/claim-evidence-matrix.md`. Every spoken/written claim must identify:

- implementation location;
- automated proof;
- visible proof;
- data provenance; and
- limitation.

Remove any claim without complete support.

## External actions and stop boundaries

You are authorized to implement, test, create local commits/branches/worktrees, update documentation, build artifacts, and follow the repository's existing deployment instructions needed to produce a testable release candidate.

Do not perform the final Devpost submission, change repository visibility, force-push, publish packages, purchase services, or represent user eligibility/legal attestations. Do not upload or publish the final demo video without the user's explicit approval. Prepare those artifacts and exact instructions, then leave them for the user's triple-check.

Real ChatGPT/WebMCP acceptance may require the user's authenticated UI. Complete every independent task first. If direct access remains unavailable, create the exact host-acceptance procedure and evidence template, mark only that gate as an external blocker, and do not falsely declare the recording build frozen.

## Completion and handoff

Do not report completion merely because code exists. Continue until all internally achievable P0 work is complete and verified, or a documented external blocker prevents every remaining step.

Before stopping:

1. reconcile every canonical-plan checkbox with evidence;
2. ensure active specs and README describe the implemented product rather than the old design;
3. ensure no placeholders, skipped/focused tests, accidental secrets, or unexplained untracked acceptance changes remain;
4. inspect the final screenshots as one coherent product set;
5. prepare the real-host acceptance record and complete it when access permits;
6. prepare the claim-evidence matrix, recording script, shot list, submission details, and checklists;
7. write/update `docs/completion-report.md`; and
8. leave a clean, reviewable git state with the final SHA and no unrelated changes absorbed.

The completion report must contain:

- implemented capabilities by canonical task;
- exact commands, results, test counts, and artifact paths;
- persona scores and hard-gate results;
- Playwright projects, viewport coverage, and screenshot inventory;
- WebMCP tool and bidirectional-host evidence;
- RunPlan/agent/skill/tool/evidence causal proof;
- deployment identifiers/URL and deployed checks when performed;
- every external blocker with exact remaining user action;
- known limitations and truthful fixture/curated-data boundaries;
- demo recording procedure;
- commit list and final SHA;
- risk assessment and rollback instructions; and
- a concise list titled **What Codex must independently review and retest**.

Start now with the required reading and Task 0. Do not stop after restating the plan.

---
