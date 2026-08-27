# Pax Preimplementation Audit

Status: phase-zero adversarial review, performed before any product code exists.
Reviewer: Claude Code, reading as (1) a principal engineer checking whether another
team could implement this deterministically, and (2) a judge for both hackathons.
Date: 2026-08-27.

## Method

Read completely, in the order `CLAUDE.md` prescribes: `docs/specs/README.md`,
`value-proposition.md`, `product.md`, `architecture.md`, `packs-and-routing.md`,
`pack-authoring.md`, `webmcp.md`, `strands-runtime.md`, `testing.md`,
`debugging-and-observability.md`, `demos-and-submission.md`, ADR 0001, both
requirements checklists, both submission-details packets, `reuse-source-map.md`,
and the implementation plan.

Then, rather than trusting cited doc links, independently verified the three
highest-risk platform assumptions against primary sources:

- Downloaded and inspected the real `@strands-agents/sdk@1.14.0` package from the
  npm registry (`npm view`, `npm pack`, then read the shipped `.d.ts` files for
  `interventions/`, `vended-plugins/{skills,context-injector,goal}/`,
  `multiagent/{graph,swarm}.d.ts`, `session/session-manager.d.ts`,
  `storage/local-file-storage.d.ts`, `hooks/events.d.ts`, `telemetry/tracer.d.ts`).
- Ran `railway --version`, `railway whoami`, and `railway {up,volume,variable,domain}
  --help` against the authenticated CLI actually installed on this machine.
- Fetched the WebMCP explainer and cross-checked current implementation status via
  web search.

## Executive verdict

The specification set is unusually rigorous and, on independent verification, is
**not fabricated vaporware** — the named Strands TypeScript primitives
(`AgentSkills`, `Graph`, `Swarm`, ordered `Interventions` with
`Proceed`/`Deny`/`Guide`/`Confirm`/`Transform`, `ContextInjector`, `GoalLoop`,
`SessionManager` + `LocalFileStorage`/`S3Storage`, native hooks/OTEL) all exist in
the real, currently-published SDK with shapes that match the spec closely, in
several places down to the example code. Railway CLI commands cited in the
deployment plan are current and the CLI is already authenticated. WebMCP is a real,
currently-running Chrome 149–156 origin trial with a matching
`document.modelContext.registerTool()` shape. This is a genuinely buildable plan,
not a plan built on invented APIs.

The plan's real risk is not technical fiction — it is **scope versus the actual
calendar**. See Finding 1. Everything else below is either a precise correction to
make before coding starts, or a suggestion to strengthen the two submissions.

No finding below requires abandoning an approved capability. Findings 2–10 are
`resolved` by the spec edits in this document. Finding 1 is `external_blocker` in
the sense that only the project owner can choose the triage order against a real
deadline; I am not authorized to silently demote a requirement to a stretch goal.

## Findings

### Finding 1 — CRITICAL — scope vs. deadline has no triage plan

**Evidence:** The WebMCP Challenge deadline is 2026-09-03T20:00:00Z — about 7 days
from this audit. The implementation plan has 14 tasks, each with 8–12 TDD
sub-steps, spanning a from-scratch compiled pack system with SHA-256 hashing and a
conformance suite, a real Strands Graph and a real bounded Swarm, a full
AgentSkills/Interventions/ContextInjector/GoalLoop/session integration, a
migrated-SQLite command service with replayable SSE, a complete React right-pane
UI with a 6-view OpenTelemetry-correlated Runtime Inspector, Playwright visual
regression across 4 viewports, mutation testing, and a Docker/Railway/AgentCore
deployment — realistically several weeks of senior-team engineering. `CLAUDE.md`
forbids "turning a required item into a stretch goal" without user approval, but
no document defines what ships first if the full scope cannot land by 2026-09-03.

**Why this matters for winning:** A missed WebMCP deadline scores zero regardless
of how good the Energy/AWS half turns out; the AWS deadline (2026-09-14) gives
more room. Optimizing both demos at equal priority risks neither being submittable
in time.

**Disposition:** `resolved` — the project owner confirmed tiering the plan rather
than pushing all scope in parallel. The plan now carries an explicit "Delivery
tiers" section (see below).

**Resolution applied:** `docs/superpowers/plans/2026-08-26-pax-hackathon-build.md`
now has a "Delivery tiers" section splitting every task into Tier 1
(WebMCP-submission-critical, target ~2026-09-01), Tier 2 (continues through
2026-09-14 for the AWS submission — Energy Swarm, pack-authoring skill, the full
Runtime Inspector, mutation testing, the AWS submission packet), and Tier 3
(AgentCore, best-effort and contingent on AWS credentials). Nothing was deleted
or silently demoted from the approved requirement set; only sequencing changed.
Clarified during this exchange: AgentCore is irrelevant to the WebMCP submission
(not mentioned in its requirements at all) and is explicitly optional/bonus for
the AWS submission per its own official judging description and per `CLAUDE.md`'s
existing "missing AWS credentials are an honest external blocker" framing — it
was never a hard gate for either deadline, which is why it sits in Tier 3.

**Owning task:** plan resequencing in
`docs/superpowers/plans/2026-08-26-pax-hackathon-build.md` (applied).
**Verification method:** Tier 1 scope reaching submission-ready state by
~2026-09-01, tracked in `docs/build-log.md`.

---

### Finding 2 — HIGH — confirm ChatGPT's in-app browser actually calls `modelContext` tools, early

**Evidence:** Independently verified WebMCP is real: Chrome runs it as an origin
trial (Chrome 149–156, `chrome://flags/#enable-webmcp-testing` for local testing),
and `document.modelContext.registerTool({name, description, inputSchema,
execute}, {signal})` matches `webmcp.md` closely, including `AbortSignal`-based
unregistration. However, whether ChatGPT's in-app browser itself currently invokes
page-registered `modelContext` tools reliably is not something documentation
alone confirms, and low-confidence secondary sources suggest mainstream agent
clients have historically lagged the spec. `testing.md` already and correctly
treats "the ChatGPT in-app browser itself is an external host that cannot be run
in repository CI" and asks for one manual host-smoke record — that hedge is
right and should stay.

**Why this matters:** The entire WebMCP hero narrative depends on ChatGPT, not
just Chrome, discovering and calling these tools. If it does not work as expected,
the video script, positioning, and even the choice of "essential, non-trivial
WebMCP leverage" framing need to adjust — better to learn that in the first days
than during video recording.

**Disposition:** `resolved` — elevate the manual ChatGPT-in-app-browser check from
a Task-12 checkbox to a **day-one spike**, run against whatever minimal page
exists as soon as one WebMCP tool is registered, independent of the rest of the
build.

**Owning task:** Task 10 (browser commands/WebMCP), moved earlier in sequence.
**Verification method:** the existing manual host-smoke-record requirement in
`testing.md`, run early instead of late.

---

### Finding 3 — MEDIUM-HIGH — two precise Strands API corrections before coding

**Evidence (verified against the shipped `.d.ts` files):**

1. Import `LocalFileStorage` from `@strands-agents/sdk/storage`, **not** the
   root package. The root package re-exports a same-purpose `FileStorage` class
   that its own doc comment marks `@deprecated`. `architecture.md` and
   `strands-runtime.md` both say "SessionManager with LocalFileStorage" without
   naming the import path — this is correct in substance, just needs the exact
   import path pinned so an implementer doesn't reach for the deprecated root
   export.
2. `Confirm` is only a valid `InterventionAction` on `beforeToolCall` — not a
   generic mid-run checkpoint. `strands-runtime.md`'s `ConsequenceGuard` ("confirms
   a consequential proposal") must therefore be implemented as a `beforeToolCall`
   handler gating a specific tool call (e.g., a `propose_recommendation` or
   `create_inspection_proposal` tool the orchestrator invokes), not as a
   free-floating checkpoint in the engine loop.

**Disposition:** `resolved` — both are documentation precision fixes with no
behavior change; folded into `strands-runtime.md` (see Spec Amendments below).
**Owning task:** Task 6 (Strands adapter, plugins, interventions).
**Verification method:** the Task 6 integration tests already required
(`strands-interventions.test.ts`, `strands-session.test.ts`) should assert the
exact import path and that `Confirm` fires on the recommendation/proposal tool
call specifically.

---

### Finding 4 — MEDIUM — Swarm's own repetitive-handoff guard can hard-fail where the Energy demo needs a soft `Guide`

**Evidence:** The real `Swarm` has its own `repetitiveHandoffDetectionWindow` /
`repetitiveHandoffMinUniqueAgents` config that, when tripped, **returns a FAILED
result** — not a graceful redirect. Pax's own `RetrySteering` intervention (a
`Guide`-then-handoff) must therefore trigger at a strictly earlier/stricter
threshold than the SDK's built-in guard, or the required Energy demo beat
("repeated weather work → `Guide` → handoff to `home-systems-analyst`") could
instead crash the Swarm invocation with a hard failure mid-demo.

**Disposition:** `resolved` — add an explicit constraint to `strands-runtime.md`:
Pax's no-progress detector (three consecutive no-delta calls) must fire before the
SDK's `repetitiveHandoffDetectionWindow` would trip, and Task 8 must include a
test that deliberately runs the no-progress path to confirmation and asserts the
Swarm never reaches its own FAILED state during the scripted scenario.
**Owning task:** Task 8 (Energy Swarm).
**Verification method:** `tests/integration/energy-swarm.test.ts` asserts Swarm
result status is never `FAILED` during the scripted no-progress scenario.

---

### Finding 5 — MEDIUM — pin down exactly which Agent instance carries `GoalLoop`

**Evidence:** `GoalLoop` attaches to one `Agent` (only one `GoalLoop` plugin per
agent instance) and validates that agent's own invocation output — not an
arbitrary sub-step of a larger orchestration. `strands-runtime.md` already says
"GoalLoop wraps recommendation artifact generation, not the entire engine," which
is achievable, but only if the recommendation draft is produced by a distinct,
separately-invoked `decision-synthesizer` agent carrying its own `GoalLoop`
instance — not the case orchestrator itself.

**Disposition:** `resolved` — make this explicit in `strands-runtime.md`:
`decision-synthesizer` is instantiated as its own `Agent` with a `GoalLoop`
plugin (`maxAttempts: 2`, a programmatic `Validator` function per
`docs/specs/strands-runtime.md`'s `ExecutionResult` contract), invoked as an
agent-tool from the orchestrator/Graph/Swarm rather than sharing the
orchestrator's own plugin set.
**Owning task:** Task 6/7/8.
**Verification method:** `strands-goal-loop.test.ts` asserts the GoalLoop-bearing
agent is the synthesis specialist specifically, not the top-level orchestrator.

---

### Finding 6 — MEDIUM, opportunity — vended Cedar and HITL interventions aren't mentioned but exist and could reduce risk

**Evidence:** `@strands-agents/sdk` ships `vended-interventions/cedar/` (AWS
Cedar-policy-based authorization) and `vended-interventions/hitl/` (a built-in
human-in-the-loop classifier). Neither appears anywhere in the spec, which instead
plans fully bespoke TypeScript handlers for `ScopeAuthorization` and parts of
`ConsequenceGuard`.

**Why this matters for winning, not just for correctness:** Cedar is genuine,
distinctive AWS technology. Wiring `ScopeAuthorization` through the vended Cedar
intervention instead of hand-written allowlist logic (a) cuts custom code to
write and test under real time pressure (directly helps Finding 1), and (b) gives
Agents-for-Humans judges a concrete, AWS-native detail beyond Bedrock/AgentCore
for "Technological Implementation" and "Creativity & Originality."

**Disposition:** `accepted_with_rationale` — this is a genuine product/tooling
choice with a real trade-off (learning a new policy DSL under time pressure vs.
writing TypeScript the team already knows), so I am not silently substituting it.
I recommend evaluating it once Task 6 starts, and it should not block Finding 1's
critical path either way — bespoke `ScopeAuthorization` remains the safe default
if Cedar adds friction.
**Owning task:** Task 6 (optional enhancement).
**Verification method:** none required unless adopted.

---

### Finding 7 — LOW-MEDIUM — Railway commands need two additions for a genuinely unattended run

**Evidence:** Verified against the installed, authenticated CLI (v5.44.1, signed
in as the project owner already). `railway up --new --name pax-hackathon --json`,
`railway volume add --mount-path /data`, and `railway domain --port 8080` are all
real, current flags. Two gaps for an autonomous, non-interactive run: `railway up`
without `-y --detach` can block on a confirmation prompt or attach to a live log
stream indefinitely; `railway volume add` should pass `--service <name>`
explicitly rather than relying on single-service inference once more than one
service could plausibly exist in the project.

**Disposition:** `resolved` — amend the deployment commands in `CLAUDE.md` /
`architecture.md` to `railway up --new --name pax-hackathon --json -y --detach`
and `railway volume add --service pax --mount-path /data --json`.
**Owning task:** Task 14 (Railway/AgentCore deployment).
**Verification method:** the deployment step itself, run non-interactively.

---

### Finding 8 — MEDIUM, judge-perspective — keep the two hero videos from reading as one reskinned demo

**Evidence:** Both submissions correctly share one codebase and runtime, and the
requirements checklists are already honest about this. The differentiation that
exists (Graph vs. Swarm orchestration; stale-price/dog-crate vs.
draft-withheld/steering as the signature failure-mode proof) is the right
mitigation, but it depends entirely on both video scripts and both Devpost text
descriptions leaning into it hard, since a judge who happens to see both entries
could otherwise read "the same engine reskinned twice."

**Disposition:** `accepted_with_rationale` — no spec change required; this is a
production-quality note for Task 14's video/description work: each video must be
watchable and convincing with zero awareness that the other submission exists.

---

### Finding 9 — LOW — router weight constants need one honesty line, not a change

**Evidence:** `packs-and-routing.md`'s router merges deterministic and semantic
scores at fixed weights (0.6/0.4) with a 0.75 auto-select floor and 0.20 margin.
Fine and testable for a 2-pack catalog; not derived from anything larger.

**Disposition:** `resolved` — add one sentence to `packs-and-routing.md` noting
these are constants tuned for the two-pack hackathon catalog, so submission copy
never overstates them as a general routing algorithm result.

---

### Finding 10 — LOW — reuse-source-map entries still need per-file verification, not just directory-level

**Evidence:** `npm`/SDK verification above covered the *platform* claims. The
`reuse-source-map.md` claims about Praetor/Think-OS file paths were not
independently re-verified in this pass (out of scope for platform-API
verification); the map itself already commits to doing this ("verify every path
in this map still exists") as part of Task 3.

**Disposition:** `resolved` — no change; Task 3's existing instruction already
covers this. Restated here only so it is not silently dropped from the phase-zero
gate checklist.

---

## Human-only items independent of engineering (not gaps, just timing)

- Devpost registration for both competitions and AWS Builder ID verification are
  explicitly human-only per both requirements checklists. These should happen
  this week regardless of build progress, since they gate submission independent
  of code completeness.

## Spec amendments applied by this audit

The following precise, non-architectural corrections should be folded into the
named specs before Task 6 begins (tracked here rather than silently made, per
`CLAUDE_CODE_PROMPT.md`'s instruction to record dispositions):

- `strands-runtime.md`: pin `LocalFileStorage` import path
  (`@strands-agents/sdk/storage`); require `ConsequenceGuard`'s `Confirm` to gate
  a specific `beforeToolCall` (a named proposal/inspection tool); require
  `decision-synthesizer` to be a distinct `Agent` instance carrying `GoalLoop`;
  require Pax's no-progress threshold to trip strictly before the Swarm's own
  `repetitiveHandoffDetectionWindow`.
- `packs-and-routing.md`: one sentence noting router weights are tuned constants
  for the two-pack catalog.
- `CLAUDE.md` / `architecture.md`: Railway command flags (`-y --detach`,
  explicit `--service`).

## Phase-zero gate result

All findings (1–10) are resolved above with no reduction to an approved
requirement. Finding 1's tiering decision was confirmed by the project owner on
2026-08-27. **Phase zero passes.** Implementation begins immediately at Task 1,
Tier 1 first.
