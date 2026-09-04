# ADR 0007: Expanded-Width Information Architecture

Status: accepted
Date: 2026-08-31

## Context

`docs/change-sets/2026-08-30-generic-decision-workspace.md` §7 ("Expanded mode vs narrow mode")
requires two intentional information architectures:

> **Narrow/default pane** optimized for: ChatGPT side-by-side collaboration; focused option
> browsing; quick comparison; current priorities; unresolved issues; current recommendation.
> Avoid giant multi-column tables.
>
> **Expanded mode** optimized for: deeper comparison; multi-option table; more attributes visible
> simultaneously; larger board; research inspection; profile editing; richer option management.
>
> Responsive behavior must alter INFORMATION ARCHITECTURE where appropriate, not merely CSS
> widths.

`docs/specs/product.md` §69 restates it with a guardrail: a genuinely different information
architecture at expanded width, but "never a three-column dashboard or full-page navigation
chrome layered onto the narrow design."

**None of that shipped, and the reason is worth recording rather than quietly fixing.**

Three separate top-level components each independently pinned `max-w-[480px]` on their own outer
container — `App.tsx` (the workspace shell), `VehicleCatalogFlow.tsx` (catalog browse), and
`DemoLauncher.tsx`. Measured against the deployed build at a 1440px viewport: **viewport 1440px,
container 448px.** The entire product rendered as a right pane centred in roughly 500px of empty
grey on each side, at every viewport, forever. Expanded mode was not merely unwired; it was
structurally unreachable.

The failure has three distinct causes, and only one of them is a coding mistake:

1. **The plan under-decomposed the requirement.** `docs/planning/plans/2026-08-30-generic-
   decision-workspace.md` turned §7 — an app-wide information-architecture requirement — into
   exactly two tasks: **B3** (a width-detection hook) and **C3** (Compare's narrow/expanded
   switch). No task existed for the shell width cap, for the catalog browse's expanded IA, or for
   List and Board. Both tasks were completed honestly and correctly. The plan then reported
   complete, because every task in it was.

2. **The gap was recorded but never re-planned.** `product.md` §100 states plainly that width
   detection "drives exactly one view's layout" and that a distinct expanded treatment for List
   and Board "remains open work rather than something this build claims." That is honest
   documentation of a shortfall — but writing a gap down is not the same as scheduling it, and
   nothing converted that sentence back into a task.

3. **A stale spec made the gap look intentional.** `docs/design-system.md` (Stacking order)
   asserted "the workspace is single-column at every width," citing **ADR 0002**. But
   `product.md` §55 records that ADR 0004 *replaced* that structure entirely, and the region
   order that paragraph goes on to list ("header → what Sift is doing → our pick → …") is the
   superseded one. An implementer reading the design system would conclude the 480px cap was the
   specified behaviour. It was not.

This is the same seam class this build kept producing: both halves individually correct — the
width hook works, `OptionCompareView` genuinely switches layouts — with nothing connecting them.
The observable symptom was that Compare, the one view that *does* implement an expanded layout,
correctly detected `expanded` at 1440px (the hook keys off the viewport, which was right) and
then rendered its multi-column table into a 448px card, where it survived only because the table
wrapper carries `overflow-x-auto` and could scroll. Nothing failed. No test caught it: the
component tests pass a `layout` prop directly, the Playwright `desktop-1440` project compared
against baselines that themselves encoded the capped layout, and the horizontal-overflow
assertion measures `document.scrollWidth`, which never changes when the clipping happens *inside*
a card.

## Decision

**1. Resolve the spec conflict in favour of `product.md`, and correct the stale text.**

`docs/specs/README.md`'s precedence rule governs: "If specifications disagree, the narrower
specification governs its named subsystem." `design-system.md`'s named subsystem is the design
token system, not workspace information architecture; `product.md` is the narrower specification
for product/UI experience. `product.md` §69 therefore governs, and `design-system.md`'s
"single-column at every width" paragraph is updated rather than preserved — it cites a superseded
ADR and describes a region order that no longer exists.

docs/engineering-principles.md requires the affected spec be updated *before* acceptance behaviour changes, which is
why this ADR and that edit land together with the shell change rather than after the views.

**2. One shared shell, not a per-component width.**

`.page-shell` (`apps/web/src/styles/global.css`) is now the single outer container for every
top-level screen: `max-width: var(--pane-width-max)` (480px) at narrow, `var(--shell-width-max)`
(1280px) above 481px, centred. The three hardcoded `max-w-[480px]` utilities are removed.

The duplication was the actual defect. Three call sites each pinning the same literal is exactly
how an app-wide cap came to exist without anyone deciding on one, and how it stayed invisible to
the width-mode hook that was supposed to drive the expanded layouts. Stating the boundary once,
beside the reasoning, is what makes the next change to it a decision rather than an accident.

1280px rather than unbounded: past roughly that width a comparison table's rows become hard to
track across and running text exceeds a comfortable measure. The shell centres beyond it.

**3. Continuous grids, not new breakpoints.**

`.option-grid` uses `repeat(auto-fill, minmax(min(100%, 320px), 1fr))`. Column count then adapts
continuously from 481px to 1280px, so the awkward range between a right pane and a real desktop
never needs a hand-tuned breakpoint, and it collapses to exactly one column at narrow width on its
own. A future change to `--shell-width-max` needs no corresponding change here.

**4. Views take `layout` as a prop; the switcher owns detection.**

This extends the contract ADR 0005 decision 4 established for Compare rather than inventing a
second mechanism: `WorkspaceViewSwitcher` calls `useWidthMode()` once and passes an explicit
`layout` prop down. View components stay pure. This is also what makes the expanded layouts
testable at all — `matchMedia` does not exist in this repo's jsdom environment, so a hook called
inside the view would pin every test to `narrow` and the expanded IA would be permanently
unasserted.

**5. The guardrail holds.** The primary workspace view still dominates at expanded width. No
persistent left sidebar, no three-column dashboard, no full-page navigation chrome. Expanded mode
gives the primary view more room and richer per-item content; it does not restructure the page
around navigation.

## Consequences

- Every `desktop-1440` visual baseline changes. They are regenerated and inspected as a set, not
  merely accepted because the diff is expected.
- The `desktop-1440` Playwright project stops being a near-duplicate of the 480px project and
  starts testing a genuinely distinct layout — which is what a four-viewport matrix was for.
- The horizontal-overflow assertion's blind spot (container-internal clipping is invisible to
  `document.scrollWidth`) is now known and recorded. Closing it is follow-up work, noted here so
  it is not rediscovered from scratch.
- `product.md` §100's "open work" sentence is replaced by a description of what List and Board
  actually do at each width.
- Narrow behaviour is deliberately unchanged. PAX-P16 (390–480px without horizontal scrolling,
  obscured controls, or clipped status) is unaffected, and the above-the-fold acceptance property
  at 390/430/480 continues to hold because the narrow shell is byte-for-byte the layout it was.
