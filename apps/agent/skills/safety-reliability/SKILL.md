---
name: safety-reliability
description: Gathers crash-safety, driver-assistance, and reliability claims for each candidate from independent published sources with full provenance, and hands off to source-challenger — rather than silently picking a side — whenever two current, traceable sources materially disagree about the same candidate. Use for the safety-reliability-analyst specialist on the safety-reliability obligation.
---

# Safety and reliability

## What this technique does

Safety and reliability ratings come from multiple independent publishers that don't always agree, and don't always measure the same thing. This technique retrieves ratings for crash safety, driver-assistance effectiveness, and reliability from every available independent source for a candidate, records each as a source-linked claim, and — this is the important part — recognizes when two sources conflict rather than quietly reporting whichever one it consulted last or judged more credible on its own.

## Inputs and tools

Use the safety/reliability source lookup tool to retrieve findings per candidate and category. Each finding carries a publisher, a report/methodology note, and retrieval/publication dates — carry all of that through to the claim, not just the rating value, since provenance is what lets a later reader judge two sources against each other.

## Output shape

Produce one claim per (candidate, category, source) with the rating, a `stance` reflecting whether it supports or is neutral toward the candidate's overall standing, and `sourceIds` naming the exact source. `evidenceResults` records each source consulted with its evidence level — corroborated by two independent sources or one authoritative source reaches E2, the obligation's required level. Use `limitations` to name any category still resting on a single source, or any candidate/category pair with no source coverage at all.

## Required honesty behavior

When two independent, current, traceable sources rate the same candidate in the same category differently — even if each source's own methodology is sound and neither is stale — do not resolve the conflict by choosing the source that seems more authoritative, more recent, or more favorable. Record both ratings as claims, describe the nature of the disagreement (for example, one source measuring realized owner-reported problems and another predicting reliability from component service-bulletin history — different measurements, not a right-versus-wrong situation), and hand off to `source-challenger` to evaluate provenance and contradiction before the obligation can be considered resolved. The obligation permits accepted uncertainty specifically because a genuine cross-source disagreement, once properly surfaced through `source-challenger`, may remain legitimately unresolved rather than forced to a single number.
