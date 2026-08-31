import { describe, expect, it } from 'vitest';
import { mapCatalogRecordToOption, VehicleCatalogRecordSchema } from './browser.js';
import { buildVehicleCatalogRecord } from './test-support.js';

describe('@sift/catalog/browser entry point', () => {
  it('exports a working VehicleCatalogRecordSchema', () => {
    const result = VehicleCatalogRecordSchema.safeParse(
      buildVehicleCatalogRecord({ id: 'veh-1', year: 2025, make: 'Toyota', model: 'Camry' }),
    );
    expect(result.success).toBe(true);
  });

  it('exports a working mapCatalogRecordToOption', () => {
    const mapped = mapCatalogRecordToOption(
      buildVehicleCatalogRecord({ id: 'veh-1', year: 2025, make: 'Toyota', model: 'Camry' }),
    );
    expect(mapped.label).toBe('2025 Toyota Camry');
    expect(mapped.attributes.length).toBeGreaterThan(0);
  });

  /**
   * The factory's own default must stay a *valid* record, or every test that
   * builds on it starts asserting against something the schema would reject.
   * This is the one test that checks the scaffolding rather than the code,
   * and it is cheap insurance: the factory is now the single place a new
   * schema field has to be added, so a field added to the schema but
   * forgotten there fails loudly right here, instead of surfacing as a
   * confusing `.strict()` error in some unrelated test file.
   */
  it('keeps the shared test factory in sync with the strict schema', () => {
    const result = VehicleCatalogRecordSchema.safeParse(buildVehicleCatalogRecord());
    expect(result.success).toBe(true);
  });
});
