# Completion report — Generic Decision Workspace (2026-08-30)

Covers the work driven by `docs/change-sets/2026-08-30-generic-decision-workspace.md` and planned in
`docs/superpowers/plans/2026-08-30-generic-decision-workspace.md`. The earlier build's report is
`docs/completion-report.md` and remains accurate for the work it describes; this is the follow-on.

**Final verified git SHA:** `0b82c6b6cdfa7da1c6a0255b7607c6021af2bc7f` — the tree the passing
`pnpm verify` run below attests to. This report is committed immediately after it.
**Commits in this effort:** 15

---

## 1. Why this work existed

The project owner reported the shipped workspace as **"virtually unusable"** and supplied a change
set redefining the product: from an agent-runtime dashboard that happened to be about cars, into a
generic decision workspace where ChatGPT is a first-class collaborator.

The pre-implementation audit (`docs/audits/2026-08-30-...`) found the engine sound and the
presentation broken. Its headline finding was a process failure, not a coding one: `product.md`
specified **nine** UI regions, **eleven** shipped, and two of those appeared in no spec and no ADR.
CLAUDE.md's rule — *specs are updated before acceptance behavior changes* — had been violated, and
that is what let the interface drift until the answer sat ~950px down a 2040px page.

---

## 2. Implemented capabilities

**Information architecture.** The workspace opens with the answer: title and live status, then a
single hero merging the recommendation with its one next action, then a Quick Pick / List / Compare /
Board switcher. Case identity is compressed; pack id, version, compiled hash, `commandId`, and
`runId` left the consumer surface. Developer content lives behind an explicit "Developer view"
control that extends the existing Runtime Inspector rather than duplicating it.

**Four option views**, each with a distinct job, plus a shared `WorkspaceViewState` contract that
persists through `updateSelection()` — the non-event path that structurally cannot advance
`eventSequence` or invalidate a recommendation.

**Decision Profile**, projected purely from existing criteria, attribute definitions, and confirmed
extensions. No competing source of truth. `suggestedQuestions` draws only from a pack's declared
Decision Guide and three real case signals — never generated.

**WebMCP: 12 → 22 tools** across four authority classes, including durable view control, scoped
attribute writes with full provenance, catalog search, the pack Decision Guide, notes, and question
focus.

**Case notes**, event-sourced end to end, with a human form and two WebMCP tools.

**Custom fields**, now working end to end: agent-proposed origin reaches human confirmation, a
custom concern creates a real obligation, values carry provenance, dependent invalidation fires, and
confirmed extensions render as first-class comparison rows.

**Observability.** WebMCP-issued commands are distinguishable in the trail. `stateDiff` is genuinely
produced from a real before/after `CaseState`; `redactions` are surfaced with path and reason, never
the withheld value.

---

## 3. Verification

Commands and their actual results.

| Command | Result |
| --- | --- |
| `pnpm verify` | **PASSED**, 10/10 stages (run `2026-08-30T20-33-17-368Z-9da584db`) |
| `pnpm verify:release` | **FAILED on one check** — see §5 |
| `pnpm run test:unit` | 2774 passing |
| `pnpm run test:scenario` | 4 passing |
| `pnpm exec playwright test` | 44 passing across 4 viewport projects |
| `pnpm run test:deployed` | 11 passed, 1 skipped, 0 failed |
| `pnpm run test:submission` | 9 passed, 2 skipped, **1 failed** |

`verify` stages, all green: `format:check`, `lint`, `typecheck`, `test:unit`, `test:coverage`,
`test:pack`, `test:integration`, `test:contract`, `test:scenario`, `test:e2e`.

**Coverage:** lines 97.77%, statements 97.41%, functions 97.57%, branches 94.58%.
**Mutation:** score **92.31**, against a break threshold of 80.
**Scenario assertions:** car-purchase 39, home-energy-guardian 33 — both reports passing.

**Playwright:** 4 projects (`right-pane-390`, `right-pane-430`, `right-pane-480`, `desktop-1440`),
7 spec files, **52 named visual baselines**. All 52 were regenerated and **visually inspected**, not
blind-accepted — that inspection found three defects described in §4.

---

## 4. Defects found by looking, not by testing

Recorded because they share one shape, and that shape is the most useful thing this effort learned:
**a seam where both halves are individually correct and nothing connects them.** No unit test on
either side can catch these.

1. **`DecisionProfileView` was built, had ~43 passing tests, and was mounted nowhere** — not in
   `App.tsx`, not even exported from the barrel. DoD items 15 and 16 failed outright.
2. **Model-controlled presentation was silently broken.** `sift_configure_comparison` persisted
   correctly and `OptionCompareView` implemented the props, but `WorkspaceViewSwitcher` passed none
   of them. Change-set §58 names this exact interaction as a hero demo beat; it would have failed on
   stage.
3. **View state had two sources of truth.** `App.tsx` held `viewMode` in `useState` while `setView`
   persisted durably, so ChatGPT could set a view, the backend store it, the tool report success —
   and the page not move.
4. **The raw-id leak had three surfaces.** `rationale` and `limitations` were fixed first; the
   citation list still rendered `source.title`, and the fixture set `title = sourceId`, so users read
   `source-national-crash-safety-consortium` as a link.
5. **A card contradicted itself.** Quick Pick displayed "Model year: 2022" confidently and, inches
   below, "Model year still needs stronger evidence" — plus warnings that a Toyota's *make* needed
   evidence.
6. **"Current recommendation" rendered twice** in stacked headings, with empty FACTS/HYPOTHESES
   blocks as tinted callouts — the pink one reading as a warning when nothing was wrong.

An independent audit against §67's 48-item Definition of Done found a seventh, and it was mine:
**F5 was marked complete without being verified.** No rule anywhere constrained an attribute's
`status` by its `origin`, so a model could certify its own inference as `verified`. That made the
product's central claim — the deterministic core owns evidence validity — false. It is now enforced
at `createAttributeRecord`, the one chokepoint every write path passes through.

### Two intermittent failures seen during final verification

Recorded because a later green run does not un-observe a failure.

1. **`recommendation-ready.png`, Home Energy Guardian, `right-pane-390`** — expected 390x5726,
   received 390x5901. A **175px height** difference, i.e. content reflow, not antialiasing. The spec
   had explicitly claimed it needed no volatile-region handling because its Swarm hands off
   sequentially, "confirmed empirically by multiple clean, zero-diff repeated runs". That claim was
   wrong: sequential handoff makes the specialist *order* deterministic, not `LiveRunStatus`'s
   breadcrumb *line count*, and a `mask` paints over a box without changing its size, so masking can
   never absorb a height delta. **Fixed at the cause** — all four post-run captures now use
   `withVolatileRegionsHidden`, matching the car journey — not by raising the tolerance, which would
   have hidden it and blunted the gate for every other diff. Verified 5/5 consecutive clean runs.

2. **`GET /api/catalog/models without make responds 400` returned 200** — once, under full-suite
   parallelism. **Not reproduced** in 3 standalone runs of that file (12/12 each) or 2 subsequent
   full `test:unit` runs (2774/2774 each). Root cause **not established**, and it is recorded as
   unresolved rather than dismissed. What is known: the handler returns `400` unconditionally when
   `make` is absent, with no cache or shared state that could produce a `200`, so the request
   appears not to have reached that handler at all. `express.static` is mounted *after* the routers,
   so ordering does not obviously explain it. If it recurs, the harness/teardown interaction under
   parallel load is the place to look first.

A third, `agentcore.test.ts` returning 403 instead of 409, was carried into this session as a known
flake with a stated root cause. That root cause was **false** — `selectPack` contains no
`policyFailure` call and cannot produce a 403 — and the real defect was a weak assertion that
checked only the status code while its name promised a full conflict envelope. Now asserts the whole
envelope; 22/22 consecutive runs.

### A methodology trap worth recording

A fix appeared not to work. The cause was Playwright's `reuseExistingServer` reusing a long-running
server started before the change: the web bundle picked up edits, the **agent** code did not. Every
baseline regenerated in that window had baked stale behavior in permanently. `--update-snapshots`
against a stale server is worse than no baseline at all.

---

## 5. Deployment

| Field | Value |
| --- | --- |
| Railway project | `pax-hackathon` |
| Project ID | `1c02545d-5ed3-4ac6-82dc-fad2e09e8999` |
| Service | `pax-hackathon` (`e98affa7-2756-4f5a-bbae-d3e84a06ced7`) |
| Environment | `production` (`9e0c95c9-2f33-431a-93c3-1a592a069d00`) |
| Deployment | `50517e5b-1f11-4431-8b52-a13bbc18d7b3`, instance `RUNNING` |
| Public URL | https://pax-hackathon-production.up.railway.app |
| Volume mount | `/data` |

The `pax-` prefix is deliberate and must not be "corrected": these are live identifiers already
published in `docs/submissions/release-metadata.json` and quoted in the demo scripts. The GitHub
remote is genuinely `jordanallen87/pax`.

### The rename broke the deployment, and only a real deploy could show it

The first redeploy **crashed on boot**:

```
Error: EACCES: permission denied, mkdir '.sift-data'
    at openDatabase (apps/agent/src/db/connection.ts:112)
```

Railway carried `PAX_DATA_DIR=/data`; the renamed code reads `SIFT_DATA_DIR`. The container fell
back to the default `.sift-data`, which a non-root user cannot create. Fixed by setting
`SIFT_DATA_DIR=/data` on the service.

Two things are worth being precise about. First, the previously-deployed instance kept serving
perfectly throughout — because it was running **pre-rename code**. A green `test:deployed` against
it proved nothing about this build, and would have been easy to report as success. Second, the
sibling trap *was* caught in advance: `openDatabase` adopts a legacy `pax.sqlite` by checkpointing
its WAL before renaming. **Verified on the live volume** — a case created before the rename still
returns `200` from the new build, so the adoption ran with no data loss. The env-var half was simply
missed, and no local gate could have caught it.

---

## 6. Known limitations and honest gaps

- **`verify:release` fails one check**, and correctly so: `release-metadata-public-urls` requires
  `webmcpVideoUrl` and `agentsForHumansVideoUrl`, which are **human-recorded deliverables**. No URL
  was fabricated to turn the gate green. Both demo videos and Devpost submission remain assigned to
  the submitter.
- **`webmcp-client-registration` is skipped** in `test:deployed`: it needs a real WebMCP-enabled
  browser this script cannot drive. Per `testing.md`, one manual host smoke test should be recorded
  with timestamp, deployed URL, tool names discovered, and outcome.
- **The Developer view control is not gated** by `SIFT_DEBUG_ENABLED`; only server-side debug routes
  are. Documented in `debugging-and-observability.md` rather than silently fixed.
- **A failed `setView` is swallowed** (`.catch(() => undefined)`), so a failed persist leaves the
  optimistic view showing with no signal. Deliberate for presentation state, and deliberately *not*
  copied to the note form, where losing user content matters.
- **`scripted-beats/home-energy-guardian.ts` decision text still contains raw ids.**
  `home-energy-engine.ts` parses its exact parenthetical format with a regex, so changing the text
  breaks the parser. Recorded rather than forced.
- **The Runtime Inspector has no dedicated filter** for the WebMCP origin marker; the data is
  recorded and generically rendered.
- **§61 journey departures**, documented in the spec header: step 1 uses the demo launcher because a
  non-demo case cannot run an investigation, and round-1 investigation runs before steps 2–4 to
  avoid feeding the scripted fixture an unscripted fifth candidate.

---

## 7. Demo recording steps

Unchanged from `docs/completion-report.md` §"Demo recording steps", with two corrections:

1. The workspace now opens on **Quick Pick**, not Compare. Select the Compare tab before the
   comparison beat.
2. The Runtime Inspector is reachable at any time via **"Developer view"** in the case header — no
   longer only when a live run receipt exists. Its Activity tab carries the "Inspect event" control
   that opens a consumer event's exact runtime event.

Both demo scripts in `docs/demo/` were updated accordingly and carry their own re-verify disclaimers.
