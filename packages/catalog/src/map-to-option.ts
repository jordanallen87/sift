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
 * powertrain, combined fuel economy, five-year fuel cost, cargo volume).
 * Every attribute a catalog cannot know -- price, mileage, dealer terms,
 * safety/reliability ratings, insurance, ownership cost, cargo width/length,
 * legroom, ground clearance, or anything requiring a subjective or
 * verification-level judgment -- is simply omitted from the returned
 * attribute list. `OptionComparison`'s existing rendering already treats an
 * absent attribute as "Unknown" (confirmed by reading
 * `apps/web/src/components/OptionComparison.tsx`), so omission alone
 * produces the correct honest-unknown UI with no new "unknown" plumbing
 * needed here.
 *
 * The catalog widened from 20 to 83 EPA fields
 * (`packages/catalog/src/schema.ts`), which is what makes `car.cargo_volume_cu_ft`
 * honestly fillable below. That widening was re-checked field-by-field
 * against every other `car.*` attribute the pack declares
 * (`packages/packs/src/car-purchase.ts`), and nothing else newly qualifies:
 * the remaining 82 fields describe fuel economy/emissions/charging detail
 * this pack does not model as separate attributes, or engine/transmission
 * trivia with no matching `car.*` id. The pack's price, mileage,
 * safety/reliability, insurance, and dimensional attributes (cargo width,
 * cargo length, rear door opening, second-row legroom, ground clearance) all
 * describe a specific dealer listing, a rated test result, or a physical
 * measurement EPA's fuel-economy dataset simply does not publish -- not
 * something a wider EPA export could ever answer, so they stay unmapped
 * regardless of how many columns the catalog carries.
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

  // `car.five_year_fuel_cost` from EPA's published annual fuel cost.
  //
  // The x5 is EPA's own convention, not an invention of ours: `fuelCost08`
  // is an annual estimate at 15,000 miles/year on a national average fuel
  // price, and EPA publishes its own five-year save/spend figure
  // (`youSaveSpend`, carried here as `fiveYearSavingsVsAverageUsd`) on that
  // same basis. So this is arithmetic on a published figure under a
  // published assumption, not a fabricated number.
  //
  // It is still an ESTIMATE, and the pack agrees: this attribute declares
  // `evidenceExpectation: 'corroborated'`, so a single source cannot make it
  // read as well-supported. That is the correct outcome -- a shopper's real
  // fuel cost depends on their own mileage and local prices, neither of
  // which EPA knows. Filling it from real data and letting the evidence
  // rules rank it honestly beats leaving a required criterion permanently
  // unknown.
  if (record.annualFuelCostUsd !== null) {
    attributes.push({
      definitionId: 'car.five_year_fuel_cost',
      value: {
        type: 'money',
        amount: record.annualFuelCostUsd * 5,
        currency: 'USD',
      },
    });
  }

  // `car.cargo_volume_cu_ft` from EPA's `luggageVolumeCuFt`.
  //
  // The pack labels this attribute "Cargo volume behind second row". EPA's
  // luggage-volume figure is measured differently by body style -- trunk
  // volume for a sedan, the area behind the rear seats for a hatchback/wagon
  // -- but both are the same real-world quantity a shopper means by "cargo
  // space behind the second row", so the raw EPA number can be passed
  // through without adjustment.
  //
  // EPA publishes this for every passenger car but for almost no SUV,
  // pickup, or minivan (see `VolumeCuFt` in schema.ts for the exact split),
  // so 544 of 853 records carry `null`. That is left as an omitted
  // attribute -- not a 0 or a placeholder -- exactly like every other
  // honestly-unknown field in this mapping.
  //
  // Worth knowing when reading a comparison: this attribute will be present
  // for the sedans on a shortlist and absent for the SUVs, which is a
  // property of the source rather than of the vehicles, and is precisely
  // the situation the pack's honest-unknown rendering exists for.
  if (record.luggageVolumeCuFt !== null) {
    attributes.push({
      definitionId: 'car.cargo_volume_cu_ft',
      value: { type: 'number', value: record.luggageVolumeCuFt, unit: 'cu ft' },
    });
  }

  return { label: vehicleLabel(record), attributes };
}
