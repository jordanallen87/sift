# Pax Reuse Attribution

This file records every fragment adapted from a source-project reference
per `docs/reuse-source-map.md` and `CLAUDE.md`'s "Source-project reuse"
rules: what was inspected, what was adapted, what was deliberately left
out, and the license/ownership conclusion. Both source repositories
(`/Users/jordanallen/IdeaProjects/praetor` and
`/Users/jordanallen/IdeaProjects/think-os`) are private sibling projects on
this machine's filesystem, not published open-source packages. Pax does
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
as new CSS custom properties in Pax's own file, with several values
changed. This is the "translate selected values into CSS variables; do
not import the package" instruction that `docs/reuse-source-map.md`
assigns to this exact source/destination pair.

**Destination:** `apps/web/src/styles/tokens.css`

**What was adapted, and how it changed:**

- `spacing` (think-os `tokens.ts`, the 4px-grid object keyed `0`–`24`) →
  `--space-0` through `--space-20` in Pax. Taken essentially as-is up
  through `--space-16` (64px); think-os's `20` (80px) and `24` (96px)
  steps were reduced to a single `--space-20` (80px) "desktop-only gutter"
  step, since Pax's canonical viewport is a 390-480px pane where a 96px
  gap never applies.
- `borderRadius` (think-os `xs` 4px – `3xl` 28px, plus `pill`/`full`) →
  `--radius-xs` through `--radius-xl` in Pax. The `xs`–`lg` steps (4/8→6/
  12→10/16→14px, renumbered slightly) were kept in spirit; think-os's
  `xl`/`2xl`/`3xl` (20/24/28px) were collapsed to a single `--radius-xl`
  (18px) and the larger steps dropped entirely — a deliberate divergence
  so Pax's "case dossier" surfaces read closer to a document than a
  bubbly consumer app. `pill`/`full` were kept for status badges and
  avatars/dots respectively.
- `shadows` (think-os: exactly two values, `soft` and `card`, both
  `0 8px 24px rgba(31, 33, 35, 0.10)`, documented as "reserved for
  floating overlays... default cards/buttons/inputs use fill contrast
  instead of a shadow") → `--shadow-soft` and `--shadow-elevated` in Pax.
  The **restraint philosophy was adopted directly** (Pax's tokens.css
  repeats the same "no shadow on ordinary cards" rule). The concrete
  values were changed: two distinct blur/spread pairs instead of one
  repeated value, and the color was rebased onto Pax's own ink color
  (`rgba(27, 29, 27, ...)`) instead of think-os's `rgba(31, 33, 35, ...)`.
- `themeMotion` (think-os: `instant`/`fast`/`normal`/`slow` = 90/140/220/
  360ms, plus `standard`/`exit`/`enter` cubic-bezier easings and a spring
  config) → `--duration-instant` through `--duration-slow` and
  `--ease-standard`/`--ease-exit`/`--ease-enter` in Pax, **kept
  numerically identical** (this is a well-formed, product-agnostic
  utilitarian scale with no branding baked in). think-os's `spring`
  physics config (damping/stiffness/mass, intended for a
  React-Native-style animation library) was **not** adapted — Pax is a
  CSS/DOM web app and has no use for a spring-physics tuple. Pax adds a
  concrete `@media (prefers-reduced-motion: reduce)` override zeroing all
  four durations at `:root`, which think-os's file documents as an intent
  in a code comment but does not itself implement.
- `typography` (think-os's `hero`/`title1`/`title2`/`body`/`bodySmall`/
  `label`/`meta` scale) was **inspected and not adapted.** Pax uses its
  own type scale (`docs/design-system.md`, Typography section) sized for
  a 390-480px reading column with different families entirely (Newsreader
  / Public Sans / IBM Plex Mono vs. think-os's Inter/JetBrains Mono), so
  none of think-os's font-size/line-height/letter-spacing pairs carried
  over.

**What was explicitly not adapted:** `think-os/packages/shared-design/src/colors.ts`
(the Murmur violet/teal palette and light/dark semantic color maps) and
`fonts.ts` (Inter + JetBrains Mono) were read for direction only, per
`docs/reuse-source-map.md`'s instruction to "select only values that
support Pax's calm narrow-pane identity." None of their hex values or
font family names were reused — Pax's palette (`--color-paper`,
`--color-brand`, the nine status tokens) and font choices (Newsreader,
Public Sans, IBM Plex Mono) are new selections made for Pax's own "case
dossier" identity and validated against WCAG contrast independently. See
`docs/design-system.md` for the full palette/typography rationale.

**Test owner:** Playwright visual baselines and axe checks against the
rendered token system (a later task, once components exist) are the
verification surface for this entry; no automated test exists yet for a
CSS-custom-property file in isolation.
