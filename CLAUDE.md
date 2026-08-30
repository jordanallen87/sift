# Sift Autonomous Build Instructions

## Mission

Build Sift into a working, polished, tested, deployable dual-hackathon submission. The output is running software and verifiable evidence, not a scaffold, design exercise, or partial prototype.

Work autonomously from the repository root until the complete deterministic release gate passes. Make reasonable product and engineering decisions from the specifications. Do not stop to ask the user to choose routine libraries, file names, styling details, test structure, or implementation tactics.

## Required reading before implementation

Read these files completely in this order:

1. `docs/specs/README.md`
2. `docs/specs/value-proposition.md`
3. `docs/specs/product.md`
4. `docs/specs/architecture.md`
5. `docs/specs/packs-and-routing.md`
6. `docs/specs/pack-authoring.md`
7. `docs/specs/webmcp.md`
8. `docs/specs/strands-runtime.md`
9. `docs/specs/testing.md`
10. `docs/specs/debugging-and-observability.md`
11. `docs/specs/demos-and-submission.md`
12. `docs/submissions/shared-release-checklist.md`
13. `docs/submissions/webmcp/submission-details.md`
14. `docs/submissions/webmcp/requirements-checklist.md`
15. `docs/submissions/agents-for-humans/submission-details.md`
16. `docs/submissions/agents-for-humans/requirements-checklist.md`
17. `docs/reuse-source-map.md`
18. `docs/decisions/0001-hackathon-runtime-storage-and-heroes.md`
19. `docs/superpowers/plans/2026-08-26-pax-hackathon-build.md`

The specs are authoritative. If two statements conflict, follow the precedence rule in `docs/specs/README.md`. Record genuine architectural decisions in `docs/decisions/` and update the affected spec before changing acceptance behavior.

## Mandatory phase zero: audit, repair, then continue

Before creating product code, perform a deep preimplementation review and write the result to `docs/preimplementation-audit.md`. This is an execution gate, not a separate planning deliverable and not a stopping point. After repairing internally resolvable gaps, continue directly into implementation.

The review must evaluate:

- technical coherence across domain types, commands, events, HTTP/WebMCP contracts, persistence, concurrency, Strands orchestration, observability, deployment, and security;
- whether scoring, evidence, readiness, invalidation, fixture math, and every demo outcome are deterministic enough to test without hard-coded final strings;
- current official WebMCP, Strands TypeScript, AgentCore, Railway CLI, and dependency APIs rather than remembered or invented interfaces;
- every `PAX-Pxx` requirement against an implementation owner, test layer, demo beat, and submission proof;
- every item in `docs/reuse-source-map.md`, including exact source existence, canonical versus generated source, intended Sift destination, dependency cost, and license/ownership posture;
- the implementation plan's critical path, dependencies, and ability to deliver both winning hero demos before lower-priority platform work;
- the WebMCP submission as a judge would: essential/non-trivial WebMCP leverage, shared human-agent control, working right-pane execution, impact, creativity, and an immediately legible under-three-minute story;
- the Agents for Humans submission as a judge would: genuine causal Strands use, complete end-to-end work, quiet human benefit, coherent design, originality, AgentCore proof when available, and a clear five-minute story;
- contradictions, undefined types, missing algorithms, untestable claims, ambiguous UI behavior, unsupported platform claims, security gaps, and schedule risks.

At minimum, phase zero must resolve the known seams around complete domain/event contracts, deterministic scoring and evidence rules, exact fixture values and expected transitions, narrow-pane UI behavior, requirement traceability, session storage paths, specialist naming, and public-versus-debug event coverage. Create or reorganize specification files when that produces a clearer contract.

For each finding, record severity, evidence, disposition, changed files, owning implementation task, and verification method. Allowed final dispositions are `resolved`, `accepted_with_rationale`, and `external_blocker`. Do not leave internally answerable critical or high-severity findings unresolved. Do not silently remove an approved requirement to make the audit pass. Ask the user only when two plausible resolutions would materially change the approved product or an external authorization is genuinely required; continue all independent work first.

Phase zero passes only when:

- every requirement has an owner and verification path;
- every required demo beat has exact input, expected state transition, visible proof, and automated assertion;
- every source-reuse candidate has an explicit source-to-destination disposition;
- current platform assumptions are supported by installed code or official primary documentation;
- no known internal contradiction can send two implementers toward incompatible behavior;
- the revised plan still delivers all approved requirements and prioritizes the two hero vertical slices.

Record the gate result in `docs/build-log.md`, then begin Task 1 immediately. Do not stop after producing the audit or ask whether to proceed.

## Work mode

- Execute the implementation plan in order and maintain its checkboxes.
- Use test-driven development for core logic, policies, adapters, commands, and scenario behavior.
- Finish each task's implementation, tests, documentation, and focused gate before moving on.
- Commit coherent milestones when git is available. Never discard unrelated user changes.
- If this directory is not a git repository, initialize it, create an appropriate `.gitignore`, and make an initial specifications commit before product implementation.
- Do not end a work session merely because a context window is large. Persist progress in the plan and `docs/build-log.md`, then continue.
- Do not claim that a stub, mocked screen, static fixture rendering, or passing unit suite is a completed product.

## Non-negotiable product truths

- The canonical UI is a 390–480 px ChatGPT right pane, not a desktop dashboard shrunk after the fact.
- Choose Our Next Car is the WebMCP-first hero. Home Energy Guardian is the AWS/Strands-first hero.
- Visible UI controls and WebMCP callbacks use the same command implementation.
- The deterministic core, not an LLM, owns case state, evidence validity, readiness, and human authority.
- Choose Our Next Car and Home Energy Guardian are versioned **Decision Packs**. Cases pin pack ID/version/compiled hash; runtime models adapt a validated case-specific run plan rather than rewriting the pack.
- Zod validates stable envelopes and typed `AttributeValue` variants. Do not model a pack as a closed object that prevents user-defined `custom.*` criteria, attributes, and evidence questions.
- The model may propose candidate events and recommendations. It may never approve a consequential decision.
- The normal workspace is real-time from the start. Render queued, specialist, skill, tool, evidence, steering, recommendation, and completion states only from actual command receipts and ordered SSE events; implement replay, duplicate suppression, resync, and polling fallback.
- Fixture mode must execute the complete product without network access after installation.
- Live model and deployed checks are additive and may not replace deterministic release evidence.
- Do not display private chain-of-thought. Display actions, source-linked outputs, validation reasons, handoffs, intervention reasons, and state changes.

## Strands implementation integrity

Use the real TypeScript `@strands-agents/sdk` package and its supported APIs. Verify imports against the installed package and current official documentation; do not invent APIs or create local classes named after Strands features to simulate integration.

The release implementation must truthfully exercise:

- `AgentSkills` progressive activation;
- a real Strands Graph in Choose Our Next Car;
- a real bounded Strands Swarm in Home Energy Guardian;
- TypeScript interventions with visible `Guide`, `Confirm`, and `Deny` outcomes;
- Context Injector with current case projection;
- GoalLoop with a callable recommendation validator and `maxAttempts: 2`;
- structured output validation;
- streaming/hook normalization into Sift activity events;
- sessions and snapshots, including deterministic restart and restore;
- AgentCore-compatible `/ping` and `/invocations` routes.
- native Strands OpenTelemetry tracing and TypeScript lifecycle hooks feeding the Sift Runtime Inspector.
- a separate real `pack-authoring` AgentSkill with bounded catalog/scaffold/validate/test/diff/publish tools, human-only publication, and public-deployment disablement.

## Persistence and observability integrity

- Use migrated SQLite through `better-sqlite3` and Drizzle as the canonical Sift store.
- Store the database at `.sift-data/sift.sqlite` locally and `/data/sift.sqlite` on Railway.
- Use WAL, foreign keys, transactional event+snapshot writes, unique event sequences/idempotency keys, and one writable Railway replica.
- Persist a replayable sanitized public activity stream and detailed runtime events separately from canonical case events. Activity/telemetry cannot mutate case state.
- Implement the complete Runtime Inspector in `docs/specs/debugging-and-observability.md`, including hooks, OTEL spans, correlations, state diffs, filters, Graph/Swarm visualization, tokens/latency, errors, export, and activity-to-trace navigation.
- Never persist credentials, authorization headers, cookies, secret canaries, raw private reasoning, or unredacted user-entered notes in runtime telemetry.

Deterministic tests must run the actual Strands control surfaces with a scripted model provider and fixture tools. A local fake may replace the model and external data, but it may not replace the Strands orchestration being claimed.

Every built-in or authoring-fixture pack must pass the shared compiler/conformance suite. Prove an unanticipated typed concern round-trips through events and SQLite, creates a case obligation when evidence is needed, renders generically, invalidates affected state, preserves the compiled pack hash, and remains an explicit unknown when no capability can verify it.

## Test and repair loop

For every task:

1. Write or update a failing behavioral test.
2. Run the focused test and confirm the expected failure.
3. Implement the smallest coherent production behavior.
4. Run the focused test until it passes.
5. Run the package or subsystem gate.
6. Update related docs immediately.
7. Record the task result and commands in `docs/build-log.md`.

When a test fails:

1. Read the complete error, trace, console output, and `artifacts/verification/latest/report.json` when present.
2. Reproduce with the narrowest command.
3. Classify the cause as implementation, contract, fixture, environment, flake, or specification conflict.
4. Repair the causal defect, not the symptom.
5. Rerun the focused test, then its parent gate.

Never delete, skip, focus, weaken, or silently rewrite a test to make a gate pass. Never reduce a coverage or visual threshold. Never replace a required real integration with a mock. Never update a screenshot merely because it differs.

If the same failure fingerprint remains after three materially different repair attempts, write `artifacts/verification/latest/BLOCKED.md` with the commands, evidence, attempted repairs, and exact external decision required. Continue all other independent work. Stop only if the unresolved issue prevents every remaining task.

## Playwright visual verification

Playwright is a release gate, not a screenshot generator.

- Run the full product against the real local Express and Vite production behavior with deterministic model/tools.
- Cover `390x844`, `430x900`, `480x900`, and `1440x1000` viewports.
- Test both complete demos, key WebMCP calls, reload persistence, confirmation, errors, keyboard use, and recovery.
- Use stable `data-testid` selectors and accessible roles. Avoid fixed sleeps.
- Assert no horizontal overflow, no overlapping sticky controls, visible primary actions, and valid focus order.
- Fail on page exceptions, unexpected console errors, failed API calls, or hydration warnings.
- Run axe in every required state.
- Capture named visual baselines with deterministic fonts, clocks, IDs, and animations disabled.
- On a visual mismatch, open and inspect the actual, expected, and diff images. Repair layout defects. Update a baseline only when the changed rendering is required and document why in `docs/build-log.md`.
- Preserve trace, screenshot, video, network log, console log, and final case snapshot on failure.

Before completion, inspect all release screenshots as a set and verify that the product looks intentional, legible, calm, and consistent in the right pane. Automated pixel equality does not replace this review.

## Source-project reuse

Sift is standalone. `docs/reuse-source-map.md` is the canonical and exhaustive source-to-destination map; do not maintain a second partial list here. Reuse only small, understandable pieces after inspecting their dependencies and licenses. Update the map when the audit discovers a better source or decides not to reuse an entry.

Do not import either reference repository by filesystem path. Copy only code that is worth owning here, simplify it, attribute it in `docs/reuse-attribution.md`, and cover it with Sift tests. Prefer implementing the smaller Sift contract when copied code brings unnecessary dependencies.

## Deployment behavior

- The complete local and fixture-backed build is mandatory.
- Create a Docker image that serves the built web app and API as one Railway service.
- Support `SIFT_EXECUTION_TARGET=local|agentcore`.
- Railway CLI authentication is available. Creating a new Railway project/service and deploying it is mandatory, not optional.
- Verify with `railway whoami`, then use the current authenticated CLI workflow to create a fresh project named `pax-hackathon` (use a deterministic short suffix only if unavailable), such as `railway up --new --name pax-hackathon --json -y --detach` (`-y --detach` are required for a genuinely non-interactive autonomous run; without them the command can block on a prompt or attach to a live log stream indefinitely). Attach `/data` with `railway volume add --service sift --mount-path /data --json` (pass `--service` explicitly rather than relying on single-service inference), set non-secret configuration with `railway variable set KEY=value`, redeploy, generate a domain with `railway domain --port 8080`, run migrations, and execute `pnpm test:deployed`. Check each command's current help before use and capture JSON output where supported.
- Record Railway project, service, environment, deployment, volume, and public-domain identifiers in the completion report. Do not link or mutate an unrelated existing Railway project.
- Prove SQLite case and Runtime Inspector persistence across a service restart or redeploy.
- If AWS credentials exist, deploy the Strands runtime to Bedrock AgentCore and test `/ping` plus one invocation for each hero pack.
- Never fabricate deployment success. Missing credentials are an honest external blocker, not a reason to stop the local product build.

## Completion contract

Do not declare completion until all applicable items are true:

- `pnpm install --frozen-lockfile` succeeds from a clean checkout.
- `pnpm verify` passes with no network calls.
- `pnpm verify:release` passes and creates the machine-readable report.
- Both Playwright demo journeys pass at all required viewports.
- All release screenshots have been visually inspected.
- Both scenario reports contain the required Strands/WebMCP trajectory assertions.
- Runtime Inspector tests prove trace correlation, safe payload detail, state diffs, filtering/export, and redaction.
- The production build and Docker contract pass.
- README setup, demo, architecture, test, deployment, and troubleshooting instructions are accurate.
- MIT license, environment example, architecture diagram source/export, reuse attribution, submission copy, and demo scripts exist.
- Every machine-verifiable required item in the shared and competition-specific submission checklists is green; human/legal attestations remain explicitly assigned to the submitter.
- No placeholders, focused/skipped tests, untracked acceptance changes, secrets, or knowingly false claims remain.

At the end, write `docs/completion-report.md` containing:

- implemented capabilities;
- exact verification commands and counts;
- coverage and mutation results;
- Playwright projects and screenshot inventory;
- Railway project/service/deployment/volume IDs, public URL, deployed checks, and any AWS-only credential blockers;
- known limitations;
- demo recording steps;
- final git SHA.

Then print a concise terminal summary with the public/local URLs, verification result, report path, and any truly external blocker.
