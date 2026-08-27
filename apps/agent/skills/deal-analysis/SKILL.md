---
name: deal-analysis
description: Evaluates a normalized candidate's out-the-door price and terms against the household's hard constraints and stated budget, producing source-linked claims about which candidates qualify and how good the deal is — and explicitly invalidates a prior deal score when new evidence (such as a challenged teaser price) changes the normalized terms. Use for the deal-analyst specialist on the hard-constraints and deal-normalization obligations.
---

# Deal analysis

## What this technique does

Once `listing-normalizer` has produced a comparable true out-the-door price and itemized terms for a candidate, this technique judges that candidate against the household's actual requirements: does it satisfy hard, non-negotiable needs (drivetrain, must-have features, maximum budget), and how does its normalized deal value compare to the other candidates under consideration. It answers the `car.hard_constraints` and `car.deal_normalization` obligations.

## Inputs and tools

Use the listing reader tool for the normalized listing/offer record. Compare the true out-the-door price against the household's stated maximum budget and non-negotiable requirements from the current case context, not against the advertised price alone — a candidate whose advertised price is under budget can still fail the hard-constraint check once mandatory add-ons and financing are included.

## Output shape

Produce one claim per hard constraint evaluated (pass/fail, with the figure that decided it) plus a claim summarizing deal value relative to budget and to the other candidates, each with `sourceIds` back to the normalized offer record. Set `evidenceResults` and evidence level from the underlying listing/offer evidence, not invented independently. Use `limitations` for anything the offer record leaves uncertain (an add-on whose mandatory status is unclear, a financing term not yet in writing). `suggestedStatus` is `satisfied` only once the constraint check and normalized price are both settled at the required evidence level; otherwise `open` or `needs_human`.

## Required honesty behavior

A deal score is only as good as the price it was computed from. When a teaser-price conflict is identified or corrected — for example a candidate whose advertised price looked affordable but whose true out-the-door price, once mandatory add-ons and actual financing terms are included, exceeds the household's budget — treat every prior claim computed from the old price as stale, not as still-valid background. Do not silently recompute and overwrite; state plainly that the prior deal score is invalidated by the new normalized terms and that the hard-constraint result may change (a candidate that appeared to pass on the advertised price can fail once the true price is used). When a normalized price is itself disputed or newly corroborated, defer final resolution to `source-challenger` rather than picking a number unilaterally.
