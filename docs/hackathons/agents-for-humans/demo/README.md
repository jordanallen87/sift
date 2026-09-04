# Agents for Humans submission demo

Target: **4:33**, hard failure above **5:00**. The opening frame is the working
Home Energy Guardian. Generated slides occupy 48 seconds (17.6%); 225 seconds
show the real product, trace, or verification evidence.

## Source of truth

- `manifest.json` is the final edit, narration, acceptance, and fallback plan.
- `generated/storyboard.json` drives every ordinary Sift browser scene.
- `slides/cards.json` specifies the problem, architecture, and close cards.
- `input/brief.md` defines fixture state, truthful claims, and capture order.

The older `docs/submissions/agents-for-humans/demo-script.md` remains the
claim-level source. This package removes its five-minute padding and keeps the
honest current behavior: the filmed GoalLoop path validates on attempt one;
the rejection path is proven in tests, not faked on screen.

## Capture order

1. Redeploy the exact submission commit and run `pnpm test:journey aws-hero`.
2. Regenerate `artifacts/verification/release-latest/report.json` on the same
   commit. Record only the stages the report actually ran.
3. Run aidemo `probe`, then record the browser storyboard against a fresh
   **Investigate my energy bill** case.
4. Record the criteria reweight in a WebMCP-capable host. The documented direct
   command endpoint is an honest fallback only if it is shown and described.
5. Render the three slide cards, narration, captions, and final timeline.
6. Run the shared rendering gate in `../../demo-tooling/README.md`.

## Non-negotiable truth conditions

- Do not show or narrate a live `Draft withheld` event unless it actually fires.
- Do not show AgentCore or CloudWatch unless the submitted deployment is really
  using them. Local Strands execution is acceptable and must be labeled local.
- The ConsequenceGuard confirmation and final human approval are distinct.
- The final recommendation and score must match the deployed fixture.
- A slide may explain architecture; it may not stand in for Strands activity.
