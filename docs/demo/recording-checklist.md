# Demo Recording Checklist

Companion to `webmcp-script.md` and `aws-script.md`. This covers what must be
true of the live product before recording starts, audio/caption requirements,
and a pre-flight checklist matching each competition's "must-show" list so
nothing gets missed during a real screen recording.

## 1. Product state before recording starts

`docs/specs/testing.md`'s Playwright section describes what makes a
**Playwright** run of these journeys deterministic and reproducible
(disabled animations, checked-in deterministic font setup, deterministic
clocks/IDs, fixed sleeps prohibited, waits on domain state). A real screen
recording is not a Playwright run — there is no test harness pinning the
clock or IDs — but the same underlying goals apply: the recording must show
the **real** product reaching the **same** state every take, without visual
noise that isn't part of the story.

Before hitting record:

- [ ] **Fresh fixture state.** Use the demo launcher's reset action (or start
      a fresh case) for both **Choose our next car** and **Investigate my
      energy bill** immediately before recording each take. Per
      `docs/specs/product.md` § "Demo launcher," starting a demo resets its
      case to the checked-in fixture and generates a fresh case ID — do not
      resume a case left over from a previous take or from development.
- [ ] **Deterministic tools, not opt-in live model calls.** Per
      `docs/specs/product.md` § "Explicit scope cuts": "The demos may include
      optional live research, but their required path uses deterministic
      local tools." Record the required hero path against fixture-backed
      tools (the same path `pnpm test:scenario` and `pnpm test:e2e` exercise),
      not `pnpm test:live`'s opt-in Bedrock path — the recording must be
      reproducible take after take.
- [ ] **Animations settled, not fighting the camera.** Confirm the build's
      reduced-motion/animation-disable path (the one used for Playwright
      visual baselines per `testing.md`) is available for recording, or that
      transition durations are short enough that screen-capture frame rate
      doesn't produce visible tearing/flicker on state changes.
- [ ] **No horizontal scroll, no overlapping sticky controls, at the exact
      recording viewport.** Per `docs/specs/product.md` § "Workspace layout":
      the canonical viewport is ChatGPT's right pane, 390–480 px wide. Pin
      the browser/simulator to a width in that range for the WebMCP video
      (matching `docs/submissions/webmcp/requirements-checklist.md`: "The
      live right-pane UI is usable at the target ChatGPT browser-pane
      width"). Confirm no region introduces page-level horizontal scrolling
      and no fixed/sticky control overlaps the focused card or approval
      controls, matching the assertions `testing.md`'s Playwright visual
      stage runs automatically.
- [ ] **Live connection actually live.** Confirm the SSE connection is
      genuinely open and the Activity ledger is rendering from real
      queued/specialist/skill/tool/evidence/steering/recommendation/
      completion events before recording — per `product.md` § "Real-time
      experience contract," loading copy or timers must never fabricate an
      event that did not occur, and that's just as true on camera as in a
      test.
- [ ] **Release identifier visible and correct.** Per
      `docs/submissions/shared-release-checklist.md` § "Public deployment":
      "The deployed build displays a nonintrusive release identifier that
      maps to the final commit." Confirm this identifier is visible somewhere
      reachable during recording and matches the git SHA being submitted.
- [ ] **`pnpm verify:release` is green before you record the proof beat.**
      Both scripts show `artifacts/verification/latest/report.json` with
      `status: 'passed'`. Run it fresh against the exact commit being
      recorded — do not show a stale report from an earlier commit.
- [ ] **WebMCP host actually available.** For the WebMCP video: confirm
      ChatGPT's in-app browser (or the supported Chrome + WebMCP-enabled
      configuration, with its exact version/flag recorded) is the real host
      being recorded, not a simulated/mocked tool-call overlay — per
      `docs/submissions/webmcp/requirements-checklist.md`: "The video shows
      live WebMCP-driven interaction rather than only direct UI clicks."
- [ ] **AgentCore/CloudWatch only if truly verified.** For the AWS video:
      confirm AgentCore deployment and trace correlation actually work
      before including that sub-shot. Per
      `docs/submissions/agents-for-humans/requirements-checklist.md`:
      "AgentCore and CloudWatch appear in the video only if the deployment
      and correlation were actually verified." If not verified, cut that
      sub-shot rather than imply it.
- [ ] **No secrets, no private chain-of-thought, no redaction canaries
      on screen.** Per `docs/specs/debugging-and-observability.md` §
      "Redaction and access": confirm the Runtime Inspector view used in the
      proof beats is rendering redacted, safe payloads (fixture mode may
      show `fixture-full` payload detail since seeded cases contain no
      private data) — never environment variables, authorization headers,
      cookies, or raw private reasoning.

## 2. Audio and caption requirements

From `docs/submissions/webmcp/requirements-checklist.md` § "Required public
demo video," `docs/submissions/agents-for-humans/requirements-checklist.md`
§ "Required demo video," and `docs/submissions/shared-release-checklist.md`
§ "Shared presentation assets":

- [ ] Both videos contain **clear spoken audio** — not text-only or music-only.
- [ ] The WebMCP video includes audio **explicitly explaining Sift and its use
      of WebMCP** (not just narrating clicks).
- [ ] The AWS video's audio **states the problem, the intended audience, and
      why the problem matters**, in addition to narrating the flow.
- [ ] **Captions are accurate and readable** on the final uploaded file for
      both videos.
- [ ] **On-screen text is readable at normal playback size** — this applies
      to every caption/overlay called out in the two scripts (tool-call
      names, the verbatim "Draft withheld" copy block, price comparisons,
      etc.).
- [ ] **Every claim in the narration can be traced to code, a passing test,
      a runtime event, or a clearly labeled design choice.** Before
      finalizing narration, re-check each "Must genuinely be happening"
      block in the two scripts against the actual running build — do not
      record a line describing behavior the build doesn't yet exhibit.
- [ ] The WebMCP video's **final runtime is strictly under three minutes**;
      confirm on the exported file, not just the script's beat-window sum.
- [ ] The AWS video's **final runtime is no longer than five minutes**;
      confirm on the exported file.
- [ ] The working deployed product appears **within the first 15 seconds**
      of the WebMCP video specifically (stricter than the AWS video's
      "immediately" requirement).
- [ ] Remove setup, loading, dead time, and irrelevant architecture detail
      from both edits — per `submission-details.md`'s organizer note ("remove
      setup/loading/dead time") and the AWS requirement that the video "shows
      the complete Energy journey end to end" without padding.
- [ ] Public links: confirm the final YouTube links, audio, captions,
      resolution, and playback all work **while signed out**, in an
      incognito/logged-out browser session, before treating either video as
      final.

## 3. Pre-flight checklist — WebMCP video must-show list

Transcribed directly from
`docs/submissions/webmcp/requirements-checklist.md` § "Required public demo
video," mapped to the beat that covers it in `webmcp-script.md`:

- [ ] Published publicly on YouTube. *(post-production)*
- [ ] Strictly under three minutes. *(post-production)*
- [ ] Clear spoken audio explaining Sift and its use of WebMCP. *(all beats)*
- [ ] Working deployed product within the first 15 seconds. *(Beat 1)*
- [ ] Live WebMCP-driven interaction, not only direct UI clicks. *(Beats 2–5)*
- [ ] No setup/loading/dead time/irrelevant architecture detail. *(edit pass)*
- [ ] Selected vehicle shared with ChatGPT. *(Beat 2 — `sift_get_case_context`)*
- [ ] A previously unspecified household concern added or reweighted through
      WebMCP. *(Beat 3 — both sub-beats: comfort reweight and dog-crate
      attribute)*
- [ ] That command redirecting an active Strands investigation. *(Beat 4)*
- [ ] Visible case state, evidence obligations, and recommendation changing
      causally. *(Beats 4–5)*
- [ ] An honest unknown and a test-drive question rather than fabricated
      subjective evidence. *(Beat 5)*
- [ ] Proof that final shortlist approval remains human-only. *(Beat 6)*
- [ ] Correlated Runtime Inspector or automated verification evidence, shown
      briefly. *(Beat 7)*
- [ ] Public YouTube link, audio, captions, resolution, and playback verified
      while signed out. *(post-production, § 2 above)*

## 4. Pre-flight checklist — AWS video must-show list

Transcribed directly from
`docs/submissions/agents-for-humans/requirements-checklist.md` § "Required
demo video," mapped to the beat that covers it in `aws-script.md`:

- [ ] No longer than five minutes. *(post-production)*
- [ ] Publicly viewable while signed out. *(post-production)*
- [ ] Clear spoken audio. *(all beats)*
- [ ] States the problem, intended audience, and why the problem matters.
      *(Beat 1)*
- [ ] Working product appears immediately, not slides. *(Beat 1)*
- [ ] Complete Energy journey shown end to end. *(all beats, in sequence)*
- [ ] 42% anomaly creating the case without unnecessary user interruption.
      *(Beat 2)*
- [ ] Genuine specialists, AgentSkills, tools, evidence, real-time events.
      *(Beat 3)*
- [ ] Early monitoring answer withheld because an evidence obligation is
      unresolved. *(Beat 4)*
- [ ] No-progress condition causing `Guide`, a specialist handoff, and skill
      switching. *(Beat 5)*
- [ ] New thermostat evidence changing the supported recommendation.
      *(Beat 6)*
- [ ] `Confirm`, persisted session state, runtime reconstruction, and visible
      human review. *(Beat 7)*
- [ ] Proof the agent cannot approve or schedule the consequential action.
      *(Beat 7)*
- [ ] Runtime Inspector and correlated telemetry, without exposing
      chain-of-thought. *(Beat 8)*
- [ ] AgentCore and CloudWatch **only if actually verified**. *(Beat 8,
      conditional sub-shot)*
- [ ] Brief connection to the reusable Decision Pack architecture, without
      distracting from the hero journey. *(Beat 9)*
- [ ] Captions, resolution, audio, and duration checked on the final
      uploaded file. *(post-production, § 2 above)*

## 5. Final sanity pass before submission

- [ ] Re-read both scripts' "Reconciliation notes for the orchestrator"
      sections — confirm the judgment calls made there (splitting Beat 3 in
      the WebMCP script; the criteria-reweight sub-moment and platform-proof
      beat in the AWS script) match what the finished build actually does,
      and adjust the recording plan if the implementation diverged.
- [ ] Replace every illustrative placeholder figure (dollar amounts,
      percentages, dimensions, dates) in both scripts with the actual values
      from the finished seed fixtures before the final take.
- [ ] Confirm the two videos are separate edits per
      `docs/specs/demos-and-submission.md` § "Competition-specific video
      structures" — do not submit the same cut to both competitions.
- [ ] A second reviewer watches both final videos against this checklist
      end to end, per `docs/submissions/shared-release-checklist.md` § "Final
      release review": "A second reviewer checks spelling, links, form
      answers, video visibility, audio, captions, and artifact uploads."
