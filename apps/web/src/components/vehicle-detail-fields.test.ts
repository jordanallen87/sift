import { describe, expect, it } from 'vitest';
import { buildVehicleCatalogRecord } from '@sift/catalog/test-support';
import { vehicleDetailGroups } from './vehicle-detail-fields.js';

/** Flattens groups to `label` -> `value` so assertions read as claims about content. */
function fieldMap(record: Parameters<typeof vehicleDetailGroups>[0]): Map<string, string> {
  const entries = vehicleDetailGroups(record).flatMap((group) =>
    group.fields.map((field): [string, string] => [field.label, field.value]),
  );
  return new Map(entries);
}

describe('vehicleDetailGroups', () => {
  it('omits a field the catalog does not know rather than rendering a placeholder', () => {
    const groups = vehicleDetailGroups(
      buildVehicleCatalogRecord({ luggageVolumeCuFt: null, annualFuelCostUsd: null }),
    );
    const labels = groups.flatMap((group) => group.fields.map((field) => field.label));
    expect(labels).not.toContain('Cargo volume');
    expect(labels).not.toContain('Est. annual fuel cost');
  });

  it('drops a whole group when none of its fields are known', () => {
    const groups = vehicleDetailGroups(
      buildVehicleCatalogRecord({
        electricRangeMiles: null,
        combinedKwhPer100Mi: null,
        charge120Hours: null,
        charge240Hours: null,
        charger240Description: null,
        combinedUtilityFactor: null,
      }),
    );
    expect(groups.map((group) => group.id)).not.toContain('electric');
  });

  it('keeps a zero measurement, which is not the same as an absent one', () => {
    // 58 real electric vehicles report exactly 0 g/mi. Treating 0 as missing
    // would erase the strongest fact about them.
    expect(fieldMap(buildVehicleCatalogRecord({ co2GramsPerMile: 0 })).get('CO2')).toBe('0 g/mi');
  });

  it('always reports forced induction, because the schema models it as known-either-way', () => {
    const plain = fieldMap(buildVehicleCatalogRecord({ turbocharged: false, supercharged: false }));
    expect(plain.get('Turbocharged')).toBe('No');
    expect(plain.get('Supercharged')).toBe('No');
    expect(fieldMap(buildVehicleCatalogRecord({ turbocharged: true })).get('Turbocharged')).toBe(
      'Yes',
    );
  });

  it('spells out the direction of a signed savings figure instead of a minus sign', () => {
    expect(
      fieldMap(buildVehicleCatalogRecord({ fiveYearSavingsVsAverageUsd: 1250 })).get(
        '5-year fuel savings vs. average',
      ),
    ).toBe('$1,250 less');
    expect(
      fieldMap(buildVehicleCatalogRecord({ fiveYearSavingsVsAverageUsd: -1250 })).get(
        '5-year fuel savings vs. average',
      ),
    ).toBe('$1,250 more');
  });

  it('renders a plug-in hybrid utility factor as a percentage a reader can use', () => {
    expect(
      fieldMap(buildVehicleCatalogRecord({ combinedUtilityFactor: 0.62 })).get(
        'Electric share of miles',
      ),
    ).toBe('62%');
  });

  it('surfaces fields the browse card never shows', () => {
    const map = fieldMap(
      buildVehicleCatalogRecord({
        transmission: '8-speed automatic',
        cylinders: 4,
        greenhouseGasScore: 7,
        passengerVolumeCuFt: 99,
      }),
    );
    expect(map.get('Transmission')).toBe('8-speed automatic');
    expect(map.get('Cylinders')).toBe('4');
    expect(map.get('Greenhouse gas score')).toBe('7/10');
    expect(map.get('Passenger volume')).toBe('99 cu ft');
  });

  it('always attributes the record to its dataset, so a claim can be traced', () => {
    const map = fieldMap(buildVehicleCatalogRecord());
    expect(map.get('Dataset')).toBeTypeOf('string');
    expect(map.get('Record id')).toBeTypeOf('string');
  });

  it('gives every group a stable id distinct from its human-facing title', () => {
    const groups = vehicleDetailGroups(buildVehicleCatalogRecord());
    const ids = groups.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z]+$/.test(id))).toBe(true);
  });
});
