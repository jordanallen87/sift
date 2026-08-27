---
name: household-fit
description: Compares candidate specifications against the household's stated needs, strictly separating what published specifications can actually establish (cargo dimensions, legroom, ground clearance) from what genuinely cannot be known from a spec sheet (driving comfort, whether specific cargo items fit without folding seats) — the second category always becomes an explicit unknown with a test-drive or measurement question, never a fabricated score. Use for the household-fit-analyst specialist on the household-fit obligation.
---

# Household fit

## What this technique does

This technique is the concrete mechanism behind Pax's promise that an unresolved question is shown as unresolved rather than quietly answered with a plausible-sounding guess. It has two genuinely different jobs, and conflating them is the one failure this skill exists to prevent:

1. **Specification-derived facts** — cargo volume, cargo width/length, rear door opening width, second-row legroom, ground clearance — are read directly from a manufacturer specification sheet and reported as sourced facts with normal comparison semantics (higher or lower is better, as the pack defines).
2. **Genuinely subjective or physically unverifiable questions** — whether two dog crates of known dimensions actually clear the wheel wells, seatback contour, and load-floor step without folding a seat; how comfortable the ride and seating are for this household's daily commute — **cannot** be derived from any specification sheet, no matter how favorable the numbers look. These must be recorded as explicit unknowns, never inferred.

## Inputs and tools

Use the household-fit matrix tool, which returns each candidate's known specifications alongside its explicit unknowns (each with a question, a reason the spec sheet cannot answer it, and a resolution path — physical measurement or test drive). Compare known specifications against the household's stated dimensions and priorities from the current case context.

## Output shape

Produce one claim per specification-derived fact, source-linked to the specification sheet, with ordinary comparison semantics. For every item the fit-matrix tool returns as an explicit unknown, do **not** produce a claim asserting fit or comfort — instead surface it through `limitations` and a `needs_human` disposition (or `suggestedStatus: accepted_uncertainty` where the obligation allows it), stating the specific question and its resolution path so the case can generate a targeted test-drive or measurement request.

## Required honesty behavior

A candidate having the largest published cargo volume of the shortlist is a real, reportable fact. It is _not_ evidence that two specific dog crates fit behind the second row without folding a seat, and it must never be presented as if it were — even implicitly, by omission. The most cargo-favorable candidate and the least cargo-favorable candidate get the identical unknown-fit disposition unless an actual measurement or test drive has occurred, because none of them have been measured. The same discipline applies to driving comfort: it is always an explicit unknown until a test drive happens, regardless of any specification correlate (engine size, suspension type) that might tempt an inference. When the household reweights a subjective criterion like driving comfort higher, this reopens the obligation and must produce a new test-drive question — it must never retroactively manufacture a comfort rating just because the criterion now matters more.
