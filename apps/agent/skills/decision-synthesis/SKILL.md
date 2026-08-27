---
name: decision-synthesis
description: Synthesizes resolved deal, ownership-cost, safety/reliability, and household-fit evidence into a source-linked shortlist recommendation that separates supported facts from hypotheses, requires source linkage for every material claim, and withholds the draft with a specific, visible reason whenever a required obligation is still unresolved. Use for the decision-synthesizer specialist on the shortlist obligation, gated by its own GoalLoop validator.
---

# Decision synthesis

## What this technique does

This is the final obligation in the car pack (`car.shortlist`), run only after the deal, ownership-cost, safety/reliability, and household-fit obligations have each produced their own evidence. It composes that evidence into a recommendation: which candidate(s) should advance to the household's test drive, what could change that result, and what remains to verify. It is the one place a plausible-sounding conclusion is most tempting to produce early — and the one place Pax's fail-closed validation matters most.

## Inputs and tools

Draw only on claims and evidence already produced by the other specialists for this case — deal normalization, ownership cost, safety/reliability, and household fit — plus the current criteria weights. This technique does not gather new primary evidence itself; it synthesizes what already exists and, when something is missing, says so rather than inventing it. The `propose_recommendation` tool is the consequential step that hands a completed recommendation to the deterministic core for human approval; call it only once the synthesis is actually ready, since it is gated by human confirmation before anything is recorded.

## Output shape

Produce claims that clearly separate **supported facts** (each carrying `sourceIds` back to the specialist evidence that established it) from **hypotheses** (what a criterion change or new evidence could plausibly do to the ranking — explicitly labeled as such, never blended into the factual claims). `limitations` names every required obligation not yet resolved and every accepted uncertainty still open (for example, an unresolved household-fit unknown or an unresolved safety/reliability source disagreement). `suggestedStatus` is `satisfied` only when every required obligation this one depends on is resolved or has explicitly accepted uncertainty within its own rule; otherwise it must be `blocked` or `open`.

## Required honesty behavior: withhold, don't guess

If this technique — or the model driving it — produces a plausible recommendation while required obligations remain unresolved, that draft must never reach the household as a finished answer. The engine's GoalLoop validator (`maxAttempts: 2`) checks source linkage, resolved obligations or accepted uncertainty, allowed confidence, and separation of fact from hypothesis; a failing draft is rejected with machine-readable reasons and the activity ledger shows exactly this, verbatim:

```
Draft withheld
This answer is plausible, but 3 required questions are still unresolved.
Pax is continuing the investigation before asking you to decide.
```

(The count in that message reflects however many required questions are actually still open for the case at hand — it is not always three.) On rejection, do not simply try to produce the same conclusion again with more confident language; change technique, activate the specialist most likely to close the actual gap, and only re-synthesize once new source-linked evidence has resolved or explicitly recorded uncertainty for what was missing.

## Required honesty behavior: recompute only what changed

When evidence is invalidated — for example, a teaser-price claim is corrected, making a candidate's out-the-door cost stale — treat the recommendation as invalidated too, and identify exactly which claims, obligations, and option scores are affected rather than rerunning everything from scratch. Only the comparisons that actually depend on the changed evidence should be recomputed. The same discipline applies when a criterion changes: if the household reprioritizes driving comfort and household fit was never established beyond a test-drive question, the recommendation must record that comfort remains unresolved, not invent a score to keep the ranking complete. A human remains responsible for approving the resulting proposal; this technique's job ends at producing a validated, honestly-scoped draft for that approval.
