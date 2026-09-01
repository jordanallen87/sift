# ADR 0010: Option Profiles, Focused Cards, and Pack-Declared Prominence

Status: accepted
Date: 2026-09-01

## Context

The project owner, on the browse grids:

> "Do we have an option profile that the user can view in a dialog/modal for an individual
> option? But yea — same situation — use the dialog/modal approach here. I'm saying this b/c the
> way you have these grids setup - it's cramming a lot of information in them when we should keep
> that focused and keep the extra detail in the profiles."

And, separately:

> "So do we have this designed generically? As in, we could easily switch and use this for other
> shopping use-cases?"

### What was actually there

**A full option profile already existed — for the model only.** `buildOptionDetails`
(`apps/web/src/model-context/case-context.ts:296`) joins an option to its claims and sources and
ships as the WebMCP tool `sift_get_option_details`. Nothing rendered it. **ChatGPT could ask for a
complete per-option profile; a human could not see one.**

**The cards crammed.** A List card carried a headline price, eight identity/spec fields, a wrapped
"standard features" line, and three stacked sections (What we like / What to watch for / Still
researching) — roughly 25 lines. Four of them side by side is four walls of text, and in the
seeded case every "watch for" line ended with the identical phrase "still needs stronger
evidence." Board cards had the opposite problem: 2-4 facts, **no headline stat at all**, and titles
that truncated mid-word.

**Narrow List showed no price.** `pickProminentDefinitions` read only `attributeGroups[0]` at
≤480px, assuming a pack's first group is its most important. For `car-purchase` that group is
`basics`, so a 390px card showed make / model / model year / trim / body style / drivetrain — six
restatements of its own title — and no decision-relevant number, **in the ChatGPT pane that is this
product's primary surface**.

**Provenance was invisible.** `AttributeRecord` carries eight fields; the views read `value` and,
invisibly, `status`. `origin`, `sourceIds`, `confidence`, and `updatedAt` were rendered nowhere, so
a person could never tell a verified number from an asserted one.

**`Recommendation.favoredOptionId` had zero non-test references.** The recommendation never
visually named the option it favored.

## Decision

### 1. The card is the index; the profile is the detail page

`OptionProfileSheet` is mounted once as global chrome, opened from a `View details` control on any
browse card, in both layouts. It shows every attribute grouped by the pack's own `attributeGroups`,
each value's real provenance, the claims and sources recorded about that option, and the notes
attached to it — the human counterpart to `sift_get_option_details`.

Cards drop to the option label, a headline stat, two or three more prominent facts, and a compact
signal row (`9 supported · 14 concerns · 3 unknowns`). Counts, not lists: the three prose sections
were the bulk of the cramming and carried almost no information per line.

`OptionCompareView` and `QuickPickView` are deliberately untouched. A comparison table is the right
place for density, and Quick Pick shows one option at a time, so both have room the grids do not.

### 2. `PresentationDefinition.prominentAttributeIds` — pack-declared, optional

The fix for the missing price is **not** to reorder a pack's groups behind the author's back:
identity fields genuinely do belong first in a detail view and last on a card. Instead the author
says which fields a card leads with.

`pickCardAttributeIds` precedence: declared ids → heaviest `Criterion.appliesToAttribute` weight →
money-first. Identity attributes are excluded under every branch. A pack omitting the field renders
with a less-informed order rather than breaking.

`.optional()` with no default is load-bearing for pack identity: `canonicalize.ts` filters
`undefined` before hashing, so an omitting pack keeps its byte-identical `compiledHash` and every
pinned case stays valid. `compiler.test.ts`'s inline-snapshot hash test guards exactly this and
still passes.

### 3. State the exception, not the rule

The first profile implementation moved the cramming one level down rather than fixing it. Measured
against the real seeded case at 1440px: **3858px of scroll in a 749px viewport** — five screens for
one option — with the sentence "Stated, not independently checked" rendered **18 times** and "Last
updated" **29 times**, all the same date.

So provenance is stated once and then only departed from. `findDominantProvenance` groups rows by
what they would **actually render** (status, origin, `updatedAt`, and the expectation sentence — so
`source` and `corroborated` rows group together, because they are one line on screen), and states
that group once above the rows. A covered row shows only its label, value, and a compact text
marker; a differing row says precisely what differs and nothing it shares with the summary.

Result: **3858px → 1040px**, 5.1 screens → 1.4.

Three invariants hold it honest, each separately mutation-tested:

- A group must be a **strict majority** of all rows and at least three. Majority makes ties
  arithmetically impossible, so there is no arbitrary tiebreak — and when no group qualifies there
  is no summary at all, since a legend true of half the rows is worse than no legend.
- **`status: null` and `status: 'unknown'` can never be summarized away.** They are two different
  facts — no entry at all, versus an entry recording that nobody knows — and are structurally
  barred from forming *or joining* a dominant group.
- A row goes silent only about a value the summary states verbatim; fields are compared one by one.
  Holding this required stating the evidence-bar sentence for every row *with a value*, not only
  for rows falling short — otherwise a row with a lower bar would have rendered identically to a
  covered row and silently inherited a bar untrue of it.

### 4. `signal` gains an explicit `identity` value

`summarizeOptionSignals` excludes identity attributes from its counts, but `deriveOptionProfile`
was still assigning them an evidence-derived signal — so an under-evidenced identity field rendered
with a concern treatment while being absent from the "N need a closer look" count. The screen showed
a warning the summary denied. `identity` maps to the `neutral` tone, which `activity-labels.ts`
already defines as "carries no case-domain status at all."

Not a cosmetic tidy-up: `evidence-expectation.ts`'s own header records that flagging identity
fields as risks shipped once as a defect.

## Genericity: audited, not asserted

The second question was answered by running the identical component tree against the
`home-energy-guardian` pack with **zero code changes**:

| | car-purchase | home-energy-guardian |
|---|---|---|
| count noun | `4 saved cars` | `4 response options` |
| headline | `ADVERTISED PRICE $27,995` | `ROUGH COST $250` |
| supporting facts | out-the-door, mileage, crash rating | effort level, addresses root cause |
| signals | `9 supported · 14 concerns · 3 unknowns` | `5 concerns · 1 unknown` |

A grep for domain vocabulary in component logic (comments stripped) matches exactly three files —
`DemoLauncher`, `HelpButton`, `VehicleCatalogFlow` — all legitimately car-specific entry points.
**Zero hits in any workspace or option component.**

The audit found a real bug the car pack could never have surfaced: `Addresses the root cause`
clipped to `Addresses the root ca…`, a fact **label** carrying `truncate` and missing its 202px
column by ten pixels. A label is the only thing identifying which value is shown, so clipping it
leaves `…, No`, which tells a reader nothing. Fixed to wrap in List and Board. `car-purchase`
simply happens to have short labels.

### Leaks recorded, not fixed

- **The headline stat is hardcoded to the first `money` attribute.** Fine for shopping; a pack
  with no money attribute gets no headline.
- **Board's four column names** (`Comparing` / `Favorites` / `Need to check` / `Ruled out`) are
  English constants, not pack-authored, though `WorkspaceViewState.board` exists for exactly this.

Neither blocks a new pack. Both would need attention before calling this an authoring platform.

## Consequences

- `OptionListView` drops 728 → 492 lines. New: `option-profile.ts`, `OptionProfileSheet.tsx`,
  `OptionCardSignals.tsx` (shared by both grids, so the card signal and the profile cannot drift).
- Test counts: `option-profile.test.ts` 37, `OptionProfileSheet.test.tsx` 48, grids and switcher 67.
  Every assertion that moved has a named home; exactly one had none — a guard against a card
  showing a value confidently *and* flagging it in prose below, whose rendering no longer exists.
  It was replaced with an assertion that the prose is gone, and reported rather than quietly
  dropped.
- A new e2e journey asserts a card leads with pack-declared facts, carries no per-attribute prose,
  and opens a profile with strictly more rows than the card has facts — counted from the page, not
  hard-coded against seed data.
- `pnpm verify` passes all ten stages; Playwright 52/52 across four viewports. No visual baseline
  changed: the named screenshots are taken in Best Match, which this work does not touch.
