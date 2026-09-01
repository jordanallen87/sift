/**
 * The web-app-mode left sidebar (project-owner-approved shell -- the ASCII
 * mock this component was built from: "PRIORITIES / Safety ████ / Price
 * ███ ... FILTERS / AWD only ☑"). "This is supposed to have a web app view
 * too... It's supposed to emulate a shopping website at full width. When
 * it's in the side pane, it's in WebMCP mode where the user is viewing it
 * from ChatGPT. Still has to have the same functionalities, but in web app
 * mode the user isn't looking at it via ChatGPT."
 *
 * This component therefore exists ONLY at `layout: 'expanded'` (the
 * full-width, shopping-site-like web-app surface) and renders `null`
 * outright at `layout: 'narrow'` (the existing 390-480px ChatGPT
 * right-pane/WebMCP mode) rather than a narrow-adapted variant: that pane
 * already carries this same information through other surfaces -- the
 * "What you're looking for" disclosure for priorities
 * (`DecisionProfileView.tsx`) and the "Still checking" disclosure
 * (`ReadinessPanel.tsx`), both wired in `App.tsx`, which this task does not
 * touch. Building a second narrow rendering path here would just be a
 * duplicate, driftable source of the same underlying state.
 *
 * Purely presentational, matching every other leaf component in this
 * directory (`OptionCompareView.tsx`, `DecisionProfileView.tsx`,
 * `FindingsSheet.tsx`): no context, no fetching, no command calls. The
 * orchestrator (`App.tsx`) owns deriving real `CaseState`/
 * `WorkspaceViewState` data into the props below and wiring the callbacks
 * to real `updateSelection()`/readiness-surfacing behavior.
 *
 * ## Priorities (CLAUDE.md/product.md "Decision Profile" -- §42)
 *
 * Takes the already-derived `DecisionProfile` (`decision-profile.ts`,
 * `deriveDecisionProfile`) as a prop rather than re-deriving anything from
 * `CaseState` -- this file adds no second projection of criteria data.
 * Renders the union of `mustHave`/`important`/`niceToHave` (the three
 * sections `decision-profile.ts` actually weight-bands), sorted by weight
 * descending across all three. `context` facts (budget target, commute) are
 * deliberately excluded here: they are informational "things to keep in
 * mind," not a ranked priority the way §42's "Very important / Important /
 * Somewhat important" scale describes -- `DecisionProfileView.tsx` itself
 * already renders `context` un-banded for the identical reason (`showBand:
 * false`). `personalConcerns` are excluded too -- a
 * `DecisionProfilePersonalConcern` carries no `weight`/`priorityBand` field
 * to visualize.
 *
 * Per §42 ("Weights should not necessarily be exposed as raw numeric
 * percentages to ordinary users by default... Allow simplified priority
 * manipulation") and this task's explicit brief, the exact 0-100 weight is
 * NEVER rendered as a number or percentage here -- only the band label
 * ("Very important"/"Important"/"Somewhat important",
 * `decision-profile.ts`'s own `PriorityBand`) plus a purely decorative
 * 3-segment bar whose fill count is the band's ORDINAL (1/2/3 segments for
 * somewhat/important/very), never a continuous rendering of the raw weight
 * -- a bar whose width scaled proportionally with the exact weight would
 * leak back the same precision the band system exists to hide. The bar is
 * `aria-hidden` and never the sole carrier of the distinction
 * (design-system.md "Never color-only" -- "Color is reinforcement, not the
 * only channel"): the band text is always the real, visible, accessible
 * content.
 *
 * **Row layout (post-launch defect fix):** the sidebar's 240px column
 * (`App.tsx`'s `grid-cols-[240px_...]`, not owned by this file) is too
 * narrow to fit "label + band text + bar" on one line for any real
 * criterion name ("5-year ownership cost", "Driving comfort") without
 * truncating the label to one or two characters -- exactly the defect a
 * real production pass caught: the label, the ONLY thing that identifies
 * the row, was losing the space race to the band text and getting cut to
 * "S...". `PriorityRow` therefore stacks two lines instead of one row:
 * the label owns the full row width on its own line and is never
 * `truncate`d (long labels wrap instead of clipping -- CLAUDE.md "Never
 * fabricate"/never hide real content), and the band + bar move to a second,
 * visually de-emphasised line (smaller, `--color-ink-muted` "tertiary text"
 * per design-system.md, no `label-caps` shout treatment) underneath. The
 * band's full text is still real, visible, accessible DOM content in both
 * lines -- de-emphasising it is a visual weight change only, never a
 * disclosure/truncation of the band itself, and the bar remains the same
 * `aria-hidden` reinforcement it always was.
 *
 * ## Filters (`WorkspaceViewState.filters` / `WorkspaceFilterSchema`,
 * `packages/contracts/src/case.ts` ~line 392)
 *
 * Renders one real control per entry in `attributeDefinitions` whose
 * `valueType` this component has an honest, non-fabricated single-field
 * comparison control for (`fieldId` is taken to be `AttributeDefinition.id`
 * -- the only id namespace `WorkspaceFilterSchema.fieldId` could plausibly
 * mean for an option-property filter, and the codebase has no other
 * candidate: nothing anywhere else in the repo constructs a
 * `WorkspaceFilter` yet, so this component is the first real writer).
 *
 * **Two rendering modes, selected once per render by whether the caller
 * passed real option data (`options`, see the prop doc below):**
 *
 * `options` EMPTY/absent (legacy mode -- the original implementation,
 * preserved byte-for-byte in behavior so every pre-existing test keeps
 * passing unmodified):
 *
 *   - `boolean`               -> a `Toggle`. Pressed means `{ operator:
 *     'equals', value: 'true' }` is present for that field; unpressed means
 *     NO filter for that field (never `equals: 'false'`).
 *   - `enum` WITH a declared `allowedValues` list -> a native `<select>`,
 *     `{ operator: 'equals', value }`. No `allowedValues` -> no control.
 *   - `number` / `money`      -> a numeric `Input`, `{ operator:
 *     'less_than_or_equal', value }` ("at most X").
 *   - `string` / `text`       -> a text `Input`, `{ operator: 'contains',
 *     value }`.
 *
 * `options` POPULATED (derived mode -- this task's Defect 2 fix): a
 * production pass at 1900x1080 with a real 4-option case found this
 * legacy mode unusable for how small a Sift case actually is -- "a case
 * has at most FIVE saved cars. A free-text 'Search make' box over 4 items
 * is not a useful control." `planFilter` below reads the ACTUAL values
 * present on the caller-supplied `options` (never `attribute.allowedValues`,
 * which may list values no saved option actually has, or omit values a
 * pack author never anticipated -- CLAUDE.md "Never fabricate") and:
 *
 *   - suppresses (renders nothing for) any attribute where every option
 *     agrees -- all-true/all-false booleans, a single distinct enum/string/
 *     text value, or a min===max numeric range -- because a filter that
 *     cannot change which options are visible is not a useful control, only
 *     visual clutter that (per this task's Defect 2b) "pushes everything
 *     else out of view";
 *   - for `enum`/`string`/`text`, replaces the free-text box or
 *     pack-declared `<select>` with `FacetFilterControl`: one selectable
 *     chip per DISTINCT VALUE ACTUALLY PRESENT, each labelled with its
 *     live count ("Toyota (2)") -- "the pattern every shopping site uses,"
 *     and inherently bounded to at most 5 chips per field by the product's
 *     own 5-option case cap;
 *   - for `boolean`, keeps the existing `Toggle` (the approved mock's own
 *     "AWD only ☑" shape) but only when the toggle can actually narrow the
 *     set, with a live "N of M match" hint;
 *   - for `number`/`money`, keeps the existing free-typed "at most" `Input`
 *     (a real numeric range control -- sliders, min/max pairs -- is out of
 *     this task's scope) but grounds it with a live "Seen: min-max" hint
 *     computed from the real data instead of a blank box;
 *   - orders the surviving controls by `discriminatingScore` (facet chip
 *     count / numeric distinct-value count / 2 for a narrowable boolean)
 *     descending, so the filters most able to actually narrow the current
 *     5-or-fewer options surface first -- "prioritise the filters that
 *     matter for this pack."
 *
 * Every control in both modes still emits ONLY `WorkspaceFilterSchema`-
 * shaped values (`{ fieldId, operator, value }`, `operator` one of
 * `WORKSPACE_FILTER_OPERATORS`) -- derived mode is a smarter UI for
 * choosing a value, never a new filter shape the schema cannot express, and
 * a facet chip's `equals` is exactly what the old `<select>`/`Toggle`
 * already emitted for the same fields.
 *
 * `date`, `duration`, `range`, and `string_list` attributes render no
 * control in either mode -- none of `WORKSPACE_FILTER_OPERATORS`'s seven
 * operators (equals/not_equals/contains/four numeric comparisons) maps onto
 * any of those value types without inventing UI this task did not ask for
 * (a date-range picker, a duration-unit-aware comparator, a multi-select
 * chip list). An honest omission, not a bug -- see `isFilterableAttribute`.
 *
 * Every control is fully controlled from the `filters` prop; the only local
 * state (`pendingTextValues`) is the ephemeral on-screen echo of a
 * free-typed number/text field mid-keystroke (e.g. while typing "-" or a
 * trailing decimal point that is not yet a parseable number, or simply
 * before the next `filters` prop round-trips back) -- the same "local UI
 * bookkeeping inside an otherwise pure component" pattern
 * `FindingsSheet.tsx`'s `reviewedThisSession` already establishes in this
 * directory. It is a known, deliberate limitation that this local echo does
 * not reset if `filters` is cleared by something other than this
 * component's own `onFiltersChange` call; a full reset (e.g. a future
 * "Clear filters" affordance) is expected to also clear/remount this
 * component's local state, which is out of this task's scope. Every change
 * calls `onFiltersChange` with the COMPLETE next `WorkspaceFilter[]`, never
 * a delta -- this component never calls `updateSelection()` or any command
 * itself; ownership of the actual write stays with the orchestrator.
 *
 * **Why this is presentation, not a criterion mutation (change-set §54 /
 * ADR 0005 decision 1):** a filter narrows which already-known options are
 * VISIBLE; it can never change what the user says MATTERS (a `Criterion`'s
 * `weight`/`target`, written only by `sift_update_criteria` and friends).
 * Conflating the two would let hiding a minivan from the list silently
 * change the case's scoring -- structurally prevented here by this
 * component only ever emitting `WorkspaceFilter[]` values, never anything
 * resembling a criterion patch, and never calling a command directly.
 *
 * ## Still checking
 *
 * A compact, glanceable count plus a single entry point standing in for the
 * closed-by-default `DisclosureSection`/`ReadinessPanel` pairing `App.tsx`
 * already renders at the bottom of the page (region 8, "Still checking").
 * This component does not recompute or render the obligation list itself --
 * `openQuestionsCount` is a plain number the caller already has (e.g.
 * `readiness.active.length + readiness.blocked.length + readiness.open
 * .length` from the real `evaluateReadiness` result), and `onOpenQuestions`
 * is however the orchestrator chooses to surface the full detail (opening
 * the existing disclosure, scrolling to it, a dedicated sheet -- this
 * component does not know or care).
 */
import { useState } from 'react';
import type {
  AttributeDefinition,
  AttributeValueType,
  EntityRecord,
  WorkspaceFilter,
} from '@sift/contracts';
import type { DecisionProfile, DecisionProfileConcern, PriorityBand } from './decision-profile.js';
import { STATUS_TONE_META } from './activity-labels.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Toggle } from '@/components/ui/toggle';

export interface WorkspaceSidebarProps {
  /** `'narrow'` renders nothing at all -- see file header. */
  layout: 'narrow' | 'expanded';
  /** `deriveDecisionProfile`'s output. `null` when no case is open yet -- distinct from a loaded case with an empty profile. */
  decisionProfile: DecisionProfile | null;
  /** `CaseState.attributeDefinitions` (or the caller's already-narrowed subset for the active pack/options). Only entries `isFilterableAttribute` accepts render a control. */
  attributeDefinitions: AttributeDefinition[];
  /**
   * NEW PROP (this task's Defect 2 fix). `CaseState.entities` -- the case's
   * real saved options (at most 5 per product.md), the same array every
   * sibling option-rendering component already takes under this exact prop
   * name (`OptionCompareView.tsx`, `OptionListView.tsx`,
   * `OptionBoardView.tsx`, `OptionEditor.tsx`, `CaseNotes.tsx`). Used ONLY
   * to derive which real values are actually present for each filterable
   * attribute (`planFilter`, "Filters" section above) -- never read for any
   * other purpose, never mutated, never the source of a criterion or
   * evidence change. Optional with a `[]` default (matching
   * `CaseNotes.tsx`'s own `options?:` precedent) so this component keeps
   * working, unchanged, the instant it renders without a wired caller; `[]`
   * is indistinguishable from "no option data available yet" and falls
   * back to this file's pre-existing legacy per-attribute controls.
   */
  options?: EntityRecord[];
  /** The exact `WorkspaceViewState.filters` slice, or `[]` when absent. Presentation-only state -- see the file header's ADR 0005/§54 note. */
  filters: WorkspaceFilter[];
  /** Fires with the COMPLETE next filters array (not a delta) whenever any control changes. The caller writes it through `updateSelection()`; this component never calls a command directly. */
  onFiltersChange: (filters: WorkspaceFilter[]) => void;
  /** A plain count of obligations still open (however the caller defines "open" from a real `ReadinessResult`) -- this component fabricates no question text of its own. */
  openQuestionsCount: number;
  /** Opens the existing "Still checking" surface. Ownership of what "open" means stays with the orchestrator. */
  onOpenQuestions: () => void;
}

const PRIORITY_BAND_LABEL: Record<PriorityBand, string> = {
  very_important: 'Very important',
  important: 'Important',
  somewhat_important: 'Somewhat important',
};

/** Ordinal (not proportional) segment count -- see the file header's "Priorities" section for why this must stay ordinal, not a continuous rendering of the raw weight. */
const PRIORITY_BAND_SEGMENTS: Record<PriorityBand, number> = {
  somewhat_important: 1,
  important: 2,
  very_important: 3,
};

const PRIORITY_BAR_SEGMENT_COUNT = 3;

/** Decorative-only visual weight indicator -- `aria-hidden`, never the sole carrier of the band distinction (design-system.md "Never color-only"). */
function PriorityWeightBar({ band }: { band: PriorityBand }) {
  const filledCount = PRIORITY_BAND_SEGMENTS[band];
  return (
    <span aria-hidden="true" className="flex shrink-0 items-center gap-[var(--space-0-5)]">
      {Array.from({ length: PRIORITY_BAR_SEGMENT_COUNT }, (_, index) => index + 1).map(
        (segment) => (
          <span
            key={segment}
            className="h-[10px] w-[6px] rounded-[var(--radius-xs)]"
            style={{
              backgroundColor:
                segment <= filledCount ? 'var(--color-brand)' : 'var(--color-border-subtle)',
            }}
          />
        ),
      )}
    </span>
  );
}

function PriorityRow({ concern }: { concern: DecisionProfileConcern }) {
  return (
    <li
      data-testid={`workspace-sidebar-priority-${concern.id}`}
      className="flex flex-col gap-[var(--space-0-5)] rounded-[var(--radius-sm)] px-[var(--space-1)] py-[var(--space-1-5)]"
    >
      {/* Line 1: the label, the ONLY thing that identifies this row, gets
         the full row width and is never `truncate`d -- a long label wraps
         onto a second line rather than clipping to "S...". See the file
         header's "Row layout" note for the defect this fixes. */}
      <span className="text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] leading-snug text-[var(--color-ink)]">
        {concern.label}
      </span>
      {/* Line 2: the band + bar, de-emphasised (small, muted, no caps
         shout) and moved off the label's line entirely -- secondary
         information, per this task's brief, now that the bar already
         encodes the same distinction ordinally. */}
      <span className="flex items-center gap-[var(--space-1-5)]">
        <PriorityWeightBar band={concern.priorityBand} />
        <span
          data-testid={`workspace-sidebar-priority-band-${concern.id}`}
          className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]"
        >
          {PRIORITY_BAND_LABEL[concern.priorityBand]}
        </span>
      </span>
    </li>
  );
}

// Every `valueType` this component has an honest single-field comparison
// control for -- see the file header's "Filters" section for why the
// remaining four (`date`/`duration`/`range`/`string_list`) are excluded.
const FILTERABLE_VALUE_TYPES: ReadonlySet<AttributeValueType> = new Set([
  'boolean',
  'enum',
  'number',
  'money',
  'string',
  'text',
]);

/** `enum` additionally requires a real, pack/case-declared `allowedValues` list -- see the file header's "Never fabricate" note. */
function isFilterableAttribute(attribute: AttributeDefinition): boolean {
  if (!FILTERABLE_VALUE_TYPES.has(attribute.valueType)) return false;
  if (attribute.valueType === 'enum') return (attribute.allowedValues?.length ?? 0) > 0;
  return true;
}

function filterControlId(fieldId: string): string {
  return `workspace-sidebar-filter-${fieldId}`;
}

// --- Derived filter planning (this task's Defect 2 fix) -----------------
//
// Everything below reads the caller-supplied `options` (real `EntityRecord`
// saved cars/options -- the `WorkspaceSidebarProps.options` doc comment)
// to decide, per filterable attribute, whether to show a facet of real
// values-with-counts, a narrower boolean/numeric control, or nothing at
// all. It never reaches into `attribute.allowedValues` -- that field
// describes what a PACK AUTHOR anticipated, which may be stale or wider
// than what any saved option actually has; a value present on zero saved
// options is not a useful filter choice, and a value a pack author never
// anticipated (a `custom.*` attribute) is exactly the case this component
// must still handle honestly (CLAUDE.md "extensible domain data").

/** One distinct value actually present across the case's saved options, with how many options carry it. */
interface FacetOption {
  value: string;
  count: number;
}

/**
 * What to render for one filterable attribute once real option data is
 * available. `suppressed` covers every "this control could not possibly
 * narrow the current set" case (every option agrees, or no option has
 * asserted a value at all) -- Defect 2b's "hide ... filters that cannot
 * narrow the current set (e.g. every option has the same drivetrain)".
 * `legacy` means "no option data was supplied at all" and defers entirely
 * to this file's original, pre-existing per-`valueType` rendering so every
 * test written before this task keeps passing unmodified.
 */
type FilterRenderPlan =
  | { kind: 'legacy' }
  | { kind: 'suppressed' }
  | { kind: 'boolean_narrow'; matchingCount: number; totalCount: number }
  | { kind: 'facet'; facetOptions: FacetOption[] }
  | { kind: 'numeric'; min: number; max: number; distinctCount: number; currency?: string };

/**
 * The raw comparable primitive an option actually recorded for `attributeId`,
 * or `null` when this option has no usable value for it (the field was
 * never set, or its `AttributeRecord.status` is `'unknown'` -- in which case
 * `AttributeRecordSchema` guarantees `value` is absent, so `record?.value`
 * being `undefined` already covers that case without inspecting `status`
 * directly).
 */
function sampleAttributeValue(
  option: EntityRecord,
  attributeId: string,
): string | number | boolean | null {
  const value = option.attributes[attributeId]?.value;
  if (value === undefined) return null;
  switch (value.type) {
    case 'boolean':
      return value.value;
    case 'enum':
    case 'string':
    case 'text':
      return value.value;
    case 'number':
      return value.value;
    case 'money':
      return value.amount;
    default:
      // date/duration/range/string_list -- unreachable in practice because
      // `isFilterableAttribute` never lets an attribute of these
      // `valueType`s become eligible in the first place, so `planFilter`
      // never calls this for one. An honest exhaustive branch rather than
      // a silent `as never` cast, matching `FilterControl`'s own default case.
      return null;
  }
}

/** Builds the sorted, counted facet list for an `enum`/`string`/`text` attribute from the values actually present -- never from `attribute.allowedValues`. */
function buildFacetOptions(attribute: AttributeDefinition, options: EntityRecord[]): FacetOption[] {
  const counts = new Map<string, number>();
  for (const option of options) {
    const sample = sampleAttributeValue(option, attribute.id);
    if (sample === null) continue;
    const key = String(sample);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Decides what (if anything) to render for one filterable attribute. See `FilterRenderPlan`'s doc comment for what each variant means. */
function planFilter(attribute: AttributeDefinition, options: EntityRecord[]): FilterRenderPlan {
  // No option data was supplied at all -- defer entirely to the original
  // per-`valueType` controls this file shipped with (see `FilterControl`'s
  // `legacy` branch). This is the path every pre-existing test exercises.
  if (options.length === 0) return { kind: 'legacy' };

  if (attribute.valueType === 'boolean') {
    const samples = options
      .map((option) => sampleAttributeValue(option, attribute.id))
      .filter((sample): sample is boolean => typeof sample === 'boolean');
    const matchingCount = samples.filter((sample) => sample).length;
    const totalCount = samples.length;
    // Cannot narrow when nobody has asserted a value yet, or when every
    // option that has agrees (all true, or all false) -- toggling the
    // filter would then either match everything or nothing.
    if (totalCount === 0 || matchingCount === 0 || matchingCount === totalCount) {
      return { kind: 'suppressed' };
    }
    return { kind: 'boolean_narrow', matchingCount, totalCount };
  }

  if (attribute.valueType === 'number' || attribute.valueType === 'money') {
    const numbers: number[] = [];
    let currency: string | undefined;
    for (const option of options) {
      const value = option.attributes[attribute.id]?.value;
      if (value === undefined) continue;
      if (value.type === 'number') numbers.push(value.value);
      else if (value.type === 'money') {
        numbers.push(value.amount);
        currency ??= value.currency;
      }
    }
    const distinctCount = new Set(numbers).size;
    // A min===max (or entirely absent) range cannot narrow anything --
    // "at most X" would either include every option or none of them.
    if (distinctCount <= 1) return { kind: 'suppressed' };
    return {
      kind: 'numeric',
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      distinctCount,
      // `exactOptionalPropertyTypes` treats an explicit `currency:
      // undefined` as distinct from "the key is absent" -- spread it in
      // only when a `money` sample actually supplied one, so a plain
      // `number` attribute's plan has no `currency` key at all rather than
      // one set to `undefined`.
      ...(currency !== undefined ? { currency } : {}),
    };
  }

  // The only remaining `isFilterableAttribute` types: enum/string/text.
  const facetOptions = buildFacetOptions(attribute, options);
  if (facetOptions.length <= 1) return { kind: 'suppressed' };
  return { kind: 'facet', facetOptions };
}

/**
 * How able a surviving control is to actually narrow the current (at most
 * 5-option) set -- higher sorts first. "prioritise the filters that matter
 * for this pack" (this task's brief): a facet with more real distinct
 * values, or a numeric field with a wider spread of real values, can split
 * the option set more finely than one with only two possible buckets.
 * `boolean_narrow` is always exactly 2 real buckets (true/false) by the
 * time `planFilter` has ruled out the "cannot narrow" case above.
 */
function discriminatingScore(plan: FilterRenderPlan): number {
  switch (plan.kind) {
    case 'facet':
      return plan.facetOptions.length;
    case 'numeric':
      return plan.distinctCount;
    case 'boolean_narrow':
      return 2;
    case 'legacy':
    case 'suppressed':
      return 0;
  }
}

/** `{ kind: 'numeric' }`'s live "Seen: min-max" hint, grounding the free-typed "at most" input in the case's real data instead of a blank box. */
function formatNumericRangeHint(
  attribute: AttributeDefinition,
  plan: Extract<FilterRenderPlan, { kind: 'numeric' }>,
): string {
  if (attribute.valueType === 'money' && plan.currency !== undefined) {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: plan.currency,
      maximumFractionDigits: 0,
    });
    return `Seen: ${formatter.format(plan.min)}–${formatter.format(plan.max)}`;
  }
  const unit = attribute.unit !== undefined ? ` ${attribute.unit}` : '';
  return `Seen: ${plan.min.toLocaleString('en-US')}–${plan.max.toLocaleString('en-US')}${unit}`;
}

function committedFilterValue(filters: WorkspaceFilter[], fieldId: string): string {
  return filters.find((filter) => filter.fieldId === fieldId)?.value ?? '';
}

/** Returns the next COMPLETE filters array with any existing entry for `fieldId` replaced (or removed, when `next` is `null`) -- never a delta. */
function upsertFilter(
  filters: WorkspaceFilter[],
  fieldId: string,
  next: WorkspaceFilter | null,
): WorkspaceFilter[] {
  const withoutField = filters.filter((filter) => filter.fieldId !== fieldId);
  return next === null ? withoutField : [...withoutField, next];
}

interface StaticFilterControlProps {
  attribute: AttributeDefinition;
  filters: WorkspaceFilter[];
  onFiltersChange: (filters: WorkspaceFilter[]) => void;
}

function BooleanFilterControl({
  attribute,
  filters,
  onFiltersChange,
  hint,
}: StaticFilterControlProps & {
  /**
   * Derived-mode-only "N of M match" grounding text (Defect 2 fix) --
   * `undefined` in legacy mode, matching the original control exactly.
   * Real data, not a fabricated estimate: computed by `planFilter` from the
   * caller's actual `options` before this control is ever reached, and
   * this control only renders at all when `planFilter` already decided the
   * toggle CAN narrow the set (see `FilterRenderPlan`'s `boolean_narrow`).
   */
  hint?: string;
}) {
  const current = filters.find((filter) => filter.fieldId === attribute.id);
  const pressed = current?.operator === 'equals' && current.value === 'true';
  const controlId = filterControlId(attribute.id);

  return (
    <div className="flex items-center justify-between gap-[var(--space-2)]">
      <div className="flex min-w-0 flex-col gap-[var(--space-0-5)]">
        <Label
          htmlFor={controlId}
          className="text-[length:var(--font-size-sm)] text-[var(--color-ink)]"
        >
          {`${attribute.label} only`}
        </Label>
        {hint !== undefined ? (
          <span className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]">
            {hint}
          </span>
        ) : null}
      </div>
      <Toggle
        id={controlId}
        data-testid={controlId}
        pressed={pressed}
        onPressedChange={(nextPressed) => {
          onFiltersChange(
            upsertFilter(
              filters,
              attribute.id,
              nextPressed ? { fieldId: attribute.id, operator: 'equals', value: 'true' } : null,
            ),
          );
        }}
        variant="outline"
        size="sm"
        className="min-h-[var(--size-touch-target-min)] min-w-[var(--size-touch-target-min)] shrink-0 data-[state=on]:bg-[color:var(--color-status-active-bg)] data-[state=on]:text-[color:var(--color-status-active-ink)]"
      >
        {pressed ? 'On' : 'Off'}
      </Toggle>
    </div>
  );
}

// Same flat recipe as ui/input.tsx / CustomConcernForm.tsx's own native
// <select> -- see the file header's "Filters" section for why this cannot
// be the Radix `Select*` primitives.
const selectClassName =
  'min-h-[var(--size-touch-target-min)] h-9 w-full min-w-0 rounded-[var(--radius-sm)] border-0 bg-muted px-3 py-1 text-[length:var(--font-size-base)] outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60';

function EnumFilterControl({ attribute, filters, onFiltersChange }: StaticFilterControlProps) {
  const current = filters.find((filter) => filter.fieldId === attribute.id);
  const value = current?.operator === 'equals' ? current.value : '';
  const allowedValues = attribute.allowedValues ?? [];
  const controlId = filterControlId(attribute.id);

  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <Label
        htmlFor={controlId}
        className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
      >
        {attribute.label}
      </Label>
      <select
        id={controlId}
        data-testid={controlId}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          onFiltersChange(
            upsertFilter(
              filters,
              attribute.id,
              nextValue === ''
                ? null
                : { fieldId: attribute.id, operator: 'equals', value: nextValue },
            ),
          );
        }}
        className={selectClassName}
      >
        <option value="">{`Any ${attribute.label.toLowerCase()}`}</option>
        {allowedValues.map((allowedValue) => (
          <option key={allowedValue} value={allowedValue}>
            {allowedValue}
          </option>
        ))}
      </select>
    </div>
  );
}

interface TextEntryFilterControlProps extends StaticFilterControlProps {
  /** The ephemeral mid-keystroke echo -- `undefined` means "show the committed `filters` value." See the file header's "Filters" section. */
  pendingValue: string | undefined;
  onPendingValueChange: (fieldId: string, value: string | undefined) => void;
}

function NumberFilterControl({
  attribute,
  filters,
  onFiltersChange,
  pendingValue,
  onPendingValueChange,
  rangeHint,
}: TextEntryFilterControlProps & {
  /**
   * Derived-mode-only "Seen: min-max" grounding text (Defect 2 fix) --
   * `undefined` in legacy mode, matching the original control exactly.
   * Real data computed by `planFilter`/`formatNumericRangeHint` from the
   * caller's actual `options`, so a blank "at most" box now shows the
   * range it can actually usefully be typed against instead of nothing.
   */
  rangeHint?: string;
}) {
  const committed = committedFilterValue(filters, attribute.id);
  const display = pendingValue ?? committed;
  const controlId = filterControlId(attribute.id);

  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <Label
        htmlFor={controlId}
        className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
      >
        {`${attribute.label} — at most`}
      </Label>
      {rangeHint !== undefined ? (
        <span className="text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]">
          {rangeHint}
        </span>
      ) : null}
      <div className="flex items-center gap-[var(--space-2)]">
        <Input
          id={controlId}
          data-testid={controlId}
          type="number"
          inputMode="decimal"
          value={display}
          className="min-h-[var(--size-touch-target-min)] border-0"
          onChange={(event) => {
            const raw = event.target.value;
            onPendingValueChange(attribute.id, raw);
            const trimmed = raw.trim();
            if (trimmed === '') {
              onFiltersChange(upsertFilter(filters, attribute.id, null));
              return;
            }
            // An interim, not-yet-parseable keystroke (e.g. a lone "-" or
            // trailing ".") is echoed on screen via `pendingValue` above but
            // deliberately NOT committed to `onFiltersChange` -- committing
            // a non-numeric string here would violate `WorkspaceFilterSchema`
            // the instant a filter that claims `less_than_or_equal` carries
            // an unparseable value.
            if (!Number.isFinite(Number(trimmed))) return;
            onFiltersChange(
              upsertFilter(filters, attribute.id, {
                fieldId: attribute.id,
                operator: 'less_than_or_equal',
                value: trimmed,
              }),
            );
          }}
        />
        {attribute.unit !== undefined ? (
          <span className="shrink-0 text-[length:var(--font-size-xs)] text-[var(--color-ink-muted)]">
            {attribute.unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TextFilterControl({
  attribute,
  filters,
  onFiltersChange,
  pendingValue,
  onPendingValueChange,
}: TextEntryFilterControlProps) {
  const committed = committedFilterValue(filters, attribute.id);
  const display = pendingValue ?? committed;
  const controlId = filterControlId(attribute.id);

  return (
    <div className="flex flex-col gap-[var(--space-1)]">
      <Label
        htmlFor={controlId}
        className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
      >
        {attribute.label}
      </Label>
      <Input
        id={controlId}
        data-testid={controlId}
        type="text"
        maxLength={500}
        value={display}
        placeholder={`Search ${attribute.label.toLowerCase()}`}
        className="min-h-[var(--size-touch-target-min)] border-0"
        onChange={(event) => {
          const raw = event.target.value;
          onPendingValueChange(attribute.id, raw);
          onFiltersChange(
            upsertFilter(
              filters,
              attribute.id,
              raw.trim() === ''
                ? null
                : { fieldId: attribute.id, operator: 'contains', value: raw },
            ),
          );
        }}
      />
    </div>
  );
}

interface FacetFilterControlProps {
  attribute: AttributeDefinition;
  filters: WorkspaceFilter[];
  onFiltersChange: (filters: WorkspaceFilter[]) => void;
  facetOptions: FacetOption[];
}

/**
 * Derived-mode-only replacement (Defect 2 fix) for the free-text box
 * (`TextFilterControl`) or pack-declared `<select>` (`EnumFilterControl`)
 * this component used for `enum`/`string`/`text` attributes before this
 * task -- one selectable chip per DISTINCT VALUE ACTUALLY PRESENT on the
 * case's saved options, each labelled with its live count ("Toyota (2)"),
 * "the pattern every shopping site uses" per this task's brief, and
 * inherently bounded to at most 5 chips by the product's own 5-option case
 * cap. Single-select, matching the `equals` operator it emits: pressing a
 * chip commits `{ fieldId, operator: 'equals', value }`; pressing the
 * already-pressed chip again clears the filter entirely (the same "back to
 * no filter for this field" semantics `EnumFilterControl`'s "Any ___"
 * option had).
 */
function FacetFilterControl({
  attribute,
  filters,
  onFiltersChange,
  facetOptions,
}: FacetFilterControlProps) {
  const current = filters.find((filter) => filter.fieldId === attribute.id);
  const selectedValue = current?.operator === 'equals' ? current.value : null;
  const groupId = filterControlId(attribute.id);
  const labelId = `${groupId}-label`;

  return (
    <div className="flex flex-col gap-[var(--space-1-5)]">
      <span
        id={labelId}
        className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
      >
        {attribute.label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        data-testid={groupId}
        className="flex flex-wrap gap-[var(--space-1-5)]"
      >
        {facetOptions.map(({ value, count }, index) => {
          const pressed = selectedValue === value;
          return (
            <Toggle
              key={value}
              data-testid={`${groupId}-option-${index}`}
              pressed={pressed}
              onPressedChange={(nextPressed) => {
                onFiltersChange(
                  upsertFilter(
                    filters,
                    attribute.id,
                    nextPressed ? { fieldId: attribute.id, operator: 'equals', value } : null,
                  ),
                );
              }}
              variant="outline"
              size="sm"
              title={value}
              className="min-h-[var(--size-touch-target-min)] max-w-[200px] rounded-[var(--radius-xs)] data-[state=on]:bg-[color:var(--color-status-active-bg)] data-[state=on]:text-[color:var(--color-status-active-ink)]"
            >
              <span className="min-w-0 truncate">{value}</span>
              <span className="shrink-0 text-[length:var(--font-size-xs)] opacity-70">{` (${count})`}</span>
            </Toggle>
          );
        })}
      </div>
    </div>
  );
}

interface FilterControlProps extends StaticFilterControlProps {
  plan: FilterRenderPlan;
  pendingValue: string | undefined;
  onPendingValueChange: (fieldId: string, value: string | undefined) => void;
}

/**
 * Dispatches to a control for `attribute`. `plan` (from `planFilter`)
 * decides WHICH control: a `legacy`/`suppressed`-aware `plan` short-
 * circuits to the pre-existing per-`valueType` mapping or to nothing at
 * all; `boolean_narrow`/`facet`/`numeric` route to the new derived-mode
 * controls this task adds. See the file header's "Filters" section for the
 * full mapping and why each variant exists.
 */
function FilterControl({
  attribute,
  plan,
  filters,
  onFiltersChange,
  pendingValue,
  onPendingValueChange,
}: FilterControlProps) {
  if (plan.kind === 'suppressed') return null;

  if (plan.kind === 'boolean_narrow') {
    return (
      <BooleanFilterControl
        attribute={attribute}
        filters={filters}
        onFiltersChange={onFiltersChange}
        hint={`${plan.matchingCount} of ${plan.totalCount} match`}
      />
    );
  }

  if (plan.kind === 'facet') {
    return (
      <FacetFilterControl
        attribute={attribute}
        filters={filters}
        onFiltersChange={onFiltersChange}
        facetOptions={plan.facetOptions}
      />
    );
  }

  if (plan.kind === 'numeric') {
    return (
      <NumberFilterControl
        attribute={attribute}
        filters={filters}
        onFiltersChange={onFiltersChange}
        pendingValue={pendingValue}
        onPendingValueChange={onPendingValueChange}
        rangeHint={formatNumericRangeHint(attribute, plan)}
      />
    );
  }

  // plan.kind === 'legacy' -- no option data was supplied; fall back to the
  // exact per-`valueType` control this file shipped with originally.
  switch (attribute.valueType) {
    case 'boolean':
      return (
        <BooleanFilterControl
          attribute={attribute}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      );
    case 'enum':
      return (
        <EnumFilterControl
          attribute={attribute}
          filters={filters}
          onFiltersChange={onFiltersChange}
        />
      );
    case 'number':
    case 'money':
      return (
        <NumberFilterControl
          attribute={attribute}
          filters={filters}
          onFiltersChange={onFiltersChange}
          pendingValue={pendingValue}
          onPendingValueChange={onPendingValueChange}
        />
      );
    case 'string':
    case 'text':
      return (
        <TextFilterControl
          attribute={attribute}
          filters={filters}
          onFiltersChange={onFiltersChange}
          pendingValue={pendingValue}
          onPendingValueChange={onPendingValueChange}
        />
      );
    default:
      // `isFilterableAttribute` already excludes date/duration/range/
      // string_list upstream, so this is unreachable in practice -- kept as
      // an honest exhaustive branch rather than a silent `as never` cast.
      return null;
  }
}

export function WorkspaceSidebar({
  layout,
  decisionProfile,
  attributeDefinitions,
  options = [],
  filters,
  onFiltersChange,
  openQuestionsCount,
  onOpenQuestions,
}: WorkspaceSidebarProps) {
  // Only the ephemeral mid-keystroke echo for number/text filter inputs --
  // see the file header's "Filters" section. Declared before the narrow-mode
  // early return so hook order stays fixed across renders regardless of
  // `layout` (React's Rules of Hooks) -- the state is simply unused when
  // this component renders `null`.
  const [pendingTextValues, setPendingTextValues] = useState<Record<string, string>>({});

  if (layout === 'narrow') return null;

  const priorityConcerns: DecisionProfileConcern[] =
    decisionProfile === null
      ? []
      : [
          ...decisionProfile.mustHave,
          ...decisionProfile.important,
          ...decisionProfile.niceToHave,
        ].sort((a, b) => b.weight - a.weight);

  const eligibleAttributes = attributeDefinitions.filter(isFilterableAttribute);

  // Defect 2 fix: plan each eligible attribute's control from the real
  // `options` data (see `planFilter`'s doc comment), drop anything that
  // cannot possibly narrow the current set, and -- only when real option
  // data actually informs the plan -- put the most discriminating controls
  // first ("prioritise the filters that matter for this pack"). When
  // `options` is empty, every plan is `{ kind: 'legacy' }` and this
  // reduces to the original, unsorted, always-rendered attribute list.
  const hasOptionSignal = options.length > 0;
  const filterEntries = eligibleAttributes
    .map((attribute) => ({ attribute, plan: planFilter(attribute, options) }))
    .filter((entry) => entry.plan.kind !== 'suppressed');
  const orderedFilterEntries = hasOptionSignal
    ? [...filterEntries].sort((a, b) => discriminatingScore(b.plan) - discriminatingScore(a.plan))
    : filterEntries;

  const stillCheckingTone = openQuestionsCount > 0 ? 'open' : 'satisfied';
  const stillCheckingMeta = STATUS_TONE_META[stillCheckingTone];

  function handlePendingValueChange(fieldId: string, value: string | undefined) {
    setPendingTextValues((previous) => {
      if (value === undefined) {
        const { [fieldId]: _removed, ...rest } = previous;
        return rest;
      }
      return { ...previous, [fieldId]: value };
    });
  }

  return (
    <aside
      data-testid="workspace-sidebar"
      aria-label="Priorities, filters, and open questions"
      className="flex flex-col gap-[var(--space-5)]"
    >
      <section
        data-testid="workspace-sidebar-priorities"
        aria-labelledby="workspace-sidebar-priorities-heading"
        className="flex flex-col gap-[var(--space-2)]"
      >
        <h2
          id="workspace-sidebar-priorities-heading"
          className="label-caps text-[var(--color-ink-secondary)]"
        >
          Priorities
        </h2>
        {priorityConcerns.length === 0 ? (
          <p
            data-testid="workspace-sidebar-priorities-empty"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            Nothing prioritized yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-[var(--space-1)]">
            {priorityConcerns.map((concern) => (
              <PriorityRow key={concern.id} concern={concern} />
            ))}
          </ul>
        )}
      </section>

      <Separator />

      <section
        data-testid="workspace-sidebar-filters"
        aria-labelledby="workspace-sidebar-filters-heading"
        className="flex flex-col gap-[var(--space-3)]"
      >
        <h2
          id="workspace-sidebar-filters-heading"
          className="label-caps text-[var(--color-ink-secondary)]"
        >
          Filters
        </h2>
        {orderedFilterEntries.length === 0 ? (
          <p
            data-testid="workspace-sidebar-filters-empty"
            className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
          >
            {/* Two genuinely different empty reasons get two honest
               messages (CLAUDE.md "Never fabricate"): the pack/case simply
               declared no filterable attributes at all, versus real option
               data exists but every one of them agrees on every filterable
               detail (Defect 2b -- nothing here COULD narrow the set). */}
            {hasOptionSignal
              ? 'Every saved option matches on every filterable detail.'
              : 'No filterable details yet.'}
          </p>
        ) : (
          <div className="flex flex-col gap-[var(--space-3)]">
            {orderedFilterEntries.map(({ attribute, plan }) => (
              <FilterControl
                key={attribute.id}
                attribute={attribute}
                plan={plan}
                filters={filters}
                onFiltersChange={onFiltersChange}
                pendingValue={pendingTextValues[attribute.id]}
                onPendingValueChange={handlePendingValueChange}
              />
            ))}
          </div>
        )}
      </section>

      <Separator />

      <section
        data-testid="workspace-sidebar-still-checking"
        className="flex flex-col gap-[var(--space-2)]"
      >
        <Button
          type="button"
          data-testid="workspace-sidebar-still-checking-button"
          onClick={onOpenQuestions}
          variant="secondary"
          className="min-h-[var(--size-touch-target-min)] w-full justify-between"
          style={{ backgroundColor: stillCheckingMeta.bg, color: stillCheckingMeta.ink }}
        >
          <span>Still checking</span>
          <Badge
            data-testid="workspace-sidebar-still-checking-count"
            variant="outline"
            className="label-caps gap-[var(--space-1)]"
            style={{ color: stillCheckingMeta.ink, backgroundColor: 'transparent' }}
          >
            <span aria-hidden="true">{stillCheckingMeta.icon}</span>
            {openQuestionsCount}
          </Badge>
        </Button>
      </section>
    </aside>
  );
}
