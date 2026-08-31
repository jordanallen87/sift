import { describe, expect, it } from 'vitest';
import { loadCatalog } from './data.js';
import { mapCatalogRecordToOption } from './map-to-option.js';
import { buildVehicleCatalogRecord } from './test-support.js';

function attr(mapped: ReturnType<typeof mapCatalogRecordToOption>, definitionId: string) {
  return mapped.attributes.find((a) => a.definitionId === definitionId);
}

describe('mapCatalogRecordToOption', () => {
  it('maps every known field to its matching car.* attribute', () => {
    const mapped = mapCatalogRecordToOption(
      buildVehicleCatalogRecord({
        trim: 'XLE',
        bodyStyle: 'Sedan',
        drivetrain: 'FWD',
        fuelType: 'Hybrid',
        combinedMpg: 47,
      }),
    );

    expect(attr(mapped, 'car.make')?.value).toEqual({ type: 'string', value: 'Toyota' });
    expect(attr(mapped, 'car.model')?.value).toEqual({ type: 'string', value: 'Camry' });
    expect(attr(mapped, 'car.model_year')?.value).toEqual({ type: 'number', value: 2025 });
    expect(attr(mapped, 'car.trim')?.value).toEqual({ type: 'string', value: 'XLE' });
    expect(attr(mapped, 'car.body_style')?.value).toEqual({ type: 'string', value: 'Sedan' });
    expect(attr(mapped, 'car.drivetrain')?.value).toEqual({ type: 'enum', value: 'FWD' });
    expect(attr(mapped, 'car.powertrain')?.value).toEqual({ type: 'enum', value: 'hybrid' });
    expect(attr(mapped, 'car.combined_fuel_economy_mpg')?.value).toEqual({
      type: 'number',
      value: 47,
      unit: 'mpg',
    });
  });

  it('produces a human-readable label including year, make, model, and trim', () => {
    const mapped = mapCatalogRecordToOption(buildVehicleCatalogRecord({ trim: 'XLE' }));
    expect(mapped.label).toBe('2025 Toyota Camry XLE');
  });

  it('omits the trim suffix from the label when trim is null', () => {
    const mapped = mapCatalogRecordToOption(buildVehicleCatalogRecord({ trim: null }));
    expect(mapped.label).toBe('2025 Toyota Camry');
  });

  it('never fabricates unknown fields: a null trim/bodyStyle/drivetrain/fuelType/combinedMpg produces no attribute for that field', () => {
    const mapped = mapCatalogRecordToOption(
      buildVehicleCatalogRecord({
        trim: null,
        bodyStyle: null,
        drivetrain: null,
        fuelType: null,
        combinedMpg: null,
      }),
    );
    expect(attr(mapped, 'car.trim')).toBeUndefined();
    expect(attr(mapped, 'car.body_style')).toBeUndefined();
    expect(attr(mapped, 'car.drivetrain')).toBeUndefined();
    expect(attr(mapped, 'car.powertrain')).toBeUndefined();
    expect(attr(mapped, 'car.combined_fuel_economy_mpg')).toBeUndefined();
    // The three genuinely always-known fields are still present.
    expect(attr(mapped, 'car.make')).toBeDefined();
    expect(attr(mapped, 'car.model')).toBeDefined();
    expect(attr(mapped, 'car.model_year')).toBeDefined();
  });

  it('leaves an out-of-enum drivetrain unmapped rather than guessing', () => {
    const mapped = mapCatalogRecordToOption(buildVehicleCatalogRecord({ drivetrain: 'AWD/4WD' }));
    expect(attr(mapped, 'car.drivetrain')).toBeUndefined();
  });

  it('leaves an out-of-enum fuel type unmapped rather than guessing', () => {
    const mapped = mapCatalogRecordToOption(buildVehicleCatalogRecord({ fuelType: 'Flex-fuel' }));
    expect(attr(mapped, 'car.powertrain')).toBeUndefined();
  });

  it('maps every allowed drivetrain value correctly', () => {
    for (const drivetrain of ['AWD', 'FWD', 'RWD', '4WD']) {
      const mapped = mapCatalogRecordToOption(buildVehicleCatalogRecord({ drivetrain }));
      expect(attr(mapped, 'car.drivetrain')?.value).toEqual({ type: 'enum', value: drivetrain });
    }
  });

  it('maps every recognized fuel type to its pack powertrain enum value', () => {
    const cases: [string, string][] = [
      ['Gasoline', 'gasoline'],
      ['Gasoline (premium)', 'gasoline'],
      ['Hybrid', 'hybrid'],
      ['Electric', 'electric'],
      ['Diesel', 'diesel'],
      ['Plug-in hybrid', 'plug_in_hybrid'],
    ];
    for (const [fuelType, expected] of cases) {
      const mapped = mapCatalogRecordToOption(buildVehicleCatalogRecord({ fuelType }));
      expect(attr(mapped, 'car.powertrain')?.value).toEqual({ type: 'enum', value: expected });
    }
  });

  describe('car.five_year_fuel_cost', () => {
    it('maps to 5x EPA annual fuel cost when known', () => {
      const mapped = mapCatalogRecordToOption(
        buildVehicleCatalogRecord({ annualFuelCostUsd: 1900 }),
      );
      expect(attr(mapped, 'car.five_year_fuel_cost')?.value).toEqual({
        type: 'money',
        amount: 9500,
        currency: 'USD',
      });
    });

    it('is omitted, not zeroed, when EPA reports no annual fuel cost', () => {
      const mapped = mapCatalogRecordToOption(
        buildVehicleCatalogRecord({ annualFuelCostUsd: null }),
      );
      expect(attr(mapped, 'car.five_year_fuel_cost')).toBeUndefined();
    });
  });

  describe('car.cargo_volume_cu_ft', () => {
    it('maps directly from luggageVolumeCuFt when EPA reports it', () => {
      const mapped = mapCatalogRecordToOption(buildVehicleCatalogRecord({ luggageVolumeCuFt: 15 }));
      expect(attr(mapped, 'car.cargo_volume_cu_ft')?.value).toEqual({
        type: 'number',
        value: 15,
        unit: 'cu ft',
      });
    });

    // EPA does not measure luggage volume for trucks and SUVs (see
    // `VolumeCuFt` in schema.ts), so this is the majority case across the
    // catalog, not an edge case -- roughly two thirds of records are null
    // here. The mapping must omit the attribute rather than emit a 0 or any
    // other placeholder, matching every other honestly-unknown field.
    it('omits the attribute rather than emitting 0 when luggageVolumeCuFt is null', () => {
      const mapped = mapCatalogRecordToOption(
        buildVehicleCatalogRecord({ luggageVolumeCuFt: null }),
      );
      expect(attr(mapped, 'car.cargo_volume_cu_ft')).toBeUndefined();
    });

    it('maps a real sedan record that EPA reports luggage volume for', () => {
      const catalog = loadCatalog();
      const sedanWithVolume = catalog.find(
        (record) => record.bodyStyle === 'Full-size sedan' && record.luggageVolumeCuFt !== null,
      );
      expect(sedanWithVolume).toBeDefined();

      const mapped = mapCatalogRecordToOption(sedanWithVolume!);
      expect(attr(mapped, 'car.cargo_volume_cu_ft')?.value).toEqual({
        type: 'number',
        value: sedanWithVolume!.luggageVolumeCuFt,
        unit: 'cu ft',
      });
    });

    it('omits cargo volume for a real pickup truck record, which EPA never measures', () => {
      const catalog = loadCatalog();
      const pickup = catalog.find(
        (record) => record.bodyStyle === 'Pickup truck' && record.luggageVolumeCuFt === null,
      );
      expect(pickup).toBeDefined();

      const mapped = mapCatalogRecordToOption(pickup!);
      expect(attr(mapped, 'car.cargo_volume_cu_ft')).toBeUndefined();
    });
  });
});
