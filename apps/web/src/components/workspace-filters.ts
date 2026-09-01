/**
 * The one place `WorkspaceFilter` semantics live: which attributes can be
 * filtered, what control each one deserves given the case's REAL saved
 * options, how an applied filter reads as human text, and -- new here --
 * what it actually does to the option list.
 *
 * ## Why this module exists at all
 *
 * Two of these three jobs used to be private functions inside
 * `WorkspaceSidebar.tsx`, and the third did not exist. A grep for
 * `WorkspaceFilter` across the whole repo matched exactly four files
 * (`packages/contracts/src/case.ts` declaring it, `App.tsx` persisting it
 * through `setView`, and the sidebar plus its test writing it) -- so every
 * filter control on screen wrote a real, schema-valid, durably persisted
 * value that **no code anywhere read back**. Toggling "AWD only" changed
 * the stored `WorkspaceViewState.filters` and changed nothing a user could
 * see. `applyWorkspaceFilters` below is the missing reader.
 *
 * The move out of the sidebar is the project owner's call on the UI:
 * "For the filters, why not just put this in some sort of dialog or modal?
 * And just show the applied filters?" A modal is reachable from BOTH
 * layouts, which also closes a real gap -- `WorkspaceSidebar` renders
 * `null` at `layout: 'narrow'`, so pane/WebMCP mode had no filter entry
 * point whatsoever, contradicting ADR 0008's "still has to have the same
 * functionalities" in both modes. Sharing the logic here rather than in
 * either UI component is what lets one implementation serve the sheet
 * (`FilterSheet.tsx`), the applied-chip row (`FilterBar.tsx`), and the
 * orchestrator's own narrowing of the option list (`App.tsx`) without three
 * drifting copies.
 *
 * ## Presentation, never a decision mutation (change-set §54 / ADR 0005 #1)
 *
 * Everything here is a pure function over data the caller already has. A
 * filter narrows which already-known options are VISIBLE; it can never
 * change what the user said MATTERS (a `Criterion`'s `weight`/`target`,
 * written only by `sift_update_criteria` and friends), never appends a
 * `CaseEvent`, and never advances `eventSequence`. `applyWorkspaceFilters`
 * returns a new array and mutates nothing, which is the structural version
 * of that promise: hiding a minivan from the list cannot reach scoring,
 * readiness, evidence validity, or the recommendation.
 *
 * Deliberately NOT applied to the recommendation hero or readiness by any
 * caller: a decision Sift already reached about an option must stay visible
 * even while a filter hides that option from the browsing list, or the
 * product would appear to silently retract its own answer.
 *
 * ## The second narrowing: `applyAssistantNarrowing`
 *
 * The model narrows the same list a different way, through
 * `sift_set_view`'s `visibleOptionIds` -- a literal set of options rather
 * than a rule. That reader lives here too (see its own comment for why),
 * because the two narrowings are only ever meaningful together: both must
 * hold for an option to render, and both stay separately visible and
 * separately removable in `FilterBar` so a shortened list always says who
 * shortened it.
 */
import type {
  AttributeDefinition,
  AttributeValueType,
  EntityRecord,
  WorkspaceFilter,
} from '@sift/contracts';

// --- Eligibility --------------------------------------------------------

/**
 * Every `valueType` there is an honest single-field comparison control for.
 *
 * `date`, `duration`, `range`, and `string_list` are excluded: none of
 * `WORKSPACE_FILTER_OPERATORS`'s seven operators (equals/not_equals/
 * contains/four numeric comparisons) maps onto those value types without
 * inventing UI nobody asked for -- a date-range picker, a duration-unit-
 * aware comparator, a multi-select chip list. An honest omission, not a bug.
 */
const FILTERABLE_VALUE_TYPES: ReadonlySet<AttributeValueType> = new Set([
  'boolean',
  'enum',
  'number',
  'money',
  'string',
  'text',
]);

/** `enum` additionally requires a real, pack/case-declared `allowedValues` list -- never fabricate one. */
export function isFilterableAttribute(attribute: AttributeDefinition): boolean {
  if (!FILTERABLE_VALUE_TYPES.has(attribute.valueType)) return false;
  if (attribute.valueType === 'enum') return (attribute.allowedValues?.length ?? 0) > 0;
  return true;
}

// --- Reading real option values ----------------------------------------

/**
 * The raw comparable primitive an option actually recorded for
 * `attributeId`, or `null` when this option has no usable value for it (the
 * field was never set, or its `AttributeRecord.status` is `'unknown'` -- in
 * which case `AttributeRecordSchema` guarantees `value` is absent, so
 * `record?.value` being `undefined` already covers that case without
 * inspecting `status` directly).
 */
export function sampleAttributeValue(
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
      // date/duration/range/string_list -- unreachable for a planned filter
      // because `isFilterableAttribute` never lets those become eligible.
      // Reachable from `applyWorkspaceFilters`, though, where a stale or
      // hand-written filter may name one; `null` there means "no usable
      // value," which the operator rules below already handle honestly.
      return null;
  }
}

// --- Planning which control an attribute deserves ------------------------
//
// Everything below reads the caller-supplied real `EntityRecord` options to
// decide, per filterable attribute, whether to show a facet of real values-
// with-counts, a narrower boolean/numeric control, or nothing at all. It
// never reaches into `attribute.allowedValues` -- that field describes what
// a PACK AUTHOR anticipated, which may be stale, wider than what any saved
// option actually has, or missing a `custom.*` value a pack author never
// anticipated. A value present on zero saved options is not a useful filter
// choice.

/** One distinct value actually present across the case's saved options, with how many options carry it. */
export interface FacetOption {
  value: string;
  count: number;
}

/**
 * What to render for one filterable attribute once real option data is
 * available. `suppressed` covers every "this control could not possibly
 * narrow the current set" case (every option agrees, or no option has
 * asserted a value at all) -- a filter that cannot change which options are
 * visible is not a useful control, only clutter. `legacy` means "no option
 * data was supplied at all" and defers to the generic per-`valueType`
 * controls.
 */
export type FilterRenderPlan =
  | { kind: 'legacy' }
  | { kind: 'suppressed' }
  | { kind: 'boolean_narrow'; matchingCount: number; totalCount: number }
  | { kind: 'facet'; facetOptions: FacetOption[] }
  | { kind: 'numeric'; min: number; max: number; distinctCount: number; currency?: string };

/** Builds the sorted, counted facet list for an `enum`/`string`/`text` attribute from the values actually present -- never from `attribute.allowedValues`. */
export function buildFacetOptions(
  attribute: AttributeDefinition,
  options: EntityRecord[],
): FacetOption[] {
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

/** Decides what (if anything) to render for one filterable attribute. See `FilterRenderPlan` for what each variant means. */
export function planFilter(
  attribute: AttributeDefinition,
  options: EntityRecord[],
): FilterRenderPlan {
  if (options.length === 0) return { kind: 'legacy' };

  if (attribute.valueType === 'boolean') {
    const samples = options
      .map((option) => sampleAttributeValue(option, attribute.id))
      .filter((sample): sample is boolean => typeof sample === 'boolean');
    const matchingCount = samples.filter((sample) => sample).length;
    const totalCount = samples.length;
    // Cannot narrow when nobody has asserted a value yet, or when every
    // option that has agrees (all true, or all false) -- toggling the filter
    // would then either match everything or nothing.
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
    // A min===max (or entirely absent) range cannot narrow anything -- "at
    // most X" would either include every option or none of them.
    if (distinctCount <= 1) return { kind: 'suppressed' };
    return {
      kind: 'numeric',
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      distinctCount,
      // `exactOptionalPropertyTypes` treats an explicit `currency: undefined`
      // as distinct from "the key is absent" -- spread it in only when a
      // `money` sample actually supplied one.
      ...(currency !== undefined ? { currency } : {}),
    };
  }

  // The only remaining `isFilterableAttribute` types: enum/string/text.
  const facetOptions = buildFacetOptions(attribute, options);
  if (facetOptions.length <= 1) return { kind: 'suppressed' };
  // A facet where EVERY value appears exactly once cannot group anything --
  // picking a chip always leaves exactly one option. That is selection, not
  // filtering, and the product already has better affordances for selecting
  // one option (the List and Board views show all of them at once).
  //
  // Found by looking at the running product, not reasoned from first
  // principles: the seeded four-car case rendered twelve chips across Make,
  // Model, and Trim -- "Honda (1) Mazda (1) Subaru (1) Toyota (1)",
  // "CR-V (1) CX-5 (1) Outback (1) RAV4 (1)", and so on -- filling the whole
  // sheet above the fold with controls that can only ever isolate a single
  // car. This is the degenerate case of the rule this function already
  // commits to a few lines up ("a filter that cannot change which options
  // are visible is not a useful control, only visual clutter"), so it is
  // suppressed for the same reason and not merely ranked lower.
  //
  // Deliberately keyed on the DATA (are all buckets singletons?) rather than
  // on the attribute being an identity field: a case with five cars where
  // two are Toyotas gets a real, useful Make facet, and this rule correctly
  // keeps it. It only ever removes a control that provably cannot group.
  if (facetOptions.every((facet) => facet.count === 1)) return { kind: 'suppressed' };
  return { kind: 'facet', facetOptions };
}

/**
 * How useful a surviving control actually is, as **the largest group of
 * options a single choice can keep**. Higher sorts first.
 *
 * This deliberately replaced an earlier "count the distinct values" score,
 * which was exactly backwards for the size of case this product holds (at
 * most five options, product.md). Distinctness peaks when every value is
 * unique -- so a Trim field with four values over four cars scored highest
 * and led the sheet, while a Drivetrain field that genuinely splits the set
 * three-to-one scored lower and sank. In the running product that promoted
 * the three least useful controls in the pack to the top of the modal.
 *
 * Ranking by group size inverts that correctly: a control that can keep
 * three of four options is more useful than one that can only ever keep one,
 * because keeping one is what the option list is already for. At a
 * catalog-sized dataset the two scores would nearly agree; at five options
 * they are opposites, and five options is what Sift has.
 *
 *  - `facet`: the biggest bucket. (`planFilter` has already suppressed the
 *    all-singleton case, so this is at least 2 for any surviving facet.)
 *  - `boolean_narrow`: the larger of the true/false sides.
 *  - `numeric`: an "at most" threshold can keep every option but the
 *    highest-valued one before it stops narrowing at all, so its best real
 *    grouping is `distinctCount - 1`.
 */
export function discriminatingScore(plan: FilterRenderPlan): number {
  switch (plan.kind) {
    case 'facet':
      return Math.max(...plan.facetOptions.map((facet) => facet.count));
    case 'numeric':
      return plan.distinctCount - 1;
    case 'boolean_narrow':
      return Math.max(plan.matchingCount, plan.totalCount - plan.matchingCount);
    case 'legacy':
    case 'suppressed':
      return 0;
  }
}

/** One attribute that should render a control, paired with the plan describing which control. */
export interface PlannedFilterEntry {
  attribute: AttributeDefinition;
  plan: FilterRenderPlan;
}

/**
 * The complete ordered control list for a case: every eligible attribute
 * that can actually narrow something, most-discriminating first.
 *
 * Sorting is applied ONLY when real option data informed the plans. With no
 * options, every plan is `{ kind: 'legacy' }`, every score is 0, and the
 * original declaration order is preserved rather than being shuffled by a
 * meaningless tiebreak.
 */
export function planWorkspaceFilters(
  attributeDefinitions: AttributeDefinition[],
  options: EntityRecord[],
): PlannedFilterEntry[] {
  const entries = attributeDefinitions
    .filter(isFilterableAttribute)
    .map((attribute) => ({ attribute, plan: planFilter(attribute, options) }))
    .filter((entry) => entry.plan.kind !== 'suppressed');
  if (options.length === 0) return entries;
  return [...entries].sort((a, b) => discriminatingScore(b.plan) - discriminatingScore(a.plan));
}

// --- Formatting ---------------------------------------------------------

/**
 * Formats a number the way this attribute's own values read: as currency
 * when the attribute is `money` and a currency is actually known, otherwise
 * grouped digits plus the declared unit.
 *
 * `Intl` with an explicit `'en-US'` locale (not the ambient one) so output
 * is identical in every test/CI environment regardless of machine locale --
 * the same discipline `attribute-value-format.ts` keeps by avoiding `Intl`
 * entirely; here an explicit locale argument buys the same determinism while
 * getting currency symbol placement right.
 */
function formatNumericValue(
  attribute: AttributeDefinition,
  amount: number,
  currency: string | undefined,
): string {
  if (attribute.valueType === 'money' && currency !== undefined) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }
  const unit = attribute.unit !== undefined ? ` ${attribute.unit}` : '';
  return `${amount.toLocaleString('en-US')}${unit}`;
}

/**
 * The live "Seen: min-max" hint that grounds a free-typed "at most" input in
 * the case's real data instead of a blank box.
 *
 * A unit is written ONCE, after the range ("Seen: 19,800–31,200 mi"), while
 * a currency symbol is written on BOTH ends ("Seen: $25,900–$28,750").
 * That asymmetry is how ranges are actually read, and it is not
 * hypothetical: a first pass at this function ran both ends through the
 * shared value formatter and shipped "Seen: 19,800 mi–31,200 mi" to the
 * running product, which reads as two separate measurements rather than one
 * span.
 */
export function formatNumericRangeHint(
  attribute: AttributeDefinition,
  plan: Extract<FilterRenderPlan, { kind: 'numeric' }>,
): string {
  if (attribute.valueType === 'money' && plan.currency !== undefined) {
    const low = formatNumericValue(attribute, plan.min, plan.currency);
    const high = formatNumericValue(attribute, plan.max, plan.currency);
    return `Seen: ${low}–${high}`;
  }
  const unit = attribute.unit !== undefined ? ` ${attribute.unit}` : '';
  return `Seen: ${plan.min.toLocaleString('en-US')}–${plan.max.toLocaleString('en-US')}${unit}`;
}

/** The currency any `money` sample for this attribute actually declared, or `undefined` -- never guessed. */
function sampleCurrency(
  attribute: AttributeDefinition,
  options: EntityRecord[],
): string | undefined {
  for (const option of options) {
    const value = option.attributes[attribute.id]?.value;
    if (value?.type === 'money') return value.currency;
  }
  return undefined;
}

// --- Reading and writing the filter array -------------------------------

export function committedFilterValue(filters: WorkspaceFilter[], fieldId: string): string {
  return filters.find((filter) => filter.fieldId === fieldId)?.value ?? '';
}

/** Returns the next COMPLETE filters array with any existing entry for `fieldId` replaced (or removed, when `next` is `null`) -- never a delta. */
export function upsertFilter(
  filters: WorkspaceFilter[],
  fieldId: string,
  next: WorkspaceFilter | null,
): WorkspaceFilter[] {
  const withoutField = filters.filter((filter) => filter.fieldId !== fieldId);
  return next === null ? withoutField : [...withoutField, next];
}

// --- Actually filtering (the reader that was missing) -------------------

function definitionsById(
  attributeDefinitions: AttributeDefinition[],
): Map<string, AttributeDefinition> {
  return new Map(attributeDefinitions.map((definition) => [definition.id, definition]));
}

/**
 * Whether one option satisfies one filter.
 *
 * Two rules carry real product weight and are deliberate, not incidental:
 *
 *  - **An option with no usable value for the filtered field does NOT
 *    match.** Sift cannot honestly claim an unknown price is under $30,000,
 *    so "price at most 30000" must not quietly keep an option whose price
 *    was never established. This is also what every shopping site does.
 *  - **An unparseable side of a numeric comparison does NOT match.** A
 *    filter carrying a value that is not a finite number cannot be evaluated
 *    honestly, so it excludes rather than silently passing everything.
 */
function optionMatchesFilter(
  option: EntityRecord,
  filter: WorkspaceFilter,
  attribute: AttributeDefinition,
): boolean {
  const sample = sampleAttributeValue(option, attribute.id);
  if (sample === null) return false;

  switch (filter.operator) {
    case 'equals':
      return String(sample) === filter.value;
    case 'not_equals':
      return String(sample) !== filter.value;
    case 'contains':
      return String(sample).toLowerCase().includes(filter.value.toLowerCase());
    case 'less_than':
    case 'less_than_or_equal':
    case 'greater_than':
    case 'greater_than_or_equal': {
      // A boolean is never coerced to 0/1 here -- comparing "AWD > 5" is not
      // a question with an honest answer, so it excludes.
      if (typeof sample === 'boolean') return false;
      const left = Number(sample);
      const right = Number(filter.value);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
      if (filter.operator === 'less_than') return left < right;
      if (filter.operator === 'less_than_or_equal') return left <= right;
      if (filter.operator === 'greater_than') return left > right;
      return left >= right;
    }
  }
}

/**
 * The reader that makes every filter control on screen mean something:
 * returns only the options satisfying EVERY filter, in the caller's original
 * order, without mutating the input.
 *
 * A filter whose `fieldId` names no known `AttributeDefinition` is IGNORED
 * rather than treated as unsatisfiable. A case pins a pack version, and a
 * `WorkspaceViewState` persisted under an older one can easily carry a
 * `fieldId` the current pack no longer declares -- letting that stale entry
 * empty the results would look exactly like data loss to the user, for a
 * filter whose control is not even on screen any more to clear.
 */
export function applyWorkspaceFilters(
  options: EntityRecord[],
  filters: WorkspaceFilter[],
  attributeDefinitions: AttributeDefinition[],
): EntityRecord[] {
  if (filters.length === 0) return [...options];
  const byId = definitionsById(attributeDefinitions);
  const applicable = filters.filter((filter) => byId.has(filter.fieldId));
  if (applicable.length === 0) return [...options];
  return options.filter((option) =>
    applicable.every((filter) => {
      const attribute = byId.get(filter.fieldId);
      // `applicable` already guaranteed this, but narrowing keeps the map
      // lookup honest rather than asserting non-null.
      return attribute === undefined || optionMatchesFilter(option, filter, attribute);
    }),
  );
}

// --- The assistant's own narrowing --------------------------------------

/**
 * The second, independent narrowing of the same option list: the literal set
 * of options the model named through `sift_set_view`'s `visibleOptionIds`
 * ("show her just those three"), as opposed to a `WorkspaceFilter`, which is
 * a RULE the person stated ("under $30k").
 *
 * It lives beside `applyWorkspaceFilters` rather than in its own module
 * because the two are only ever used together and must compose the same way
 * everywhere: both narrowings hold, so an option has to survive BOTH to be
 * rendered. Splitting them across modules invites a caller to apply one and
 * forget the other, which is precisely the class of bug this whole change
 * exists to close (`visibleOptionIds` was persisted and read by nobody).
 *
 * Two behaviours are deliberate:
 *
 *  - **The case's own option order wins**, not the order the ids arrived in.
 *    A model listing ids in a different sequence is saying WHICH options to
 *    show, not asking for a re-sort; resequencing the page underneath
 *    someone would be a change they never asked for. This is the one place
 *    it diverges from `OptionCompareView`/`OptionListView`'s own
 *    `narrowOptions`, which maps over the id array precisely because a
 *    caller there is choosing column order.
 *  - **An id naming no saved option is ignored**, not an error. A
 *    `visibleOptionIds` array persisted before an option was deleted still
 *    names it; that is ordinary staleness, the same reason
 *    `applyWorkspaceFilters` ignores a stale `fieldId`.
 *
 * `undefined` means the assistant has narrowed nothing and every option
 * survives. An empty array is NOT the same thing: it is a real, schema-valid
 * "show none of them", and reading it as "no narrowing" would silently
 * contradict what was actually persisted.
 *
 * Presentation only, exactly like everything else in this module: hiding an
 * option cannot reach scoring, readiness, evidence validity, or the
 * recommendation.
 */
export function applyAssistantNarrowing(
  options: EntityRecord[],
  visibleOptionIds: string[] | undefined,
): EntityRecord[] {
  if (visibleOptionIds === undefined) return [...options];
  const visible = new Set(visibleOptionIds);
  return options.filter((option) => visible.has(option.id));
}

// --- Describing what is applied (the chip row) --------------------------

/** One applied filter, rendered as the chip text a person actually reads. */
export interface AppliedFilterChip {
  /** `WorkspaceFilter.fieldId` -- the key the chip's ✕ removes. */
  fieldId: string;
  /** Complete human label, e.g. "AWD only", "Make: Toyota", "Price: $30,000 or less". */
  label: string;
}

const NUMERIC_OPERATOR_PHRASE = {
  less_than: (formatted: string) => `under ${formatted}`,
  less_than_or_equal: (formatted: string) => `${formatted} or less`,
  greater_than: (formatted: string) => `over ${formatted}`,
  greater_than_or_equal: (formatted: string) => `${formatted} or more`,
} as const;

function describeFilter(
  filter: WorkspaceFilter,
  attribute: AttributeDefinition,
  options: EntityRecord[],
): string {
  const { label } = attribute;
  switch (filter.operator) {
    case 'equals':
      // The Toggle's own wording, so the chip reads as the same control:
      // "AWD only", not "AWD: true".
      return attribute.valueType === 'boolean' && filter.value === 'true'
        ? `${label} only`
        : `${label}: ${filter.value}`;
    case 'not_equals':
      return `${label}: not ${filter.value}`;
    case 'contains':
      return `${label}: contains “${filter.value}”`;
    case 'less_than':
    case 'less_than_or_equal':
    case 'greater_than':
    case 'greater_than_or_equal': {
      const amount = Number(filter.value);
      // An unparseable value falls back to the raw string rather than
      // rendering "NaN" -- the chip still names exactly what is applied.
      const formatted = Number.isFinite(amount)
        ? formatNumericValue(attribute, amount, sampleCurrency(attribute, options))
        : filter.value;
      return `${label}: ${NUMERIC_OPERATOR_PHRASE[filter.operator](formatted)}`;
    }
  }
}

/**
 * One chip per applied filter, ordered to match `attributeDefinitions` so
 * the row stays stable as the user toggles things instead of reordering
 * under the cursor (`upsertFilter` appends, so raw `filters` order jumps).
 *
 * A filter naming no known attribute produces no chip -- the same stale-
 * `fieldId` case `applyWorkspaceFilters` ignores. Showing a chip labelled
 * with a bare id for a filter that is deliberately not being applied would
 * be the fabrication both rules exist to prevent.
 */
export function describeAppliedFilters(
  filters: WorkspaceFilter[],
  attributeDefinitions: AttributeDefinition[],
  options: EntityRecord[] = [],
): AppliedFilterChip[] {
  const byFieldId = new Map(filters.map((filter) => [filter.fieldId, filter]));
  const chips: AppliedFilterChip[] = [];
  for (const attribute of attributeDefinitions) {
    const filter = byFieldId.get(attribute.id);
    if (filter === undefined) continue;
    chips.push({ fieldId: filter.fieldId, label: describeFilter(filter, attribute, options) });
  }
  return chips;
}
