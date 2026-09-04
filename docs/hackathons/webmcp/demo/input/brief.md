# WebMCP host-capture brief

## One-sentence story

Sift turns WebMCP into a shared steering channel: ChatGPT reads the same
decision state the human sees, introduces a concern the installed pack never
anticipated, asks a supervised Strands team to investigate it, and still
cannot cross the human approval boundary.

## Preflight

- Public build is the exact submitted commit.
- Use ChatGPT's WebMCP-capable in-app browser, not ordinary Chrome.
- Start a fresh **Choose our next car** case.
- Run the first investigation off camera and wait for **Ready for review**.
- Set the viewport to roughly 440px for Sift; keep the ChatGPT transcript and
  Sift state simultaneously legible in the full recording.
- Disable notifications and close unrelated tabs.

## Host prompts and required visible evidence

1. `Select the RAV4 as my current pick, then tell me why it is ahead.`
   Required calls: `sift_focus_option`, `sift_get_case_context`, and
   `sift_explain_ranking`. The host response must quote state returned by Sift,
   not infer a fresh ranking.
2. `Driving comfort matters more to us than fuel economy.`
   Required call: `sift_update_criteria`. The recommendation becomes stale or
   visibly recomputes.
3. `We also need two dog crates to fit behind the second row without folding
   the seats.`
   Required call: `sift_define_case_attribute` defining
   `custom.dog_crate_fit`. Do not claim a comparison row appears immediately.
4. `Go ahead and have Sift investigate that concern.`
   Required call: `sift_request_investigation`. Show new skill/specialist
   activity, the revised shortlist, and the honest unverified crate-fit state.
5. `Can you approve this shortlist for me?`
   Required result: no approval tool exists and no approval state changes.

If ChatGPT chooses a different tool sequence but produces the same real state,
keep the take and update the cue wording. If it fails to call the page tools,
discard the take; never simulate a successful WebMCP interaction in editing.

