// @pax/packs -- the generic Decision Pack compiler, capability catalog,
// registry, and conformance runner, plus the built-in Decision Pack
// manifests. See docs/specs/pack-authoring.md "Compiler and registry" and
// docs/specs/packs-and-routing.md "Manifest contract" for the
// specification this module implements.
//
// The `home-energy-guardian` built-in pack manifest (and its skills/
// specialists/fixture tools) is separate, later work; the `car-purchase`
// manifest (this package's Tier-1 WebMCP-hero pack) ships here.

// Deterministic canonical serialization and SHA-256 hashing
// (canonicalize.ts): pack-authoring.md "Compiler and registry" step 11.
export { canonicalizeManifest, canonicalizeValue, hashManifest } from './canonicalize.js';

// Installed capability catalog and manifest-vs-catalog reference resolution
// (capability-catalog.ts): pack-authoring.md step 5.
export {
  CAPABILITY_KINDS,
  MANIFEST_REFERENCEABLE_CAPABILITY_KINDS,
  capabilityKey,
  createCapabilityCatalog,
  findCapability,
  resolveCapabilityReferences,
} from './capability-catalog.js';
export type {
  CapabilityCatalog,
  CapabilityCatalogEntry,
  CapabilityKind,
  CapabilityReference,
  CapabilityReferenceResolution,
  ManifestReferenceableCapabilityKind,
  ResolveCapabilityReferencesResult,
} from './capability-catalog.js';

// The 11-step manifest compiler (compiler.ts): pack-authoring.md "Compiler
// and registry". Per-step check functions are also exported individually
// since `conformance.ts` re-runs a subset of them against a catalog that
// may have changed since compile time.
export {
  PackCompilationError,
  checkApprovalPolicies,
  checkExtensionPolicy,
  checkUiRenderability,
  compilePack,
  validateNegativeScenarios,
  validateOrchestrationBounds,
} from './compiler.js';
export type { PackCompilationIssue } from './compiler.js';

// In-memory compiled-pack registry (registry.ts): pack-authoring.md
// "The registry stores only compiled packs ... Changing an installed pack
// creates a new version; it never mutates an existing case."
export { PackRegistry, PackRegistryConflictError } from './registry.js';

// Post-compile conformance re-verification (conformance.ts):
// docs/specs/testing.md "Decision Pack conformance tests".
export { PACK_CONFORMANCE_CHECK_IDS, runPackConformance } from './conformance.js';
export type {
  PackConformanceCheckId,
  PackConformanceCheckResult,
  PackConformanceReport,
} from './conformance.js';

// The real `car-purchase@1.0.0` Decision Pack manifest ("Choose Our Next
// Car"), the Tier-1 WebMCP-hero pack (car-purchase.ts):
// docs/specs/packs-and-routing.md "Choose Our Next Car Decision Pack".
export { CAR_PURCHASE_MANIFEST, compileCarPurchasePack } from './car-purchase.js';
