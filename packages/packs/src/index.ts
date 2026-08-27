// @pax/packs -- the generic Decision Pack compiler, capability catalog,
// registry, and conformance runner. See docs/specs/pack-authoring.md
// "Compiler and registry" and docs/specs/packs-and-routing.md "Manifest
// contract" for the specification this module implements.
//
// The `car-purchase` and `home-energy-guardian` built-in pack manifests
// (and their skills/specialists/fixture tools) are separate, later work;
// this package only ships the generic machinery that compiles, resolves,
// registers, and re-verifies any Decision Pack manifest.

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
