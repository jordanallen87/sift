# Engineering principles

The rules this codebase is held to. Source comments throughout `apps/` and
`packages/` cite this file by name when they explain why something is built
the way it is, so it is the place to look when a piece of code seems more
careful than it needs to be — the care is usually one of these rules being
enforced at a specific line.

These are constraints, not aspirations. Where a rule and a convenience
conflict, the rule wins, and the deviation gets written down in
`docs/decisions/` rather than absorbed silently.

## Product truths

- The canonical UI is a 390–480 px assistant side pane, not a desktop dashboard shrunk after the fact.
- Visible UI controls and agent-facing callbacks use the **same** command implementation. There is no parallel automation path.
- The deterministic core, not a model, owns case state, evidence validity, readiness, and human authority.
- Decision domains are versioned **Decision Packs**. Cases pin pack ID, version, and compiled hash; runtime models adapt a validated, case-specific run plan rather than rewriting the pack.
- Zod validates stable envelopes and typed `AttributeValue` variants. A pack is never modeled as a closed object that would prevent user-defined `custom.*` criteria, attributes, and evidence questions.
- **The model may propose candidate events and recommendations. It may never approve a consequential decision.** This is enforced by absence — there is no approval capability in the tool catalog to disable.
- The workspace is real-time from the start. Queued, specialist, skill, tool, evidence, steering, recommendation, and completion states render only from actual command receipts and ordered SSE events, with replay, duplicate suppression, resync, and a polling fallback.
- Fixture mode executes the complete product with no network access after installation.
- Live model and deployed checks are additive. They never replace deterministic release evidence.
- Private chain-of-thought is never displayed. What is shown is actions, source-linked outputs, validation reasons, handoffs, intervention reasons, and state changes.

## Honesty rules

These exist because a decision tool that overstates its own certainty is
worse than no tool at all.

- Missing information reduces evidence coverage. It is never scored as zero and never quietly filled in.
- An unknown stays an explicit unknown when no capability can verify it.
- Conflicting evidence stays visibly disputed rather than being resolved by preference.
- A hard-constraint violation flags an option; it never silently removes it.
- Mixed currencies, incompatible units, free text, and unordered qualitative values are refused rather than coerced into a misleading number.
- A stated limitation must be true at the moment it is read. A claim in the UI is a claim the code has to keep.
- Telemetry is never fabricated. A span that did not happen is not drawn.
- No stub, mocked screen, static fixture rendering, or passing unit suite is described as a completed product.

## Determinism

- Every timestamp comes from an injected `Clock`; no module calls `Date.now()` directly.
- Every identifier comes from an injected `IdGenerator`.
- Fixture data is checked in and static, so a test result never depends on the network or the wall clock.

## Runtime integrity

The multi-agent runtime uses the real `@strands-agents/sdk` package and its
supported APIs. Imports are verified against the installed package rather than
remembered, and no local class is named after a framework feature in order to
simulate an integration that is not there.

The release implementation truthfully exercises progressive `AgentSkills`
activation, a real Strands Graph, a real bounded Strands Swarm, interventions
with visible `Guide`/`Confirm`/`Deny` outcomes, a context injector carrying the
current case projection, a goal loop with a callable recommendation validator,
structured output validation, streaming and hook normalization into activity
events, sessions and snapshots with deterministic restart and restore, native
OpenTelemetry tracing feeding the Runtime Inspector, and AgentCore-compatible
`/ping` and `/invocations` routes.

Deterministic tests run the actual orchestration surfaces with a scripted model
provider and fixture tools. A local fake may replace the model and external
data; it may never replace the orchestration being claimed.

## Persistence and observability

- Migrated SQLite through `better-sqlite3` and Drizzle is the canonical store, at `.sift-data/sift.sqlite` locally and `/data/sift.sqlite` in deployment.
- WAL, foreign keys, transactional event-plus-snapshot writes, unique event sequences and idempotency keys, and a single writable replica.
- The sanitized public activity stream and the detailed runtime events are persisted separately from canonical case events. **Activity and telemetry can never mutate case state.**
- Credentials, authorization headers, cookies, secret canaries, raw private reasoning, and unredacted user-entered notes are never persisted in runtime telemetry.

## Testing discipline

- A test is never deleted, skipped, focused, weakened, or quietly rewritten to make a gate pass.
- A coverage or visual threshold is never lowered.
- A required real integration is never swapped for a mock.
- A screenshot baseline is never updated merely because it differs — the rendering change has to be intended, and the reason gets written down.
- On a visual mismatch, the actual, expected, and diff images get opened and read before anything is changed.

## Where the rest lives

- `docs/specs/` — the authoritative product, architecture, and contract specifications.
- `docs/decisions/` — architectural decision records, including every accepted deviation from the above.
- `docs/specs/debugging-and-observability.md` — the full Runtime Inspector contract.
