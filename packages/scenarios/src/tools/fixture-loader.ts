/**
 * Internal loader for the car-purchase fixture JSON files under
 * `packages/scenarios/fixtures/car-purchase/`.
 *
 * Filesystem access is scoped to `packages/scenarios` deliberately --
 * `packages/core` may never read the filesystem (architecture.md
 * "Repository structure": "No file in `packages/core` may import ...
 * filesystem storage"). This package is exactly where fixture-backed tools
 * are meant to live (architecture.md: "packages/scenarios/ Fixture data,
 * scripted tools, scenario runner, and assertions").
 *
 * Every fixture file is Zod-validated end to end (architecture.md "Tool
 * inputs, outputs, model responses, and persisted snapshots are size-bounded
 * and schema-validated") and defensively size-bounded before `JSON.parse`
 * ever runs, so a corrupted or runaway fixture file fails loudly and early
 * instead of silently propagating bad data into a tool's evidence output.
 *
 * `parseFixtureJson` is a pure function over a raw string -- no disk I/O --
 * so every validation branch (oversized, malformed JSON, schema-invalid,
 * unregistered fixture name) is unit-testable directly, without needing to
 * fabricate real files on disk. `loadFixture` is the thin disk-reading +
 * in-memory-cache wrapper real tool code calls; it accepts an optional
 * `baseDir` override purely so tests can exercise its disk-read failure
 * paths (missing file, malformed content) against a temporary directory
 * without ever touching the checked-in fixtures.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));

// `src/tools/fixture-loader.ts` -> `../../fixtures/car-purchase`.
const DEFAULT_FIXTURES_DIR = join(__dirname, '..', '..', 'fixtures', 'car-purchase');

/**
 * Defensive upper bound on a single fixture file's byte size
 * (architecture.md "Tool inputs, outputs, model responses, and persisted
 * snapshots are size-bounded"). Every real car-purchase fixture is under
 * 10 KB; 2 MB is generous headroom for future fixture growth while still
 * refusing to `JSON.parse` an unbounded or runaway file.
 */
export const MAX_FIXTURE_BYTES = 2_000_000;

const MoneyAmountSchema = z
  .object({
    amount: z.number().finite(),
    currency: z.string().min(1).max(10),
  })
  .strict();

// --- candidate-listings.json ---

const CandidateListingSchema = z
  .object({
    candidateId: z.string().min(1),
    make: z.string().min(1),
    model: z.string().min(1),
    modelYear: z.number().int(),
    trim: z.string().min(1),
    bodyStyle: z.string().min(1),
    drivetrain: z.string().min(1),
    powertrain: z.string().min(1),
    advertisedPrice: MoneyAmountSchema,
    mileage: z.object({ value: z.number().finite(), unit: z.string().min(1) }).strict(),
    exteriorColor: z.string().min(1),
    vin: z.string().min(1),
    listingSourceUrl: z.url(),
    listingId: z.string().min(1),
    dealerName: z.string().min(1),
    listedAt: z.iso.date(),
    standardFeatures: z.array(z.string().min(1)).max(50),
  })
  .strict();

export const CandidateListingsSchema = z
  .object({
    _provenance: z.string(),
    caseId: z.string().min(1),
    candidates: z.array(CandidateListingSchema).max(50),
  })
  .strict();
export type CandidateListings = z.infer<typeof CandidateListingsSchema>;
export type CandidateListing = z.infer<typeof CandidateListingSchema>;

// --- dealer-offers.json ---

const MandatoryAddOnSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    amount: z.number().finite(),
    currency: z.string().min(1).max(10),
    mandatory: z.boolean(),
    note: z.string().optional(),
  })
  .strict();

const FinancingExampleSchema = z
  .object({
    description: z.string().optional(),
    apr: z.number().finite(),
    termMonths: z.number().int().positive(),
    note: z.string().optional(),
  })
  .strict();

const PriceBreakdownSchema = z
  .object({
    advertisedPrice: z.number().finite(),
    mandatoryAddOnsTotal: z.number().finite(),
    subtotalBeforeTax: z.number().finite(),
    taxableBase: z.number().finite(),
    salesTax: z.number().finite(),
    titleAndRegistrationFee: z.number().finite(),
    trueOutTheDoorPrice: z.number().finite(),
    arithmeticNote: z.string().optional(),
  })
  .strict();

const TeaserGapSchema = z
  .object({
    advertisedPrice: z.number().finite(),
    trueOutTheDoorPrice: z.number().finite(),
    gapAmount: z.number().finite(),
    gapPercentOfAdvertised: z.number().finite(),
    arithmeticNote: z.string().optional(),
    exceedsHouseholdMaxBudget: z.boolean(),
    householdMaxBudget: z.number().finite(),
    amountOverBudget: z.number().finite().optional(),
    note: z.string().optional(),
  })
  .strict();

const MonthlyPaymentEstimateSchema = z
  .object({ amount: z.number().finite(), currency: z.string().min(1).max(10), basis: z.string() })
  .strict();

const DealerOfferSchema = z
  .object({
    candidateId: z.string().min(1),
    dealerName: z.string().min(1),
    quotedAt: z.iso.date(),
    hasTeaserPriceConflict: z.boolean(),
    advertisedPrice: MoneyAmountSchema,
    advertisedFinancingExample: FinancingExampleSchema,
    mandatoryAddOns: z.array(MandatoryAddOnSchema).max(50),
    actualFinancingOffer: FinancingExampleSchema,
    priceBreakdown: PriceBreakdownSchema,
    teaserGap: TeaserGapSchema,
    downPaymentAssumed: MoneyAmountSchema,
    amountFinanced: z.number().finite(),
    estimatedMonthlyPayment: z
      .object({
        underAdvertisedTerms: MonthlyPaymentEstimateSchema.optional(),
        underActualOfferedTerms: MonthlyPaymentEstimateSchema,
        note: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export const DealerOffersSchema = z
  .object({
    _provenance: z.string(),
    caseId: z.string().min(1),
    sharedTaxAndFeeAssumptions: z
      .object({
        salesTaxRate: z.number().finite(),
        salesTaxBasis: z.string(),
        titleAndRegistrationFee: MoneyAmountSchema,
      })
      .strict(),
    offers: z.array(DealerOfferSchema).max(50),
  })
  .strict();
export type DealerOffers = z.infer<typeof DealerOffersSchema>;
export type DealerOffer = z.infer<typeof DealerOfferSchema>;

// --- ownership-assumptions.json ---

const CostWithArithmeticNoteSchema = z
  .object({
    amount: z.number().finite(),
    currency: z.string().min(1).max(10),
    arithmeticNote: z.string().optional(),
  })
  .strict();

const PowertrainClassSchema = z.enum(['gasoline', 'hybrid']);

const PerCandidateOwnershipSchema = z
  .object({
    fuelEconomyMpg: z
      .object({
        city: z.number().finite().positive(),
        highway: z.number().finite().positive(),
        combined: z.number().finite().positive(),
      })
      .strict(),
    powertrainClassForMaintenance: PowertrainClassSchema,
    annualInsurancePremium: MoneyAmountSchema,
    fiveYearRetainedValuePercent: z.number().finite().min(0).max(100),
    estimatedFiveYearFuelCost: CostWithArithmeticNoteSchema,
    estimatedFiveYearMaintenanceCost: CostWithArithmeticNoteSchema,
  })
  .strict();

export const OwnershipAssumptionsSchema = z
  .object({
    _provenance: z.string(),
    caseId: z.string().min(1),
    sharedAssumptions: z
      .object({
        note: z.string().optional(),
        ownershipHorizonYears: z.number().int().positive(),
        annualMileageMi: z.number().finite().positive(),
        fuel: z
          .object({
            regularUnleadedPricePerGallon: MoneyAmountSchema,
            priceSource: z.string().optional(),
          })
          .strict(),
        insurance: z
          .object({
            coverageProfile: z.string(),
            driverProfile: z.string(),
            note: z.string().optional(),
          })
          .strict(),
        maintenance: z
          .object({
            gasolinePowertrainCostPerMi: MoneyAmountSchema,
            hybridPowertrainCostPerMi: MoneyAmountSchema,
            note: z.string().optional(),
          })
          .strict(),
        depreciation: z.object({ methodology: z.string(), note: z.string().optional() }).strict(),
        financingBaseline: z
          .object({
            note: z.string().optional(),
            apr: z.number().finite(),
            termMonths: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
    perCandidate: z.record(z.string(), PerCandidateOwnershipSchema),
  })
  .strict();
export type OwnershipAssumptions = z.infer<typeof OwnershipAssumptionsSchema>;
export type PerCandidateOwnership = z.infer<typeof PerCandidateOwnershipSchema>;

// --- safety-reliability-sources.json ---

const SafetySourceSchema = z
  .object({
    sourceId: z.string().min(1),
    publisherName: z.string().min(1),
    reportTitle: z.string().min(1),
    url: z.url(),
    retrievedAt: z.iso.date(),
    publishedAt: z.iso.date(),
    methodologyNote: z.string().optional(),
  })
  .strict();

const SafetyFindingSchema = z
  .object({
    candidateId: z.string().min(1),
    sourceId: z.string().min(1),
    category: z.string().min(1),
    rating: z.string().min(1),
    // Required, not optional: every finding in the real fixture carries a
    // `notes` string, so this schema is tightened to match observed reality
    // rather than modeling a possibility the fixture never actually uses --
    // see safety-reliability-lookup.ts, which relies on this to avoid an
    // otherwise-untestable "no notes" branch.
    notes: z.string().min(1),
  })
  .strict();

const SafetyDisagreementSchema = z
  .object({
    candidateId: z.string().min(1),
    category: z.string().min(1),
    sourceIdA: z.string().min(1),
    ratingA: z.string().min(1),
    sourceIdB: z.string().min(1),
    ratingB: z.string().min(1),
    natureOfConflict: z.string().min(1),
    requiresSourceChallengeReview: z.boolean(),
  })
  .strict();

const SafetyReliabilitySourcesShape = z
  .object({
    _provenance: z.string(),
    caseId: z.string().min(1),
    sources: z.array(SafetySourceSchema).max(100),
    findings: z.array(SafetyFindingSchema).max(500),
    disagreements: z.array(SafetyDisagreementSchema).max(100),
  })
  .strict();

/**
 * Referential integrity beyond individual-record shape: every `sourceId`
 * a finding or disagreement cites must name a source actually declared in
 * `sources`. Enforcing this here -- once, at load time -- means every
 * consumer (`safety-reliability-lookup.ts`) can trust the join and never
 * needs its own defensive "what if this sourceId doesn't exist" branch.
 */
export const SafetyReliabilitySourcesSchema = SafetyReliabilitySourcesShape.superRefine(
  (fixture, ctx) => {
    const knownSourceIds = new Set(fixture.sources.map((source) => source.sourceId));
    fixture.findings.forEach((finding, index) => {
      if (!knownSourceIds.has(finding.sourceId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['findings', index, 'sourceId'],
          message: `finding references unknown sourceId "${finding.sourceId}"`,
        });
      }
    });
    fixture.disagreements.forEach((disagreement, index) => {
      for (const key of ['sourceIdA', 'sourceIdB'] as const) {
        if (!knownSourceIds.has(disagreement[key])) {
          ctx.addIssue({
            code: 'custom',
            path: ['disagreements', index, key],
            message: `disagreement references unknown ${key} "${disagreement[key]}"`,
          });
        }
      }
    });
  },
);
export type SafetyReliabilitySources = z.infer<typeof SafetyReliabilitySourcesSchema>;
export type SafetySource = z.infer<typeof SafetySourceSchema>;
export type SafetyFinding = z.infer<typeof SafetyFindingSchema>;
export type SafetyDisagreement = z.infer<typeof SafetyDisagreementSchema>;

// --- household-fit.json ---

const CrateDimensionsSchema = z
  .object({
    lengthIn: z.number().positive(),
    widthIn: z.number().positive(),
    heightIn: z.number().positive(),
  })
  .strict();

const ExplicitUnknownSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    status: z.literal('unknown'),
    reason: z.string().min(1),
    resolutionPath: z.string().min(1),
  })
  .strict();

const HouseholdFitCandidateSchema = z
  .object({
    knownSpecifications: z
      .object({
        source: z.string(),
        cargoWidthBetweenWheelWellsIn: z.number().positive(),
        cargoLengthSeatToLiftgateIn: z.number().positive(),
        cargoHeightFloorToCeilingIn: z.number().positive(),
        rearDoorOpeningWidthIn: z.number().positive(),
        secondRowLegroomIn: z.number().positive(),
        cargoVolumeBehindSecondRowCuFt: z.number().positive(),
        groundClearanceIn: z.number().positive(),
      })
      .strict(),
    explicitUnknowns: z.array(ExplicitUnknownSchema).max(50),
  })
  .strict();

export const HouseholdFitSchema = z
  .object({
    _provenance: z.string(),
    caseId: z.string().min(1),
    householdDogCrateProfile: z
      .object({
        note: z.string().optional(),
        crateCount: z.number().int().nonnegative(),
        eachCrateDimensionsIn: CrateDimensionsSchema,
      })
      .strict(),
    candidates: z.record(z.string(), HouseholdFitCandidateSchema),
  })
  .strict();
export type HouseholdFit = z.infer<typeof HouseholdFitSchema>;
export type HouseholdFitCandidate = z.infer<typeof HouseholdFitCandidateSchema>;
export type ExplicitUnknown = z.infer<typeof ExplicitUnknownSchema>;

// --- household-profile.json ---

export const HouseholdProfileSchema = z
  .object({
    _provenance: z.string(),
    householdId: z.string().min(1),
    displayName: z.string().min(1),
    caseId: z.string().min(1),
    members: z
      .object({
        adults: z.number().int().nonnegative(),
        children: z.number().int().nonnegative(),
        childCarSeatDetails: z
          .object({
            seatsRequired: z.number().int().nonnegative(),
            seatTypes: z.array(z.string()).max(10),
            isofixOrLatchAnchorsRequired: z.number().int().nonnegative(),
          })
          .strict(),
        dogs: z.number().int().nonnegative(),
        dogProfile: z
          .object({
            breedSizeClass: z.string(),
            combinedApproximateWeightLb: z.number().positive(),
            crateCount: z.number().int().nonnegative(),
            crateDimensionsIn: z
              .object({ eachCrate: CrateDimensionsSchema, note: z.string().optional() })
              .strict(),
          })
          .strict(),
      })
      .strict(),
    budget: z
      .object({
        maxOutTheDoorPrice: MoneyAmountSchema,
        preferredMonthlyPayment: z
          .object({
            amount: z.number().finite(),
            currency: z.string().min(1).max(10),
            cadence: z.string(),
          })
          .strict(),
        downPayment: MoneyAmountSchema,
      })
      .strict(),
    financingAssumptions: z
      .object({
        targetApr: z.number().finite(),
        targetTermMonths: z.number().int().positive(),
        creditTier: z.string(),
        note: z.string().optional(),
      })
      .strict(),
    commute: z
      .object({
        roundTripMilesPerDay: z.number().finite().nonnegative(),
        drivingMixProfile: z.string(),
        annualMileageEstimateMi: z.number().finite().positive(),
        primaryDriver: z.string(),
        secondaryDriver: z.string(),
      })
      .strict(),
    cargoAndRearSeatNeeds: z
      .object({
        rearSeatOccupantsTypical: z.string(),
        cargoUseCase: z.string(),
        cargoUseCaseResolved: z.boolean(),
        note: z.string().optional(),
      })
      .strict(),
    mustHaves: z
      .array(
        z.object({ id: z.string().min(1), label: z.string().min(1), kind: z.string() }).strict(),
      )
      .max(50),
    weightedPreferences: z
      .object({
        note: z.string().optional(),
        criteria: z
          .array(
            z
              .object({
                id: z.string().min(1),
                label: z.string().min(1),
                weight: z.number().min(0).max(1),
                direction: z.string(),
              })
              .strict(),
          )
          .max(50),
      })
      .strict(),
    _scenarioNotes: z.record(z.string(), z.string()).optional(),
  })
  .strict();
export type HouseholdProfile = z.infer<typeof HouseholdProfileSchema>;

// --- registry, pure parsing, and disk-backed loader with in-memory cache ---

const FIXTURE_SCHEMAS = {
  'candidate-listings': CandidateListingsSchema,
  'dealer-offers': DealerOffersSchema,
  'household-fit': HouseholdFitSchema,
  'household-profile': HouseholdProfileSchema,
  'ownership-assumptions': OwnershipAssumptionsSchema,
  'safety-reliability-sources': SafetyReliabilitySourcesSchema,
} as const;

export const FIXTURE_NAMES = Object.keys(FIXTURE_SCHEMAS) as FixtureName[];

export type FixtureName = keyof typeof FIXTURE_SCHEMAS;
export type FixtureData<N extends FixtureName> = z.infer<(typeof FIXTURE_SCHEMAS)[N]>;

/** Raised for any fixture load/parse/validation failure. Carries the offending fixture name for callers that want structured handling. */
export class FixtureLoadError extends Error {
  readonly fixtureName: string;

  constructor(fixtureName: string, message: string) {
    super(`fixture-loader: fixture "${fixtureName}" ${message}`);
    this.name = 'FixtureLoadError';
    this.fixtureName = fixtureName;
  }
}

/**
 * Pure validation over an already-read JSON string: size bound, `JSON.parse`,
 * then Zod schema validation. No disk I/O -- every failure branch here is
 * directly unit-testable without fabricating files on disk.
 */
export function parseFixtureJson<N extends FixtureName>(name: N, raw: string): FixtureData<N> {
  const schema = (FIXTURE_SCHEMAS as Record<string, (typeof FIXTURE_SCHEMAS)[FixtureName]>)[name];
  if (!schema) {
    throw new FixtureLoadError(name, 'has no registered schema');
  }

  if (Buffer.byteLength(raw, 'utf8') > MAX_FIXTURE_BYTES) {
    throw new FixtureLoadError(name, `exceeds the ${MAX_FIXTURE_BYTES}-byte defensive size bound`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    // `String(error)` (not `.message`) so this needs no `instanceof Error`
    // branch: it is informative for both a real `SyntaxError` (the only
    // thing `JSON.parse` actually throws) and, defensively, anything else.
    throw new FixtureLoadError(name, `is not valid JSON: ${String(error)}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new FixtureLoadError(name, `failed schema validation: ${result.error.message}`);
  }

  return result.data as FixtureData<N>;
}

export interface LoadFixtureOptions {
  /**
   * Overrides the directory `<name>.json` is read from. Defaults to the real
   * `packages/scenarios/fixtures/car-purchase` directory. Tests use this to
   * exercise disk-read failure paths against a temporary directory without
   * ever touching the checked-in fixtures.
   */
  baseDir?: string;
}

// Cache key includes baseDir so a test-supplied directory can never collide
// with (or invalidate) the real fixtures' cached entries, and repeated calls
// with the real fixtures never re-read disk.
const cache = new Map<string, unknown>();

function cacheKey(name: FixtureName, baseDir: string): string {
  return `${baseDir} ${name}`;
}

/**
 * Loads and Zod-validates one car-purchase fixture JSON file by name,
 * caching the validated result in memory so repeated tool calls in one
 * process never re-read or re-parse the file.
 */
export function loadFixture<N extends FixtureName>(
  name: N,
  options: LoadFixtureOptions = {},
): FixtureData<N> {
  const baseDir = options.baseDir ?? DEFAULT_FIXTURES_DIR;
  const key = cacheKey(name, baseDir);

  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached as FixtureData<N>;
  }

  const filePath = join(baseDir, `${name}.json`);
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new FixtureLoadError(name, `failed to read at ${filePath}: ${String(error)}`);
  }

  const data = parseFixtureJson(name, raw);
  cache.set(key, data);
  return data;
}

/** Clears every cached fixture entry. Test-only; real tool code never needs this. */
export function clearFixtureCache(): void {
  cache.clear();
}
