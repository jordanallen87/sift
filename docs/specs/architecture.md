# System Architecture Specification

## Architecture summary

Pax is a pnpm TypeScript monorepo with a React/Vite browser application, an Express Strands service, and small shared packages for contracts, deterministic decision logic, Decision Packs, and scenario fixtures.

The browser owns visible case interaction and WebMCP registration. The service owns Strands agents, adaptive execution, intervention handling, and run persistence. Pure domain packages own routing, obligations, evidence, readiness, and proposal rules so they can be tested without a model, browser, database, or network.

## Repository structure

```text
pax/
  apps/
    web/                    React/Vite right-pane website and WebMCP registration
    agent/                  Express + Strands TypeScript service and static web host
  packages/
    contracts/              Zod schemas and shared API/event types
    core/                   Pure case reducer, routing, obligations, evidence, readiness
    packs/                  Compiler, registry, built-in manifests, authoring tools
    catalog/                Bundled vehicle catalog, bounded queries, pack-attribute mapping
    scenarios/              Fixture data, scripted tools, scenario runner, assertions
    ui/                     Small reusable visual primitives and case components
  tests/
    contract/               WebMCP and HTTP contract suites
    integration/            Real package/service integration with fake model and tools
    scenarios/              Machine-readable end-to-end demo specifications
    e2e/                    Playwright browser journeys and accessibility checks
    live/                   Opt-in Bedrock and deployed-runtime smoke tests
  scripts/                  Verification orchestration and report generation
  artifacts/verification/  Ignored generated reports, traces, screenshots, and videos
  docs/                     Specs, architecture diagram, guides, and submission materials
```

No file in `packages/core` may import React, Express, Strands, a model provider, or filesystem storage.

## Technology choices

- Node.js 20 or newer.
- pnpm workspaces.
- TypeScript in strict mode.
- React 19 and Vite for the browser app.
- Tailwind CSS for styling, with a small Pax token layer.
- Express for the agent service because the official TypeScript AgentCore deployment path uses Express and the `/ping` plus `/invocations` contract.
- `@strands-agents/sdk` for the runtime.
- Zod for all external and persisted boundaries. Zod validates the stable envelope, discriminated attribute values, declared pack fields, and tool/model contracts; it does not impose a closed list of domain attributes on a case.
- Vitest, React Testing Library, MSW, fast-check, and Playwright for testing.
- SQLite through `better-sqlite3` and Drizzle migrations for canonical Pax persistence.
- Strands `SessionManager` with `LocalFileStorage` locally and `S3Storage` in AgentCore deployment.
- Server-sent events for truthful browser activity and case updates from the first implementation milestone. Polling is an allowed fallback when a deployment proxy prevents SSE.

## Runtime components

### Browser application

The web app renders canonical `CaseState`, registers WebMCP tools, calls the shared API client, and subscribes to case events. It contains no model prompts and never decides readiness itself.

### Shared command client

Every user or WebMCP mutation calls a named command through the same interface:

```ts
interface PaxCommands {
  startDemo(input: StartDemoInput): Promise<CommandReceipt>
  startCase(input: StartCaseInput): Promise<CommandReceipt>
  selectPack(input: SelectPackInput): Promise<CommandReceipt>
  upsertOption(input: UpsertOptionInput): Promise<CommandReceipt>
  focusOption(input: FocusOptionInput): Promise<CommandReceipt>
  defineCaseAttribute(input: DefineCaseAttributeInput): Promise<CommandReceipt>
  reviewCaseExtension(input: ReviewCaseExtensionInput): Promise<CommandReceipt>
  focusEvidence(input: FocusEvidenceInput): Promise<CommandReceipt>
  updateCriteria(input: UpdateCriteriaInput): Promise<CommandReceipt>
  submitSource(input: SubmitSourceInput): Promise<CommandReceipt>
  requestInvestigation(input: RequestInvestigationInput): Promise<RunReceipt>
  reviewProposal(input: ReviewProposalInput): Promise<CommandReceipt>
  setEvidenceDisposition(input: SetEvidenceDispositionInput): Promise<CommandReceipt>
  requestRevision(input: RequestRevisionInput): Promise<CommandReceipt>
}

interface CommandReceipt {
  commandId: string
  caseId: string
  acceptedSequence: number
  runId?: string
  snapshot?: CaseSnapshot
}
```

The React controls and WebMCP callbacks consume the same `PaxCommands` instance. No WebMCP-only mutation path is permitted.

### HTTP service

The service exposes:

- `GET /health` for the web deployment;
- `GET /api/packs`;
- `POST /api/cases/demo`;
- `POST /api/cases` — normal, non-demo case creation pinned to any registered pack id (docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md);
- `GET /api/cases/:caseId`;
- `GET /api/cases/:caseId/events` as SSE;
- `POST /api/cases/:caseId/commands/:commandName`;
- `POST /api/cases/:caseId/run`;
- `GET /api/debug/runs/:runId`;
- `GET /api/debug/runs/:runId/events` as SSE;
- `GET /api/debug/runs/:runId/export`;
- `GET /api/catalog/years`, `GET /api/catalog/makes`, `GET /api/catalog/models`, `GET /api/catalog/body-styles`, `GET /api/catalog/vehicles`, `GET /api/catalog/vehicles/:id` — read-only, bounded, offline vehicle catalog queries (docs/decisions/0003), backed by `@pax/catalog`;
- `GET /ping` for AgentCore;
- `POST /invocations` for AgentCore.

Every route validates input and output through schemas from `packages/contracts`.

### Deterministic core

The core provides pure functions:

```ts
routePack(input, registry): RoutingDecision
instantiateCase(pack, seed): CaseState
deriveObligations(caseState): ObligationState[]
selectNextObligation(caseState): ObligationSelection
applyCaseEvent(caseState, event): CaseState
evaluateReadiness(caseState): ReadinessResult
reviewProposal(caseState, decision): CaseState
```

The model may supply structured candidate events, but only `applyCaseEvent` can change canonical state.

### Strands adapter

The adapter converts a selected obligation and compiled pack into a bounded case-specific run plan, invokes the appropriate Strands agent, Graph, or Swarm, records hook/intervention events, validates structured outputs, and submits candidate evidence events to the core.

Strands messages and private model reasoning are not canonical case data. Only validated events are persisted.

## Canonical data model

```ts
interface CaseState {
  schemaVersion: '1.0'
  id: string
  title: string
  status: 'draft' | 'investigating' | 'waiting' | 'ready' | 'decided' | 'failed'
  pack: {
    id: string
    version: string
    compiledHash: string
    selectedBy: 'user' | 'router'
    reasons: string[]
  }
  attributeDefinitions: AttributeDefinition[]
  entities: EntityRecord[]
  criteria: Criterion[]
  obligations: ObligationState[]
  claims: Claim[]
  sources: Source[]
  evidenceLinks: EvidenceLink[]
  recommendation: Recommendation | null
  proposal: DecisionProposal | null
  activeFocus: ActiveFocus | null
  selectedOptionId: string | null
  selectedEvidenceId: string | null
  eventSequence: number
  createdAt: string
  updatedAt: string
}
```

Pack-defined attributes and case-defined `custom.*` attributes use the shared `AttributeValue` discriminated union in `pack-authoring.md`. The pack provides common typed defaults; the case may persist new typed definitions, criteria, and derived obligations when the compiled extension policy permits them. Required pack obligations and protected criteria remain immutable.

All timestamps in deterministic tests come from an injected `Clock`. IDs come from an injected `IdGenerator`.

## Command and event flow

1. A UI action or WebMCP callback sends a validated command with an idempotency key and client-generated `commandId`.
2. The service loads the latest case and checks the expected `eventSequence`.
3. The command handler emits one or more domain events.
4. Events append and the derived snapshot updates atomically in SQLite.
5. The service returns a `CommandReceipt` promptly and publishes committed events to subscribers. Run-starting commands include `runId`; the UI never invents progress while waiting.
6. A run command selects the next obligation and passes a read-only snapshot to the Strands adapter.
7. Runtime activity events stream immediately; validated evidence events update canonical state and emit their resulting snapshot sequence.
8. Readiness is recomputed after every evidence, uncertainty, or policy event.

Commands use optimistic concurrency. A stale `eventSequence` produces HTTP `409` with the latest snapshot; clients refresh rather than replaying an unexamined mutation.

`selectedOptionId`, `selectedEvidenceId`, `activeFocus`, and `sources` are accepted, documented exceptions to "every canonical mutation is a `CaseEvent`": `focusOption`/`focusEvidence` are pure attention-cursor changes with no decision-relevant effect ("visible selection state only... does not change ranking or evidence" per `webmcp.md`), and a submitted source's own record is distinct from any `evidence.accepted` event its content may separately produce. The service persists these directly onto the snapshot without an accompanying `case_events` row or `eventSequence` advance. This means a case reconstructed purely by replaying `case_events` from empty will not recover selection/focus state or raw submitted-source records — acceptable because normal reads (`GET /api/cases/:caseId`, `pax_get_case_context`) always serve the persisted snapshot, never a from-scratch replay, and no required demo assertion depends on these fields surviving a pure event-log reconstruction. Do not extend this exception to any field that affects evidence, readiness, or the recommendation.

## Real-time event contract

The normal workspace and Runtime Inspector are live projections of persisted or normalized events, not simulated loading copy.

```ts
interface PublicActivityEvent {
  schemaVersion: '1.0'
  eventId: string
  sequence: number
  timestamp: string
  caseId: string
  commandId?: string
  runId?: string
  obligationId?: string
  agentId?: string
  type:
    | 'command.accepted'
    | 'run.queued'
    | 'run.started'
    | 'run.completed'
    | 'run.failed'
    | 'specialist.started'
    | 'specialist.completed'
    | 'skill.activated'
    | 'tool.started'
    | 'tool.completed'
    | 'tool.failed'
    | 'intervention.guided'
    | 'intervention.confirmation_required'
    | 'evidence.accepted'
    | 'evidence.conflicted'
    | 'obligation.updated'
    | 'recommendation.invalidated'
    | 'recommendation.ready'
    | 'draft.withheld'
    | 'case.snapshot'
  phase: 'queued' | 'active' | 'waiting' | 'completed' | 'failed'
  summary: string
  safeDetails?: Record<string, JsonValue>
  debugEventId?: string
}
```

Rules:

- The main case stream replays from `Last-Event-ID`; duplicate event IDs are ignored client-side.
- Event sequence is monotonic within the case. Run debug sequence remains monotonic within the run and is correlated by IDs.
- On disconnect, the UI preserves the last valid snapshot, shows reconnect state, fetches the latest snapshot, and resumes from the last received event.
- Polling fallback retrieves snapshot plus events after the last sequence; it must produce the same visible state as SSE.
- Public summaries describe actions and evidence without chain-of-thought. Model text may stream only as explicitly labeled draft/final prose; hidden reasoning never streams.
- The Runtime Inspector opens its detailed SSE connection only while visible. The normal workspace always receives the smaller public activity stream.
- Slow-consumer buffering is bounded. When replay is no longer available, the service emits a resync instruction and the client reloads the canonical snapshot.

## Persistence

SQLite is the canonical local and Railway store. The implementation uses `better-sqlite3`, Drizzle migrations, foreign keys, WAL mode, and a bounded busy timeout. It runs as one writable Railway application replica for the hackathon.

Required tables:

```text
cases               latest derived snapshot and pinned pack ID/version/hash
case_events         append-only canonical domain events
activity_events     append-only sanitized public case stream with per-case sequence
runs                 execution status, focus, bounds, trace/session IDs
idempotency_keys     command result deduplication
runtime_events       sanitized hooks, spans, logs, diffs, and errors
schema_migrations    applied migration ledger
```

Case-event append and snapshot replacement occur in one transaction. `(case_id, sequence)` and idempotency keys are unique. `activity_events` gives the normal UI one replayable public sequence across commands and runs; it is derived from committed domain or normalized runtime activity and cannot mutate the case. Detailed runtime telemetry is operational evidence and also cannot directly mutate canonical case state.

Local storage defaults to `.pax-data/pax.sqlite`. Railway uses `/data/pax.sqlite` on a persistent volume. Local Strands session files live under `.pax-data/strands-sessions`; Railway uses `/data/strands-sessions`. AgentCore may use S3 session storage, but canonical case writes return through the Railway service.

Scenario and release commands export normalized JSONL event/trace bundles from SQLite into `artifacts/verification/`. JSONL is not the runtime source of truth.

## Deployment

The first public deployment is a newly created Railway project and one Railway service. Express serves the Vite production build and the Pax API from the same origin. This minimizes CORS, configuration, and demo failure risk and uses a Railway volume mounted at `/data` for SQLite and local Strands sessions.

The AWS submission adds an AgentCore execution target without changing the browser contract:

```text
ChatGPT right pane -> Railway web/API gateway -> local Strands adapter or AgentCore runtime
```

- `PAX_EXECUTION_TARGET=local|agentcore` selects execution. `local` is the development and deterministic-demo default.
- The AgentCore Strands image listens on port `8080` and implements `/ping` and `/invocations`.
- Railway remains the public WebMCP origin and proxies execution to AgentCore when configured.
- `PAX_DATA_DIR` defaults to `.pax-data` locally and `/data` on Railway.
- `PAX_AUTHORING_ENABLED` defaults to `false`. Local `pack:author` commands enable it explicitly with a bounded draft root; the public hackathon service keeps it false and exposes no writable authoring route.
- Deployed browser requests remain same-origin. If a separate origin is introduced, CORS allows only `PAX_PUBLIC_ORIGIN`.
- Missing AWS credentials must not prevent the complete local deterministic demo and release suite. They may block only opt-in live deployment verification and must be reported honestly.
- Railway authentication is available. The autonomous build must create a fresh project/service, deploy, generate a public domain, attach `/data`, set production variables, run migrations, and verify persistence across restart rather than merely writing deployment instructions.

## Security and authority

- Fixture tools are read-only except canonical Pax commands.
- Agents never receive filesystem, shell, email, purchase, booking, or arbitrary HTTP tools.
- The developer-mode `pack-author` agent receives only draft-root-confined authoring tools, never arbitrary shell or filesystem access. Pack source is declarative and cannot carry executable adapters.
- Pack manifests declare tools, effects, extension policy, and approval posture; the runtime validates the declaration against a compiled registry.
- A model cannot add a tool by naming it in output.
- Case extensions may add typed data and questions but cannot add executable capabilities, remove required obligations, or weaken policies.
- `reviewProposal` rejects requests whose `actor` is not `human`.
- A recommendation and an approved decision are distinct states.
- Tool inputs, outputs, model responses, and persisted snapshots are size-bounded and schema-validated.
- Browser content is treated as untrusted input. Tool descriptions and model prompts instruct the runtime to ignore instructions embedded in source documents.
- Logs omit credentials and raw private reasoning. Demo fixtures contain no personal information.

## Reuse boundary

Pax may adapt styling and small presentational structures from Strata19's readiness, approval, engine-progress, activity, and source cards. It must not import Praetor packages by filesystem path or reproduce the full Strata19 workspace shell.

Pax may adapt Murmur's pack manifest, entity relationships, proposal semantics, and decision-stage concepts. It must not depend on Murmur's Prisma database, Mastra runtime, authentication, React Native UI, or APIs.
