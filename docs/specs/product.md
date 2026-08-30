# Product and Scope Specification

## Product promise

Sift handles the repetitive investigation behind consequential everyday decisions and interrupts the user only when evidence, authority, or preference requires judgment.

The product should feel like a calm case board rather than a chatbot dashboard. The agent works visibly in the background, the person can reshape the investigation from the page or from ChatGPT, and the final decision remains recognizably theirs.

Sift does not compete with the base model on eloquence. It supplies the durable evidence, completion, adaptation, persistence, and authority layer that a one-shot answer lacks. The required product proof is defined in `value-proposition.md`.

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

The user opens a public Sift URL in ChatGPT's in-app browser. The page contains a seeded demo launcher and the active case workspace. The user can interact in either direction:

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

**Status: target architecture (ADR 0004, ADR 0005).** This section specifies the contract the implementation must converge on. It supersedes the nine-region ordered list this section previously specified under ADR 0002 — a list the shipped implementation had already silently drifted from into an unspecced eleven-region stack, which is the regression ADR 0004 exists to close (see that ADR's Context for the measured evidence). Treat every region below as a requirement to build or finish, not as a description of code already known to exist; `docs/build-log.md` records actual implementation status task by task.

**A primary workspace view dominates the page** rather than a stack of independent cards:

1. **Case identity** — a single slim line: decision title and a compact status summary (e.g. "4 vehicles · Comparing · 2 things need attention"). No Decision Pack ID, version, compiled hash, command ID, or other developer identifier appears here. A short domain label may appear if pack presentation metadata supplies one; the pack ID and hash never do.
2. **The answer hero** — the current recommendation and the single next human action, merged into one region directly below case identity. It is one region, not two, specifically so it cannot disagree with itself about the case's current state (ADR 0004 decision 1: today's `ApprovalCard` and `RecommendationCard` can render contradictory summaries of the same case in the same glance). This is deliberately the first substantial content the user reaches. It renders only when there is something to say; see "Empty regions" below.
3. **The primary workspace view** — one of the generic option views (Quick Pick, List, Compare, Board; see "Workspace views" below), selected by `WorkspaceViewState.mode`. This is the main body of the page; every other region is secondary to it.
4. **Secondary decision navigation** — Decision Profile, Questions ("To Check"), and Research/Notes, reached through tabs, drawers, sheets, or contextual sections rather than permanent stacked cards.
5. **Developer/Inspect boundary** — the Runtime Inspector and every raw runtime identifier (`commandId`, `runId`, compiled pack hash, specialist ID, skill ID, the raw chronological activity ledger, E0–E3 evidence-level vocabulary) live behind an explicit entry point (e.g. "Inspect" / "Developer view") and never appear on the consumer surface by default. See "Consumer and developer projections" below.

**Empty regions.** Do not render an empty conceptual region merely because `CaseState` contains a corresponding field (change-set §5). An empty state must be intentional, compact, and attached to the region that owns the concept — never its own full-height card whose entire content is an announcement of its own emptiness. A workspace with no options yet shows one compact prompt to add or find options, not several independently empty cards each reporting that there is nothing to show.

**Above-the-fold is a testable acceptance property, not only a written promise.** At each of the three canonical narrow widths (390, 430, 480), the answer hero's top edge must fall within the first viewport height, measured against the real production build. This exact property was specified once already (ADR 0002) and silently regressed once because nothing tested it (ADR 0004's own account: "a spec sentence alone already failed to hold it"). A Playwright assertion enforcing it is required release evidence — see `testing.md` — not merely a sentence in this document.

At desktop/expanded width, the same primary-view-dominant structure applies, with a genuinely different information architecture where a specific view benefits from one (see "Narrow and expanded modes" below) — never a three-column dashboard or full-page navigation chrome layered onto the narrow design.

### Consumer and developer projections

Change-set §33 requires that the consumer workspace and a developer/inspect surface project from the *same* underlying events — never two independently maintained truth sources. The consumer surface answers "what does this mean for my decision"; the developer surface answers "what exactly did the system do." `apps/web/src/components/activity-labels.ts` is the designated extension point for this mapping (internal event type → consumer copy), not a new mechanism to build. Content that moves off the consumer surface and stays developer-only: `commandId`, `runId`, the compiled pack hash, specialist ID, skill ID, the raw chronological activity ledger, and the E0–E3 evidence-level vocabulary.

### Lifecycle language

The four-stage tracker (Started / Investigating / Pick ready / Decided) is retired. Consumer-facing progress uses task-shaped stages appropriate to the pack and the case's current point in the process — a generic shopping/comparison lifecycle is Find; Shortlist; Compare; Review; Decide, or a compact subset of it. This tracker must not dominate the page once a comparison is active: once inside an active workspace view, the view itself is more informative than a permanent process tracker (change-set §37).

This has a direct contract consequence: **`CaseStatus` is a two-value type, `'draft' | 'decided'`.** The values `investigating`, `waiting`, `ready`, and `failed` are removed from the contract (see `architecture.md`) — no production code path ever assigned them, and the lifecycle vocabulary that would have displayed them is replaced entirely by the task-shaped stages above (ADR 0004 decision 4).

### Current focus ("Currently checking")

Where the workspace shows what is actively being investigated, it must derive from a genuinely populated `activeFocus` value — never render a region whose only possible state is a permanently-true empty placeholder. `activeFocus` remains a real `CaseState` field (see `architecture.md`), but until a production code path writes a non-null value to it, no "currently checking" region renders at all, rather than rendering a card that can only ever show its own absence (ADR 0004 decision 5). Once populated, consumer copy reads like "Currently checking — Whether the Forester's lower price still holds after dealer fees" or "Rechecking — Ride-comfort evidence after your priorities changed" (change-set §39); the underlying obligation, skill, and specialist identifiers remain visible only in the developer view.

## Workspace views

**Status: specified, not yet implemented** (ADR 0005). Four option views exist, each answering a different decision task rather than being cosmetic renderings of the same data (change-set §8):

- **Quick Pick** — a single-option triage view. One option dominates the pane; the user Passes, Maybes, or Shortlists it through accessible buttons (swipe gestures are additive, never gesture-only). Answers "should I keep looking at this one."
- **List** — a compact, information-dense card per option: identity, price, high-value attributes, strengths, concerns, unresolved information, current fit, relevant source-backed findings. Answers "tell me about each option." Not every available field is shown; pack presentation metadata influences which fields are prominent.
- **Compare** — a configurable comparison table. Answers "how do these options differ." Narrow mode is a two-option head-to-head; expanded mode is a multi-column table. Which options and which attribute rows are visible, which rows are pinned, sort order, and filters are all configurable — by the user directly, and through WebMCP by ChatGPT (see `webmcp.md`, PRESENTATION tools). Custom (`custom.*`) fields render as ordinary rows, subtly marked (e.g. a "Custom" badge) as added for this comparison; their raw IDs never reach this surface.
- **Board** — movable status columns (a useful default: Considering; Top choices; Need to verify; Out), configurable where the pack allows. Answers "where does each option currently stand." Moving an option preserves human authority — the model may suggest a move with a stated reason but does not silently eliminate a candidate.

`WorkspaceViewState.mode` selects the active view. `WorkspaceViewState` is a `CaseState` field (see `architecture.md`) that persists through the same `updateSelection()` path as `selectedOptionId`/`activeFocus` — a presentation change, and structurally incapable of invalidating a recommendation because that path never reaches the invalidation code (ADR 0005 decision 1). This is what makes change-set §54's rule true by construction rather than by convention: "Show only safety and cargo" changes what is visible; it does not change what the user says matters. Changing `criteria` is a separate, decision-mutating command, and the two must never be conflated.

`FindingsSheet`'s existing List/Table/Kanban tabs are evidence-review UI — keyed on evidence disposition, not option identity — and are not a foundation for these four views; they remain unchanged, serving their existing purpose. Only its generic `Sheet`/`Tabs` shell is shared as a UI primitive with the new view components (ADR 0005 decision 3).

### Narrow and expanded modes

**Status: specified, not yet implemented** — no width-detection mechanism exists in the browser app today (ADR 0005 decision 4). Narrow and expanded are two intentional information architectures, not one layout scaled by CSS breakpoint (change-set §7). Responsive behavior changes what information is shown and how, not only how wide it is: at expanded width, Compare may show several option columns; at 390px, a two-option head-to-head may be the more usable design for the identical question. Quick Pick is narrow-native and is not expected to need a materially different expanded layout.

### Decision Profile

**Status: specified, not yet implemented.** A first-class consumer concept aggregating "what are we actually looking for": budget/constraints, usage context, must-haves, preferences, priority ordering, and open clarifying questions — projected from the existing criteria/attribute/case-extension model rather than a competing second source of truth (change-set §15). Priorities are shown to ordinary users as simplified levels (e.g. Very important / Important / Somewhat important) rather than raw numeric weights by default; exact weights remain available in an advanced view and are always preserved internally regardless of display (change-set §42). ChatGPT can read the Decision Profile and the case's missing/suggested-question state through WebMCP (see `webmcp.md`).

### Questions ("To Check")

The consumer projection of obligations. Each unresolved obligation is shown as a plain-language question (e.g. "CR-V dealer price still needs verification"), never as obligation/evidence-level jargon. Focusing a Question informs subsequent case context the same way focusing an option does.

### Research and Notes

**Status: specified, not yet implemented as first-class UI**; the underlying source/evidence storage this builds on exists today. Research (submitted sources, claims, and their provenance) is shown per-option as a Research summary → Findings → Sources hierarchy: source title, publisher, relevance, freshness, and disposition (verified/questioned/conflicted) are consumer-visible; E0–E3 evidence-level vocabulary stays in the developer view unless useful. A `CaseNote` is a lighter-weight, non-evidentiary record — an observation, question, preference, or reminder attached to one or more options — that never automatically becomes evidence and survives reload. Both the user and ChatGPT can add research and notes; attribution is always visible.

### Custom fields are first-class

A case-defined `custom.*` attribute (see `pack-authoring.md`) is a hero product capability here, not an edge case. It renders beside pack-native fields in List, Compare, and Board with a subtle "added for this comparison" indicator, never as a raw ID. Opening a custom field explains why it exists, who added it, what sources support it, and what remains unknown. The model may populate a custom field's value across options, but every populated value preserves provenance, origin, and confidence, and an unsupported subjective value remains explicitly unknown rather than a fabricated inference (change-set §22–§26).

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

`docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md` (ADR 0003) changed this section: the launcher's job is no longer only to start one of two fixtures — it is the front door into two genuinely different ways of using Sift.

The launcher presents one primary action above a visually secondary, grouped pair of example cards:

- **Compare vehicles** (primary) — opens the vehicle catalog and shortlist flow (see "Vehicle catalog and normal case creation" below). This is a normal product action, not a demo: it creates a fresh, empty `car-purchase` case (`startCase`) and lets the user add real vehicles to it themselves.
- **Or try a finished example** (secondary group heading), containing the two pre-existing demo cards, copy and behavior completely unchanged:
  - **Choose our next car** — starts the checked-in deterministic Car Purchase fixture and permits editing the seeded household priorities and candidates.
  - **Investigate my energy bill** — starts the Home Energy Guardian fixture.

Starting either example resets its case to the checked-in fixture and generates a fresh case ID; it does not depend on a previous demo run. Both example cards keep their pre-existing `data-testid`s, copy, and `startDemo` command wiring exactly as they were — this ADR is additive to the launcher (a new primary action, a new group heading, and visual demotion of the pre-existing pair), not a rewrite of the demo path.

## Vehicle catalog and normal case creation

ADR 0003's core product change: **Sift is useful as a normal vehicle-comparison website before ChatGPT/WebMCP is involved.** A user reaching "Compare vehicles" can:

1. Browse/search a bundled catalog of real published vehicle specifications (year, make, model, trim, body style, drivetrain, powertrain, combined fuel economy) — no network access required, no live pricing or dealer data.
2. Add up to five vehicles to a shortlist, removing or replacing any before committing.
3. Start a real, persisted `car-purchase` case from that shortlist (`startCase`, then one `upsertOption` per selected vehicle — the exact same command visible controls and WebMCP callbacks already share). The resulting case is pinned to the `car-purchase` Decision Pack's ID/version/compiled hash exactly like a demo case.
4. Continue in the normal case workspace: compare candidates, add listing-specific facts (price, mileage, dealer, listing URL) via the existing `OptionEditor`, change criteria, add a custom concern, submit their own sources, and set evidence dispositions — every one of these commands works identically on a catalog-built case and a demo case, since none of them are demo-specific.

**Known, disclosed limitation:** guided/automated investigation (`requestInvestigation`) currently runs only against the deterministic Car Purchase example case. A catalog-built case's `requestInvestigation` call fails honestly with a clear explanation rather than crashing or fabricating a plausible-looking recommendation — see ADR 0003 §4. Every other capability above remains fully real and functional on a catalog-built case. Building a genuine, generic investigation engine for arbitrary user-built shortlists is out of scope for this task and is recorded as a known limitation, not silently implied as working.

Catalog data is intentionally a separate, narrower fact class from case data (ADR 0003): a catalog record describes a year/make/model/trim's *published specifications* and is never mutated once a case has copied its known fields onto a candidate entity — later catalog updates never reinterpret an existing case.

## User-facing terminology

Consumer-facing labels are not applied mechanically — choose language that makes sense in context. The guiding rule (change-set §4): consumer UI should explain what something means for the decision, not how Sift implemented it. The table below is illustrative, not exhaustive; the canonical mapping implementation is `apps/web/src/components/activity-labels.ts` (see "Consumer and developer projections" above).

| Internal term | UI label |
| --- | --- |
| `DecisionPackManifest` / `CompiledDecisionPack` | Decision Pack — developer view only; the consumer surface shows at most a short domain label |
| Case | Comparison / Decision |
| Obligation | Question to resolve, grouped under **To Check** |
| Convergence | Ready for decision |
| Intervention | Guidance or safeguard — developer view only |
| `Guide` | Agent redirected / Rechecking another way |
| `Confirm` | Your approval needed |
| `Deny` | Action blocked |
| Evidence ledger | Research, shown per-option as Research summary → Findings → Sources |
| Claim | Finding |
| Agent graph | Investigation team — developer view only |
| Readiness | **To Check** |
| Raw activity ledger (`commandId`, `runId`, tool/skill/specialist IDs) | developer view only |
| `activeFocus`, when genuinely populated | **Currently checking** / **Rechecking** |
| Recommendation | **Current recommendation**, or **Leading option** before readiness is earned — never "Our pick" before then |
| Approval | **Your decision** |
| Accepted uncertainty | Decide without this |
| Case extension / `custom.*` attribute | comparison field, marked "added for this comparison" |
| Decision Profile (criteria + attributes + case extensions, projected) | **Decision Profile** |
| Option comparison view | **Compare** |
| `VehicleCatalogRecord` | Vehicle |
| Shortlist (pre-case candidate selection) | Your shortlist |
| `startCase` | Compare vehicles |
| E0–E3 evidence levels | developer view only |

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
- general-purpose chat embedded in Sift;
- a mobile application;
- long-term memory across unrelated cases;
- claims that Sift provides financial, legal, automotive, energy, or professional advice.

The demos may include optional live research, but their required path uses deterministic local tools. The UI labels the scenarios as illustrative decision support.
