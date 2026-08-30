# Debugging and Observability Specification

## Purpose

Sift must make adaptive agent behavior inspectable enough to debug locally, prove hackathon claims, and understand a deployed failure without reproducing it from prose logs.

The normal activity timeline explains behavior to a user. The **Runtime Inspector** exposes engineering detail for the same run. Both are projections of one correlated telemetry stream; neither displays private chain-of-thought.

## Consumer and developer projections

Change-set §33 states the requirement directly: the consumer workspace and the Runtime Inspector must project from the *same* underlying events — "Same underlying event. Two projections. This is important. Avoid creating parallel truth sources." (§35). The consumer surface (`product.md`) answers "what does this mean for my decision"; the Runtime Inspector answers "what exactly did the system do." Content that stays developer-only and never appears on the consumer surface by default: `commandId`, `runId`, the compiled pack hash, specialist ID, skill ID, the raw chronological activity ledger, and the E0–E3 evidence-level vocabulary (change-set §34/§48).

`apps/web/src/components/activity-labels.ts` is the implementation of this split — a single exhaustive label registry mapping internal `PublicActivityEventType` values to consumer copy, with a defensive fallback so an unrecognized internal value can never leak to the consumer surface as a raw dotted token. It is the extension point for new mappings this projection needs (research/evidence-conflict language, Question/obligation language, presentation-vs-criterion distinctions per change-set §54), not a mechanism to be rebuilt in parallel. See `product.md`'s "Consumer and developer projections" for the consumer-facing contract this section's telemetry feeds.

Official references:

- [Strands observability](https://strandsagents.com/docs/user-guide/observability-evaluation/observability/)
- [Strands OpenTelemetry traces](https://strandsagents.com/docs/user-guide/observability-evaluation/traces/)
- [Strands metrics](https://strandsagents.com/docs/user-guide/observability-evaluation/metrics/)
- [Strands TypeScript hooks](https://strandsagents.com/docs/user-guide/concepts/agents/hooks/)
- [AgentCore Observability](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability.html)

## Instrumentation architecture

The Strands TypeScript SDK is instrumented through both native OpenTelemetry and lifecycle hooks.

```text
Strands hooks ───────────────┐
Strands OTEL spans ─────────┤
Sift domain events ──────────┤
HTTP/SSE/storage events ────┼─> TelemetryNormalizer ─> Redactor ─> runtime_events
Graph/Swarm events ─────────┤                                  ├─> Runtime Inspector SSE
interventions/plugins ──────┤                                  ├─> JSON run bundle
session/snapshot events ────┘                                  └─> optional OTLP exporter
```

Every request, run, model call, tool call, Graph node, Swarm handoff, skill activation, intervention, GoalLoop attempt, context injection, case event, and session operation carries available correlation fields:

```ts
interface RuntimeCorrelation {
  traceId: string
  spanId?: string
  parentSpanId?: string
  requestId?: string
  caseId: string
  runId: string
  sessionId?: string
  obligationId?: string
  agentId?: string
}
```

Sift adds case, run, pack ID/version/hash, obligation, case-extension origin, and fixture/live attributes to Strands spans. W3C `traceparent` is propagated between Railway and AgentCore so the local gateway and remote runtime remain one trace when possible.

## Runtime event contract

```ts
interface RuntimeDebugEvent extends RuntimeCorrelation {
  schemaVersion: '1.0'
  sequence: number
  timestamp: string
  category:
    | 'case'
    | 'agent'
    | 'model'
    | 'tool'
    | 'skill'
    | 'graph'
    | 'swarm'
    | 'intervention'
    | 'goal'
    | 'context'
    | 'session'
    | 'http'
    | 'storage'
    | 'error'
  name: string
  phase: 'start' | 'update' | 'finish' | 'error'
  level: 'debug' | 'info' | 'warn' | 'error'
  durationMs?: number
  tokenUsage?: { input: number; output: number; total: number }
  estimatedCostUsd?: number
  summary: string
  attributes: Record<string, unknown>
  payload?: unknown
  stateDiff?: JsonPatchOperation[]
  redactions: Array<{ path: string; reason: string }>
}
```

`sequence` is monotonic within a run. Event payloads are size-bounded. Large tool/model payloads are summarized with a content hash and optional artifact reference.

## Required captured behavior

### Invocation and model

- invocation start/finish/error;
- model ID, parameters, latency, token usage, retry count, and schema-validation result;
- message roles and size summaries;
- sanitized system prompt and input/output payload in deterministic fixture mode;
- hash and safe summary by default for user-entered live data.

### Tools

- tool name, normalized arguments, start/finish/error, duration, source IDs, result size, and evidence delta;
- cancellation and timeout;
- Tool Ledger repetition/no-progress calculation;
- intervention decision that preceded execution.

### WebMCP tool calls

**Status: specified, not yet implemented.** Every case-scoped WebMCP tool's callback invokes the identical `SiftCommands` method the matching UI control calls (see `webmcp.md`, `architecture.md`) — correct under CLAUDE.md's shared-command-implementation rule, but it means today there is only one code path and nothing on it records which caller triggered a given command. `WebMcpToolCallContext` and `CommandCallOptions` carry only an abort signal and an optional `commandId` override; no field marks a call as WebMCP-originated, so neither the activity stream nor the Runtime Inspector can currently distinguish a WebMCP-issued command from a direct UI click.

ADR 0006 decision 8 specifies closing this gap with an explicit origin marker on the command envelope — a sibling to the existing `X-Sift-Command-Id`/`Idempotency-Key` headers (e.g. `X-Sift-Command-Origin: webmcp`), threaded through `CommandCallOptions` and `WebMcpToolCallContext`. This does not create a second command path; it tags the existing one. Once implemented, `runtime_events` and `activity_events` records for a WebMCP-originated command must carry this origin, and the Runtime Inspector's Timeline and Overview views must be able to filter and visually distinguish WebMCP-originated activity — this is an explicit hackathon judging requirement (change-set §34: "WebMCP tool calls; registered tools; tool inputs/results").

### Adaptive runtime

- available and activated skills;
- specialist invocation;
- Graph node start/stop, dependency, and outcome;
- Swarm handoff source, target, reason, evidence delta, and cycle counter;
- Context Injector field names, version, and content hash;
- GoalLoop attempt, validator result, feedback category, and exhaustion;
- `Proceed`, `Guide`, `Confirm`, `Deny`, and `Transform` events with handler and reason.
- pack-authoring skill activation, catalog/scaffold/validate/test/diff/publish tool calls, compiler diagnostics, and human publication confirmation when authoring is enabled.

### Domain and persistence

- command, actor, idempotency key hash, expected/actual event sequence, and result;
- canonical case events and JSON Patch-compatible before/after state diff;
- obligation/readiness/recommendation transitions;
- SQLite transaction, migration, busy/lock error, and duration;
- session/snapshot save, restore, and version;
- SSE connection, replay cursor, reconnect, and dropped-client error.
- public-activity projection, command/run correlation, client replay acknowledgement, resync instruction, and polling-fallback transition.
- case extension definition, origin, confirmation state, affected dependency paths, and resulting invalidation.

## Runtime Inspector UI

Server-side debug routes are gated correctly by `SIFT_DEBUG_ENABLED` (`apps/agent/src/routes/debug.ts`; disabled returns `404` for all of them, matching "Acceptance requirements" below). **The client-side entry point is narrower than an env-var-gated persistent control today**: `RecommendationHero`'s `Inspect run` button is the only way to open the inspector, and it renders only while a live/recent run receipt exists — there is no standing "Inspect" / "Developer view" affordance visible at other times (change-set §36 asks for an intentional developer/inspect entry point; this is recorded as a gap, not implemented behavior, and matches `product.md`'s "Workspace layout" item 5). The inspector itself, once opened, replaces the case body within the right pane and includes a clear return action; it is not a desktop-only modal.

Required views, and current status — only two of the six are built:

1. **Overview** — status, trace/run/session IDs, duration, model/tool calls, tokens, estimated cost, errors, active obligation, and runtime target. **Implemented.**
2. **Timeline** — virtualized chronological events with category, agent, level, and free-text filters. Selecting an event opens its structured safe payload, including its real `redactions` (path/reason, never the withheld value) and, where the underlying event carries one, its `stateDiff`. Once the WebMCP origin marker above is implemented, Timeline filtering and event display must also distinguish WebMCP-originated commands from direct UI actions. **Implemented**, including `focusEventId`-driven "open straight to this event" navigation from a consumer activity item's `debugEventId`.
3. **Execution** — compact Graph/Swarm node and handoff view showing the active path, loops, redirects, and duration. **Not yet implemented.**
4. **State** — canonical case-event list and before/after diff for criteria, evidence, obligations, readiness, recommendation, and approval. **Not yet implemented** as a dedicated view; the Timeline's per-event `stateDiff` disclosure (above) is real but is not the same as this dedicated before/after State view.
5. **Context** — activated skills, allowed tools, injected context field names/hashes, model parameters, and validator feedback. **Not yet implemented.**
6. **Errors** — grouped failures with fingerprints, stack trace in local development, related span/events, and focused reproduction command when known. **Not yet implemented** as a dedicated view; errors are visible within Overview/Timeline today.

Global inspector actions:

- copy trace, run, case, and session IDs;
- pause/resume live event following;
- jump from a user-facing activity item to its debug event;
- download a sanitized `sift-run-<runId>.json` bundle;
- copy a concise debugging summary suitable for Claude Code.

The 390 px layout uses a single view selector and stacked event details. It must not rely on a side-by-side trace tree and payload panel.

The normal workspace consumes the smaller `PublicActivityEvent` projection in `architecture.md`; the Inspector consumes the full debug stream. Every public event with `debugEventId` must resolve to exactly one safe debug event. The two streams may have different sequences but share case, command, run, obligation, and agent correlation.

## Redaction and access

- `SIFT_DEBUG_ENABLED=false` disables debug routes and UI in non-demo deployments.
- `SIFT_DEBUG_PAYLOAD_MODE=fixture-full|metadata-only` defaults to `metadata-only`; the Railway hackathon fixture can use `fixture-full` only because its seeded cases contain no private data.
- `SIFT_DEBUG_RETENTION_DAYS` defaults to `7` and cannot exceed `30` in this build.
- Standard `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` enable an external exporter without changing Sift event persistence.
- Public hackathon deployment enables the inspector only for fictional fixture cases. User-entered cases expose metadata and hashes but not raw listing notes or model content.
- Environment variables, authorization headers, cookies, credentials, account identifiers, and configured secret patterns are always removed before persistence.
- Private model reasoning is never requested or stored. If a provider returns reasoning metadata, Sift records only availability, token count, and a hash unless policy explicitly permits more.
- Stack traces include source paths only in local development. Public traces show error type, safe message, fingerprint, and relevant application frame names.
- Export applies the same redactor again and records its redaction manifest.

## Retention and bounds

- Keep the newest 100 runs or seven days of runtime events, whichever is smaller, in the hackathon deployment.
- Cap one run at 10,000 events and one persisted payload at 64 KiB after redaction.
- Bound each SSE client's pending queue. A slow client receives a persisted `stream.resync_required` marker and reloads from snapshot rather than silently losing state.
- When capped, emit `telemetry.truncated` and preserve summary counters.
- Canonical case events are not deleted by telemetry retention.

## OpenTelemetry and AgentCore

Local and Railway execution configure Strands `setupTracer()` with a Sift SQLite span processor for the inspector and an optional OTLP exporter configured through standard OTEL environment variables.

AgentCore execution propagates trace headers and records returned trace/session/request IDs. When AWS credentials and permissions allow, deployed verification confirms that the invocation appears in AgentCore/CloudWatch observability. CloudWatch is the production infrastructure view; the Sift inspector remains the domain-correlated product/debug view.

## Acceptance requirements

- Every required hero trajectory event is visible in the inspector and trace export.
- Clicking a visible activity item opens the exact correlated debug event. **Status: the destination half is real and tested** — `RuntimeInspector` accepts a `focusEventId` (a consumer activity item's `debugEventId`) and opens directly to the matching Timeline entry. **The trigger half does not exist in the live app today**: `ActivityTimeline` — the component that would render a consumer-visible, clickable activity item — is exported from the library but is not mounted anywhere in `App.tsx` (its former consumer-surface role was retired per ADR 0004, and nothing replaced it as a clickable list a user can act on). There is currently no click path anywhere in the shipped page that reaches `focusEventId`. This is a real, open gap, not a documentation lag.
- Tool arguments/results, state diffs, steering reasons, handoffs, tokens, and timing are truthful and ordered.
- Secrets and seeded redaction canaries never appear in the database, HTTP response, SSE stream, exported bundle, screenshot, trace console, or test artifact.
- Restarting Railway preserves the completed run and inspector history.
- Disabling debug mode returns `404` for all debug endpoints and hides the inspector control.
- Real-time acceptance proves ordered queued/running/tool/evidence/steering/completion events, reconnect replay, duplicate suppression, slow-client resync, and snapshot/polling equivalence.
- Once the WebMCP origin marker (see "WebMCP tool calls" above) is implemented, a command issued through a registered WebMCP tool is visibly distinguishable from an identical command issued through its matching UI control, in both the activity stream and the Runtime Inspector — without introducing a second command path or a divergence from CLAUDE.md's shared-command-implementation rule.
- The consumer surface and the Runtime Inspector never disagree about the same underlying event (see "Consumer and developer projections" above); a component or contract test asserts that a given `PublicActivityEventType` always maps to the same consumer label through `activity-labels.ts`, with no code path bypassing that mapping to render a raw internal token on the consumer surface.
