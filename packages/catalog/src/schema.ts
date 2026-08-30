/**
 * `VehicleCatalogRecord` -- the bundled vehicle catalog's own record shape
 * (docs/decisions/0003-vehicle-catalog-and-normal-case-creation.md). This is
 * deliberately a distinct, narrower shape from the `car-purchase` pack's
 * `EntityRecord`/`AttributeValue` model: a catalog record describes a
 * year/make/model/trim's *published specifications*, never a specific
 * listing, price, or case-scoped fact. `map-to-option.ts` owns the one
 * adaptation boundary from this shape into pack attributes.
 *
 * Every field beyond `id`/`year`/`make`/`model` is nullable rather than
 * optional-and-absent: the source EPA data genuinely does not know a trim,
 * cylinder count, or transmission for every record, and Sift's own
 * "unknown stays unknown, never fabricated" philosophy
 * (docs/specs/product.md) extends to this catalog layer too. `null` is a
 * deliberate, present value meaning "the source did not report this",
 * distinct from a field being missing from the object entirely (which would
 * be a malformed record).
 */
import { z } from 'zod';

export const VehicleCatalogRecordSchema = z
  .object({
    id: z.string().min(1).max(200),
    year: z.number().int().min(1980).max(2100),
    make: z.string().min(1).max(100),
    model: z.string().min(1).max(100),
    trim: z.string().max(200).nullable(),
    bodyStyle: z.string().max(100).nullable(),
    drivetrain: z.string().max(100).nullable(),
    fuelType: z.string().max(100).nullable(),
    combinedMpg: z.number().positive().nullable(),
    cityMpg: z.number().positive().nullable(),
    highwayMpg: z.number().positive().nullable(),
    /** EPA's published estimated annual fuel cost, in whole US dollars. */
    annualFuelCostUsd: z.number().positive().nullable(),
    /**
     * EPA's 5-year fuel cost saved (positive) or **spent** (negative) versus
     * an average new vehicle. Deliberately NOT `.positive()`: about 58% of
     * catalog records are negative, and rejecting those would silently drop
     * exactly the thirstiest vehicles -- the ones a cost-conscious shopper
     * most needs to see.
     */
    fiveYearSavingsVsAverageUsd: z.number().int().nullable(),
    /** EPA 1-10 scores; `null` where EPA reports the vehicle as unrated. */
    fuelEconomyScore: z.number().int().min(1).max(10).nullable(),
    greenhouseGasScore: z.number().int().min(1).max(10).nullable(),
    co2GramsPerMile: z.number().positive().nullable(),
    engineDisplacementL: z.number().positive().nullable(),
    cylinders: z.number().int().positive().nullable(),
    transmission: z.string().max(200).nullable(),
    /** EV/PHEV only; `null` on a combustion vehicle, where EPA reports 0 meaning "not applicable". */
    electricRangeMiles: z.number().positive().nullable(),
    charge240Hours: z.number().positive().nullable(),
    source: z
      .object({
        dataset: z.string().min(1),
        recordId: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type VehicleCatalogRecord = z.infer<typeof VehicleCatalogRecordSchema>;

// Raised from 1000 when the catalog widened from 2 model years (151 records)
// to 2016-onward (853). The cap exists to bound a malformed or hostile
// payload, not to express the real catalog's size, so it leaves generous
// headroom for a future re-import rather than sitting just above the current
// count where the next widening would trip it.
export const VehicleCatalogRecordListSchema = z.array(VehicleCatalogRecordSchema).max(5000);
