# Product and Scope Specification

## Product promise

Pax handles the repetitive investigation behind consequential everyday decisions and interrupts the user only when evidence, authority, or preference requires judgment.

The product should feel like a calm case board rather than a chatbot dashboard. The agent works visibly in the background, the person can reshape the investigation from the page or from ChatGPT, and the final decision remains recognizably theirs.

Pax does not compete with the base model on eloquence. It supplies the durable evidence, completion, adaptation, persistence, and authority layer that a one-shot answer lacks. The required product proof is defined in `value-proposition.md`.

## Target users

The hackathon audience is an individual dealing with an unfamiliar, evidence-heavy personal decision:

- a household comparing shortlisted cars and dealer offers before choosing what to test-drive or buy;
- a household trying to understand and respond to an abnormal utility bill;
- a person who wants an agent to do the comparison work without silently making purchases, bookings, or commitments.

## Core jobs

1. Turn an unstructured question and supporting documents into a visible decision case.
2. Select the appropriate Decision Pack without requiring the user to understand internal agent configuration.
3. Investigate unresolved questions using the right skill and specialist at the right time.
4. Show what is known, what is inferred, what conflicts, and what remains unknown.
5. Let the user change criteria or focus by selecting evidence in the web page and speaking to ChatGPT.
6. Produce a reviewable recommendation and preserve human authority over the decision.

## Primary experience

The user opens a public Pax URL in ChatGPT's in-app browser. The page contains a seeded demo launcher and the active case workspace. The user can interact in either direction:

- Human to page: select a claim, change a criterion, expand a source, request another investigation, approve or reject a proposal.
- Human to ChatGPT: ask why the recommendation changed, tell the agent to ignore a line item, or request a different comparison.
- ChatGPT to page: discover and invoke WebMCP tools that call the same command layer as the visible controls.
- Runtime to page: stream truthful case and activity events for routing, skill activation, specialist execution, tools, steering, evidence, readiness, and proposals as they happen.

The page must make agent activity legible without requiring users to read chain-of-thought. It displays actions, inputs, outputs, evidence, and policy decisions, never private reasoning traces. A command shows accepted/queued state only after the service returns its receipt; every later progress state is driven by an actual streamed event.

## Real-time experience contract

The normal workspace behaves as a live case board rather than a request/response form:

1. A visible control or WebMCP callback sends the same typed command.
2. The service returns `commandId`, `caseId`, accepted sequence, and `runId` when work begins.
3. The initiating control becomes correlated queued/active state without blocking the rest of the case.
4. The page streams specialist, skill, tool, steering, evidence, obligation, and recommendation events.
5. Each public activity item can open the exact correlated Runtime Inspector event.
6. Canonical snapshots update only from committed case events.
7. Disconnect preserves the last valid state, visibly reconnects, replays from `Last-Event-ID`, and falls back to snapshot polling when necessary.

At minimum, the demos visibly pass through queued, investigating, tool-active, evidence-arrived, guided or waiting, recommendation-recomputed, and completed states. Loading copy or timers cannot fabricate an event that did not occur.

## Workspace layout

The responsive page contains seven regions in this order:

1. **Case header** — title, Decision Pack badge, pack-selection explanation, live connection/run status, reset-demo action.
2. **Current focus** — the obligation being investigated, why it is next, active skill, and active specialist.
3. **Readiness** — required obligations grouped by satisfied, active, blocked, accepted uncertainty, and open.
4. **Evidence and comparison** — source-linked claims, conflicts, stale state, option scores, the user's active selection, and pack-defined or case-defined attributes.
5. **Activity** — a chronological event ledger including tool calls, skill changes, steering, evidence writes, budget decisions, and pauses.
6. **Recommendation and approval** — proposed outcome, rationale, confidence inputs, limitations, and explicit approve/revise/reject controls.
7. **Runtime Inspector** — a developer-facing drill-in for the active run, opened from the case header and rendered as a contained right-pane route rather than competing with the normal decision UI.

The canonical viewport is ChatGPT's right pane. At widths from 390 through 480 pixels, sections stack vertically, the current focus remains immediately below the header, primary actions remain visible, and no region introduces horizontal page scrolling. At desktop width, readiness and activity may appear beside the evidence area. The implementation must not depend on a three-column viewport or full-page navigation chrome.

## Required visible states

Every region must have explicit UI for:

- initial and empty;
- loading;
- partial evidence;
- active investigation;
- guided retry;
- waiting for confirmation;
- blocked;
- stale evidence;
- ready for review;
- approved, rejected, and revision requested;
- recoverable error;
- unsupported WebMCP host.
- reconnecting, replaying, and polling fallback.

Errors must preserve the last valid case state. A failed model or tool call becomes an event and a blocked or retryable obligation; it must not blank the workspace.

## Demo launcher

The initial page presents exactly two options:

- **Choose our next car** — starts the Car Purchase fixture and permits editing the seeded household priorities and candidates.
- **Investigate my energy bill** — starts the Home Energy Guardian fixture.

Starting a demo resets its case to the checked-in fixture and generates a fresh case ID. It does not depend on a previous demo run.

## User-facing terminology

| Internal term | UI label |
| --- | --- |
| `DecisionPackManifest` / `CompiledDecisionPack` | Decision Pack |
| Obligation | Question to resolve |
| Convergence | Ready for decision |
| Intervention | Guidance or safeguard |
| `Guide` | Agent redirected |
| `Confirm` | Your approval needed |
| `Deny` | Action blocked |
| Evidence ledger | Evidence |
| Agent graph | Investigation team |

## Success criteria

The hackathon build succeeds when:

- a judge can understand the product within 20 seconds of seeing the workspace;
- both demo scenarios complete from reset using fixture-backed tools;
- ChatGPT can inspect and update the active case through WebMCP without simulated clicking;
- changing one user criterion visibly changes the engine's next move or recommendation;
- adding one concern absent from the installed pack creates a visible typed case extension, derives an evidence question when necessary, and affects the run plan without recompiling the pack;
- at least one skill activation, specialist change, guided retry, evidence conflict, readiness transition, and human approval boundary is visible during the demos;
- the user sees real queued, running, tool, evidence, steering, and completion events without refreshing the page;
- a judge can open the Runtime Inspector and connect a recommendation change to the skills, handoffs, tools, interventions, sources, state diffs, tokens, and latency that produced it;
- every displayed claim links to a source fixture and every automated action links to a runtime event;
- a full automated release gate verifies both scenarios end to end;
- the deployed Strands service passes AgentCore's `/ping` and `/invocations` protocol checks.

## Explicit scope cuts

The following do not ship in the hackathon version:

- accounts, authentication, teams, or multi-user collaboration;
- arbitrary file uploads beyond the provided demo fixtures; users may manually enter up to five car candidates and paste structured listing or offer details;
- OCR or general document ingestion;
- automated vehicle marketplace scraping, utility accounts, email, calendar, dealer contact, purchasing, financing applications, or scheduling;
- autonomous final decisions;
- a graphical Pack Studio, pack marketplace, runtime self-modification, or pack composition; a local conversational `pack-authoring` skill and CLI are included;
- unrestricted browser automation;
- general-purpose chat embedded in Pax;
- a mobile application;
- long-term memory across unrelated cases;
- claims that Pax provides financial, legal, automotive, energy, or professional advice.

The demos may include optional live research, but their required path uses deterministic local tools. The UI labels the scenarios as illustrative decision support.
