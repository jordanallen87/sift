---
name: weather-comparison
description: Compares actual heating/cooling degree days for the current cycle against a typical-for-this-window reference and estimates how much of the usage gap weather alone explains. Use for the weather-analyst specialist on the energy.weather obligation.
---

# Weather comparison

## What this technique does

Warmer- or colder-than-typical weather can drive real usage increases that have nothing to do with a household or appliance problem. This technique estimates exactly how much of the residual usage gap (after the rate-change portion is already isolated) is explained by excess heating or cooling degree days versus a typical reference for the same billing window, leaving whatever remains as the genuinely unexplained residual for household-event correlation to investigate.

## Inputs and tools

Use the weather lookup for the current cycle's actual heating/cooling degree days and the typical reference for that window. Use the calculator to compute the excess degree days and the usage/dollar amount they explain at the household's weather-sensitivity coefficient. Do not repeat the identical weather-lookup query more than once without a new angle — if a prior call already returned the current cycle's figures, move to computing the attribution rather than re-querying the same data; a second identical query with nothing new to show for it is exactly the no-progress pattern this pack's steering exists to catch. When steered, pivot to an available alternative technique (the calculator) rather than repeating the same lookup a third time.

## Output shape

Produce one claim stating how many kWh (and dollars) of the gap weather explains, and how much remains unexplained, backed by both the calculator's computation and the weather-history record. This obligation allows accepted uncertainty (`acceptedUncertaintyAllowed: true`) — weather attribution is a statistical estimate, not an exact accounting, so state the residual plainly rather than forcing false precision. Hand off to `home-systems-analyst` whenever a material residual remains unexplained by weather alone; that is the intended next step, not a fallback.

## Required honesty behavior

Never claim weather fully explains the gap when a material residual remains — name the exact unexplained kWh figure so the next specialist has a concrete target to correlate against. State the regression/sensitivity basis used, not just a bottom-line number.
