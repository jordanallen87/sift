# Agents for Humans demo video — bid comparison (hero), shot-by-shot

Target: **no longer than 5 minutes.** Beats below sum to exactly 300 seconds; land under it, not on it. A run over five minutes is disqualifying — the rules cap it, not taste.

**Track: Professional Agents.**

## Provenance of every claim in this script

Written 2026-09-07 against a product that was actually driven, not against source alone. Specifically:

- A **real local run** on 2026-09-07: case seeded, `run-1a3bd16d-…`, **394 runtime events**, **88 public activity events**, 4 skill activations, 6 swarm nodes, 5 handoffs, 25 context injections — with all four Strands beats in a single round-1 run.
- The **e2e journey** (`tests/e2e/bid-comparison-journey.spec.ts`), which asserts each beat below at six viewports and holds 36 inspected baseline images.
- The **scenario trajectory** (`tests/scenarios/bid-comparison.scenario.ts`).

Every quoted UI string below was read off a rendered baseline image or the component source, not remembered.

> **You still must rehearse this once in a browser before recording.** The e2e suite proves each beat happens; it does not prove they are *findable on camera in this order* at your window size. Scroll positions in particular are unverified prose here.

> **Start the service with `SIFT_DEMO_PACING_MS=250`.** Without it there is nothing to watch — a scripted model turn returns instantly and the whole six-specialist investigation is over before you can narrate it. Pacing changes nothing but wall-clock: identical events, counts, ordering.

> **Keep the window at 390–480px.** This is a ChatGPT-right-pane product; a maximized desktop window misrepresents it.

---

## The one thing this demo is about

Three bids for the same job. One is $3,500 cheaper. **Is it a better deal, or is it pricing less work?**

Everything else in the video serves that sentence.

---

## Shot list

### Beat 1 — the problem, in a situation everyone has been in (0:00–0:30, 30s)

**On screen:** the launcher. Click the tile reading **"Compare these bids"** — subtitle **"Put subcontractor bids on the same footing before you award one."** The case opens: header **"Bid Comparison"**, a **"LIVE"** pill, and **"3 options"**.

**Narration:**
> "A four-person remodeling contractor has three plumbing bids for the same bathroom. Northgate, eighteen thousand four hundred. Cedar and Sons, fourteen nine — three and a half thousand cheaper. Two Rivers, nineteen two fifty. If you have ever gotten three quotes for anything, you already know the problem: they don't cover the same work, and nobody hands you a version where they do."

---

### Beat 2 — a real Strands Swarm, and two interventions you can see (0:30–1:20, 50s)

Press **"Ask Sift to look into this"**. With pacing on, the **"INVESTIGATION TEAM"** panel fills in live.

**On screen:** six specialists in sequence — scope analyst, price analyst, credential checker, schedule analyst, source challenger, recommendation. Four AgentSkills activate, one per obligation. Two moments to point at as they land:

- **Scope analyst** ends **"Completed · Redirected once"**. That is a real `Guide` intervention: it ran the same scope comparison twice with no new angle, and RetrySteering pushed it to the third bid.
- In the activity stream, **"Action blocked"**. That is a `Deny`: the price analyst reached for the licence registry, a tool this pack grants only to the credential checker.

**Narration:**
> "Six specialists, and the handoffs are the model's decision, not a script. Two things worth watching. The scope analyst got redirected — it was going in circles, and the system steered it. And here, an action was blocked: the price analyst tried to pull licence records, which it isn't allowed to touch. Not because it failed. Because it wasn't permitted."

**Why this matters and is worth the 20 seconds:** a refusal is not an error, and the product says so. There is no failure message anywhere naming that tool — asserted in both the scenario and e2e suites.

---

### Beat 3 — the agent refuses to answer (1:20–2:00, 40s)

**On screen:** in the activity stream, the recommendation draft is **rejected**, then re-attempted. This is a real `GoalLoop` with `maxAttempts: 2` and a callable validator.

**Narration:**
> "Here's the part I actually care about. The first answer it drafted was the obvious one — take the cheap bid. The validator threw it out. Not because it was badly written. Because these three bids aren't on the same scope basis yet, so ranking them at all would have been a lie. Every bid-levelling tool on the market will happily rank an unfair comparison. This one refuses."

**Do not skip or rush this beat.** It is the single most distinctive thing in the submission.

---

### Beat 4 — the arithmetic anyone can follow (2:00–2:45, 45s)

**On screen:** the recommendation hero — **"Sift recommends Northgate Plumbing."** with **"Your decision."** beneath it. Read the rationale on screen; it is on the page in full.

**Narration, following the on-screen text:**
> "Cedar's fourteen-nine is silent on three things the others price. Permits and inspections, twelve hundred. Shower-valve rough-in, twenty-one hundred. Debris haul-away, four hundred. Add them and Cedar is eighteen thousand six hundred — against Northgate's eighteen four. The cheapest bid was the most expensive one. That's the whole job, and you can check the arithmetic yourself."

**Note:** the rationale deliberately contains **no score numerals**. Scores belong to the deterministic core, which renders them beside each bid; prose restating them can only agree or contradict. It once said "0.31" while the card said 24% — see `docs/build-log.md`, 2026-09-07.

---

### Beat 5 — it still won't call two questions closed (2:45–3:15, 30s)

**On screen:** the amber band, **"2 findings need your attention."**, with a **"Review findings"** button. Open it.

**Narration:**
> "It recommended a winner and it still won't mark two of these questions answered. Cedar's scope comparison came back incomplete, and Two Rivers' insurance certificate names a different company than its licence holder. Evidence here is fail-closed — a question with a degraded answer doesn't get to count as settled just because everything else passed."

**This will look on camera like the run didn't finish. It is the opposite, and you must say so.** Two obligations genuinely end `open`: `bid.scope_normalization` and `bid.credential_verification`.

---

### Beat 6 — your priorities, and a constraint that outranks a winning score (3:15–3:55, 40s)

**On screen:** app bar **"Add"** ("Add or adjust") → **"Adjust priorities"**. Raise **warranty term** and **payment risk**, lower **scope-normalized adjusted total**. Save, then **"Ask Sift to look into this"** again.

**Narration:**
> "Say you care less about price and more about warranty and a sane deposit. Change the weights — the ranking is arithmetic the model never touches. And now Two Rivers scores highest of the three. Eighty-one percent, the biggest number on the page. It still doesn't win. Its insurance names TRM Holdings, not Two Rivers Mechanical — and credentials are a hard constraint, not a preference. Look what the product does with it: it doesn't hide it. Third of three, score still showing, and it says 'flagged, not removed — still ranked, and still yours to decide.'"

**Verified live:** northgate 0.5825, cedar 0.2353, tworivers 0.8125 with `violated: ['bid.credentials_valid']`; Two Rivers renders at **"#3 of 3"** showing **"81%"**. The reweight reopens **only** the award recommendation.

**Do the reweight exactly as written.** The fixture's round-2 narration is scripted prose keyed to this weighting. Drag the sliders somewhere else and the words on screen will be describing a different run — the deterministic ranking stays correct, the prose won't match.

---

### Beat 7 — the agent recommends; it never awards (3:55–4:25, 30s)

**On screen:** the pending award proposal. Press **"Confirm what moves forward"** yourself, on camera.

**Narration:**
> "Awarding a contract is real money leaving a real business. So this is gated — a `Confirm` intervention, and the proposal sits pending with no approving actor until a person acts. The agent got to recommend. I'm the one who awards. That boundary is structural, not a setting I could switch off."

---

### Beat 8 — proof it is really Strands (4:25–4:50, 25s)

**On screen:** press **"Inspect run"** to open the dev view. It tails live at 400ms.

**Narration:**
> "And underneath, everything you just watched is real Strands. Three hundred ninety-four runtime events in that first run alone. Six swarm nodes, five handoffs, twenty-five context injections. Every span carries the SDK's own instrumentation scope — which a class you named after Strands cannot produce."

**Backing:** `docs/submissions/agents-for-humans/claim-evidence-matrix.md` maps each capability to its file, its test, and its event count.

---

### Beat 9 — close (4:50–5:00, 10s)

> "Most agents are optimized to finish. This one is optimized to know when it hasn't earned the right to answer yet."

---

## Timing

| Beat | Window | Length |
| --- | --- | --- |
| 1 · The problem | 0:00–0:30 | 30s |
| 2 · Swarm, Guide, Deny | 0:30–1:20 | 50s |
| 3 · GoalLoop refusal | 1:20–2:00 | 40s |
| 4 · The arithmetic | 2:00–2:45 | 45s |
| 5 · Fail-closed findings | 2:45–3:15 | 30s |
| 6 · Reweight, hard constraint | 3:15–3:55 | 40s |
| 7 · Human award | 3:55–4:25 | 30s |
| 8 · Strands proof | 4:25–4:50 | 25s |
| 9 · Close | 4:50–5:00 | 10s |
| | | **300s** |

If you run long, take it from beat 8, not from beats 3 or 6.

## What this script does not claim

- **No background trigger.** Bids arrive because you asked for them. Home Energy Guardian is the pack that opens its own case; if a judge asks about quiet autonomy, show that one. Do not invent a "we noticed your quotes came in" watcher.
- **Unknowns do not block readiness.** Cedar's warranty term is genuinely unknown, is answerable, and is scored as a neutral rather than a zero — but readiness is blocked by degraded evidence, not by the unknown. Corrected in `docs/bid-comparison/strands-feature-map.md`.
- **AgentCore** is only shown if it has actually been deployed with real credentials. Do not fabricate that screen.
