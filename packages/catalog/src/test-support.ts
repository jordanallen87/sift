/**
 * Test-only helpers for constructing `VehicleCatalogRecord` values.
 *
 * `VehicleCatalogRecordSchema` is `.strict()` and the record now carries 83
 * fields, so a test that needs "a catalog record where `luggageVolumeCuFt`
 * is 15" would otherwise have to spell out 82 irrelevant nulls to say it.
 * Several tests did exactly that back when the record had 20 fields, and
 * every one of them broke the moment the catalog widened -- not because the
 * behaviour under test changed, but because an unrelated literal went stale.
 *
 * The factory below defaults every field to `null` (or `false` for the two
 * non-nullable flag booleans) and takes an override bag, so a test states
 * only the fields it actually cares about. That keeps the *assertion*
 * legible and stops a future field addition from touching dozens of test
 * files.
 *
 * Deliberately NOT exported from `index.ts` or `browser.ts`: this is test
 * scaffolding, and shipping a record factory in the package's public API
 * would invite production code to build synthetic vehicles. Tests import it
 * by relative path.
 *
 * The all-null default is also the honest one. It represents a record whose
 * source reported nothing beyond identity, which is the case every mapping
 * and rendering path must handle without fabricating a value -- so it is the
 * right default for a test to start from and override upward.
 */
import type { VehicleCatalogRecord } from './schema.js';

/**
 * Overrides accepted by `buildVehicleCatalogRecord`.
 *
 * `source` is deliberately `Partial` of its own shape rather than the whole
 * nested object. A plain `Partial<VehicleCatalogRecord>` would still demand
 * all seven provenance fields the moment a test wanted to set just
 * `recordId`, which is precisely the "restate everything to say one thing"
 * problem this factory exists to remove -- one level down.
 */
export type VehicleCatalogRecordOverrides = Partial<Omit<VehicleCatalogRecord, 'source'>> & {
  source?: Partial<VehicleCatalogRecord['source']>;
};

/**
 * A minimal valid record: identity populated, every optional field null.
 *
 * `turbocharged` and `supercharged` are `false` rather than null because
 * they are non-nullable booleans in the schema -- EPA encodes them as
 * set-membership flags with no "unknown" state (see `schema.ts`).
 */
export function buildVehicleCatalogRecord(
  overrides: VehicleCatalogRecordOverrides = {},
): VehicleCatalogRecord {
  const { source: sourceOverride, ...rest } = overrides;
  return {
    id: 'veh-test-1',
    year: 2025,
    make: 'Toyota',
    model: 'Camry',
    trim: null,
    epaModel: null,
    epaBaseModel: null,
    bodyStyle: null,
    epaVehicleClass: null,

    drivetrain: null,
    fuelType: null,
    requiredFuel: null,
    primaryFuel: null,
    secondaryFuel: null,
    alternativeTechnology: null,
    engineDisplacementL: null,
    cylinders: null,
    transmission: null,
    transmissionDetail: null,
    engineDetail: null,
    turbocharged: false,
    supercharged: false,
    startStopSystem: null,
    electricMotor: null,
    phevBlended: null,

    combinedMpg: null,
    cityMpg: null,
    highwayMpg: null,
    combinedMpgUnrounded: null,
    cityMpgUnrounded: null,
    highwayMpgUnrounded: null,
    unadjustedCityMpg: null,
    unadjustedHighwayMpg: null,

    altCombinedMpg: null,
    altCityMpg: null,
    altHighwayMpg: null,
    altCombinedMpgUnrounded: null,
    altCityMpgUnrounded: null,
    altHighwayMpgUnrounded: null,
    unadjustedAltCityMpg: null,
    unadjustedAltHighwayMpg: null,

    electricRangeMiles: null,
    electricRangeCityMiles: null,
    electricRangeHighwayMiles: null,
    altFuelRangeMiles: null,
    altFuelRangeCityMiles: null,
    altFuelRangeHighwayMiles: null,
    combinedKwhPer100Mi: null,
    cityKwhPer100Mi: null,
    highwayKwhPer100Mi: null,
    charge120Hours: null,
    charge240Hours: null,
    charge240bHours: null,
    charger240Description: null,
    charger240bDescription: null,

    phevCombinedMpge: null,
    phevCityMpge: null,
    phevHighwayMpge: null,
    chargeDepletingCombinedMpge: null,
    chargeDepletingCityMpge: null,
    chargeDepletingHighwayMpge: null,
    combinedUtilityFactor: null,
    cityUtilityFactor: null,
    highwayUtilityFactor: null,

    annualFuelCostUsd: null,
    altAnnualFuelCostUsd: null,
    fiveYearSavingsVsAverageUsd: null,
    gasGuzzlerTax: null,

    fuelEconomyScore: null,
    greenhouseGasScore: null,
    altGreenhouseGasScore: null,
    co2GramsPerMile: null,
    altCo2GramsPerMile: null,
    annualPetroleumBarrels: null,
    altAnnualPetroleumBarrels: null,

    passengerVolumeCuFt: null,
    luggageVolumeCuFt: null,
    passengerVolume4DoorCuFt: null,
    passengerVolume2DoorCuFt: null,
    passengerVolumeHatchbackCuFt: null,
    luggageVolume4DoorCuFt: null,
    luggageVolume2DoorCuFt: null,
    luggageVolumeHatchbackCuFt: null,

    ...rest,
    // Merged rather than replaced so a test can override a single
    // provenance field without restating the whole nested object.
    source: {
      dataset: 'epa-fueleconomy-gov',
      recordId: '1',
      epaEngineId: null,
      manufacturerCode: null,
      createdOn: null,
      modifiedOn: null,
      hasUserMpgData: null,
      ...sourceOverride,
    },
  };
}
