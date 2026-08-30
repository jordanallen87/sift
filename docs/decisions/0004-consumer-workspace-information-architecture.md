# ADR 0004: Consumer Workspace Information Architecture

Status: accepted
Date: 2026-08-30

## Context

ADR 0002 specified an answer-first layout precisely to fix a usability defect the project owner
identified directly against the live product: "everything is stacked and its a lot of scrolling to
find things." That decision put the recommendation and the approve action at the top of the page,
directly below the case header, and made every other region a closed-by-default disclosure row
carrying a live summary count, so a first-time user would reach Sift's answer without scrolling
(`docs/decisions/0002-answer-first-workspace-layout.md`, decision items 1-2). `product.md:55-69`
recorded that contract as nine ordered regions and asserted two acceptance properties directly:
"This is deliberately the first substantial content the user reaches" and "primary actions remain
visible without scrolling."

That property has since silently regressed. `docs/audits/2026-08-30-generic-decision-workspace-audit.md`
§1 found the shipped implementation renders **eleven** regions, not nine. Two of them —
`WorkspaceStatusHeader` (a four-stage lifecycle tracker plus a next-step banner) and `WebMcpStatus` —
"appear in no spec and no ADR" (audit §1); a repo-wide search found `WorkspaceStatusHeader`
mentioned only in `docs/build-log.md`, a narrative log, not a contract. Measured against the real
production build at 430px, the page is 2040px tall and "Our pick" begins at roughly y=950 — below
the fold on a 900px pane (audit §1). Reaching the answer now requires scrolling past the case
header, the added tracker, the WebMCP notice, and a "What Pax is doing" card that is structurally
incapable of saying anything (see item 5 below and audit §4). This is the exact defect ADR 0002 was
written to close, reopened by later, unspecced work.

The root cause the audit identifies is process, not a single bad implementation choice: "Two
regions were added to the primary workspace without updating `product.md`'s region list, violating
`CLAUDE.md`'s rule 'update the affected spec before changing acceptance behavior'" (audit §1).
Nothing in the test suite measured whether the answer stayed above the fold, so no gate caught the
regression when it happened. We are honest about this: the property was specified once, correctly,
and lost once, silently, because the spec update and the test that would have enforced it were both
skipped when the tracker and the WebMCP notice were added.

Separately, and now folded into the same layout decision because fixing one without the other would
produce a second incoherent page, `docs/change-sets/2026-08-30-generic-decision-workspace.md`
(§2, §4, §5, §6, §7, §33-§42, §48, §62, §64) redefines what the product is: a generic AI-assisted
decision workspace, not a single-pack shopping tool, whose consumer surface must stop reading as "a
stack of unrelated cards" (change-set §62, §64) and stop leaking internal engine vocabulary
(§4, §35, §48). That change set is this ADR's second, larger input. This ADR documents the
information-architecture decisions taken in response to both problems together: the regressed
above-the-fold contract, and the new consumer/developer split the generic-workspace change set
requires.

Two further audit findings bear directly on what this ADR can honestly claim. First, audit §2 found
eleven consumer regions render a full card/heading unconditionally, regardless of whether they have
anything to say — directly violating change-set §5's rule, "Do not render an empty conceptual region
merely because CaseState contains a corresponding field." Second, audit §4 found two subsystems are
already dead in production while their UI branches still render: `CaseState.activeFocus` is written
only as `null` by every production code path, and four of the six declared `CaseStatus` values are
never assigned by any code path at all. The project owner's direction on the second finding, quoted
verbatim in the change set's supplementary section, is unambiguous: "I dont get what you're saying.
If they arent getting changed then remove them." This ADR applies that direction to both findings
and records the one place it does not mean deletion.

## Decision

**1. The workspace is reorganized so the primary view dominates and the answer is reachable without
scrolling.** The current eleven-region stack (audit §1-§2) is replaced. The recommendation and the
single next action merge into one hero region at the top of the page, immediately below a slim case
identity line. This resolves a direct textual contradiction present in the current UI: `ApprovalCard`
can render "Your decision: No proposal is pending review yet." (`ApprovalCard.tsx:114`, audit §2)
positioned directly beneath a recommendation region that can simultaneously read "Our pick: READY
FOR REVIEW" (`RecommendationCard.tsx:107`, audit §2) — two cards asserting an unreconciled state to
the same reader in the same glance. Collapsing them into one region removes the seam: there is one
place that says what Sift currently thinks and what, if anything, the user needs to do about it,
and it cannot disagree with itself because it is one region, not two.

Case identity — title and live status — compresses to the slim line specified by change-set §6's
Header sketch: a decision title, a compact status summary, and nothing else. Decision Pack id,
version, and compiled hash leave the consumer surface entirely, per change-set §4's terminology
table (`compiled hash → Developer view only`) and §6's explicit instruction: "Do NOT put pack
hashes, IDs, command IDs, or developer metadata here." Today's case header renders none of these
raw identifiers directly, but the disclosure-row architecture around it (`product.md:57` "Decision
Pack badge, pack-selection explanation") is replaced by the slim line; the pack badge becomes, at
most, a short domain label if the pack's presentation metadata supplies one, never the pack id or
hash.

**2. Empty conceptual regions do not render.** Change-set §5 states the rule directly: "Do not
render an empty conceptual region merely because CaseState contains a corresponding field." Audit §2
names eleven current violations, reproduced here as the record of what this decision corrects:

| Region | Empty copy shown today |
|---|---|
| `ApprovalCard.tsx:114` "Your decision" | "No proposal is pending review yet." |
| `RecommendationCard.tsx:107` "Our pick" | "No recommendation yet…" |
| `CaseExtensionReviewCard.tsx:82` "Proposed concern" | "No agent-proposed concern is pending review." |
| `LiveRunStatus.tsx:73` "Latest command" | "No command has been sent yet." |
| `ReadinessPanel.tsx:179` "Still checking" | "No case is open yet…" |
| `ActivityTimeline.tsx:178` "Pax's work so far" | "No case is open yet…" |
| `OptionEditor.tsx:132` | "No candidates entered yet…" |
| `OptionComparison.tsx:105` | "Add at least one candidate…" |
| `FindingsSheet.tsx:144` | "No evidence has been gathered yet." |
| `App.tsx:728` "What Pax is doing" | "Nothing is being actively investigated right now." |
| `EvidenceList.tsx:68` | orphaned — never mounted (see item 3 below and audit §5) |

Going forward, an empty state must be intentional and compact, and it must be attached to the
region that owns the underlying concept rather than rendered as its own full card whose entire
content is an announcement of its own emptiness. Concretely: a workspace with no options yet shows
one compact prompt to add or find options, not a full-height "Compare the options" card, a full-
height "What Sift found" card, and a full-height "Still checking" card each independently reporting
that there is nothing to show. Two of the eleven rows above are worse than merely empty-by-default:
`App.tsx:728`'s "What Pax is doing" card is *structurally* guaranteed to be empty in production,
because nothing ever writes the field it renders from (see item 5). That case is not "sometimes
empty" — it is dead code rendering a permanently true placeholder, and it is retired as a card
outright, not merely given a smaller empty state.

**3. A consumer/developer projection boundary is established.** Change-set §33 requires that the
consumer workspace and a developer/inspect surface project from the *same* underlying events —
"Same underlying event. Two projections. This is important. Avoid creating parallel truth sources."
(§35) — never two independently maintained truth sources. The consumer surface answers "what does
this mean for my decision"; the developer surface answers "what exactly did the system do" (§33).
Content that moves off the consumer surface and becomes developer-only, per §34 and §48's mapping
table: `commandId`, `runId`, the compiled pack hash, specialist id, skill id, the raw chronological
activity ledger (today's "Sift's work so far" / `ActivityTimeline`, which audit §5 already
characterizes as "developer content sitting in the consumer workspace"), and the E0-E3 evidence
level vocabulary.

`apps/web/src/components/activity-labels.ts` is the designated extension point for this boundary
rather than a new mapping layer built from scratch. It already implements exactly this pattern: a
single exhaustive label registry mapping internal `PublicActivityEventType` values to consumer
copy, grounded in `product.md`'s terminology table, with a documented example of the mapping
change-set §48 asks for — `intervention.guided` maps to "Agent redirected" already, cited in the
file's own header comment (`activity-labels.ts:147`, sourced from `product.md`'s "User-facing
terminology" table entry "Guide → Agent redirected"). It also already carries a defensive fallback
so an unrecognized internal value can never leak to the consumer surface as a raw dotted token.
Audit §5 independently reaches the same conclusion: "`activity-labels.ts` — notably this **already
is** the internal→consumer mapping layer §48 asks for." This ADR directs that the file be extended
with the additional mappings the generic workspace needs (research/evidence-conflict language,
question/obligation language, presentation-vs-criterion distinctions per change-set §54), not
replaced with a parallel mechanism.

**4. Lifecycle vocabulary is replaced.** The current four-stage tracker (Started / Investigating /
Pick ready / Decided, rendered by `WorkspaceStatusHeader`, one of the two unspecced regions audit §1
identifies) gives way to task-shaped stages per change-set §37: a generic Find / Shortlist / Compare
/ Review / Decide vocabulary, or a compact subset appropriate to the pack and the case's current
stage. Change-set §37 is explicit that this tracker must not keep dominating the page once a
comparison is active: "Do not make lifecycle visualization dominate the page after onboarding. Once
inside an active comparison, workspace views are more valuable than a giant permanent process
tracker."

This has a direct contract consequence. `CaseStatus` (`packages/contracts/src/case.ts:290-298`)
today declares six values: `draft`, `investigating`, `waiting`, `ready`, `decided`, `failed`, each
with a corresponding UI label in `CaseHeader.tsx:50-57` (`CASE_STATUS_LABEL`, e.g. `investigating:
'Investigating'`, `waiting: 'Waiting for confirmation'`, `ready: 'Ready for decision'`, `failed:
'Recoverable error'`). Audit §4 established, by direct search, that the only status writes anywhere
in the repository set `'draft'` (at case creation) and `'decided'` (on approval, `reducer.ts:194-
203`); `recommendation.ready` does not touch `status` at all. `investigating`, `waiting`, `ready`,
and `failed` are declared and fully labeled but never produced by any code path — which is why the
header badge could read `DRAFT` beside a completed investigation and an earned recommendation. Per
the project owner's direction quoted in the change set's supplementary section — "If they arent
getting changed then remove them" — and because §37 replaces this lifecycle model wholesale with
different vocabulary that has no use for the old enum members, **the four unused `CaseStatus`
values (`investigating`, `waiting`, `ready`, `failed`) are removed from the contract.** `CaseStatus`
becomes a two-value type (`draft`, `decided`), matching what the system has only ever actually
produced.

**5. `activeFocus` is retained but must be genuinely populated; its current dead rendering is
deleted.** Audit §4 established, by direct search, that the only production writes to
`CaseState.activeFocus` are `create-case.ts:70` and `reducer.ts:76`, both setting `null`; the store
layer supports writing a real value (`memory-case-store.ts:169`, `sqlite-case-store.ts:310`) and a
contract test proves the plumbing works (`case-store-contract.ts:361-406`), but no production caller
ever passes one — confirmed against the positive control that `selectedOptionId` *is* genuinely
written at `command-service.ts:495`. The consequence is that `App.tsx:703-727`, which renders the
focused obligation, active skill, and active specialist from `activeFocus`, is unreachable code:
every user has always seen its empty branch, "Nothing is being actively investigated right now."

Unlike `CaseStatus`'s four dead values, `activeFocus` is **not** deleted, because it is not merely
dead — change-set §39 explicitly asks for exactly this capability, in consumer language: "Currently
checking — Whether the Forester's lower price still holds after dealer fees" or "Rechecking — Ride-
comfort evidence after your priorities changed." The store plumbing already exists and is already
tested; what is missing is a real writer, not a subsystem. Audit §4 draws the same distinction and
flags it explicitly rather than resolving it silently, because "remove it" and "make it true"
produce materially different products and §39 is the tiebreaker for this field specifically. What
this ADR deletes is the current rendering at `App.tsx:703-727` and its permanently-true empty
branch. Nothing may render from `activeFocus` again until a real production code path writes a
non-null value to it; until that writer exists, the "currently checking" capability simply does not
appear in the UI, rather than appearing as a card that can only ever show its own absence.

**6. A machine-checked above-the-fold invariant is added.** `product.md` already promised "primary
actions remain visible without scrolling" (`product.md:69`) and that promise regressed silently
because nothing tested it — audit §1's own words: "Nothing in the test suite measures whether the
answer is above the fold, so no gate caught it." This has now happened once already to a property
that was correctly specified the first time (ADR 0002), which is the clearest evidence available
that a written invariant is not sufficient on its own. A Playwright assertion is added verifying
that the recommendation region's top edge falls within the first viewport height at each of the
three canonical narrow widths — 390, 430, and 480 — against the real production build, following
the same measurement audit §1 performed by hand (page height and element y-position at 430px) but
running it on every relevant commit instead of once, manually, after the defect was already
visible. This exists specifically because the property was specified once and lost once; a spec
sentence alone already failed to hold it.

## Consequences

- `product.md:53-70`'s "Workspace layout" region list — the nine ordered regions from ADR 0002 plus
  the two unspecced regions the audit found — must be rewritten entirely to describe the new hero-
  plus-conditional-sections structure, the retired lifecycle tracker, the consumer/developer
  boundary, and the new above-the-fold test requirement. This is the same category of spec update
  ADR 0002 itself required, and the same category of update that was skipped when
  `WorkspaceStatusHeader` and `WebMcpStatus` were added — this time it is done as part of the change
  that needs it, not after.
- Every Playwright visual baseline for both hero journeys changes and must be regenerated, following
  `testing.md`'s existing rule to inspect actual/expected/diff before accepting a new baseline. The
  new above-the-fold assertion is additive to this suite, not a replacement for visual comparison.
- Component unit tests that assert the current unconditional-render behavior or the current literal
  status/lifecycle strings will move. At minimum: any test asserting `CASE_STATUS_LABEL` entries for
  `investigating`, `waiting`, `ready`, or `failed` (`CaseHeader.tsx:50-57`) must be rewritten against
  the two-value contract; any test asserting the empty-copy strings enumerated in Decision item 2
  (e.g. `ApprovalCard.tsx:114`'s "No proposal is pending review yet.", `App.tsx:728`'s "Nothing is
  being actively investigated right now.") must be rewritten against the corresponding region's new
  compact-or-absent empty behavior; and any test asserting raw developer identifiers (`commandId`,
  `runId`, compiled pack hash, specialist id, skill id) render on the consumer surface must move to
  assert they render only in the developer/inspect surface instead. These are deliberate, documented
  behavior changes, not weakened assertions, per the same rule ADR 0002 applied to its own heading-
  text test updates.
- `docs/submissions/webmcp/demo-script.md` and `docs/submissions/agents-for-humans/demo-script.md`
  narrate on-screen labels, scroll positions, and lifecycle-stage copy from the current layout and
  must be rewritten to match, under the same rule ADR 0002 recorded: both scripts already carry a
  hard rule against claiming on-screen state that does not match reality.
- `CaseStatus`'s reduction from six values to two is a contract change (`packages/contracts/src/
  case.ts:290-298`) with call-site impact anywhere the four removed values are referenced, including
  `CaseHeader.tsx:50-57`'s label map and any type-level exhaustiveness checks over `CaseState['status']`.
- This is reversible at the same layer ADR 0002's changes were reversible at: the region composition
  and the `activity-labels.ts` mapping table are the seams, not any child component's internals or
  the underlying event/command model, which this ADR does not touch.
