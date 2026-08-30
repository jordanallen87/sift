# WebMCP demo video — shot-by-shot recording script

Target: **under 3 minutes**, public audio, published to YouTube. This script hits, in order, the six required beats in `docs/specs/demos-and-submission.md` ("WebMCP video — under three minutes") and every "WebMCP demo moment" (car-buying moment) it names. Every quoted UI label, tool name, and on-screen string below was cross-checked against the actual component source and, where noted "(live-verified …)", against the real deployed product on 2026-08-27 using Playwright against `https://pax-hackathon-production.up.railway.app`. Nothing here is invented or paraphrased from memory.

**This script's "(live-verified …)" claims predate the 2026-08-30 workspace redesign (ADR 0004/0005/0006) and are now stale.** The consumer workspace has since been restructured — the former separate "Our pick"/"Your decision" cards are now one merged hero region, and a primary Quick Pick/List/Compare/Board view switcher now exists where a single always-expanded comparison table stood before. Re-run the live verification against the current deployed build before recording; do not trust the specific on-screen positions and card names below without re-checking them. The required beats themselves (from `docs/specs/demos-and-submission.md`) are unchanged and remain the correct spine — only the exact staging directions need a fresh pass. This is also a good candidate script to extend with the §58/§59 showcase moments (model reconfigures the comparison table; Quick Pick shared focus), which are now buildable against real UI and were not previously part of this recorded take.

**Total runtime budget: 3:00.** Beats sum to exactly 180 seconds below; treat that as a ceiling, not a target — a take that lands at 2:40 is safer than one that lands at 2:58.

---

## Before you record

1. **Client requirement — read this first.** `document.modelContext` (WebMCP) is only present in **ChatGPT's WebMCP-capable in-app browser**, or a **Chrome build with the relevant flag/origin trial enabled** (the submission checklist calls this "Chrome 149+ with WebMCP enabled" — confirm the current flag name against OpenAI's own challenge page before recording). Do **not** attempt this recording in a stock Chrome/Firefox/Safari tab. Sift genuinely detects the missing API there and shows a non-blocking `WebMCP unavailable in this browser` notice — this is correct, tested fallback behavior (see `apps/web/src/components/WebMcpStatus.tsx`), but it means none of the `sift_*` tool calls below will fire, and the recording will not be honest. Live-verified: a plain Playwright/Chromium session against the production URL shows exactly this notice.
2. **URL.** Open `https://pax-hackathon-production.up.railway.app` inside the WebMCP-capable browser/ChatGPT in-app browser.
3. **Fresh case.** Click **"Choose our next car"** on the launcher (label copied verbatim from `apps/web/src/components/DemoLauncher.tsx`). This always resets to the checked-in fixture and mints a fresh case ID — do this immediately before recording, not mid-take.
4. **Pre-stage round 1 off camera.** Click the **"Request investigation"** button once (`apps/web/src/app/App.tsx`, `data-testid="request-investigation"`) and let it finish *before you start recording*. Live-verified: this "initial pass" investigation completes in well under a second server-side and a few seconds of wall-clock/UI time; there is no reason to burn any of your 180 seconds waiting for it on camera. Confirm before recording that the **Recommendation** card reads "Ready for review" and favors the RAV4, and that the **Evidence** list contains an item citing `source-dealer-offer-candidate-rav4`. This is explicitly sanctioned by the organizer's own checklist: "remove setup/loading/dead time."
5. **Do not pre-stage anything else.** Everything from candidate selection onward in this script happens live, on camera, through real WebMCP tool calls — that is the entire point of the video.
6. Turn on your operating system's cursor highlighter or click-indicator if you have one; several beats depend on the viewer seeing exactly what you clicked versus what ChatGPT did on its own.
7. ChatGPT's own tool-use behavior is a real, non-deterministic model — it is not part of Sift's deterministic backend. The "say to ChatGPT" lines below are what the required sequence specifies; if ChatGPT doesn't call the expected tool on the first try, you can nudge it explicitly ("use the page's tools to look at the current case" / "use `sift_update_criteria`"). Don't fake a tool call that didn't happen.
8. Keep the browser window narrow (390–480px content column) so the right-pane case reads as the real product, not a desktop dashboard.

**Known, honest limitations of the live product this script works around (do not silently improvise around these on camera — the script below already accounts for them):**

- **Superseded by the redesign, re-verify before recording:** `OptionComparison.tsx` (which had a "Selected" badge with no `onClick`) has since been deleted entirely; `OptionCompareView.tsx` is the current comparison table and its option column header does call `onClick={() => onFocusOption?.(option.id)}` — a click-to-focus control now exists on the visible page. If that still holds at recording time, doing the equivalent selection through ChatGPT instead is still a legitimate, stronger demonstration of "structured tool use rather than mouse automation" (the exact standard `docs/specs/webmcp.md` sets) — just say so honestly rather than implying no visible alternative exists.
- There is likewise no visible criteria-reweighting form anywhere in `apps/web/src/components` — reweighting `pref.driving_comfort` and adding the `custom.dog_crate_fit` criterion are WebMCP-only (`sift_update_criteria`) today. Say this on camera if it's useful; it's a genuine, positive fact about why WebMCP matters here.
- Defining `custom.dog_crate_fit` (`sift_define_case_attribute`) durably records a confirmed, typed case extension immediately — live-verified — but it does **not** by itself add a new comparison-table row or a new Readiness obligation (the row depends on a new `AttributeDefinition`, which this command does not create; live-verified against the deployed API). The new obligation ("Two dog crates fit behind the second row") only appears once the *next* investigation run resolves it. Script beat 4 below is written to show the concern where it actually shows up — the Readiness panel and the recommendation's limitations — not a comparison row that won't appear. Do not narrate a new row appearing.

---

## Shot list

### Beat 1 — working product, first 15 seconds (0:00–0:15)

*(demos-and-submission.md WebMCP-video beat 1: "Show the working right-pane car case in the first 15 seconds.")*

**On screen:** the pre-staged case, already loaded. Case header reads **"Choose Our Next Car"**, pack badge **"Decision Pack: car-purchase@1.0.0"**, connection status **"Live"**. Scroll briefly through the comparison table (four real candidates: *2022 Toyota RAV4 XLE Hybrid AWD*, *2022 Honda CR-V EX-L AWD*, *2023 Mazda CX-5 Preferred AWD*, *2022 Subaru Outback Premium AWD*) and the Recommendation card showing status **"Ready for review"**.

**Narration (spoken):**
> "This is Sift — a real-time decision workspace running live right now. Four real shortlisted crossovers, a live Strands Graph already comparing them, and it's already leaning toward the RAV4."

**Point out:** the pack badge's compiled-hash chip; the "Live" connection pill in the case header.

---

### Beat 2 — shared selection through `sift_get_case_context` (0:15–0:40, 25s)

*(Required beat 2: "Demonstrate shared selected-option context through `sift_get_case_context`." Car-buying moment 1–3.)*

**On-screen action:** switch to the ChatGPT panel next to the page.

**Say to ChatGPT (exact, from demos-and-submission.md):**
> "I love this one. What would have to be true for it to beat our current favorite?"

but first select it — say:
> "Select the RAV4 as my current pick."

**What happens (live):** ChatGPT calls `sift_focus_option` (`apps/web/src/model-context/register-sift-tools.ts` / `docs/specs/webmcp.md` `sift_focus_option`). Point at the comparison table: the RAV4 column header now shows a **"Selected"** badge, live, with no click on the page. Then ChatGPT calls `sift_get_case_context` (webmcp.md: "Returns the active case summary … selected option/evidence …") and answers using `selectedOptionId: "candidate-rav4"` — the exact candidate you just picked.

**Point out on screen:** the already-visible degraded evidence item citing `source-dealer-offer-candidate-rav4` (live-verified text: *"Teaser-price conflict: advertised \$27,995.00 vs. true out-the-door \$33,291.30 (18.92% higher, \$5,296.30 over the advertised price) after a mandatory \$2,394.00 add-on. This exceeds the household budget."*) — narrate that Sift already caught this before you ever asked, and that ChatGPT is reading the *same* case state you're looking at, not a copy.

**Narration:**
> "ChatGPT just called `sift_get_case_context` — it sees exactly the candidate I selected, and it can already see Sift flagged a teaser-price conflict on this deal."

---

### Beat 3 — an unanticipated household concern, live (0:40–1:10, 30s)

*(Required beat 3: "Add an unanticipated household concern through WebMCP while work is active." Sequence steps 8–9; car-buying moment 5–6.)*

**Say to ChatGPT (exact):**
> "Driving comfort matters more to us than fuel economy."

**What happens (live):** ChatGPT calls `sift_update_criteria` (webmcp.md `sift_update_criteria`) with a `reweight` operation. There is no page form for this — it only happens through this call. Point out: the Recommendation card's status badge changes from "Ready for review" to **"Stale — recomputing"**, and its stale-note text appears (*"New evidence or a criteria change has invalidated this recommendation. Sift is recomputing it…"*).

**Say to ChatGPT (exact):**
> "We also need two dog crates to fit behind the second row without folding the seats."

**What happens (live):** this field does not exist anywhere in the installed car-purchase pack. ChatGPT calls `sift_define_case_attribute` (`docs/specs/webmcp.md`) to create `custom.dog_crate_fit` — a typed, case-specific concern, not a pack edit. **On screen:** nothing about the comparison table changes yet (be honest about this — see the "Known, honest limitations" note above); instead scroll to the **"Proposed concern"/"Add a concern this pack didn't anticipate"** area of the page — if you also want a visible-UI proof point, you can note that this exact same command backs the **"Add concern"** button lower on the page, per Sift's rule that visible controls and WebMCP calls always share one implementation.

**Narration:**
> "That field doesn't exist in this pack at all. ChatGPT just defined it live, as a typed case-specific concern — not a page edit, not a hack. Watch what happens when Sift re-investigates with it."

---

### Beat 4 — Graph redirect, stale evidence, honest unknown, revised shortlist (1:10–2:00, 50s)

*(Required beat 4: "Show the Strands Graph redirect, skill activation, stale recommendation, honest unknown, and revised shortlist." Sequence steps 10–12.)*

**Say to ChatGPT:**
> "Go ahead and have Sift look into this."

**What happens (live):** ChatGPT calls `sift_request_investigation` (webmcp.md: "Requests the next bounded engine move…"). Live-verified: this now runs the Graph's **round 2** pass — `household-fit-analyst` re-investigates with the new concern, `source-challenger` re-verifies the deal, and the prior teaser-price evidence link is marked stale while a fresh one appends.

**Point out, in the Activity ledger (real, live labels — `apps/web/src/components/activity-labels.ts`), as they append:**
- **"Skill activated"** — household-fit and deal-analysis skills re-activate.
- **"Specialist started working" / "Specialist finished"** for `household-fit-analyst`, then `source-challenger` — say the name "source-challenger" out loud as it appears in the ledger's summary text ("Graph node \"source-challenger\" started").
- **"Recommendation invalidated"** already fired in beat 3 — now watch **"Recommendation ready for review"** land with a new favorite.

**Point out in the Recommendation card (this is the real, live-generated text — read it, don't paraphrase):**
> "Revise the shortlist to candidate-crv, with candidate-outback as a close alternative. candidate-rav4 is disqualified per source-dealer-offer-candidate-rav4 (true price over the household budget)…"

and its limitations line:
> "Whether both dog crates fit behind the second row remains unverified for every candidate. Driving comfort remains unverified for every candidate."

**Narration:**
> "That's the honest unknown — Sift knows the CR-V's cargo dimensions, but it will not invent whether two dog crates actually fit. That's a test-drive question, not a fabricated score. And look — the stale teaser-price evidence is still right there in the ledger, marked stale, not deleted. Nothing gets erased when Sift changes its mind."

**Optional, if time allows:** scroll the Readiness panel and point at the new obligation **"Two dog crates fit behind the second row"** now present (satisfied at the evidence level Sift was able to reach — not the same as "confirmed it fits").

---

### Beat 5 — human-only approval + one correlated Runtime Inspector event (2:00–2:45, 45s)

*(Required beat 5: "Show human-only approval and one correlated Runtime Inspector event." Sequence step 13.)*

**Say to ChatGPT:**
> "Can you approve this shortlist for me?"

**What happens:** ChatGPT has no approval tool available — `webmcp.md`'s own automated contract requirement states "no final approval tool is registered," and the tool catalog registered in `apps/web/src/model-context/register-sift-tools.ts` has no `reviewProposal`/approve tool at all. Nothing on the page changes. Say this out loud.

**Narration:**
> "It can't. There is no approval tool — on purpose."

**On-screen action:** scroll to the **Approval** card. It reads **"Your approval needed"**. Click **Approve** (`data-testid="approval-card-approve"`) yourself, in the visible page. Point out the resulting stamp — a rotated, double-bordered **"Approved"** badge, and the case header's status pill flipping to **"Decided"** (live-verified).

**Narration:**
> "A human — me — just stamped this case. The agent never can."

**On-screen action:** click **"Inspect run"** (`data-testid="open-runtime-inspector"`, next to Latest command, or on any Activity item that carries a run) to open the Runtime Inspector. Point at the **Overview** tab: real correlation IDs — `case`, `trace`, and the event/error counts (live-verified example: a completed run correlating 240+ real events at 0 errors). Switch to **Timeline**, point at one entry (e.g. a `graph.node_completed` or `context.injected` event) and its `agent:` tag.

**Narration:**
> "Every one of those steps is a real, correlated trace event — not a log line I'm reading off a script."

---

### Beat 6 — close (2:45–3:00, 15s)

*(Required beat 6: "Close with WebMCP as a live steering channel between the human, ChatGPT, page, and Strands team.")*

**On screen:** back on the case workspace, full right pane visible, decided state.

**Narration:**
> "That's WebMCP as a live steering channel — not between a person and a chatbot, but between a person, ChatGPT, this page, and a real supervised Strands team underneath it. Same commands, same state, no copies. This is Sift."

---

## Post-recording checklist

- [ ] Total runtime is under 3:00 (the automated submission checker in `pnpm test:submission` fails the release if it is not, once the file is present).
- [ ] Audio is clear and present throughout (a hard OpenAI requirement).
- [ ] The recording shows the **real** deployed product — `pax-hackathon-production.up.railway.app` — not `localhost`.
- [ ] No beat claims a WebMCP call happened when the on-screen state didn't actually change to match it.
- [ ] Upload publicly to YouTube (unlisted/public, not private) and confirm it plays back in a signed-out/incognito window before submitting.
