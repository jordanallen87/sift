# Agents for Humans demo video — shot-by-shot recording script

Target: **no longer than 5 minutes**, public audio, published video. This script hits, in order, the seven required beats in `docs/specs/demos-and-submission.md` ("Agents for Humans video — no longer than five minutes"). Every quoted UI label and event string below was cross-checked against the actual component source and, where noted "(live-verified …)", against the real deployed product on 2026-08-27 using Playwright against `https://pax-hackathon-production.up.railway.app`, and against `apps/agent/src/runtime/home-energy-swarm.test.ts`. Where the live product genuinely cannot do something the spec describes, this script says so plainly and routes around it honestly instead of scripting a moment that won't happen on camera.

**Total runtime budget: 5:00.** Beats below sum to exactly 300 seconds; land under it, not on it.

**This script's "(live-verified …)" claims predate the 2026-08-30 workspace redesign (ADR 0004) and are now stale for on-screen positions.** The former separate "Recommendation" and "Approval" cards this script scrolls to are now composed inside one merged hero region (`RecommendationHero`) rather than being independently scrolled-to cards; the required beats and event names below are unchanged, but re-verify exact scroll targets and card boundaries against the live build before recording.

---

## Before you record — read this in full, including the two flagged gaps

1. **URL.** `https://pax-hackathon-production.up.railway.app`. No login required.
2. **Fresh case.** Click **"Investigate my energy bill"** on the launcher (label verbatim from `apps/web/src/components/DemoLauncher.tsx`). This resets to the checked-in fixture and mints a fresh case ID.
3. **This deployment runs `SIFT_EXECUTION_TARGET=local`, not AgentCore.** No AWS credentials were available at deploy time (documented in `README.md`). This is an honest external blocker, not a missing feature — the beat that mentions AgentCore/CloudWatch below is explicitly conditional and only recorded if you have since deployed to AgentCore with real credentials. Do not fabricate an AgentCore screen.
4. **`pnpm verify:release` is real now — this note is stale and describes an earlier state of the repository.** Per the current `README.md`, `pnpm verify:release` runs `pnpm verify` plus real Stryker-based `test:mutation`, a production build check, a Docker build contract check, and `pnpm test:submission`, writing its own report to `artifacts/verification/release-latest/report.json`. `test:observability` and `test:live` remain honest declared stubs (they print "not yet implemented" and exit 0) — confirm which specific stage you are showing on screen and describe it accurately; do not claim `verify:release` itself is a stub. Regenerate whichever report you show fresh (`pnpm verify` and/or `pnpm verify:release`) shortly before recording so its `gitSha` matches the commit you're submitting.
5. **Flagged gap #1 — "Draft withheld" does not fire in the standard click-through run.** The required sequence step 5 and this video's required beat 3 both describe a premature `monitor-one-cycle` draft being rejected with a visible `Draft withheld` card because household-change evidence is still unresolved. This mechanism is real and is proven by an automated test (`apps/agent/src/runtime/home-energy-swarm.test.ts`, describe block "intervention integrity", test "rejects a decision-synthesizer draft with no source citation, then accepts a corrected retry (GoalLoop maxAttempts: 2)") — but it is **not** part of the scripted round-1 pass that runs when you click "Request investigation" on the live product. Live-verified twice: the decision-synthesizer's structured output validates on attempt 1 both times (`goal.validated`, "Recommendation draft validated on attempt 1"), because by the time synthesis runs, all five obligations — including household-change — are already resolved. Beat 3 below is written honestly around this: it shows the real, live `goal.validated` proof that GoalLoop genuinely runs, and states plainly, on camera, that the rejection path is proven by the automated suite rather than reproduced live here. Do not re-cut this into a fake "Draft withheld" moment.
6. **Flagged gap #2 — reweighting a criterion has no page form.** There is no visible criteria-editor control anywhere in `apps/web/src/components` (confirmed by source search) — `sift_update_criteria` is reachable only through WebMCP (asking ChatGPT, in a WebMCP-capable browser) or a direct authenticated API call. The required sequence for this scenario explicitly allows either "the user or ChatGPT" to do the reweight, so using ChatGPT here is fully spec-compliant, not a workaround. **Recommended:** record this beat in the same WebMCP-capable browser/ChatGPT in-app browser you used for the WebMCP video (see that script's "Before you record" for setup) and literally ask ChatGPT to do it, on camera. **Fallback**, if you are recording this video in isolation without a WebMCP client: use your browser's DevTools console and call the identical REST command Sift's own command layer and WebMCP tool both dispatch to (`POST /api/cases/:caseId/commands/updateCriteria`) — narrate this openly as "the same command endpoint the page and ChatGPT both use," not as a hidden trick. Either way, **rehearse this exact moment once before recording**: after the reweight, plainly asking Sift to "investigate again" can fail with `"No open obligation remains to select."` once round 1 has already resolved every obligation (live-verified) — you must ask specifically for the response-options recommendation to be revisited (e.g., "ask Sift to reconsider the response options now that long-term waste matters more" / a targeted `sift_request_investigation` call naming the `energy.response_options` obligation). Confirm your exact phrasing works before you hit record.
7. Keep the browser window narrow (390–480px) so the right pane reads as the real product.

---

## Shot list

### Beat 1 — the household problem and the background trigger (0:00–0:25, 25s)

*(Required beat 1: "Establish the household energy problem and background anomaly trigger.")*

**On screen:** the freshly-started case, loaded but not yet investigated. Case header reads **"Home Energy Guardian"**. Scroll the comparison table — it lists the four real response options (**"Monitor for one more billing cycle," "Switch to a different rate plan," "Request a home energy audit," "Request an HVAC / thermostat inspection"**) — and the Readiness panel, which already lists five real open questions: **Anomaly detection, Rate-change attribution, Weather-normalized usage attribution, Household or appliance event correlation, Response options synthesis.**

**Narration:**
> "A household's energy bill just came in 42 percent over its normal baseline — $248.50 against a weather-normalized $175.00. Nobody should have to notice that, dig through eighteen months of usage history, and guess why. Sift already flagged it as a case the moment the bill posted — quietly, in the background, before asking anyone anything."

---

### Beat 2 — real AgentSkills, rate/weather work, and Swarm activity (0:25–1:15, 50s)

*(Required beat 2: "Show real AgentSkills, rate/weather work, and Swarm activity.")*

**On-screen action:** click **"Request investigation"** (`data-testid="request-investigation"`) live, on camera. Let the page update in real time — this is a real bounded Strands Swarm, not a canned animation, and it genuinely completes in a few seconds.

**Point out, live, as the Activity ledger appends (real event labels, live-verified, in this exact order):**
- **"Specialist started working" — "Swarm node \"anomaly-investigator\" started."**
- **"Skill activated" — "Activated skill \"bill-normalizer\"."**, then real tool calls: **"bill-reader," "calculator."**
- Handoff to rate-analyst: **"Skill activated" — "rate-plan-analysis,"** tool calls **"tariff-lookup," "calculator."**
- Handoff to weather-analyst: **"Skill activated" — "weather-comparison,"** tool call **"weather-lookup."**

**Narration:**
> "Watch the skill names change as the Swarm hands off — bill-normalizer, then rate-plan-analysis, then weather-comparison. Each one is a real AgentSkill loading in, not a hardcoded label."

*(Leave this run's ledger on screen — you will come back to the next part of it for beats 3 and 4 without re-running anything.)*

---

### Beat 3 — GoalLoop is real, honestly shown (1:15–1:45, 30s)

*(Required beat 3: "Show the premature monitoring draft rejected as `Draft withheld`." — see gap #1 above; shown honestly rather than faked.)*

**On-screen action:** once the run completes, click **"Inspect run"** to open the Runtime Inspector. On the **Overview** tab, point at the real correlated `trace` and `case` IDs. Switch to **Timeline**, filter category to **goal**, and point at the one real entry: **"Recommendation draft validated on attempt 1"** (`goal.validated`, agent: `decision-synthesizer`).

**Narration:**
> "Every recommendation Sift drafts goes through GoalLoop — a real validator that can reject a plausible-sounding answer and force a corrected retry, bounded at two attempts. In this run it validated on the first attempt, because by the time synthesis runs, every obligation — including the household-change check — is already resolved. Our automated scenario suite proves the rejection path directly: a deliberately unsupported first draft gets bounced, and the corrected second attempt is what actually gets accepted. That's not a hidden claim — it's a real test in `home-energy-swarm.test.ts`, and it runs in the release gate you'll see near the end of this video."

---

### Beat 4 — no-progress steering, handoff, skill switch, thermostat evidence, source challenge (1:45–2:30, 45s)

*(Required beat 4: "Show no-progress steering, specialist handoff, skill switch, thermostat evidence, and source challenge.")*

**On-screen action:** scroll back up the same Activity ledger from beat 2, to the weather-analyst section.

**Point out (live-verified, exact ledger text):**
- **"Tool call started" — "Calling tool \"weather-lookup\""** a second time, immediately followed by
- **"Agent redirected" — "RetrySteering: this search repeats a prior query family without explaining a new angle"**
- then **"Tool call failed" — "Tool \"weather-lookup\" failed."**

**Narration:**
> "Weather-analyst tried the same weather lookup twice with nothing new to say for itself. Watch — Sift's RetrySteering intervention catches that immediately and redirects it, live. That's a real `Guide` intervention, not a retry counter quietly incrementing somewhere."

**Continue scrolling; point out:**
- **"Specialist started working" — "Swarm node \"home-systems-analyst\" started."**, then **"Skill activated" — "home-event-correlation,"** and tool call **"household-event-lookup."**
- **"Specialist started working" / "finished" — "Swarm node \"source-challenger\""** immediately after.

**Narration:**
> "The Swarm hands off to home-systems-analyst — a real handoff, a real skill switch to home-event-correlation — and it finds a thermostat sensor-drift event that started three days into this billing cycle. Source-challenger checks that claim before anyone downstream trusts it."

**On-screen action:** scroll to the Recommendation card. Read the real, live text:
> "Given the household's current criteria (energy.cost weight 80, energy.conservation weight 20), the lowest-cost options score highest… Recommend monitoring for one more billing cycle (monitor-one-cycle) before taking further action… No inspection is proposed at this weighting."

**Narration:**
> "Right now, under cost-first priorities, Sift's honest answer is: do nothing yet. That's about to change."

---

### Beat 5 — confirmation, snapshot restoration, human-only approval (2:30–3:35, 65s)

*(Required beat 5: "Show confirmation, snapshot restoration, and human-only proposal approval." Sequence steps 10–13.)*

**On-screen action (see gap #2 above for exact mechanics):** ask ChatGPT (or use the documented API fallback) to reweight the case:

**Say to ChatGPT (matches the "WebMCP demo moments — energy moment" line in `docs/specs/webmcp.md`-adjacent spec, exact):**
> "Long-term waste matters more than the cheapest immediate option."

This calls `sift_update_criteria`. Point out: the Recommendation card's status flips to **"Stale — needs investigation."** Nothing is running yet — `updateCriteria` appends `recommendation.invalidated` and revises the run plan (`apps/agent/src/services/run-plan-service.ts`), it does not start an engine run — which is exactly why the next line on camera is you asking for one.

**Say next, to target the re-investigation correctly (see gap #2 rehearsal note):**
> "Ask Sift to reconsider the response options now that long-term waste matters more."

**What happens (live-verified):** a genuinely revised run fires. Point at the ledger:
- **"Specialist started working" — "Swarm node \"decision-synthesizer\" started."**
- **"Tool call started" — "Calling tool \"propose_inspection\"."**
- **"Your approval needed" — "ConsequenceGuard: tool \"propose_inspection\" creates a consequential artifact and requires human confirmation."**

**Narration:**
> "Watch this exactly — before Sift will even draft a proposal to inspect anything in this household, ConsequenceGuard stops it and requires confirmation. That's a real ConsequenceGuard `Confirm` intervention, not a courtesy dialog bolted on afterward."

**Continue:** the run completes. Read the new, live Recommendation text — the model's:
> "Recommend requesting an HVAC/thermostat inspection (request-hvac-inspection) to address the confirmed thermostat sensor-drift root cause… Under the reweighted conservation-focused criteria this scores highest (0.87) versus monitor-one-cycle (0.20)."

**Then point at the Facts section immediately below it, which is Sift's, not the model's** (live-verified against the shipped scenario):
> "Request an HVAC / thermostat inspection scores 87% against the criteria on this case, measured across 100% of the weight assigned to them."
>
> "Strongest on Long-term waste reduction: best of the options compared, where higher is better."

**Narration — this is the beat that earns the distinguishing claim:**
> "Two independent things just agreed. The Swarm's synthesis says the inspection scores 0.87 against 0.20. Sift's deterministic engine, which has never seen a prompt, computed 87% and 20% from the household's own weights. That is not the model grading its own homework — it is a measurement the model happened to describe correctly, and if it had described it incorrectly Sift would have said so on this card."

**And read the limitation, which is the strongest single line in the demo:**
> "Long-term waste reduction is what puts Request an HVAC / thermostat inspection ahead. Take it out of the weighting and Switch to a different rate plan comes first instead."

**Narration:**
> "Sift didn't write that sentence from a template. It removed that one criterion, re-ranked, watched the order actually flip, and only then said it. When no single factor flips the order, it says nothing at all — so when it does speak, it has earned it. And notice the confidence: this recommendation is fully measured and decisively ahead, and it still caps itself below certainty, because coverage only counts the criteria this household actually wrote down."

**On-screen action — snapshot/reload proof:** reload the browser tab. Point out the case reloads to the identical state — same recommendation, same pending approval — proving this is durable server state, not client memory.

**On-screen action — human-only approval:** scroll to the **Approval** card, which reads **"Your approval needed"**. Click **Approve** (`data-testid="approval-card-approve"`) yourself. Point out the resulting rotated **"Approved"** stamp and the case header status flipping to **"Decided"** (live-verified).

**Narration:**
> "No inspection got scheduled — Sift doesn't book real-world appointments. What just happened is a human, me, approving that this proposal should exist. The agent built the case for it; only I can say yes."

---

### Beat 6 — implementation proof: AgentCore/CloudWatch (conditional), Runtime Inspector, release report (3:35–4:15, 40s)

*(Required beat 6: "Show AgentCore/CloudWatch correlation when available, Runtime Inspector evidence, and the release report.")*

**Conditional sub-beat — only if you have since deployed to a real Bedrock AgentCore runtime with AWS credentials:** show `/ping` and one `/invocations` call against the deployed AgentCore endpoint, and the matching CloudWatch trace. **If you have not** (true as of this writing — this deployment runs `SIFT_EXECUTION_TARGET=local`, no AWS credentials configured) — **skip this sub-beat and say so plainly on camera** rather than staging a fake AWS console screen:

**Narration (if skipping):**
> "This deployment runs its Strands execution locally — no AWS credentials were available at deploy time. That's an honest, documented limitation, not a missing feature: the same code path talks to Bedrock AgentCore's `/ping` and `/invocations` contract the moment credentials exist."

**On-screen action (always record this part):** back in the Runtime Inspector's **Overview** tab, point at the real category/level counts from this run (live-verified example: categories including `context`, `goal`, `intervention`, `model`, `skill`, `swarm`, `tool`, with real counts, zero errors) and the real `trace` ID.

**On-screen action — release report:** in a terminal, show `artifacts/verification/latest/report.json` (or run `pnpm verify` fresh if time allows) — point at `"status": "passed"` and the real `gitSha` matching your submitted commit.

**Narration:**
> "Every claim in this video is backed by a real, green verification run — format, lint, typecheck, unit, pack, integration, scenario, and end-to-end tests, all passing against this exact commit."

---

### Beat 7 (platform proof, then close) — 4:15–5:00 (45s)

**On-screen action (brief platform proof — not one of the seven required beats on its own, but explicitly requested framing from `docs/submissions/agents-for-humans/submission-details.md`):** switch demos — reset to **"Choose our next car."**

**Narration:**
> "This same engine also runs Choose Our Next Car — a different Decision Pack, a compiled Strands Graph instead of a Swarm, four real specialists instead of six. Same deterministic core owns readiness and evidence either way. A typed, case-specific concern — like needing two dog crates to fit in the back — adapts a live run without ever rewriting the installed pack."

**Close (required beat 7 — exact distinguishing claim):**
> "Most agents are optimized to finish. Sift is optimized to know when it has not earned the right to answer yet."

---

## Post-recording checklist

- [ ] Total runtime is 5:00 or under (the automated submission checker fails the release otherwise, once the file is present).
- [ ] Audio is clear and present throughout.
- [ ] The AgentCore/CloudWatch sub-beat either shows real deployed evidence or is honestly narrated as skipped — never staged.
- [ ] The release-report shot shows the real `pnpm verify` or `pnpm verify:release` report you actually regenerated, and narration matches which one it is — never a claim that `verify:release` is still a stub (see the note above; it is real now).
- [ ] No beat claims "Draft withheld" happened live if it did not actually appear on screen during your take.
- [ ] Upload publicly and confirm playback in a signed-out/incognito window before submitting.
