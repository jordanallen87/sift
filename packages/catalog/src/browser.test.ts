import { describe, expect, it } from 'vitest';
import { mapCatalogRecordToOption, VehicleCatalogRecordSchema } from './browser.js';

describe('@pax/catalog/browser entry point', () => {
  it('exports a working VehicleCatalogRecordSchema', () => {
    const result = VehicleCatalogRecordSchema.safeParse({
      id: 'veh-1',
      year: 2025,
      make: 'Toyota',
      model: 'Camry',
      trim: null,
      bodyStyle: null,
      drivetrain: null,
      fuelType: null,
      combinedMpg: null,
      cylinders: null,
      transmission: null,
      source: { dataset: 'epa-fueleconomy-gov', recordId: '1' },
    });
    expect(result.success).toBe(true);
  });

  it('exports a working mapCatalogRecordToOption', () => {
    const mapped = mapCatalogRecordToOption({
      id: 'veh-1',
      year: 2025,
      make: 'Toyota',
      model: 'Camry',
      trim: null,
      bodyStyle: null,
      drivetrain: null,
      fuelType: null,
      combinedMpg: null,
      cylinders: null,
      transmission: null,
      source: { dataset: 'epa-fueleconomy-gov', recordId: '1' },
    });
    expect(mapped.label).toBe('2025 Toyota Camry');
    expect(mapped.attributes.length).toBeGreaterThan(0);
  });
});
