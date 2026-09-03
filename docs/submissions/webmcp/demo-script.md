# WebMCP demo video — shot-by-shot recording script

Target: **2:50**, hard failure at **3:00** (OpenAI's stated limit; `scripts/test-submission.ts:496` fails the release at 180s or over). Public audio required. Published to YouTube.

The spine is the six required beats in `docs/specs/demos-and-submission.md` § "WebMCP video — under three minutes." Every quoted on-screen string, control label, and `data-testid` below is copied from the current source, with the file and line recorded in the verification table at the end of this file. Nothing here is remembered or paraphrased.

## Self-honesty banner — read before trusting a single direction

**What this script now assumes, as of 2026-09-03:**

1. **It is written against the current working tree, not against a shipped artifact.** The screenshots in `artifacts/journey/2026-09-02T19-51-29-052Z/webmcp-hero/` and the 14/14 host-acceptance runs in `artifacts/host-acceptance/` predate the most recent workspace repairs. They still prove the WebMCP contract; they no longer show the current layout. Concretely, those screenshots show a `DecisionOrientationShell` on the seeded demo case and the WebMCP status line inside the content column. Neither is true of the current code: the orientation shell is now gated on `snapshot?.discovery !== undefined` (`apps/web/src/app/App.tsx:2299`), and a seeded demo case has no `discovery` (no `mode` in the seed's `case.created` payload, `packages/scenarios/src/seeds.ts:673`), so it does not render. **Deploy the exact commit you intend to submit and rehearse once before recording.**
2. **The pack is named "Vehicle Selection," not "Choose Our Next Car."** The pack id stays `car-purchase`; only the visible name generalised (`packages/packs/src/car-purchase.ts:45`). "Choose our next car" survives only as the demo-launcher card label (`apps/web/src/components/DemoLauncher.tsx:53`).
3. **There is no pack badge and no compiled-hash chip on screen.** The compiled hash is real and pinned on the case, and it provably does not change when a custom concern is added — but that proof lives in the case state and in `artifacts/journey/**/report.json`, not in a rendered component. Every direction that pointed a camera at it has been cut. Do not narrate it.
4. **The Activity ledger is developer-only.** `ActivityTimeline` mounts only inside the Runtime Inspector's Activity tab (`apps/web/src/app/App.tsx:2726`, `apps/web/src/components/RuntimeInspector.tsx:380`). Beat 4 no longer asks you to watch a consumer-facing ledger append; it points at the regions that actually change.
5. **Beat 4's figures — 0.4, 59%, 64%, 94%, 20% — are exact and load-bearing.** They match `artifacts/verification/scenarios/car-purchase/final-snapshot.json` verbatim, and they only reproduce if the three WebMCP mutations in Beat 3 are made **with the exact values written there** (comfort → 25, ownership cost → 15, and a new `custom.dog_crate_fit` criterion at weight 20). Those weights sum to 125, which is why driving comfort reads as 20% and crate fit as 16%. Change a weight and every number in Beat 4 moves. Rehearse Beat 3 and read Beat 4's card before you record.
6. **This is Chrome's WebMCP, not ChatGPT's, unless you have ChatGPT's WebMCP-capable browser and have smoke-tested it.** See "Choosing a host" below. Both routes are honest; only one of them is verifiable from this repository. Do not say "ChatGPT" on camera over a Chrome session.

---

## Before you record

### Choosing a host

`document.modelContext` is the whole submission. It must be a real host, not a simulation.

**Route A — verified from this repository, and the default.** Chrome 152+ launched with WebMCP enabled, driven by a real model over `pnpm webmcp:bridge`.

```
SIFT_HOST_URL=https://pax-hackathon-production.up.railway.app pnpm webmcp:bridge
```

`scripts/webmcp-bridge.ts` is a stdio MCP server that maps MCP `tools/list` onto the page's live `WebMCP.toolsAdded` registrations and MCP `tools/call` onto `WebMCP.invokeTool` in the real browser. Point Claude Code, Codex, or any MCP client at it (config block is in that file's header comment, lines 24–34) and a real model is choosing and sequencing the real tools on the real page. It opens a **visible** Chrome window on a throwaway profile at **430×900** — Sift's canonical right-pane width — with `--enable-features=WebMCP,WebMCPTesting,DevToolsWebMCPSupport` (`scripts/journey/host-session.ts:128-137`). That window is your recording surface. Put the MCP client's transcript beside it.

**Route B — stronger for this competition if you can do it honestly.** ChatGPT's WebMCP-capable in-app browser, opened on the same URL. Nothing in this repository can verify that host, so if you take Route B you must smoke-test it first: open the URL, ask the assistant what tools the page offers, and confirm it lists 26 once a case is open. If it lists three, no case is open yet. If it lists none, the host is not WebMCP-capable — fall back to Route A rather than narrating a call that did not happen.

Do **not** record in a stock Chrome/Firefox/Safari tab. Sift detects the missing API and shows `WebMCP unavailable in this browser — every action is still available here.` (`apps/web/src/components/WebMcpStatus.tsx:68`). That is correct, tested fallback behavior, and it is also proof that no `sift_*` call in this script fired.

### Staging

1. **URL.** `https://pax-hackathon-production.up.railway.app` (`docs/submissions/release-metadata.json:3`).
2. **Window width.** Keep the pane at 430–480px. Below 800px the app bar collapses its controls to icons with tooltips (`apps/web/src/hooks/use-width-mode.ts:51`, `NARROW_MAX_WIDTH_PX = 800`); that is the canonical, intended look and it is what you want on camera.
3. **Fresh case.** On the launcher, click **"Choose our next car"** (`demo-launcher-car-purchase`, `apps/web/src/components/DemoLauncher.tsx:53`). It resets to the checked-in fixture and mints a fresh case id. Do this immediately before recording, not mid-take.
4. **Pre-stage round 1 off camera.** Click **"Ask Sift to look into this"** (`request-investigation`, `apps/web/src/components/RecommendationHero.tsx:172`) once and let it finish before you start recording. Confirm, before rolling, that the hero headline reads **"Leading so far: 2022 Toyota RAV4 XLE Hybrid AWD"**. The organizer's own checklist sanctions removing setup and dead time.
5. **Nothing else is pre-staged.** Every mutation from Beat 2 onward happens live, on camera, through real WebMCP tool calls. That is the entire point of the video.
6. Turn on your OS cursor highlighter. Several beats depend on the viewer seeing that you did *not* click.
7. A real model is non-deterministic. If it does not call the expected tool, nudge it by name ("use `sift_update_criteria` to reweight `pref.driving_comfort` to 25 and `pref.ownership_cost` to 15"). Never narrate a call that did not fire.

### Known, honest limitations this script already works around

- **No visible criteria-reweighting form exists anywhere in `apps/web/src/components`.** Reweighting `pref.driving_comfort` and adding a `custom.dog_crate_fit` criterion are WebMCP-only today. Say this on camera — it is a genuine, positive fact about why WebMCP matters here, not an apology.
- **Defining `custom.dog_crate_fit` does not by itself add a comparison row.** It durably records a confirmed, typed case extension (`origin: 'user'` ⇒ `confirmation: 'confirmed'`, `packages/core/src/extensions.ts:105-107`) and it is what flips the next investigation from round 1 to round 2 (`apps/agent/src/runtime/car-purchase-engine.ts:195-201`). The concern surfaces in the recommendation's limitations and in Decision readiness. **Do not narrate a new row appearing.**
- **The pack badge and compiled hash are not rendered.** Cut, per the banner above.
- **Consumer-facing "Findings" opens a sheet titled "Research."** If you open it, read the title you see; do not call it "Findings" on camera.

---

## Recording spine

| Beat | Window | Duration | Spoken words | What it proves |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:14 | 14s | 35 | Working right-pane product; a real `document.modelContext` host |
| 2 | 0:14–0:40 | 26s | 65 | Shared selection and a ranking the model reads rather than invents |
| 3 | 0:40–1:12 | 32s | 76 | An unanticipated concern added through WebMCP while work is live |
| 4 | 1:12–2:04 | 52s | 106 | Revised shortlist, honest unknown, and Sift disagreeing with its own model |
| 5 | 2:04–2:33 | 29s | 70 | Human-only approval, and one correlated Runtime Inspector event |
| 6 | 2:33–2:50 | 17s | 41 | Close |

**2:50 total, 393 spoken words.** At an unhurried 150 words per minute that is 157 seconds of speech and 13 seconds of deliberate silence — most of it in Beat 4, while the camera rests on the Limitations block. The blockquotes marked **spoken** below are the entire script; nothing else in this file is read aloud. Blockquotes marked **on screen** are text the camera holds on. Reading those out is exactly how a take blows past 3:00.

Do not add lines. If a take runs long, cut in this order: Beat 2's second half, Beat 5's inspector narration, Beat 4's evidence aside. Never cut Beat 4's disagreement.

---

## Beat 1 — the working product, and why this is a WebMCP entry (0:00–0:14, 14s)

*(Required beat 1: "Show the working right-pane car case in the first 15 seconds.")*

**On screen:** the pre-staged case. Three things must be in frame:

- App bar (`workspace-app-bar`): title **"Vehicle Selection"** (`workspace-app-bar-title`), the connection pill reading **Live** — rendered in small caps by `label-caps`, so it reads "LIVE" (`workspace-app-bar-connection-status`, `WorkspaceAppBar.tsx:286`) — and **"4 options"** (`workspace-app-bar-option-count`).
- The hero (`recommendation-hero`), headline **"Leading so far: 2022 Toyota RAV4 XLE Hybrid AWD"** (`workspace-status.ts:220`).
- The footer strip, one line above the bottom edge: **"WebMCP ready — a connected assistant can operate this page."** (`webmcp-status-supported`, `WebMcpStatus.tsx:80`).

Other real regions are also on the page and are fine to have in shot — a findings alert banner above the hero, a "Review findings" button inside it, the deterministic insights panel, the filter bar. Do not narrate them in this beat; there is no time.

**Action:** none. Let the pane sit. Then flick the **Compare** tab (`workspace-view-tab-compare`, `WorkspaceViewSwitcher.tsx:204`) so the four real candidates are on screen — *2022 Toyota RAV4 XLE Hybrid AWD, 2022 Honda CR-V EX-L AWD, 2023 Mazda CX-5 Preferred AWD, 2022 Subaru Outback Premium AWD*.

**Narration (spoken, 35 words):**

> "Sift, live in a browser that speaks WebMCP. Four real crossovers, a supervised agent team already comparing them. That line at the bottom is the whole submission: this page registers twenty-six typed tools through `document.modelContext`."

**Point at:** the **"WebMCP ready"** strip at the bottom, then the **Live** pill.

---

## Beat 2 — shared selection, and a ranking the model reads rather than invents (0:14–0:40, 26s)

*(Required beat 2: "Demonstrate shared selected-option context through `sift_get_case_context`." Car-buying moments 1–3.)*

**Say to the assistant (spoken, 13 words):**

> "Select the RAV4 as my current pick, then tell me why it's ahead."

**What fires:** `sift_focus_option` (`register-sift-tools.ts:430`), then `sift_get_case_context` (`:1323`), then `sift_explain_ranking` (`:985`).

**What changes on screen, with no click of yours:** in the Compare table, the RAV4's column header gains a **"Selected"** label and its focus control flips to `aria-pressed="true"` (`OptionCompareView.tsx:660-667`). That header *is* a real button you could have clicked — so this is a shared control, not screen-scraping.

**Narration (spoken, 52 words) — the sentence to get right:**

> "I didn't touch the page. The assistant selected that car through a tool, and the page moved. And it didn't work the ranking out either — it asked Sift, which computes it deterministically from this household's own weights. Otherwise you get two rankings and no way to tell which one to trust."

**Not spoken, for the write-up only:** `sift_explain_ranking`'s own tool description tells the model that an unknown is not a zero and a disputed measurement is not a settled one — the epistemics live in the tool contract, not in a prompt. There is no time for this on camera.

---

## Beat 3 — a concern the pack never anticipated, added live through WebMCP (0:40–1:12, 32s)

*(Required beat 3: "Add an unanticipated household concern through WebMCP while work is active." Car-buying moments 5–6.)*

Two spoken asks, three tool calls, in this order, with these exact values. **The values are not decorative — Beat 4's figures depend on them.**

**Say to the assistant (spoken, 19 words) — 1 of 2:**

> "Driving comfort matters more to us than fuel economy. Set comfort to twenty-five and ownership cost to fifteen."

**What fires:** `sift_update_criteria` (`register-sift-tools.ts:462`) with two `reweight` operations — `pref.driving_comfort` → 25, `pref.ownership_cost` → 15.

**What changes on screen:** the recommendation's status chip flips to **"Stale — needs investigation"** (`recommendation-card-status`, `RecommendationCard.tsx:87`) and the stale note appears beneath it (`recommendation-card-stale-note`, `RecommendationCard.tsx:224-226`). Let the viewer read it; do not read it aloud.

**Say to the assistant (spoken, 25 words) — 2 of 2:**

> "We also need two dog crates to fit behind the second row without folding the seats. Add that as something that counts, at weight twenty."

**What fires:** `sift_define_case_attribute` (`register-sift-tools.ts:478`) creating `custom.dog_crate_fit`, then `sift_update_criteria` with an `add` operation for a criterion of the same id at **weight 20**.

**Narration (spoken, 32 words):**

> "There is no form on this page for either of those. Reweighting is WebMCP-only. And that dog-crate field doesn't exist in the pack at all — the case grew, the pack didn't fork."

**Do not say:** that a new comparison row appeared. It does not.

**Safe to read aloud now.** This caution used to warn you off the chip, because it claimed Sift "is already recomputing" and nothing was. A criteria change appends `recommendation.invalidated` and revises the run plan (`apps/agent/src/services/run-plan-service.ts:95-125`); it starts no engine run, and nothing recomputes until Beat 4's `sift_request_investigation`. The chip and note now say exactly that — "Stale — needs investigation", and "Sift has not looked into the change yet" — so the screen is telling the truth and you can let it. It also sets up Beat 4: the recomputation is something *you* ask for, on camera.

---

## Beat 4 — round two: revised shortlist, honest unknown, and a system that disagrees with its own model (1:12–2:04, 52s)

*(Required beat 4: "Show the Strands Graph redirect, skill activation, stale recommendation, honest unknown, and revised shortlist.")*

**Say to the assistant (spoken, 11 words):**

> "Look at this again, now that the crate question exists."

**What fires:** `sift_request_investigation` (`register-sift-tools.ts:523`). Because `custom.dog_crate_fit` is now a **confirmed** case extension, the engine runs **round 2** rather than repeating round 1 (`car-purchase-engine.ts:195-201`) — `household-fit-analyst` re-investigates with the new concern, `source-challenger` re-verifies the deal, and the round-1 teaser-price evidence link is **superseded, not deleted** (`car-purchase-engine.ts:653-673`).

**What to point at while it runs** — the **Latest command** panel inside the hero (`live-run-status`, `LiveRunStatus.tsx:150`): its phase chip walks the real sequence and lands on **"Completed"** (`live-run-status-phase`, `LiveRunStatus.tsx:76`), with the summary **"Investigation completed (revised pass)."** (`car-purchase-engine.ts:1028`). That word *revised* is the round-2 proof, on screen, in the product.

**Then hold the frame on the recommendation card and scroll it slowly, top to bottom.** Every line below is **on screen, not spoken** — it is live-generated and matches `artifacts/verification/scenarios/car-purchase/final-snapshot.json` verbatim. Reading it aloud is what blows the three-minute limit; letting the camera rest on it for four or five silent seconds is what makes it credible.

**On screen** — the rationale, which is the model's:

> "Revise the shortlist to 2022 Honda CR-V EX-L AWD, with 2022 Subaru Outback Premium AWD as a close alternative. 2022 Toyota RAV4 XLE Hybrid AWD is disqualified per Dealer written offer (fictional) (true price over the household budget)…"

**On screen** — under **Facts** (`recommendation-card-facts`, `RecommendationCard.tsx:234`), which is Sift's own and deterministic:

> "2022 Honda CR-V EX-L AWD scores 59% against the criteria on this case, measured across 64% of the weight assigned to them."

**On screen** — under **Limitations** (`recommendation-card-limitations`, `RecommendationCard.tsx:283`). Frame all three; they are the beat:

> "Whether both dog crates fit behind the second row remains unverified for every candidate."
>
> "This recommendation favors 2022 Honda CR-V EX-L AWD, but scoring your criteria puts 2022 Subaru Outback Premium AWD ahead (94% to 59%). The reasoning above may account for something the scoring does not — it is worth reading before deciding."
>
> "Driving comfort carries 20% of the weight on this case but is not part of the score: nobody has established this for this option yet, so it is left out of the score rather than counted against it"

**Narration (spoken, 95 words) — this is the beat that wins or loses the submission. Speak it over the scroll, and leave five silent seconds on the Limitations block:**

> "The honest unknown: Sift knows the CR-V's cargo dimensions, and it still will not invent whether two crates fit. That's a test-drive question, not a fabricated score.
>
> And this is what I'd point a judge at. Sift just disagreed with its own model, out loud. The recommendation favours the CR-V. Sift's own deterministic scoring puts the Outback ahead — ninety-four to fifty-nine. It doesn't override the model and it doesn't go along with it. It states the disagreement, names the number, and drops its confidence to nought point four. That's not a hedge. It's a measurement."

**Cut, in order, if the take is running long:** the honest-unknown paragraph. **Never** the disagreement.

**Add back, in order, only if the take is running short:**

1. One extra spoken sentence at the head of the narration above — *"Round two supersedes its own earlier evidence rather than deleting it."* (11 words, ~4s).
2. Silently open the **"Decision readiness"** disclosure (`disclosure-still-checking-summary`, `App.tsx:2543-2545`) and point at **"Accepted uncertainty"** (`ReadinessPanel.tsx:76`), which holds *"Which material safety and reliability differences are supported by traceable sources?"* — an obligation Sift closed as explicitly uncertain rather than answering. No narration; there is no budget for a sentence here.

---

## Beat 5 — human-only approval, and one correlated Runtime Inspector event (2:04–2:33, 29s)

*(Required beat 5: "Show human-only approval and one correlated Runtime Inspector event.")*

**Say to the assistant (spoken, 5 words):**

> "Approve this shortlist for me."

**What happens:** nothing on the page changes. The registered catalog contains no approval tool at all — `SIFT_WEBMCP_TOOL_NAMES` is pinned at 26 and none of them can approve (`apps/web/src/model-context/webmcp-contract.test.ts:303`; `register-sift-tools.ts:551-560` records that `sift_request_revision` deliberately calls `commands.requestRevision` and that `commands.reviewProposal` is never referenced in the file). The `webmcp-hero` journey goes further and calls a made-up `sift_review_proposal` by name through the real host: **refused** (`scripts/journey/journeys/webmcp-hero.ts`, turn `assistant-cannot-approve`).

The assistant can, at most, call `sift_request_revision` — which has no `decision` and no `actor` field, so there is no way to misuse it into an approval even deliberately.

**Narration (spoken, 30 words):**

> "It can't. There is no approval tool in the catalog, and calling one by name is refused. That isn't a rule in a prompt. It's an absence in the API."

**On-screen action:** in the hero, the approval region reads **"Your decision"** (`ApprovalCard.tsx:128`) with a **"Your approval needed"** badge (`:184`). Click **"Choose this"** (`approval-card-approve`, `ApprovalCard.tsx:216`) — its siblings are **"Pass"** (`:230`) and **"Keep researching"** (`:250`).

**What changes:** a rotated **"Approved"** stamp lands (`approval-card-stamp` / `SETTLED_STATUS_META`, `ApprovalCard.tsx:88`), the hero headline flips to **"Decided."** (`workspace-status.ts:156`), and the recommendation chip flips from "Ready for review" to **"Decided"** (`RecommendationCard.tsx:111`).

**Narration (spoken, 13 words):**

> "A human — me — just stamped this case. The agent never can."

**On-screen action:** click the terminal-glyph **Developer view** button in the app bar (`workspace-app-bar-developer-view`, `WorkspaceAppBar.tsx:597`; it is icon-only at every width and carries a "Developer view" tooltip). The Runtime Inspector opens as a sheet titled **"Run details"** (`RuntimeInspector.tsx:331`).

On **Overview** (`runtime-inspector-tab-overview`), point at the real correlation fields: **Case**, **Trace**, **Session**, **Events**, **Errors** (`RuntimeInspector.tsx:463-494`). Then **Activity** (`runtime-inspector-tab-activity`) — this is where the ledger lives now — and click **"Inspect event"** on one entry (`activity-item-inspect-event-…`, `ActivityTimeline.tsx:153-164`) to jump to that exact runtime event on the Timeline.

**Narration (spoken, 22 words):**

> "Every step in that run is a real correlated trace event, and a visible activity item opens the exact one behind it."

---

## Beat 6 — close (2:33–2:50, 17s)

*(Required beat 6: "Close with WebMCP as a live steering channel between the human, ChatGPT, page, and Strands team.")*

**On screen:** back on the case workspace, decided state, full pane visible.

**Narration (spoken, 41 words):**

> "That's WebMCP as a steering channel — between a person, an assistant, this page, and a real supervised agent team underneath it. Same commands, same state, no copies. And the one thing the tools can't do is decide. This is Sift."

---

## Every label, control, and claim verified for this script

Verified against the working tree on 2026-09-03. If any row is false at recording time, fix the row before you fix the take.

A few rows are reference-only rather than staged: the **assistant-narrowing chip**, the **blind-spot review**, and the **findings/research sheet** are all real and reachable, but none of them is on the shot list — the seeded demo case has no `discovery`, so the "what to do next" dock that offers "Check for anything missed" does not render on it at all. They are listed so a future edit can reach for them without re-deriving the labels.

| On screen | Source |
| --- | --- |
| Pack/case name **"Vehicle Selection"** | `packages/packs/src/car-purchase.ts:45` |
| Launcher card **"Choose our next car"** (`demo-launcher-car-purchase`) | `apps/web/src/components/DemoLauncher.tsx:53` |
| Launcher heading **"Start a Sift case"** | `apps/web/src/components/DemoLauncher.tsx:119` |
| App bar title (`workspace-app-bar-title`) | `apps/web/src/components/WorkspaceAppBar.tsx:390` |
| Connection pill **"Live"** (`workspace-app-bar-connection-status`) | `apps/web/src/components/WorkspaceAppBar.tsx:286, 397` |
| **"4 options"** (`workspace-app-bar-option-count`) | `apps/web/src/components/WorkspaceAppBar.tsx:410` |
| Create menu trigger, accessible name **"Add to this case"** (`workspace-app-bar-create-menu`) | `apps/web/src/components/WorkspaceAppBar.tsx:303, 452` |
| Create menu items **"Add option" / "Add a note" / "Add a question"** | `apps/web/src/components/WorkspaceAppBar.tsx:484, 488, 492` |
| **"Add a question"** sheet title | `apps/web/src/app/App.tsx:2706` |
| Inside it: **"Add a concern this pack didn't anticipate"** | `apps/web/src/components/CustomConcernForm.tsx:147` |
| Developer view icon button (`workspace-app-bar-developer-view`) | `apps/web/src/components/WorkspaceAppBar.tsx:597-598` |
| Icon-only collapse below 800px (`NARROW_MAX_WIDTH_PX = 800`) | `apps/web/src/hooks/use-width-mode.ts:51`; `apps/web/src/hooks/width-mode-constants.ts` |
| Hero headline **"Leading so far: {option}"** | `apps/web/src/components/workspace-status.ts:220` |
| Hero headline **"Sift recommends {option}."** + **"Your decision."** | `apps/web/src/components/workspace-status.ts:190, 192` |
| Hero headline **"Decided."** | `apps/web/src/components/workspace-status.ts:156` |
| Button **"Ask Sift to look into this"** (`request-investigation`) | `apps/web/src/components/RecommendationHero.tsx:159, 172` |
| Button **"Inspect run"** (`open-runtime-inspector`) | `apps/web/src/components/RecommendationHero.tsx:205, 211` |
| **"Latest command"** panel (`live-run-status`) | `apps/web/src/components/LiveRunStatus.tsx:145, 150` |
| Phase labels Queued / In progress / Waiting for confirmation / **Completed** / Failed | `apps/web/src/components/LiveRunStatus.tsx:72-77` |
| Run summary **"Investigation completed (revised pass)."** | `apps/agent/src/runtime/car-purchase-engine.ts:1028` |
| Chip **"Ready for review"** / **"Stale — needs investigation"** | `apps/web/src/components/RecommendationCard.tsx:76-87` |
| Chip **"Decided"** on a settled case | `apps/web/src/components/RecommendationCard.tsx:111` |
| Stale note copy | `apps/web/src/components/RecommendationCard.tsx:224-226` |
| Section headings **Facts / Hypotheses / Limitations / Sources** | `apps/web/src/components/RecommendationCard.tsx:239, 264, 286, 305` |
| Approval heading **"Your decision"** | `apps/web/src/components/ApprovalCard.tsx:128` |
| Badge **"Your approval needed"** | `apps/web/src/components/ApprovalCard.tsx:184` |
| Button **"Choose this"** (`approval-card-approve`) | `apps/web/src/components/ApprovalCard.tsx:207, 216` |
| Button **"Pass"** (`approval-card-reject`) | `apps/web/src/components/ApprovalCard.tsx:222, 230` |
| Button **"Keep researching"** (`approval-card-request-revision`) | `apps/web/src/components/ApprovalCard.tsx:234, 250` |
| Stamp **"Approved"** (`approval-card-stamp`) | `apps/web/src/components/ApprovalCard.tsx:88, 157` |
| View tabs **Best Match / List / Compare / Board** (`workspace-view-tab-*`) | `apps/web/src/components/WorkspaceViewSwitcher.tsx:202-206, 290` |
| Compare heading **"Compare the options"** | `apps/web/src/components/OptionCompareView.tsx:567` |
| Compare **"Selected"** column marker + focus control | `apps/web/src/components/OptionCompareView.tsx:660-667` |
| Assistant-narrowing chip **"Assistant narrowed to N vehicles"** | `apps/web/src/components/FilterBar.tsx:179, 258` |
| Disclosure **"Decision readiness"** (`disclosure-still-checking`) | `apps/web/src/app/App.tsx:2543-2545` |
| Readiness heading **"Decision readiness"** (`readiness-panel`) | `apps/web/src/components/ReadinessPanel.tsx:183, 218` |
| Readiness buckets incl. **"Accepted uncertainty"** | `apps/web/src/components/ReadinessPanel.tsx:70-80` |
| Findings sheet title **"Research"** (button says "Findings") | `apps/web/src/components/FindingsSheet.tsx:140`; button `WorkspaceAppBar.tsx:500` |
| Blind-spot sheet title **"Anything missed?"**; dock label **"Check for anything missed"** | `apps/web/src/components/BlindSpotReviewSheet.tsx:112`; `packages/core/src/discovery.ts:519` |
| Footer strip **"WebMCP ready — a connected assistant can operate this page."** | `apps/web/src/components/WebMcpStatus.tsx:80`; mounted `apps/web/src/app/App.tsx:2786` |
| Footer strip **"WebMCP unavailable in this browser — every action is still available here."** | `apps/web/src/components/WebMcpStatus.tsx:68` |
| Inspector sheet title **"Run details"** | `apps/web/src/components/RuntimeInspector.tsx:331` |
| Inspector tabs **Overview / Timeline / Activity** | `apps/web/src/components/RuntimeInspector.tsx:350, 365, 380` |
| Inspector fields Obligation / Case / Trace / Session / Events / Errors | `apps/web/src/components/RuntimeInspector.tsx:463-494` |
| Activity heading **"Sift's work so far"**; **"Inspect run"** / **"Inspect event"** | `apps/web/src/components/ActivityTimeline.tsx:200, 148, 163` |
| 26 registered tools, pinned | `apps/web/src/model-context/webmcp-contract.test.ts:303` |
| `document.modelContext.registerTool` is the real production path | `apps/web/src/model-context/adapter.ts:96, 109` |
| No approval tool exists in the catalog | `apps/web/src/model-context/register-sift-tools.ts:551-560` |
| `origin: 'user'` ⇒ extension confirmed immediately | `packages/core/src/extensions.ts:105-107` |
| Confirmed `custom.dog_crate_fit` ⇒ round 2 | `apps/agent/src/runtime/car-purchase-engine.ts:195-201` |
| Round 2 supersedes (does not delete) round-1 teaser-price evidence | `apps/agent/src/runtime/car-purchase-engine.ts:653-673` |
| A criteria change revises the plan but starts no run | `apps/agent/src/services/run-plan-service.ts:95-125` |
| Beat 4's 0.4 / 59% / 64% / 94% / 20% figures | `artifacts/verification/scenarios/car-purchase/final-snapshot.json` (`recommendation.confidence`, `.facts[0]`, `.limitations`) |
| Final criteria weights 30/15/20/15/25/20 = 125 | same file, `criteria[]`; reweights match `tests/scenarios/car-purchase.scenario.ts:61-62, 97-104` |
| Public URL | `docs/submissions/release-metadata.json:3` |

---

## The evidence to cite in the Devpost write-up (not on camera — there is no time)

`artifacts/host-acceptance/` holds automated real-host acceptance runs against the live Railway deployment in **Chrome 152.0.7977.75** with native `document.modelContext`, driven over Chrome's `WebMCP` CDP domain: **14/14 checks passing** on `2026-09-02T18-26-35-407Z` and `2026-09-02T18-51-03-610Z` (both `"url": "https://pax-hackathon-production.up.railway.app"`, both `"ok": true`), plus a later local 14/14 run. The checks include tool discovery (3 global, 26 once a case exists), schemas reaching the host, a person's click becoming visible to the host (`eventSequence` 12 → 13), a host write rendering in the pane without a reload, a blind write refused by schema validation, reload persistence, re-registration after reload, host reconnect — and **"no approval tool: the catalog exposes no tool that can approve a decision."**

Two limits are written into every `report.json` and must be repeated wherever this evidence is cited: **it is Chrome, not ChatGPT**, and **no model chose anything — the script picked every call.** `docs/submissions/webmcp/host-acceptance.md` carries both verbatim. Do not let the video's narration imply otherwise.

---

## Post-recording checklist

- [ ] Total runtime is under 3:00. `pnpm test:submission` fails the release at 180s or over.
- [ ] Audio is clear and present throughout (hard OpenAI requirement).
- [ ] The recording shows the **real** deployed product — `pax-hackathon-production.up.railway.app` — not `localhost`.
- [ ] Every `sift_*` call narrated actually fired, and the on-screen state changed to match it.
- [ ] Beat 4's spoken figures match the card on screen. If they don't, Beat 3's weights were wrong — reset and re-record, do not re-narrate.
- [ ] The word "ChatGPT" appears only if the host actually was ChatGPT.
- [ ] No claim that a pack badge, compiled hash, or consumer activity ledger is on screen.
- [ ] Upload publicly to YouTube (public or unlisted, never private) and confirm playback in a signed-out incognito window before submitting.
