# Sift Reuse Attribution

This file records every fragment adapted from another source, per
`docs/reuse-source-map.md` and this project's source-reuse rules: what was
inspected, what was adapted, what was deliberately left out, and the
license/ownership conclusion. Two of the sources below
(`/Users/jordanallen/IdeaProjects/praetor` and
`/Users/jordanallen/IdeaProjects/think-os`) are private sibling projects on
this machine's filesystem, not published open-source packages. Sift does
not import either repository by filesystem path; entries below are
value-level or concept-level adaptations only.

## 2026-08-27 — Design tokens (spacing, radius, shadow, motion scales)

**Source:** `/Users/jordanallen/IdeaProjects/think-os/packages/shared-design/src/tokens.ts`,
a private sibling reference repository. `think-os/AGENTS.md` does not
exist, so there was no source-repo reading instruction to follow beyond
`docs/reuse-source-map.md`'s own rules; the file was inspected under those
rules as a private reference, not a published package with its own
license file.

**Ownership/license conclusion:** No explicit open-source license file was
found for `think-os/packages/shared-design`. Per `docs/reuse-source-map.md`
("If an applicable open-source license is not explicit, reimplement the
concept and record that no source code was copied"), **no source code was
copied.** Only four numeric scales' *values* (spacing steps, radius steps,
shadow philosophy, motion durations/easing curves) were re-typed by hand
as new CSS custom properties in Sift's own file, with several values
changed. This is the "translate selected values into CSS variables; do
not import the package" instruction that `docs/reuse-source-map.md`
assigns to this exact source/destination pair.

**Destination:** `apps/web/src/styles/tokens.css`

**What was adapted, and how it changed:**

- `spacing` (think-os `tokens.ts`, the 4px-grid object keyed `0`–`24`) →
  `--space-0` through `--space-20` in Sift. Taken essentially as-is up
  through `--space-16` (64px); think-os's `20` (80px) and `24` (96px)
  steps were reduced to a single `--space-20` (80px) "desktop-only gutter"
  step, since Sift's canonical viewport is a 390-480px pane where a 96px
  gap never applies.
- `borderRadius` (think-os `xs` 4px – `3xl` 28px, plus `pill`/`full`) →
  `--radius-xs` through `--radius-xl` in Sift. The `xs`–`lg` steps (4/8→6/
  12→10/16→14px, renumbered slightly) were kept in spirit; think-os's
  `xl`/`2xl`/`3xl` (20/24/28px) were collapsed to a single `--radius-xl`
  (18px) and the larger steps dropped entirely — a deliberate divergence
  so Sift's "case dossier" surfaces read closer to a document than a
  bubbly consumer app. `pill`/`full` were kept for status badges and
  avatars/dots respectively.
- `shadows` (think-os: exactly two values, `soft` and `card`, both
  `0 8px 24px rgba(31, 33, 35, 0.10)`, documented as "reserved for
  floating overlays... default cards/buttons/inputs use fill contrast
  instead of a shadow") → `--shadow-soft` and `--shadow-elevated` in Sift.
  The **restraint philosophy was adopted directly** (Sift's tokens.css
  repeats the same "no shadow on ordinary cards" rule). The concrete
  values were changed: two distinct blur/spread pairs instead of one
  repeated value, and the color was rebased onto Sift's own ink color
  (`rgba(27, 29, 27, ...)`) instead of think-os's `rgba(31, 33, 35, ...)`.
- `themeMotion` (think-os: `instant`/`fast`/`normal`/`slow` = 90/140/220/
  360ms, plus `standard`/`exit`/`enter` cubic-bezier easings and a spring
  config) → `--duration-instant` through `--duration-slow` and
  `--ease-standard`/`--ease-exit`/`--ease-enter` in Sift, **kept
  numerically identical** (this is a well-formed, product-agnostic
  utilitarian scale with no branding baked in). think-os's `spring`
  physics config (damping/stiffness/mass, intended for a
  React-Native-style animation library) was **not** adapted — Sift is a
  CSS/DOM web app and has no use for a spring-physics tuple. Sift adds a
  concrete `@media (prefers-reduced-motion: reduce)` override zeroing all
  four durations at `:root`, which think-os's file documents as an intent
  in a code comment but does not itself implement.
- `typography` (think-os's `hero`/`title1`/`title2`/`body`/`bodySmall`/
  `label`/`meta` scale) was **inspected and not adapted.** Sift uses its
  own type scale (`docs/design-system.md`, Typography section) sized for
  a 390-480px reading column with different families entirely (Newsreader
  / Public Sans / IBM Plex Mono vs. think-os's Inter/JetBrains Mono), so
  none of think-os's font-size/line-height/letter-spacing pairs carried
  over.

**What was explicitly not adapted:** `think-os/packages/shared-design/src/colors.ts`
(the Murmur violet/teal palette and light/dark semantic color maps) and
`fonts.ts` (Inter + JetBrains Mono) were read for direction only, per
`docs/reuse-source-map.md`'s instruction to "select only values that
support Sift's calm narrow-pane identity." None of their hex values or
font family names were reused — Sift's palette (`--color-paper`,
`--color-brand`, the nine status tokens) and font choices (Newsreader,
Public Sans, IBM Plex Mono) are new selections made for Sift's own "case
dossier" identity and validated against WCAG contrast independently. See
`docs/design-system.md` for the full palette/typography rationale.

**Test owner:** Playwright visual baselines and axe checks against the
rendered token system (a later task, once components exist) are the
verification surface for this entry; no automated test exists yet for a
CSS-custom-property file in isolation.

## 2026-08-27 — Readiness, Evidence, Activity, and Recommendation/Approval components

**Sources:**
`/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/orchestration/ReadinessPanel.tsx`,
`/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/ReadinessPanel.tsx`,
`/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/inline/renderers/ApprovalGateCard.tsx`,
`/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/inline/renderers/ReadinessStateCard.tsx`,
`/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/hq/ActivityView.tsx`, and
`/Users/jordanallen/IdeaProjects/praetor/apps/web/src/components/strata19/execute/activity-labels.ts`
— all private-sibling-repository files inspected per `docs/reuse-source-map.md`'s
"Praetor and Strata19 UI map" table, which names this exact
source-to-destination mapping.

**Ownership/license conclusion:** Praetor is a private sibling repository
on this machine, not a published open-source package; no explicit
open-source license file governs these components. Per
`docs/reuse-source-map.md`'s rule ("If an applicable open-source license
is not explicit, reimplement the concept and record that no source code
was copied"), **no source code was copied.** Every Sift file below was
written from scratch against Sift's own `@sift/contracts` types, Tailwind
token classes, and `data-testid` conventions; only small structural/
information-architecture ideas were adapted, each recorded individually.

**Destinations:** `apps/web/src/components/ReadinessPanel.tsx`,
`apps/web/src/components/ApprovalCard.tsx`,
`apps/web/src/components/ActivityTimeline.tsx`,
`apps/web/src/components/activity-labels.ts`.

**What was adapted, and how it changed:**

- **`ReadinessStateCard.tsx`'s fail-closed, non-vacuous-measurement
  principle** — its own header comment states: "`ready === false` with an
  empty `blockers` array is a real and important case ... it renders as
  'Not ready' with the check fraction rather than as a blocker list that
  appears to be loading forever." Adapted into `ReadinessPanel.tsx` as the
  rule that a zero-obligation `ready: true` case must render "This case
  has no required questions to resolve yet." rather than a bare "Ready" —
  the same underlying principle (never let an absence of measurement look
  like silent success) applied to Sift's different domain (obligations, not
  spec-completeness checks). No code was copied; Praetor's file has no
  bucket concept at all (it renders one ready/not-ready fact plus a check
  fraction), so `ReadinessPanel.tsx`'s five-bucket layout, `blockers`
  rendering, and all Tailwind/token markup are new.
- **The orchestration `ReadinessPanel.tsx`'s blocker-taxonomy/bucket-
  breakdown idea** — inspected for the general idea of grouping items into
  named buckets with counts and rendering blockers as a distinct callout.
  Not one line was reused: Praetor's version fetches its own data
  (`getReadinessData(projectId)`), uses shadcn `Badge`/`Progress`
  components and Tailwind color-scale classes (`bg-emerald-500` etc.) that
  do not exist in Sift's token system, and models percentage-based
  "required/recommended/optional" scoring, none of which matches Sift's
  five-bucket `ObligationStatus` model. Sift's `ReadinessPanel.tsx` is
  props-driven (never fetches), uses only `apps/web/src/styles/tokens.css`
  CSS variables, and groups by the real `satisfied`/`active`/`blocked`/
  `accepted_uncertainty`/`open` statuses instead.
- **`ApprovalGateCard.tsx`'s "one clear primary action" idea** — its own
  comment: "the approve/reject control itself is the envelope's single
  `primaryAction`; the card never invents a second one, which is also how
  'no self-approval' stays enforceable server-side rather than being a UI
  convention." Adapted into `ApprovalCard.tsx` as: Approve is the single
  visually primary (solid-fill) action; Reject and Request-revision remain
  present (product.md requires all three) but are visually secondary
  (outlined). Praetor's file renders a generic `envelope.payload`
  (`subject`/`decision`/`requestedBy`/`rationale`) through a shared
  `InlineCardShell`/`Badge` system with no revision-instructions form, no
  stamp treatment, and no `actor` concept at all — none of that was
  copied. The settled-state "stamp" (rotated, doubled-border badge) is
  original work building `docs/design-system.md`'s own previously
  documented-but-unbuilt "signature element," not adapted from Praetor.
- **`ActivityView.tsx`'s chronological-grouping/label/detail-disclosure
  information architecture** — inspected only for two ideas, both stated
  explicitly in that file's own header comment: (1) route every enum value
  through a safe-label table with a defensive fallback ("an event `kind`
  this widget bundle has never seen must still never render as its raw
  dotted token") and (2) lead each row with the human-meaningful fact
  (when/what) before correlation ids, not the reverse. Adapted into
  `ActivityTimeline.tsx`'s use of `activity-labels.ts` for every rendered
  `type` and into leading each item with its mapped label/summary/
  timestamp before its `data-event-id`/`data-debug-event-id` correlation
  attributes. None of `ActivityView.tsx`'s actual code was reachable to
  copy even if intended: it depends on Strata19's `CollectionRow`/
  `CollectionSurface`/`EntityDetailProvider` primitives, a `fetchActivity`
  data client, and `KIND_GROUPS`-based server refetching, none of which
  exist in or apply to Sift.
- **`activity-labels.ts` (Strata19's `execute/activity-labels.ts`) — the
  label-registry pattern itself**, per `docs/reuse-source-map.md`'s literal
  instruction: "Adapt the label-registry pattern so user-visible activity
  never falls back to raw internal event names." Sift's
  `apps/web/src/components/activity-labels.ts` reuses only that idea: one
  exhaustive table (here, `PublicActivityEventType` → `{ label, tone }`,
  enforced exhaustive at compile time via `satisfies Record<...>`) plus a
  safe fallback for anything unrecognized. No code, types, or the dotted-
  kind-humanization logic from the Strata19 file were copied — that file
  is built around Strata19's own `kind` taxonomy (`work_item.created` etc.)
  and a separate `enum-humanizer.ts` table-merging system that has no Sift
  equivalent; Sift's table is instead grounded directly in the real,
  closed `PUBLIC_ACTIVITY_EVENT_TYPES` union from `@sift/contracts` and
  product.md's own terminology table (`Obligation` → "Question to
  resolve", `Guide` → "Agent redirected", `Confirm` → "Your approval
  needed") plus value-proposition.md's exact "Draft withheld" copy.

**What was explicitly not adapted:** Praetor's `Badge`/`Progress`/
shadcn component library, its Tailwind color-scale utility classes, its
`CollectionRow`/`CollectionSurface`/`EntityDetailProvider`/
`InlineCardShell` primitives, its data-fetching hooks
(`getReadinessData`, `fetchActivity`), and its own domain types
(`ReadinessBreakdown`, `ActivityEvent`, `InlineRendererPropsV1`) were read
for structure only and none were imported, copied, or renamed into Sift.

**Test owner:** `apps/web/src/components/ReadinessPanel.test.tsx`,
`ApprovalCard.test.tsx`, `ActivityTimeline.test.tsx`, and
`activity-labels.test.ts` — all written this session, each with RTL
behavioral coverage of every state named above plus axe accessibility
checks and a 390px narrow-viewport overflow check.

## 2026-08-27 — Self-hosted webfonts (Newsreader, Public Sans, IBM Plex Mono)

**Source:** the npm-published `@fontsource/newsreader@5.3.0`,
`@fontsource/public-sans@5.3.0`, and `@fontsource/ibm-plex-mono@5.3.0`
packages (`https://fontsource.org`), installed as ordinary `@sift/web`
`dependencies` in `apps/web/package.json` and therefore pinned exactly by
`pnpm-lock.yaml`. These packages are unmodified, static-file
redistributions of the same Google Fonts family sources named in
`docs/design-system.md`'s Typography section; `@fontsource` does no
subsetting or hinting changes beyond Google Fonts' own build, only
packaging (per-weight/style file layout plus a generated CSS file, which
Sift does not use — Sift writes its own `@font-face` rules in
`apps/web/src/styles/global.css`).

**Ownership/license conclusion:** All three families are SIL Open Font
License 1.1 (`OFL-1.1`), confirmed both in each installed package's
`package.json` (`"license": "OFL-1.1"`) and in the full OFL-1.1 license
text each package carries at
`node_modules/@fontsource/<family>/LICENSE`. OFL-1.1 permits unmodified
redistribution and self-hosting with no additional attribution string
required beyond the license text bundled with the font itself (the
packages' own `LICENSE` files satisfy that). **The binary font files were
copied unmodified, renamed only** — no subsetting, hinting, or
re-encoding was performed; byte-for-byte copies of the packages' own
`.woff2` files were placed at the paths `global.css` already referenced.

**Destination:** exactly the 10 paths `global.css`'s header comment and
`docs/design-system.md`'s "Font-loading strategy" section name:

| Destination | Source file (`node_modules/@fontsource/<family>/files/`) |
| --- | --- |
| `apps/web/public/fonts/newsreader/newsreader-400.woff2` | `newsreader-latin-400-normal.woff2` |
| `apps/web/public/fonts/newsreader/newsreader-500.woff2` | `newsreader-latin-500-normal.woff2` |
| `apps/web/public/fonts/newsreader/newsreader-600.woff2` | `newsreader-latin-600-normal.woff2` |
| `apps/web/public/fonts/newsreader/newsreader-400-italic.woff2` | `newsreader-latin-400-italic.woff2` |
| `apps/web/public/fonts/public-sans/public-sans-400.woff2` | `public-sans-latin-400-normal.woff2` |
| `apps/web/public/fonts/public-sans/public-sans-500.woff2` | `public-sans-latin-500-normal.woff2` |
| `apps/web/public/fonts/public-sans/public-sans-600.woff2` | `public-sans-latin-600-normal.woff2` |
| `apps/web/public/fonts/public-sans/public-sans-700.woff2` | `public-sans-latin-700-normal.woff2` |
| `apps/web/public/fonts/ibm-plex-mono/ibm-plex-mono-400.woff2` | `ibm-plex-mono-latin-400-normal.woff2` |
| `apps/web/public/fonts/ibm-plex-mono/ibm-plex-mono-500.woff2` | `ibm-plex-mono-latin-500-normal.woff2` |

Only the Latin subset, `normal` (upright) style, and the four/two weights
Sift's type scale actually uses were copied (`docs/design-system.md`
"Typography": Newsreader 400/500/600 + 400 italic, Public Sans 400/500/
600/700, IBM Plex Mono 400/500) — none of the other weights, styles, or
non-Latin subsets each `@fontsource` package ships were copied, since Sift
has no use for them and copying them would add unused bytes to the
repository.

**Why `@fontsource` rather than a direct Google Fonts download:** an
npm-published package pinned in `pnpm-lock.yaml` is a traceable,
version-pinned, auditable source (`pnpm why @fontsource/newsreader`
resolves to an exact tarball/integrity hash) rather than an ad hoc file
fetched once by hand from `fonts.google.com`'s "Download family" export,
which docs/engineering-principles.md's "Source-project reuse" section's spirit (prefer
inspectable, owned provenance over opaque binaries) favors. This also
means the source is `pnpm install`-reproducible on a clean checkout
without any extra download step, consistent with docs/engineering-principles.md's requirement
that "the fixture build ... run without network access after
installation" — the font files are committed directly (not regenerated by
a postinstall/build script) so they are present even before `pnpm
install` runs, matching `docs/design-system.md`'s original "download ...
and commit them" instruction.

**What was explicitly not adapted:** `@fontsource`'s own generated
`index.css`/`<weight>.css` files (which declare `@font-face` rules
pointing at package-relative `./files/...woff2` paths) were not used —
Sift's `apps/web/src/styles/global.css` declares its own `@font-face`
rules pointing at the root-relative `/fonts/...` paths Vite serves from
`apps/web/public/`, so the two files' filenames could be renamed to Sift's
own short naming convention (`newsreader-400.woff2` instead of
`newsreader-latin-400-normal.woff2`) instead of carrying the subset/style
suffix Sift doesn't need to disambiguate (only the Latin/normal files were
ever copied).

**Verification:** each of the 10 destination files was confirmed to start
with the four-byte WOFF2 magic (`wOF2`, `0x774f4632`) via `xxd -l 4`, and
the real Vite dev server and `vite build` were both used to confirm each
`/fonts/**` URL (dev) and `dist/fonts/**` file (build) serves/contains the
identical binary rather than a 404-turned-`index.html` fallback. See
`docs/build-log.md` for the exact commands and output.

**Test owner:** Playwright visual baselines (`docs/specs/testing.md`
"Playwright visual verification") are the behavioral proof that these
fonts render instead of falling back to system fonts — no unit test
exists for a static binary asset in isolation.

## 2026-08-29 — Vehicle catalog dataset (EPA fueleconomy.gov)

**Source:** `https://www.fueleconomy.gov/feg/epadata/vehicles.csv`, the
U.S. Environmental Protection Agency / Department of Energy's public bulk
vehicle fuel-economy dataset (the same data that powers fueleconomy.gov).
Retrieved live 2026-08-29 (`Last-Modified: Fri, 07 Aug 2026 13:13:18 GMT`,
`ETag "3d9b9836e26dd1:0"`, ~21.7 MB, 47 columns, tens of thousands of
model/trim rows spanning decades).

**Re-retrieved 2026-08-30** to widen the catalog (see the update at the end
of this entry): same URL, ~21.7 MB, **50,242 rows spanning 1984-2027**, and
**84 columns** — the source has gained columns since the 2026-08-29 pull, so
the "47 columns" figure above is accurate to that snapshot, not to the
current dataset.

**Ownership/license conclusion:** This is a work of the U.S. federal
government, public domain in the United States under 17 U.S.C. § 105 — no
copyright attaches, so no license, attribution requirement, or
redistribution restriction applies. This is a materially different
posture from the `think-os`/Praetor private-sibling-repository entries
above (which required a "no explicit license → do not copy source"
judgment call): here, the *entire raw dataset* could be redistributed
verbatim with no legal obligation at all. Sift nonetheless (a) transforms
rather than redistributes the raw file, and (b) attributes it here as
accurate sourcing practice, not because either is legally required.

**Why this source over the alternatives considered:** the spec brief
(`docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md`) asked
for a bounded, deterministic, offline-capable vehicle catalog with real
(not fabricated) year/make/model/trim/body-style/drivetrain/powertrain/
fuel-economy data. EPA fueleconomy.gov was chosen over other candidate
open automotive datasets (e.g. community-maintained VIN-decoder or
NHTSA-derived GitHub repositories) because: it requires no external
research to confirm licensing (government-work status is unambiguous,
unlike a community repository whose own license file would need separate
verification); it is authoritative and independently well-known, not a
scraped or derived secondary copy; it updates yearly and includes the two
most recent model years at retrieval time; and its schema is flat,
well-documented, and trivially machine-parseable (a single CSV with a
stable column set), removing any need for HTML scraping or an unstable
third-party API. NHTSA's separate APIs (recalls, safety ratings, VIN
decoding) were evaluated per the spec brief's §12 and deliberately **not**
integrated — optional live enrichment was judged out of this task's scope
and unnecessary to make the catalog useful (see the completion report).

**What was copied, transformed, and retained:** the raw 21.7 MB / 47-column
CSV was **not** committed or redistributed wholesale. A one-time, offline,
checked-in Python transform
(`packages/catalog/scripts/import-vehicle-catalog.py`) reads the raw CSV
and produces the checked-in `packages/catalog/data/vehicle-catalog.json`
(originally 151 records / ~60 KB / 10 fields; **now 853 records / ~2.5 MB /
83 fields** after the 2026-08-30 widening) by:

- filtering by model year. **Originally** the two most recent years present
  at retrieval time (2025/2026). **Since 2026-08-30** every model year from
  `EARLIEST_YEAR = 2016` forward, expressed as an open-ended floor so a later
  re-import picks up new years automatically instead of freezing at whatever
  was current when the constant was last edited;
- filtering to a hand-curated list of 43 popular make/model families
  (`CURATED` in the script) — a deliberate, bounded scope per the spec
  brief's "do NOT turn this task into building a comprehensive automotive
  data company" (§4/§25), not an attempt at exhaustive market coverage;
- keeping at most 2 distinct drivetrain/powertrain/fuel-economy variants
  per model-year, deduplicated by `(drivetrain, fuelType, combinedMpg)`
  signature, to avoid dozens of near-duplicate trim rows for one popular
  model;
- retaining fields per record. **Originally** 10, then 20, and **since
  2026-08-30 all 83** columns the source publishes, plus a 7-field `source`
  provenance object. The only two source columns not carried are `co2` and
  `co2A`, which are exact integer restatements of `co2TailpipeGpm` and
  `co2TailpipeAGpm`.

  The narrow subsets were chosen by guessing which columns a car shopper
  would care about, and the guess was wrong in both directions: it discarded
  EPA's published annual fuel cost — the single most decision-relevant number
  in the file — while retaining internal identifiers. The rule is now to
  carry everything the source publishes and let the product decide what to
  surface, because a column that was never imported cannot be surfaced later
  without a re-import, whereas an imported and unused column costs only disk.
  Size is not a constraint here: the JSON is read server-side from disk and
  served paginated, and is never bundled into the browser
  (`packages/catalog/src/browser.ts` deliberately excludes the fs-backed
  surface).

  The additions that matter most for a purchase decision are
  `annualFuelCostUsd` (EPA's published annual fuel cost, 100% populated),
  `fiveYearSavingsVsAverageUsd` (the 5-year saved/spent figure versus an
  average new vehicle, 100%), `requiredFuel` (regular vs premium — a
  recurring cost a shopper pays every fill, 100%), and
  `luggageVolumeCuFt`/`passengerVolumeCuFt` (36%: EPA publishes interior
  volume for every passenger car in the catalog, but for only 31 of 351
  compact SUVs, 2 of 81 SUVs, and none of the pickups or minivans). `map-to-option.ts` feeds the
  annual fuel cost into the pack's `car.five_year_fuel_cost` criterion and
  the luggage volume into `car.cargo_volume_cu_ft`, both of which were
  previously satisfiable only from fictional fixture data.

  **Zero is not the same as unknown.** EPA uses three different encodings for
  "not reported" depending on the column, and an earlier single shared
  "treat `<= 0` as missing" rule silently corrupted this catalog twice, both
  times biasing it in the direction that most misleads a shopper: it nulled
  every *negative* `youSaveSpend`, so the catalog reported "unknown" for
  precisely the thirstiest vehicles while confidently reporting a number for
  the efficient ones; and it nulled `co2TailpipeGpm` of `0.0`, which is the
  true measured tailpipe figure for a battery EV, so all 58 EVs reported
  unknown emissions — erasing their strongest number. The transform now
  declares the convention per column (`measured` / `applicable` / `rated` /
  `dual_fuel_measured`) at each call site, and the Zod schema's
  `.nonnegative()` bounds are the second line of defence rather than
  incidental;
- normalizing free-text EPA values into Sift's own vocabulary (e.g. EPA's
  `VClass` "Small Sport Utility Vehicle 4WD" → Sift's `bodyStyle`
  "Compact SUV"; EPA's `drive` "All-Wheel Drive" → Sift's `drivetrain`
  "AWD"; EPA's `fuelType1`/`atvType` combination → Sift's single `fuelType`
  string) via explicit, reviewable lookup tables in the transform script,
  not inference or guessing — every mapping is a literal table entry, and
  any EPA value with no table entry is left as its raw string rather than
  silently dropped or mis-mapped.

**Destination:** `packages/catalog/data/vehicle-catalog.json` (the
committed, curated output), `packages/catalog/scripts/import-vehicle-catalog.py`
(the committed transform, for reproducibility — not run as part of any
`pnpm` script), `packages/catalog/src/schema.ts` (the Zod schema every
record is validated against on load).

**Limitations, stated honestly (also surfaced in-product per
docs/decisions/0003, §"Product limitations"):** catalog coverage is 43
curated families across model years 2016-2027 (853 records), not a
comprehensive market survey. Note the newest model year is always PARTIAL —
EPA publishes early releases first, so 2027 currently carries 29 records
against roughly 75 for each settled year. That is the source's real state,
not a filtering artifact, and it is why `query.test.ts` picks the newest
year that actually contains a given model rather than assuming the newest
year does;
EPA's own per-field completeness varies (e.g. `cylinders` is null for
electric vehicles by nature, `trim` is occasionally EPA's own generic
placeholder text rather than a marketing trim name); the catalog describes
*published specifications*, never a specific listing's price, mileage, or
dealer terms — those remain a separate, explicitly-unknown-until-supplied
layer (`docs/decisions/0003`, "Listing/dealer facts").

**Test owner:** `packages/catalog/src/data.test.ts` (load/validate/cache/
error-path coverage) and `packages/catalog/src/query.test.ts`/
`map-to-option.test.ts` (query correctness and the catalog-to-pack-
attribute mapping, including the "never fabricate an out-of-enum value"
rule) — all written alongside this entry.

## 2026-09-04 — shadcn/ui primitive components and the `cn` helper

**Source:** the [shadcn/ui](https://ui.shadcn.com) component registry
(`https://github.com/shadcn-ui/ui`), **MIT licensed**. shadcn/ui is not a
runtime dependency: its stated distribution model is that the registry's
source is copied into the consuming repository and owned there. This entry
records that copy, which earlier revisions of this file omitted.

**Destinations:** the nineteen primitives under
`apps/web/src/components/ui/` — `alert.tsx`, `badge.tsx`, `button.tsx`,
`card.tsx`, `collapsible.tsx`, `dialog.tsx`, `dropdown-menu.tsx`,
`input.tsx`, `item.tsx`, `label.tsx`, `pagination.tsx`, `select.tsx`,
`separator.tsx`, `sheet.tsx`, `tabs.tsx`, `textarea.tsx`,
`toggle-group.tsx`, `toggle.tsx`, `tooltip.tsx` — plus
`apps/web/src/lib/utils.ts` (the standard `cn` helper: `clsx` then
`tailwind-merge`). `apps/web/components.json` is the registry configuration
that generated them (`"style": "new-york"`, `"baseColor": "neutral"`,
`"iconLibrary": "lucide"`).

**What was adapted rather than taken verbatim.** These are registry
components deliberately edited for Sift's flat, chrome-free right-pane
design system rather than dropped in unchanged. The departures are recorded
in each file's own header comment; the substantive ones are `button.tsx`
(no variant uses a border or a shadow, and upstream's bordered `outline`
variant is redefined to the same background-contrast mechanism every other
flat surface uses, so a caller reaching for it by name still gets a flat
result), `item.tsx` (three named departures from the upstream registry
source), and `pagination.tsx` (a documented departure from the registry's
version). Radii and colors are bound to Sift's own CSS custom properties
(`--radius-sm` and the token palette in `apps/web/src/styles/tokens.css`)
rather than the registry's defaults.

**Genuine npm dependencies, not copied code.** The primitives import
`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, and
`lucide-react` from the registry as ordinary declared dependencies of
`apps/web/package.json`. Those packages are consumed, not vendored, and
carry their own licenses in `node_modules`.

**License/ownership conclusion:** MIT-licensed source, copied under the
project's intended distribution model, adapted, and redistributed here
under this repository's own MIT `LICENSE`. MIT permits this without further
obligation beyond preserving the notice; this entry is the attribution.

**Test owner:** each primitive has a colocated `*.test.tsx` beside it under
`apps/web/src/components/ui/`, and the flat-design constraints above are
additionally enforced by the Playwright visual baselines in `tests/e2e/`.
