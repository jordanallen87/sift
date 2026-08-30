# ADR 0002: Answer-First Workspace Layout

Status: accepted
Date: 2026-08-28

## Context

The shadcn/ui conversion (`d1335cf`, `b45d39e`) was scoped and executed as a pure component-styling swap — custom CSS replaced with shadcn primitives, same DOM, same `data-testid`s. It never touched information architecture. The live product review that followed found the workspace is still one linear stack of eight top-level regions (case header, current focus, readiness, evidence and comparison — itself five more stacked sub-blocks — activity, recommendation, approval), with no tabs, accordion, or sticky navigation, requiring a full scroll to reach the recommendation and the approve action on every case. The project owner's own words after reviewing the live product: "everything is stacked and its a lot of scrolling to find things," followed by an explicit request that non-technical users be able to use the product immediately, and that internal terminology (Evidence, Readiness, Activity, Obligation) be reconsidered.

Three concrete layout directions were designed with real fixture content (the `car-purchase` pack's actual RAV4/CR-V/CX-5/Outback data) and reviewed as HTML mockups before any code was written: (A) an answer-first hero with the rest of the workspace collapsed into disclosure rows carrying live summary counts, (B) a three-tab Compare/Why/Decide split, and (C) a same-scroll reorder that only promotes the recommendation to the top and condenses the comparison table. The project owner approved direction A.

## Decision

1. **Recommendation and approval move to the top of the workspace**, directly below the case header and the existing "current focus" status strip, and stay permanently visible (not collapsible). This directly answers "what does Sift think, and what do I need to do" without any scrolling or interaction.
2. **Comparison, evidence, readiness, and activity become collapsible disclosure rows** (native `<details>`/`<summary>`, one new `DisclosureSection` component), closed by default, each showing a live one-line summary (a count, and a pulsing indicator while work is genuinely in progress) in its closed `<summary>` row. Nothing is hidden — every row's live state is visible without opening it — but nothing competes with the hero for vertical space until the user asks for it.
3. **The proposed-concern/add-a-concern region also becomes a disclosure row**, with one narrow exception: it renders open by default exactly when an agent-proposed case extension is awaiting human confirmation, since that is itself a "your input needed" state that should not be hidden behind a closed row the way passive/informational sections are.
4. **User-facing section vocabulary is rewritten for a first-time, non-technical reader**, extending product.md's existing internal-term-to-UI-label table rather than replacing it:
   - Evidence → **What Sift found**
   - Readiness → **Still checking**
   - Activity → **Sift's work so far**
   - Recommendation → **Our pick**
   - Approval → **Your decision**
   - Comparison → **Compare the options**
   - Current focus → **What Sift is doing**
5. **No existing component's internal logic, props, or `data-testid`s change.** `RecommendationCard`, `ApprovalCard`, `ReadinessPanel`, `EvidenceList`, `ActivityTimeline`, `OptionComparison`, `OptionEditor`, `CustomConcernForm`, and `CaseExtensionReviewCard` are repositioned and given new visible headings only; their existing unit test suites remain the source of truth for their internal behavior. Only `App.tsx`'s composition, a handful of literal heading strings, and the new `DisclosureSection` wrapper are new surface area.
6. **The underlying command model is unchanged.** Every control inside a disclosure row still calls the exact same `SiftCommands` method it called before this task; WebMCP tool behavior, event contracts, and server-side logic are untouched.

## Consequences

- `product.md`'s "Workspace layout" region list and "User-facing terminology" table both change and become the source of truth `App.tsx`'s own doc comment must continue to match verbatim.
- Every Playwright visual baseline for both hero journeys changes and must be regenerated, following `testing.md`'s existing rule: inspect actual/expected/diff before accepting a new baseline, never a blind `--update-snapshots`.
- `docs/submissions/webmcp/demo-script.md` and `docs/submissions/agents-for-humans/demo-script.md` narrate exact on-screen labels and scroll positions from the old layout and must be rewritten to match, since both scripts already carry a hard rule against claiming on-screen state that does not match reality.
- A handful of existing component unit tests assert on the literal old heading text (e.g. `getByRole('heading', { name: 'Evidence' })`) and must be updated to the new label — a deliberate, documented copy change, not a weakened assertion.
- This is reversible at the `App.tsx` composition layer alone: reverting to the previous stacked order does not require touching any child component's internals.
