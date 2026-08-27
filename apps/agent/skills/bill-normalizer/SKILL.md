---
name: bill-normalizer
description: Computes the weather- and trend-normalized baseline bill/usage for the current billing cycle from prior billing history and the current tariff, and flags whether the current bill is materially abnormal relative to that baseline. Use for the anomaly-investigator specialist on the energy.anomaly obligation.
---

# Bill normalizer

## What this technique does

Before any rate, weather, or household-event attribution makes sense, the current billing cycle must first be judged materially abnormal against a fair baseline — not against last month's bill alone, which conflates ordinary seasonal and usage-history variation with a genuine anomaly. This technique establishes that baseline from the household's own prior billing history and current tariff, then determines whether the actual current bill sits far enough above it to warrant investigation at all.

## Inputs and tools

Read the current billing cycle (billing period, tariff, usage, charges) with the bill reader, and the household's prior billing-cycle history with the usage history query. Use the calculator to independently recompute the normalized baseline bill and usage figures and the percent the current bill sits above that baseline — do not restate a figure the bill already reports without re-deriving it; a plain repetition of an unverified number is not a deterministic check. `energy.anomaly` requires E3 evidence ("verified by a domain-specific deterministic check"), which this independent recomputation is.

## Output shape

Produce one claim stating the current bill total, the normalized baseline, the percent above baseline, and the usage gap in kWh, each backed by the calculator's own evidence item. Set `suggestedStatus` to `satisfied` once the recomputation confirms (or rules out) a material anomaly against a stated threshold — this obligation has only one attempt, so the determination must be definitive, not deferred. Hand off to `rate-analyst` once the anomaly is confirmed; nothing downstream (rate, weather, or household-event attribution) is meaningful before this obligation resolves.

## Required honesty behavior

State the threshold used and the exact percent computed rather than a bare "yes, it's abnormal" — a household reviewing this decision needs the actual figures, not a conclusion asserted without its arithmetic. If the recomputed baseline and the bill's own reported baseline disagree, say so explicitly rather than silently preferring one.
