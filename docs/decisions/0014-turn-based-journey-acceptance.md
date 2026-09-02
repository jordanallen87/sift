# 0014 — Turn-based journey acceptance, and the agreement check

**Date:** 2026-09-02
**Status:** Accepted
**Builds on:** ADR 0013 (a real WebMCP host can be driven)

## Context

Sift had two journey harnesses and neither could see what the other saw.

`scripts/test-persona.ts` walks a person through a decision turn by turn and asserts hard on case state — in process, calling commands directly, rendering nothing. It reported a **passing** family journey while adaptive discovery had no input path in the product at all: the dock's question button only switched views, so nobody could answer anything in the pane. Every assertion it made was true and the product was unusable.

`tests/e2e/*.spec.ts` renders the real product, but as long linear specs. They assert what a step should look like. They never ask, turn by turn, whether the screen and the server still agree — and that question is where the interesting failures live.

Both hero demo scripts describe assistant actions (`sift_update_criteria`, `sift_define_case_attribute`) that the E2E specs perform over **HTTP**, because when they were written no browser could host WebMCP. ADR 0013 removed that constraint.

## Decision

**1. `pnpm test:journey` runs journeys through the rendered pane in a real WebMCP browser**, and after every turn evaluates three separate things:

| Kind | Question |
| --- | --- |
| `data` | Is the case state what this turn should have produced? |
| `ui` | Does the pane show what a person should now see? |
| `agreement` | Do those two describe the same case? |

The third kind is the contribution. A journey can pass `data` and `ui` independently while showing a person a number the server disagrees with.

**2. Turns have an actor.** A turn is taken by the **person**, through visible controls, or by the **assistant**, through a real WebMCP tool call. Both reach the same command implementation (CLAUDE.md), and interleaving them in one case is the only way to test that claim rather than assert it.

**3. Four journeys**, 92 checks:

| Journey | What it proves |
| --- | --- |
| `webmcp-hero` | The eight beats of `docs/demo/webmcp-script.md`, with every assistant action a real tool call rather than an HTTP request standing in for one |
| `aws-hero` | The runtime claims of `docs/demo/aws-script.md` actually happened: progressive skill activation, distinct specialists, context injection, GoalLoop validation, human-only consequential action |
| `shared-control` | A person and a host alternating on one case: the person's answer is readable by the host, the host can only *propose*, a stale write is refused with the real sequence |
| `family-novice` | Someone who has never used Sift can answer its questions on screen and be told, after each answer, where they are and what changed |

**4. Opt-in, like `test:host` and `test:deployed`.** It needs a specific browser build and a running instance, so it is never part of `pnpm verify`, which must run offline.

**5. A turn that throws is reported separately from a failing check.** The first multi-journey run printed "31/31 checks passed" for a run in which three of four journeys died on their first turn — a turn that errors runs no checks, so counting only checks reports a perfect score for a catastrophe.

**6. `pnpm webmcp:bridge` exposes the page's tools to any MCP client.** `test:journey` proves the tools are callable and correct, but the *script* chooses every call. The bridge is a stdio MCP server that maps `tools/list` to the page's live registrations and `tools/call` to `WebMCP.invokeTool`, so a real model — Codex, Claude Code — drives the real page with the real descriptions. That is the only way to learn whether a model *finds* the tools and sequences them sensibly. It is a development tool, not shipped.

## What it found

Six defects on the first four runs. **None was reachable by any existing test**, and the unit suite passed before and after every one.

1. **The answer-first hero never named the answer.** A completed investigation favouring the RAV4 rendered the words "Current recommendation" with the car named nowhere above the fold. `ready_blocked` was the only phase with an actual answer and the only one whose headline was a section label. Now "Leading so far: <option>", and "Sift recommends <option>." when a decision is pending — never "Our pick", because readiness is not earned in those phases (change-set §38).

2. **The dock deleted the one action only a human can take.** `MAX_DOCK_ACTIONS = 2` and a plain `slice(0, 2)`; `confirm_shortlist` is the only `humanOnly` move and is **sixth** in `deriveNextMoves`' order. On any case where two earlier moves applied, the person was never offered it and the "only you can do this" note never rendered. The component's own header says what that costs: "the product's central claim would be missing from the exact screen where it matters most." It was. `selectDockActions` now keeps human-only moves through truncation, without reordering what is shown.

3. **The comparison claimed priorities the person had never given.** On the first screen — 0 of 5 covered — the insight card read "…scores highest against what you said matters", "measured across 95% of the weight you have assigned". The orientation shell two inches above said the honest opposite. `deriveInsights` now takes an `InsightContext`.

4. **Car copy on an energy case.** Home Energy Guardian — a case about an HVAC inspection — offered "Confirm your test-drive shortlist", explained as "only you can decide which models are worth going to see". Seen while reviewing journey screenshots; no test asserted the label. Now pack-neutral.

5. **The pane named a product it could not detect.** Covered by ADR 0013; a second instance, the dock's human-only note, was found here and fixed the same way.

6. **Two demo documents disagreed about the same beat.** `aws-script.md` beat 4 told a recorder to film a "genuine validator rejection, not a scripted UI state"; `demo-script.md` Flagged gap #1 documents that GoalLoop validates on attempt 1 in the live click-through and the rejection never fires. `aws-script.md` now carries the warning, and `aws-hero` asserts that nothing claims a "Draft withheld" that did not happen.

Findings 1–4 were found by the `agreement` and `ui` checks; 4 and the UX observations came from **reading the rendered screenshots**, which the harness captures per turn precisely so that a person or a model can.

## Consequences

**37 visual baselines were updated**, across both hero specs at all four viewports, for findings 1, 2, 3 and 4. Each was inspected as actual/expected/diff before the update: every difference is the intended copy change plus the vertical reflow it causes, with no overflow, overlap, or truncation at 390px. Recorded in `docs/build-log.md`.

**A turn's observations are not assertions.** `ctx.observe()` records something worth a human's judgment — "the first thing a new person sees is an answer to a question they have not been asked yet" — without failing a run. A harness that could only pass or fail would have to either ignore these or block on them, and both are wrong.

**Pack-declared wording is the better answer to finding 4** and is not implemented here. The current copy is true for both packs; a pack that wants to say "test-drive shortlist" should declare that term, which is a pack-schema change.
