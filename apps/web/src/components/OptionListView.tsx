/**
 * List view (`docs/change-sets/2026-08-30-generic-decision-workspace.md` §10) -- the option view
 * that answers *"Tell me about each option."* ADR 0005 (`docs/decisions/
 * 0005-workspace-view-state-and-option-views.md`) Decision 2 states why this is a distinct
 * decision task, not a fourth cosmetic skin over the same table: Compare (§11, `OptionCompareView`)
 * answers "how do these options differ," Board (§12, `OptionBoardView`) answers "where does each
 * option currently stand," and List answers neither -- it is "a compact, information-dense card per
 * option," emphasizing depth *within* one option rather than alignment *across* options. Concretely
 * this means every option gets its own self-contained card (identity, a few high-value attribute
 * values, strengths, concerns, what's still unresolved) rather than one row sharing a table with
 * every other option.
 *
 * **"Avoid dumping every available field. Pack presentation metadata should influence which fields
 * are prominent" (§10) is enforced structurally, not by convention.** Every part of a card --
 * the attribute-values row *and* the strengths/concerns/unresolved lists -- is derived from one
 * bounded `prominentDefinitions` set per option (see `pickProminentDefinitions`), never from the
 * full `attributeDefinitions` list. An attribute that doesn't make the prominent cut for a given
 * option's `kind` cannot appear anywhere on that card, in any section, by construction: there is no
 * code path here that reads `option.attributes` keyed by anything other than a prominent
 * definition's id. Prominence itself follows a strict precedence, mirroring the same "caller lever
 * for priority" pattern `OptionCompareView`'s `pinnedAttributeIds` and `OptionBoardView`'s
 * `pickFacts` already use: (1) an explicit `prominentAttributeIds` prop, when the caller (a WebMCP
 * presentation tool, or a future `WorkspaceViewState.list` field) wants to hand-pick fields; else
 * (2) `presentation.attributeGroups[0]` -- the pack author's own first/primary group, read exactly
 * the way `OptionCompareView.buildGroups` reads every group; else (3) the same generic fallback
 * `QuickPickView.tsx` uses for its highlight row -- comparison-relevant definitions
 * (`comparison !== 'none'`) when a pack declares any, otherwise simply the first few applicable
 * definitions -- so a pack with no `presentation` metadata at all still renders real facts instead
 * of an empty card.
 *
 * **Strengths/concerns/unresolved derivation is the same honest, pack-agnostic signal
 * `QuickPickView.tsx` uses, not a new or looser heuristic.** This component has no access to
 * `Criterion[]` weights or targets -- only `AttributeDefinition[]` -- so, exactly as
 * `QuickPickView.tsx`'s header comment explains, it cannot honestly know whether a value is "good"
 * in some pack-specific sense (CLAUDE.md: "the deterministic core, not an LLM, owns ... evidence
 * validity"). What it *can* know honestly is how well-evidenced a value is, by comparing
 * `AttributeRecord.status` against the definition's declared `evidenceExpectation`
 * (`meetsEvidenceExpectation`, imported from `../lib/evidence-expectation.js` -- Task C6 extracted
 * this out of what used to be two byte-for-byte-identical copies, one here and one in
 * `QuickPickView.tsx`, into the one shared, separately-tested module both views now import, so the
 * single judgment that decides "well supported" versus "needs checking" cannot drift between
 * views). List view's three-way split just carries that one signal one step further than Quick
 * Pick's two-way "why it fits" / "watch out" split, because §10 names three distinct things to
 * show, and collapsing "conflicting/under-evidenced" and "genuinely missing" into one bucket would
 * blur "what do I still need to find out" (unresolved -- no value at all) from "what should I be
 * skeptical of" (concerns -- a value exists but isn't trustworthy yet):
 *   - **Strengths**: a value is present and meets or exceeds its definition's evidence bar --
 *     a fact the card can honestly stand behind.
 *   - **Concerns**: a value is present but conflicted, or present but under-evidenced relative to
 *     what its definition expects.
 *   - **Unresolved**: no value at all (`status === 'unknown'` or no record).
 * An option with nothing that clears the evidence bar renders zero fabricated strengths -- a muted
 * "Nothing strongly supported yet." fallback, matching `QuickPickView.tsx`'s identical empty-state
 * copy, never an invented bullet.
 *
 * The split is derived over every applicable definition, not just the `prominentDefinitions` the
 * fact row renders -- see `buildInsights`'s own header comment for why (an identity-attribute
 * filter, and a fact-row-duplicate suppression, added after the initial version produced the same
 * "value shown confidently, then flagged as needing evidence, in the same glance" contradiction
 * `QuickPickView.tsx`'s header comment names).
 *
 * **Honest unknowns (§10, CLAUDE.md).** The attribute-values row renders "Unknown" for any
 * prominent attribute with no value, muted the same way `OptionCompareView`'s cells and
 * `QuickPickView`'s highlight row do -- never blank, never invented.
 *
 * **Custom (`custom.*`) fields (§26).** Rendered by `definition.label` everywhere, exactly like
 * `OptionCompareView.tsx` and `OptionBoardView.tsx` -- the raw `custom.` id is never rendered as
 * visible text, only inside `data-testid` attributes. The attribute-values row applies the same
 * subtle outlined `Custom` badge (title "Added for your comparison") `OptionCompareView.tsx` uses
 * for its comparison rows, reused verbatim here for consistency across the view family.
 *
 * **Selected-state treatment (§62 "strong selected-state treatment").** A selected card gets the
 * same `--color-status-ready-ink`/`--color-status-ready-bg` tint and inline "Selected" label
 * `OptionCompareView`'s header cell and `OptionBoardView`'s card already use, so the four views
 * read as one family rather than four independently invented selected states.
 *
 * **Purely presentational (this task's own contract, matching every sibling view).** No fetching,
 * no context, no command dispatch -- `options`/`selectedOptionId`/`visibleOptionIds`/
 * `prominentAttributeIds` are caller-supplied projections; `onFocusOption` only reports intent, it
 * never mutates anything itself, the same "report, don't decide" shape `OptionCompareView`'s
 * `onFocusOption` and `OptionBoardView`'s `onFocusOption`/`onMoveOption` already use.
 *
 * **Narrow viewport (390-480px canonical, §7/§49).** Cards stack in a single vertical column with
 * no fixed pixel widths anywhere, so nothing here can force horizontal page overflow -- there is no
 * horizontally-scrolling region to manage in the first place, unlike Compare's table or Board's
 * columns.
 *
 * **Narrow vs. expanded (§7, ADR 0005 Decision 4, product.md's "List and Board currently render one
 * layout across both width modes" gap).** Change-set §7 states expanded mode must show "more
 * attributes visible simultaneously" and alter information architecture, "not merely CSS widths" --
 * so, exactly like `OptionCompareView`, `layout` is a caller-supplied prop rather than something this
 * component detects itself (`WorkspaceViewSwitcher` owns `useWidthMode` and passes the resolved value
 * down, identically for all three option views now). Two genuinely different structures follow from
 * it, not one grid stretched by CSS:
 *   1. **Card arrangement.** Narrow keeps today's single stacked column (`flex flex-col`) -- nothing
 *      changes there. Expanded renders the same cards inside the shared `.option-grid` utility
 *      (`apps/web/src/styles/global.css`), a responsive `auto-fill` grid that shows as many cards
 *      side by side as the available width allows (up to `--shell-width-max`), so several full option
 *      cards are visible without scrolling at once -- literally "more options visible simultaneously,"
 *      the same instinct §7 names for Compare's multi-column table.
 *   2. **Prominent-field budget.** `pickProminentDefinitions` (below) takes a higher attribute cap in
 *      expanded mode and, when a pack defines more than one `presentation.attributeGroups` entry,
 *      draws from as many of those groups (in the pack author's own order) as fit under that cap,
 *      not just the first. This is deliberately still presentation-driven, never a bypass of it: this
 *      task's own instruction is "pack presentation metadata already drives which fields are
 *      prominent -- respect that, don't bypass it." Expanded mode does not invent a new selection
 *      source; it simply has room to honor more of what the pack author already ordered.
 *
 * **Visual hierarchy redesign.** The original card rendered every prominent fact as one
 * `${label}: ${value}` string at identical size/weight/color, so a reader had to parse ~25 lines of
 * undifferentiated grey text to find the one number (price) and the one judgment (strengths vs.
 * concerns vs. unresolved) that actually matter. Three structural changes fix this, all still built
 * strictly on top of the same `pickProminentDefinitions`-selected fact set -- nothing here changes
 * *which* attributes appear, only how the ones already chosen are laid out and colored:
 *   1. **Identity -> price -> verdict, in that reading order.** `CardFact.headline` (see
 *      `buildFacts`) promotes the first `money`-typed prominent fact -- almost always the option's
 *      price -- out of the label/value grid into its own larger, bolder callout directly under the
 *      option name, so the two facts a reader needs first (what is this, what does it cost) sit
 *      together at the top before any other spec. Deliberately typographic emphasis only (size,
 *      weight, `--font-display`), never a status color: design-system.md reserves saturated color
 *      for the nine semantic status tokens, and a price is a plain fact, not a state.
 *   2. **Specs as data, not sentences.** The remaining facts render as a `<dl>` definition grid --
 *      a small muted caps label (`<dt>`) stacked over an emphasized value (`<dd>`), two columns wide
 *      -- instead of a run-on "Label: value" clause. A `string_list` value long enough to blow out
 *      the card (e.g. "Standard features") is capped at `MAX_LIST_VALUES_SHOWN` entries plus an
 *      honest "+N more" suffix, never silently dropped and never fabricated.
 *   3. **Strengths/concerns/unresolved get three different colors, not one.** `INSIGHT_SECTION_TONE`
 *      maps each bucket onto an existing `activity-labels.ts` status tone -- the same
 *      ink/bg/border/icon vocabulary `RecommendationCard.tsx` and `ApprovalCard.tsx` already use, so
 *      this card joins a pattern rather than inventing a fourth color language. See that constant's
 *      own comment for the specific tone reasoning per bucket.
 */
import { useMemo } from 'react';
import type { AttributeDefinition, EntityRecord, PresentationDefinition } from '@sift/contracts';
import { formatAttributeValue } from './attribute-value-format.js';
import { Badge } from '@/components/ui/badge';
import { isIdentityAttribute, meetsEvidenceExpectation } from '../lib/evidence-expectation.js';
import { STATUS_TONE_META, type StatusTone } from './activity-labels.js';

export interface OptionListViewProps {
  options: EntityRecord[];
  attributeDefinitions: AttributeDefinition[];
  /** `CompiledDecisionPack.presentation`, or `null` if not yet available. Its first attribute group, when present, is preferred as the source of each card's prominent fields (see the header comment's prominence precedence). */
  presentation: PresentationDefinition | null;
  selectedOptionId: string | null;
  /** Narrows which option cards render. `undefined` shows every option -- the backward-compatible default, matching `OptionCompareView`'s identical convention. */
  visibleOptionIds?: string[];
  /** Explicit caller-chosen prominent attribute ids, taking precedence over `presentation`'s first group and the generic fallback. Applied identically to every rendered card (a per-option override is not part of this contract). `undefined` or empty falls through to `presentation`, then the generic fallback. */
  prominentAttributeIds?: string[];
  /** Caller-decided information architecture (ADR 0005 Decision 4) -- this component never calls `matchMedia` itself. See the header comment's "Narrow vs. expanded" section for exactly what changes at each value. */
  layout: 'narrow' | 'expanded';
  /** Fired when a user or WebMCP-driven caller focuses a card. This component never decides focus itself, matching `OptionCompareView.onFocusOption`/`OptionBoardView.onFocusOption`. */
  onFocusOption: (optionId: string) => void;
}

const CUSTOM_ATTRIBUTE_ID_PREFIX = 'custom.';
// Narrow keeps the original cap exactly (a card stacked in a single column
// has limited vertical patience for facts before it crowds out strengths/
// concerns/unresolved below it). Expanded has real extra width to spend, so
// the cap is raised rather than left as a hidden CSS-only difference --
// per §7, "more attributes visible simultaneously" is meant to be a real
// information-architecture change, not merely a wider box around the same
// six facts.
const MAX_PROMINENT_ATTRIBUTES_NARROW = 6;
const MAX_PROMINENT_ATTRIBUTES_EXPANDED = 10;
// Caps each of the three insight lists once `buildInsights` widened from
// "only the prominent set" to every applicable definition (see that
// function's header comment) -- otherwise a pack with many attributes could
// grow "Concerns"/"Unresolved" without bound, defeating "avoid dumping every
// available field" (§10) just one section down from where `facts` already
// enforces it.
const MAX_INSIGHT_ITEMS_PER_SECTION = 6;

/** Identical check to `OptionCompareView.tsx`'s `isCustomAttributeId` -- `attributes.ts`'s `custom.` id namespace comment warns this id is otherwise "rendered directly in the generic UI" with no humanizing step (ADR 0005 Decision 6). */
function isCustomAttributeId(id: string): boolean {
  return id.startsWith(CUSTOM_ATTRIBUTE_ID_PREFIX);
}

/** Same "show everything by default, silently drop stale ids" contract as `OptionCompareView.tsx`'s `narrowOptions`. */
function narrowOptions(
  options: EntityRecord[],
  visibleOptionIds: string[] | undefined,
): EntityRecord[] {
  if (visibleOptionIds === undefined) return options;
  const byId = new Map(options.map((option) => [option.id, option]));
  return visibleOptionIds
    .map((id) => byId.get(id))
    .filter((option): option is EntityRecord => option !== undefined);
}

/**
 * Resolves the bounded prominent-attribute set for one option's applicable definitions, following
 * the three-step precedence the header comment describes: an explicit prop, then the pack's
 * presentation grouping, then the generic comparison-relevant-or-first-few fallback
 * `QuickPickView.tsx` uses. Every section of the rendered card reads only from this list, which is
 * what makes "avoid dumping every available field" (§10) true by construction rather than by
 * convention.
 *
 * `layout` only changes *how much room* this function has to work with, never *where* it looks:
 * narrow reproduces the original contract byte-for-byte (only `attributeGroups[0]`, capped at
 * `MAX_PROMINENT_ATTRIBUTES_NARROW`). Expanded raises the cap and, when the pack defines more than
 * one presentation group, walks the remaining groups in the pack author's own order to fill that
 * larger budget -- still nothing this component invents, only more of what the pack already
 * prioritized (see the header comment's "Prominent-field budget" note).
 */
function pickProminentDefinitions(
  applicableDefinitions: AttributeDefinition[],
  presentation: PresentationDefinition | null,
  prominentAttributeIds: string[] | undefined,
  layout: 'narrow' | 'expanded',
): AttributeDefinition[] {
  const maxProminent =
    layout === 'expanded' ? MAX_PROMINENT_ATTRIBUTES_EXPANDED : MAX_PROMINENT_ATTRIBUTES_NARROW;
  const byId = new Map(applicableDefinitions.map((definition) => [definition.id, definition]));

  if (prominentAttributeIds !== undefined && prominentAttributeIds.length > 0) {
    const explicit = prominentAttributeIds
      .map((id) => byId.get(id))
      .filter((definition): definition is AttributeDefinition => definition !== undefined);
    if (explicit.length > 0) return explicit.slice(0, maxProminent);
  }

  if (presentation !== null && presentation.attributeGroups.length > 0) {
    // Narrow only ever reads the pack's first/primary group -- the original,
    // unchanged contract. Expanded has room to honor more of the pack
    // author's own grouping, so it walks every group in the order the pack
    // declared them, accumulating distinct definitions until the expanded
    // cap is reached (a definition already picked up from an earlier group
    // is skipped rather than duplicated).
    const groupsToConsider =
      layout === 'expanded'
        ? presentation.attributeGroups
        : presentation.attributeGroups.slice(0, 1);
    const grouped: AttributeDefinition[] = [];
    const seenIds = new Set<string>();
    for (const group of groupsToConsider) {
      if (grouped.length >= maxProminent) break;
      for (const id of group.attributeIds) {
        if (grouped.length >= maxProminent) break;
        const definition = byId.get(id);
        if (definition === undefined || seenIds.has(definition.id)) continue;
        seenIds.add(definition.id);
        grouped.push(definition);
      }
    }
    if (grouped.length > 0) return grouped;
  }

  const comparisonRelevant = applicableDefinitions.filter(
    (definition) => definition.comparison !== 'none',
  );
  const fallbackSource = comparisonRelevant.length > 0 ? comparisonRelevant : applicableDefinitions;
  return fallbackSource.slice(0, maxProminent);
}

interface CardFact {
  definitionId: string;
  label: string;
  /** The value text actually rendered -- already capped for an over-long `string_list` (see `MAX_LIST_VALUES_SHOWN`), never the full uncapped join. */
  display: string;
  /**
   * Count of additional `string_list` entries beyond `display`'s capped preview, rendered as an
   * explicit "+N more" suffix. Zero for every non-list value and for a list at or under the cap.
   * Existing to keep a long value honest: CLAUDE.md's "an unknown stays explicitly unknown; never
   * invent a value or a placeholder" extends naturally to "never silently truncate without saying
   * so" -- a reader can always tell more values exist even when they aren't all shown.
   */
  overflowCount: number;
  known: boolean;
  custom: boolean;
  /**
   * True for the single `money`-typed prominent fact this card promotes out of the label/value grid
   * into the identity-tier price callout directly under the option name (see the header comment's
   * "Visual hierarchy redesign" §1 and `OptionListCard`'s render). Deliberately derived only from
   * `definition.valueType` on a definition that already survived `pickProminentDefinitions` -- this
   * never widens *which* attributes are prominent, only *where on the card* one of them, already
   * selected, gets laid out. At most one fact per card is ever `headline: true`: `buildFacts` claims
   * the first money-typed prominent definition it encounters, in the pack's own order, and leaves
   * any further money-typed field (rare -- e.g. a pack that also promotes "estimated monthly
   * payment") in the ordinary grid rather than stacking a second oversized callout.
   */
  headline: boolean;
}

// A `string_list` value (e.g. a car's full standard-features list) can run to a dozen-plus entries.
// Rendered in full, one fact could wrap across several lines and crowd out the strengths/concerns/
// unresolved sections below it -- defeating "avoid dumping every available field" (§10) one section
// later than `pickProminentDefinitions` already enforces it for *which* attributes appear at all.
// Capping the visible entries and naming the remainder ("+N more", see `CardFact.overflowCount`)
// keeps the card's promised "compact, information-dense" shape (this file's own header comment)
// without ever hiding that more values exist.
const MAX_LIST_VALUES_SHOWN = 4;

/** Every prominent definition becomes exactly one fact -- known values format through the shared formatter, missing values render the explicit "Unknown" string (§10, CLAUDE.md), never blank or invented. */
function buildFacts(option: EntityRecord, prominentDefinitions: AttributeDefinition[]): CardFact[] {
  let headlineClaimed = false;
  return prominentDefinitions.map((definition) => {
    const value = option.attributes[definition.id]?.value;
    const known = value !== undefined;

    let display: string;
    let overflowCount = 0;
    if (known && value.type === 'string_list' && value.values.length > MAX_LIST_VALUES_SHOWN) {
      display = value.values.slice(0, MAX_LIST_VALUES_SHOWN).join(', ');
      overflowCount = value.values.length - MAX_LIST_VALUES_SHOWN;
    } else {
      display = known ? formatAttributeValue(value) : 'Unknown';
    }

    // First money-typed prominent field wins the headline slot -- see the `CardFact.headline` doc
    // comment above for why this can never bypass prominence and why only one fact per card is ever
    // promoted.
    const headline = definition.valueType === 'money' && !headlineClaimed;
    if (headline) headlineClaimed = true;

    return {
      definitionId: definition.id,
      label: definition.label,
      display,
      overflowCount,
      known,
      custom: isCustomAttributeId(definition.id),
      headline,
    };
  });
}

interface CardInsight {
  definitionId: string;
  text: string;
}

interface CardInsights {
  strengths: CardInsight[];
  concerns: CardInsight[];
  unresolved: CardInsight[];
}

/**
 * The three-way honest split the header comment describes. Widened to run
 * over every applicable definition, not just the prominent set `buildFacts`
 * uses for the fact row: sourcing both from the same set meant every
 * insight necessarily duplicated a fact already shown above it, including
 * the self-contradictory case of a value shown confidently in the fact row
 * and then, one section down, flagged as still needing evidence (the same
 * "Model year: 2022" / "Model year still needs stronger evidence" defect
 * `QuickPickView.tsx`'s header comment describes -- this view showed it too,
 * as "Price: 28500" / "Price still needs stronger evidence" for the exact
 * same value). Two refinements now sit on top of the raw per-attribute
 * signal, mirroring `QuickPickView.tsx`'s `buildInsights` exactly:
 *
 * 1. A plain identity/label descriptor (`isIdentityAttribute` --
 *    `../lib/evidence-expectation.js`) is skipped before any evidence
 *    check, so it never appears in any of the three lists regardless of
 *    status.
 * 2. An under-evidenced value that is already shown, unqualified, in the
 *    fact row (`prominentIds`) is not repeated as a concern -- suppressed
 *    only for that one branch, so a genuinely unknown or conflicted value
 *    (never merely "already shown with no caveat") always still surfaces,
 *    and a value that DOES meet its evidence bar is still repeated in
 *    `strengths` deliberately, as confirmation rather than contradiction.
 */
function buildInsights(
  option: EntityRecord,
  applicableDefinitions: AttributeDefinition[],
  prominentIds: ReadonlySet<string>,
): CardInsights {
  const strengths: CardInsight[] = [];
  const concerns: CardInsight[] = [];
  const unresolved: CardInsight[] = [];

  for (const definition of applicableDefinitions) {
    if (isIdentityAttribute(definition)) continue;

    const record = option.attributes[definition.id];

    if (record === undefined || record.status === 'unknown' || record.value === undefined) {
      unresolved.push({
        definitionId: definition.id,
        text: `${definition.label} is still unknown`,
      });
      continue;
    }
    if (record.status === 'conflicted') {
      concerns.push({
        definitionId: definition.id,
        text: `${definition.label} has conflicting information`,
      });
      continue;
    }
    if (meetsEvidenceExpectation(record.status, definition.evidenceExpectation)) {
      strengths.push({
        definitionId: definition.id,
        text: `${definition.label}: ${formatAttributeValue(record.value)}`,
      });
    } else if (!prominentIds.has(definition.id)) {
      concerns.push({
        definitionId: definition.id,
        text: `${definition.label} still needs stronger evidence`,
      });
    }
  }

  return {
    strengths: strengths.slice(0, MAX_INSIGHT_ITEMS_PER_SECTION),
    concerns: concerns.slice(0, MAX_INSIGHT_ITEMS_PER_SECTION),
    unresolved: unresolved.slice(0, MAX_INSIGHT_ITEMS_PER_SECTION),
  };
}

type InsightSection = 'strengths' | 'concerns' | 'unresolved';

/**
 * Maps each of the three honest insight buckets (see `buildInsights`'s header comment) onto one of
 * `activity-labels.ts`'s nine established status tones -- the same shared ink/bg/border/icon
 * vocabulary `RecommendationCard.tsx` and `ApprovalCard.tsx` already use, per this task's explicit
 * instruction not to invent new colors. None of these three is a literal 1:1 rename of the tone's
 * original product.md meaning (there is no "strength"/"concern" row in that table); each is chosen
 * for the closest honest semantic match to an *existing* tone already in use elsewhere in the app, so
 * a strength/concern/unresolved item reads with a color a user has already learned to associate with
 * roughly the right feeling, rather than a fourth, competing color language:
 *   - strengths -> `satisfied`: literally the same "required evidence is in and sufficient" state
 *     `buildInsights` already tested for (`meetsEvidenceExpectation`) before adding to this bucket --
 *     the most direct possible tone match of the three.
 *   - concerns -> `blocked`: `activity-labels.ts` already maps the single closest real event,
 *     `evidence.conflicted`, to `blocked` ("Research disagrees"), and every concern here is either
 *     that exact conflicted state or a present-but-under-evidenced value -- both "something here
 *     needs your attention before it can be trusted," which is `blocked`'s case-domain meaning, not a
 *     technical `error`.
 *   - unresolved -> `open`: no value exists yet -- the same "not yet started" state
 *     `activity-labels.ts` gives `obligation.updated` ("Question to resolve"), and deliberately the
 *     quietest of the three (design-system.md: "`open` ... intentionally the quietest token").
 */
const INSIGHT_SECTION_TONE: Record<InsightSection, StatusTone> = {
  strengths: 'satisfied',
  concerns: 'blocked',
  unresolved: 'open',
};

interface InsightSectionProps {
  optionId: string;
  section: InsightSection;
  heading: string;
  emptyText: string;
  items: CardInsight[];
}

function InsightSection({ optionId, section, heading, emptyText, items }: InsightSectionProps) {
  const tone = STATUS_TONE_META[INSIGHT_SECTION_TONE[section]];
  const hasItems = items.length > 0;

  return (
    <div
      data-testid={`option-list-view-${section}-${optionId}`}
      // Tinted (background tint + left border-accent, the token triad's own "-bg"/"-border" roles)
      // only once there is something to say -- an empty bucket ("Nothing flagged.") is not itself a
      // status worth a colored block, matching `RecommendationCard.tsx`'s facts/hypotheses blocks,
      // which are likewise only rendered -- and only tinted -- when non-empty.
      className={
        hasItems
          ? 'flex flex-col gap-[var(--space-1)] rounded-[var(--radius-sm)] p-[var(--space-2)]'
          : 'flex flex-col gap-[var(--space-1)]'
      }
      style={
        hasItems ? { backgroundColor: tone.bg, borderLeft: `3px solid ${tone.border}` } : undefined
      }
    >
      <h3
        className="label-caps flex items-center gap-[var(--space-1)]"
        style={{ color: hasItems ? tone.ink : 'var(--color-ink-secondary)' }}
      >
        {hasItems ? <span aria-hidden="true">{tone.icon}</span> : null}
        {heading}
      </h3>
      {hasItems ? (
        <ul className="flex flex-col gap-[var(--space-0-5)]">
          {items.map((item) => (
            <li
              key={item.definitionId}
              data-testid={`option-list-view-${section}-item-${optionId}-${item.definitionId}`}
              className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
            >
              {item.text}
            </li>
          ))}
        </ul>
      ) : (
        <p
          data-testid={`option-list-view-${section}-empty-${optionId}`}
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-muted)]"
        >
          {emptyText}
        </p>
      )}
    </div>
  );
}

interface OptionListCardProps {
  option: EntityRecord;
  attributeDefinitions: AttributeDefinition[];
  presentation: PresentationDefinition | null;
  prominentAttributeIds: string[] | undefined;
  layout: 'narrow' | 'expanded';
  isSelected: boolean;
  onFocusOption: (optionId: string) => void;
}

function OptionListCard({
  option,
  attributeDefinitions,
  presentation,
  prominentAttributeIds,
  layout,
  isSelected,
  onFocusOption,
}: OptionListCardProps) {
  const applicableDefinitions = useMemo(
    () => attributeDefinitions.filter((definition) => definition.appliesTo.includes(option.kind)),
    [attributeDefinitions, option.kind],
  );

  const prominentDefinitions = useMemo(
    () =>
      pickProminentDefinitions(applicableDefinitions, presentation, prominentAttributeIds, layout),
    [applicableDefinitions, presentation, prominentAttributeIds, layout],
  );

  const facts = useMemo(
    () => buildFacts(option, prominentDefinitions),
    [option, prominentDefinitions],
  );
  // Split, never re-select: `headlineFact` is whichever single fact `buildFacts` already flagged
  // `headline: true` (or none), and `gridFacts` is everything else in its original prominence order
  // -- see `CardFact.headline`'s doc comment for why this can only reshuffle *layout*, never *which*
  // facts exist.
  const headlineFact = facts.find((fact) => fact.headline);
  const gridFacts = facts.filter((fact) => !fact.headline);
  const insights = useMemo(() => {
    const prominentIds = new Set(prominentDefinitions.map((definition) => definition.id));
    return buildInsights(option, applicableDefinitions, prominentIds);
  }, [option, applicableDefinitions, prominentDefinitions]);

  return (
    <li
      data-testid={`option-list-view-card-${option.id}`}
      data-selected={isSelected ? 'true' : 'false'}
      // gap-3 (not the original gap-2): the redesigned card now stacks four visually distinct
      // chunks -- identity, the price callout, the spec grid, and three tinted insight blocks --
      // and each needs enough breathing room to read as its own unit rather than a cramped list.
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-md)] bg-muted p-[var(--space-3)]"
      style={
        isSelected
          ? {
              color: 'var(--color-status-ready-ink)',
              backgroundColor: 'var(--color-status-ready-bg)',
            }
          : undefined
      }
    >
      <button
        type="button"
        data-testid={`option-list-view-focus-${option.id}`}
        onClick={() => onFocusOption(option.id)}
        aria-pressed={isSelected}
        // `py-2-5` (not the original `p-0`): the un-padded button's box was only ~27px tall --
        // below `--size-touch-target-min` (44px, testing.md's 44x44 CSS-pixel requirement). Padding,
        // not a fixed height, per tokens.css's own guidance ("must resolve to a real >=44px box via
        // padding or min-height/min-width, independent of how small its label or icon looks").
        className="w-full min-w-0 cursor-pointer truncate border-0 bg-transparent px-0 py-[var(--space-2-5)] text-left font-[family-name:var(--font-display)] text-[length:var(--font-size-md)] font-semibold text-[inherit]"
      >
        {option.label}
        {isSelected ? <span className="label-caps ml-[var(--space-1)]">Selected</span> : null}
      </button>

      {/* Visual hierarchy redesign §1 (this file's header comment): the identity-tier price callout.
          Same testid scheme as an ordinary grid fact (`option-list-view-fact-{optionId}-{defId}`) --
          this is still the pack's own prominent fact, only relocated and re-styled, so every test
          written against "the price fact" keeps working regardless of where on the card it renders.
          Typographic emphasis only (size/weight/display-font), deliberately no status color -- a
          price is a plain fact, not a state (design-system.md reserves saturated color for the nine
          status tokens). */}
      {headlineFact ? (
        <div
          data-testid={`option-list-view-fact-${option.id}-${headlineFact.definitionId}`}
          className="flex flex-col gap-[var(--space-0-5)]"
        >
          <span className="label-caps text-[var(--color-ink-secondary)]">{headlineFact.label}</span>
          <span
            className="font-[family-name:var(--font-display)] text-[length:var(--font-size-lg)] leading-[var(--line-height-tight)] font-bold"
            style={{ color: headlineFact.known ? 'var(--color-ink)' : 'var(--color-ink-muted)' }}
          >
            {headlineFact.display}
          </span>
        </div>
      ) : null}

      {/* Visual hierarchy redesign §2: specs as data, not sentences. A real `<dl>` -- label (`<dt>`,
          small/muted/caps) stacked over an emphasized value (`<dd>`) -- laid out two columns wide, so
          a reader scans values (the bold row) rather than parsing "Label: value" clauses one at a
          time. `min-w-0` on every grid cell keeps a long unbroken value from forcing the column, and
          therefore the card, wider than its allotted space at the 390px canonical viewport. */}
      {gridFacts.length > 0 ? (
        <dl
          data-testid={`option-list-view-facts-${option.id}`}
          className="m-0 grid grid-cols-2 gap-x-[var(--space-3)] gap-y-[var(--space-2)]"
        >
          {gridFacts.map((fact) => (
            <div
              key={fact.definitionId}
              data-testid={`option-list-view-fact-${option.id}-${fact.definitionId}`}
              className="flex min-w-0 flex-col gap-[var(--space-0-5)]"
            >
              <dt className="label-caps flex min-w-0 items-center gap-[var(--space-1)] text-[var(--color-ink-secondary)]">
                <span className="truncate">{fact.label}</span>
                {fact.custom ? (
                  <Badge
                    variant="outline"
                    data-testid={`option-list-view-fact-custom-badge-${option.id}-${fact.definitionId}`}
                    className="label-caps shrink-0 px-[var(--space-1)] py-0 text-[var(--color-ink-secondary)]"
                    title="Added for your comparison"
                  >
                    Custom
                  </Badge>
                ) : null}
              </dt>
              <dd
                className="m-0 text-[length:var(--font-size-sm)] font-medium break-words"
                style={{ color: fact.known ? 'var(--color-ink)' : 'var(--color-ink-muted)' }}
              >
                {fact.display}
                {fact.overflowCount > 0 ? (
                  <span
                    className="font-normal"
                    style={{ color: 'var(--color-ink-muted)' }}
                  >{` +${fact.overflowCount} more`}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <InsightSection
        optionId={option.id}
        section="strengths"
        heading="What we like"
        emptyText="Nothing strongly supported yet."
        items={insights.strengths}
      />
      <InsightSection
        optionId={option.id}
        section="concerns"
        heading="What to watch for"
        emptyText="Nothing flagged."
        items={insights.concerns}
      />
      <InsightSection
        optionId={option.id}
        section="unresolved"
        heading="Still researching"
        emptyText="Nothing outstanding."
        items={insights.unresolved}
      />
    </li>
  );
}

export function OptionListView({
  options,
  attributeDefinitions,
  presentation,
  selectedOptionId,
  visibleOptionIds,
  prominentAttributeIds,
  layout,
  onFocusOption,
}: OptionListViewProps) {
  const displayedOptions = useMemo(
    () => narrowOptions(options, visibleOptionIds),
    [options, visibleOptionIds],
  );

  // Narrow keeps today's single stacked column untouched. Expanded switches
  // to the shared `.option-grid` utility (`apps/web/src/styles/global.css`)
  // -- a responsive `auto-fill` grid, not a hand-rolled breakpoint here --
  // so several full cards are visible side by side at once, the "more
  // options visible simultaneously" half of §7's expanded-mode brief. See
  // the header comment's "Narrow vs. expanded" section for the full
  // reasoning, including the companion prominent-field-budget change.
  const cardsClassName =
    layout === 'expanded' ? 'option-grid' : 'flex flex-col gap-[var(--space-3)]';

  return (
    <section
      data-testid="option-list-view"
      aria-labelledby="option-list-view-heading"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] bg-card p-[var(--space-4)]"
    >
      <h2 id="option-list-view-heading">Tell me about each option</h2>

      {displayedOptions.length === 0 ? (
        <p
          data-testid="option-list-view-empty"
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
        >
          Add at least one candidate to see details for each option.
        </p>
      ) : (
        <ul data-testid="option-list-view-cards" data-layout={layout} className={cardsClassName}>
          {displayedOptions.map((option) => (
            <OptionListCard
              key={option.id}
              option={option}
              attributeDefinitions={attributeDefinitions}
              presentation={presentation}
              prominentAttributeIds={prominentAttributeIds}
              layout={layout}
              isSelected={option.id === selectedOptionId}
              onFocusOption={onFocusOption}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
