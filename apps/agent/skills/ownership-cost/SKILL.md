---
name: ownership-cost
description: Computes a comparable five-year total ownership cost estimate — fuel, maintenance, insurance, depreciation, and financing, each itemized — using the same shared assumptions applied identically across every candidate. Use for the ownership-cost-analyst specialist on the ownership-cost obligation; never emit a bare unexplained total.
---

# Ownership cost

## What this technique does

Households cannot compare candidates on total ownership cost unless every candidate is priced under the same assumptions: the same annual mileage, the same fuel price, the same ownership horizon, the same insurance coverage and driver profile. This technique applies one shared assumption set to each candidate's own inputs (fuel economy, powertrain class, per-candidate insurance risk pricing, true out-the-door price for depreciation) and produces a five-year estimate broken into its component parts.

## Inputs and tools

Use the ownership calculator tool with the case's shared assumptions (annual mileage, fuel price, maintenance cost per mile by powertrain class, insurance coverage/driver profile, depreciation methodology, financing baseline) and each candidate's own specification and pricing data. When a candidate has an accepted, in-writing financing offer that differs from the shared financing baseline, use the actual offer for that candidate's financing line and say so explicitly rather than mixing baseline and actual terms without comment.

## Output shape

Produce a claim for each cost component (five-year fuel cost, five-year maintenance cost, annual insurance premium, depreciation, financing cost where applicable) with the arithmetic that supports it, plus one claim for the combined five-year total that sums exactly the itemized components — the total must always be traceable back to its parts, never asserted on its own. Attach `sourceIds` to the shared assumption set and the candidate-specific inputs used. `evidenceResults` reflects the calculator as a deterministic extraction (E1 for a single computed figure, E2 once the underlying inputs are independently corroborated, matching the obligation's required E2 level). Use `limitations` to flag any input that is itself an estimate or planning default rather than a confirmed figure (for example, a fuel price assumption or a depreciation curve).

## Required honesty behavior

Never report a five-year total without its breakdown — a bare number invites the household to trust a figure they cannot audit. If a shared assumption had to be substituted for candidate-specific data because the latter wasn't available (for example, financing baseline used in place of a not-yet-accepted offer), state that substitution as a limitation so it is visible when comparisons are made, and revise the estimate once the real figure is known rather than leaving the substitution silently baked in.
