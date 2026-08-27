# Automated Testing and Self-Healing Specification

## Objective

The test system must prove the demo, not merely exercise code. Every visible demo beat has deterministic assertions over case state, runtime trajectory, policy decisions, WebMCP behavior, and rendered UI.

The release gate produces machine-readable evidence that Claude Code can use to diagnose and repair failures. Self-healing is bounded and test-preserving: Claude may repair implementation or fixtures, but it may not weaken acceptance assertions to manufacture a green build.

## Verification layers

### Static verification

- TypeScript strict typecheck for every workspace.
- ESLint with zero warnings.
- Prettier check.
- Dependency and circular-import check.
- Zod schema compilation for all pack manifests, discriminated attribute values, case extensions, authoring drafts, and scenario files.
- Search gate rejecting conventional unfinished-work markers, focused tests, skipped tests, and exclusive test modifiers.

### Unit tests

Vitest tests pure behavior for:

- pack compilation and registry;
- deterministic router scoring and threshold behavior;
- case creation and pack ID/version/hash pinning;
- typed attribute definitions/values, case-extension creation, origin, confirmation, and namespace rules;
- custom-criterion obligation derivation and dependency invalidation;
- obligation derivation, dependency ordering, prioritization, attempt budgets, and accepted uncertainty;
- evidence levels, source independence, staleness, fail-closed verdicts, and convergence;
- recommendation invalidation after criteria or evidence changes;
- policy enforcement and human-only approval;
- intervention detection and action precedence;
- event reduction, optimistic concurrency, idempotency, clocks, and IDs;
- tool argument normalization and no-progress detection.
- runtime event correlation, redaction, retention, payload bounds, and state-diff generation.
- authoring-tool draft-root confinement, compiler diagnostics, deterministic hash, and human-only publication.

Critical invariants in `packages/core` and `packages/packs` require 100% branch and function coverage. Global thresholds are 90% branches and 95% lines, functions, and statements.

### Property tests

fast-check verifies:

- router output never references an unregistered pack;
- explicit user selection always wins for a valid pack;
- a pinned case never changes pack through routing;
- compiled pack hashing is deterministic for semantically identical manifests;
- a case extension never removes or weakens a required pack obligation or protected criterion;
- every valid `AttributeValue` variant round-trips through the reducer and persisted schema;
- `unknown` attribute status persists without a placeholder value, while every non-unknown status requires a valid value;
- arbitrary unsupported or executable values are rejected;
- adding a user concern cannot increase readiness before its evidence question is resolved;
- event sequence is monotonic;
- reducing the same idempotent event twice does not duplicate its effect;
- adding failed, degraded, skipped, or stale evidence cannot promote readiness;
- removing included evidence cannot increase readiness;
- an agent actor can never produce an approved decision;
- normalized criterion weights remain finite and sum to one when at least one criterion has positive weight.

### Component tests

React Testing Library verifies every visible state named in the product specification. All interactive controls use stable `data-testid` values and accessible names. axe checks run on the launcher, active workspace, pending confirmation, error, and decided states.

### HTTP integration tests

Tests start the real Express application with a migrated temporary SQLite database, temporary session store, scripted models, and fixture tools. Every endpoint has success, validation, not-found, conflict, policy, cancellation, and internal-error coverage where applicable.

Tests assert both the HTTP response and persisted event/snapshot state.

### WebMCP contract tests

An in-memory `ModelContextAdapter` records tools and invokes their actual callbacks. Contract tests verify the complete list in `webmcp.md`, dynamic registration, schema validation, cancellation, command equivalence, UI updates, conflict recovery, and the absence of an agent approval tool.

### Scenario tests

Scenario tests execute the actual core, pack, Strands adapter, scripted model, interventions, fixture tools, event store, and API in process. They do not render a browser.

Each scenario is declarative:

```ts
interface DemoScenario {
  id: string
  packId: string
  seed: ScenarioSeed
  steps: ScenarioStep[]
  assertions: ScenarioAssertion[]
}

type ScenarioAssertion =
  | { kind: 'pack_selected'; packId: string; reasonIncludes: string }
  | { kind: 'case_extension_defined'; definitionId: string; origin: string }
  | { kind: 'case_obligation_created'; obligationId: string; criterionId: string }
  | { kind: 'skill_activated'; skillId: string; obligationId: string }
  | { kind: 'specialist_invoked'; specialistId: string }
  | { kind: 'graph_node'; nodeId: string }
  | { kind: 'swarm_handoff'; from: string; to: string }
  | { kind: 'context_injected'; fields: string[] }
  | { kind: 'goal_validation_failed'; reasonIncludes: string }
  | { kind: 'snapshot_restored'; caseId: string }
  | { kind: 'debug_event_correlated'; eventName: string; activityType: string }
  | { kind: 'redaction_canary_absent'; canary: string }
  | { kind: 'tool_called'; toolId: string; count?: number }
  | { kind: 'intervention'; action: 'guide' | 'confirm' | 'deny'; handler: string }
  | { kind: 'claim_linked'; claimId: string; sourceIds: string[] }
  | { kind: 'evidence_stale'; evidenceId: string }
  | { kind: 'obligation_status'; obligationId: string; status: string }
  | { kind: 'readiness'; ready: boolean; blockers: string[] }
  | { kind: 'recommendation'; favoredOptionId: string }
  | { kind: 'human_action'; action: string }
  | { kind: 'forbidden_event_absent'; eventType: string }
```

The runner writes the final snapshot, event log, normalized agent trajectory, and assertion report to `artifacts/verification/scenarios/<scenarioId>/`.

### Decision Pack conformance tests

`pnpm test:pack` discovers every built-in and authoring fixture pack and runs the same compiler/conformance suite. It verifies reference resolution, extension policy, Graph/Swarm bounds, required negative scenarios, authority rules, generic UI renderability, deterministic compilation, and immutable version/hash pinning.

The compact `apartment-hunt` authoring fixture must begin without a pet-sensory field, accept a typed `custom.pet_sensory_fit` criterion, create a case obligation, persist it through SQLite, render it in the generic UI, and preserve an explicit unknown when no installed source can verify it.

The `pack-authoring` skill integration suite uses the real Strands AgentSkills activation with a scripted model and temporary draft root. It proves catalog, scaffold, validate, test, diff, confirmation, and publish behavior; path traversal, executable manifest content, failing conformance, an agent actor, and public authoring-disabled configuration are rejected.

### Browser E2E tests

Playwright starts the real web and agent services with deterministic fixtures. Tests cover:

- launching each demo from a clean state;
- responsive rendering at `430x900` and `1440x1000`;
- running the full scenario through visible controls;
- running key steps through the in-memory WebMCP bridge exposed to the browser test;
- focusing evidence and seeing the selection reflected in case context;
- changing criteria and observing recommendation invalidation and revision;
- guided retry and stale-evidence activity cards;
- adding a concern not declared by the pack and observing its typed field, evidence question, and targeted investigation;
- real queued, specialist, skill, tool, evidence, steering, recommendation, and completion updates without page refresh;
- SSE disconnect/replay through `Last-Event-ID`, duplicate suppression, slow-client resync, and polling-equivalent final state;
- explicit human proposal review;
- persistence after reload;
- network interruption and recovery;
- accessibility and keyboard operation;
- stable screenshots for launcher, active investigation, confirmation, ready, and decided states.
- opening the Runtime Inspector, filtering events, expanding a steering/tool/handoff event, viewing a state diff, jumping from activity to trace, and downloading a sanitized run bundle.

The primary visual project is `right-pane` with viewports `390x844`, `430x900`, and `480x900`. A secondary desktop project runs at `1440x1000`. Every required state has both semantic assertions and a named screenshot; screenshots alone are insufficient.

Visual tests must:

- call `expect(page).toHaveScreenshot()` with animations disabled, a checked-in deterministic font setup, and `maxDiffPixelRatio` no greater than `0.01`;
- assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at every right-pane state;
- assert the bounding boxes of fixed/sticky controls do not overlap the focused card, approval controls, or WebMCP status;
- verify primary controls remain inside the viewport and have at least a 44-by-44 CSS-pixel target where applicable;
- run axe against launcher, investigating, guided, waiting, ready, error, and decided states;
- fail on uncaught page errors, unexpected console errors, failed same-origin API requests, or hydration warnings;
- retain Playwright trace, screenshot, video, console log, request log, and final case snapshot on failure.
- assert fixture traces show safe model/tool payloads while user-entered cases show hashes/summaries and never raw private notes.

Golden screenshots may be updated only after the executor opens and inspects the generated image, states why the change is intended, and confirms it against the relevant requirement. Blind `--update-snapshots` repair is prohibited.

Playwright waits on domain state and test IDs. Fixed sleeps are prohibited.

### Live tests

`pnpm test:live` is opt-in and requires AWS credentials. It invokes the configured Bedrock model against fixture tools and asserts schemas and trajectory invariants, not exact prose.

`pnpm test:deployed` verifies:

- public web health and static assets;
- AgentCore `/ping`;
- one AgentCore invocation per hero pack;
- CORS from the public web origin;
- WebMCP tool registration in a compatible Chromium run;
- no secrets in returned payloads.

The ChatGPT in-app browser itself is an external host that cannot be run in repository CI. Release evidence therefore includes one manual host smoke record with timestamp, deployed URL, tool names discovered, and outcome. All page-side semantics remain automated through the adapter and compatible Chromium tests.

## Demo traceability matrix

| Demo beat | Unit | Integration | Scenario | Browser E2E | Live |
| --- | --- | --- | --- | --- | --- |
| Correct Decision Pack selected with reasons | router | API | required | visible badge | Bedrock router smoke |
| Skill activated dynamically | skill policy | Strands adapter | required | activity card | trajectory invariant |
| Car-purchase Graph node executes | graph builder | Strands Graph | Car required | activity card | trajectory invariant |
| Energy Swarm changes specialist | handoff policy | Strands Swarm | Energy required | current-focus card | trajectory invariant |
| Repeated search is guided | retry detector | interventions | required | guidance card | optional |
| Premature conclusion is withheld | output validator | GoalLoop adapter | Energy required | draft-withheld card | trajectory invariant |
| Current case state is injected | context projection | Context Injector | Energy required | updated focus/criteria | trajectory invariant |
| Paused run restores from snapshot | snapshot policy | session adapter | Energy required | reload/reconnect | deployed smoke |
| Conflicting evidence becomes stale | evidence ledger | event store | Car required | evidence badge | not required |
| Criteria change invalidates recommendation | reducer | command API | both required | WebMCP + UI | not required |
| Confirmation precedes consequential proposal | policy | intervention API | Energy required | approval card | trajectory invariant |
| Agent cannot approve decision | policy | command API | forbidden assertion | no agent control | not required |
| Final decision survives reload | reducer | persistence | required | required | deployed smoke |
| Activity opens exact trace event | correlation | debug API | both required | inspector journey | deployed smoke |
| Tool/model/state detail is inspectable | redactor | hook + OTEL capture | both required | inspector tabs | CloudWatch correlation |
| Secrets and private notes are absent | redactor | persistence/export | required | response/download checks | deployed canary |
| SQLite survives service restart | store | migrated SQLite | required | reload after restart | Railway required |
| Unanticipated concern becomes a typed case extension | extension reducer | command/store | Car required | custom criterion journey | not required |
| Pack-authoring skill produces a valid bounded draft | compiler/policy | real AgentSkill + authoring tools | authoring fixture | transcript/docs smoke | not required |
| Workspace updates from truthful real-time events | projection/order | SSE replay/resync | both required | intermediate-state journey | deployed smoke |

## Commands and gates

The implemented repository must provide:

```text
pnpm format:check       formatting only
pnpm lint               lint with zero warnings
pnpm typecheck          all workspace typechecks
pnpm test:unit          unit, property, and component tests
pnpm test:pack          pack compiler, conformance, extension, and authoring-skill tests
pnpm test:integration   HTTP, store, and Strands-adapter integration
pnpm test:contract      WebMCP and AgentCore contracts
pnpm test:scenario      both deterministic demo scenarios
pnpm test:e2e           Playwright critical journeys
pnpm test:observability Runtime Inspector, trace correlation, redaction, and export
pnpm test:mutation      targeted core invariant mutation tests
pnpm test:live          opt-in Bedrock tests
pnpm test:deployed      opt-in public deployment tests
pnpm verify             static + unit + pack + integration + contract + scenario + E2E
pnpm verify:release     verify + mutation + build + Docker contract + submission checks
```

`pnpm verify` must run without network access after dependencies and Playwright browsers are installed.

`pnpm test:deployed` is mandatory for Railway. It creates a fixture case, records its case/run IDs, confirms inspector availability, triggers a Railway restart or redeploy, and proves the case, events, trace, and SQLite migration ledger persist afterward.

## Failure artifacts

Every verification command writes JUnit where supported. The top-level verifier always writes:

```ts
interface VerificationReport {
  schemaVersion: '1.0'
  runId: string
  startedAt: string
  finishedAt: string
  gitSha: string | null
  status: 'passed' | 'failed'
  stages: VerificationStageResult[]
  failures: Array<{
    fingerprint: string
    stage: string
    testFile?: string
    testName?: string
    message: string
    relatedRequirements: string[]
    artifactPaths: string[]
    focusedRerunCommand: string
  }>
}
```

The canonical path is `artifacts/verification/latest/report.json`. On failure, `artifacts/verification/latest/summary.md` provides a human-readable version. Previous runs are retained by run ID.

## Bounded Claude repair protocol

`CLAUDE.md` and the implementation plan must instruct Claude Code to use this loop:

1. Run the narrowest required verification command for the current task.
2. On failure, read the complete error and `report.json` before editing.
3. Classify the failure as implementation, contract, fixture, environment, flaky test, or specification conflict.
4. Reproduce with `focusedRerunCommand`.
5. Make the smallest causal repair.
6. Rerun the focused test until it passes.
7. Run the task's complete gate.
8. At milestone boundaries, run `pnpm verify`.
9. Before claiming completion, run `pnpm verify:release` and archive its report.

Claude must stop and write `artifacts/verification/latest/BLOCKED.md` when the same failure fingerprint survives three repair attempts. The report names attempts, changes, evidence, and the decision required. Claude must not continue cycling.

## Test integrity rules

Claude may not:

- delete, skip, focus, or weaken a failing test to make a gate pass;
- reduce coverage thresholds;
- update a golden snapshot unless the corresponding requirement and visible change justify it;
- change a fixture's expected outcome to match incorrect implementation;
- replace an integration with a mock when the specification requires the real boundary;
- treat an unavailable live credential as a passing live test;
- claim a manual ChatGPT host check happened without a recorded result.

Any intentional acceptance change requires a specification edit and explicit user approval before the test changes.

## Flake policy

- A test that passes only on retry is failed and labeled flaky.
- CI does not use automatic test retries for deterministic suites.
- Random generators log and accept a reproducible seed.
- Time, IDs, model output, tool output, and network are injected in deterministic tests.
- Each scenario starts with a new temporary store and case ID.
- Playwright traces, screenshots, console logs, request logs, and final case snapshots are retained on failure.

## Mutation testing

A targeted mutation gate covers router thresholds, human-only approval, fail-closed evidence, staleness, and readiness. Surviving mutations in those modules fail `verify:release`. Mutation testing is not required for React presentation code.
