# ADR 0008: Two Modes, One Product — Web App and ChatGPT Pane

Status: accepted
Date: 2026-09-01

## Context

The project owner, after clicking through the deployed build:

> "you do realize that this is supposed to have a web app view too? It's supposed to emulate a
> shopping website at full width. When it's in the side pane, it's in WebMCP mode where the user
> is viewing it from ChatGPT. Still has to have the same functionalities, but in web app mode the
> user isn't looking at it via ChatGPT."

And, on the workspace as built:

> "These bottom sections should be at the top, but not in this format. Buttons, icon buttons,
> alerts, etc. For example, if it finds things, wouldn't we want to surface that at the top and
> stand out so the user clicks on it? Right now you've got it at the bottom - they'll never even
> see it. ... You literally just crammed everything into a collapsible section."

And, on the design as a whole:

> "take a look at the most popular shopping experiences - UI/UX out there. Nothing is familiar in
> your current design. People need to get on here and know what to do. Your terminology and
> design is completely off."

All three are correct, and ADR 0007 — which widened the shell so expanded mode could exist at all
— only created the room. It did not decide what goes in it.

### What was actually wrong

`docs/change-sets/2026-08-30-generic-decision-workspace.md` §6 says secondary navigation "may be
tabs, compact navigation, drawers, sheets, or context-sensitive sections **depending on
viewport**," and warns against "excessive permanent navigation chrome." §7 requires "two
intentional information architectures."

What shipped was five identical collapsible rows stacked at the bottom of the page:

    What you're looking for            5 priorities set  ›
    Add a note                                           ›
    What Sift found                         0 findings   ›
    Still checking                        6 still open   ›
    Add something Sift should check                      ›

That is the laziest available reading of "context-sensitive sections." It flattens five
categorically different things — a profile, a write action, research output, open questions, and
a create action — into one undifferentiated pattern, and puts the single most valuable event in
the product (Sift found something) below the fold where nobody will scroll to it. A create action
was disguised as a disclosure row. Nothing was an alert, a button, or a badge; everything was a
row with a chevron.

The deeper miss is that the product was built as one layout that gets wider, when it is really
**two products sharing one engine**:

- **Web app mode** — a person on a shopping site, in a browser tab, not talking to ChatGPT. They
  expect what Autotrader, Zillow, and Amazon taught them to expect: a top bar, filters on the
  left, a results grid, a compare tray, a save action.
- **Pane mode** — a person in ChatGPT's in-app browser, at 390-480px, collaborating with a model
  that can drive the page through WebMCP. Here a focused single column, drawers, and sheets are
  correct, and the model is a first-class actor.

Same commands, same events, same deterministic core. Different information architecture, and
different assumptions about who is driving.

## Decision

**1. Two named modes, one command layer.** `useWidthMode`'s existing `narrow` / `expanded` split
(480px, ADR 0005 decision 4) is the mechanism. This ADR gives the two sides product meaning:
`expanded` is *web app mode*, `narrow` is *pane / WebMCP mode*. Every capability must be reachable
in both — the modes differ in presentation and emphasis, never in what a person can do.

**2. Web app mode is a shopping-site shell.** Approved structure:

    ┌──────────────────────────────────────────────────┐
    │ Choose Our Next Car  ● LIVE  [+ Add][Findings 3] │   app bar
    ├──────────────────────────────────────────────────┤
    │ ⚠ 3 findings need your attention       [Review]  │   alert banner
    ├─────────────┬────────────────────────────────────┤
    │ PRIORITIES  │ [Quick Pick][List][Compare][Board] │
    │ Safety ████ │                                    │
    │ Price  ███  │  ┌─────┐ ┌─────┐ ┌─────┐           │   results
    │ FILTERS     │  │RAV4 │ │CR-V │ │CX-5 │           │
    │ AWD only ☑  │  └─────┘ └─────┘ └─────┘           │
    └─────────────┴────────────────────────────────────┘

Filters live in a persistent left sidebar; findings surface as an alert at the top, not a row at
the bottom; creating something is a button in the bar, not a disclosure.

**3. Presentation state stays presentation state.** The sidebar's filters, sort, and visibility
controls write through `updateSelection()` — no event, no `eventSequence` advance, structurally
incapable of invalidating a recommendation (change-set §54, ADR 0005 decision 1). Changing what
is *visible* must never be conflated with changing what the user says *matters*; criteria and
weights remain a separate, decision-mutating command. A filter control may never write a weight.

**4. Familiar vocabulary beats invented vocabulary.** The product's own coinages — "Board,"
"Manage options," "Candidate vehicle," "Request investigation," "What Sift found" — must be
replaced with what shoppers already know, sourced from real reference products rather than
invented a second time. Where a concept is genuinely novel (an agent researching on the user's
behalf, evidence strength, human-only approval), it keeps a clear name rather than being forced
into a familiar-sounding but wrong one: a misleading familiar label is worse than an honest new
one. The terminology map is researched separately and applied across the pack manifests and the
UI together, since `optionLabel`/`optionLabelPlural` come from the pack.

**5. Human authority is unchanged.** Nothing in either mode lets a model approve a consequential
decision. The approval control stays an explicit human action in the Sift UI in both modes.

## Consequences

- The `desktop-1440` Playwright project now tests a genuinely different product surface, not a
  wider version of the pane. Baselines change again, and are inspected rather than accepted.
- New components (app bar, alert banner, sidebar) are built as pure presentational units with
  explicit props so `App.tsx` composes the two shells without either mode's layout leaking into
  the other's components.
- The five bottom disclosure rows are dismantled. Their content survives, relocated: priorities
  and filters into the sidebar, findings into the alert banner and a toolbar entry, "add a
  concern" into an app-bar action, notes into a panel.
- Pane mode keeps disclosures where they genuinely fit — the owner said "I'm not opposed to the
  collapsible type design, but this isn't how it's supposed to work." The objection is to
  everything being a collapsible, not to collapsibles existing.
- Terminology changes touch pack manifests, so `packages/packs` and the UI must change together;
  the compiled-pack hash changes, and pinned cases must be considered.
