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

**Status: implemented.** Every case-scoped WebMCP tool's callback invokes the identical `SiftCommands` method the matching UI control calls (see `webmcp.md`, `architecture.md`) — correct under CLAUDE.md's shared-command-implementation rule; it does not create a second command path. ADR 0006 decision 8's origin marker closes the "which caller triggered this" gap on top of that one path: every command-backed tool tags its call with `{ origin: 'webmcp' }` (`register-sift-tools.ts`'s `buildCaseScopedCommandTool`, one shared call site), `SiftCommands` sends it as an `X-Sift-Command-Origin` request header (a sibling to the existing `X-Sift-Command-Id`/`Idempotency-Key` headers), and the server records it onto the activity trail's `safeDetails.origin` for every emitted activity event tied to that command. A visible UI control calling the same `SiftCommands` method directly simply omits the header, so a WebMCP-issued command's activity events carry `safeDetails.origin: 'webmcp'` while a direct UI click's do not. `ActivityTimeline` (reused inside the Runtime Inspector's Activity tab) already renders every `safeDetails` key generically, so the marker is genuinely visible today wherever that event's details are shown. **Not yet built:** a dedicated origin filter or visual badge — Timeline's filter set today is category and level only (agent and free-text filtering are both deferred; see "Runtime Inspector UI" below), with no `origin`-specific control. **This is observability only, never authorization either way:** nothing reads this field to make a policy decision, and human-only verbs (`reviewProposal`) stay unreachable from WebMCP because the tool catalog never exposes them — independent of this marker (change-set §34: "WebMCP tool calls; registered tools; tool inputs/results").

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

Server-side debug routes are gated correctly by `SIFT_DEBUG_ENABLED` (`apps/agent/src/routes/debug.ts`; disabled returns `404` for all of them, matching "Acceptance requirements" below). **The client-side entry point is implemented, and is not env-var-gated at all**: `CaseHeader` carries a small, always-visible "Developer view" icon control (`data-testid="case-header-developer-view"`, `onOpenDeveloperView`) next to Help and Reset, reachable the moment any case is open — it needs no prior run or other activity, unlike the pre-existing "Inspect run" control on `RecommendationHero`/`LiveRunStatus`, which still exists unchanged and still only renders once a live/recent run receipt exists. Both open the same `RuntimeInspector` (§34's "reuse the existing Runtime Inspector wherever possible"): the header control opens it generally (`runId: null`), while "Inspect run" opens it pre-targeted at a specific run. This closes the gap change-set §36 asked for (an intentional developer/inspect entry point reachable with no prior activity) — matching `product.md`'s "Workspace layout" item 5. The inspector itself, once opened, replaces the case body within the right pane and includes a clear return action; it is not a desktop-only modal.

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
- Standard `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` enable an external exporter without changing Sift event persistence. **Not yet implemented** — neither variable is read by any Sift code and setting them has no effect today; see "OpenTelemetry and AgentCore" below.
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

**Not yet implemented — the requirement above stands, and it is unmet (verified 2026-09-03).** No Sift code calls `setupTracer()` or `setupMeter()` (`grep -rn "setupTracer" apps packages` returns only a comment), no `@opentelemetry` package is a direct dependency of any workspace, and no Sift span processor or OTLP exporter exists. The Strands SDK is explicit that its telemetry module "is only loaded when the user explicitly imports and calls setupTracer or setupMeter" (`@strands-agents/sdk/dist/src/telemetry/config.d.ts`), so no OTEL span is produced anywhere in Sift. What ships instead, and what the README and both submission packets now claim: real Strands TypeScript lifecycle hooks (`BeforeToolCallEvent`/`AfterToolCallEvent`/`BeforeModelCallEvent`/`AfterModelCallEvent`, plus `BeforeNodeCallEvent`/`NodeResultEvent` on the Graph and Swarm and `MultiAgentHandoffEvent` on the Swarm) normalized by `apps/agent/src/runtime/event-normalizer.ts` into one ordered run sequence keyed by a Sift-minted `traceId` (`deps.idGenerator.next('trace')`). `RuntimeCorrelation.spanId`/`parentSpanId` remain in the contract and are deliberately left unpopulated rather than filled with a fabricated id. Tracked as an unmet requirement in `docs/completion-report.md` "Known limitations", `docs/submissions/webmcp/claim-evidence-matrix.md` rows E8/E9, and `docs/superpowers/plans/2026-08-26-pax-hackathon-build.md` Task 11.

AgentCore execution propagates trace headers and records returned trace/session/request IDs. When AWS credentials and permissions allow, deployed verification confirms that the invocation appears in AgentCore/CloudWatch observability. CloudWatch is the production infrastructure view; the Sift inspector remains the domain-correlated product/debug view.

## Acceptance requirements

- Every required hero trajectory event is visible in the inspector and trace export.
- Clicking a visible activity item opens the exact correlated debug event. **Status: implemented, both halves.** `RuntimeInspector` accepts a `focusEventId` (a consumer activity item's `debugEventId`) and opens directly to the matching Timeline entry, scrolling to and marking the matching item `data-focused="true"`. The trigger lives inside the Runtime Inspector itself, as a third **Activity** tab (`Overview`/`Timeline`/`Activity`) that reuses `ActivityTimeline` verbatim (retired from the top-level consumer surface per ADR 0004, but not deleted — only mounted inside the Inspector now). Any item carrying both a `runId` and a `debugEventId` renders an "Inspect event" button that calls `App.tsx`'s `handleInspectEvent`, re-targeting the same open Inspector to that event's Timeline entry.
- Tool arguments/results, state diffs, steering reasons, handoffs, tokens, and timing are truthful and ordered.
- Secrets and seeded redaction canaries never appear in the database, HTTP response, SSE stream, exported bundle, screenshot, trace console, or test artifact.
- Restarting Railway preserves the completed run and inspector history.
- Disabling debug mode (`SIFT_DEBUG_ENABLED=false`) returns `404` for all debug endpoints. **This gating is server-side only today**: `CaseHeader`'s "Developer view" control is unconditional — it carries no client-side check of debug-enabled state and is rendered whenever a case is open, regardless of `SIFT_DEBUG_ENABLED`. Opening the inspector with debug disabled reaches a server that 404s its data requests rather than a hidden control; the control itself is not currently gated to match the server. This is a real, disclosed gap against the "hides the inspector control" half of this requirement, not implemented behavior.
- Real-time acceptance proves ordered queued/running/tool/evidence/steering/completion events, reconnect replay, duplicate suppression, slow-client resync, and snapshot/polling equivalence.
- A command issued through a registered WebMCP tool is visibly distinguishable from an identical command issued through its matching UI control, in both the activity stream (`safeDetails.origin`) and the Runtime Inspector (rendered generically wherever an event's `safeDetails` are shown; no dedicated origin filter/badge yet — see "WebMCP tool calls" above) — without introducing a second command path or a divergence from CLAUDE.md's shared-command-implementation rule.
- The consumer surface and the Runtime Inspector never disagree about the same underlying event (see "Consumer and developer projections" above); a component or contract test asserts that a given `PublicActivityEventType` always maps to the same consumer label through `activity-labels.ts`, with no code path bypassing that mapping to render a raw internal token on the consumer surface.
