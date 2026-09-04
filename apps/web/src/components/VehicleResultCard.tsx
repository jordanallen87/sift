/**
 * One vehicle in the catalog browse list.
 *
 * ## Why the card shrank
 *
 * This row used to carry a seven-field detail grid under every result at
 * expanded width, which made the list longest exactly where more of the list
 * should have fit. The detail now lives in `VehicleDetailSheet`, so the card
 * is back to its actual job -- letting someone recognise a vehicle and
 * shortlist it -- and the full 83-field record is one deliberate tap away.
 *
 * ## The card is not a button
 *
 * Opening the detail sheet is the row's primary action and adding to the
 * shortlist is its secondary one, which is the classic two-actions-one-card
 * problem. The wrong fix is `<div onClick role="button">`: it makes the
 * card's entire text content its accessible name, forces `stopPropagation`
 * on every child, needs hand-rolled Enter/Space handling, and puts a real
 * `<button>` inside a widget that claims to be one -- an axe
 * `nested-interactive` violation.
 *
 * The pattern used here instead comes from Heydon Pickering's *Inclusive
 * Components* and Andy Bell's *Accessible faux-nested interactive controls*:
 * the row is an ordinary `<li>` establishing a positioning context, the
 * primary trigger is a real `<button>` made `position: static` with a
 * stretched `::after` covering the row, and the Add button is `relative`
 * with a `z-index` so it paints above that layer.
 *
 * The payoff is that there is no click-propagation problem to solve at all:
 * the row was never a click target, so no handler anywhere calls
 * `stopPropagation`. `VehicleResultCard.test.tsx` asserts that the Add
 * button does not open the sheet, which is what would break if this ever
 * regressed to a wrapped card.
 *
 * The known cost, which Pickering names too, is that text selection inside
 * the stretched region stops working. For a row nobody selects text in, that
 * is the right trade.
 */
import type { VehicleCatalogRecord } from '@sift/catalog/browser';
import { Button } from '@/components/ui/button';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { VehicleSilhouette } from './VehicleSilhouette.js';

export interface VehicleResultCardProps {
  vehicle: VehicleCatalogRecord;
  /** Whether this vehicle is already on the shortlist. */
  added: boolean;
  /** Whether the shortlist is full, which blocks adding anything new. */
  atCapacity: boolean;
  onAdd: (vehicle: VehicleCatalogRecord) => void;
  onOpenDetails: (vehicle: VehicleCatalogRecord) => void;
}

export function vehicleLabel(record: VehicleCatalogRecord): string {
  const trimSuffix = record.trim !== null && record.trim.length > 0 ? ` ${record.trim}` : '';
  return `${String(record.year)} ${record.make} ${record.model}${trimSuffix}`;
}

/**
 * The terse line under the title.
 *
 * Capped at three specs rather than the five it used to carry. A fourth
 * reliably pushes the line past a 390px row's width, and a truncated spec is
 * worth less than one fewer spec: the reader cannot tell whether "29 MPG
 * comb…" was the last fact or the middle of a longer list.
 *
 * Returned as an array so a future view switcher can choose a different
 * three without this component growing a mode.
 */
export function vehicleSpecs(record: VehicleCatalogRecord): string[] {
  return [
    record.bodyStyle,
    record.drivetrain,
    record.combinedMpg === null ? null : `${String(record.combinedMpg)} MPG`,
  ]
    .filter((spec): spec is string => spec !== null)
    .slice(0, 3);
}

export function VehicleResultCard({
  vehicle,
  added,
  atCapacity,
  onAdd,
  onOpenDetails,
}: VehicleResultCardProps): React.JSX.Element {
  const label = vehicleLabel(vehicle);
  const specs = vehicleSpecs(vehicle);

  return (
    <Item asChild variant="outline" size="sm" className="relative gap-[var(--space-3)]">
      <li data-testid={`vehicle-card-${vehicle.id}`}>
        <VehicleSilhouette bodyStyle={vehicle.bodyStyle} className="w-11 shrink-0" />

        <ItemContent className="min-w-0 gap-0">
          {/*
            `static` + a stretched `::after` is what makes the whole row open
            the detail sheet while the button itself stays a normal,
            correctly-named control -- its accessible name is the vehicle,
            not the row's entire text.
          */}
          <button
            type="button"
            data-testid={`vehicle-details-${vehicle.id}`}
            // `block w-full text-left p-0` is not cosmetic. `ItemTitle`
            // ships `w-fit`, so without `w-full` the title shrinks to its
            // text; and a `<button>` carries a UA `padding: 1px 6px`, which
            // indents the title 6px from the spec line directly beneath it
            // -- close enough to look like a rendering bug, far enough to
            // read as one.
            className="static block w-full p-0 text-left after:absolute after:inset-0 after:z-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[var(--radius-md)] focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
            onClick={() => {
              onOpenDetails(vehicle);
            }}
          >
            <ItemTitle className="w-full truncate">{label}</ItemTitle>
            <span className="sr-only"> — see full details</span>
          </button>

          {specs.length > 0 ? (
            <ItemDescription className="truncate">{specs.join(' · ')}</ItemDescription>
          ) : null}
        </ItemContent>

        {/* Raised above the stretched layer, so this click is an add, not an open. */}
        <ItemActions className="relative z-10 shrink-0">
          <Button
            data-testid={`vehicle-add-${vehicle.id}`}
            variant={added ? 'secondary' : 'default'}
            disabled={added || atCapacity}
            aria-label={added ? `${label} is on your shortlist` : `Add ${label} to your shortlist`}
            onClick={() => {
              onAdd(vehicle);
            }}
          >
            {added ? 'Added' : 'Add'}
          </Button>
        </ItemActions>
      </li>
    </Item>
  );
}
