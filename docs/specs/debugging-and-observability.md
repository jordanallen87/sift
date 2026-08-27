# Debugging and Observability Specification

## Purpose

Pax must make adaptive agent behavior inspectable enough to debug locally, prove hackathon claims, and understand a deployed failure without reproducing it from prose logs.

The normal activity timeline explains behavior to a user. The **Runtime Inspector** exposes engineering detail for the same run. Both are projections of one correlated telemetry stream; neither displays private chain-of-thought.

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
Pax domain events ──────────┤
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

Pax adds case, run, pack ID/version/hash, obligation, case-extension origin, and fixture/live attributes to Strands spans. W3C `traceparent` is propagated between Railway and AgentCore so the local gateway and remote runtime remain one trace when possible.

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

The case header contains an `Inspect run` control when `PAX_DEBUG_ENABLED=true`. In the public fixture deployment it is enabled and read-only. The inspector replaces the case body within the right pane and includes a clear return action; it is not a desktop-only modal.

Required views:

1. **Overview** — status, trace/run/session IDs, duration, model/tool calls, tokens, estimated cost, errors, active obligation, and runtime target.
2. **Timeline** — virtualized chronological events with category, agent, level, and free-text filters. Selecting an event opens its structured safe payload.
3. **Execution** — compact Graph/Swarm node and handoff view showing the active path, loops, redirects, and duration.
4. **State** — canonical case-event list and before/after diff for criteria, evidence, obligations, readiness, recommendation, and approval.
5. **Context** — activated skills, allowed tools, injected context field names/hashes, model parameters, and validator feedback.
6. **Errors** — grouped failures with fingerprints, stack trace in local development, related span/events, and focused reproduction command when known.

Global inspector actions:

- copy trace, run, case, and session IDs;
- pause/resume live event following;
- jump from a user-facing activity item to its debug event;
- download a sanitized `pax-run-<runId>.json` bundle;
- copy a concise debugging summary suitable for Claude Code.

The 390 px layout uses a single view selector and stacked event details. It must not rely on a side-by-side trace tree and payload panel.

The normal workspace consumes the smaller `PublicActivityEvent` projection in `architecture.md`; the Inspector consumes the full debug stream. Every public event with `debugEventId` must resolve to exactly one safe debug event. The two streams may have different sequences but share case, command, run, obligation, and agent correlation.

## Redaction and access

- `PAX_DEBUG_ENABLED=false` disables debug routes and UI in non-demo deployments.
- `PAX_DEBUG_PAYLOAD_MODE=fixture-full|metadata-only` defaults to `metadata-only`; the Railway hackathon fixture can use `fixture-full` only because its seeded cases contain no private data.
- `PAX_DEBUG_RETENTION_DAYS` defaults to `7` and cannot exceed `30` in this build.
- Standard `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` enable an external exporter without changing Pax event persistence.
- Public hackathon deployment enables the inspector only for fictional fixture cases. User-entered cases expose metadata and hashes but not raw listing notes or model content.
- Environment variables, authorization headers, cookies, credentials, account identifiers, and configured secret patterns are always removed before persistence.
- Private model reasoning is never requested or stored. If a provider returns reasoning metadata, Pax records only availability, token count, and a hash unless policy explicitly permits more.
- Stack traces include source paths only in local development. Public traces show error type, safe message, fingerprint, and relevant application frame names.
- Export applies the same redactor again and records its redaction manifest.

## Retention and bounds

- Keep the newest 100 runs or seven days of runtime events, whichever is smaller, in the hackathon deployment.
- Cap one run at 10,000 events and one persisted payload at 64 KiB after redaction.
- Bound each SSE client's pending queue. A slow client receives a persisted `stream.resync_required` marker and reloads from snapshot rather than silently losing state.
- When capped, emit `telemetry.truncated` and preserve summary counters.
- Canonical case events are not deleted by telemetry retention.

## OpenTelemetry and AgentCore

Local and Railway execution configure Strands `setupTracer()` with a Pax SQLite span processor for the inspector and an optional OTLP exporter configured through standard OTEL environment variables.

AgentCore execution propagates trace headers and records returned trace/session/request IDs. When AWS credentials and permissions allow, deployed verification confirms that the invocation appears in AgentCore/CloudWatch observability. CloudWatch is the production infrastructure view; the Pax inspector remains the domain-correlated product/debug view.

## Acceptance requirements

- Every required hero trajectory event is visible in the inspector and trace export.
- Clicking a visible activity item opens the exact correlated debug event.
- Tool arguments/results, state diffs, steering reasons, handoffs, tokens, and timing are truthful and ordered.
- Secrets and seeded redaction canaries never appear in the database, HTTP response, SSE stream, exported bundle, screenshot, trace console, or test artifact.
- Restarting Railway preserves the completed run and inspector history.
- Disabling debug mode returns `404` for all debug endpoints and hides the inspector control.
- Real-time acceptance proves ordered queued/running/tool/evidence/steering/completion events, reconnect replay, duplicate suppression, slow-client resync, and snapshot/polling equivalence.
