---
name: listing-normalizer
description: Turns a raw candidate listing and dealer offer into comparable structured facts — normalized trim/mileage/features and a true out-the-door price computed from the advertised price plus mandatory add-ons, fees, APR, and term — and explicitly flags when the advertised price and the computed out-the-door price diverge materially instead of silently preferring one number. Use for the hard-constraints and deal-normalization obligations before any deal-value comparison happens.
---

# Listing normalizer

## What this technique does

Raw listing and dealer-offer data name different things at different levels of completeness: an advertised price, a set of add-ons that may or may not be mandatory, a financing example that may not be the financing actually offered, and fees with different tax treatment. This technique turns that raw material into one comparable record per candidate: normalized make/model/trim/mileage/features, itemized mandatory add-ons, the applicable tax and title/registration math, and a single **true out-the-door price** that every downstream obligation can compare apples-to-apples.

## Inputs and tools

Use the listing reader tool to retrieve each candidate's advertised price, mandatory add-ons, advertised financing example, and the actual financing offer disclosed to this household. Do not treat the advertised financing example as the financing that will actually apply — carry both forward as distinct facts when they differ.

## Output shape

Produce claims stating the computed out-the-door price with the arithmetic that supports it (advertised price plus mandatory add-ons, tax on the correct taxable base, title/registration fee), each with `sourceIds` pointing at the listing/offer record. Populate `evidenceResults` for the source consulted, at the evidence level the extraction actually supports (a deterministic arithmetic extraction from one disclosed offer is `E1`; treat it as `E2` only once a second independent figure corroborates it). Use `limitations` to carry forward anything not fully resolved — for example, an add-on whose "mandatory" status is ambiguous, or a financing term that isn't yet confirmed in writing.

## Required honesty behavior

When the advertised price and the computed out-the-door price diverge by more than an ordinary tax/title/doc-fee gap — a mandatory add-on package, a financing term that only appears once the true amount financed is known, or any combination that meaningfully changes affordability — record **both** numbers as claims, state the gap amount and percentage explicitly, and never resolve the divergence by quietly reporting only the advertised or only the computed figure. This is the teaser-price case: a listing can advertise one figure while the actual terms disclosed to the household commit them to a materially higher one. Flagging that gap, not picking a winner between the two prices, is this technique's job — `deal-analysis` and `source-challenger` are what decide what the gap means for the household's constraints. If mandatory add-ons or financing terms cannot be confirmed from the available source, say so in `limitations` and suggest `needs_human` or `open` rather than guessing a number.
