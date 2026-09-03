/**
 * Quick Pick -- the generic one-option-at-a-time triage view (change set
 * `docs/change-sets/2026-08-30-generic-decision-workspace.md` §9 "Quick Pick
 * / Swipe view"): "A single option should dominate the pane," shown with
 * "identity/label, the most decision-relevant attribute values," a
 * "WHY IT FITS" list of strengths, a "WATCH OUT" list of concerns/unknowns,
 * and three actions -- Pass / Maybe / Shortlist. §49 ("Accessibility")
 * requires that "Swipe is never gesture-only. Every action has accessible
 * controls" -- this component renders real `<button>` elements for all
 * three actions and never requires a gesture to act; a caller may layer
 * swipe gestures on top later without this component changing.
 *
 * Purely presentational, per ADR 0005 (`docs/decisions/
 * 0005-workspace-view-state-and-option-views.md`): it owns no case/command/
 * context access. `options`/`position` are supplied and controlled entirely
 * by the caller (the orchestrator that reads/writes
 * `WorkspaceViewState.quickPick.queue`/`.position` through
 * `updateSelection()` per that ADR's decision 1) -- this component never
 * advances the queue itself, it only reports the option it renders via
 * `onFocusChange` so a caller can keep shared focus (case `activeFocus` /
 * WebMCP `focusedOptionId`) in sync with what the pane actually shows.
 *
 * Reuses the same `EntityRecord`/`AttributeDefinition` consumption pattern
 * and `formatAttributeValue` formatter as `OptionComparison.tsx`, so a
 * pack-native or `custom.*` attribute renders identically in both views:
 * only `AttributeDefinition.label` is ever shown, never `definition.id` or
 * `option.id` -- change set §26/§9's "no raw internal ids in the UI" rule
 * applies here exactly as it does in the comparison table.
 *
 * REDESIGN (this task): the card used to be an undifferentiated wall of
 * `Label: value` text -- every fact, and every strength/concern, built as
 * ONE concatenated string (`` `${definition.label}: ${value}` ``), so
 * nothing about it could be weighted, aligned, or coloured differently from
 * anything else on the card. That was a data-shape problem before it was a
 * visual one: `buildHighlightFacts`/`buildAttributeInsights` below now
 * return `{ label, value }` / `{ label, detail }` pairs, never a pre-joined
 * string, and the JSX renders label and value as separate nodes throughout
 * so each can carry its own weight, size, and colour. Three concrete
 * consequences follow from that fixed shape:
 *
 *   1. **Hierarchy.** The single most decision-relevant attribute (the
 *      first of `highlightDefinitions`, below) renders as a real headline
 *      stat directly under the option's name, not buried mid-list in the
 *      same grey as everything else -- so identity -> that one number ->
 *      the case for/against reads in one glance, generically, for whatever
 *      attribute the pack itself ranks first (no pack-specific "price"
 *      hardcoding).
 *   2. **Specs read as data.** The remaining highlighted attributes render
 *      as a compact two-column label/value grid (a definition list, not
 *      run-on sentences), and every long value (a joined `string_list` like
 *      "Standard features" is the real offender seen in the car pack) is
 *      capped to two lines with the full text still available as a native
 *      `title` tooltip -- capped, never fabricated or silently dropped.
 *   3. **Three visually distinct kinds of statement.** "Why it fits" /
 *      "Watch out" is now the same three-way Strengths / Concerns / Still
 *      unresolved split `OptionListView.tsx` uses (matching terminology and
 *      empty-state copy on purpose, so the two option views read as one
 *      product) -- each rendered with its own `STATUS_TONE_META` tone
 *      (`activity-labels.ts`, the same registry `RecommendationCard.tsx`/
 *      `ApprovalCard.tsx` already use) rather than three identical grey
 *      lists. No new colours: `satisfied` (a fact the card can stand
 *      behind), `blocked` (the same tone this app already gives
 *      `evidence.conflicted` -- a value that exists but cannot be trusted
 *      yet, whether because it is actively disputed or merely
 *      under-evidenced), and `open` (nothing to show at all yet -- the
 *      deliberately hue-less "not started" tone, reused here for "not
 *      known").
 *
 * "Why it fits" / "Watch out" derivation (a judgment call, since the change
 * set's own worked example -- "Strong safety evidence," "Within target
 * budget" -- states conclusions this component has no data to reach: it is
 * never given `Criterion[]` weights/targets, only `AttributeDefinition[]`,
 * so it cannot honestly know whether a given value is "good"). What it *can*
 * know honestly, from `AttributeRecord.status`
 * (`packages/contracts/src/attributes.ts`) and each definition's declared
 * `evidenceExpectation`, is how well-evidenced a value is. That becomes the
 * generic, pack-agnostic signal used here: a value whose evidence meets or
 * exceeds what its definition expects is a "strengths" entry (a fact the
 * pane can stand behind); a value that exists but is conflicted or
 * under-evidenced relative to its definition's expectation is a "concerns"
 * entry; a value that is genuinely missing is a "still unresolved" entry.
 * This keeps the derivation generic across every Decision Pack (§56
 * "Generic does not mean lowest common denominator") rather than
 * hard-coding car-shopping judgments like "excellent cargo space." This is
 * the identical signal `OptionListView.tsx`'s `buildInsights` uses (both
 * import `meetsEvidenceExpectation`/`isIdentityAttribute` from the shared
 * `../lib/evidence-expectation.js` so the one judgment cannot drift between
 * the two views).
 *
 * Two refinements on top of that raw signal, both in `buildAttributeInsights`
 * (`../lib/evidence-expectation.js`'s `isIdentityAttribute` and this
 * function's `highlightedIds` suppression), added after the naive version
 * flagged an option's own identity fields as if they were decision risk:
 * (1) a plain identity/label descriptor (`isIdentityAttribute` -- e.g. a
 * listing's own make/model/trim) carries no decision-insight signal on its
 * own and never appears in any of the three lists, regardless of status;
 * (2) an under-evidenced value that is already shown, unqualified, in the
 * highlight row above is not repeated in "Concerns" -- doing so would
 * contradict the card in the same glance ("Model year: 2022" confidently
 * shown, then "Model year still needs stronger evidence" right below it).
 * A genuinely unknown or conflicted value is never suppressed by either
 * refinement's status branch -- only the "resolved but under-evidenced"
 * branch is -- so "Concerns"/"Still unresolved" still surface real problems.
 *
 * EXPANDED LAYOUT (this task, `docs/decisions/
 * 0008-two-mode-product-architecture.md`): the product now has a second,
 * genuinely wide "web app mode" (>480px, "supposed to emulate a shopping
 * website at full width" per the product owner) alongside the original
 * <=480px pane. A prior pass capped this card at `--pane-width-max` (480px)
 * unconditionally and justified it by quoting ADR 0005 decision 4 ("Quick
 * Pick is not expected to grow a meaningfully different expanded-mode
 * layout beyond more surrounding context") -- correct reasoning when the
 * whole product WAS a 480px column, wrong once a real desktop mode exists:
 * the observed defect was a phone-width card floating in ~700px of dead
 * space inside a ~1180px-wide shopping-site column. That ADR 0005 sentence
 * is superseded for the expanded case by this task; narrow is untouched.
 *
 * `layout: 'narrow' | 'expanded'` follows the exact caller-supplied-prop
 * pattern `OptionCompareView`/`OptionListView`/`OptionBoardView` already use
 * (ADR 0005 Decision 4): `WorkspaceViewSwitcher` owns `useWidthMode` and
 * passes the resolved value down, so this component never calls
 * `matchMedia` itself and stays testable in jsdom (which has no
 * `matchMedia`) by simply passing the prop. Narrow renders the identical
 * markup this component always has -- same structure, same classes, same
 * caps -- selected by an explicit `layout === 'narrow'` branch rather than
 * being the only path, so the pane stays exactly as good as it already was.
 * Expanded is a genuinely different information architecture, not the same
 * card stretched by CSS (the literal thing this task forbids: "simply
 * remove the cap and let one column stretch to 1180px" would produce
 * ~150-character lines), following the three concrete changes below:
 *
 *   1. **Two-column body.** Identity, the dominant stat, and the compact
 *      spec grid render in a left column; the three Strengths/Concerns/
 *      Still-unresolved blocks render in a right column -- so a reader sees
 *      "what is this, what does it cost, what do we know" and "is this one
 *      worth pursuing" side by side, not one below a long scroll of the
 *      other. Built with `grid-cols-[repeat(auto-fit,minmax(360px,1fr))]`
 *      (the same `auto-fit`/`minmax` technique `.option-grid` in
 *      `global.css` already uses for the sibling views, just inlined here
 *      rather than added as a second shared utility): with exactly two
 *      children, `auto-fit` collapses any empty extra track and splits the
 *      available width evenly between the two real columns, so the layout
 *      degrades to one stacked column on its own below ~750px of content
 *      width (the "awkward tablet range" design-system.md names) without a
 *      hand-tuned breakpoint, and never produces a single overly wide
 *      column at any width.
 *   2. **Queue context.** Narrow's single-card-dominates-the-pane design
 *      (§9) has no room to name what comes after the option on screen;
 *      expanded does, and knowing "what's next" is part of deciding whether
 *      to keep looking at THIS one -- so expanded (only) renders a strip
 *      naming the next option in the queue and how many remain after it,
 *      derived from the same `options`/`position` props already used for
 *      the existing "N of total" badge, not a new data source.
 *   3. **A larger, more confident identity/price treatment.** The option
 *      name and dominant stat step up one type scale at expanded
 *      (`--font-size-lg` -> `--font-size-xl` for the name;
 *      `--font-size-md` -> `--font-size-2xl` for the dominant stat --
 *      `--font-size-2xl` is tokens.css's own "reserved for desktop-width
 *      hero use" size, and a price/identity hero on a shopping-site card is
 *      exactly that reservation's intended use, not a new precedent), plus
 *      slightly higher highlight/insight caps
 *      (`MAX_HIGHLIGHT_ATTRIBUTES_EXPANDED`/`MAX_INSIGHT_ITEMS_EXPANDED`)
 *      since the two-column body has the width to show more without
 *      crowding -- the same "narrow keeps the original cap, expanded raises
 *      it" shape `OptionListView.tsx`'s
 *      `MAX_PROMINENT_ATTRIBUTES_NARROW`/`_EXPANDED` already establishes.
 *
 * REACTIVE TRIAGE CONTROL (this task, product-owner review: "The Pass,
 * Unsure, and Keep buttons should be reactive"): three flat, unrelated
 * `<button>`s gave no feedback about which disposition an option already
 * carried and no acknowledgement at the moment of a press. Fixed three ways:
 *
 *   1. **One control, not three buttons.** `ui/toggle-group.tsx`'s
 *      `ToggleGroup`/`ToggleGroupItem` (already used this way by
 *      `EvidenceCard.tsx`'s own disposition control) render the
 *      segmented-look row. `type="multiple"` rather than the seemingly
 *      obvious `"single"` is deliberate: Radix's `"single"` mode renders
 *      `role="radio"`/`aria-checked` and explicitly zeroes `aria-pressed`
 *      on every item (`@radix-ui/react-toggle-group`'s
 *      `ToggleGroupItemImpl`) -- exactly the attribute this task requires.
 *      `"multiple"` leaves `aria-pressed` wired straight through to the
 *      base `Toggle` primitive from the Root's own controlled `value`
 *      array; exclusivity is still guaranteed because `selectedValues`
 *      below is built to hold at most one entry, and each item dispatches
 *      its own command directly (never through the Root's
 *      `onValueChange`) rather than trusting Radix's default
 *      "activating adds to the array" multi-select merge. `rovingFocus={false}`
 *      keeps the three buttons individually Tab-reachable in document
 *      order -- Radix's default roving-tabindex behavior (one shared tab
 *      stop, arrow keys between items) would have silently broken the
 *      existing "reach and activate all three by keyboard alone" contract.
 *      `role="group"` overrides the Root's own hardcoded `role="toolbar"`
 *      (a real mismatch once roving focus, the convention toolbar implies,
 *      is turned off).
 *   2. **Same-frame acknowledgement.** `optimistic` local state is set the
 *      instant a button is pressed, before `onKeep`/`onPass`/`onUnsure` is
 *      even called -- `displayedDisposition` below reads it first and falls
 *      back to the real `dispositions` prop, so the pressed button shows
 *      selected in the same render, not after a round trip. It clears
 *      itself once the real prop confirms the same value (an effect
 *      below), immediately if the caller's dispatch rejects
 *      (`pressDisposition`), or the moment the card moves to a different
 *      option (a second effect) -- an echo must never outlive the option it
 *      was about. The three dispatch props may now return
 *      `void | Promise<unknown>` (widened, not narrowed -- every existing
 *      `() => void` caller, including today's fire-and-forget `App.tsx`
 *      wiring, stays assignable) purely so a caller that wants a failed
 *      command to revert the button can report one; a caller that doesn't
 *      is unaffected.
 *   3. **Selected state reuses this card's own tone vocabulary**, not a new
 *      color: Keep reuses `satisfied` (a decision the pane can stand
 *      behind), Unsure reuses `accepted-uncertainty` (this app's existing
 *      tone for a genuinely open question -- an unusually literal fit),
 *      Pass reuses `neutral` (no case-domain judgment implied by setting an
 *      option aside). Keep's UNSELECTED resting state stays the
 *      brand-filled treatment it always had (`bg-primary`) regardless of
 *      selection, so it keeps reading as the visually primary choice even
 *      before anything is decided; Pass/Unsure's unselected resting state
 *      is the plain flat `bg-secondary` segment treatment.
 *      `transition-colors duration-[var(--duration-fast)]` is the only new
 *      transition -- global.css's blanket
 *      `@media (prefers-reduced-motion: reduce)` rule already forces every
 *      element's `transition-duration` to near-zero, so this needs no
 *      separate reduced-motion branch of its own.
 */
import { useEffect, useMemo, useState } from 'react';
import type { AttributeDefinition, CandidateDisposition, EntityRecord } from '@sift/contracts';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatAttributeValue } from './attribute-value-format.js';
import { isIdentityAttribute, meetsEvidenceExpectation } from '../lib/evidence-expectation.js';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

/** How the card refers back to a decision already made. */
const DISPOSITION_PAST_TENSE: Record<CandidateDisposition, string> = {
  unreviewed: 'have not judged',
  keep: 'kept',
  pass: 'passed on',
  unsure: 'were unsure about',
};

/** Every `CandidateDisposition` the segmented control can itself select -- `unreviewed` is expressed as "nothing selected" (an empty `selectedValues` array below), not a fourth button; Undo is the explicit affordance back to it. */
type QuickPickDisposition = Exclude<CandidateDisposition, 'unreviewed'>;

/** Selected-segment tone, reusing this card's one status-tone vocabulary (`STATUS_TONE_META`, imported above) instead of inventing new colors -- see this file's header comment, "REACTIVE TRIAGE CONTROL" section 3, for why each mapping was chosen. */
const QUICK_PICK_TONE: Record<QuickPickDisposition, StatusTone> = {
  keep: 'satisfied',
  unsure: 'accepted-uncertainty',
  pass: 'neutral',
};

/**
 * Loosely detects a thenable rather than importing a helper for it. The
 * round trip is optional -- a caller may still return plain `void` (e.g.
 * today's fire-and-forget `App.tsx` wiring), so this has to tolerate any
 * return shape, not assume a real `Promise`.
 */
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

export interface QuickPickViewProps {
  /** The full triage queue, in the caller's order. Only `options[position]` is rendered -- one option dominates the pane (change set §9). */
  options: EntityRecord[];
  attributeDefinitions: AttributeDefinition[];
  /** 0-based index into `options` for the option currently on screen. `position >= options.length` (including an empty queue) renders the explicit end-of-queue state. */
  position: number;
  /**
   * The judgment already recorded for each candidate, keyed by option id.
   * Read from canonical case state, not held here: a reload has to land on
   * the same picture, and ChatGPT has to be able to read back what the
   * person actually did.
   */
  dispositions: Record<string, CandidateDisposition>;
  /**
   * Fired with the current option's id when the person keeps it for a
   * closer look. May return a promise: the segmented control shows the
   * choice the instant it is pressed regardless, but if the returned
   * promise rejects it reverts rather than keep showing a choice the case
   * does not actually hold. Returning nothing (today's `App.tsx` wiring) is
   * equally valid -- the optimistic echo simply clears once `dispositions`
   * itself confirms the change instead.
   */
  onKeep: (optionId: string) => void | Promise<unknown>;
  /** Fired with the current option's id when the person passes on it. Does not advance the queue itself -- the caller decides what happens next. Same optional-promise-for-revert contract as `onKeep`. */
  onPass: (optionId: string) => void | Promise<unknown>;
  /** Fired with the current option's id when the person is undecided. Creates an information need rather than a verdict. Same optional-promise-for-revert contract as `onKeep`. */
  onUnsure: (optionId: string) => void | Promise<unknown>;
  /** Fired with the current option's id to put it back to unreviewed. */
  onUndo: (optionId: string) => void;
  /** Caller-decided information architecture (ADR 0005 Decision 4) -- this component never calls `matchMedia` itself. `WorkspaceViewSwitcher` resolves the real viewport via `useWidthMode` and passes it down, exactly like `OptionListView`/`OptionCompareView`/`OptionBoardView` already receive it. See this file's header comment "EXPANDED LAYOUT" section for exactly what changes at each value. */
  layout: 'narrow' | 'expanded';
  /** Fired with an option's id whenever it becomes the one rendered on screen -- on mount and whenever the caller changes `position`/`options` to bring a different option into view. Never fired while the queue is empty/exhausted. */
  onFocusChange: (optionId: string) => void;
}

// Caps on the derived lists and the attribute-highlight row, so the card
// stays compact enough to "dominate the pane" at 390px (§9) rather than
// growing without bound for an option with many attributes. The highlight
// cap covers the dominant stat plus the compact spec grid together (one
// dominant + up to three grid tiles); the insight cap now applies to each
// of Strengths/Concerns/Still-unresolved independently, since splitting the
// old single "watch out" bucket into two on purpose (see file header) means
// they are no longer competing for one shared budget.
//
// EXPANDED LAYOUT (this task): narrow reproduces the original numbers
// byte-for-byte (see file header). Expanded raises both caps -- the
// two-column body genuinely has the width to show more without crowding,
// the same "narrow keeps the original cap, expanded raises it" shape
// `OptionListView.tsx`'s `MAX_PROMINENT_ATTRIBUTES_NARROW`/`_EXPANDED`
// already establishes for the sibling view.
const MAX_HIGHLIGHT_ATTRIBUTES_NARROW = 4;
const MAX_HIGHLIGHT_ATTRIBUTES_EXPANDED = 6;
const MAX_INSIGHT_ITEMS_NARROW = 4;
const MAX_INSIGHT_ITEMS_EXPANDED = 6;

/** A single label/value pair for the highlight row -- deliberately two fields, never a pre-joined string, so the dominant stat and the compact spec grid can each style label and value differently. `known: false` is the sole signal the value column needs to render the honest "Unknown" muted style instead of inventing a value. */
interface AttributeFact {
  definitionId: string;
  label: string;
  value: string;
  known: boolean;
}

function buildHighlightFacts(
  option: EntityRecord,
  definitions: AttributeDefinition[],
): AttributeFact[] {
  return definitions.map((definition) => {
    // Narrow on the value itself rather than on a separate `known` boolean:
    // TypeScript cannot carry a narrowing through a boolean variable, so the
    // boolean form required `record!.value!` non-null assertions to compile,
    // and one of them was redundant. Binding the value once removes both
    // assertions and keeps the "unknown stays explicitly unknown" rule
    // readable in a single expression.
    const value = option.attributes[definition.id]?.value;
    return {
      definitionId: definition.id,
      label: definition.label,
      value: value !== undefined ? formatAttributeValue(value) : 'Unknown',
      known: value !== undefined,
    };
  });
}

/** A single Strengths/Concerns/Still-unresolved entry -- again `label` and `detail` are kept apart rather than pre-joined, so `label` can render bold/emphasised while `detail` reads as the plain continuation of the statement. */
interface AttributeInsight {
  definitionId: string;
  label: string;
  detail: string;
}

interface AttributeInsights {
  strengths: AttributeInsight[];
  concerns: AttributeInsight[];
  stillUnresolved: AttributeInsight[];
}

function buildAttributeInsights(
  option: EntityRecord,
  applicableDefinitions: AttributeDefinition[],
  highlightedIds: ReadonlySet<string>,
  // Layout-dependent (`MAX_INSIGHT_ITEMS_NARROW`/`_EXPANDED`) -- passed in
  // rather than read from a module constant directly, so this pure function
  // stays agnostic to `layout` itself and the caller (the component below)
  // is the only place that decides which cap applies.
  maxItems: number,
): AttributeInsights {
  const strengths: AttributeInsight[] = [];
  const concerns: AttributeInsight[] = [];
  const stillUnresolved: AttributeInsight[] = [];

  for (const definition of applicableDefinitions) {
    // A plain identity/label descriptor (e.g. a listing's own make/model/
    // trim) carries no decision-insight signal on its own -- see
    // `isIdentityAttribute`'s doc comment. Skipped before any evidence
    // check, so it never appears in any of the three lists regardless of
    // status -- this is what stops "Make still needs stronger evidence"
    // noise for an option's own identity fields (this module's header
    // comment, "'Why it fits' / 'Watch out' derivation").
    if (isIdentityAttribute(definition)) continue;

    const record = option.attributes[definition.id];

    if (record === undefined || record.status === 'unknown') {
      stillUnresolved.push({
        definitionId: definition.id,
        label: definition.label,
        detail: 'is still unknown',
      });
      continue;
    }
    if (record.status === 'conflicted') {
      concerns.push({
        definitionId: definition.id,
        label: definition.label,
        detail: 'has conflicting information',
      });
      continue;
    }
    // Schema guarantee (`AttributeRecordSchema`'s `superRefine`): `value` is
    // present whenever `status` isn't `'unknown'`. Guarded defensively
    // rather than asserted, so a malformed record degrades to "still
    // unresolved" instead of throwing.
    if (record.value === undefined) {
      stillUnresolved.push({
        definitionId: definition.id,
        label: definition.label,
        detail: 'is still unknown',
      });
      continue;
    }

    if (meetsEvidenceExpectation(record.status, definition.evidenceExpectation)) {
      strengths.push({
        definitionId: definition.id,
        label: definition.label,
        detail: formatAttributeValue(record.value),
      });
    } else if (!highlightedIds.has(definition.id)) {
      // Under-evidenced, but the same value is already shown, unqualified,
      // in the highlight row above -- repeating "still needs stronger
      // evidence" right under a value the card just asserted with no
      // caveat would contradict the card in the same glance (the observed
      // "Model year: 2022" / "Model year still needs stronger evidence"
      // defect). Suppressed only for this branch: a genuinely unknown or
      // conflicted value is never suppressed (it must still show as a real
      // problem), and a value that DOES meet its evidence bar is repeated
      // deliberately, as confirmation rather than contradiction.
      concerns.push({
        definitionId: definition.id,
        label: definition.label,
        detail: 'still needs stronger evidence',
      });
    }
  }

  return {
    strengths: strengths.slice(0, maxItems),
    concerns: concerns.slice(0, maxItems),
    stillUnresolved: stillUnresolved.slice(0, maxItems),
  };
}

interface InsightSectionProps {
  testId: string;
  heading: string;
  tone: StatusTone;
  emptyText: string;
  items: AttributeInsight[];
  /** Text glued between the bold label and its detail: a colon for the spec-like Strengths list (a fact the card confirms, "Price: $32,400"), a single space for the prose Concerns/Still-unresolved lists (a sentence continuing on from the label, "Reliability has conflicting information"). Keeping this as a render-time join -- rather than baking it into `detail` -- is the same "don't pre-concatenate" fix the file header describes, applied to the separator too. */
  labelSeparator: string;
}

/**
 * Shared renderer for the three Strengths/Concerns/Still-unresolved blocks.
 * Every block always renders its heading (never hidden entirely, even when
 * empty) so the card's shape stays predictable as an option's evidence
 * changes underneath it -- an empty block gets a plain muted heading and an
 * honest "nothing yet" sentence instead of a fabricated entry, matching
 * `RecommendationCard.tsx`'s "never render what cannot be true" rule at the
 * item level while still giving the SECTION a stable, always-visible home.
 * A tinted background and the tone's icon appear only once the section has
 * real content -- an empty "Concerns" block tinted like an active warning
 * would itself be a false signal.
 */
function InsightSection({
  testId,
  heading,
  tone,
  emptyText,
  items,
  labelSeparator,
}: InsightSectionProps) {
  const meta = STATUS_TONE_META[tone];
  const hasItems = items.length > 0;
  return (
    <div
      data-testid={testId}
      className="flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] p-[var(--space-2)]"
      style={hasItems ? { backgroundColor: meta.bg } : undefined}
    >
      <h4
        className="label-caps flex items-center gap-[var(--space-1)]"
        style={{ color: hasItems ? meta.ink : 'var(--color-ink-secondary)' }}
      >
        {hasItems ? <span aria-hidden="true">{meta.icon}</span> : null}
        {heading}
      </h4>
      {hasItems ? (
        <ul className="flex flex-col gap-[var(--space-0-5)]">
          {items.map((item) => (
            <li
              key={item.definitionId}
              data-testid={`${testId}-${item.definitionId}`}
              className="text-[length:var(--font-size-sm)]"
              style={{ color: meta.ink }}
            >
              <span className="font-semibold">{item.label}</span>
              {labelSeparator}
              {/* `detail` is a short fixed phrase for Concerns/Still
                  unresolved, but for Strengths it is a real formatted
                  attribute value -- the same long-`string_list` risk the
                  highlight grid guards against (a car pack's "Standard
                  features" is the concrete offender). Capped and
                  disclosure-via-`title`'d identically here for the same
                  reason, rather than only where the bug was first noticed. */}
              <span className="line-clamp-2 align-bottom" title={item.detail}>
                {item.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p
          data-testid={`${testId}-empty`}
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]"
        >
          {emptyText}
        </p>
      )}
    </div>
  );
}

export function QuickPickView({
  options,
  attributeDefinitions,
  position,
  dispositions,
  onKeep,
  onPass,
  onUnsure,
  onUndo,
  layout,
  onFocusChange,
}: QuickPickViewProps) {
  const currentOption = options[position] ?? null;
  const currentOptionId = currentOption?.id ?? null;
  const currentDisposition = currentOptionId === null ? undefined : dispositions[currentOptionId];

  // The optimistic echo of a just-pressed triage choice -- see this file's
  // header comment, "REACTIVE TRIAGE CONTROL" section 2, for the full
  // reasoning. `null` means "nothing pending, trust `currentDisposition`."
  const [optimistic, setOptimistic] = useState<{
    optionId: string;
    disposition: QuickPickDisposition;
  } | null>(null);

  // A fresh card means a fresh choice -- an optimistic value left over from
  // the option that was on screen a moment ago must never bleed onto the
  // next one.
  useEffect(() => {
    setOptimistic(null);
  }, [currentOptionId]);

  // Once the real, core-owned disposition catches up to what this component
  // already showed optimistically, drop the local echo. Holding a confirmed
  // choice in local state forever would let a later external change (e.g.
  // Undo from a different surface, or a different device in the same case)
  // go unnoticed.
  useEffect(() => {
    setOptimistic((current) => {
      if (current?.optionId !== currentOptionId) return current;
      return current.disposition === (currentDisposition ?? 'unreviewed') ? null : current;
    });
  }, [currentDisposition, currentOptionId]);

  // The single source of truth the buttons, the segmented control's
  // `aria-pressed` states, and the "You kept/passed/were unsure about this
  // one" caption below all read from -- so none of them can ever disagree
  // with each other (requirement 1).
  const displayedDisposition: CandidateDisposition =
    optimistic !== null && optimistic.optionId === currentOptionId
      ? optimistic.disposition
      : (currentDisposition ?? 'unreviewed');
  const selectedValues = displayedDisposition === 'unreviewed' ? [] : [displayedDisposition];

  /**
   * Presses one of the three segments. Sets the optimistic echo before
   * calling the caller's handler -- same-frame acknowledgement (requirement
   * 2) does not wait to find out whether the caller's dispatch is
   * synchronous. Re-pressing the already-selected segment is a no-op
   * (matches `EvidenceCard.tsx`'s identical guard for its own segmented
   * disposition control) -- Undo, not a second press of the same button, is
   * this product's affordance back to "nothing decided."
   */
  function pressDisposition(
    disposition: QuickPickDisposition,
    dispatch: (optionId: string) => void | Promise<unknown>,
  ) {
    if (currentOption === null || disposition === displayedDisposition) return;
    const optionId = currentOption.id;
    setOptimistic({ optionId, disposition });
    const result = dispatch(optionId);
    if (isThenable(result)) {
      result.then(undefined, () => {
        // The case never actually recorded this choice -- never leave a
        // button showing a choice it does not hold (requirement 2). Only
        // clear if nothing newer already took its place (another press, or
        // the card having moved on) -- a stale rejection must not stomp a
        // choice made after it.
        setOptimistic((current) =>
          current !== null && current.optionId === optionId && current.disposition === disposition
            ? null
            : current,
        );
      });
    }
  }

  const applicableDefinitions = useMemo(() => {
    if (currentOption === null) return [];
    const kind = currentOption.kind;
    return attributeDefinitions.filter((definition) => definition.appliesTo.includes(kind));
  }, [attributeDefinitions, currentOption]);

  // "the most decision-relevant attribute values" (§9): definitions the
  // pack marked as comparison-relevant (`comparison !== 'none'`) come
  // first; if a pack applies no comparison direction to any applicable
  // attribute (comparison isn't declared at all), fall back to the first
  // few applicable attributes so the card still shows real facts rather
  // than only the option's bare label. This is the SET shown in the
  // highlight row (dominant stat + grid, below) and the suppression set
  // `buildAttributeInsights` uses -- order within it does not matter for
  // either of those two uses, only membership does.
  const highlightDefinitions = useMemo(() => {
    const comparisonRelevant = applicableDefinitions.filter(
      (definition) => definition.comparison !== 'none',
    );
    const source = comparisonRelevant.length > 0 ? comparisonRelevant : applicableDefinitions;
    const maxHighlight =
      layout === 'expanded' ? MAX_HIGHLIGHT_ATTRIBUTES_EXPANDED : MAX_HIGHLIGHT_ATTRIBUTES_NARROW;
    return source.slice(0, maxHighlight);
  }, [applicableDefinitions, layout]);

  // Which ONE of `highlightDefinitions` becomes the dominant stat DOES care
  // about order -- and a pack's raw attribute-declaration order is not
  // itself a reliable "most decision-relevant" signal (the car pack
  // declares `car.model_year` before `car.advertised_price`, which put
  // "Model year: 2022" in the hero slot and left price back in the grid --
  // the exact "buried" defect this task exists to fix, just relocated).
  // A `valueType: 'money'` attribute is promoted to the front when one
  // exists among the highlighted set: a decision is nearly always
  // foregrounded by a cost/value figure when the pack has one (a car's
  // price, Home Energy Guardian's monthly cost/savings), and this reads the
  // signal off `AttributeValue`'s own type union -- a contract-level
  // concept every pack shares -- never a specific attribute id or label, so
  // it makes no car-shopping-specific assumption. A pack with no
  // money-typed decision-relevant attribute at all keeps its own declared
  // order untouched.
  const orderedHighlightDefinitions = useMemo(() => {
    const moneyIndex = highlightDefinitions.findIndex(
      (definition) => definition.valueType === 'money',
    );
    if (moneyIndex <= 0) return highlightDefinitions;
    const reordered = [...highlightDefinitions];
    const [moneyDefinition] = reordered.splice(moneyIndex, 1);
    reordered.unshift(moneyDefinition!);
    return reordered;
  }, [highlightDefinitions]);

  const highlightFacts = useMemo(() => {
    if (currentOption === null) return [];
    return buildHighlightFacts(currentOption, orderedHighlightDefinitions);
  }, [currentOption, orderedHighlightDefinitions]);

  const insights = useMemo(() => {
    if (currentOption === null) {
      return { strengths: [], concerns: [], stillUnresolved: [] };
    }
    const highlightedIds = new Set(highlightDefinitions.map((definition) => definition.id));
    const maxInsightItems =
      layout === 'expanded' ? MAX_INSIGHT_ITEMS_EXPANDED : MAX_INSIGHT_ITEMS_NARROW;
    return buildAttributeInsights(
      currentOption,
      applicableDefinitions,
      highlightedIds,
      maxInsightItems,
    );
  }, [currentOption, applicableDefinitions, highlightDefinitions, layout]);

  // Reports the option actually on screen so a caller can keep shared focus
  // (case `activeFocus`, WebMCP `focusedOptionId`) synchronized -- change
  // set §30 "WebMCP should control focus" / §59's Quick Pick shared-focus
  // demo moment. `onFocusChange` is deliberately omitted from the dependency
  // array: this project has no react-hooks lint rule to satisfy by listing
  // it, and this component must not treat every render (which may supply a
  // fresh callback identity) as a focus change -- only an actual change of
  // which option is on screen should fire it.
  useEffect(() => {
    if (currentOptionId !== null) {
      onFocusChange(currentOptionId);
    }
  }, [currentOptionId]);

  const isEndOfQueue = currentOption === null;
  // The dominant stat is always `highlightFacts[0]` (see the
  // `highlightDefinitions` comment above); everything after it renders as
  // the compact spec grid. Both are plain array operations on the same
  // `AttributeFact[]`, never a second, differently-derived list, so the
  // dominant stat and the grid tiles can never disagree about a value.
  const [dominantFact, ...gridFacts] = highlightFacts;

  // Queue context (EXPANDED LAYOUT, this task's file-header section 2):
  // "what's next" and "how many remain" -- info the narrow pane cannot
  // afford (§9's "a single option should dominate the pane" leaves no room
  // to name a second option), but expanded's extra width can show alongside
  // the card without displacing anything else. Plain array indexing off the
  // same `options`/`position` props the "N of total" badge above already
  // reads -- not a new data source -- and computed unconditionally like
  // `isEndOfQueue`/`dominantFact` above rather than behind a `useMemo`,
  // since it is not expensive enough to warrant one.
  const remainingAfterCurrent = isEndOfQueue ? 0 : options.length - position - 1;
  const nextOption = remainingAfterCurrent > 0 ? (options[position + 1] ?? null) : null;

  // `identityHeading`/`highlightsBlock`/`insightSections` are computed once
  // here, before the `layout` branch below decides how to ARRANGE them.
  // Narrow and expanded share the exact same fact/insight computation from
  // above (`dominantFact`, `gridFacts`, `insights`); only their typography
  // and container change. This split (compute once, arrange twice) is what
  // keeps the narrow branch rendering byte-for-byte the same three pieces,
  // in the same order, it always has -- selected by an explicit
  // `layout === 'narrow'` branch instead of being the only path.
  const identityHeading =
    currentOption !== null ? (
      <h3
        data-testid="quick-pick-option-label"
        // Section 3 of the file-header "EXPANDED LAYOUT" note: one type
        // scale up at expanded (`--font-size-lg` -> `--font-size-xl`) for a
        // more confident shopping-site-hero identity treatment. Narrow's
        // class list is otherwise identical to the original (only the
        // string's internal ordering differs, which Tailwind/CSS does not
        // care about).
        className={`font-[family-name:var(--font-display)] font-semibold text-foreground ${
          layout === 'expanded'
            ? 'text-[length:var(--font-size-xl)]'
            : 'text-[length:var(--font-size-lg)]'
        }`}
      >
        {currentOption.label}
      </h3>
    ) : null;

  const highlightsBlock =
    dominantFact !== undefined ? (
      <div data-testid="quick-pick-highlights" className="flex flex-col gap-[var(--space-2)]">
        {/* The dominant stat: rendered at headline weight immediately
            under the option's name so identity -> the number that
            matters most -> the case for/against reads in one glance
            (requirement 1). This is the direct fix for "price buried
            mid-list in the same grey as the body style" -- generic,
            because it is simply `highlightFacts[0]`, not a hard-coded
            `car.advertised_price` special case. At expanded this is also
            the dominant STAT's own hero treatment (file-header section 3):
            `--font-size-2xl` is tokens.css's own "reserved for
            desktop-width hero use" size -- a price/identity hero on a wide
            shopping-site card is exactly that reservation's intended use. */}
        <div
          data-testid={`quick-pick-highlight-${dominantFact.definitionId}`}
          className="flex flex-col gap-[var(--space-0-5)]"
        >
          <span className="label-caps text-[var(--color-ink-secondary)]">{dominantFact.label}</span>
          <span
            className={`line-clamp-2 leading-[var(--line-height-snug)] font-semibold ${
              layout === 'expanded'
                ? 'text-[length:var(--font-size-2xl)]'
                : 'text-[length:var(--font-size-md)]'
            }`}
            style={{
              color: dominantFact.known ? 'var(--color-brand)' : 'var(--color-ink-muted)',
            }}
            title={dominantFact.value}
          >
            {dominantFact.value}
          </span>
        </div>

        {gridFacts.length > 0 ? (
          // The rest of the highlighted attributes: a compact
          // definition-list grid, not run-on "Label: value"
          // sentences (requirement 2) -- label small/muted above,
          // value emphasised below, each cell capped to two lines
          // with the untruncated text still reachable via `title` so
          // a long joined value (e.g. a `string_list` like "Standard
          // features") is capped, never silently dropped or left to
          // wrap into four lines and dominate the card.
          <div
            data-testid="quick-pick-highlight-grid"
            className="grid grid-cols-2 gap-x-[var(--space-3)] gap-y-[var(--space-2)]"
          >
            {gridFacts.map((fact) => (
              <div
                key={fact.definitionId}
                data-testid={`quick-pick-highlight-${fact.definitionId}`}
                className="flex min-w-0 flex-col gap-[var(--space-0-5)]"
              >
                <span className="label-caps text-[var(--color-ink-secondary)]">{fact.label}</span>
                <span
                  className={`line-clamp-2 text-[length:var(--font-size-sm)] ${
                    fact.known ? 'font-medium' : 'font-normal'
                  }`}
                  style={{
                    color: fact.known ? 'var(--color-ink)' : 'var(--color-ink-muted)',
                  }}
                  title={fact.value}
                >
                  {fact.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    ) : null;

  const insightSections = (
    <>
      <InsightSection
        testId="quick-pick-strengths"
        heading="What we like"
        tone="satisfied"
        emptyText="Nothing strongly supported yet."
        items={insights.strengths}
        labelSeparator=": "
      />
      <InsightSection
        testId="quick-pick-concerns"
        heading="What to watch for"
        tone="blocked"
        emptyText="Nothing flagged."
        items={insights.concerns}
        labelSeparator=" "
      />
      <InsightSection
        testId="quick-pick-still-unresolved"
        heading="Still researching"
        tone="open"
        emptyText="Nothing outstanding."
        items={insights.stillUnresolved}
        labelSeparator=" "
      />
    </>
  );

  return (
    <section
      data-testid="quick-pick-view"
      aria-labelledby="quick-pick-heading"
      className={
        layout === 'expanded'
          ? // EXPANDED LAYOUT (file-header section 1): no intrinsic
            // pane-width cap here -- the whole point of this task is that
            // the card uses the width its ancestor shell already grants it
            // (ADR 0007's `--shell-width-max`), rather than floating at
            // 480px inside it. What actually bounds line length is the
            // two-column `quick-pick-expanded-body` grid below: it gives
            // each column its own `minmax(360px, 1fr)` track via CSS
            // Grid's `auto-fit`, so widening THIS wrapper only ever widens
            // two real reading columns together -- it never stretches one
            // column of text past a readable measure, which is what makes
            // it safe to omit a hard max-width here, unlike narrow below.
            'flex w-full flex-col gap-[var(--space-4)] rounded-[var(--radius-lg)] bg-card p-[var(--space-6)]'
          : // Narrow: fills its container, like every sibling region.
            //
            // This used to carry `max-w-[var(--pane-width-max)]` (480px),
            // which was a no-op for the whole life of the narrow layout --
            // its container was never wider than 480 either, so the cap
            // never bound anything. Once `NARROW_MAX_WIDTH_PX` rose to 800
            // (see `use-width-mode.ts` for why), it started binding, and
            // this card became the one region stopping at 480px while
            // `recommendation-hero`, `case-insights` and the view switcher
            // beside it all ran to 608 -- a ragged right edge nobody chose.
            //
            // Removing it rather than widening it: those siblings already
            // hold prose at this width, so the product has already decided
            // what a readable measure is here, and a second, narrower
            // answer in one card is just an inconsistency. Nothing changes
            // at 390-480, where the cap never applied.
            'flex w-full flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]'
      }
    >
      <div className="flex items-center justify-between gap-[var(--space-2)]">
        <h2 id="quick-pick-heading" className="text-[length:var(--font-size-md)]">
          Best Match
        </h2>
        {!isEndOfQueue ? (
          <Badge variant="secondary" data-testid="quick-pick-position">
            {position + 1} of {options.length}
          </Badge>
        ) : null}
      </div>

      {currentOption === null ? (
        <p
          data-testid="quick-pick-end-of-queue"
          className={
            layout === 'expanded'
              ? 'text-[length:var(--font-size-md)] text-[var(--color-ink-secondary)]'
              : 'text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]'
          }
        >
          You&apos;ve been through every option in the queue.
        </p>
      ) : (
        <article
          data-testid={`quick-pick-card-${currentOption.id}`}
          className={
            layout === 'expanded'
              ? 'flex flex-col gap-[var(--space-4)]'
              : 'flex flex-col gap-[var(--space-3)]'
          }
        >
          {layout === 'expanded' ? (
            // Section 2 of the file-header "EXPANDED LAYOUT" note: a
            // full-width strip naming what comes after this option and how
            // many remain, ahead of the two-column body -- narrow has no
            // room for this (§9), expanded does.
            <div
              data-testid="quick-pick-queue-context"
              className="flex flex-wrap items-center gap-x-[var(--space-2)] gap-y-[var(--space-1)] rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] px-[var(--space-3)] py-[var(--space-2)] text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
            >
              {nextOption !== null ? (
                <>
                  <span>
                    Up next:{' '}
                    <span className="font-semibold text-foreground">{nextOption.label}</span>
                  </span>
                  <span aria-hidden="true">&middot;</span>
                  {/* `remainingAfterCurrent` counts every option after the
                      one on screen now -- which INCLUDES `nextOption`
                      itself. Phrasing this as "N more after this one" (i.e.
                      after `nextOption`, which was the first draft) would
                      double-count `nextOption` in both the name and the
                      total; "N left to review" states the same number as
                      an independent fact instead, so it reads correctly
                      next to "Up next" rather than contradicting it. */}
                  <span>
                    {remainingAfterCurrent} {remainingAfterCurrent === 1 ? 'option' : 'options'}{' '}
                    left to review
                  </span>
                </>
              ) : (
                <span>This is the last option in the queue.</span>
              )}
            </div>
          ) : null}

          {layout === 'expanded' ? (
            // Section 1 of the file-header "EXPANDED LAYOUT" note: identity
            // + dominant stat + spec grid on the left, the three judgment
            // blocks on the right -- see that note for why `auto-fit` +
            // `minmax(360px, 1fr)` is what keeps this from either cramping
            // at in-between widths or stretching one column past a
            // readable measure at the widest ones.
            <div
              data-testid="quick-pick-expanded-body"
              className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-[var(--space-6)]"
            >
              <div className="flex min-w-0 flex-col gap-[var(--space-3)]">
                {identityHeading}
                {highlightsBlock}
              </div>
              <div className="flex min-w-0 flex-col gap-[var(--space-2)]">{insightSections}</div>
            </div>
          ) : (
            <>
              {identityHeading}
              {highlightsBlock}

              {/* A hairline rule separates the objective spec block above
                  from the three judgment lists below -- the same
                  `border-t border-border` treatment `VehicleCatalogFlow.tsx`
                  already uses to separate a spec grid from what follows it,
                  reused here rather than inventing a second divider
                  convention. This is the visual line between "data" and
                  "Sift's read on the data" requirement 3 asks for, on top
                  of (not instead of) the tone colours below. Expanded does
                  not need this rule -- the two-column grid above already
                  separates the two halves spatially. */}
              <div className="flex flex-col gap-[var(--space-2)] border-t border-border pt-[var(--space-3)]">
                {insightSections}
              </div>
            </>
          )}

          {displayedDisposition !== 'unreviewed' && (
            <p
              data-testid="quick-pick-current-disposition"
              className="text-[length:var(--text-sm)] text-[color:var(--color-muted-foreground)]"
            >
              You {DISPOSITION_PAST_TENSE[displayedDisposition]} this one.{' '}
              <button
                type="button"
                data-testid="quick-pick-undo"
                className="underline underline-offset-2"
                onClick={() => {
                  onUndo(currentOption.id);
                }}
              >
                Undo
              </button>
            </p>
          )}

          <div
            data-testid="quick-pick-actions"
            className={
              layout === 'expanded'
                ? // Expanded: the control clusters at the trailing edge of
                  // the now much wider card rather than spreading across its
                  // full width -- spreading it would isolate Pass ~1100px
                  // away from the others on a wide viewport, reading as
                  // three unrelated controls instead of one action cluster.
                  'flex flex-col items-end gap-[var(--space-2)]'
                : 'flex flex-col gap-[var(--space-2)]'
            }
          >
            {/* One segmented control, not three unrelated buttons
                (requirement 3) -- see this file's header comment, "REACTIVE
                TRIAGE CONTROL" section 1, for why `type="multiple"` (not the
                seemingly obvious `"single"`) is what gets a real
                `aria-pressed` onto each segment, and why `rovingFocus` is
                turned off. */}
            <ToggleGroup
              type="multiple"
              role="group"
              rovingFocus={false}
              value={selectedValues}
              aria-label={`Set a disposition for ${currentOption.label}`}
              className={layout === 'expanded' ? 'w-fit' : 'w-full'}
            >
              {(
                [
                  {
                    disposition: 'pass',
                    label: 'Pass',
                    ariaLabel: `Pass on ${currentOption.label}`,
                    dispatch: onPass,
                    primary: false,
                  },
                  {
                    disposition: 'unsure',
                    label: 'Unsure',
                    ariaLabel: `Unsure about ${currentOption.label}`,
                    dispatch: onUnsure,
                    primary: false,
                  },
                  {
                    disposition: 'keep',
                    label: 'Keep',
                    // Keep stays the visually primary option (requirement
                    // 3) even before anything is decided -- its `primary`
                    // flag below keeps the brand fill it always had as its
                    // UNSELECTED resting state, distinct from Pass/Unsure's
                    // plain segment treatment.
                    ariaLabel: `Keep ${currentOption.label} for a closer look`,
                    dispatch: onKeep,
                    primary: true,
                  },
                ] as const
              ).map((action) => {
                const isSelected = displayedDisposition === action.disposition;
                const tone = STATUS_TONE_META[QUICK_PICK_TONE[action.disposition]];
                return (
                  <ToggleGroupItem
                    key={action.disposition}
                    value={action.disposition}
                    data-testid={`quick-pick-${action.disposition}`}
                    aria-label={action.ariaLabel}
                    className={
                      isSelected
                        ? 'grow min-h-[var(--size-touch-target-min)] transition-colors duration-[var(--duration-fast)]'
                        : `grow min-h-[var(--size-touch-target-min)] transition-colors duration-[var(--duration-fast)] ${
                            action.primary
                              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          }`
                    }
                    style={isSelected ? { backgroundColor: tone.bg, color: tone.ink } : undefined}
                    onClick={() => {
                      pressDisposition(action.disposition, action.dispatch);
                    }}
                  >
                    {isSelected ? <span aria-hidden="true">{tone.icon}</span> : null}
                    {action.label}
                  </ToggleGroupItem>
                );
              })}
            </ToggleGroup>
            {/*
              What Keep means, said where the person forms their idea of it.
              Keep retains a candidate for comparison and points deeper work
              at it; confirming a shortlist is a separate, later step that
              only a person can take. A card that let "Keep" read as "I have
              chosen this" would lose the human-authority claim before the
              shortlist screen ever appears.
            */}
            <p className="text-[length:var(--text-xs)] text-[color:var(--color-muted-foreground)]">
              Keep keeps it for a closer look. Nothing is decided here, and you can change any of
              these later.
            </p>
          </div>
        </article>
      )}
    </section>
  );
}
