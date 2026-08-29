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
 * cylinder count, or transmission for every record, and Pax's own
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
    cylinders: z.number().int().positive().nullable(),
    transmission: z.string().max(200).nullable(),
    source: z
      .object({
        dataset: z.string().min(1),
        recordId: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type VehicleCatalogRecord = z.infer<typeof VehicleCatalogRecordSchema>;

export const VehicleCatalogRecordListSchema = z.array(VehicleCatalogRecordSchema).max(1000);
