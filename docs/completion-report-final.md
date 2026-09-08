# Completion report — adaptive decision experience, final

Session date: 2026-09-02.
Plan executed: `docs/final-plan/final-hackathon-execution-plan.md`.
Baseline: `main` @ `da3ad9f`.

Supersedes `completion-report-adaptive-experience.md`, which was written mid-session and whose "what is not done" list is now stale. That file remains accurate for the per-task implementation detail of Tasks 0–5 and 7.

**Tasks 0–10 are done, with named exceptions.** Task 11 is correctly not started — it is gated on the WebMCP entry being frozen, and freezing is a human action. Every exception is listed in [What is not done](#what-is-not-done), and none of them is hidden behind a green check anywhere in this repository.

---

## Verification

| Command | Result |
| --- | --- |
| `pnpm verify` | **PASSED, all ten stages** (final run `2026-09-02T16-09-49-922Z-4b9d867c`) |
| `pnpm test:persona` | **PASSED** — three personas, all twelve hard gates, all eight diagnostic dimensions, contrast check green |
| `pnpm test:deployed` | **PASSED** — 11 passed, 1 skipped, 0 failed, against the live public URL |
| `npx vitest run` | **3956 tests / 194 files** (session baseline: 3515 / 176) |
| `pnpm verify:release` | See [Release gate](#release-gate) |

### `pnpm verify` stages

| Stage | Result |
| --- | --- |
| `format:check` | PASS |
| `lint` (eslint + `check:source`) | PASS |
| `typecheck` | PASS |
| `test:unit` | PASS |
| `test:coverage` | PASS — against the unchanged 95/90/95/95 gate |
| `test:pack` | PASS |
| `test:integration` | PASS |
| `test:contract` | PASS |
| `test:scenario` | PASS |
| `test:e2e` | PASS — 96 Playwright tests at 390/430/480/1440 |

### `pnpm test:deployed`

Against `https://pax-hackathon-production.up.railway.app`:

health · static assets · SPA-no-catchall · fixture case (4 seeded candidates) · investigation run · Runtime Inspector (245 events, correlated trace) · CORS · AgentCore `/ping` · AgentCore `/invocations` for both hero packs · **redeploy persistence** (a case and its 245 runtime events survived a real Railway redeploy).

One skip: `webmcp-client-registration`, which needs a real WebMCP-enabled browser and is not counted as a pass anywhere. **That gap is now closed by a separate gate**, `pnpm test:host` (ADR 0013): Chrome 152 ships WebMCP natively and exposes a `WebMCP` CDP domain, so the host session is automated — 14/14 against this same deployment. See `docs/submissions/webmcp/host-acceptance.md` for what it proves and the two things it does not.

### Live verification of the RunPlan beat

Run against the deployed public URL after the final redeploy, using only public endpoints:

```
version: 2
reason: triage_changed   trigger: candidate-rav4
kept: 4   added: 4   deep items: 4
history: [1, 2]   stop: work_available
plan events: ['plan.created', 'plan.revised']
summary: Plan v2: your triage of 2022 Toyota RAV4 XLE Hybrid AWD added 4 new
         items, kept 4 unchanged, re-ran 0 whose inputs changed, and cancelled 0.
```

---

## What was built this session, by task

Tasks 0–5 and 7 are detailed in the superseded report. What follows is what came after it.

### Task 6 — the continuous RunPlan

`apps/agent/src/runtime/run-plan.ts`, its store, service, route, migration, and the two commands that revise it.

A `RunPlan` is derived, never authored: `buildRunPlan` is a pure function of (case state, pack, budgets), so a plan can be recomputed from a reloaded snapshot rather than restored from a fragile queue.

**Three rules made unrepresentable rather than checked:**

1. A `deep` item must carry a `triageBasis`, and `TriageBasis.disposition` is `'keep' | 'unsure'`. `pass` and `unreviewed` are real dispositions and neither is an authorization, so "deep work authorized by a candidate nobody reviewed" cannot be written down.
2. `RunPlanItem.writes` is `'evidence' | 'enrichment' | 'none'`. Discovery answers, dispositions, the shortlist and the decision are not members of that union.
3. A concern with no matching pack capability goes to `plan.unverifiable` with a reason, never to `items` as a task that will quietly never produce anything.

Both refusals were **mutation-tested**: neutering the deep-work refinement and widening `TRIAGE_AUTHORIZATIONS` each failed two tests.

Reuse is decided by `inputsHash` — a hash of exactly the state a result depended on. Enrichment depends on the candidate; a concern check depends on the concern plus the confirmed answers the pack maps to that criterion. That asymmetry is what makes the demo beat true rather than staged: adding a concern reuses every earlier result, while changing an answer re-runs only the checks that answer feeds.

`RUN_PLAN_ITEM_STATUSES` has no `stale` member — staleness is a transition recorded in `revision.staledSignatures`, not a resting state, so `items` never holds two entries claiming the same work.

`run_plans` keeps one row per version. Re-saving a version throws. The store's only mutation, `updateItemStatuses`, can reach nothing but an item's `status`/`updatedAt`.

### Task 8 — the persona UX harness

`pnpm test:persona`. Three personas against the real stack in process: the real compiled Vehicle Selection pack, the real `CommandService`, the real `RunPlanService`, real SQLite, and the same `@sift/core` derivations the pane renders from.

**The executor answers whatever Sift asks.** A turn says what the person would say ("Under about thirty-five thousand"), not which topic id to write. A hard-coded input per turn would still pass if the pack started asking a completely different set of questions.

**Two rules made structural:** a `DiagnosticScore` with no cited turn evidence cannot be constructed; and `HardGateOutcome` has a third value, `not_evaluated`, so a gate whose evidence this harness cannot see never reports a pass.

### Task 9 — the adaptive vehicle journey

`tests/e2e/adaptive-vehicle-journey.spec.ts`, ten tests across all four viewports. Orientation contract, the state/UI contradiction gate checked against real pixels, Quick Pick surviving a reload, no control that approves a decision, sticky-dock geometry, no horizontal overflow, axe, keyboard, and the same journey rendering identically from two independent browser contexts.

### Task 9 continued — the diagnostic pass

Run by Claude Opus 5 reading every turn artifact; provenance and its limitation recorded in `packages/scenarios/fixtures/personas/diagnostics.ts`. It is one model's judgment of a text record, not a user study.

It **failed** the family persona on the first pass — `conversation_canvas_coherence` median 3 — and the finding was real: the RunPlan had an HTTP route, two activity events, and no surface a person could point at. Fixed by adding the plan to the orientation shell. Re-scored 4. All three personas now pass all eight dimensions.

### Task 10 — submission evidence

- `docs/submissions/webmcp/claim-evidence-matrix.md` — every claim mapped to implementation, automated proof, visible proof, provenance, and limitation, plus an explicit **"claims we deliberately do not make"** section and a table of human-only attestations.
- `docs/submissions/webmcp/host-acceptance.md` — the real-host session, now automated as `pnpm test:host` and passing 14/14 against the live deployment (ADR 0013). Records what it proves, the two things it does not (it is Chrome and not ChatGPT; no model chose anything), and the narrowed manual session that remains.
- `README.md` — `pnpm test:persona` documented, including what it refuses to claim.
- `docs/submissions/shared-release-checklist.md` — wired to both new documents.
- Deployed to Railway and verified live.

---

## Defects found and fixed after the mid-session report

Eight, each found by a different technique. **None was found by a unit test**, and every unit test passed throughout.

### 1. The companion frame rendered for nobody — found by a browser

The orientation shell, dock, and builder were written, unit-tested (16 tests), and wired into `App.tsx`. They never appeared. The render gate is `snapshot.discovery !== undefined`; `case.created` seeds `discovery` only when its payload carries a `mode`; neither `startDemo` nor `startCase` recorded one.

Every unit test passed, because unit tests render the shell directly and the gate lives a level above them. Nine of the ten new E2E tests failed on their first run, which is exactly what that spec exists for.

Fixed at the cause: both case-creation paths record `mode: 'companion'`.

### 2. The decision title appeared twice — found by looking at a screenshot

With the frame visible, `WorkspaceAppBar` named the case and the shell immediately beneath repeated it. `packNameFor` already suppressed a redundant pack chip; nothing suppressed the redundant title, because the shell's own tests render it alone.

`DecisionOrientationShell` gained `showDecisionTitle` (default `true`, so the shell stays self-sufficient where nothing else names the decision); the workspace passes `false`.

### 3. A phase that jumped past discovery — found by the persona harness

`deriveDecisionPhase` moved past discovery whenever a candidate existed. Someone who opens with "I am looking at a RAV4 Hybrid" would have seen "Narrowing down what you found" directly above "1 of 5 covered" — the same contradiction the frame was repaired for in the previous session, reached by a completely different route.

The fix distinguishes two cases that look alike: a case with *no discovery state at all* makes no coverage claim, so `triage` contradicts nothing; a case where discovery has *started but is incomplete* is still in discovery, because Sift's honest next move is still to ask.

### 4. The plan summary claimed finished work and leaked an id — found on the live deployment

```
"Plan v2: your triage of candidate-rav4 added 4 new items,
 reused 4 finished results, ..."
```

Nothing had finished — all four carried-over items were still `planned` — and `candidate-rav4` is a raw internal id in consumer-visible copy, which every activity label is already forbidden from doing.

`RunPlanRevisionCause` gained an optional `triggerLabel`, separate from `trigger` because correlation needs a stable id and a person needs a name. With no label the sentence omits the trigger rather than falling back to the id. "reused N finished results" became "kept N unchanged".

### 5. The persona harness reported PASS on a journey that never worked — found by reading its own artifacts

The first green run hid a family journey whose last seven turns were byte-identical: same phase, same coverage, empty diffs, no plan ever created. Discovery never finished, no candidate was triaged, the concern beat never fired. All eleven gates passed, because none of them asks whether the journey *moved*.

Added the twelfth gate (`stalled_turn`) and fixed the five causes: an incomplete state diff, a harness stack under-wired versus `server.ts`, an executor that swallowed impossible turns, a persona that hard-coded one turn per question, and a diff that could not see plan changes.

### 6. A new concern did not revise the plan — found by the repaired harness

Only `setCandidateDisposition` and `updateDiscovery` notified the plan. The headline beat was not wired. `updateCriteria` now notifies, because adding a criterion is what synthesizes the case-extension obligation the plan turns into work.

Also: a concern nothing can verify minted no version at all, so the dog-crate concern left the plan at v1 with nothing to show. A new explicit unknown is one of the more important things this product says.

### 7. The contrast beat was broken — found by the same harness, missed by its own unit test

The landscaping journey was receiving the **family** question set. The executor wrote the persona's prose into `valueSummary` where the topic offers a choice, so `business` never matched the conditional branch. The persona-set unit test passed throughout, because it compared scripted utterances rather than the questions Sift asked. A cross-persona contrast check now fails if the journeys converge.

### 8. Adaptive discovery had no input path at all — found by wiring an E2E test for it

`DiscoveryInteraction` built and tested, both commands implemented and routed, and the dock rendered the next question as a button that only switched views. A person could not answer a question in the pane.

The first fix emitted `helpText` where `InteractionOptionSchema` uses `detail`; the strict schema rejected it, the client threw before any HTTP call, and a bare `.catch(() => undefined)` swallowed it — a button that did nothing, with no console error, no failed request, and no page exception. Both halves fixed.

### Two of my own gates were wrong, and I fixed the gates

The persona harness's first run failed all three personas. One failure was defect 3 above. The other two were mine:

- `unsupported_claim` fired on "What", "Budget", "Where" because my executor was putting the next-move *label* into `chat.reply`, so the gate was checking Sift's own button text for invented option names.
- `incomplete_companion_discovery` failed the known-listing shopper. Someone who arrives with one vehicle in mind has a candidate after one turn and has answered almost nothing — a legitimate state that *the person* created. Left as written, that gate would have pushed the product toward refusing to accept an option until an interrogation finished.

---

## What is not done

### Task 10, remaining items — all human-only

| Item | Why it is not done |
| --- | --- |
| ~~Real-host acceptance session~~ — **done, automated** | `pnpm test:host` drives Chrome 152's native WebMCP over CDP; 14/14 against the live deployment (ADR 0013). What remains needs a person only for the two things a browser cannot stand in for: a session in a **named product**, and a **model** using the catalog unaided. |
| Demo video: record, edit, upload, re-check | Explicitly reserved from this session. |
| Devpost submission | Explicitly reserved. |
| Repository visibility and license-at-top verification | Explicitly reserved. |
| Eligibility attestations | Human-only by nature. |
| Freezing the build | A freeze is a decision, not an action a build can take. |

### Task 11 — AWS hero choice

Correctly not started. It is gated on the WebMCP entry being frozen.

### Still open

- `CaseExtensionReviewCard.tsx` is reachable only through the add-concern disclosure, not from a dedicated review path. Documented in `App.tsx`; not a claim made anywhere.
- The dock offers "Continue Quick Pick" from turn 0, at 0 of 5 coverage, before there is anything to triage against. Scored 3 by the diagnostic pass — above the per-turn floor, recorded rather than rounded away.
- `test:observability` and `test:live` remain declared stubs and are cited as evidence nowhere.

---

## Known limitations

**The `apps/agent` and E2E suites are load-sensitive on this machine.** Both were diagnosed in earlier sessions and the diagnosis holds: ephemeral-port contention on a machine with ~45 listening services. The agent project runs its files serially as a result. The E2E suite under four parallel workers reports a rotating handful of failures — `ECONNRESET`, 30s timeouts, and one optimistic-concurrency conflict — and **every one passes in isolation, with a different failing set each run**. A serial run reached 85 of 92 with zero failures before being interrupted; the desktop project passed serially end to end. `pnpm verify` passed `test:e2e` in full.

This is machine contention, not a product regression, and it is recorded rather than hidden. `artifacts/verification/latest/BLOCKED.md` carries the full evidence trail.

**The persona harness cannot see a browser.** Three of its eleven gates report `not_evaluated` on every run. That is by design and stated on every run.

---

## Release gate

`pnpm verify:release` (run `release-2026-09-02T14-25-32-799Z-32a52ca3`):

| Stage | Result |
| --- | --- |
| `verify` | PASS |
| `test:mutation` | PASS |
| `release:build` | PASS |
| `release:docker` | PASS |
| `test:submission` | FAIL — 8 passed, 2 skipped, 2 failed |

The two `test:submission` failures:

- **`release-metadata-public-urls`** — `webmcpVideoUrl` and `agentsForHumansVideoUrl` are unset in `docs/submissions/release-metadata.json`. **This is a truthful red and must stay red**: no demo has been recorded, and filling those fields with anything would be a fabricated submission artifact. It clears when the human records and publishes the videos.
- **`release-verification-sha`** — the `pnpm verify` report was generated one commit before HEAD, because the final documentation commit landed while the release gate was running. **Cleared**: `pnpm verify` was re-run (run `2026-09-02T14-42-40-728Z-fd358d72`, PASSED all ten stages) and `pnpm test:submission` now reports 9 passed, 2 skipped, 1 failed — the video URLs alone.

The two skips are the same video files, and they activate once a recording is present.

---

## Deployment

| Field | Value |
| --- | --- |
| Railway project | `pax-hackathon` |
| Project ID | `1c02545d-5ed3-4ac6-82dc-fad2e09e8999` |
| Service | `pax-hackathon` (`e98affa7-2756-4f5a-bbae-d3e84a06ced7`) |
| Environment | `production` (`9e0c95c9-2f33-431a-93c3-1a592a069d00`) |
| Public URL | `https://pax-hackathon-production.up.railway.app` |
| Volume | `/data`, backing `/data/sift.sqlite` |

Two deployments this session, both of the exact committed tree. Redeploy persistence verified: a case and its 245 correlated runtime events survived.

No AWS credentials are present, so Bedrock AgentCore deployment is an honest external blocker. The AgentCore-compatible `/ping` and `/invocations` routes are live and tested on Railway for both hero packs.

---

## What to review first

1. **Mutate each structural rule and confirm it bites.** `TriageBasis.disposition`, `RunPlanItem.writes`, the deep-work refinement, the model-origin `confirmed` refinement, and `DiagnosticScore.evidence`. Each should fail a named test. I verified the first two by actual mutation; the rest are asserted but not mutation-checked.
2. **Re-read `claim-evidence-matrix.md` section E** against the current submission copy. The useful half of that document is the half listing what we do not claim.
3. **Run `pnpm test:persona` and read the `not_evaluated` line**, not just the PASS.
4. **Check that `deriveDecisionPhase`'s two-branch rule is right.** A case with no discovery state reports `triage` with candidates present; a case with partial discovery reports `discovery`. Both are defensible and I chose them; a reviewer may disagree.
5. **Re-review `scripts/check-source.ts`'s PascalCase narrowing.** It is a security guard and was weakened-by-narrowing in an earlier session, pinned by four tests.
6. **Confirm the 40 changed screenshot baselines** correspond only to the frame becoming visible and the title de-duplication.
7. **Reproduce the E2E flake characterization.** Run the suite serially; if it fails serially, my diagnosis is wrong.

---

## Commit list

From baseline `da3ad9f`:

| SHA | Subject |
| --- | --- |
| `1baa124` | plan package |
| `3e28723` | contracts |
| `711524b` | core |
| `e9c3fd8` | vehicle pack + catalog |
| `3d1990f` | webmcp |
| `c3f343f` | quick pick |
| `01ad573` | frame components + flake |
| `8f88e03` | specs |
| `f6ef672` | port contention |
| `22fa71a` | style |
| `768535e` | sequence fix + baselines |
| `e95467c` | completion report |
| `b7a150f` | frame wiring |
| `375d77d` | report update |
| `e7efba2` | feat(runtime): execute evolving vehicle run plans |
| `a4ab462` | test(ux): add adaptive decision persona harness |
| `a256838` | test(e2e): prove the adaptive vehicle journey |
| `1b20ce8` | style(e2e): synchronous locator helper |
| `6d11efc` | docs(submission): claim-evidence matrix and host acceptance |
| `d13d82c` | fix(runtime): plan summary wording and id leak |
