# Completion report — adaptive decision experience

Session date: 2026-09-02.
Plan executed: `docs/final-plan/final-hackathon-execution-plan.md`.
Baseline: `main` @ `da3ad9f`. Final SHA at time of writing: `b7a150f`.

This report covers Tasks 0–5 and Task 7 of the canonical plan. **Tasks 6 and
8–11 were not reached.** What that means concretely is in
[What is not done](#what-is-not-done), and what Codex should verify first is
in [What Codex must independently review and retest](#what-codex-must-independently-review-and-retest).

## Verification

`pnpm verify`: **PASSED, all ten stages** (run
`2026-09-02T08-06-39-095Z-7e4e500a`).

| Stage | Result |
| --- | --- |
| `format:check` | PASS |
| `lint` (eslint + `check:source`) | PASS |
| `typecheck` | PASS |
| `test:unit` | PASS — **3808 tests / 184 files** (baseline: 3515 / 176) |
| `test:coverage` | PASS — 96.85 / 93.07 / 97.19 / 97.48 against the unchanged 95/90/95/95 gate |
| `test:pack` | PASS |
| `test:integration` | PASS — 427 tests |
| `test:contract` | PASS |
| `test:scenario` | PASS |
| `test:e2e` | PASS — 52 Playwright tests at 390/430/480/1440 |

Not run, and not claimed: `pnpm verify:release`, `test:deployed`,
`test:submission`. Nothing was deployed this session.

`test:live` and `test:observability` remain staged scripts and are not cited
as evidence, per the plan.

## Implemented capabilities, by canonical task

### Task 0 — integration checkpoint

Baseline recorded in `docs/build-log.md`: `main` @ `da3ad9f`, typecheck
clean, 3515 unit tests passing, **no pre-existing failures**, single writer,
discovery engine logged as non-blocking external input (no path was
supplied). The approved planning package was committed as a docs-only
checkpoint before any product edit.

### Task 1 — truthful discovery and interaction contracts

`packages/contracts/src/discovery.ts` (new). Four rules from the approved
experience are now **unrepresentable rather than documented**:

1. A model-origin topic cannot be `confirmed` without `humanConfirmed`, and
   nothing reaches `must_work` — the tier that removes options from
   consideration — without a human behind it.
2. A `required` topic template may not declare a defer escape hatch; a
   companion-mode brief may not carry a deferred required topic.
3. `CandidateProvenance` refuses `level: 'listing'` without listing
   provenance, **and** refuses listing provenance on a model-level candidate.
4. A human-only `NextMove` has nowhere to put a `toolName`.

Also: per-attribute `provenance` so a `curated_demo` value can say so beside
a catalog-measured one; five reducer folds; an optional `mode` on
`case.created`. Every new field is optional, so existing snapshots parse and
existing packs keep their `compiledHash`.

`scripts/check-source.ts` gained one **narrowing** (not a weakening): a long
PascalCase identifier is a declaration, not a secret. Pinned by four tests
proving digit-bearing, all-uppercase, mixed-case, and repeated-character
secret shapes all still trip the scanner.

### Task 2 — deterministic derivation in core

`packages/core/src/discovery.ts` (new): `compileDiscoveryTopics`,
`deriveDiscoveryReadiness`, `deriveNextMoves`, `planDiscoveryResponse`.

None read a clock, a random source, or a model. Identical state always
produces identical readiness, moves, and required view — which is what makes
reload *recompute* a person's place rather than approximate it.

Three rules a schema cannot enforce live here, because they depend on current
state: a mapping onto an undeclared topic, one that does not apply to this
case, and one a person already confirmed. Each rejection is reported with a
reason.

Two ordering decisions, both found by tests: a pending inference outranks
every new question, and the blind-spot review outranks a remaining optional
question.

### Task 3 — Vehicle Selection and the honest demo cohort

One pack now produces two materially different journeys. A family is never
asked about payload, worksite access, equipment loading, or downtime risk; a
landscaping business is never asked about car seats or the school run. Proven
by diffing both branches' topic sets **in both directions**.

Every question is functional — a test pins that no topic asks "do you have
kids?" or anything of that shape.

The pack id stays `car-purchase` (every stored case pins it); the name
becomes "Vehicle Selection" and `pref.household_fit` keeps its id with the
label "Practical fit".

Eight `curated_demo` profiles in `packages/catalog/data/vehicle-demo-profiles.json`
supply what EPA data does not carry. **There is no field anywhere for a price,
a dealer, or an availability.** All 853 records remain the discovery universe,
pinned by a test. Search gained drivetrain, year bounds, MPG floor,
running-cost ceiling, electric range, and multi-value body style/fuel type —
and an unknown never satisfies a constraint.

### Task 4 — WebMCP lifecycle and bounded GenUI

Catalog 23 → 26 tools, each with exact description and JSON schema pinned by
the contract test.

- `sift_get_interaction_context` — the progressive-disclosure boundary.
- `sift_request_interaction` — no markup field, no preselect field.
- `sift_record_discovery` — **no `actor` field and no `op` field**, so a model
  cannot ask to confirm; Sift supplies `agent`/`propose` on every call.

Five commands behind them, each validating against the case's pinned pack.

**The absence is tested:** no tool for Quick Pick, the blind-spot review, or
confirming a shortlist. A test walks the whole registered catalog to keep
that true as it grows.

### Task 5 — Quick Pick persistence

Keep / Pass / Unsure are canonical, persisted, and read from case state.
Before this, Pass and Maybe moved a local counter and "Shortlist" merely
focused — the judgment vanished on reload and the model could not read it
back, which made the bidirectional claim untrue at the beat the demo rests
on. Undo is a forward command carrying `previousDisposition`.

### Task 7 — companion frame

`DecisionOrientationShell`, `ContextActionDock`, and `DiscoveryInteraction`
are built, fully tested (axe-clean, 390/430/480 overflow checks), and the
shell and dock are **wired into the workspace**. `buildDecisionOrientation`
turns case state into the six answers the shell renders, and the dock is fed
by `deriveNextMoves` — the same list `sift_get_interaction_context` returns,
so the pane and the model cannot disagree about what to do next.

Rendering it exposed three contradictions every unit test had missed,
because each field was correct in isolation: "Narrowing down what you found"
above "0 of 5 covered"; the pack name on screen three times; and "In focus:
Budget" above "Next: Budget". All three are fixed at the root — see
`b7a150f`.

The shell and dock render **only for a case that has genuinely begun
adaptive discovery**. A seeded demo case arrives with candidates and no
discovery, and the shell has nothing true to add to one. That is why no
screenshot baseline changed for this task, and it is also why the frame has
no end-to-end coverage yet: it awaits Task 9's adaptive journey.

`DiscoveryInteraction` has no host in `App.tsx` yet, because nothing creates
an `InteractionRequest` in the running product — that is Task 4's tool
reaching a pane surface, which Task 9 would exercise.

## Defects found and fixed

Two were introduced by this session's own changes and caught by tests:

1. **View writes could 409 after a Quick Pick judgment.** Keep now advances
   `eventSequence`, so an ordinary two-click sequence — press Keep, press
   Compare — sent a stale `expectedSequence`, and the failure was swallowed
   by design, so the tab looked broken. Fixed at the cause:
   `CommandReceipt.acceptedSequence` is the server's authoritative sequence
   the moment a call resolves, and view writes now use it.
2. **An e2e step proved the wrong thing.** The §61 journey clicked
   "Shortlist" and asserted `selectedOptionId` — a presentation change
   reading as a decision. Retargeted to the persisted disposition, which is
   strictly stronger.

One was long-standing:

3. **The intermittent `apps/agent` failure**, carried across three sessions,
   is diagnosed. It was never a single test and never a product defect. Full
   evidence in `artifacts/verification/latest/BLOCKED.md`; summary in
   [Known limitations](#known-limitations).

## Screenshot inventory

41 baselines re-captured across four Playwright projects
(`right-pane-390`, `right-pane-430`, `right-pane-480`, `desktop-1440`) for
`car-purchase-journey`, `home-energy-guardian-journey`,
`generic-decision-workspace-journey`, `vehicle-catalog-journey`,
`error-recovery`, `keyboard-accessibility`, and `reload-persistence`.

Captured against a **verified-free port 8080** — a previous session
established that `reuseExistingServer: !CI` makes a green local visual run
meaningless when a stale server is bound. Before accepting, the diff image,
the actual render at 390px, and the same region in the energy pack were
inspected. Every pixel change traces to exactly two reviewed edits: the pack
rename, and Pass/Unsure/Keep plus the "nothing is decided here" note (+46px).

## What is not done

Stated plainly, because the plan's completion contract forbids reporting
completion for work that does not exist.

| Task | Status |
| --- | --- |
| **6 — continuous RunPlan** | **Not started.** The demo's "new concern revises already-running agent work" beat is not implemented. `apps/agent/src/runtime/run-plan.ts` does not exist. |
| **7 — frame integration** | **Shell and dock wired; `DiscoveryInteraction` has no host.** The frame renders only once discovery has started, so no existing journey exercises it end to end. |
| **8 — persona UX harness** | **Not started.** There is no `pnpm test:persona`, no persona fixtures, and no turn-artifact capture. |
| **9 — adaptive E2E journey** | **Not started.** `tests/e2e/adaptive-vehicle-journey.spec.ts` does not exist. The existing 52 e2e tests cover the *previous* journey and all pass. |
| **10 — submission freeze** | **Not started.** No host-acceptance record, no claim-evidence matrix, no deployment this session. |
| **11 — AWS hero choice** | Correctly not started; it is gated on the WebMCP freeze. |

Consequently, several definition-of-done items are **not met**: the family
hero does not complete twice from clean state through the *new* journey
(that journey has no end-to-end path yet), no persona hard gates exist, and
no real-host acceptance was attempted.

## Known limitations

- **Intermittent `apps/agent` HTTP failure, ~1 run in 12.** Cause identified:
  ephemeral-port contention on a machine with ~45 listening services. Proven
  environmental — a test received a `401` and another a `403`, statuses this
  application does not produce on those routes. Three repairs landed, each
  measured (~1-in-3 → ~1-in-8 → ~1-in-12): SSE client sockets are now
  destroyed, and the agent project runs its files serially. `pnpm verify` is
  fail-fast, so a residual hit skips later stages; **rerun the stage**. Every
  rerun to date has passed. Full trail in
  `artifacts/verification/latest/BLOCKED.md`.
- **Curated demo data is illustrative.** Cargo dimensions, ratings, ownership
  costs, and price bands in `vehicle-demo-profiles.json` are hand-authored,
  not measured or sourced. Every one carries `provenance: 'curated_demo'` and
  the file says so in its own `$comment`.
- **The discovery engine repository was never supplied**, so the
  repository-native contract was implemented, as the plan directs.
- `CaseScoreboard.warnings` still renders nowhere; neither pack emits one.
- `CaseExtensionReviewCard.tsx` remains unreachable from the command path.

## What Codex must independently review and retest

1. **The four structural rules actually bite.** Mutate each in
   `packages/contracts/src/discovery.ts` and confirm a test fails: a
   model-origin `confirmed` topic, a `must_work` without `humanConfirmed`, a
   `required` template with `allowDefer`, and a `humanOnly` `NextMove`
   carrying a `toolName`.
2. **The absent tools stay absent.** Add a `sift_confirm_shortlist` to the
   catalog and confirm `register-sift-tools-discovery.test.ts` fails.
3. **`check-source.ts` was narrowed, not weakened.** Review the PascalCase
   exception and its four "still flags" tests. This is a security guard; the
   change deserves a second opinion.
4. **The 41 screenshot baselines.** Confirm every diff traces to the pack
   rename or the Quick Pick action row, and that nothing else moved. Re-run
   `pnpm test:e2e` with **nothing bound to port 8080**.
5. **The `acceptedSequence` fix.** Verify that pressing Keep and immediately
   switching to Compare persists the view, and that no 409 reaches the
   console guard.
6. **Coverage of the new modules.** `packages/core/src/discovery.ts` and
   `packages/catalog/src/demo-profiles.ts` are new and load-bearing; confirm
   the 95/90/95/95 gate is met by real assertions rather than incidental
   execution.
7. **The flake.** Run `pnpm verify` several times. If a stage fails with a
   status this application cannot produce, it is the documented environmental
   residual, not a regression.

## Risk assessment and rollback

Risk is concentrated in three places:

- **`CaseState` gained a field.** Optional, and every existing snapshot
  parses — but any consumer constructing a `CaseState` literal now has a new
  optional member. Rollback: revert `3e28723`; nothing depends on `discovery`
  outside the modules added this session.
- **The pack's user-facing name and one criterion label changed.** Stored
  cases are unaffected (the id is pinned), but 41 baselines moved. Rollback:
  revert `e9c3fd8` and re-run `pnpm test:e2e -u`.
- **`fileParallelism: false` on the agent project** costs ~20s. Rollback is
  a one-line deletion, at the cost of returning to a ~1-in-8 flake.

Every commit is scoped to one task and independently revertible; the ten
commits from `1baa124` to `768535e` apply in order.

## Commit list

```
1baa124 docs: adopt the approved final plan as the execution control plane
3e28723 feat(contracts): model adaptive decision discovery
711524b feat(core): derive adaptive discovery and next moves
e9c3fd8 feat(vehicle): support adaptive model discovery
3d1990f feat(webmcp): add adaptive case lifecycle
c3f343f feat(vehicle): persist triage and living recommendations
01ad573 feat(web): create adaptive companion frame
8f88e03 docs: record the adaptive decision experience in the active specs
f6ef672 fix(test): stop agent HTTP tests contending for ephemeral ports
22fa71a style: apply prettier formatting
768535e fix(web): keep view writes on the server's real sequence
e95467c docs: completion report for the adaptive decision experience
b7a150f feat(web): wire the companion frame into the workspace
```
