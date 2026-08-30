/**
 * The one adaptation boundary from a `VehicleCatalogRecord` to the
 * `car-purchase` pack's declared `candidate` option attributes
 * (docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md:
 * "`VehicleCatalogRecord` -> Sift candidate entity / option"). Both
 * `apps/web`'s catalog/shortlist UI and any future server-side caller
 * import this single function rather than each re-deriving the mapping,
 * satisfying CLAUDE.md's "same command implementation" principle by
 * construction -- there is exactly one mapping, not a client copy and a
 * server copy.
 *
 * Deliberately maps only the subset of `car.*` attributes a vehicle catalog
 * can actually know (make, model, model year, trim, body style, drivetrain,
 * powertrain, combined fuel economy). Every attribute a catalog cannot know
 * -- price, mileage, dealer terms, safety/reliability ratings, ownership
 * cost, cargo dimensions -- is simply omitted from the returned attribute
 * list. `OptionComparison`'s existing rendering already treats an absent
 * attribute as "Unknown" (confirmed by reading
 * `apps/web/src/components/OptionComparison.tsx`), so omission alone
 * produces the correct honest-unknown UI with no new "unknown" plumbing
 * needed here.
 *
 * `car.drivetrain` and `car.powertrain` are pack-declared `enum` attributes
 * with a closed `allowedValues` list (`packages/packs/src/car-purchase.ts`).
 * A catalog value that does not map cleanly onto one of those allowed
 * values (e.g. a combined "AWD/4WD" drivetrain string, or a "Flex-fuel"
 * powertrain the pack's enum does not include) is left unmapped rather than
 * guessed -- CLAUDE.md "never fabricate a value."
 */
import type { AttributeValue } from '@sift/contracts';
import type { VehicleCatalogRecord } from './schema.js';

export interface MappedOptionAttribute {
  definitionId: string;
  value: AttributeValue;
}

export interface MappedOption {
  /** A human-readable label for this candidate, e.g. "2025 Toyota Camry XLE". */
  label: string;
  attributes: MappedOptionAttribute[];
}

const DRIVETRAIN_ALLOWED_VALUES = new Set(['AWD', 'FWD', 'RWD', '4WD']);

const POWERTRAIN_BY_FUEL_TYPE: Record<string, string> = {
  Gasoline: 'gasoline',
  'Gasoline (premium)': 'gasoline',
  Hybrid: 'hybrid',
  Electric: 'electric',
  Diesel: 'diesel',
  'Plug-in hybrid': 'plug_in_hybrid',
};

function vehicleLabel(record: VehicleCatalogRecord): string {
  const trimSuffix = record.trim !== null && record.trim.length > 0 ? ` ${record.trim}` : '';
  return `${record.year} ${record.make} ${record.model}${trimSuffix}`;
}

/**
 * Maps one catalog record into the label + attribute list an `upsertOption`
 * call needs. Never fetches, mutates, or persists anything -- callers pass
 * the returned `attributes` directly as `UpsertOptionInput.option.attributes`.
 */
export function mapCatalogRecordToOption(record: VehicleCatalogRecord): MappedOption {
  const attributes: MappedOptionAttribute[] = [
    { definitionId: 'car.make', value: { type: 'string', value: record.make } },
    { definitionId: 'car.model', value: { type: 'string', value: record.model } },
    { definitionId: 'car.model_year', value: { type: 'number', value: record.year } },
  ];

  if (record.trim !== null && record.trim.length > 0) {
    attributes.push({ definitionId: 'car.trim', value: { type: 'string', value: record.trim } });
  }

  if (record.bodyStyle !== null) {
    attributes.push({
      definitionId: 'car.body_style',
      value: { type: 'string', value: record.bodyStyle },
    });
  }

  if (record.drivetrain !== null && DRIVETRAIN_ALLOWED_VALUES.has(record.drivetrain)) {
    attributes.push({
      definitionId: 'car.drivetrain',
      value: { type: 'enum', value: record.drivetrain },
    });
  }

  const powertrain =
    record.fuelType !== null ? POWERTRAIN_BY_FUEL_TYPE[record.fuelType] : undefined;
  if (powertrain !== undefined) {
    attributes.push({ definitionId: 'car.powertrain', value: { type: 'enum', value: powertrain } });
  }

  if (record.combinedMpg !== null) {
    attributes.push({
      definitionId: 'car.combined_fuel_economy_mpg',
      value: { type: 'number', value: record.combinedMpg, unit: 'mpg' },
    });
  }

  return { label: vehicleLabel(record), attributes };
}
