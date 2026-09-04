/**
 * The shortlist, as a fixed bottom bar rather than a card at the top of the
 * catalog page.
 *
 * ## Why it moved to the bottom
 *
 * The shortlist used to be the first thing on the page: a heading, a count
 * badge, a five-row list, and the primary action, all above the search
 * controls. That put roughly 260px of *review* between a person and the
 * thing they came to do, and — worse — it put the primary action at the
 * top of a scrolling page, so the moment you scrolled to find a fourth
 * vehicle, both the shortlist and the button that acts on it were gone.
 * You added a vehicle and got no acknowledgement at the point of the act.
 *
 * A fixed bottom bar inverts that. Browsing owns the whole viewport; the
 * shortlist is a persistent one-row stat block that confirms every add
 * where your thumb already is, and the action that consumes it never
 * leaves the screen.
 *
 * ## Why Collapsible and not Drawer or Sheet
 *
 * Both of the modal primitives in this repo (`ui/sheet.tsx`, `ui/dialog.tsx`)
 * do four things this bar must not do: trap focus, paint an overlay, lock
 * body scroll, and close on an outside click. A person expanding the
 * shortlist is *comparing it against the results behind it* — they need to
 * keep scrolling, keep tapping, and keep seeing. That is the definition of
 * a non-modal disclosure, so this is `ui/collapsible.tsx` (Radix, which
 * supplies `aria-expanded`/`aria-controls` and the id wiring) inside a
 * plain fixed container. Nothing here hand-rolls ARIA state.
 *
 * ## Why the panel is first in the DOM
 *
 * `CollapsibleContent` renders *before* the collapsed row, so opening it
 * grows the bar upward. If the panel came second the row and its CTA would
 * slide down by the panel's height on every expand, moving the primary
 * action out from under the finger that just pressed to reveal it.
 *
 * ## The four parts of not covering the page
 *
 * A fixed bar is out of flow, so it covers whatever is at the bottom of the
 * document unless all four of these hold together:
 *
 *  1. `SHORTLIST_BAR_INSET_VAR` is published on the document element while
 *     the bar is mounted, so the page can reserve exactly the bar's height
 *     as bottom padding and `scroll-padding-bottom`. It is *removed* when
 *     the shortlist empties and the bar unmounts, so the page reclaims the
 *     space rather than keeping a permanent dead strip.
 *  2. The bar pads itself by `env(safe-area-inset-bottom)`, so its
 *     background still paints to the physical bottom edge on a notched
 *     phone while its content clears the home indicator. The inset in (1)
 *     adds the same `env()` term, so the two always agree.
 *  3. The expanded panel is capped in `svh`, not `vh`. On mobile Safari
 *     `vh` resolves against the *large* viewport — the one you get with the
 *     URL bar collapsed — so a `70vh` panel is taller than the screen
 *     actually showing while the URL bar is up. `svh` is the small
 *     viewport, which is the one that is always visible.
 *  4. The collapsed row's height is a single constant, used both as the
 *     row's own height and as the first term of the inset calc, so the two
 *     cannot drift apart.
 */
import { useEffect, useState } from 'react';
import { ChevronUpIcon } from 'lucide-react';
import type { VehicleCatalogRecord } from '@sift/catalog/browser';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { VehicleSilhouette } from './VehicleSilhouette.js';

/**
 * The custom property this component publishes on `document.documentElement`
 * while it is mounted, holding the exact vertical space the fixed bar
 * occupies.
 *
 * It is published on the *root* rather than on the bar's own element
 * deliberately: a custom property set on a `position: fixed` box is
 * inherited by that box's descendants and by nobody else, which is the one
 * subtree that does not need it. The page that must move out of the way is
 * a sibling. Consumers should read it with a fallback —
 * `pb-[var(--shortlist-bar-inset,0px)]` — so the layout is still correct in
 * the (normal) case where the shortlist is empty and no bar exists.
 */
export const SHORTLIST_BAR_INSET_VAR = '--shortlist-bar-inset';

/**
 * The collapsed row's height. Fixed, not intrinsic, and that is the whole
 * point: the page reserves this many pixels sight-unseen, so the row is not
 * allowed to grow. Every text run in the row therefore truncates instead of
 * wrapping (see `truncate` below) — a wrapped second line would silently
 * make the bar taller than the space the page reserved for it and start
 * covering content again.
 *
 * 64px is 44px of touch target (`--size-touch-target-min`) plus 10px of
 * breathing room above and below.
 */
const BAR_ROW_HEIGHT = '64px';

/**
 * The published inset. Note `env(..., 0px)`: without the fallback the whole
 * `calc()` is invalid on a browser that does not know `env()`, which would
 * drop the reservation entirely rather than degrade it to "just the row".
 */
const BAR_INSET_VALUE = `calc(${BAR_ROW_HEIGHT} + env(safe-area-inset-bottom, 0px))`;

/** The most thumbnails shown before the rest collapse into a `+N` chip. Four circles is already 98px of a 390px row. */
const MAX_THUMBNAILS = 3;

/** Ties the CTA to the line that explains why it is dead, via `aria-describedby`. */
const STAT_LINE_ID = 'shortlist-footer-stat';

export interface ShortlistFooterProps {
  shortlist: VehicleCatalogRecord[];
  maxSize: number;
  minSize: number;
  onRemove: (vehicleId: string) => void;
  onStartComparison: () => void;
  /** True while the case is being created; disables Remove and the CTA. */
  creating?: boolean;
  /** Rendered inside the expanded panel, above the list — the flow passes its create-error ErrorState here. */
  error?: React.ReactNode;
}

/**
 * Duplicated from `VehicleCatalogFlow.tsx` rather than imported, because
 * that module does not export it and this component must not reach into a
 * file another change is concurrently rewriting. It is four lines and one
 * rule ("trim only when the catalog reported one"); if a third caller ever
 * needs it, that is the moment it earns a shared home.
 */
function vehicleLabel(record: VehicleCatalogRecord): string {
  const trimSuffix = record.trim !== null && record.trim.length > 0 ? ` ${record.trim}` : '';
  return `${record.year} ${record.make} ${record.model}${trimSuffix}`;
}

/**
 * The one derived line under the count: what this particular shortlist
 * looks like, not what it is.
 *
 * ## Why both stats are all-or-nothing
 *
 * A range computed from a subset overstates itself. "28–34 MPG combined"
 * printed under three vehicles reads as a claim about all three, and if
 * only two of them are rated it is a claim the catalog never made —
 * `schema.ts` is explicit that a `null` here "is a real statement about
 * EPA's measurement programme, not a gap in this import". So a range is
 * shown only when every shortlisted vehicle reports the field, and
 * otherwise the next candidate stat is tried. When nothing is knowable
 * about all of them, this returns `null` and the row shows the count alone
 * — an honest silence, not a fabricated summary or a cryptic asterisk.
 *
 * Two candidates, in the order a car shopper cares about them: efficiency
 * first, then the running cost EPA derives from it.
 */
function deriveShortlistStat(shortlist: readonly VehicleCatalogRecord[]): string | null {
  const mpg = shortlist.map((record) => record.combinedMpg);
  if (mpg.every((value): value is number => value !== null)) {
    return `${formatRange(mpg, (value) => String(value))} MPG combined`;
  }

  const fuelCost = shortlist.map((record) => record.annualFuelCostUsd);
  if (fuelCost.every((value): value is number => value !== null)) {
    const format = (value: number) => `$${value.toLocaleString('en-US')}`;
    return `${formatRange(fuelCost, format)} est. fuel/yr`;
  }

  return null;
}

/** An en-dashed range, collapsing to a single figure when the extremes agree — "31 MPG combined" rather than the nonsense "31–31". */
function formatRange(values: readonly number[], format: (value: number) => string): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return min === max ? format(min) : `${format(min)}–${format(max)}`;
}

export function ShortlistFooter({
  shortlist,
  maxSize,
  minSize,
  onRemove,
  onStartComparison,
  creating = false,
  error,
}: ShortlistFooterProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);

  const isEmpty = shortlist.length === 0;
  const belowMinimum = shortlist.length < minSize;
  const canStart = shortlist.length >= minSize && shortlist.length <= maxSize;

  /*
   * `React.ReactNode` is nullable, boolean-able and string-able, so "is
   * there an error to show" is not simply `error != null`: the flow passes
   * `createError ? <ErrorState/> : null`, and a `false` leaking out of a
   * stray `&&` has to read as "nothing" too. `0` is the single ReactNode
   * this misreads, and no error state is ever the number zero.
   */
  const hasError = Boolean(error);

  // Publish the space the page must leave for the bar, and reclaim it the
  // moment the bar stops existing. Keyed on `isEmpty` rather than the
  // shortlist itself: expanding the panel does not change what the page
  // reserves, because an expanded panel is a temporary overlay above the
  // row, not extra permanent chrome below the content.
  useEffect(() => {
    const root = document.documentElement;
    if (isEmpty) {
      root.style.removeProperty(SHORTLIST_BAR_INSET_VAR);
    } else {
      root.style.setProperty(SHORTLIST_BAR_INSET_VAR, BAR_INSET_VALUE);
    }
    return () => {
      root.style.removeProperty(SHORTLIST_BAR_INSET_VAR);
    };
  }, [isEmpty]);

  // An error rendered inside a collapsed panel is not an error report. The
  // dependency is the *boolean*, not `error` itself, on purpose: the flow
  // builds a fresh `<ErrorState>` element on every render, so depending on
  // the node would re-fire this on every keystroke and pin the panel open
  // against a person actively trying to close it.
  useEffect(() => {
    if (hasError) setOpen(true);
  }, [hasError]);

  // Emptying the shortlist while the panel is open must not leave `open`
  // armed: the bar unmounts, and the next vehicle added would spring the
  // panel up under the finger that just tapped Add.
  useEffect(() => {
    if (isEmpty) setOpen(false);
  }, [isEmpty]);

  // An empty bar is a permanent strip of chrome saying "nothing here yet",
  // in the pane where vertical space is scarcest. Nothing is the better
  // empty state; the results list already tells a person to add vehicles.
  if (isEmpty) return null;

  const thumbnails = shortlist.slice(0, MAX_THUMBNAILS);
  const overflowCount = shortlist.length - thumbnails.length;
  const derivedStat = deriveShortlistStat(shortlist);
  const statLine = belowMinimum
    ? `Add ${String(minSize - shortlist.length)} more to compare`
    : derivedStat;

  return (
    <section
      data-testid="vehicle-catalog-shortlist"
      aria-label="Your shortlist"
      className={cn(
        'fixed inset-x-0 bottom-0 z-[var(--z-sticky)]',
        'border-t border-[color:var(--color-border)] bg-card',
        // Part 2 of the overlap contract: the background reaches the
        // physical edge, the content stops above the home indicator.
        'pb-[max(0px,env(safe-area-inset-bottom,0px))]',
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* First in the DOM so the panel grows upward — see the module comment. */}
        <CollapsibleContent data-testid="vehicle-catalog-shortlist-panel">
          <div
            className={cn(
              // `svh`, not `vh`. See part 3 of the overlap contract.
              'max-h-[70svh] overflow-y-auto overscroll-contain',
              'border-b border-[color:var(--color-border)]',
              'px-[var(--space-4)] pt-[var(--space-3)] pb-[var(--space-3)]',
            )}
          >
            {hasError ? (
              <div data-testid="shortlist-error" className="mb-[var(--space-2)]">
                {error}
              </div>
            ) : null}

            <ul
              data-testid="vehicle-catalog-shortlist-list"
              className="flex flex-col gap-[var(--space-1)]"
            >
              {shortlist.map((vehicle) => {
                const label = vehicleLabel(vehicle);
                return (
                  <li
                    key={vehicle.id}
                    data-testid={`shortlist-item-${vehicle.id}`}
                    className="list-item-enter flex items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-sm)] bg-muted px-[var(--space-2)] py-[var(--space-1)]"
                  >
                    <span className="flex min-w-0 items-center gap-[var(--space-2)]">
                      <VehicleSilhouette
                        bodyStyle={vehicle.bodyStyle}
                        className="w-6 shrink-0 text-foreground"
                      />
                      <span className="truncate text-[length:var(--font-size-sm)] text-[var(--color-ink)]">
                        {label}
                      </span>
                    </span>
                    {/*
                      Five buttons all named "Remove" is five identical
                      answers to "remove what?" for anyone navigating by
                      control list. The visible word stays first in the
                      accessible name, so WCAG 2.5.3's label-in-name rule
                      still holds and "click Remove" remains speakable.
                    */}
                    <Button
                      type="button"
                      data-testid={`shortlist-remove-${vehicle.id}`}
                      variant="secondary"
                      size="xs"
                      aria-label={`Remove ${label} from your shortlist`}
                      className="min-h-[var(--size-touch-target-min)] min-w-[var(--size-touch-target-min)] shrink-0 bg-card text-card-foreground hover:bg-card/90"
                      disabled={creating}
                      onClick={() => {
                        onRemove(vehicle.id);
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        </CollapsibleContent>

        {/*
          The collapsed row. `relative` is load-bearing: it is the containing
          block the trigger's stretched `::before` resolves against, which is
          how the whole row becomes tappable without the trigger having to
          wrap anything.
        */}
        <div
          data-testid="shortlist-bar-row"
          className="relative flex items-center gap-[var(--space-2)] px-[var(--space-4)]"
          style={{ height: BAR_ROW_HEIGHT }}
        >
          {/*
            The faux-nested control (Heydon Pickering's "Cards" in Inclusive
            Components; Andy Bell's write-up of the same technique).

            The obvious implementation — wrap the row in the trigger — puts a
            `<button>` inside a `<button>`. That is invalid HTML, axe fails it
            as `nested-interactive`, and browsers recover from it by
            reparenting the inner button out of the outer one, so the CTA
            would not even render where it was written.

            The obvious *fix* — keep the wrap and call `stopPropagation` in
            the CTA's handler — is worse, because it leaves the invalid
            markup in place and only patches the symptom.

            So the trigger stays a sibling of the CTA and takes `static`
            positioning plus an `absolute inset-0` `::before`. The pseudo
            element resolves against the row, not the trigger, so the entire
            row is the trigger's hit area; the CTA is raised above it with
            `relative z-10` and therefore receives its own clicks directly.
            Two flat sibling buttons, one of which happens to be stretched.
            No propagation is involved in either direction, which is why
            nothing in this file calls `stopPropagation` and no test needs to
            assert that a click "did not bubble" — it was never on a path
            that could.

            The focus ring is drawn on the `::before` rather than on the
            button box for the same reason: the indicator should outline what
            is actually pressable.
          */}
          <CollapsibleTrigger
            data-testid="shortlist-bar-trigger"
            className={cn(
              'group static flex min-w-0 flex-1 items-center gap-[var(--space-2)] text-left outline-none',
              "before:absolute before:inset-0 before:rounded-[var(--radius-sm)] before:content-['']",
              'focus-visible:before:ring-[3px] focus-visible:before:ring-ring/50 focus-visible:before:ring-inset',
            )}
          >
            {/*
              Without this the control announces as "3 of 5 shortlisted,
              button" — a statement, with no hint that pressing it does
              anything. Radix supplies the expanded/collapsed state, so this
              names the target rather than the action ("Show"/"Hide" would
              fight `aria-expanded` and go stale).
            */}
            <span className="visually-hidden">Shortlist details</span>

            {/*
              Silhouettes, not photographs — the EPA catalog ships no imagery
              (see `VehicleSilhouette.tsx`). The cluster is `aria-hidden`
              because it encodes body style, which the expanded list already
              spells out, and because "sedan, sedan, SUV, plus two" is noise
              in front of the count that follows it.
            */}
            <span className="flex shrink-0 items-center" aria-hidden="true">
              {thumbnails.map((vehicle, index) => (
                <span
                  key={vehicle.id}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full bg-muted ring-2 ring-card',
                    index > 0 && '-ml-2.5',
                  )}
                >
                  <VehicleSilhouette
                    bodyStyle={vehicle.bodyStyle}
                    className="w-5 text-foreground"
                  />
                </span>
              ))}
              {overflowCount > 0 ? (
                <span className="-ml-2.5 flex size-8 items-center justify-center rounded-full bg-secondary text-[length:var(--font-size-2xs)] font-medium text-secondary-foreground ring-2 ring-card">
                  +{overflowCount}
                </span>
              ) : null}
            </span>

            {/* `min-w-0` is what lets `truncate` below actually engage: a flex item defaults to `min-width: auto` and refuses to shrink below its content, which would push the CTA off a 390px row instead of ellipsing. */}
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                data-testid="shortlist-count"
                className="truncate text-[length:var(--font-size-sm)] font-medium text-foreground"
              >
                {shortlist.length} of {maxSize} shortlisted
              </span>
              {statLine !== null ? (
                <span
                  id={STAT_LINE_ID}
                  data-testid="shortlist-stat"
                  className="truncate text-[length:var(--font-size-xs)] text-muted-foreground"
                >
                  {statLine}
                </span>
              ) : null}
            </span>

            {/* Points up while closed because that is the direction the panel travels. */}
            <ChevronUpIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>

          {/*
            "Compare", not "Start comparison (3)". The long label was
            affordable when the shortlist was a full-width card with a
            full-width button; in a row that also carries thumbnails and a
            two-line stat block it is the thing that breaks 390px, and the
            count it carried is already stated one line to the left.

            `relative z-10` is the other half of the faux-nesting: it lifts
            the CTA above the trigger's stretched `::before` so the press
            lands here.
          */}
          <Button
            type="button"
            data-testid="vehicle-catalog-start-comparison"
            aria-busy={creating}
            aria-describedby={statLine !== null ? STAT_LINE_ID : undefined}
            disabled={!canStart || creating}
            className="relative z-10 min-h-[var(--size-touch-target-min)] shrink-0"
            onClick={onStartComparison}
          >
            {creating ? 'Starting…' : 'Compare'}
          </Button>
        </div>
      </Collapsible>
    </section>
  );
}
