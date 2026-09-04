/**
 * The full spec sheet for one catalog vehicle.
 *
 * ## Why this exists
 *
 * A browse row has to stay scannable, so it carries five specs. That left
 * 68 of the record's 83 fields with nowhere to go, and the previous
 * compromise -- an expanded-width detail grid stapled under every card --
 * made the list longer at exactly the width where more of the list should
 * fit. Moving detail behind a deliberate open lets the card shrink and the
 * detail grow at the same time.
 *
 * ## Why a Sheet and not a Dialog
 *
 * `ui/sheet.tsx` is already this codebase's responsive dialog: below 481px
 * it is a bottom sheet with a grab handle, and above it a centred panel.
 * That is exactly the shadcn "responsive dialog" recipe, minus the
 * `useMediaQuery` swap, and it already carries the `min-h-0` scroll fix
 * that tall content needs. A separate `Dialog` here would reimplement all
 * of it and be worse at 390px.
 */
import type { VehicleCatalogRecord } from '@sift/catalog/browser';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { VehicleSilhouette } from './VehicleSilhouette.js';
import { vehicleDetailGroups } from './vehicle-detail-fields.js';

export interface VehicleDetailSheetProps {
  /** `null` closes the sheet; the record is kept by the caller so the panel can animate out. */
  vehicle: VehicleCatalogRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inShortlist: boolean;
  /** Whether the shortlist is at its cap, which disables adding but never removing. */
  shortlistFull: boolean;
  onToggleShortlist: (vehicle: VehicleCatalogRecord) => void;
}

function vehicleLabel(record: VehicleCatalogRecord): string {
  const trimSuffix = record.trim !== null && record.trim.length > 0 ? ` ${record.trim}` : '';
  return `${String(record.year)} ${record.make} ${record.model}${trimSuffix}`;
}

/** The same terse line the browse row carries, repeated here as orientation. */
function summaryLine(record: VehicleCatalogRecord): string {
  return [
    record.bodyStyle,
    record.drivetrain,
    record.fuelType,
    record.combinedMpg === null ? null : `${String(record.combinedMpg)} MPG combined`,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

export function VehicleDetailSheet({
  vehicle,
  open,
  onOpenChange,
  inShortlist,
  shortlistFull,
  onToggleShortlist,
}: VehicleDetailSheetProps): React.JSX.Element | null {
  if (vehicle === null) return null;

  const groups = vehicleDetailGroups(vehicle);
  const label = vehicleLabel(vehicle);
  const blockedByCap = !inShortlist && shortlistFull;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" data-testid="vehicle-detail-sheet">
        <SheetHeader className="flex-row items-center gap-[var(--space-3)] text-left">
          <VehicleSilhouette bodyStyle={vehicle.bodyStyle} className="w-11 shrink-0" />
          <div className="min-w-0">
            <SheetTitle className="truncate">{label}</SheetTitle>
            <SheetDescription className="truncate">{summaryLine(vehicle)}</SheetDescription>
          </div>
        </SheetHeader>

        <SheetBody>
          {groups.map((group) => (
            <section key={group.id} className="mb-[var(--space-5)] last:mb-0">
              <h3 className="label-caps mb-[var(--space-2)] text-muted-foreground">
                {group.title}
              </h3>
              {/*
                Two columns at 390px gives roughly 167px each, which holds
                "Cargo volume / 37.6 cu ft" but not a spelled-out drivetrain.
                Values that would truncate are already abbreviated by
                `vehicle-detail-fields.ts`, so the grid can stay uniform.
              */}
              <dl
                className="grid grid-cols-2 gap-x-[var(--space-4)] gap-y-[var(--space-3)] min-[481px]:grid-cols-3"
                data-testid={`vehicle-detail-group-${group.id}`}
              >
                {group.fields.map((field) => (
                  <div key={field.label} className="min-w-0">
                    <dt className="text-[length:var(--font-size-xs)] text-muted-foreground">
                      {field.label}
                    </dt>
                    <dd className="text-[length:var(--font-size-sm)] font-[var(--font-weight-medium)] tabular-nums">
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </SheetBody>

        {/*
          The one action this panel offers stays reachable without scrolling
          back, which is the whole reason a long spec sheet is tolerable here.
        */}
        <div className="sticky bottom-0 border-t bg-card px-[var(--space-4)] pt-[var(--space-3)] pb-[max(var(--space-3),env(safe-area-inset-bottom))]">
          <Button
            className="w-full"
            variant={inShortlist ? 'outline' : 'default'}
            aria-pressed={inShortlist}
            disabled={blockedByCap}
            data-testid="vehicle-detail-shortlist-toggle"
            onClick={() => {
              onToggleShortlist(vehicle);
            }}
          >
            {inShortlist ? 'Remove from shortlist' : 'Add to shortlist'}
          </Button>
          {blockedByCap ? (
            // The disabled button alone reads as a bug. Saying why, and what
            // to do about it, is the difference between a dead end and a step.
            <p
              className="pt-[var(--space-2)] text-center text-[length:var(--font-size-xs)] text-muted-foreground"
              data-testid="vehicle-detail-shortlist-full"
            >
              Shortlist is full — remove one to add another.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
