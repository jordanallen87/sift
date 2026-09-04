# WebMCP submission demo

Target: **2:50**, hard failure at **3:00**. The opening frame is the working
Sift car case. Generated slides occupy 38 seconds (22.4%); 132 seconds show the
real product or WebMCP host.

## Source of truth

- `manifest.json` is the final edit, narration, acceptance, and fallback plan.
- `generated/storyboard.json` records the Sift-only browser material.
- `slides/cards.json` specifies the three generated cards.
- `input/brief.md` is the operator script for the WebMCP-host capture.

The older `docs/submissions/webmcp/demo-script.md` remains the claim-level
source. This package compresses it into a renderable story and updates the shot
plan for the current merged recommendation hero.

## Capture order

1. Redeploy the exact submission commit and set `SIFT_DEMO_URL` to its public
   URL. Run `pnpm test:host` to confirm the current WebMCP tool contract.
2. Run aidemo `probe` on this directory; repair any changed selectors before
   recording.
3. Record the browser scenes from `generated/storyboard.json`.
4. In ChatGPT's WebMCP-capable browser, record the prompts in `input/brief.md`
   as one continuous native-capture take. Do not use stock Chrome.
5. Render the cards in `slides/cards.json` using the reference HTML-card
   renderer.
6. Render narration cue-by-cue, assemble in manifest order, generate captions,
   and enforce the 180-second cap.

## Non-negotiable truth conditions

- The first 15 seconds show the working product.
- The recording visibly proves actual `sift_*` WebMCP calls; DOM automation is
  not presented as WebMCP proof.
- The dog-crate concern remains an unknown/test-drive question until evidence
  establishes it.
- ChatGPT cannot approve. The human clicks the approval control.
- Any screen text or ordering that differs from the manifest wins; update the
  narration rather than describing an event that did not happen.

See `../../demo-tooling/README.md` for the shared render commands and gate.

