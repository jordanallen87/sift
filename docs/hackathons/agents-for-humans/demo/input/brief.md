# Agents for Humans capture brief

## One-sentence story

Sift quietly notices a 42% energy anomaly, gives a supervised Strands team room
to investigate rate, weather, and household causes, redirects work that stops
making progress, and asks the human only when there is a supported action worth
approving.

## Required initial state

- Open the exact submitted public build.
- Start a fresh **Investigate my energy bill** case.
- Confirm the case shows `$248.50` against a weather-normalized `$175.00`
  baseline. If the fixture changed, update every spoken number before capture.
- Keep Sift at approximately 440px wide for UI detail shots; use a wider crop
  for the Runtime Inspector.

## Journey checkpoints

1. Request investigation on camera.
2. Show `bill-normalizer`, `rate-plan-analysis`, and `weather-comparison`
   AgentSkills plus the corresponding specialist/tool activity.
3. In Runtime Inspector, show the real `goal.validated` event. Narrate attempt
   one honestly. The test-proven rejected-first-attempt path belongs in the
   release-evidence shot, not a reconstructed product shot.
4. Show RetrySteering redirecting the repeated weather lookup, the Swarm
   handoff to `home-systems-analyst`, `home-event-correlation`, the thermostat
   event, and `source-challenger`.
5. Reweight toward long-term waste reduction and target
   `energy.response_options` for reconsideration. Show ConsequenceGuard's
   confirmation, the inspection recommendation, the 87% deterministic score,
   and the counterfactual limitation only if all are present in the build.
6. Reload to prove durable state. The presenter then clicks Approve.
7. Show the Runtime Inspector and the verification report for the submitted
   commit.

## Capture discipline

If an expected event or number differs, the recorded state is authoritative:
revise the narration and manifest. Never use an old screenshot to patch a new
run. Do not imply that a confirmation scheduled an inspection; it authorizes a
proposal, while the later approval is the human decision boundary.

