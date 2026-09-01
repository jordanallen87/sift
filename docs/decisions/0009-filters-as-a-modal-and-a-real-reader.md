# ADR 0009: Filters Move to a Modal, and Actually Filter

Status: accepted
Date: 2026-09-01

## Context

The project owner, after clicking through the two-mode redesign:

> "For the filters, why not just put this in some sort of dialog or modal? And just show the
> applied filters?"

The question is about layout. Answering it surfaced something larger.

### What was actually there

`WorkspaceSidebar` rendered every filter control inline in the expanded-mode left column. Three
things were wrong with that, in ascending order of seriousness.

**1. It made the sidebar the tallest thing on the page.** At 1440 the filter list ran longer than
the main column, leaving visible dead space beside a short Best Match card. This was already
flagged as a known cosmetic issue in the previous round.

**2. Pane mode had no filters at all.** `WorkspaceSidebar.tsx` returns `null` outright at
`layout: 'narrow'`. So filtering — an entire product capability — did not exist below 481px,
directly contradicting ADR 0008:

> "Still has to have the same functionalities, but in web app mode the user isn't looking at it
> via ChatGPT."

Nothing caught this. The e2e specs asserted `workspace-sidebar` is visible at ≥481px and absent
below it, which is exactly the *shape* of the bug, asserted as correct.

**3. The filters did not filter.** A repo-wide `grep -rn "WorkspaceFilter"` matched four files:
the schema that declares it (`packages/contracts/src/case.ts`), the orchestrator that persists it
through `setView` (`apps/web/src/app/App.tsx`), the component that wrote it
(`WorkspaceSidebar.tsx`), and that component's test. **No code read it back.** Every control on
screen produced a real, schema-valid, durably persisted value that changed no pixel. Pressing
"AWD only" wrote to the database and did nothing.

The unit tests all passed, because each asserted that a control emits a correctly shaped
`WorkspaceFilter` — which was true. Nothing asserted that anything consumed one.

## Decision

### 1. One filter surface, mounted as global chrome, identical in both modes

`FilterSheet` holds every control and is mounted once in `App.tsx`, above the narrow/expanded
branch, alongside the other global sheets. It takes no `layout` prop and never calls `matchMedia`:
`ui/sheet.tsx` already presents the same content as a bottom sheet at ≤480px and as a centred
dialog above `min-[481px]`, so one component serves both modes with no variant decision.

This is what closes the pane-mode gap. It is not a side effect of the layout fix — it is the
reason the layout fix is the right one.

### 2. The applied filters live outside the modal

`FilterBar` renders above the results in both shells: a `Filters` button carrying an active count,
one chip per applied filter with a real ✕, a `Clear all`, and a live "3 of 4 saved cars". This is
the shape Airbnb, Zillow, and Etsy all converged on, and it is the half of the owner's instruction
that is not the modal — "and just show the applied filters."

When filters exclude everything, the bar says so in plain words with `Clear all` beside it. An
unexplained empty results area is indistinguishable from a case with no options or a failed load.

### 3. `applyWorkspaceFilters` — the reader that was missing

`workspace-filters.ts` now owns every `WorkspaceFilter` semantic, and `App.tsx` applies it to the
one prop every option view reads (`WorkspaceViewSwitcher.options`).

Two rules carry real product weight and are deliberate:

- **An option with no usable value for a filtered field does not match.** Sift cannot honestly
  claim an unknown price is under $30,000.
- **A filter naming an attribute the current pack version no longer declares is ignored, not
  treated as unsatisfiable.** A case pins a pack version; a `WorkspaceViewState` persisted under an
  older one can carry a `fieldId` that no longer exists, and letting it empty the results would
  look like data loss for a control that is not even on screen to clear.

Scope is deliberately narrow. Filters narrow the **browsing surface only** — never the
recommendation hero, readiness, notes, or the option editor. A recommendation Sift already reached
about an option must stay visible even while a filter hides that option from the list, or the
product appears to silently retract its own answer.

`docs/specs/product.md` scopes `filters` to the Compare view, and ADR 0005's Consequences require
Compare's rendering to be driven by them. Applying them to every option view is a superset of that
requirement, chosen because a filter bar that silently affected only one tab is precisely the
"nothing familiar" problem this round of work exists to fix.

### 4. A filter must group, not isolate

Found by looking at the running product, not reasoned from first principles. The seeded four-car
case rendered **twelve chips across Make, Model, and Trim, every one reading `(1)`** — filling the
sheet above the fold with controls that could only ever leave a single car on screen.

Two changes:

- `planFilter` suppresses a facet whose every value appears exactly once. That is selection, not
  filtering, and the List and Board views already show all the options at once. It is the
  degenerate case of the rule `planFilter` already committed to ("a filter that cannot change
  which options are visible is not a useful control, only visual clutter"). The rule keys on the
  **data**, not on the attribute being an identity field: five cars where two are Toyotas still get
  a real, useful Make facet.
- `discriminatingScore` now measures **the largest group a single choice can keep**, replacing a
  count of distinct values. At Sift's size — at most five options — those two scores are opposites.
  Distinctness peaks when every value is unique, so the old score promoted the three least useful
  controls in the pack to the top of the modal and sank the ones that genuinely split the set.

After both changes the same case leads with `Body style: compact crossover SUV (3) / midsize
crossover wagon (1)` and `Powertrain: gasoline (3) / hybrid (1)` — two filters that were previously
below the fold, under twelve that could not group anything.

### 5. A presentation-only command never claims "Latest command"

Making filters write on every chip press exposed an adjacent defect. `setView`, `focusOption`, and
`focusEvidence` are the three commands that write through `CaseStore.updateSelection` — patching
the snapshot durably, appending no `CaseEvent`, never advancing `eventSequence`. They now carry
`safeDetails.presentationOnly`, declared once in the shared contract as
`PRESENTATION_ONLY_ACTIVITY_DETAIL`, and `deriveReceiptFromEvents` steps over them.

The defect: picking a body-style filter surfaced **"Latest command / Set workspace view to
"quick_pick". / Completed"** directly beneath a hero still reading "Nothing's been looked into
yet." — internal vocabulary, and a non-sequitur to someone shopping for a car. Same shape as the
fixture-seeding exclusion already in that function, found the same way.

The events are still emitted, replayed, and fully visible in the activity stream and Runtime
Inspector. An agent-driven `sift_set_view` genuinely is something a person should be able to watch
ChatGPT do. The flag lets a *consumer* tell the two classes apart; it hides nothing.

### 6. The two view writers share one intent

`App.tsx` runs separate single-flight queues for the view mode and the filters. Both rebuilt the
full `WorkspaceViewState` by spreading `snapshotRef.current.view` — a snapshot that lags whatever
the other writer has in flight. The filter writer therefore computed `mode` from a stale snapshot
and persisted it.

This was disclosed in that file as an accepted residual limitation, and it genuinely was harmless
while nothing read `filters`. Making filters real turned it into a visible defect with a
one-sentence repro: **switch to List, apply a filter, get thrown back to Best Match.**

`intendedViewRef` now holds the person's standing intent for both fields, never cleared, and both
writers read from it. Neither can roll the other back regardless of which response lands first.

Caught by the new e2e journey failing consistently under four parallel workers while passing in
isolation — the timing signature of a real race rather than a flaky selector.

## Consequences

- `WorkspaceSidebar` drops from 1114 to 286 lines and now holds only priorities and "Still
  checking". Its `data-testid` and its `narrow` → `null` behavior are unchanged, so the two ADR
  0008 layout assertions still hold.
- Every filter assertion that lived in `WorkspaceSidebar.test.tsx` survives: the pure-logic ones in
  `workspace-filters.test.ts` (82 tests), the DOM ones in `FilterSheet.test.tsx` (36) and
  `FilterBar.test.tsx` (24). No assertion was dropped.
- `tests/e2e/car-purchase-journey.spec.ts` gains a journey that applies a real filter and asserts
  the **rendered option list** narrows and is restored. A test that only checked "the control
  renders and a filter is persisted" would have passed against the original defect — which is why
  this one counts cards.
- Both journeys now assert the filter bar is present **unconditionally**, outside the layout
  branch, because "identical in both modes" is the property under test.
- All 40 visual baselines regenerated: the filter row adds ~60px to every state. Inspected as a
  set; the only change is the intended row, with no clipping, overlap, or overflow.
- `sift_set_view` still does not expose `filters` to ChatGPT (it accepts `mode`, `focusedOptionId`,
  and `visibleOptionIds`). Making filters real did not hand the model a new capability. Doing so
  deliberately would be a reasonable follow-up and is not part of this decision.

## Known gap, not addressed here

`visibleOptionIds` is the same dead write. `WorkspaceViewSwitcher.tsx` states it is "left for a
future non-Compare consumer to claim; this component does not read it." ChatGPT can call
`sift_set_view` with a list of options to show, receive a success receipt, and the page will not
move. That is the same class of defect as the one this ADR fixes, in a WebMCP-facing path, and it
remains open.
