# Agents for Humans Video — Shot-by-Shot Script

**Target runtime: no longer than 5:00.** Spine: the timed beat breakdown in
`docs/submissions/agents-for-humans/submission-details.md` § "Required hero
demonstration." Content for each beat is drawn from
`docs/specs/demos-and-submission.md` ("Home Energy Guardian scenario"
required sequence), `docs/specs/strands-runtime.md`,
`docs/specs/packs-and-routing.md`, `docs/specs/debugging-and-observability.md`,
and `docs/specs/product.md` (UI labels). `docs/specs/value-proposition.md`
supplies the "premature-conclusion sequence" required visible copy.

## Note on illustrative figures

No fixture data files (`current-bill.json`, `usage-history.json`,
`rate-schedules.json`, `weather-history.json`, `household-events.json`,
`response-options.json`) exist in the repository yet at the time this script
was written. The **42% anomaly** figure is not a placeholder — it is stated
exactly in `demos-and-submission.md`'s seed-artifact description and must be
used verbatim. Every dollar figure, percentage-point breakdown, and event date
below is an **illustrative placeholder** chosen only to be internally
consistent with the required plot (rate and weather together explain less
than half the increase; a newly failing thermostat explains the rest).
Whoever authors the actual seed fixtures must reconcile these numbers with the
real files and update this script before recording. Every non-numeric claim
(obligation IDs, tool/skill/specialist names, event names, UI labels, the
"Draft withheld" copy, the closing claim, the initial instruction) is copied
directly from the specs and must not be altered.

## Note on the current workspace layout

The consumer workspace shell shared by both hero packs was restructured after this script was first written (`docs/decisions/0004-consumer-workspace-information-architecture.md`). This demo does **not** gain the car pack's option-comparison views (Quick Pick/List/Compare/Board) — change-set §55 explicitly keeps the two heroes distinct — but it does inherit the generic regions both packs share: the former separate "Our pick" / "Your decision" cards are now one merged hero region (`RecommendationHero`, which composes the same approval control this script's beats reference, so cited `data-testid`s should still resolve), and the raw chronological activity ledger this script may reference as an on-screen scroll target is now developer-only content reached through the Runtime Inspector rather than a consumer-surface card. Re-verify every on-screen position and scroll target against the live build immediately before recording rather than trusting the staging directions below verbatim.

## Recording spine

| Beat | Window | Duration |
| --- | --- | --- |
| 1 | 0:00–0:20 | 20s |
| 2 | 0:20–0:45 | 25s |
| 3 | 0:45–1:30 | 45s |
| 4 | 1:30–2:05 | 35s |
| 5 | 2:05–2:45 | 40s |
| 6 | 2:45–3:20 | 35s |
| 7 | 3:20–3:50 | 30s |
| 8 | 3:50–4:25 | 35s |
| 9 | 4:25–4:50 | 25s |
| 10 | 4:50–5:00 | 10s |

---

## Beat 1 — 0:00–0:20 — Product and problem

**On screen:** The live, working Sift product — the demo launcher or an idle
Home Energy Guardian workspace, before any anomaly has fired. If shown as
text/notes, the literal initial instruction is visible on screen:

> "Watch my household energy bills. Investigate unusual increases quietly and
> only ask me when there is something worth doing."

**Presenter says:**

> "This is Sift's Home Energy Guardian. I told it to watch my bills quietly
> and only interrupt me when something is actually worth a decision — not to
> make me babysit another dashboard myself."

**Must genuinely be happening:**
- The working product is on screen immediately — no slide deck, no mockup
  (`requirements-checklist.md` "The working product appears immediately
  rather than beginning with slides"; shared checklist "The videos begin with
  the working product rather than slides or setup").
- If the instruction text is shown, it is the literal seed instruction from
  `demos-and-submission.md` § "Home Energy Guardian scenario — Initial
  instruction," not a paraphrase.

**Caption:** the initial instruction, quoted verbatim as above.

---

## Beat 2 — 0:20–0:45 — Background trigger

**On screen:** No dialog, no prompt to the user. The Case header populates
live: a fresh case ID appears, the Decision Pack badge reads
`Decision Pack: home-energy-guardian@1.0.0`. The current bill and baseline
are shown side by side (placeholder: current bill **$312**, normalized
baseline **$220** — a 42% increase). The **Current focus** region shows
`energy.anomaly — Is the current bill materially abnormal?` transitioning
from active to satisfied.

**Presenter says:**

> "No one asked it to. Sift's deterministic watcher caught a bill forty-two
> percent above normal, opened a case on its own, and ran the anomaly check
> straight through to a verified result — without a single question to me."

**Must genuinely be happening:**
- A deterministic watcher creates the case after detecting the 42% anomaly,
  with no preceding human action (`demos-and-submission.md` required sequence
  steps 1–2; required final assertion "no human action is emitted before the
  engine completes rate, weather, and household-event investigation").
- The `energy.anomaly` obligation reaches evidence level **E3** through a
  deterministic baseline calculation, matching its required evidence level in
  `packs-and-routing.md`'s obligation table (required sequence step 3: "The
  anomaly check reaches E3 through deterministic baseline calculation").
- Sift routes to Home Energy Guardian without requiring a human choice
  (required sequence step 2).

**Caption:**
`Bill: $312 vs. $220 baseline — 42% above normal`
`energy.anomaly: E3 — satisfied, no user prompt`

---

## Beat 3 — 0:45–1:30 — Genuine Strands work

**On screen:** The **Activity** ledger streams live, unscripted-looking
entries in order: `Skill activated: rate-plan-analysis` (obligation
`energy.rate_change`) → `Specialist invoked: rate-analyst` → a tariff-lookup
tool call → evidence arriving ("Rate change explains ~8 points of the
increase, E2, source: rate-schedules.json"). Then: `Skill activated:
weather-comparison` → `Specialist invoked: weather-analyst` → a
weather-lookup tool call → evidence arriving ("Weather explains ~15 points of
the increase, E2, source: weather-history.json"). The **Readiness** region's
counts update live as each obligation moves between groups.

**Presenter says:**

> "This is real Strands work, not a canned trace. Its rate-plan-analysis
> skill activates, and the rate analyst pulls the actual tariff schedule —
> accounting for about eight points of the increase. Then weather-comparison
> activates, the weather analyst checks degree-days against eighteen months
> of usage history, and explains another fifteen. That's still less than half
> of forty-two percent — nineteen points remain unexplained. Notice each
> skill only loads its full technique once it's actually activated — that's
> Strands AgentSkills progressive disclosure, not one giant prompt — and on
> every turn, Sift's Context Injector hands the model current evidence and
> remaining budget, not the whole conversation history."

**Must genuinely be happening:**
- Real `skill.activated` events for `rate-plan-analysis` and
  `weather-comparison`, using Strands `AgentSkills` progressive disclosure —
  the agent receives only name/description metadata until the skill is
  activated (`strands-runtime.md` § Skills).
- Real `specialist_invoked` events for `rate-analyst` and `weather-analyst`
  inside the Energy Swarm (`packs-and-routing.md` § "Home Energy Guardian
  Decision Pack" specialists list; `strands-runtime.md` § "Energy Swarm").
- Real fixture tool calls (tariff lookup, weather lookup) carrying source IDs
  and an evidence delta (`debugging-and-observability.md` § "Tools").
- A `context.injected` event with field names and a content hash
  (`strands-runtime.md` § "Context injection").
- The Readiness region's groupings (satisfied / active / blocked / accepted
  uncertainty / open) are driven by actual obligation-status transitions, not
  a timer (`product.md` region 3, "Readiness"; required sequence step 4:
  "Rate and weather analysis explain part but not all of the increase").

**Caption:**
`AgentSkills: rate-plan-analysis → activated` then `weather-comparison → activated`
`Rate: +8 pts. Weather: +15 pts. Unexplained: 19 pts.`

---

## Beat 4 — 1:30–2:05 — Premature answer rejected

**On screen:** A draft recommendation attempt surfaces and is visibly
withheld. Render the exact required copy as a card in the Activity or
Recommendation region:

```
Draft withheld
This answer is plausible, but 3 required questions are still unresolved.
Sift is continuing the investigation before asking you to decide.
```

One of the three listed unresolved questions is visibly
`energy.household_change — Did a household or appliance event plausibly
change consumption?`.

**Presenter says:**

> "At this point a lot of assistants would just answer: monitor it for
> another cycle. Sift's decision-synthesizer actually proposes exactly that —
> and its own GoalLoop validator rejects it. The activity feed shows it
> plainly: draft withheld, three required questions still unresolved,
> including whether anything changed in the house itself. Sift keeps
> investigating instead of guessing."

**Must genuinely be happening:**
- `decision-synthesizer` — its own distinct Strands `Agent` instance carrying
  its own `GoalLoop` (`strands-runtime.md` § "GoalLoop output validation":
  "only one `GoalLoop` is supported per agent... `decision-synthesizer` is
  therefore constructed as its own distinct `Agent`") — actually generates a
  `monitor-one-cycle` draft artifact.
- The GoalLoop's callable `Validator` function genuinely rejects it because
  required obligations (including `energy.household_change`) remain
  unresolved, emitting `goal.validation_failed` with machine-readable reasons
  (`strands-runtime.md`; required sequence step 5: "A plausible early
  `monitor-one-cycle` draft is rejected because household-change evidence is
  unresolved; the UI displays `Draft withheld`").
- The exact required copy string renders on screen verbatim
  (`value-proposition.md` § "Premature-conclusion sequence").
- This is a genuine validator rejection, not a scripted UI state — `maxAttempts`
  is 2, and this is attempt 1.

**Caption:** the exact required copy block, shown as above (this is the
on-screen text, not just narration).

---

## Beat 5 — 2:05–2:45 — Steering and switching

**On screen:** `weather-analyst` is re-invoked again with the same technique
and the same result — no new evidence. On the third consecutive
no-progress call, the Activity ledger shows an **"Agent redirected"** entry
(the UI label for `Guide`) with reason text about no evidence delta after
three attempts. Immediately after, a Swarm handoff animates in the
**Investigation team** region: an arrow from `weather-analyst` to
`home-systems-analyst`, and a new skill activation:
`Skill activated: home-event-correlation`.

**Presenter says:**

> "Weather digs in again — same technique, same result, no new evidence.
> That's three calls with nothing new, and Sift's RetrySteering catches it.
> You'll see it in the feed as 'Agent redirected.' Strands hands off — for
> real, not scripted — from the weather analyst to the home-systems analyst,
> and home-event-correlation activates as its new skill. This is an actual
> Strands Swarm handoff, carrying the obligation, the evidence gap, and the
> reason in a structured payload — not a hardcoded if-statement."

**Must genuinely be happening:**
- `RetrySteering`'s no-progress detector trips — three consecutive
  `weather-analyst` calls producing no new source or claim — and does so
  strictly before the Strands `Swarm`'s own `repetitiveHandoffDetectionWindow`
  safety net would (`strands-runtime.md` § "Retry steering rules" and
  "Energy Swarm": "Sift's own `RetrySteering` no-progress detector... must
  trip strictly before the Swarm's own repetitive-handoff window").
- This emits a real `intervention.guide` event with `handler: 'RetrySteering'`
  (`strands-runtime.md` § "Interventions and steering"), rendered in the UI
  as "Agent redirected" per `product.md`'s terminology table (`Guide` →
  "Agent redirected").
- A real Strands `Swarm` handoff occurs via the built-in structured-output
  routing (`agentId`/`message`/`context` schema), producing a `swarm.handoff`
  event with `from: 'weather-analyst'`, `to: 'home-systems-analyst'`, a
  `reason`, and an `evidenceDelta` (`strands-runtime.md` § "Energy Swarm";
  required sequence step 6: "the Swarm hands off from `weather-analyst` to
  `home-systems-analyst`"; required final assertion: "the trace contains...
  a real Swarm handoff... `Guide`").
- `home-event-correlation` activates as the runtime's chosen next skill,
  reached deliberately rather than by an open-ended question to the user
  (required sequence step 7).

**Caption:**
`Agent redirected — RetrySteering (no evidence gain, 3 attempts)`
`swarm.handoff: weather-analyst → home-systems-analyst`

---

## Beat 6 — 2:45–3:20 — Supported revision

This beat compresses source-challenge, a criteria reweight, and a
GoalLoop-validated recommendation revision. See the reconciliation note at
the bottom of this file for why this is treated as three fast sub-moments
inside one continuous 35-second beat rather than a single cut.

**On screen:** `home-systems-analyst` surfaces a household event: a
thermostat sensor reading persistently cold-biased since a recent date
(placeholder: **"thermostat sensor reporting 4°F cold-biased since [date],
following the last HVAC service call"**), forming a supported HVAC
hypothesis. `source-challenger` corroborates it (evidence level rises to E2
or better). Then, in the **Evidence and comparison** region's criteria
controls, the presenter reweights the response-options criterion live —
sliding/selecting from "lowest immediate cost" to "long-term waste
reduction." The **Recommendation and approval** region's top card flips to
`request-hvac-inspection`, with a small `GoalLoop: passed` indicator (no
`Draft withheld` this time).

**Presenter says:**

> "Home-systems finds it: a thermostat sensor that's been running four
> degrees cold since the furnace's last service call, quietly forcing the
> system to overheat the house. Source-challenger corroborates it before it
> counts. Now I make the one call that's actually mine — I weight long-term
> waste reduction over the cheapest immediate fix — and Sift's recommendation
> flips, this time passing GoalLoop validation."

**Must genuinely be happening:**
- `home-systems-analyst` returns a supported HVAC hypothesis referencing the
  thermostat event as its source (`demos-and-submission.md` required sequence
  step 8: "The thermostat event creates a supported HVAC hypothesis");
  `household-events.json`'s newly-failing-thermostat event is the cited
  source.
- `source-challenger` validates provenance/support before the claim can
  satisfy `energy.household_change` (required sequence step 8: "the source
  challenger checks it").
- A real criteria-reweight command changes the weight of the
  cost/waste-reduction criterion using the same command layer visible
  controls use, invalidating the prior ranking (required sequence step 10:
  "The user or ChatGPT reweights the criterion from lowest immediate cost to
  long-term waste reduction"; required final assertion "criterion reweighting
  invalidates the prior recommendation").
- `decision-synthesizer`'s GoalLoop-validated artifact recommends
  `request-hvac-inspection` and **passes** validation this time (required
  sequence step 11: "The recommendation revises from `monitor-one-cycle` to
  `request-hvac-inspection` and passes GoalLoop validation").

**Caption:**
`household-events.json: thermostat 4°F cold-biased since [date]`
`Criterion reweighted: long-term waste reduction > lowest immediate cost`
`Recommendation: request-hvac-inspection — GoalLoop passed`

---

## Beat 7 — 3:20–3:50 — Human boundary and persistence

**On screen:** Before the inspection proposal is created, the UI shows
**"Your approval needed"** (the UI label for `Confirm`) in a pending state,
plus a small system indicator that a session snapshot was saved. Cut to an
operator action: the runtime process is restarted (or the Railway service is
redeployed) on camera. The page/case reloads to the identical pending
confirmation state — same evidence, same pending proposal, nothing
duplicated. The presenter then clicks **Approve** in the visible
Recommendation and approval region. A proposal object appears; nothing is
scheduled.

**Presenter says:**

> "Before Sift can even propose the inspection, its ConsequenceGuard pauses and
> asks for my confirmation — and it saves a snapshot first. Watch: I restart
> the runtime completely. It comes back, restores from that snapshot, and
> nothing is lost or duplicated. Only then, with my approval right here in
> the page, does the inspection proposal get created. Sift never schedules
> anything."

**Must genuinely be happening:**
- `ConsequenceGuard`'s `beforeToolCall` intervention gates the specific
  `create_inspection_proposal` tool call — `Confirm` is a Strands
  `InterventionAction` valid only on `beforeToolCall`
  (`strands-runtime.md` § "Interventions and steering": "`ConsequenceGuard`
  therefore cannot be a free-floating mid-run checkpoint; it must gate a
  specific tool call... for example... `create_inspection_proposal` in the
  energy pack").
- An immutable Strands session snapshot is created before the human
  confirmation (`strands-runtime.md` § "Sessions and snapshots": "Create an
  immutable snapshot before a human confirmation and after a recommendation
  proposal").
- The runtime genuinely restarts and restores from that snapshot, continuing
  from the same handoff/session position (required sequence step 13: "The
  deterministic test restarts and restores the runtime"; required final
  assertion: "reload produces the same approved proposal and case
  evidence").
- The approval click is a real human action (`actor: human`/`user`); the
  agent cannot create the proposal itself (`ConsequenceGuard` emits `Confirm`
  and saves a session snapshot before an inspection proposal is created" —
  required sequence step 12).
- No scheduling or purchase event exists afterward (required final
  assertion: "no scheduling or purchase event exists"; product scope cut:
  the pack "does not schedule an appointment").

**Caption:**
`Your approval needed — ConsequenceGuard: Confirm`
`Snapshot saved → runtime restarted → restored`
`No scheduling event created`

---

## Beat 8 — 3:50–4:25 — Implementation proof

**On screen:** Presenter opens the Runtime Inspector (`Inspect run` control
in the Case header). On the **Timeline** view, click the
`goal.validation_failed` event from Beat 4 to open its exact correlated
detail. The **State** view shows a real before/after diff; the **Overview**
view shows token usage, latency, and estimated cost. If AgentCore credentials
and a live deployment are actually verified, briefly show the same trace ID
correlating in AgentCore/CloudWatch — otherwise, skip this sub-shot entirely
rather than imply it. Cut to a terminal or file view of
`artifacts/verification/latest/report.json` showing `status: 'passed'`.

**Presenter says:**

> "Everything you just saw is a real correlated trace. Here's the exact
> GoalLoop rejection event, with its state diff, token usage, and latency.
> [Where AWS credentials are configured: 'This same trace ID correlates
> directly to AgentCore and CloudWatch.'] And the whole hero flow you watched
> is backed by an automated release suite — this is that report, green."

**Must genuinely be happening:**
- Clicking the `goal.validation_failed` activity item opens its exact
  correlated `RuntimeDebugEvent`, with `tokenUsage`, `durationMs`, and
  `stateDiff` populated truthfully — not placeholder values
  (`debugging-and-observability.md` Runtime Inspector UI views 1–4;
  acceptance requirement "Clicking a visible activity item opens the exact
  correlated debug event").
- AgentCore/CloudWatch correlation appears **only if actually deployed and
  verified** — `requirements-checklist.md` (Agents for Humans): "AgentCore
  and CloudWatch appear in the video only if the deployment and correlation
  were actually verified." If credentials are unavailable, this sub-shot is
  cut, not faked with placeholder screenshots.
- `pnpm verify:release` has actually run for the current commit and
  `artifacts/verification/latest/report.json` shows `status: 'passed'`
  on screen as a real file/terminal, not composited text.

**Caption:**
`Runtime Inspector — goal.validation_failed, state diff`
`(conditional) AgentCore trace ↔ CloudWatch — verified`
`pnpm verify:release: passed`

---

## Beat 9 — 4:25–4:50 — Platform proof

**On screen:** Quick cut to the Choose Our Next Car case. Show its Decision
Pack badge (`car-purchase@1.0.0`), the Investigation team region rendering
its Strands **Graph** (not a Swarm), and the `custom.dog_crate_fit` attribute
card as proof the same extension mechanism works on a completely different
pack.

**Presenter says:**

> "One more thing — this isn't a one-off script. The same core runs Choose
> Our Next Car, on a real compiled Strands Graph instead of a Swarm, and the
> same typed-extension mechanism lets a household add a concern like
> dog-crate fit without anyone rewriting or republishing the pack."

**Must genuinely be happening:**
- `car-purchase@1.0.0` runs on an actual constructed Strands `Graph` — deal
  and ownership-cost specialists in one branch, safety and household-fit
  specialists in the other, converging on `source-challenger` then
  `decision-synthesizer` (`strands-runtime.md` § "Orchestration";
  `packs-and-routing.md` § "Choose Our Next Car Decision Pack").
- `custom.dog_crate_fit` is shown as a durable case extension that did not
  change the compiled pack hash (Car scenario required final assertion,
  reused here as evidence of the general mechanism).
- This is the same generic core/engine loop as the Energy case, not a second
  parallel implementation (`strands-runtime.md` § "Case-specific run
  planning": "The runtime may change the run plan, skills, and specialists
  without changing the case's installed pack").

**Caption:**
`Same core, different pack: car-purchase@1.0.0 (Strands Graph)`
`custom.* extensions work on any Decision Pack without a republish`

---

## Beat 10 — 4:50–5:00 — Close

**On screen:** Cut back to the live Energy case, in its approved/pending
proposal state.

**Presenter says:**

> "Most agents are optimized to finish. Sift is optimized to know when the
> agent has not earned the right to answer yet."

**Must genuinely be happening:** nothing new — the video ends on the real,
live product state.

**Caption:** none required.

---

## Reconciliation notes for the orchestrator

1. **Beat 6 compresses four distinct required-sequence steps into one 35-second
   window, and the beat text in `submission-details.md` doesn't mention the
   criteria reweight at all.** `demos-and-submission.md`'s Home Energy
   required sequence lists these as separate steps: (8) thermostat evidence
   creates a supported hypothesis and `source-challenger` checks it; (9) Sift
   surfaces one human decision with three bounded options and stated
   remaining uncertainty; (10) the user or ChatGPT reweights the criterion
   from lowest immediate cost to long-term waste reduction; (11) the
   recommendation revises to `request-hvac-inspection` and passes GoalLoop
   validation. `submission-details.md`'s Beat 6 text only says "the
   thermostat event supports the HVAC hypothesis; `source-challenger`
   verifies the claim and the recommendation changes" — it never mentions the
   reweight step, even though "criterion reweighting invalidates the prior
   recommendation" is a required final assertion for this scenario and is
   also explicitly tested via `test:scenario`. I kept the reweight in this
   script as an explicit sub-moment inside Beat 6 so it isn't silently
   dropped from the shot list. I made a judgment call on **how** it happens
   on screen: through the visible right-pane criteria control, not through
   ChatGPT/WebMCP — the AWS video's entire beat spine never mentions ChatGPT
   or WebMCP, and the AWS "Recommended Sift positioning" leads with "quiet
   background investigation... Strands skills," not shared browser control.
   (The WebMCP-flavored version of this same reweight action does appear
   separately, in `demos-and-submission.md`'s "WebMCP demo moments" §
   "Energy moment" — that is a distinct, optional B-roll moment for the
   WebMCP video's own bonus material, not part of the AWS hero video's
   required beats, and is not scripted here.)

2. **Beat 9 ("platform proof") has no corresponding step anywhere in
   `demos-and-submission.md`'s Home Energy Guardian required sequence or
   required final assertions.** It exists only because
   `submission-details.md`'s own beat breakdown includes it (item 9, "Briefly
   show that Car Purchase uses a compiled Graph pack and that a typed case
   concern can adapt a run without rewriting the pack") and because
   `requirements-checklist.md` requires it ("The video briefly connects the
   Energy hero to the reusable Decision Pack architecture without
   distracting from the hero journey"). I built this beat's content directly
   from `packs-and-routing.md`'s "Choose Our Next Car Decision Pack" section
   and `strands-runtime.md`'s Graph description, and reused the
   already-established `custom.dog_crate_fit` fact from the WebMCP hero
   rather than inventing a new example, since `demos-and-submission.md` is
   silent on what this beat should show.

No other gaps were found between `demos-and-submission.md`'s required
sequence/assertions and the `submission-details.md`/`requirements-checklist.md`
beat and must-show lists for the AWS video — the remaining beats map cleanly.
