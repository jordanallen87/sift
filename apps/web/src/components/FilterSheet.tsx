/**
 * Every filter control the workspace has, moved off the page and into one
 * overlay -- the project owner's call this session: "For the filters, why
 * not just put this in some sort of dialog or modal? And just show the
 * applied filters?"
 *
 * ## Why a Sheet, and why these controls left the sidebar
 *
 * Three real defects close at once by moving them here:
 *
 *  1. **Layout.** `WorkspaceSidebar`'s filter list ran longer than the main
 *     column at 1440px, leaving dead space beside a short Best Match card.
 *     An overlay has its own height budget and cannot stretch the page.
 *  2. **Pane-mode parity.** `WorkspaceSidebar` returns `null` at
 *     `layout: 'narrow'`, so the 390-480px ChatGPT/WebMCP pane had NO
 *     filter entry point whatsoever -- contradicting ADR 0008's "still has
 *     to have the same functionalities" in both modes. This component takes
 *     no `layout` prop and never calls `matchMedia`: `ui/sheet.tsx` already
 *     renders the same content as a bottom sheet at <=480px and as a
 *     centred dialog past `global.css`'s own `min-[481px]` boundary, so one
 *     surface serves both modes without a variant decision here.
 *  3. **Familiarity.** A `Filters` button, a row of applied chips, and every
 *     control inside a modal is the shape Airbnb/Zillow/Etsy all use. Two
 *     earlier rounds of this UI were rejected as "crammed" and "nothing
 *     familiar"; this is the shape a person already knows.
 *
 * ## What this file owns and what it does not
 *
 * The controls (`BooleanFilterControl`, `EnumFilterControl`,
 * `NumberFilterControl`, `TextFilterControl`, `FacetFilterControl`, and the
 * `FilterControl` dispatcher) moved here from `WorkspaceSidebar.tsx`
 * unchanged in behavior. Every rule they encode -- which attributes deserve
 * a control, which control, the real-value facets and their counts, the
 * "Seen: min-max" hint, the ordering by how much a control can actually
 * narrow the set -- now lives once in `workspace-filters.ts` and is
 * imported, never re-implemented, so the sheet, the applied-chip row
 * (`FilterBar.tsx`), and the orchestrator's own narrowing of the option
 * list cannot drift apart.
 *
 * Purely presentational, like every other leaf in this directory: no
 * context, no fetching, no command calls. Every change emits the COMPLETE
 * next `WorkspaceFilter[]` through `onFiltersChange`, never a delta.
 *
 * **Presentation, never a decision mutation (change-set §54 / ADR 0005
 * decision 1):** a filter narrows which already-known options are VISIBLE.
 * It can never change what the user said MATTERS (a `Criterion`'s
 * `weight`/`target`), never appends a `CaseEvent`, and never advances
 * `eventSequence` -- structurally guaranteed here by this component only
 * ever emitting `WorkspaceFilter[]` and never calling a command itself.
 *
 * ## The footer is an exit, not a commit
 *
 * Filters apply LIVE, exactly as they always have -- the moment a control
 * changes, `onFiltersChange` fires and the caller's option list narrows
 * behind the overlay. `workspace-filter-sheet-done` therefore only calls
 * `onOpenChange(false)`. It exists because every mainstream filter modal
 * has a primary button carrying the live result count ("Show 3 of 5"), and
 * because a modal needs an obvious way out that is not a corner ✕. It is
 * NOT a deferred-apply control: there is no pending state to commit, and
 * dismissing the sheet with Escape or the overlay keeps every filter the
 * user already applied.
 */
import { Fragment, useState } from 'react';
import type { AttributeDefinition, EntityRecord, WorkspaceFilter } from '@sift/contracts';
import {
  committedFilterValue,
  formatNumericRangeHint,
  isFilterableAttribute,
  planWorkspaceFilters,
  upsertFilter,
  type FacetOption,
  type FilterRenderPlan,
} from './workspace-filters.js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Toggle } from '@/components/ui/toggle';

export interface FilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `CaseState.attributeDefinitions` (or the caller's already-narrowed subset). Only entries `isFilterableAttribute` accepts can render a control. */
  attributeDefinitions: AttributeDefinition[];
  /** The case's real saved options (`CaseState.entities`, at most 5 per product.md). Read ONLY to derive which values are actually present -- never mutated, never the source of a criterion or evidence change. */
  options: EntityRecord[];
  /** The exact `WorkspaceViewState.filters` slice, or `[]`. Presentation-only state -- see the ADR 0005/§54 note above. */
  filters: WorkspaceFilter[];
  /** Fires with the COMPLETE next filters array (never a delta) whenever any control changes. The caller writes it through `updateSelection()`. */
  onFiltersChange: (filters: WorkspaceFilter[]) => void;
  /** How many options survive the CURRENT filters -- the caller computes it with `applyWorkspaceFilters`. */
  matchingCount: number;
  /** Total saved options, for the "N of M" copy. */
  totalCount: number;
}

function filterControlId(fieldId: string): string {
  return `workspace-filter-${fieldId}`;
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
   * Derived-mode-only "N of M match" grounding text -- `undefined` when no
   * option data informed the plan. Real data, never a fabricated estimate:
   * computed by `planFilter` from the caller's actual options before this
   * control is ever reached, and this control only renders at all once
   * `planFilter` decided the toggle CAN narrow the set.
   */
  hint?: string;
}) {
  const current = filters.find((filter) => filter.fieldId === attribute.id);
  const pressed = current?.operator === 'equals' && current.value === 'true';
  const controlId = filterControlId(attribute.id);

  return (
    <div className="flex items-center justify-between gap-[var(--space-3)]">
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
// <select> -- a native select is deliberate here, not a Radix `Select*`
// stack: it is one tab stop, it is what a mobile browser renders as a
// system picker, and it needs no portal inside an already-portalled sheet.
const selectClassName =
  'min-h-[var(--size-touch-target-min)] h-9 w-full min-w-0 rounded-[var(--radius-sm)] border-0 bg-muted px-3 py-1 text-[length:var(--font-size-base)] outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60';

function EnumFilterControl({ attribute, filters, onFiltersChange }: StaticFilterControlProps) {
  const current = filters.find((filter) => filter.fieldId === attribute.id);
  const value = current?.operator === 'equals' ? current.value : '';
  const allowedValues = attribute.allowedValues ?? [];
  const controlId = filterControlId(attribute.id);

  return (
    <div className="flex flex-col gap-[var(--space-1-5)]">
      <Label
        htmlFor={controlId}
        className="text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-ink)]"
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
  /** The ephemeral mid-keystroke echo -- `undefined` means "show the committed `filters` value." */
  pendingValue: string | undefined;
  onPendingValueChange: (fieldId: string, value: string) => void;
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
   * Derived-mode-only "Seen: min-max" grounding text -- `undefined` when no
   * option data informed the plan. Real data computed by `planFilter`/
   * `formatNumericRangeHint` from the caller's actual options, so a blank
   * "at most" box shows the range it can usefully be typed against instead
   * of nothing at all.
   */
  rangeHint?: string;
}) {
  const committed = committedFilterValue(filters, attribute.id);
  const display = pendingValue ?? committed;
  const controlId = filterControlId(attribute.id);

  return (
    <div className="flex flex-col gap-[var(--space-1-5)]">
      <Label
        htmlFor={controlId}
        className="text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-ink)]"
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
            // An interim, not-yet-parseable keystroke (e.g. a lone "-", a
            // trailing ".", or an exponent that has overflowed to Infinity)
            // is echoed on screen via `pendingValue` above but deliberately
            // NOT committed to `onFiltersChange` -- committing a
            // non-numeric string here would put a `less_than_or_equal`
            // filter carrying an unevaluable value into
            // `WorkspaceViewState`, which `applyWorkspaceFilters` can only
            // honour by matching nothing at all.
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
    <div className="flex flex-col gap-[var(--space-1-5)]">
      <Label
        htmlFor={controlId}
        className="text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-ink)]"
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
 * One selectable chip per DISTINCT VALUE ACTUALLY PRESENT on the case's
 * saved options, each labelled with its live count ("Red (2)") -- the
 * pattern every shopping site uses, and inherently bounded to at most five
 * chips per field by the product's own five-option case cap. Never built
 * from `attribute.allowedValues`, which describes what a pack author
 * anticipated rather than what any saved option actually has.
 *
 * Single-select, matching the `equals` operator it emits: pressing a chip
 * commits `{ fieldId, operator: 'equals', value }`; pressing the already-
 * pressed chip clears the filter entirely (the same "back to no filter for
 * this field" semantics `EnumFilterControl`'s "Any ___" option has).
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
    <div className="flex flex-col gap-[var(--space-2)]">
      <span
        id={labelId}
        className="text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-ink)]"
      >
        {attribute.label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        data-testid={groupId}
        className="flex flex-wrap gap-[var(--space-2)]"
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
              className="min-h-[var(--size-touch-target-min)] max-w-full rounded-[var(--radius-pill)] px-[var(--space-3)] data-[state=on]:bg-[color:var(--color-status-active-bg)] data-[state=on]:text-[color:var(--color-status-active-ink)]"
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
  onPendingValueChange: (fieldId: string, value: string) => void;
}

/**
 * Dispatches to a control for `attribute`. `plan` (from `planFilter`, via
 * `planWorkspaceFilters`) decides WHICH control: `boolean_narrow`/`facet`/
 * `numeric` are the derived-mode controls grounded in real option data;
 * `legacy` means no option data was available at all and falls back to the
 * generic per-`valueType` mapping; `suppressed` renders nothing, because a
 * control that cannot change which options are visible is clutter, not a
 * filter.
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
  // generic per-`valueType` control.
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

/**
 * The three genuinely different reasons this sheet can have nothing to
 * show, each with its own honest sentence (CLAUDE.md "Never fabricate") --
 * `null` means there IS something to render.
 *
 * Order matters. "No filterable details yet" comes first because it is the
 * most fundamental fact: when the pack/case declares no attribute any
 * operator can compare, adding options would not produce a single control,
 * so telling a person to "add options first" would send them somewhere that
 * cannot help.
 *
 * The "add options first" case keys on `totalCount` -- the caller's own
 * authoritative saved-option count -- rather than on `options.length`.
 * These agree for a wired caller, but they are not the same claim: a caller
 * that has saved options and simply has not threaded the records array yet
 * still gets working generic controls, instead of this sheet asserting
 * "you have nothing saved" about a case it cannot actually see. Claiming a
 * case is empty on the strength of an unwired prop is exactly the
 * fabrication the rest of this module avoids.
 */
function emptyStateMessage(
  attributeDefinitions: AttributeDefinition[],
  entryCount: number,
  totalCount: number,
): string | null {
  if (!attributeDefinitions.some(isFilterableAttribute)) return 'No filterable details yet.';
  if (totalCount === 0) return 'Nothing to filter yet — add options first.';
  if (entryCount === 0) return 'Every saved option matches on every filterable detail.';
  return null;
}

export function FilterSheet({
  open,
  onOpenChange,
  attributeDefinitions,
  options,
  filters,
  onFiltersChange,
  matchingCount,
  totalCount,
}: FilterSheetProps) {
  // The only local state: the ephemeral on-screen echo of a free-typed
  // number/text field mid-keystroke (a lone "-", a trailing ".", or simply
  // the frame before the next `filters` prop round-trips back). The same
  // "local UI bookkeeping inside an otherwise pure component" pattern
  // `FindingsSheet.tsx`'s `reviewedThisSession` already establishes here.
  const [pendingTextValues, setPendingTextValues] = useState<Record<string, string>>({});

  const entries = planWorkspaceFilters(attributeDefinitions, options);
  const emptyMessage = emptyStateMessage(attributeDefinitions, entries.length, totalCount);
  const hasFilters = filters.length > 0;

  // Records only, never per-field deletion: a control always has SOME raw
  // string to echo while it is being typed into, and the one case that
  // genuinely needs the echo gone -- `Clear all` -- resets the whole map
  // below. The sidebar version carried an extra "delete this key" branch no
  // caller ever reached; it is not carried over.
  function handlePendingValueChange(fieldId: string, value: string) {
    setPendingTextValues((previous) => ({ ...previous, [fieldId]: value }));
  }

  function handleClearAll() {
    // Clearing the local echo alongside the committed filters closes the
    // documented gap the sidebar version left open: a free-typed value that
    // is only in `pendingTextValues` would otherwise stay on screen after
    // every real filter had been removed, showing a value that filters
    // nothing.
    setPendingTextValues({});
    onFiltersChange([]);
  }

  const doneLabel =
    totalCount === 0
      ? 'Done'
      : hasFilters
        ? `Show ${matchingCount} of ${totalCount}`
        : `Show all ${totalCount}`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent data-testid="workspace-filter-sheet">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription className="visually-hidden">
            Narrow which saved options are shown. Filters change what you see, never what the case
            has recorded.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {emptyMessage !== null ? (
            <p
              data-testid="workspace-filter-sheet-empty"
              className="text-[length:var(--font-size-sm)] text-[var(--color-ink-secondary)]"
            >
              {emptyMessage}
            </p>
          ) : (
            /*
             * A hairline between groups and a generous gap, rather than the
             * sidebar's tight stack: two earlier rounds of this UI were
             * rejected as "crammed," and a divided group list is the shape
             * every mainstream filter modal uses.
             */
            <div className="flex flex-col gap-[var(--space-4)]">
              {entries.map(({ attribute, plan }, index) => (
                <Fragment key={attribute.id}>
                  {index > 0 ? <Separator /> : null}
                  <FilterControl
                    attribute={attribute}
                    plan={plan}
                    filters={filters}
                    onFiltersChange={onFiltersChange}
                    pendingValue={pendingTextValues[attribute.id]}
                    onPendingValueChange={handlePendingValueChange}
                  />
                </Fragment>
              ))}
            </div>
          )}
        </SheetBody>
        {/*
         * Pinned to the bottom by flex layout alone -- `SheetContent` is a
         * height-capped `flex flex-col` whose `SheetBody` is the only
         * `flex-1` child, so a `shrink-0` sibling after it cannot be pushed
         * off or scrolled away. No `position: sticky` needed, and nothing
         * here re-litigates the sheet primitive's already-debugged
         * positioning.
         */}
        <div
          data-testid="workspace-filter-sheet-footer"
          className="shrink-0 bg-card px-[var(--space-4)] pt-[var(--space-3)] pb-[var(--space-4)]"
        >
          <Separator className="mb-[var(--space-3)]" />
          <div className="flex items-center gap-[var(--space-2)]">
            {/*
             * Rendered even with nothing to clear, disabled rather than
             * removed: a footer that gains a button the instant the first
             * filter lands would reflow under the cursor and slide the
             * primary action sideways mid-interaction. The applied-chip row
             * in `FilterBar.tsx` makes the opposite choice for the same
             * reason -- that row already appears and disappears with its
             * chips, so nothing there is displaced.
             */}
            <Button
              type="button"
              data-testid="workspace-filter-sheet-clear-all"
              variant="ghost"
              disabled={!hasFilters}
              onClick={handleClearAll}
              className="min-h-[var(--size-touch-target-min)] px-[var(--space-3)]"
            >
              Clear all
            </Button>
            <Button
              type="button"
              data-testid="workspace-filter-sheet-done"
              onClick={() => {
                onOpenChange(false);
              }}
              className="min-h-[var(--size-touch-target-min)] flex-1"
            >
              {doneLabel}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
