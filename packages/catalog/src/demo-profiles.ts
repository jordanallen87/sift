/**
 * The curated hero cohort: decision-relevant fields the EPA source does not
 * carry, supplied for eight models and labelled as what they are.
 *
 * ## Why this file exists at all
 *
 * `vehicle-catalog.json` is real, bundled, offline EPA-derived data — 853
 * model/year/trim records across 83 fields — and it is the genuine discovery
 * universe. It carries make, model, year, trim, body style, drivetrain,
 * powertrain, fuel economy, annual fuel cost, emissions and range.
 *
 * It carries none of the things a family actually decides on. No cargo
 * dimensions. No child-seat layout. No safety or reliability rating. No
 * ownership cost. No price, of any kind. On the very SUVs a family would
 * shortlist, even `passengerVolumeCuFt` and `luggageVolumeCuFt` are null.
 *
 * So the choice is between a demo that discovers honestly and then has
 * nothing to say, or one that discovers honestly and then enriches a small,
 * stable cohort with clearly-labelled illustrative detail. This is the
 * second, and the labelling is the part that makes it honest.
 *
 * ## The three rules this module keeps
 *
 * 1. **Enrichment attaches to real records.** Every profile is keyed to a
 *    `catalogRecordId` that exists in the bundled catalog. A curated profile
 *    cannot introduce a vehicle that discovery could not find.
 *
 * 2. **Identity never changes.** `enrichWithDemoProfile` adds fields to a
 *    discovered record; it does not replace it. The hero journey is a
 *    genuinely discovered catalog record that later gained detail, not a
 *    seeded case wearing a discovered record's name.
 *
 * 3. **Every field says where it came from.** `provenanceByField` labels each
 *    field `catalog` or `curated_demo`, so the pane can mark the difference
 *    rather than presenting one indistinguishable blob.
 *
 * There is deliberately no field for a price, a dealer, or an availability.
 * `indicativePriceBandUsd` is a rough national band for a model at a trim
 * level — the strongest price claim this data can support — and it is
 * curated like everything else here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { VehicleCatalogRecord } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROFILES_PATH = join(__dirname, '..', 'data', 'vehicle-demo-profiles.json');

/** Defensive bound. The real file is a few tens of kilobytes; this stops a corrupted or hostile one. */
export const MAX_PROFILES_BYTES = 2_000_000;

export class DemoProfileLoadError extends Error {
  constructor(message: string) {
    super(`demo profiles: ${message}`);
    this.name = 'DemoProfileLoadError';
  }
}

/**
 * A qualitative rating. `disputed` is a first-class value rather than an
 * absence: two sources disagreeing is a different, and more useful, fact
 * than nobody having looked.
 */
export const DEMO_RATINGS = ['excellent', 'good', 'adequate', 'poor', 'disputed'] as const;
export type DemoRating = (typeof DEMO_RATINGS)[number];

export const DemoProfileSchema = z
  .object({
    catalogRecordId: z.string().min(1),
    displayName: z.string().min(1).max(200),
    indicativePriceBandUsd: z
      .object({ low: z.number().int().positive(), high: z.number().int().positive() })
      .strict()
      .refine((band) => band.low < band.high, {
        message: 'an indicative band must actually be a band',
      }),
    seatingCapacity: z.number().int().min(1).max(15),
    rowCount: z.number().int().min(1).max(4),
    childSeatPositions: z.number().int().min(0).max(8),
    threeAcrossCarSeats: z.boolean(),
    cargoBehindSecondRowCuFt: z.number().min(0).max(300),
    cargoBedLengthIn: z.number().min(0).max(200).optional(),
    cargoWidthAtNarrowestIn: z.number().min(0).max(120),
    cargoOpeningHeightIn: z.number().min(0).max(120),
    cargoLoadFloorHeightIn: z.number().min(0).max(120),
    secondRowLegroomIn: z.number().min(0).max(80),
    groundClearanceIn: z.number().min(0).max(30),
    lengthIn: z.number().min(0).max(400),
    heightIn: z.number().min(0).max(200),
    towingCapacityLb: z.number().int().min(0).max(40_000),
    payloadCapacityLb: z.number().int().min(0).max(20_000),
    crashSafetyRating: z.enum(DEMO_RATINGS),
    driverAssistanceRating: z.enum(DEMO_RATINGS),
    reliabilityRating: z.enum(DEMO_RATINGS),
    /** Required when `reliabilityRating` is `disputed`: a disagreement the product cannot explain is a disagreement it should not assert. */
    reliabilityDispute: z.string().max(1000).optional(),
    winterCapability: z.enum(DEMO_RATINGS),
    fiveYearOwnershipCostUsd: z.number().int().min(0).max(500_000),
    annualInsuranceEstimateUsd: z.number().int().min(0).max(50_000),
    requiresHomeCharging: z.boolean().optional(),
    openBedLoad: z.boolean().optional(),
    testDriveChecks: z.array(z.string().max(300)).max(10),
    notes: z.string().max(1000),
  })
  .strict()
  .superRefine((profile, ctx) => {
    if (profile.reliabilityRating === 'disputed' && profile.reliabilityDispute === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['reliabilityDispute'],
        message: 'a disputed rating must say what the disagreement is',
      });
    }
  });
export type DemoProfile = z.infer<typeof DemoProfileSchema>;

const DemoProfileFileSchema = z
  .object({
    $comment: z.string().optional(),
    version: z.string(),
    provenance: z.literal('curated_demo'),
    disclosure: z.string().min(1).max(500),
    profiles: z.array(DemoProfileSchema).max(50),
  })
  .strict();

let cached: z.infer<typeof DemoProfileFileSchema> | undefined;

function loadFile(path: string = DEFAULT_PROFILES_PATH): z.infer<typeof DemoProfileFileSchema> {
  if (cached !== undefined && path === DEFAULT_PROFILES_PATH) return cached;

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new DemoProfileLoadError(`failed to read ${path}: ${String(error)}`);
  }

  if (Buffer.byteLength(raw, 'utf8') > MAX_PROFILES_BYTES) {
    throw new DemoProfileLoadError(
      `file exceeds the ${String(MAX_PROFILES_BYTES)}-byte defensive bound`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new DemoProfileLoadError(`file is not valid JSON: ${String(error)}`);
  }

  const result = DemoProfileFileSchema.safeParse(parsed);
  if (!result.success) {
    throw new DemoProfileLoadError(`file failed schema validation: ${result.error.message}`);
  }

  if (path === DEFAULT_PROFILES_PATH) cached = result.data;
  return result.data;
}

/** The sentence the pane renders wherever curated data is shown. */
export const DEMO_PROFILE_DISCLOSURE = loadFile().disclosure;

export function listDemoProfiles(): DemoProfile[] {
  return loadFile().profiles;
}

/** The curated profile for a catalog record, or `undefined` when there is none — which is the case for 845 of the 853 records. */
export function getDemoProfile(catalogRecordId: string): DemoProfile | undefined {
  return loadFile().profiles.find((profile) => profile.catalogRecordId === catalogRecordId);
}

/** Test-only: clears the in-memory cache. */
export function clearDemoProfileCache(): void {
  cached = undefined;
}

export type FieldProvenance = 'catalog' | 'curated_demo';

export interface EnrichedVehicle {
  /** The discovered catalog record, unchanged. Identity is never rewritten by enrichment. */
  readonly record: VehicleCatalogRecord;
  readonly profile: DemoProfile | undefined;
  readonly enriched: boolean;
  /** Field name to where that field's value came from. Drives the pane's provenance labels. */
  readonly provenanceByField: Readonly<Record<string, FieldProvenance>>;
  /** The disclosure sentence, present only when there is curated data to disclose. */
  readonly disclosure: string | undefined;
}

/**
 * Attach curated detail to a discovered record.
 *
 * The record itself is returned untouched. A caller that wants a merged view
 * reads `record` and `profile` side by side and consults `provenanceByField`
 * to label each one — which is deliberately more work than returning one
 * flattened object, because a flattened object is exactly how a curated
 * cargo width ends up looking like a measured one.
 */
export function enrichWithDemoProfile(record: VehicleCatalogRecord): EnrichedVehicle {
  const profile = getDemoProfile(record.id);
  const provenanceByField: Record<string, FieldProvenance> = {};

  for (const key of Object.keys(record)) provenanceByField[key] = 'catalog';

  if (profile !== undefined) {
    for (const key of Object.keys(profile)) {
      if (key === 'catalogRecordId') continue;
      provenanceByField[key] = 'curated_demo';
    }
  }

  return {
    record,
    profile,
    enriched: profile !== undefined,
    provenanceByField,
    disclosure: profile === undefined ? undefined : DEMO_PROFILE_DISCLOSURE,
  };
}
