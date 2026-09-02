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
| `pnpm verify` | **PASSED, all ten stages** (run `2026-09-02T14-08-29-736Z-e9330749`) |
| `pnpm test:persona` | **PASSED** — three personas, all hard gates |
| `pnpm test:deployed` | **PASSED** — 11 passed, 1 skipped, 0 failed, against the live public URL |
| `npx vitest run` | **3930 tests / 192 files** (session baseline: 3515 / 176) |
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
| `test:e2e` | PASS — 92 Playwright tests at 390/430/480/1440 |

### `pnpm test:deployed`

Against `https://pax-hackathon-production.up.railway.app`:

health · static assets · SPA-no-catchall · fixture case (4 seeded candidates) · investigation run · Runtime Inspector (245 events, correlated trace) · CORS · AgentCore `/ping` · AgentCore `/invocations` for both hero packs · **redeploy persistence** (a case and its 245 runtime events survived a real Railway redeploy).

One skip: `webmcp-client-registration`, which needs a real WebMCP-enabled browser. That is the same gap `docs/submissions/webmcp/host-acceptance.md` records, and it is not counted as a pass anywhere.

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

### Task 10 — submission evidence

- `docs/submissions/webmcp/claim-evidence-matrix.md` — every claim mapped to implementation, automated proof, visible proof, provenance, and limitation, plus an explicit **"claims we deliberately do not make"** section and a table of human-only attestations.
- `docs/submissions/webmcp/host-acceptance.md` — states plainly that no real-host session has been run, records what was verified without one, and scripts the session with its failure modes named in advance.
- `README.md` — `pnpm test:persona` documented, including what it refuses to claim.
- `docs/submissions/shared-release-checklist.md` — wired to both new documents.
- Deployed to Railway and verified live.

---

## Defects found and fixed after the mid-session report

Four, each found by a different technique. None was found by a unit test.

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

### Two of my own gates were wrong, and I fixed the gates

The persona harness's first run failed all three personas. One failure was defect 3 above. The other two were mine:

- `unsupported_claim` fired on "What", "Budget", "Where" because my executor was putting the next-move *label* into `chat.reply`, so the gate was checking Sift's own button text for invented option names.
- `incomplete_companion_discovery` failed the known-listing shopper. Someone who arrives with one vehicle in mind has a candidate after one turn and has answered almost nothing — a legitimate state that *the person* created. Left as written, that gate would have pushed the product toward refusing to accept an option until an interrogation finished.

---

## What is not done

### Task 10, remaining items — all human-only

| Item | Why it is not done |
| --- | --- |
| Real-host acceptance session | Needs a person with a WebMCP-capable host signed into their own account. Scripted in `host-acceptance.md`. |
| Demo video: record, edit, upload, re-check | Explicitly reserved from this session. |
| Devpost submission | Explicitly reserved. |
| Repository visibility and license-at-top verification | Explicitly reserved. |
| Eligibility attestations | Human-only by nature. |
| Freezing the build | A freeze is a decision, not an action a build can take. |

### Task 11 — AWS hero choice

Correctly not started. It is gated on the WebMCP entry being frozen.

### Diagnostic scores

`pnpm test:persona` reports `scored: false` for all three personas. A diagnostic pass has not been run, and the harness refuses to default a number. The canonical plan's "median ≥ 4, no orientation or next-action turn below 3" thresholds are **implemented and enforced** (`summarizeDiagnostics`) but have nothing to enforce against yet.

### Still open from the earlier report

- `CaseScoreboard.warnings` renders nowhere.
- `CaseExtensionReviewCard.tsx` is unreachable from the command path.
- `DiscoveryInteraction` has no host — nothing in the running product creates an `InteractionRequest`. The component is built and tested.
- `test:observability` and `test:live` remain declared stubs and are cited as evidence nowhere.

---

## Known limitations

**The `apps/agent` and E2E suites are load-sensitive on this machine.** Both were diagnosed in earlier sessions and the diagnosis holds: ephemeral-port contention on a machine with ~45 listening services. The agent project runs its files serially as a result. The E2E suite under four parallel workers reports a rotating handful of failures — `ECONNRESET`, 30s timeouts, and one optimistic-concurrency conflict — and **every one passes in isolation, with a different failing set each run**. A serial run reached 85 of 92 with zero failures before being interrupted; the desktop project passed serially end to end. `pnpm verify` passed `test:e2e` in full.

This is machine contention, not a product regression, and it is recorded rather than hidden. `artifacts/verification/latest/BLOCKED.md` carries the full evidence trail.

**The persona harness cannot see a browser.** Three of its eleven gates report `not_evaluated` on every run. That is by design and stated on every run.

---

## Release gate

`pnpm verify:release` adds mutation testing, a production build check, a Docker build contract check, and `pnpm test:submission` on top of `pnpm verify`. `pnpm test:submission` will not report the video URL fields as complete, because they are genuinely empty — no demo has been recorded. That is a truthful red, not a failure to fix in code.

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
