/**
 * The catalog's browse controls, compressed from an always-open card into
 * one row plus an overlay.
 *
 * ## The defect this closes
 *
 * `VehicleCatalogFlow` used to render "Browse the catalog" as a permanent
 * section holding a labelled search field and four labelled selects. At
 * 390px -- the narrow end of the canonical ChatGPT right pane
 * (docs/specs/product.md) -- that stack is roughly 380px tall before a
 * single vehicle is visible, so the surface whose entire job is "recognise
 * a car and shortlist it" opened on a form. Five controls were paid for on
 * every render even though four of them are set rarely and the fifth
 * (search) is the one people actually reach for.
 *
 * The shape here is the one Airbnb/Zillow/Etsy converged on and the one
 * `FilterBar.tsx` + `FilterSheet.tsx` already established for the
 * workspace's own option filters: a search field and a `Filters` control
 * always visible, the applied filters shown as removable chips, and the
 * controls themselves behind a modal. It is deliberately the same shape as
 * those two files rather than a second invention -- but it is a separate
 * component, not a reuse of them, because they filter already-saved
 * `EntityRecord` options through `WorkspaceFilter[]`, while this filters a
 * remote catalog query through five plain strings.
 *
 * ## Deferred apply, and why this one defers when `FilterSheet` does not
 *
 * `FilterSheet` applies live: its filters narrow an in-memory array the
 * caller already holds, so a change costs nothing and showing the result
 * behind the overlay is free. Every change here instead re-runs a debounced
 * `searchCatalogVehicles` request. Applying live would fire four requests
 * while someone sets four facets, and would make each intermediate result
 * -- possibly an empty one -- the thing sitting behind the overlay.
 *
 * So the selects inside the sheet write to LOCAL DRAFT STATE and
 * `onFiltersChange` fires exactly once, from the footer's primary action.
 * The corollary matters more than the rule: closing the sheet any other way
 * -- Escape, the overlay, the ✕, a swipe on the bottom sheet -- discards
 * the draft. A dismissal gesture must never be a commit, because on the
 * bottom sheet the dismissal gesture is a swipe, and a swipe that silently
 * applied four half-considered facets would be indistinguishable from a
 * bug. That is enforced structurally rather than by remembering to reset in
 * each close path: the draft is re-seeded from the applied `filters` every
 * time the sheet OPENS, so no close path can leave anything behind.
 *
 * The always-visible controls are the exception, and deliberately so.
 * Typing in search and removing a chip are direct manipulation -- the thing
 * you touched is the thing that changed -- so both apply immediately.
 *
 * Purely presentational, like every other leaf in this directory: no
 * context, no fetching, no command calls. Every change emits the COMPLETE
 * next `VehicleFilters` (never a delta), and the caller owns the search
 * request, the debounce, and the resulting counts.
 */
import { useState } from 'react';
import { SearchIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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

export interface VehicleFilters {
  query: string;
  make: string;
  bodyStyle: string;
  fuelType: string;
  /** A string, not a number, because it round-trips through a native `<select>`; `''` is "any year", and the caller does the `Number()` conversion it already did before this component existed. */
  year: string;
}

/** The four facets that live behind the sheet. `query` is deliberately not one of them -- it is applied live from the always-visible row. */
type VehicleFacet = 'year' | 'make' | 'bodyStyle' | 'fuelType';

/** The draft the sheet edits: the four facets only, so a commit can never resurrect a stale `query` the search field has since moved past. */
type VehicleFacetSelection = Pick<VehicleFilters, VehicleFacet>;

interface VehicleFacetField {
  facet: VehicleFacet;
  /**
   * Kept verbatim from the inline filter row this replaces, along with each
   * label and "Any ..." placeholder below. These ids are already referenced
   * by component tests and Playwright selectors; changing the surface a
   * control lives on is not a reason to break every selector that finds it.
   */
  controlId: string;
  label: string;
  anyLabel: string;
}

const FACET_FIELDS: readonly VehicleFacetField[] = [
  { facet: 'year', controlId: 'vehicle-catalog-year', label: 'Model year', anyLabel: 'Any year' },
  { facet: 'make', controlId: 'vehicle-catalog-make', label: 'Make', anyLabel: 'Any make' },
  {
    facet: 'bodyStyle',
    controlId: 'vehicle-catalog-body-style',
    label: 'Body style',
    anyLabel: 'Any body style',
  },
  {
    facet: 'fuelType',
    controlId: 'vehicle-catalog-fuel-type',
    label: 'Fuel type',
    anyLabel: 'Any fuel type',
  },
];

const NO_FACETS: VehicleFacetSelection = { year: '', make: '', bodyStyle: '', fuelType: '' };

/**
 * How many facets are narrowing the catalog right now.
 *
 * `query` is excluded on purpose: this number is the badge on the control
 * that opens the sheet, which is a promise about what opening it will show
 * you. The search field is not in there, so counting it would send someone
 * hunting for a control that is not present -- the same rule `FilterBar`'s
 * badge already follows for the assistant's narrowing.
 */
export function activeFilterCount(filters: VehicleFilters): number {
  return FACET_FIELDS.filter((field) => filters[field.facet] !== '').length;
}

function selectedFacets(filters: VehicleFilters): VehicleFacetSelection {
  return {
    year: filters.year,
    make: filters.make,
    bodyStyle: filters.bodyStyle,
    fuelType: filters.fuelType,
  };
}

// Copied from `VehicleCatalogFlow.tsx` rather than imported -- it is not
// exported there, and this component must not reach into the file that
// mounts it. Same flat recipe as `ui/input.tsx` and `FilterSheet.tsx`'s own
// native selects. A native `<select>` is deliberate, not a fallback: it is
// one tab stop, a mobile browser renders it as the system picker, and it
// needs no portal inside an already-portalled sheet.
const selectClassName =
  'min-h-[var(--size-touch-target-min)] h-9 w-full min-w-0 rounded-[var(--radius-sm)] border-0 bg-muted px-3 py-1 text-[length:var(--font-size-base)] outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60';

export interface VehicleFilterSheetProps {
  /** The applied filters. This component holds no copy of them; the sheet's draft is seeded from here every time it opens. */
  filters: VehicleFilters;
  /** Fires with the COMPLETE next filters object (never a delta) -- immediately for search and chip removal, once for all four facets when the sheet's primary action commits. */
  onFiltersChange: (next: VehicleFilters) => void;
  makes: string[];
  bodyStyles: string[];
  fuelTypes: string[];
  years: number[];
  /** Matching records for the CURRENT applied filters. */
  resultCount: number;
  /** A catalog request is in flight, so `resultCount` is mid-recompute. Nothing is disabled by it -- locking the filters during their own search would be hostile -- it only marks the count-bearing action `aria-busy`. */
  busy?: boolean;
}

/**
 * One applied facet, readable and removable without opening the sheet.
 *
 * `Badge` renders a `<span>`, so the nested `<button>` is legal HTML rather
 * than the button-inside-button an interactive Badge would produce. That ✕
 * carries a fully qualified accessible name ("Remove filter Toyota"): a row
 * of four identical bare "Remove" buttons gives a screen-reader user no way
 * to tell which one undoes which narrowing.
 */
function AppliedFacetChip({
  controlId,
  label,
  onRemove,
}: {
  controlId: string;
  label: string;
  onRemove: () => void;
}) {
  return (
    <Badge
      variant="secondary"
      data-testid={`${controlId}-chip`}
      // `rounded-[var(--radius-xs)]` rather than Tailwind's `rounded-sm`:
      // this codebase deliberately runs ONE radius mechanism (see
      // `styles/tailwind.css`'s header -- no `@theme` radius bridge exists,
      // every shadcn primitive was hand-edited to the arbitrary-value
      // token), and `--radius-xs` is the token whose stated role in
      // tokens.css is "chips, inline tags". The squarer corner separates a
      // removable filter chip from the pill-shaped status badges the rest
      // of the product uses for state.
      className="min-h-[var(--size-touch-target-min)] shrink-0 gap-[var(--space-1)] rounded-[var(--radius-xs)] py-0 pl-[var(--space-3)] pr-[var(--space-1)] text-[length:var(--font-size-sm)]"
    >
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        data-testid={`${controlId}-chip-remove`}
        aria-label={`Remove filter ${label}`}
        onClick={onRemove}
        className="flex h-[var(--size-touch-target-min)] w-[var(--size-touch-target-min)] shrink-0 items-center justify-center rounded-[var(--radius-full)] transition-opacity duration-[var(--duration-fast)] hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
      >
        <XIcon aria-hidden="true" className="size-4" />
      </button>
    </Badge>
  );
}

export function VehicleFilterSheet({
  filters,
  onFiltersChange,
  makes,
  bodyStyles,
  fuelTypes,
  years,
  resultCount,
  busy = false,
}: VehicleFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<VehicleFacetSelection>(() => selectedFacets(filters));

  const appliedCount = activeFilterCount(filters);
  const appliedFields = FACET_FIELDS.filter((field) => filters[field.facet] !== '');
  const draftCount = FACET_FIELDS.filter((field) => draft[field.facet] !== '').length;

  const facetOptions: Record<VehicleFacet, string[]> = {
    year: years.map((year) => String(year)),
    make: makes,
    bodyStyle: bodyStyles,
    fuelType: fuelTypes,
  };

  /**
   * The single close/open path, and the whole of the discard guarantee: a
   * fresh draft is seeded from the applied `filters` on every OPEN, so no
   * dismissal path -- Escape, overlay, ✕, swipe -- has to remember to reset
   * anything, and none of them can commit. Only `handleApply` calls
   * `onFiltersChange`.
   */
  function handleOpenChange(next: boolean) {
    if (next) setDraft(selectedFacets(filters));
    setOpen(next);
  }

  function handleApply() {
    // Spread over `filters`, not over the draft alone, so `query` comes from
    // the live applied value rather than from whatever it was when the sheet
    // opened -- one call carrying every drafted facet and nothing else.
    onFiltersChange({ ...filters, ...draft });
    setOpen(false);
  }

  const vehicleNoun = resultCount === 1 ? 'vehicle' : 'vehicles';

  return (
    <div data-testid="vehicle-filter-controls" className="flex flex-col gap-[var(--space-2)]">
      <div className="flex items-center gap-[var(--space-2)]">
        <div className="relative min-w-0 flex-1">
          {/*
            The label is real but visually hidden: the magnifier glyph and
            the placeholder already say "search" at a glance, and this row
            exists to stop the browse surface opening on a form. Hidden, not
            dropped -- the field keeps a proper accessible name, and
            `getByLabelText('Search')` keeps resolving.
          */}
          <Label htmlFor="vehicle-catalog-query" className="sr-only">
            Search
          </Label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-[var(--space-3)] size-4 -translate-y-1/2 text-[var(--color-ink-muted)]"
          />
          <Input
            id="vehicle-catalog-query"
            data-testid="vehicle-catalog-query"
            type="text"
            placeholder="Make, model, or trim"
            value={filters.query}
            // `pl-[var(--space-10)]` clears the 16px glyph inset at
            // `--space-3`; the input's own `px-3` would run text straight
            // through it.
            className="min-h-[var(--size-touch-target-min)] border-0 pl-[var(--space-10)]"
            onChange={(event) => {
              onFiltersChange({ ...filters, query: event.target.value });
            }}
          />
        </div>

        {/*
          The count sits INLINE beside the glyph, not as an `absolute -top-1
          -right-1` corner overlay. That overlay is the standard notification
          pattern and this project already shipped it once and repaired it
          (see `WorkspaceAppBar.tsx`'s post-ship note): a small icon centred
          in a 44px hit box leaves the badge floating in invisible padding
          with nothing to attach to, so it reads as detached even when the
          box math is right. Laid out in normal flex flow the count is
          touching the icon it belongs to by construction, which is why the
          `size="icon"` square is overridden to a content-sized box with a
          44px floor rather than a fixed one.
        */}
        <Button
          type="button"
          data-testid="vehicle-filter-open"
          variant="outline"
          size="icon"
          aria-label={`Filters${appliedCount > 0 ? `, ${appliedCount} active` : ''}`}
          onClick={() => {
            handleOpenChange(true);
          }}
          className="h-[var(--size-touch-target-min)] w-auto min-w-[var(--size-touch-target-min)] shrink-0 gap-[var(--space-1-5)] px-[var(--space-2)]"
        >
          <SlidersHorizontalIcon aria-hidden="true" />
          {appliedCount > 0 ? (
            // `aria-hidden` because the button's `aria-label` already states
            // the count; without it a screen reader would hear the number
            // twice, and an `aria-label` would silence it anyway.
            <Badge
              aria-hidden="true"
              data-testid="vehicle-filter-active-count"
              className="px-[var(--space-1-5)] py-0"
            >
              {appliedCount}
            </Badge>
          ) : null}
        </Button>
      </div>

      {appliedFields.length > 0 ? (
        <div
          data-testid="vehicle-filter-chips"
          role="group"
          aria-label="Applied filters"
          /*
           * Scrolls rather than wraps: four chips at 44px tall would stack
           * into two rows at 390px and push the first result back below the
           * fold, which is the exact cost this component exists to remove.
           * The scrollbar is hidden (it is a chip rail, not a document) and
           * the vertical padding is load-bearing -- `overflow-x: auto`
           * forces `overflow-y` to compute to `auto` as well, so without it
           * the focus ring on a chip's ✕ would be clipped top and bottom.
           */
          className="flex flex-nowrap items-center gap-[var(--space-2)] overflow-x-auto py-[var(--space-0-5)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {appliedFields.map((field) => (
            <AppliedFacetChip
              key={field.facet}
              controlId={field.controlId}
              label={filters[field.facet]}
              onRemove={() => {
                onFiltersChange({ ...filters, [field.facet]: '' });
              }}
            />
          ))}
          {/*
            `Clear all` clears the four facets and deliberately leaves
            `query` alone. It sits at the end of the row it clears, matching
            `FilterBar.tsx`'s identical placement decision -- and it is the
            row's chips it names, not the search text, which has its own
            visible field a person can empty directly.
          */}
          <Button
            type="button"
            data-testid="vehicle-filter-clear-all"
            variant="ghost"
            onClick={() => {
              onFiltersChange({ ...filters, ...NO_FACETS });
            }}
            className="min-h-[var(--size-touch-target-min)] shrink-0 px-[var(--space-3)]"
          >
            Clear all
          </Button>
        </div>
      ) : null}

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent data-testid="vehicle-filter-sheet">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            {/*
              Visible, not hidden. Radix needs a description here anyway, and
              deferred apply is the one thing about this sheet a person
              cannot infer from looking at it -- every other filter modal
              they have used applied live.
            */}
            <SheetDescription>Choices apply when you press the button below.</SheetDescription>
          </SheetHeader>

          <SheetBody>
            <div className="flex flex-col gap-[var(--space-4)]">
              {FACET_FIELDS.map((field) => (
                <div key={field.facet} className="flex flex-col gap-[var(--space-1-5)]">
                  <Label
                    htmlFor={field.controlId}
                    className="text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] text-[var(--color-ink)]"
                  >
                    {field.label}
                  </Label>
                  <select
                    id={field.controlId}
                    data-testid={field.controlId}
                    value={draft[field.facet]}
                    className={selectClassName}
                    onChange={(event) => {
                      // Draft only. Nothing here reaches `onFiltersChange`.
                      const nextValue = event.target.value;
                      setDraft((previous) => ({ ...previous, [field.facet]: nextValue }));
                    }}
                  >
                    <option value="">{field.anyLabel}</option>
                    {facetOptions[field.facet].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </SheetBody>

          {/*
            Pinned by flex layout alone -- `SheetContent` is a height-capped
            `flex flex-col` whose `SheetBody` is its only `flex-1` child, so
            a `shrink-0` sibling after it cannot be scrolled away. No
            `position: sticky`, and nothing here re-litigates the sheet
            primitive's already-debugged positioning (`ui/sheet.tsx`).
          */}
          <div
            data-testid="vehicle-filter-sheet-footer"
            className="shrink-0 bg-card px-[var(--space-4)] pt-[var(--space-3)] pb-[var(--space-4)]"
          >
            <Separator className="mb-[var(--space-3)]" />
            <div className="flex items-center gap-[var(--space-2)]">
              {/*
                Disabled rather than removed when there is nothing to reset:
                a footer that grows a button the instant the first facet is
                set would reflow and slide the primary action sideways under
                the finger about to press it.
              */}
              <Button
                type="button"
                data-testid="vehicle-filter-sheet-reset"
                variant="ghost"
                disabled={draftCount === 0}
                onClick={() => {
                  setDraft(NO_FACETS);
                }}
                className="min-h-[var(--size-touch-target-min)] px-[var(--space-3)]"
              >
                Reset
              </Button>
              {/*
                The count is the APPLIED one -- what is behind the overlay
                right now -- because nothing here can know how many records a
                drafted facet would match without running the catalog query
                this component does not own. Stating the number it can
                actually stand behind beats predicting one it cannot
                (CLAUDE.md "Never fabricate"); `aria-busy` marks it while the
                caller's search is recomputing it.
              */}
              <Button
                type="button"
                data-testid="vehicle-filter-sheet-apply"
                aria-busy={busy}
                onClick={handleApply}
                className="min-h-[var(--size-touch-target-min)] flex-1"
              >
                {`Show ${resultCount} ${vehicleNoun}`}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
