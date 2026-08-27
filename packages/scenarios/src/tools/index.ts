// @pax/scenarios/tools — deterministic, read-only car-purchase fixture tools
// (docs/specs/packs-and-routing.md "Choose Our Next Car Decision Pack" ->
// "Skills, specialists, and tools": "Fixture tools: listing/offer reader,
// specification lookup, safety/reliability source lookup, ownership
// calculator, household-fit matrix"), plus the internal fixture-loading
// helper they all share.

export {
  loadFixture,
  parseFixtureJson,
  clearFixtureCache,
  FIXTURE_NAMES,
  MAX_FIXTURE_BYTES,
  FixtureLoadError,
  CandidateListingsSchema,
  DealerOffersSchema,
  OwnershipAssumptionsSchema,
  SafetyReliabilitySourcesSchema,
  HouseholdFitSchema,
  HouseholdProfileSchema,
} from './fixture-loader.js';
export type {
  FixtureName,
  FixtureData,
  LoadFixtureOptions,
  CandidateListings,
  CandidateListing,
  DealerOffers,
  DealerOffer,
  OwnershipAssumptions,
  PerCandidateOwnership,
  SafetyReliabilitySources,
  SafetySource,
  SafetyFinding,
  SafetyDisagreement,
  HouseholdFit,
  HouseholdFitCandidate,
  ExplicitUnknown,
  HouseholdProfile,
} from './fixture-loader.js';

export { isAborted, okResult, notFoundResult, cancelledResult } from './tool-result.js';
export type {
  ToolEvidenceItem,
  ToolResultStatus,
  ToolOkResult,
  ToolNotFoundResult,
  ToolCancelledResult,
  ToolResult,
} from './tool-result.js';

export { LISTING_READER_TOOL_ID, readListing, budgetComparisonSentence } from './listing-reader.js';
export type {
  MoneyAmount,
  CandidateListingFacts,
  CandidateDealerOfferFacts,
  CandidateListingResult,
  ListingReaderInput,
} from './listing-reader.js';

export {
  OWNERSHIP_CALCULATOR_TOOL_ID,
  calculateOwnershipCost,
  computeAmortizedFinancing,
} from './ownership-calculator.js';
export type {
  FuelComponent,
  MaintenanceComponent,
  InsuranceComponent,
  DepreciationComponent,
  FinancingComponent,
  OwnershipCostComponents,
  OwnershipCostResult,
  OwnershipCalculatorInput,
} from './ownership-calculator.js';

export {
  SAFETY_RELIABILITY_LOOKUP_TOOL_ID,
  lookupSafetyReliability,
} from './safety-reliability-lookup.js';
export type {
  SafetyReliabilityClaim,
  SafetyReliabilityDisagreement,
  SafetyReliabilityResult,
  SafetyReliabilityLookupInput,
} from './safety-reliability-lookup.js';

export { HOUSEHOLD_FIT_MATRIX_TOOL_ID, lookupHouseholdFit } from './household-fit-matrix.js';
export type {
  KnownHouseholdFitFact,
  HouseholdFitUnknown,
  HouseholdFitResult,
  HouseholdFitMatrixInput,
} from './household-fit-matrix.js';
