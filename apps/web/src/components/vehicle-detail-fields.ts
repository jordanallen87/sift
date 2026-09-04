/**
 * Groups a `VehicleCatalogRecord` into the labelled sections a full detail
 * dialog renders.
 *
 * ## Why this is separate from the card
 *
 * The browse card shows five specs and the expanded card seven, because a
 * row you are scanning to recognise-and-shortlist cannot also be a spec
 * sheet. That leaves 68 of the record's 83 fields unrendered anywhere in the
 * product. A detail dialog is the surface that can afford them, and it needs
 * them *grouped* -- an undifferentiated 83-row list is not more useful than
 * seven rows, it is less.
 *
 * ## Null is a value, and it is not rendered
 *
 * `packages/catalog/src/schema.ts` is explicit that `null` means "EPA did
 * not report this", never zero and never unknown-so-guess. Every row here is
 * dropped when its source is `null`, and a group with no surviving rows is
 * dropped entirely, so a sparse record produces a short dialog rather than a
 * long one full of dashes. This matters beyond tidiness: `co2GramsPerMile`
 * is `0` for 58 real electric vehicles, and only 309 of 853 records carry
 * interior volume at all, so a placeholder would be indistinguishable from a
 * measurement.
 *
 * `turbocharged` and `supercharged` are the two exceptions that always
 * render, because the schema models them as non-nullable booleans: EPA
 * encodes them as set membership, so `false` is a genuine "we know it is
 * not", not an absence.
 */
import type { VehicleCatalogRecord } from '@sift/catalog/browser';

export interface DetailField {
  label: string;
  value: string;
}

export interface DetailGroup {
  /** Stable key for React and for `data-testid`; never derived from the label. */
  id: string;
  title: string;
  fields: DetailField[];
}

const usd = (amount: number): string => `$${amount.toLocaleString('en-US')}`;
const mpg = (value: number): string => `${String(value)} MPG`;
const miles = (value: number): string => `${value.toLocaleString('en-US')} mi`;
const cuFt = (value: number): string => `${String(value)} cu ft`;
const score = (value: number): string => `${String(value)}/10`;
const hours = (value: number): string => `${String(value)} hr`;
const yesNo = (value: boolean): string => (value ? 'Yes' : 'No');

/** Builds one row, or `null` when the catalog has nothing to report. */
function row<T>(
  label: string,
  value: T | null,
  format: (value: T) => string,
): DetailField | null {
  return value === null ? null : { label, value: format(value) };
}

const text = (value: string): string => value;

function group(id: string, title: string, fields: (DetailField | null)[]): DetailGroup | null {
  const present = fields.filter((field): field is DetailField => field !== null);
  return present.length === 0 ? null : { id, title, fields: present };
}

/**
 * The percentage of miles a plug-in hybrid is expected to drive on grid
 * electricity. Stored 0..1, and meaningless to a reader in that form.
 */
const utilityFactor = (value: number): string => `${String(Math.round(value * 100))}%`;

export function vehicleDetailGroups(record: VehicleCatalogRecord): DetailGroup[] {
  return [
    group('identity', 'Vehicle', [
      row('Body style', record.bodyStyle, text),
      row('EPA class', record.epaVehicleClass, text),
      row('Trim', record.trim, text),
    ]),
    group('powertrain', 'Powertrain', [
      row('Drivetrain', record.drivetrain, text),
      row('Fuel type', record.fuelType, text),
      row('Required fuel', record.requiredFuel, text),
      row('Transmission', record.transmission, text),
      row('Engine', record.engineDetail, text),
      row('Displacement', record.engineDisplacementL, (v) => `${String(v)} L`),
      row('Cylinders', record.cylinders, (v) => String(v)),
      { label: 'Turbocharged', value: yesNo(record.turbocharged) },
      { label: 'Supercharged', value: yesNo(record.supercharged) },
      row('Stop-start system', record.startStopSystem, yesNo),
      row('Electric motor', record.electricMotor, text),
    ]),
    group('economy', 'Fuel economy', [
      row('Combined', record.combinedMpg, mpg),
      row('City', record.cityMpg, mpg),
      row('Highway', record.highwayMpg, mpg),
    ]),
    group('electric', 'Electric range and charging', [
      row('Electric range', record.electricRangeMiles, miles),
      row('Combined consumption', record.combinedKwhPer100Mi, (v) => `${String(v)} kWh/100mi`),
      row('Charge time (120V)', record.charge120Hours, hours),
      row('Charge time (240V)', record.charge240Hours, hours),
      row('240V charger', record.charger240Description, text),
      row('Electric share of miles', record.combinedUtilityFactor, utilityFactor),
    ]),
    group('cost', 'Cost', [
      row('Est. annual fuel cost', record.annualFuelCostUsd, (v) => `${usd(v)}/yr`),
      // Signed: 498 of 853 records are negative. `usd()` on a negative
      // number would read "$-1,250", so the sign is spelled out instead.
      row('5-year fuel savings vs. average', record.fiveYearSavingsVsAverageUsd, (v) =>
        v < 0 ? `${usd(Math.abs(v))} more` : `${usd(v)} less`,
      ),
      row('Gas guzzler tax', record.gasGuzzlerTax, text),
    ]),
    group('emissions', 'Emissions', [
      row('EPA fuel economy score', record.fuelEconomyScore, score),
      row('Greenhouse gas score', record.greenhouseGasScore, score),
      row('CO2', record.co2GramsPerMile, (v) => `${String(v)} g/mi`),
      row('Annual petroleum use', record.annualPetroleumBarrels, (v) => `${String(v)} barrels`),
    ]),
    group('volume', 'Interior volume', [
      row('Passenger volume', record.passengerVolumeCuFt, cuFt),
      row('Cargo volume', record.luggageVolumeCuFt, cuFt),
    ]),
    group('provenance', 'Where this came from', [
      { label: 'Dataset', value: record.source.dataset },
      { label: 'Record id', value: record.source.recordId },
      row('Last modified', record.source.modifiedOn, text),
    ]),
  ].filter((entry): entry is DetailGroup => entry !== null);
}
