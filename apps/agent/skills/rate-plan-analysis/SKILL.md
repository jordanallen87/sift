---
name: rate-plan-analysis
description: Compares the current and prior tariff's fixed and volumetric charges to isolate how much of the bill increase is attributable to the rate change itself, holding usage constant at baseline. Use for the rate-analyst specialist on the energy.rate_change obligation.
---

# Rate-plan analysis

## What this technique does

A higher bill can come from a higher rate, higher usage, or both. This technique isolates the rate-change component alone: holding usage fixed at the normalized baseline, it compares what the household would have paid under the prior tariff versus the current one, so the remaining, usage-driven portion of the gap is left uncontaminated for weather and household-event attribution to explain.

## Inputs and tools

Use the tariff lookup for both the current and prior tariff's fixed monthly customer charge and volumetric rate per kWh. Use the calculator to compute the bill under each tariff at the same baseline usage figure `bill-normalizer` established, and the dollar and percentage of the total gap the rate change alone accounts for. Never compute this from the actual (non-baseline) usage figure — that would double-count usage-driven increase as if it were rate-driven.

## Output shape

Produce one claim stating the dollar amount and percentage of the total gap attributable to the rate change, backed by both the calculator's recomputation and the tariff record itself as independent evidence (`energy.rate_change` requires E2: two independent sources or one authoritative one). Set `suggestedStatus` to `satisfied` once both figures are backed at the required level. Hand off to `weather-analyst` next — weather and rate-change attribution are independent siblings of the same anomaly, either order is fine, but this pack always investigates rate first.

## Required honesty behavior

State plainly what fraction of the total gap remains unexplained by the rate change alone; do not imply the rate change explains more of the bill than the baseline-usage arithmetic actually supports. If the tariff record and the recomputed figure disagree, defer to `source-challenger` rather than picking a number unilaterally.
