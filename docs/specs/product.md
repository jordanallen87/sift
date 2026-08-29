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

**Answer-first, everything else one tap away** (ADR 0002; before this decision the page was a single undifferentiated stack of eight regions requiring a full scroll to reach the recommendation on every case — a real usability defect the project owner identified directly against the live product). The responsive page contains these regions in this order:

1. **Case header** — title, Decision Pack badge, pack-selection explanation, live connection/run status, reset-demo action.
2. **What Pax is doing** — the obligation being investigated, why it is next, active skill, active specialist, the manual "Request investigation" control, and live run status. Always visible, never collapsible — it is both the primary manual trigger and the live-progress readout.
3. **Our pick** — the recommendation (proposed outcome, rationale, facts, hypotheses, limitations, sources) and the human decision controls (approve/revise/reject), grouped as one visually cohesive hero directly below "What Pax is doing." Always visible, never collapsible. This is deliberately the first substantial content the user reaches: what Pax currently thinks, and what the user needs to do about it.
4. **Compare the options** — the side-by-side option comparison table and the option editor, collapsed by default into a disclosure row whose closed summary shows a live option count.
5. **What Pax found** — source-linked claims, conflicts, and stale state, collapsed by default into a disclosure row whose closed summary shows a live evidence count.
6. **Still checking** — required obligations grouped by satisfied, active, blocked, accepted uncertainty, and open, collapsed by default into a disclosure row whose closed summary shows a live count of what remains unresolved.
7. **Pax's work so far** — a chronological event ledger including tool calls, skill changes, steering, evidence writes, budget decisions, and pauses, collapsed by default into a disclosure row whose closed summary shows a live event count and a pulsing indicator while work is genuinely in progress.
8. **Add something Pax should check** — the case-extension proposal form, collapsed by default into a disclosure row, with one exception: it renders open by default exactly when an agent-proposed case extension is awaiting human confirmation, since that is itself a state requiring the user's attention rather than passive information.
9. **Runtime Inspector** — a developer-facing drill-in for the active run, opened from the case header and rendered as a contained right-pane route rather than competing with the normal decision UI.

Regions 4 through 8 are disclosure rows: closed by default, opened by a tap on their summary, and never hide their live state — a closed row's summary always carries an accurate, currently-true count or status, so nothing genuinely new or actionable is invisible without opening it. This preserves the real-time contract above (every region still renders only from actual committed events/snapshots) while keeping the page short: a first-time, non-technical user reaches Pax's current answer and the approve/reject controls without scrolling past readiness, evidence, or activity detail they did not ask to see yet.

The canonical viewport is ChatGPT's right pane. At widths from 390 through 480 pixels, regions stack vertically, "What Pax is doing" and "Our pick" remain immediately below the header, primary actions remain visible without scrolling, and no region introduces horizontal page scrolling. At desktop width, the same single-column order and disclosure behavior apply — the implementation must not depend on a three-column viewport or full-page navigation chrome.

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

`docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md` (ADR 0003) changed this section: the launcher's job is no longer only to start one of two fixtures — it is the front door into two genuinely different ways of using Pax.

The launcher presents one primary action above a visually secondary, grouped pair of example cards:

- **Compare vehicles** (primary) — opens the vehicle catalog and shortlist flow (see "Vehicle catalog and normal case creation" below). This is a normal product action, not a demo: it creates a fresh, empty `car-purchase` case (`startCase`) and lets the user add real vehicles to it themselves.
- **Or try a finished example** (secondary group heading), containing the two pre-existing demo cards, copy and behavior completely unchanged:
  - **Choose our next car** — starts the checked-in deterministic Car Purchase fixture and permits editing the seeded household priorities and candidates.
  - **Investigate my energy bill** — starts the Home Energy Guardian fixture.

Starting either example resets its case to the checked-in fixture and generates a fresh case ID; it does not depend on a previous demo run. Both example cards keep their pre-existing `data-testid`s, copy, and `startDemo` command wiring exactly as they were — this ADR is additive to the launcher (a new primary action, a new group heading, and visual demotion of the pre-existing pair), not a rewrite of the demo path.

## Vehicle catalog and normal case creation

ADR 0003's core product change: **Pax is useful as a normal vehicle-comparison website before ChatGPT/WebMCP is involved.** A user reaching "Compare vehicles" can:

1. Browse/search a bundled catalog of real published vehicle specifications (year, make, model, trim, body style, drivetrain, powertrain, combined fuel economy) — no network access required, no live pricing or dealer data.
2. Add up to five vehicles to a shortlist, removing or replacing any before committing.
3. Start a real, persisted `car-purchase` case from that shortlist (`startCase`, then one `upsertOption` per selected vehicle — the exact same command visible controls and WebMCP callbacks already share). The resulting case is pinned to the `car-purchase` Decision Pack's ID/version/compiled hash exactly like a demo case.
4. Continue in the normal case workspace: compare candidates, add listing-specific facts (price, mileage, dealer, listing URL) via the existing `OptionEditor`, change criteria, add a custom concern, submit their own sources, and set evidence dispositions — every one of these commands works identically on a catalog-built case and a demo case, since none of them are demo-specific.

**Known, disclosed limitation:** guided/automated investigation (`requestInvestigation`) currently runs only against the deterministic Car Purchase example case. A catalog-built case's `requestInvestigation` call fails honestly with a clear explanation rather than crashing or fabricating a plausible-looking recommendation — see ADR 0003 §4. Every other capability above remains fully real and functional on a catalog-built case. Building a genuine, generic investigation engine for arbitrary user-built shortlists is out of scope for this task and is recorded as a known limitation, not silently implied as working.

Catalog data is intentionally a separate, narrower fact class from case data (ADR 0003): a catalog record describes a year/make/model/trim's *published specifications* and is never mutated once a case has copied its known fields onto a candidate entity — later catalog updates never reinterpret an existing case.

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
| Evidence ledger | Evidence, shown under the heading **What Pax found** |
| Agent graph | Investigation team |
| Readiness | **Still checking** |
| Activity ledger | **Pax's work so far** |
| Recommendation | **Our pick** |
| Approval | **Your decision** |
| Option comparison | **Compare the options** |
| Current focus | **What Pax is doing** |
| `VehicleCatalogRecord` | Vehicle |
| Shortlist (pre-case candidate selection) | Your shortlist |
| `startCase` | Compare vehicles |

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
- arbitrary file uploads beyond the provided demo fixtures; users may manually enter up to five car candidates, select them from the bundled vehicle catalog, and paste structured listing or offer details;
- OCR or general document ingestion;
- automated vehicle marketplace scraping, live pricing, VIN-level inventory, utility accounts, email, calendar, dealer contact, purchasing, financing applications, or scheduling — the bundled vehicle catalog (ADR 0003) is a static, offline, bounded snapshot of published specifications, never a live marketplace integration;
- autonomous final decisions;
- a graphical Pack Studio, pack marketplace, runtime self-modification, or pack composition; a local conversational `pack-authoring` skill and CLI are included;
- unrestricted browser automation;
- general-purpose chat embedded in Pax;
- a mobile application;
- long-term memory across unrelated cases;
- claims that Pax provides financial, legal, automotive, energy, or professional advice.

The demos may include optional live research, but their required path uses deterministic local tools. The UI labels the scenarios as illustrative decision support.
