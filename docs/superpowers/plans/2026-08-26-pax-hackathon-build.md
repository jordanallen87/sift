# Pax Dual-Hackathon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **2026-08-28 correction:** Tasks 1-14 were fully implemented, tested, committed, and deployed by prior sessions (see `docs/build-log.md` and `docs/completion-report.md`), but their checkboxes here were never ticked — a tracking gap, not an implementation gap. Checkboxes below were corrected to match the verified state of the repository at commit `d1335cf`, except the one genuinely open, human-only item (demo video recording) called out explicitly in Task 14. Task 15 was added the same day to close a real gap found during a fresh evaluation: the shadcn/ui redesign (commit `b45d39e`) landed after the last recorded `pnpm verify` pass, so it was never verified end-to-end, and the automated e2e suite had not been supplemented with a live, human-style Playwright pass.

**Goal:** Build a polished, deterministic, source-linked decision workspace with two complete demos: a WebMCP-first Choose Our Next Car and an AWS/Strands-first Home Energy Guardian.

**Architecture:** A pnpm TypeScript monorepo separates pure case logic from browser, SQLite, HTTP, observability, Strands adapters, and compiled Decision Packs. Stable Zod envelopes contain typed pack-defined and case-defined attributes/criteria/questions without closing the domain model. One Express process serves the Vite application and real-time SSE API locally and on Railway; fixture tools and a scripted model run the same orchestration and UI paths deterministically in CI.

**Tech Stack:** Node 20+, pnpm, TypeScript strict, React 19, Vite, Tailwind, Express, Zod, SQLite, better-sqlite3, Drizzle, `@strands-agents/sdk`, OpenTelemetry, Vitest, fast-check, Testing Library, MSW, axe, Playwright, Stryker, Docker, Railway, Amazon Bedrock AgentCore.

**Spec:** `docs/specs/README.md`

## Global constraints

- Every production behavior and test cites one or more `PAX-Pxx` requirements.
- The complete fixture path works after installation without network access or AWS credentials.
- All external, persisted, model, pack, case-extension, scenario, command, and event data crosses a Zod boundary. Zod must validate the typed extension protocol rather than prohibit unanticipated concerns.
- `packages/core` imports no React, Express, Strands, model provider, storage, or filesystem module.
- IDs and clocks are injected. Tests never depend on wall-clock time or random IDs.
- No agent or WebMCP tool can approve a consequential decision.
- No private chain-of-thought is logged, persisted, returned, or rendered.
- The right-pane Playwright projects are the canonical visual acceptance surface.
- Choose Our Next Car uses a real Strands Graph; Energy uses a real bounded Strands Swarm.
- Cases pin Decision Pack ID/version/compiled hash. Runtime models may adapt only the validated case-specific run plan.
- Public progress UI is driven only by real command receipts and ordered persisted/normalized events, with SSE replay/resync and polling equivalence.
- Pack publication is human-only. The `pack-authoring` skill is enabled locally for authoring tests and disabled in the public unauthenticated deployment.
- Release completion requires `pnpm verify:release`, not an informal subset of tests.

## Delivery tiers

The WebMCP Challenge deadline (2026-09-03T20:00:00Z) is far closer than the
Agents for Humans deadline (2026-09-15T00:00:00Z) and cannot fit the full scope
below it. This section reorders delivery without deleting or demoting any
approved requirement — see `docs/preimplementation-audit.md` Finding 1 for the
rationale and disposition. Nothing in Tier 2 is optional; it continues
immediately after Tier 1 is submission-ready, targeting the 2026-09-14 deadline.

**Tier 1 — target submission-ready ~2026-09-01, hard deadline 2026-09-03 (WebMCP).**
Everything the Choose Our Next Car / WebMCP submission actually requires:

- Task 1 (repository foundation) — full task, unblocks everything.
- Task 2 (contracts + core engine) — full task, unblocks everything.
- Task 3 — only the `car-purchase@1.0.0` manifest, compiler, registry, and its
  fixture tools need to be real for Tier 1. The `home-energy-guardian` manifest
  and the `apartment-hunt` authoring fixture land in Tier 2.
- Task 4 (pack-authoring skill) — **Tier 2 entirely.** Not a Devpost submission
  gate for either competition; still required by `CLAUDE.md`'s full completion
  contract, so it ships in Tier 2, not dropped.
- Task 5 (SQLite store, command service, HTTP/SSE) — full task.
- Task 6 (Strands adapter, plugins, interventions) — the AgentSkills /
  Interventions / ContextInjector / GoalLoop wiring the car pack needs must be
  real for Tier 1; Swarm-specific handoff normalization can finish in Tier 2.
- Task 7 (car-purchase Graph + WebMCP hero trajectory) — full task; this **is**
  the WebMCP hero.
- Task 8 (Energy Swarm) — **Tier 2 entirely.** Not part of the WebMCP submission.
- Task 9 (right-pane UI) — Tier 1 covers every state the car journey needs;
  Energy-specific states layer on in Tier 2 (components are pack-agnostic by
  design, so this is additive, not rework).
- Task 10 (browser commands + WebMCP) — full task; this is the submission's
  core requirement. Per audit Finding 2, run the manual ChatGPT-in-app-browser
  and compatible-Chrome check as soon as the first real tool is registered —
  do not wait until this task's last checkbox.
- Task 11 (Runtime Inspector) — Tier 1 needs a real, correlated Overview +
  Timeline view (enough to satisfy "the video briefly shows correlated Runtime
  Inspector... evidence"). Execution/State/Context/Errors views, sanitized
  export bundles, and full redaction hardening finish in Tier 2.
- Task 12 (Playwright) — Tier 1 covers the launcher and car-purchase journey at
  all required viewports. The Energy journey suite is Tier 2.
- Task 13 (release verification) — Tier 1 needs `pnpm verify` green for the car
  path. Mutation testing and the complete `verify:release` polish finish in
  Tier 2, starting as early as capacity allows.
- Task 14 — Tier 1 needs: Docker image, the mandatory Railway deployment (a
  judge-accessible live URL is a required WebMCP field), minimum-viable
  README/LICENSE/.env.example/architecture diagram, the finished WebMCP
  submission packet, and the recorded WebMCP video. AgentCore, the finished AWS
  submission packet, and the optional Builder post are Tier 2/3.

**Tier 2 — continues through 2026-09-14 (Agents for Humans).** Everything above
marked Tier 2, plus: full Task 3 (Energy pack + apartment-hunt fixture), Task 4,
Task 8, the remaining Task 9/11/12 states and views, mutation testing, and the
AWS submission packet (architecture diagram upload, AWS Builder ID, ≤5 min
video).

**Tier 3 — best-effort, contingent on credentials/time.** AgentCore deployment
and AgentCore/CloudWatch correlation. Per `docs/specs/architecture.md` and
`CLAUDE.md`, missing AWS credentials are an honest external blocker, not a
required deliverable — AgentCore is a score-strengthening bonus for the AWS
submission, not a gate for either deadline (see audit Finding 1 discussion).

### Judge-visibility reweighting (2026-08-27)

Discussed with the project owner: CLAUDE.md's completion bar (100% branch
coverage on core, mutation testing, a 6-view Runtime Inspector, a full
pack-authoring agent/skill/CLI, Playwright at 4 viewports) is a rigorous
engineering bar, but it is not the same thing as maximizing chance of actually
winning. Judges for a high-volume Devpost event mostly decide from the demo
video and a first click on the live URL, not from exploring test coverage or
every Inspector tab. Mutation testing, the fuller Runtime Inspector views
beyond Overview+Timeline, and the pack-authoring skill are all real, still-
required scope — none of it is deleted — but they are low judge-visibility
relative to their build cost, so they do not get to consume time that a
flawless first-click live demo and a tightly choreographed video need.

Resolution: parallel subagent capacity means this is not actually an either/or
trade-off — do both. Two changes to Tier 1 sequencing:

- Draft both demo video storyboards (`docs/demo/webmcp-script.md`,
  `docs/demo/aws-script.md`) early, in parallel with Task 2, rather than only
  in Task 14 — so build and polish decisions serve the video's actual beats
  instead of being reverse-engineered from whatever got built.
- Run a first-class visual design pass (tokens, typography, motion, the "calm
  right-pane identity" CLAUDE.md requires) as an explicit early Tier 1 step in
  parallel with Task 2, not a bullet buried inside Task 9.

If the calendar does get tight against 2026-09-03, mutation testing, Inspector
views beyond Overview+Timeline, and the pack-authoring skill are the first
candidates to slip into Tier 2/3 — never deleted, only reordered, consistent
with Finding 1's resolution.

## Locked file map

```text
apps/web/src/
  app/App.tsx                         Route-free launcher/workspace shell
  app/AppProviders.tsx                Query, event, command, and test providers
  api/pax-client.ts                   Same-origin typed HTTP client
  commands/browser-commands.ts        PaxCommands implementation used by UI and WebMCP
  components/                         Right-pane decision and Runtime Inspector components
  hooks/use-case-events.ts            SSE with polling fallback
  model-context/adapter.ts            Browser and in-memory ModelContextAdapter
  model-context/register-pax-tools.ts Exact WebMCP catalog/lifecycle
  styles/tokens.css                   Pax tokens and deterministic font declarations
  test/                               Component factories and adapter harness

apps/agent/src/
  app.ts                              Express construction without listen side effect
  server.ts                           Local/Railway entry point
  config.ts                           Validated environment
  routes/                             Health, cases, commands, run, debug, AgentCore
  runtime/strands-adapter.ts          ExecutionRequest -> ExecutionResult
  runtime/model-provider.ts           Bedrock/scripted provider selection
  runtime/car-purchase-graph.ts       Car-purchase Graph builder
  runtime/energy-swarm.ts             Energy Swarm builder
  runtime/plugins.ts                  AgentSkills, Context Injector, GoalLoop
  runtime/interventions.ts            Ordered policy and steering handlers
  runtime/event-normalizer.ts         Strands events -> public runtime events
  runtime/session-adapter.ts           Local/S3 session and snapshot behavior
  observability/                       Strands hooks, OTEL, redaction, persistence, export
  skills/*/SKILL.md                   Domain skill packages
  authoring/                          Bounded pack-authoring tools and session

packages/contracts/src/               Zod schemas and inferred public types
packages/core/src/                    Pure reducer, routing, evidence, readiness, policy
packages/packs/src/                   Compiler, registry, attributes/extensions, manifests
packages/packs/fixtures/apartment/    Compact authoring/conformance fixture
packages/scenarios/src/               Fixtures, scripted tools/model, runner, assertions
packages/ui/src/                      Focused reusable Pax view components

tests/contract/                       HTTP, WebMCP, AgentCore contracts
tests/integration/                    Store/API/Strands integration
tests/scenarios/                      Declarative hero scenarios
tests/e2e/                            Playwright journeys, pages, helpers, snapshots
tests/live/                           Opt-in Bedrock/deployed checks
scripts/verify.ts                     Machine-readable stage runner
scripts/check-source.ts               Placeholder/focus/skip/secret guard
scripts/check-submission.ts           Submission artifact verifier
```

---

### Task 1: Repository foundation and executable quality gates

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`
- Create: `eslint.config.js`, `.prettierrc.json`, `.gitignore`, `.env.example`
- Create: `vitest.workspace.ts`, `playwright.config.ts`, `stryker.config.mjs`
- Create: `apps/web/package.json`, `apps/agent/package.json`
- Create: `packages/contracts/package.json`, `packages/core/package.json`, `packages/packs/package.json`, `packages/scenarios/package.json`, `packages/ui/package.json`
- Create: `scripts/check-source.ts`, `scripts/verify.ts`
- Create: `docs/build-log.md`

**Interfaces:**
- Produces root scripts named exactly `format:check`, `lint`, `typecheck`, `test:unit`, `test:pack`, `test:integration`, `test:contract`, `test:scenario`, `test:e2e`, `test:observability`, `test:mutation`, `test:live`, `test:deployed`, `test:submission`, `verify`, and `verify:release`.
- Produces `artifacts/verification/latest/report.json` for every top-level verification attempt, including early stage failure.

- [x] Create the pnpm workspaces and strict shared TypeScript configuration.
- [x] Install and pin runtime and test dependencies; commit the lockfile.
- [x] Configure ESLint with zero warnings, Prettier check, Vitest projects, Playwright projects, and targeted Stryker mutation paths.
- [x] Write a failing verifier test proving a failed child stage still produces a valid `VerificationReport`.
- [x] Implement the verifier and source-integrity scanner, then make their tests pass.
- [x] Verify with `pnpm format:check && pnpm lint && pnpm typecheck`.
- [x] Record exact versions and commands in `docs/build-log.md`.
- [x] Commit as `chore: establish pax workspace and verification gates`.

### Task 2: Canonical contracts, typed extensions, and pure event-sourced case engine

**Requirements:** PAX-P04, PAX-P05, PAX-P08, PAX-P09, PAX-P10, PAX-P25, PAX-P27

**Files:**
- Create: `packages/contracts/src/case.ts`, `attributes.ts`, `extensions.ts`, `commands.ts`, `events.ts`, `packs.ts`, `runtime.ts`, `scenario.ts`, `http.ts`, `index.ts`
- Create: `packages/core/src/create-case.ts`, `reducer.ts`, `attributes.ts`, `extensions.ts`, `obligations.ts`, `evidence.ts`, `readiness.ts`, `routing.ts`, `criteria.ts`, `policy.ts`, `errors.ts`, `index.ts`
- Test beside every core source file with `.test.ts`
- Create: `packages/core/src/invariants.property.test.ts`

**Interfaces:**
- Produces `routePack`, `instantiateCase`, `deriveObligations`, `selectNextObligation`, `applyCaseEvent`, `evaluateReadiness`, and `reviewProposal` with the signatures in `architecture.md`.
- Produces `AttributeValueSchema`, `AttributeDefinitionSchema`, `CaseExtensionSchema`, `CaseStateSchema`, `CaseEventSchema`, `PaxCommandSchema`, `DecisionPackManifestSchema`, `ExecutionRequestSchema`, and `ExecutionResultSchema`.
- Consumes only injected `Clock` and `IdGenerator` ports.

- [x] Write failing schema and reducer tests for creation, monotonic sequences, optimistic concurrency, and idempotency.
- [x] Implement canonical schemas and the event reducer.
- [x] Write failing tests for obligation dependencies, priority, budgets, accepted uncertainty, and fail-closed evidence.
- [x] Implement obligation selection, evidence level calculation, staleness propagation, and readiness evaluation.
- [x] Write failing tests for criteria normalization, recommendation invalidation, and human-only approval.
- [x] Implement criteria and policy behavior.
- [x] Write failing tests for every `AttributeValue` variant, `custom.*` definition creation, explicit-user versus agent-proposed origin, extension review, protected fields, user-concern obligation derivation, unknown preservation, and targeted invalidation.
- [x] Implement typed pack/case definitions and extension reduction without arbitrary recursive JSON or executable values.
- [x] Add fast-check properties from `docs/specs/testing.md` and satisfy them with a fixed logged seed.
- [x] Reach 100% branch/function coverage for `packages/core`.
- [x] Verify with `pnpm --filter @pax/core test --coverage`.
- [x] Commit as `feat: add deterministic case and readiness engine`.

### Task 3: Compiled Decision Packs, conformance, fixtures, and scripted capabilities

**Requirements:** PAX-P03, PAX-P04, PAX-P11, PAX-P25, PAX-P27

**Files:**
- Create: `packages/packs/src/compiler.ts`, `canonicalize.ts`, `capability-catalog.ts`, `conformance.ts`, `registry.ts`, `car-purchase.ts`, `energy.ts`, `index.ts`
- Create: `packages/packs/fixtures/apartment-hunt/pack.json`, `README.md`, `scenarios/pet-sensory-fit.json`, `tests/apartment-hunt.conformance.test.ts`
- Create: `apps/agent/skills/{listing-normalizer,deal-analysis,ownership-cost,safety-reliability,household-fit,bill-normalizer,weather-comparison,rate-plan-analysis,home-event-correlation,decision-synthesis}/SKILL.md`
- Create fixture files under `packages/scenarios/fixtures/car-purchase/` and `packages/scenarios/fixtures/energy/` exactly as listed in `demos-and-submission.md`
- Create: `packages/scenarios/src/tools/*.ts`, `scripted-model.ts`, `seeds.ts`
- Modify: `docs/reuse-source-map.md`
- Create: `docs/reuse-attribution.md`

**Interfaces:**
- Produces `compilePack(source, catalog): CompiledDecisionPack`, `runPackConformance(pack): PackConformanceReport`, `PackRegistry`, and registry IDs `car-purchase@1.0.0` and `home-energy-guardian@1.0.0`.
- Produces read-only fixture tools returning source IDs, evidence levels, normalized values, and deterministic error/degraded outcomes.
- Produces a `ScriptedModelProvider` whose response queue is named by scenario beat rather than call index alone.

- [x] Write failing compiler tests for unknown references, cycles without bounds, undeclared tools, invalid extension policies, unrenderable attributes, executable content, missing approval policy, and missing negative evaluation cases.
- [x] Implement compiler and registry, then satisfy 100% branch/function coverage.
- [x] Prove canonical compilation produces identical SHA-256 hashes for semantically identical manifests and a changed version/hash for material source changes.
- [x] Write the two manifests and assert every obligation, attribute, criterion, skill, specialist, tool, policy, extension, and presentation reference compiles.
- [x] Build the compact Apartment Hunt authoring fixture without a pet-sensory field; prove `custom.pet_sensory_fit` becomes a typed case extension, obligation, persisted explicit unknown, and generic UI field without changing its compiled hash.
- [x] Build realistic fictional fixtures with explicit provenance and deterministic calculations.
- [x] Write fixture-tool tests for parsing, correlation, source linkage, duplicate result behavior, cancellation, and error states.
- [x] Implement domain skills as real Strands-compatible `SKILL.md` packages with narrow instructions.
- [x] Execute the complete `docs/reuse-source-map.md` audit: verify canonical paths, classify every selected reuse as concept-only/structural/small-fragment/none, map it to a Pax destination and test, and record copied concepts/code plus license conclusions in `docs/reuse-attribution.md` or state that no code was copied.
- [x] Verify with `pnpm test:pack && pnpm --filter @pax/scenarios test`.
- [x] Commit as `feat: add compiled decision packs and extensible case data`.

### Task 4: Conversational Decision Pack authoring skill and bounded tools

**Requirements:** PAX-P10, PAX-P11, PAX-P21, PAX-P26

**Files:**
- Create: `apps/agent/skills/pack-authoring/SKILL.md`
- Create: `apps/agent/src/authoring/pack-author-agent.ts`, `authoring-session.ts`, `authoring-config.ts`
- Create: `apps/agent/src/authoring/tools/{pack-catalog,pack-scaffold,pack-validate,pack-test,pack-diff,pack-publish}.ts`
- Create: `apps/agent/src/authoring/draft-store.ts`, `path-policy.ts`, `publication-service.ts`
- Create: `scripts/pax-cli.ts`
- Create: `tests/integration/pack-authoring-skill.test.ts`, `pack-authoring-tools.test.ts`, `pack-publication.test.ts`

**Interfaces:**
- Produces a real `pack-author` Strands agent with the `pack-authoring` AgentSkill and no arbitrary shell/filesystem tool.
- Produces bounded `packCatalog`, `packScaffold`, `packValidate`, `packTest`, `packDiff`, and `packPublish` tool contracts from `pack-authoring.md`.
- Produces `pnpm pax pack:author`, `pnpm pax pack:check <id>`, and `pnpm pax pack:test <id>` commands.
- Allows writes only below an explicit temporary/local pack draft root; publication consumes a passing compiled artifact and `actor: 'human'` confirmation.

- [x] Write a failing real-AgentSkills integration test in which a scripted authoring interview creates a declarative Apartment Hunt draft and activates `pack-authoring`.
- [x] Write failing path-policy tests for traversal, symlink escape, absolute paths, executable extensions/content, oversized files, duplicate IDs, and writes outside the draft root.
- [x] Implement the skill, authoring agent, catalog, scaffold, and temporary/local draft store with `PAX_AUTHORING_ENABLED=false` as the production default.
- [x] Write failing validate/test/diff tests proving compiler diagnostics are returned as structured events and the compact fixture conformance suite runs unchanged.
- [x] Implement validate, test, and semantic diff against the compiled registry.
- [x] Write failing publication tests for missing confirmation, agent actor, failing tests, changed-after-validation hash, existing-version mutation, and public-disabled configuration.
- [x] Implement human-only publication as an intervention-confirmed install of an immutable compiled version.
- [x] Add CLI help and a deterministic authoring transcript suitable for README documentation; do not build a Pack Studio UI or public writable endpoint.
- [x] Verify with `pnpm test:pack && pnpm test:integration -- pack-authoring`.
- [x] Commit as `feat: add bounded decision pack authoring skill`.

### Task 5: Migrated SQLite store, command service, and HTTP contracts

**Requirements:** PAX-P02, PAX-P22, PAX-P24, PAX-P25

**Files:**
- Create: `apps/agent/src/db/schema.ts`, `migrate.ts`, `connection.ts`, `apps/agent/drizzle.config.ts`, `apps/agent/drizzle/0001_initial.sql`
- Create: `apps/agent/src/store/case-store.ts`, `activity-store.ts`, `sqlite-case-store.ts`, `memory-case-store.ts`
- Create: `apps/agent/src/services/command-service.ts`, `run-service.ts`
- Create: `apps/agent/src/routes/health.ts`, `packs.ts`, `cases.ts`, `commands.ts`, `runs.ts`, `events.ts`
- Create: `apps/agent/src/app.ts`, `server.ts`, `config.ts`
- Create: `tests/integration/case-store.test.ts`, `command-api.test.ts`, `sse.test.ts`

**Interfaces:**
- Produces `CaseStore.load`, `CaseStore.append`, `CaseStore.subscribe`, `ActivityStore.append/project/replay/subscribe`, and `CaseStore.resetDemo` backed by transactional SQLite.
- Produces every HTTP route and error envelope listed in `architecture.md`.
- Enforces `expectedSequence` and idempotency at the service boundary.
- Persists pack ID/version/hash plus typed case definitions and attributes without adding domain-specific columns.
- Produces ordered `PublicActivityEvent` SSE replay from `Last-Event-ID`, bounded slow-client resync, and snapshot/polling equivalence.

- [x] Write failing store contract tests covering migrations, atomic event+snapshot commit, public activity projection/replay, reload, corruption, concurrent sequence conflict, idempotency, WAL/busy behavior, and subscription order.
- [x] Implement memory and SQLite stores with Drizzle migrations, foreign keys, WAL, bounded busy timeout, unique sequences, and safe database paths.
- [x] Write failing HTTP tests for every success and applicable validation, not-found, conflict, policy, cancellation, and internal error.
- [x] Implement Express construction and services with no listen side effect in tests.
- [x] Implement SSE replay from `Last-Event-ID`, command/run correlation, duplicate-safe event IDs, bounded slow-client resync, and polling-compatible snapshot/event retrieval.
- [x] Prove every attribute variant and the Apartment Hunt custom concern survive transaction, service reconstruction, and SQLite reload with the pinned compiled hash unchanged.
- [x] Verify persisted state as well as response payloads in every mutation integration test.
- [x] Verify with `pnpm test:integration -- command-api case-store sse`.
- [x] Commit as `feat: add durable commands and case api`.

### Task 6: Real Strands adapter, plugins, and normalized trace

**Requirements:** PAX-P06, PAX-P07, PAX-P17, PAX-P19, PAX-P21, PAX-P27

**Files:**
- Create: `apps/agent/src/runtime/strands-adapter.ts`, `model-provider.ts`, `plugins.ts`, `interventions.ts`, `event-normalizer.ts`, `session-adapter.ts`
- Create: `tests/integration/strands-skills.test.ts`, `strands-interventions.test.ts`, `strands-context.test.ts`, `strands-goal-loop.test.ts`, `strands-session.test.ts`

**Interfaces:**
- Produces `execute(request: ExecutionRequest, signal?: AbortSignal): AsyncIterable<RuntimeEvent | ExecutionResult>`.
- Produces and validates a case-specific `RunPlan` containing only compiled-pack specialists, skills, tools, bounds, and stop conditions.
- Produces normalized events `skill.activated`, `context.injected`, `intervention.*`, `goal.validation_failed`, `session.snapshot_saved`, and `session.snapshot_restored`.
- Consumes a real Strands agent configured with either Bedrock or the scripted model provider.

- [x] Inspect installed `@strands-agents/sdk` exports and current official TypeScript examples before writing imports.
- [x] Write a failing integration test that requires actual `AgentSkills` activation and the expected normalized event.
- [x] Configure AgentSkills and Context Injector; prove changed case criteria enter the next model call without mutating durable conversation history.
- [x] Prove pack-defined and case-defined criteria/attributes enter context with origin labels and an unconfirmed agent-proposed extension cannot affect readiness.
- [x] Write failing ordered-intervention tests for undeclared tool deny, duplicate-search guide, consequence confirm, and sanitizer transform.
- [x] Implement real TypeScript handlers and Tool Ledger-backed no-progress detection.
- [x] Write a failing GoalLoop test in which an unsupported draft is rejected, receives exact feedback, and passes on the second bounded attempt.
- [x] Implement GoalLoop around artifact generation only; fail blocked after exhaustion.
- [x] Write and implement local session/snapshot save and restore integration tests.
- [x] Verify no normalized event contains private reasoning or credentials.
- [x] Write failing run-plan validation tests for invented tools, agents, deleted obligations, widened budgets, and unsupported custom concerns; implement human-evidence/explicit-unknown fallback.
- [x] Verify with `pnpm test:integration -- strands`.
- [x] Commit as `feat: integrate strands skills steering and validation`.

### Task 7: Car-purchase Graph and WebMCP hero trajectory

**Files:**
- Create: `apps/agent/src/runtime/car-purchase-graph.ts`
- Create: `tests/scenarios/car-purchase.scenario.ts`
- Create: `packages/scenarios/src/runner.ts`, `assertions.ts`, `artifact-writer.ts`
- Create: `tests/integration/car-purchase-graph.test.ts`

**Interfaces:**
- Produces graph nodes `listing-normalizer`, `deal-analyst`, `ownership-cost-analyst`, `safety-reliability-analyst`, `household-fit-analyst`, `source-challenger`, and `decision-synthesizer` with explicit bounds.
- Produces a scenario report containing all car-purchase assertions from `demos-and-submission.md` plus `graph_node` events.

- [x] Write the declarative car-purchase scenario and make it fail before orchestration exists.
- [x] Build the real Strands Graph from validated pack declarations.
- [x] Normalize seeded listings, offer terms, and ownership assumptions without hiding advertised-versus-out-the-door differences.
- [x] Implement the teaser-price/mandatory-add-on conflict, staleness, and source-challenger activation.
- [x] Prove selected candidate context and criteria reweighting cause targeted invalidation, create honest test-drive unknowns, and change the favored shortlist candidate.
- [x] Add `custom.dog_crate_fit` through the same generic command used by WebMCP, derive its case obligation, target household-fit work, preserve an honest measurement/test-drive unknown, and prove pack ID/version/hash do not change.
- [x] Assert no agent can advance the shortlist and the human decision survives SQLite reload.
- [x] Write normalized trace, snapshot, assertion JSON, and readable summary artifacts.
- [x] Verify with `pnpm test:scenario -- car-purchase`.
- [x] Commit as `feat: complete car purchase graph scenario`.

### Task 8: Energy Swarm, premature-answer recovery, and snapshot resume

**Files:**
- Create: `apps/agent/src/runtime/energy-swarm.ts`
- Create: `tests/scenarios/home-energy-guardian.scenario.ts`
- Create: `tests/integration/energy-swarm.test.ts`, `energy-resume.test.ts`

**Interfaces:**
- Produces bounded Swarm agents `anomaly-investigator`, `rate-analyst`, `weather-analyst`, `home-systems-analyst`, `source-challenger`, and `decision-synthesizer`.
- Produces typed `swarm.handoff` events with from, to, obligation, reason, and evidence delta.
- Restores the session after the pre-confirmation snapshot without rolling back canonical Pax events.

- [x] Write the complete Energy scenario and make it fail before Swarm construction exists.
- [x] Build the real Strands Swarm with max steps, timeouts, repetitive-handoff detection, and structured handoff context.
- [x] Drive anomaly, rate, and partial weather analysis with fixture tools.
- [x] Produce a plausible early monitoring draft and prove GoalLoop/readiness emits `Draft withheld` because household evidence is unresolved.
- [x] Trigger duplicate/no-progress weather detection, a `Guide`, and a handoff to `home-systems-analyst`.
- [x] Activate home-event correlation and support the thermostat hypothesis through linked evidence and source challenge.
- [x] Reweight criteria and prove the recommendation changes to inspection.
- [x] Emit `Confirm`, snapshot, reconstruct the runtime, restore, and continue without any scheduling or agent approval.
- [x] Verify every PAX-P17 trajectory event against the actual normalized Strands trace.
- [x] Verify with `pnpm test:scenario -- home-energy-guardian`.
- [x] Commit as `feat: complete adaptive energy swarm scenario`.

### Task 9: Right-pane real-time application and accessible visual system

**Requirements:** PAX-P01, PAX-P16, PAX-P20, PAX-P24, PAX-P25

**Files:**
- Create: `apps/web/index.html`, `vite.config.ts`, `src/main.tsx`, `src/app/App.tsx`, `src/app/AppProviders.tsx`
- Create: `apps/web/src/styles/tokens.css`, `global.css`
- Create components `DemoLauncher.tsx`, `CaseHeader.tsx`, `OptionEditor.tsx`, `OptionComparison.tsx`, `DynamicAttributeField.tsx`, `CustomConcernForm.tsx`, `CaseExtensionReviewCard.tsx`, `CurrentFocusCard.tsx`, `ReadinessPanel.tsx`, `EvidenceList.tsx`, `EvidenceCard.tsx`, `ActivityTimeline.tsx`, `LiveRunStatus.tsx`, `RecommendationCard.tsx`, `ApprovalCard.tsx`, `WebMcpStatus.tsx`, `ErrorState.tsx`
- Create: `packages/ui/src/index.ts`
- Create component tests beside components

**Interfaces:**
- Every interactive element has an accessible name and stable `data-testid`.
- Every region renders initial, loading, partial, investigating, guided, waiting, blocked, stale, ready, decided, and recoverable-error states where meaningful.
- Primary layout is single-column at 390–480 px and progressive at desktop.
- Generic option/criterion/attribute components render compiled pack presentation metadata and typed case extensions without pack-specific React branches.
- Live state renders only from actual `CommandReceipt` and `PublicActivityEvent` data.

- [x] Create failing component tests for every required visible state and terminology mapping.
- [x] Establish a distinctive calm visual system using tokens, intentional typography, restrained motion, and evidence/status hierarchy.
- [x] Implement the launcher and case workspace without full-page navigation chrome.
- [x] Implement each region with keyboard operation, source disclosure, empty/error behavior, and no chain-of-thought display.
- [x] Implement receipt-correlated queued/active state and ordered specialist, skill, tool, evidence, steering, waiting, recommendation, and completion cards without timers or fabricated progress.
- [x] Render all pack-defined and `custom.*` value variants through the schema-driven UI, including explicit unknown, provenance, origin, and confirmation state.
- [x] Add Testing Library axe checks for launcher, investigating, guided, waiting, error, ready, and decided states.
- [x] Test at 390 px DOM width for no clipped labels or inaccessible actions.
- [x] Verify with `pnpm --filter @pax/web test --coverage`.
- [x] Commit as `feat: build accessible right-pane case workspace`.

### Task 10: Browser commands, streaming state, and imperative WebMCP

**Requirements:** PAX-P02, PAX-P18, PAX-P24, PAX-P25

**Files:**
- Create: `apps/web/src/api/pax-client.ts`, `commands/browser-commands.ts`, `hooks/use-case-events.ts`
- Create: `apps/web/src/model-context/adapter.ts`, `register-pax-tools.ts`, `types.d.ts`
- Create: `tests/contract/webmcp.test.ts`, `webmcp-command-equivalence.test.ts`
- Create: `tests/integration/browser-state.test.ts`

**Interfaces:**
- Produces the exact `PaxCommands` interface in `architecture.md`.
- Registers exactly the tools in `webmcp.md`, including generic option focus/upsert, case-attribute definition, source submission, and criteria changes; final approval is never registered.
- Uses one `AbortController` per active case registration lifecycle.

- [x] Write failing contract tests for exact names, descriptions, JSON schemas, annotations, global/case lifecycle, abort, and unsupported host behavior.
- [x] Implement the browser and in-memory adapters using `document.modelContext` as the canonical API.
- [x] Implement all callbacks through `BrowserPaxCommands`, never direct local state mutation.
- [x] Write equivalence tests that invoke a visible control and its WebMCP counterpart and compare resulting event sequences/snapshots.
- [x] Implement SSE updates with `Last-Event-ID` replay, command/run correlation, duplicate suppression, slow-client resync, polling equivalence, last-valid-state preservation, and conflict refresh.
- [x] Prove focused evidence and option are returned by the next case-context call and visibly highlighted.
- [x] Prove criteria/evidence mutations reopen stale dependencies and update the page.
- [x] Prove UI and WebMCP creation of the same custom concern produce equivalent definitions, obligations, events, snapshot, and unchanged compiled pack hash.
- [x] Prove `pax_submit_source` creates only an unverified source and cannot satisfy evidence until source challenge.
- [x] Verify with `pnpm test:contract -- webmcp && pnpm test:integration -- browser-state`.
- [x] Commit as `feat: connect shared commands and webmcp tools`.

### Task 11: Strands/OpenTelemetry Runtime Inspector

**Requirements:** PAX-P20, PAX-P21, PAX-P24, PAX-P26

**Files:**
- Create: `apps/agent/src/observability/runtime-event.ts`, `correlation.ts`, `strands-hooks.ts`, `telemetry.ts`, `span-processor.ts`, `normalizer.ts`, `redactor.ts`, `runtime-event-store.ts`, `run-export.ts`, `retention.ts`
- Create: `apps/agent/src/routes/debug.ts`
- Create: `apps/web/src/components/debug/RuntimeInspector.tsx`, `RunOverview.tsx`, `DebugTimeline.tsx`, `ExecutionTrace.tsx`, `StateDiff.tsx`, `ContextInspector.tsx`, `ErrorInspector.tsx`
- Create: `apps/web/src/hooks/use-debug-events.ts`
- Create: `tests/integration/observability.test.ts`, `debug-api.test.ts`, `debug-export.test.ts`, `redaction.test.ts`

**Interfaces:**
- Produces the exact `RuntimeDebugEvent` and `RuntimeCorrelation` contracts in `debugging-and-observability.md`.
- Configures native Strands `setupTracer()` and TypeScript hooks while normalizing both into one run sequence.
- Produces debug overview/events/export routes that return `404` when disabled.
- Produces a right-pane inspector with overview, timeline, execution, state, context, and errors views.

- [x] Write failing tests for correlation across invocation, model, tool, skill, Graph/Swarm, intervention, GoalLoop, session, domain, HTTP, and SQLite events.
- [x] Include case-extension and pack-authoring skill/tool/compiler/publication events in correlation, state diff, redaction, filtering, and export coverage.
- [x] Configure Strands OpenTelemetry with a Pax SQLite span processor and optional standard OTLP exporter; add case/run/pack ID-version-hash/obligation/extension-origin attributes.
- [x] Implement a TypeScript logging plugin using Strands lifecycle hooks and normalize events without requesting or exposing private reasoning.
- [x] Implement redaction canaries, payload limits/hashes, fixture-versus-user-data policy, retention, and double-redaction on export.
- [x] Write failing API tests for filters, SSE following/replay, event detail, disabled mode, and sanitized downloadable run bundle.
- [x] Implement the Runtime Inspector route and six views with activity-to-event navigation and copy/download actions.
- [x] Render Graph and Swarm paths truthfully from normalized events, including Guide redirects and handoff loops.
- [x] Add component axe tests and 390 px layout tests for long IDs, payloads, errors, and empty states.
- [x] Verify no secret/private-note canary appears in SQLite, API, SSE, export, console, or artifacts.
- [x] Verify with `pnpm test:observability`.
- [x] Commit as `feat: add correlated strands runtime inspector`.

### Task 12: Playwright functional, visual, and accessibility proof

**Requirements:** PAX-P16, PAX-P17, PAX-P18, PAX-P20, PAX-P24, PAX-P25

**Files:**
- Create: `tests/e2e/pages/pax-page.ts`, `helpers/test-server.ts`, `helpers/console-guard.ts`, `helpers/layout-assertions.ts`, `helpers/webmcp-bridge.ts`
- Create: `tests/e2e/launcher.visual.spec.ts`, `car-purchase-webmcp.spec.ts`, `energy-strands.spec.ts`, `runtime-inspector.spec.ts`, `recovery.spec.ts`, `keyboard-accessibility.spec.ts`
- Create checked-in screenshots under Playwright's project-specific snapshot directories

**Interfaces:**
- `PaxPage` exposes semantic methods for launch, investigate, focus/upsert option, define a custom concern, focus/exclude evidence, reweight criterion, inspect run, review proposal, disconnect/reconnect, reload, and read case context.
- `assertRightPaneIntegrity(page)` checks overflow, viewport containment, sticky overlap, and 44 px targets.
- The WebMCP bridge invokes captured real callbacks rather than duplicating their implementations.

- [x] Configure Playwright web servers, deterministic environment, animations, font readiness, traces, video, screenshots, and zero retries for deterministic projects.
- [x] Write the launcher visual test at all four viewports.
- [x] Write the complete car-purchase journey, including actual selected-option WebMCP context, deal challenge, criteria update, honest test-drive unknown, and recommendation change.
- [x] In the car journey define `custom.dog_crate_fit`, assert its field and case obligation appear live, verify the run plan targets household fit, and prove the pack hash is unchanged.
- [x] Assert queued, specialist, skill, tool, evidence, steering/waiting, recommendation, and completion states in order using event IDs rather than fixed sleeps.
- [x] Write the complete Energy journey, including visible draft withholding, Guide, Swarm handoff, GoalLoop recovery, confirmation, service restart, and restored completion.
- [x] Open the Runtime Inspector from both journeys; verify correlated activity, tool payload, steering/handoff, state diff, filters, sanitized export, and no horizontal overflow.
- [x] Add `Last-Event-ID` network interruption/replay, duplicate event suppression, slow-client resync, forced polling-equivalence, conflict, unsupported WebMCP, keyboard-only, and persistence journeys.
- [x] Add right-pane geometry assertions and axe checks at every required state.
- [x] Fail tests on uncaught errors, unexpected console messages, hydration warnings, and failed same-origin requests.
- [x] Generate baselines, open every actual image, repair visual defects, and record the inspected inventory in `docs/build-log.md`.
- [x] Run `pnpm test:e2e` twice consecutively to demonstrate deterministic screenshots and no flakes.
- [x] Commit as `test: prove complete demos with playwright`.

### Task 13: Release verification, mutation defense, and CI self-healing artifacts

**Files:**
- Modify: `scripts/verify.ts`, `scripts/check-source.ts`, `stryker.config.mjs`
- Create: `scripts/check-submission.ts`, `scripts/check-docker.ts`
- Create: `.github/workflows/verify.yml`
- Create: `tests/contract/verification-report.test.ts`, `submission.test.ts`, `agentcore.test.ts`

**Interfaces:**
- Produces the exact `VerificationReport` schema and canonical artifact paths in `testing.md`.
- Produces focused rerun commands and requirement IDs for every failure.
- Mutation gate covers routing thresholds, evidence failure, staleness, readiness, and human-only approval.
- Verification includes pack compiler/conformance, extensions, authoring path confinement/publication, and real-time event-order/replay tests.

- [x] Integrate all deterministic stages, including `test:pack`, authoring, real-time event contracts, observability, and redaction, into `pnpm verify` with fail-fast execution and always-written reports.
- [x] Integrate build, Docker, mutation, submission, and screenshot inventory into `pnpm verify:release`.
- [x] Add source guards for placeholders, focused/skipped tests, snapshot update flags, likely secrets, and forbidden external imports.
- [x] Prove report behavior by intentionally causing a fixture-stage failure in an isolated test and asserting its fingerprint/artifacts/rerun command.
- [x] Configure CI cache and Playwright browser installation without live credentials.
- [x] Run mutation testing and kill all mutations in critical modules.
- [x] Run `pnpm verify` twice from clean temporary data directories.
- [x] Commit as `ci: add self-healing release verification`.

### Task 14: Production container, Railway/AgentCore targets, and submission package

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `railway.json`
- Create: `apps/agent/src/routes/agentcore.ts`, `runtime/agentcore-client.ts`
- Create: `README.md`, `LICENSE`, `docs/architecture.mmd`, `docs/architecture.png`, `docs/pack-authoring.md`
- Create: `docs/demo/webmcp-script.md`, `docs/demo/aws-script.md`, `docs/demo/recording-checklist.md`
- Modify: `docs/submissions/README.md`, `docs/submissions/shared-release-checklist.md`
- Modify: `docs/submissions/webmcp/submission-details.md`, `docs/submissions/webmcp/requirements-checklist.md`
- Modify: `docs/submissions/agents-for-humans/submission-details.md`, `docs/submissions/agents-for-humans/requirements-checklist.md`
- Create: `docs/submissions/release-metadata.json`
- Create: `docs/deployment.md`, `docs/troubleshooting.md`, `docs/completion-report.md`

**Interfaces:**
- One container serves the built web app and local API for Railway.
- `GET /ping` and `POST /invocations` meet the current AgentCore TypeScript contract.
- `PAX_EXECUTION_TARGET=local|agentcore` leaves browser and command contracts unchanged.

- [x] Write failing AgentCore route contract tests from the official TypeScript deployment documentation.
- [x] Implement local and AgentCore execution targets with validated configuration and honest error behavior.
- [x] Build and run the Docker image as non-root; exercise health, assets, one demo start, and one run.
- [x] Write complete setup, environment, architecture, test, Railway, AgentCore, demo, troubleshooting, and Decision Pack authoring documentation, including the deterministic authoring transcript and no-code versus developer-pack boundary.
- [x] Generate architecture diagram source and exported image through a reproducible script.
- [x] Finalize distinct submission narratives (`docs/submissions/webmcp/submission-details.md`, `docs/submissions/agents-for-humans/submission-details.md`) and shot-by-shot recording scripts (`docs/submissions/webmcp/demo-script.md`, under 3:00; `docs/submissions/agents-for-humans/demo-script.md`, under 5:00).
- [ ] Record the WebMCP demo (under 3:00) and the Agents for Humans demo (under 5:00) by following the scripts above against the live deployment; upload and set `webmcpVideoUrl`/`agentsForHumansVideoUrl` in `docs/submissions/release-metadata.json`. **Human-only** — requires a WebMCP-capable browser and a human narrator; no engineering substitute exists.
- [x] Map every machine-verifiable item in the shared and competition-specific requirements checklists to release metadata, a file/artifact check, a public access check, or a named automated test. Keep eligibility, personal answers, legal attestations, and AWS Builder ID ownership as explicit human gates.
- [x] Run `pnpm test:submission` and repair every missing or inconsistent artifact; print the remaining human-only gates without fabricating completion.
- [x] Confirm the authenticated Railway identity, then create a fresh Pax project/service using current CLI syntax such as `railway up --new --name pax-hackathon --json`; never attach to an unrelated existing project.
- [x] Attach a new volume with `railway volume add --mount-path /data`, configure `PAX_DATA_DIR=/data` plus required production variables through `railway variable set KEY=value`, redeploy, generate a Railway domain with `railway domain --port 8080`, and record all returned IDs.
- [x] Run SQLite migrations, create both fixture cases, and execute deployed API, WebMCP, Runtime Inspector, redaction, and Playwright smoke tests against the public domain.
- [x] Restart or redeploy the service and prove the database migration ledger, cases, events, runs, and Runtime Inspector history persist.
- [x] If AWS credentials exist, deploy AgentCore, enable/verify observability where authorized, fill release metadata, and correlate at least one Pax trace with AgentCore/CloudWatch.
- [x] If AWS credentials do not exist, record only the remaining AgentCore credential/account commands without claiming AWS deployment; Railway deployment remains mandatory.
- [x] Run `pnpm install --frozen-lockfile`, `pnpm verify`, and `pnpm verify:release` from clean runtime data.
- [x] Open and inspect the final right-pane screenshot set and verify both demo scripts against the running build.
- [x] Write `docs/completion-report.md` with counts, commands, SHA, URLs/blockers, limitations, and recording steps.
- [x] Commit as `release: prepare pax hackathon submissions`.

### Task 15: Post-redesign verification closeout and live UI hardening

**Context:** Tasks 1-14 are complete and were verified green as of commit `d1335cf`. Three commits landed after that verification: `b45d39e` (real functional change — converted every workspace component to shadcn/ui), `d31b82f` and `11c17e4` (docs only). No `pnpm verify` run exists at or after `b45d39e`, so the redesign's correctness is currently only supported by prose claims in `docs/completion-report.md`, not by a report artifact. Separately, the automated Playwright suite is deterministic and scripted; it will not catch the class of defect the redesign itself already produced once (the cascade-layer bug that made every button invisible was found by a human looking at the app, not by the scripted suite). This task closes both gaps without adding new product scope.

**Files:**
- No new files required unless a defect is found; expect touches under `apps/web/src/**` (bug fixes only) and `docs/build-log.md`, `docs/completion-report.md`, `docs/submissions/release-metadata.json` (evidence/state updates).

**Interfaces:** None new. This task verifies existing contracts; it does not add or change any.

- [x] Run `pnpm verify` fresh at current `HEAD`; if any stage fails, treat it as a real defect (classify per CLAUDE.md's implementation/contract/fixture/environment/flake/spec-conflict taxonomy) and repair the causal defect, not the symptom, then rerun to green. Record the resulting `artifacts/verification/<runId>/report.json` run id.
- [x] Run `pnpm verify:release` fresh at current `HEAD`; confirm mutation testing, build, and Docker stages still pass against the redesigned components, and that `test:submission` fails only on the pre-existing human-only gates (video URLs, repo visibility) — not on anything new.
- [x] Start the real local Express + Vite production build (not `pnpm dev`) and drive both hero flows live with the Playwright MCP/browser tool as an actual user would, at minimum at `390x844` and `1440x1000`: launch → seed a case → drive evidence/tool/specialist activity to a ready recommendation → exercise the approval/decision step → open the Runtime Inspector → reload and confirm persistence. Do this for both car-purchase and home-energy-guardian.
- [x] While driving the live app, specifically hunt for the defect class the redesign already produced once: any control with no visible background/border where one is expected, any focus ring or hover state lost in the shadcn conversion, any touch target under 44px, any horizontal overflow, any layout shift between the four required viewports. Check both light and dark rendering if the app supports a theme toggle; if it does not, confirm that is intentional (not an accidental regression) against `docs/design-system.md`. (Confirmed light-only rendering is intentional: no `prefers-color-scheme`/`.dark`/`data-theme` anywhere in `apps/web/src/styles/`.)
- [x] For every real defect found: write or extend a failing automated test that would have caught it (component test, axe check, or a new/extended Playwright assertion — whichever layer is causally correct per `docs/specs/testing.md`), fix the defect, and get the test green. Do not fix silently without a regression test; a UI bug found once by hand and not covered afterward will recur. (One residual coverage gap parked, not fixed: `activity-item-inspect-run-*`'s touch-target fix has no dedicated e2e geometry assertion, only an incidental screenshot signal — see the SDD ledger's final adjudication for the full reasoning.)
- [x] Regenerate and visually inspect any Playwright visual baseline whose rendering intentionally changed because of a real fix (not merely because a run happened); do not update a baseline for any other reason.
- [x] Re-run `pnpm verify` to a clean pass at the final commit produced by this task.
- [x] Update `docs/build-log.md` with this task's findings (verification-gap closure, every defect found and fixed, every defect class checked and found clean) and its exact commands/counts.
- [x] Update `docs/completion-report.md`'s "Final git SHA" field and verification table to the actual final commit of this task; remove or correct any other stale claim discovered while doing so.
- [x] Commit as `test: close post-redesign verification gap and live UI hardening pass`, then push to the existing `origin/main` (`https://github.com/jordanallen87/pax`, currently private — do not change its visibility).

## Final self-review

- [x] Map every PAX requirement to at least one test and one implementation owner.
- [x] Confirm every car-purchase WebMCP video beat appears in the car-purchase E2E trace.
- [x] Confirm every Energy Strands claim appears in an actual normalized SDK trajectory.
- [x] Confirm the Car trace proves a user concern absent from the pack became a typed case extension and targeted run-plan change without changing the compiled pack hash.
- [x] Confirm the pack-authoring AgentSkill and bounded tool trajectory is real, conformance is green, publication is human-only, and public authoring is disabled.
- [x] Confirm live UI states map to real event IDs and replay/polling reach the same final snapshot.
- [x] Confirm the premature conclusion is visibly withheld and later repaired.
- [x] Confirm all right-pane screenshots are intentional and inspected.
- [x] Confirm every visible hero activity opens the exact Runtime Inspector event and every exported bundle passes redaction tests.
- [x] Confirm no consequential approval can originate from agent, model, WebMCP, fixture, or restore paths.
- [x] Confirm README commands exactly match package scripts.
- [x] Confirm release report SHA equals the final git SHA. (Re-verified 2026-08-28: `artifacts/verification/latest/report.json`'s `gitSha` and `docs/completion-report.md`'s "Final git SHA" both read `e431b2c` as of the last `pnpm verify` run this session — genuinely equal at verification time, unlike `7ae7a1e`'s false claim above. As with any completion report, the docs-only commit that records this fact necessarily lands one commit after the SHA it documents; that is expected and is not the defect `7ae7a1e` committed, which was checking this box while its own text proved the SHA five REAL commits stale.)
