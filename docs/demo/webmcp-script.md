# WebMCP Challenge Video — Shot-by-Shot Script

**Target runtime: strictly under 3:00.** Spine: the timed beat breakdown in
`docs/submissions/webmcp/submission-details.md` § "Required hero demonstration."
Content for each beat is drawn from `docs/specs/demos-and-submission.md`
("Choose Our Next Car scenario" required sequence and "WebMCP demo moments"),
`docs/specs/webmcp.md` (tool catalog), `docs/specs/strands-runtime.md`,
`docs/specs/packs-and-routing.md`, and `docs/specs/product.md` (UI labels).

## Note on illustrative figures

No fixture data files (`household-profile.json`, `candidate-listings.json`,
`dealer-offers.json`, etc.) exist in the repository yet at the time this script
was written. Dollar figures, mileage, and dimension numbers below are
**illustrative placeholders**, chosen only to be internally consistent with the
required plot points in `demos-and-submission.md` (RAV4 initially favored →
teaser-price challenge makes it stale → CR-V becomes favored after
normalization + comfort reweight). Whoever authors the actual seed fixtures
must reconcile these numbers with the real files and update this script before
recording. Every non-numeric claim (candidate IDs, tool names, event names,
UI labels, the two verbatim user lines, the "Draft withheld" copy, the closing
claim) is copied directly from the specs and must not be altered.

## Note on the current workspace layout

The consumer workspace was restructured after this script was first written (`docs/decisions/0004-consumer-workspace-information-architecture.md`, `0005-workspace-view-state-and-option-views.md`). Concretely: the former separate "Our pick" / "Your decision" cards this script's beats reference are now one merged hero region (`RecommendationHero`, which composes the same approve control this script cites, so `data-testid` references below should still resolve, but "scroll to the Approval card" now means "the approval control inside the hero," not a separately-scrolled card); the raw chronological activity ledger is developer-only content reached through the Runtime Inspector rather than a consumer-surface scroll target; and the primary workspace body is now a Quick Pick/List/Compare/Board view switcher rather than a single always-expanded comparison table — §58/§59's "model reconfigures the comparison table" and "Quick Pick shared focus" showcase moments (see `docs/specs/demos-and-submission.md`) are now buildable against real UI and are worth considering as additions to this script. Additionally, Beat 7's "taps **Inspect run** in the Case header" now has a second, more literal option: the case header carries its own small "Developer view" icon control (always available once a case is open, no run required), distinct from the hero's still-present "Inspect run" control this beat originally meant. Either opens the same Runtime Inspector. Re-verify every on-screen position, scroll target, and exact visible copy against the live build immediately before recording rather than trusting the staging directions below verbatim — they were accurate against an earlier layout and have not been re-walked against the current one as of this pass.

## Recording spine

| Beat | Window | Duration |
| --- | --- | --- |
| 1 | 0:00–0:15 | 15s |
| 2 | 0:15–0:35 | 20s |
| 3 | 0:35–1:05 | 30s |
| 4 | 1:05–1:35 | 30s |
| 5 | 1:35–2:05 | 30s |
| 6 | 2:05–2:30 | 25s |
| 7 | 2:30–2:50 | 20s |
| 8 | 2:50–3:00 | 10s |

---

## Beat 1 — 0:00–0:15 — Working product immediately

**On screen:** ChatGPT's in-app browser, right pane already open on the live
Sift URL. The **Case header** shows "Choose Our Next Car," a Decision Pack
badge reading `Decision Pack: car-purchase@1.0.0 #<compiledHash>`, and a green
live-connection indicator. The **Current focus** region shows an active
investigation in progress (e.g., `car.safety_reliability` active, specialist
`safety-reliability-analyst` tagged). The **Evidence and comparison** region
shows four candidate cards; the RAV4 card (`candidate-rav4`) is visibly
highlighted/selected, showing its advertised price (placeholder: **$31,240**)
and current favored-option badge.

**Presenter says:**

> "This is Sift, running live in ChatGPT's right pane. We're choosing our next
> family car, and right now the RAV4 is the favorite — but Sift is still
> actively working the case."

**Must genuinely be happening:**
- A real open SSE connection is already streaming; the Current focus and
  Activity regions are rendering from actual queued/specialist/tool events,
  not a static screenshot (`docs/specs/product.md` "Real-time experience
  contract").
- The case was created from the **Choose our next car** demo-launcher fixture
  reset, generating a fresh case ID (`product.md` "Demo launcher").
- `candidate-rav4` is shown as the currently favored option under the seeded
  lowest-risk/fuel-cost preferences (`demos-and-submission.md` required
  sequence step 4).

**Caption:** none needed — the product itself is the proof. Optional small
lower-third: "Sift — live in ChatGPT's right pane."

---

## Beat 2 — 0:15–0:35 — Shared attention

**On screen:** Presenter taps/confirms the RAV4 selection (or it is already
selected from Beat 1). In the ChatGPT composer, the presenter types or speaks
the exact scripted line. A WebMCP tool-call chip appears in the ChatGPT
transcript: `sift_get_case_context` → response chip showing
`selectedOptionId: candidate-rav4`. Immediately after, a second chip appears:
`sift_request_investigation`. On the page, the Activity ledger appends a new
queued/active entry with a `runId` correlation tag, and Current focus updates
to reflect deal/fit obligations being revisited.

**Presenter says (as the user, to ChatGPT):**

> "I love this one. What would have to be true for it to beat our current
> favorite?"

**Presenter voiceover (brief, over the tool-call chips):**

> "ChatGPT reads Sift's live case context — the exact candidate I selected —
> and asks Sift to dig into its deal and fit questions."

**Must genuinely be happening:**
- `sift_get_case_context` is called with an empty input object and returns the
  active case summary including `selectedOptionId` matching the page's actual
  selection (`webmcp.md` § `sift_get_case_context`; required final assertion
  "the selected candidate in WebMCP context matches the page selection").
- `sift_request_investigation` is called immediately after, per the required
  sequence step 6 ("ChatGPT calls `sift_get_case_context` ... then requests
  focused deal investigation") and "WebMCP demo moments" step 3 (ChatGPT
  "calls `sift_request_investigation` for its deal/fit obligations"). This call
  must be visible on screen even though the submission-details.md beat text
  only names `sift_get_case_context` — see the reconciliation note at the
  bottom of this file.
- The tool result envelope includes a real `commandId`/`runId`/`caseId`, and
  the page's Activity ledger reflects that same `runId` (`webmcp.md` "Tool
  result envelope").

**Caption:** small overlay of the two call names as they fire:
`WebMCP: sift_get_case_context → selectedOptionId: candidate-rav4`
`WebMCP: sift_request_investigation → runId issued`

---

## Beat 3 — 0:35–1:05 — Unanticipated concern

This beat carries two distinct spoken asks, two distinct WebMCP call
sequences, and two distinct UI updates. Treat it as two tight sub-beats inside
the 30-second window rather than one atomic moment (see reconciliation note).

### Sub-beat 3a — 0:35–0:50 (comfort reweight)

**On screen:** The **Evidence and comparison** region's criteria list is
visible. A `sift_update_criteria` chip fires with a `reweight` operation. The
criteria list animates: "Driving comfort" weight rises, "Fuel economy"
weight falls. The `car.household_fit` "Question to resolve" card, previously
satisfied, reopens with a status change visible in the Readiness region.

**Presenter says (as the user):**

> "Actually, driving comfort matters more to us than fuel economy."

**Presenter voiceover:**

> "Sift reweights that live and immediately reopens the household-fit
> question — it won't guess at comfort."

**Must genuinely be happening:**
- `sift_update_criteria` is called with an `{ op: 'reweight', criterionId, weight }`
  operation (`webmcp.md` § `sift_update_criteria`).
- The update durably invalidates the comparison and recommendation and revises
  the run plan (`webmcp.md` "Effect: durable update plus deterministic
  invalidation"). Invalidation alone starts no engine run — the recommendation
  chip reads "Stale — needs investigation" until a human or a tool calls
  `sift_request_investigation`, and the script must not claim otherwise.
- The `car.household_fit` obligation (required obligation in
  `packs-and-routing.md`) visibly reopens rather than silently updating a
  score.

### Sub-beat 3b — 0:50–1:05 (dog crate custom attribute)

**On screen:** A new evidence card animates in: "Dog crate fit (custom)" with
status `Unknown`, plus a fresh "Question to resolve" card. The Decision Pack
badge in the Case header is briefly highlighted to show the compiled hash
string is **unchanged** before and after this addition.

**Presenter says (as the user):**

> "We also need two dog crates to fit behind the second row without folding
> the seats."

**Presenter voiceover:**

> "That field doesn't exist in this pack. ChatGPT defines it live — Sift adds
> the concern, opens a question for it, and the pack hash stays identical."

**Must genuinely be happening:**
- `sift_define_case_attribute` is called with
  `definition.id: "custom.dog_crate_fit"`, a `valueType`, `evidenceExpectation`,
  `comparison`, and `reason` (`webmcp.md` § `sift_define_case_attribute`); origin
  is `user` because it was made in direct response to the user's explicit
  request.
- A subsequent `sift_update_criteria` `add` operation ties a criterion to that
  attribute.
- The core derives a case-specific obligation from the pack's
  `car.user_concern` template (`packs-and-routing.md` § Extensions), which
  appears on screen as a new "Question to resolve" card without a page
  refresh.
- The compiled pack hash is provably unchanged — same string on screen before
  and after (required final assertion: "`custom.dog_crate_fit` persists as a
  typed case extension, creates a case obligation, and does not change the
  compiled pack hash").

**Caption:**
`custom.dog_crate_fit created — Decision Pack hash unchanged`
`New question to resolve: dog crate fit`

---

## Beat 4 — 1:05–1:35 — Cross-agent steering

**On screen:** The **Activity** ledger scrolls live with new entries appearing
in real time (no refresh): `Skill activated: household-fit`, `Specialist
invoked: household-fit-analyst`, a `source-challenger` entry examining the
RAV4 dealer offer, and a recommendation card that flips to a `Stale —
recalculating` badge. Optionally cut to the **Investigation team** region
(the product-facing label for the agent graph) showing the Strands Graph with
the active node path highlighted (deal-analyst / ownership-cost-analyst in
one branch, safety-reliability-analyst / household-fit-analyst in the other,
converging on source-challenger).

**Presenter says:**

> "Watch the investigation team react in real time. Sift reopens deal and fit
> work, activates its household-fit skill, and its source challenger catches
> something: the dealer's advertised teaser price doesn't match its own
> mandatory add-ons and loan terms. The old recommendation is now marked
> stale."

**Must genuinely be happening:**
- A real `skill.activated` event for `household-fit` carrying skill ID,
  obligation ID, agent ID, and reason (`strands-runtime.md` § Skills).
- Real Graph node start/stop events for the deal/ownership-cost and
  safety/household-fit branches converging on `source-challenger`
  (`strands-runtime.md` § Orchestration; `demos-and-submission.md` required
  sequence step 3).
- `source-challenger` flags the RAV4 dealer-offer teaser price as conflicting
  with mandatory add-ons and a longer financing term (required sequence step
  7); this must be visible as the actual `source-challenger` specialist
  appearing in the trajectory (required final assertion: "`source-challenger`
  appears in the trajectory").
- The prior deal score/recommendation is marked stale and stays in history
  rather than being silently overwritten (required final assertion: "the
  stale teaser-price score remains in history").

**Caption:**
`source-challenger: teaser price conflicts with mandatory add-ons + longer term`
`Recommendation: stale`

---

## Beat 5 — 1:35–2:05 — Honest adaptation

**On screen:** The **Evidence and comparison** region shows two new cards:
a sourced fact — "Cargo width behind second row: RAV4 39.8 in / CR-V 39.2 in
— manufacturer spec" (linked source) — and two explicit unknowns —
"Dog crate fit: Unknown, pending test drive" and "Driving comfort: Unknown,
pending test drive" — each rendered as an open "Question to resolve," not a
score. The **Recommendation and approval** region's top card flips from the
RAV4 to the CR-V (`candidate-crv`), with both candidates' advertised and
normalized out-the-door prices shown side by side (placeholders: RAV4
advertised $29,995 / normalized out-the-door $34,150; CR-V advertised
$30,150 / normalized out-the-door $32,400).

**Presenter says:**

> "Sift pulls real cargo dimensions from the spec sheet, but it won't invent
> whether the crates or the seats actually feel right — those become explicit
> test-drive questions instead. Once the real out-the-door prices are
> normalized and comfort is weighted higher, the CR-V takes the lead."

**Must genuinely be happening:**
- The `car.household_fit` obligation carries a sourced E1 claim for cargo
  width with real `sourceIds`.
- `custom.dog_crate_fit` and the driving-comfort criterion remain in an
  explicit unknown/accepted-uncertainty status rather than a fabricated score
  (required final assertion: "a subjective unknown becomes a test-drive
  question rather than an invented score"; `value-proposition.md`
  "Counterfactual update sequence").
- The recommendation's `favoredOptionId` actually changes to `candidate-crv`
  because of deal normalization and the criteria reweight, not a swapped
  string (required final assertion: "the recommendation changes after deal
  normalization and criteria reweighting").
- Advertised and normalized out-the-door prices both remain separately
  visible on screen at the same time (required final assertion).

**Caption:**
`Advertised $29,995 vs. normalized out-the-door $34,150 (RAV4)`
`Test-drive question: dog crate + rear-seat comfort fit`

---

## Beat 6 — 2:05–2:30 — Human boundary

**On screen:** The **Recommendation and approval** region shows: "Proposed
shortlist: CR-V, RAV4 — conditions that could change this: test-drive
comfort, actual crate fit," with visible **Approve / Revise / Reject**
controls (stable `data-testid`s). Presenter briefly shows ChatGPT's available
tools (or narrates) that no approval tool exists — only `sift_request_revision`
is available to it. Presenter then taps **Approve shortlist** directly on the
page.

**Presenter says:**

> "ChatGPT can ask Sift to revise this — but it has no tool to approve it.
> There isn't one. Only I can advance this shortlist, right here in the
> page."

*(tap Approve shortlist)*

**Must genuinely be happening:**
- No WebMCP tool in the registered catalog can approve or bypass the
  shortlist decision — the only human-directed revision tool is
  `sift_request_revision`, which "cannot approve or reject the decision"
  (`webmcp.md` § `sift_request_revision`; required final assertion: "no
  `decision.approved` event has actor `agent`").
- The approval click is a genuine human UI action producing a
  `decision.approved` (or equivalent) event with `actor: human`/`user`
  (`product.md` region 6, "Recommendation and approval").
- This follows Choose Our Next Car's required sequence steps 12–13
  ("Sift proposes advancing the CR-V and one close alternative... The agent
  cannot advance a candidate itself. The user approves the shortlist through
  the visible UI.").

**Caption:**
`Human-only: no WebMCP approval tool exists`
`actor: human — decision.approved`

---

## Beat 7 — 2:30–2:50 — Proof

**On screen:** Presenter taps **Inspect run** in the Case header. The
Runtime Inspector replaces the case body (contained right-pane route, not a
modal). Presenter lands on the **Timeline** view, clicks the
`source-challenger` activity entry, and its exact correlated debug event
opens showing trace/run IDs and a **State** diff (before/after out-the-door
price). Quick cut to a terminal or the `artifacts/verification/latest/`
report showing `pnpm verify:release` status `passed`.

**Presenter says:**

> "Every one of those moments opens into a real trace — this is the exact
> source-challenger event, correlated by run ID, with the state diff that
> made the price go stale. And the full release suite behind this run is
> green."

**Must genuinely be happening:**
- Clicking the public Activity item opens the exact correlated
  `RuntimeDebugEvent` (`debugging-and-observability.md` "Every public event
  with `debugEventId` must resolve to exactly one safe debug event";
  acceptance requirement: "Clicking a visible activity item opens the exact
  correlated debug event").
- The **State** view renders a real `JsonPatchOperation[]` state diff, not
  placeholder text (`debugging-and-observability.md` Runtime Inspector UI,
  view 4 "State").
- `pnpm verify:release` has actually run and `artifacts/verification/latest/report.json`
  shows `status: 'passed'` for the current commit (`testing.md` §
  "Failure artifacts"; `demos-and-submission.md` "Automated submission
  checks").

**Caption:**
`Runtime Inspector — correlated trace event`
`pnpm verify:release: passed`

---

## Beat 8 — 2:50–3:00 — Close

**On screen:** Cut back to the live, working case (not a title card or logo
slide) per the required structure ("Close with WebMCP as a live steering
channel... and end on the working case").

**Presenter says:**

> "Most WebMCP examples let an agent operate a website. Sift lets a website
> mediate collaboration among a human, ChatGPT, and a separate supervised
> agent team."

**Must genuinely be happening:** nothing new — the requirement is simply that
the video ends on the real, live product state, not a static asset.

**Caption:** none required.

---

## Reconciliation notes for the orchestrator

1. **Beat 2 undersells a required tool call.** `docs/submissions/webmcp/submission-details.md`'s
   own beat text for 0:15–0:35 says only "show `sift_get_case_context` read
   the exact selection." But `docs/specs/demos-and-submission.md`'s required
   sequence (step 6) and its "WebMCP demo moments" section (car-buying moment,
   step 3) both specify that ChatGPT calls `sift_get_case_context` and then
   **immediately** calls `sift_request_investigation` for the deal/fit
   obligations in the same turn — and Beat 4 ("cross-agent steering")
   presumes an investigation is already actively running. I folded
   `sift_request_investigation` into Beat 2 so the causal chain into Beat 4 is
   unbroken. Implementation should ensure both calls are visibly chip-able in
   the ChatGPT transcript within that 20-second window, not just the first.

2. **Beat 3's 30-second budget covers two separate WebMCP mutations.**
   `submission-details.md` describes Beat 3 as one moment ("Say that driving
   comfort is now non-negotiable and two dog crates must fit"), but
   `demos-and-submission.md`'s required sequence treats the comfort reweight
   (step 8, a `sift_update_criteria` call) and the dog-crate concern (step 9,
   a `sift_define_case_attribute` + `sift_update_criteria` pair) as two
   distinct, separately-asserted steps, each with its own tool-call sequence
   and its own UI update. I split Beat 3 into two ~15-second sub-beats so
   neither WebMCP call sequence is compressed into an unverifiable blur.
   Flag for build priority: both mutations must independently render a
   visible, distinguishable UI change fast enough to fit in ~15 seconds each
   on the real (non-mocked) event stream.

No other gaps were found between `demos-and-submission.md`'s required
sequence/assertions and the `submission-details.md`/`requirements-checklist.md`
beat and must-show lists for the WebMCP video — the remaining beats map
cleanly.
