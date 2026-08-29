import { describe, expect, it } from 'vitest';
import { mapCatalogRecordToOption } from './map-to-option.js';
import type { VehicleCatalogRecord } from './schema.js';

function buildRecord(overrides: Partial<VehicleCatalogRecord> = {}): VehicleCatalogRecord {
  return {
    id: 'veh-test-1',
    year: 2025,
    make: 'Toyota',
    model: 'Camry',
    trim: 'XLE',
    bodyStyle: 'Sedan',
    drivetrain: 'FWD',
    fuelType: 'Hybrid',
    combinedMpg: 47,
    cylinders: 4,
    transmission: 'Automatic (AV-S6)',
    source: { dataset: 'epa-fueleconomy-gov', recordId: '1' },
    ...overrides,
  };
}

function attr(mapped: ReturnType<typeof mapCatalogRecordToOption>, definitionId: string) {
  return mapped.attributes.find((a) => a.definitionId === definitionId);
}

describe('mapCatalogRecordToOption', () => {
  it('maps every known field to its matching car.* attribute', () => {
    const mapped = mapCatalogRecordToOption(buildRecord());

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
    const mapped = mapCatalogRecordToOption(buildRecord());
    expect(mapped.label).toBe('2025 Toyota Camry XLE');
  });

  it('omits the trim suffix from the label when trim is null', () => {
    const mapped = mapCatalogRecordToOption(buildRecord({ trim: null }));
    expect(mapped.label).toBe('2025 Toyota Camry');
  });

  it('never fabricates unknown fields: a null trim/bodyStyle/drivetrain/fuelType/combinedMpg produces no attribute for that field', () => {
    const mapped = mapCatalogRecordToOption(
      buildRecord({
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
    const mapped = mapCatalogRecordToOption(buildRecord({ drivetrain: 'AWD/4WD' }));
    expect(attr(mapped, 'car.drivetrain')).toBeUndefined();
  });

  it('leaves an out-of-enum fuel type unmapped rather than guessing', () => {
    const mapped = mapCatalogRecordToOption(buildRecord({ fuelType: 'Flex-fuel' }));
    expect(attr(mapped, 'car.powertrain')).toBeUndefined();
  });

  it('maps every allowed drivetrain value correctly', () => {
    for (const drivetrain of ['AWD', 'FWD', 'RWD', '4WD']) {
      const mapped = mapCatalogRecordToOption(buildRecord({ drivetrain }));
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
      const mapped = mapCatalogRecordToOption(buildRecord({ fuelType }));
      expect(attr(mapped, 'car.powertrain')?.value).toEqual({ type: 'enum', value: expected });
    }
  });
});
