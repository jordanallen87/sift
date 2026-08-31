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
 *
 * ## Why this record carries 83 fields
 *
 * It carries every column the EPA bulk export publishes except two exact
 * duplicates (`co2`/`co2A`, which restate `co2TailpipeGpm`/`co2TailpipeAGpm`
 * as integers). Earlier revisions imported 10 and then 20 columns chosen by
 * guessing what a shopper would want, and the guess was wrong in both
 * directions -- it discarded EPA's published annual fuel cost while keeping
 * internal identifiers. A column that was never imported cannot be surfaced
 * without a re-import; a column that is imported and unused costs only disk,
 * and the catalog is read server-side from disk and served paginated, never
 * bundled into the browser.
 *
 * ## Zero is not the same as unknown
 *
 * Several fields below are `.nonnegative()` rather than `.positive()`, and
 * that is load-bearing rather than incidental. EPA uses three different
 * encodings for "not reported" depending on the column, and a single shared
 * "treat <= 0 as missing" rule silently corrupted this catalog twice, both
 * times biasing it in the direction that most misleads a shopper. The
 * import script documents each column's convention at its call site; the
 * bounds here are the second line of defence, and loosening one to make a
 * validation error go away would re-open exactly those bugs.
 */
import { z } from 'zod';

/** EPA publishes fuel-economy scores on a 1-10 scale, using -1 for "not rated" (mapped to `null` on import). */
const EpaScore = z.number().int().min(1).max(10).nullable();

/** A share of miles, so bounded to 0-1 rather than left as an open float. */
const UtilityFactor = z.number().min(0).max(1).nullable();

/**
 * Cubic feet of interior volume.
 *
 * Populated for 309 of 853 records. The split is by body style, not
 * arbitrary: EPA publishes interior volume for every passenger car in this
 * catalog (145/145 sedans, 85/85 full-size sedans, 40/40 compact cars, 6/6
 * wagons) and for almost no high-riding vehicle (31 of 351 compact SUVs,
 * 2 of 81 SUVs, and none of the 68 pickups, 22 compact pickups, or 55
 * minivans). So a `null` here is a real statement about EPA's measurement
 * programme, not a gap in this import.
 */
const VolumeCuFt = z.number().int().positive().max(400).nullable();

export const VehicleCatalogRecordSchema = z
  .object({
    // -- Identity -----------------------------------------------------
    id: z.string().min(1).max(200),
    year: z.number().int().min(1980).max(2100),
    make: z.string().min(1).max(100),
    model: z.string().min(1).max(100),
    trim: z.string().max(200).nullable(),
    /** EPA's full model string verbatim (e.g. "CX-5 4WD"), alongside our curated make/model/trim split. */
    epaModel: z.string().max(200).nullable(),
    /** EPA's own base-model grouping, which does not always agree with our curated prefix. Useful for cross-referencing other EPA-keyed datasets. */
    epaBaseModel: z.string().max(200).nullable(),
    bodyStyle: z.string().max(100).nullable(),
    /** EPA's raw `VClass` before our `bodyStyle` normalisation, retained so a consumer can recover the original classification. */
    epaVehicleClass: z.string().max(100).nullable(),

    // -- Powertrain and engine ----------------------------------------
    drivetrain: z.string().max(100).nullable(),
    fuelType: z.string().max(100).nullable(),
    /**
     * The fuel grade the vehicle actually requires ("Regular", "Premium",
     * "Gasoline or E85"). Distinct from the normalised `fuelType`, and a
     * real recurring-cost factor: premium-required is roughly a 10-15%
     * fuel premium a shopper pays every fill.
     */
    requiredFuel: z.string().max(100).nullable(),
    primaryFuel: z.string().max(100).nullable(),
    secondaryFuel: z.string().max(100).nullable(),
    /** EPA's alternative-technology marker: EV, PHEV, Hybrid, FFV, Diesel. */
    alternativeTechnology: z.string().max(100).nullable(),
    engineDisplacementL: z.number().positive().nullable(),
    cylinders: z.number().int().positive().nullable(),
    transmission: z.string().max(200).nullable(),
    transmissionDetail: z.string().max(200).nullable(),
    engineDetail: z.string().max(300).nullable(),
    /**
     * Not nullable, unlike almost everything else here. EPA encodes these
     * two as set-membership flags -- a marker when the vehicle has the
     * feature, an empty cell when it does not, with no third state. A 2016
     * Camry is not "unknown turbocharged", it is not turbocharged, and
     * reporting `null` would make most of the catalog claim ignorance
     * about something the source does record.
     */
    turbocharged: z.boolean(),
    supercharged: z.boolean(),
    /** Y/N in the source, so a blank genuinely is unknown here and stays `null`. */
    startStopSystem: z.boolean().nullable(),
    electricMotor: z.string().max(300).nullable(),
    phevBlended: z.boolean().nullable(),

    // -- Fuel economy, primary fuel ------------------------------------
    combinedMpg: z.number().positive().nullable(),
    cityMpg: z.number().positive().nullable(),
    highwayMpg: z.number().positive().nullable(),
    /** Unrounded counterparts to the window-sticker figures above -- what you need to separate two vehicles that round to the same MPG. */
    combinedMpgUnrounded: z.number().positive().nullable(),
    cityMpgUnrounded: z.number().positive().nullable(),
    highwayMpgUnrounded: z.number().positive().nullable(),
    /** Raw dynamometer results, before EPA's real-world adjustment factors. */
    unadjustedCityMpg: z.number().positive().nullable(),
    unadjustedHighwayMpg: z.number().positive().nullable(),

    // -- Fuel economy, alternative fuel --------------------------------
    // The second fuel of a dual-fuel vehicle: E85 in a flex-fuel car, or
    // the gasoline side of a plug-in hybrid.
    altCombinedMpg: z.number().positive().nullable(),
    altCityMpg: z.number().positive().nullable(),
    altHighwayMpg: z.number().positive().nullable(),
    altCombinedMpgUnrounded: z.number().positive().nullable(),
    altCityMpgUnrounded: z.number().positive().nullable(),
    altHighwayMpgUnrounded: z.number().positive().nullable(),
    unadjustedAltCityMpg: z.number().positive().nullable(),
    unadjustedAltHighwayMpg: z.number().positive().nullable(),

    // -- Electric and charging ------------------------------------------
    electricRangeMiles: z.number().positive().nullable(),
    electricRangeCityMiles: z.number().positive().nullable(),
    electricRangeHighwayMiles: z.number().positive().nullable(),
    altFuelRangeMiles: z.number().positive().nullable(),
    altFuelRangeCityMiles: z.number().positive().nullable(),
    altFuelRangeHighwayMiles: z.number().positive().nullable(),
    /** kWh per 100 miles -- the EV equivalent of MPG, and what actually drives an EV's running cost. */
    combinedKwhPer100Mi: z.number().positive().nullable(),
    cityKwhPer100Mi: z.number().positive().nullable(),
    highwayKwhPer100Mi: z.number().positive().nullable(),
    charge120Hours: z.number().positive().nullable(),
    charge240Hours: z.number().positive().nullable(),
    charge240bHours: z.number().positive().nullable(),
    charger240Description: z.string().max(200).nullable(),
    charger240bDescription: z.string().max(200).nullable(),

    // -- Plug-in hybrid charge-depleting operation ----------------------
    phevCombinedMpge: z.number().positive().nullable(),
    phevCityMpge: z.number().positive().nullable(),
    phevHighwayMpge: z.number().positive().nullable(),
    chargeDepletingCombinedMpge: z.number().positive().nullable(),
    chargeDepletingCityMpge: z.number().positive().nullable(),
    chargeDepletingHighwayMpge: z.number().positive().nullable(),
    /** The share of miles SAE expects on battery rather than fuel. A PHEV's blended MPG cannot be interpreted without it. */
    combinedUtilityFactor: UtilityFactor,
    cityUtilityFactor: UtilityFactor,
    highwayUtilityFactor: UtilityFactor,

    // -- Cost -----------------------------------------------------------
    /** EPA's published estimated annual fuel cost, in whole US dollars. */
    annualFuelCostUsd: z.number().positive().nullable(),
    altAnnualFuelCostUsd: z.number().positive().nullable(),
    /**
     * EPA's 5-year fuel cost saved (positive) or **spent** (negative) versus
     * an average new vehicle. Deliberately unbounded on both sides: 498 of
     * 853 records are negative and 49 are exactly 0. Constraining this to
     * positive values would drop exactly the thirstiest vehicles -- the ones
     * a cost-conscious shopper most needs to see -- and treating 0 as
     * missing would erase the genuine break-even case (a vehicle costing
     * precisely the average, which is what those 49 records are).
     */
    fiveYearSavingsVsAverageUsd: z.number().int().nullable(),
    /** Gas guzzler tax band where one applies. Absent across the whole current curated set, which is the honest answer rather than a reason to drop the column. */
    gasGuzzlerTax: z.string().max(50).nullable(),

    // -- Emissions and environment --------------------------------------
    fuelEconomyScore: EpaScore,
    greenhouseGasScore: EpaScore,
    altGreenhouseGasScore: EpaScore,
    /**
     * Tailpipe CO2 in grams per mile. `.nonnegative()`, not `.positive()`:
     * 0 is the true, measured figure for a battery EV (58 records, every one
     * `alternativeTechnology === "EV"`). An earlier revision rejected it as
     * "missing", so every EV in the catalog reported unknown emissions --
     * erasing the single strongest number an EV has.
     */
    co2GramsPerMile: z.number().nonnegative().nullable(),
    /**
     * Same units, for the second fuel of a dual-fuel vehicle, and
     * `.nonnegative()` for the same reason: on a plug-in hybrid whose
     * second fuel is electricity, 0 g/mi is real. It is `null` -- not 0 --
     * on the ~98% of the catalog with no second fuel at all, where EPA also
     * stores 0.0 but means "not applicable".
     */
    altCo2GramsPerMile: z.number().nonnegative().nullable(),
    /** Annual petroleum consumption in barrels. Small but nonzero even for an EV, because of upstream generation. */
    annualPetroleumBarrels: z.number().nonnegative().nullable(),
    altAnnualPetroleumBarrels: z.number().nonnegative().nullable(),

    // -- Interior volume -------------------------------------------------
    // EPA splits interior volume across three body-style-specific column
    // pairs and populates exactly one pair per vehicle. The unified pair is
    // what consumers want; the raw pairs are retained so a consumer can
    // still tell which measurement standard produced the figure.
    passengerVolumeCuFt: VolumeCuFt,
    luggageVolumeCuFt: VolumeCuFt,
    passengerVolume4DoorCuFt: VolumeCuFt,
    passengerVolume2DoorCuFt: VolumeCuFt,
    passengerVolumeHatchbackCuFt: VolumeCuFt,
    luggageVolume4DoorCuFt: VolumeCuFt,
    luggageVolume2DoorCuFt: VolumeCuFt,
    luggageVolumeHatchbackCuFt: VolumeCuFt,

    // -- Provenance -------------------------------------------------------
    source: z
      .object({
        dataset: z.string().min(1),
        recordId: z.string().min(1),
        epaEngineId: z.string().max(50).nullable(),
        manufacturerCode: z.string().max(50).nullable(),
        /** ISO `YYYY-MM-DD`. When EPA first published and last revised this record -- real freshness signal for Sift's evidence model. */
        createdOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        modifiedOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable(),
        /** Whether EPA holds owner-reported real-world MPG, i.e. whether the published figure has been checked against drivers rather than only a dynamometer. */
        hasUserMpgData: z.boolean().nullable(),
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
