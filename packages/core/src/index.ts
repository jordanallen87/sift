// @sift/core — pure Sift case reducer, routing, obligations, evidence,
// readiness, and policy engine. No React, Express, Strands, model provider,
// filesystem, or ambient Date.now()/Math.random()/crypto.randomUUID() calls;
// see docs/specs/architecture.md ("No file in packages/core may import
// React, Express, Strands, a model provider, or filesystem storage") and
// CLAUDE.md's Clock/IdGenerator port requirement.
//
// This file is built up incrementally by several parallel build tasks; each
// adds only its own module's re-exports here rather than overwriting
// others'. See docs/superpowers/plans/2026-08-26-pax-hackathon-build.md for
// the task map.

// Shared domain error taxonomy (errors.ts).
export {
  SiftDomainError,
  PolicyViolationError,
  RoutingRejectionError,
  ValidationFailedError,
  isSiftDomainError,
} from './errors.js';
export type { SiftDomainErrorOptions } from './errors.js';

// Decision Pack routing (routing.ts): docs/specs/packs-and-routing.md
// "Routing algorithm".
export { routePack, resolveSelectedPack } from './routing.js';
export type { SemanticRoutingCandidate } from './routing.js';

// Canonical Clock/IdGenerator ports (ports.ts), added during the Task 2
// integration pass -- see that file's header comment for why this replaces
// the previously-re-exported (and, for IdGenerator, actually incompatible)
// copy from policy.ts. Every sibling module in this package still declares
// its own local copy; those are harmless (Clock) or unused-in-practice
// (policy.ts's differently-shaped IdGenerator) duplication, left as-is
// rather than risk regressing already-green, fully-tested files. New code
// should import from here.
export type { Clock, IdGenerator } from './ports.js';

// Human-only proposal review policy and the model-adaptability boundary
// (policy.ts): docs/specs/architecture.md "Security and authority",
// docs/specs/pack-authoring.md "Three-layer adaptability model".
export {
  MODEL_PERMITTED_CHANGE_KINDS,
  MODEL_PROHIBITED_CHANGE_KINDS,
  isModelPermittedChange,
  reviewProposal,
} from './policy.js';
export type {
  ModelChangeKind,
  ModelPermittedChangeKind,
  ModelProhibitedChangeKind,
} from './policy.js';

// Typed attribute protocol (attributes.ts): docs/specs/pack-authoring.md
// "Typed core with extensible domain data".
//
// Note for the integration pass: `attributes.ts` (like `evidence.ts`) also
// declares its own structurally-identical `Clock`/`IdGenerator` port
// interfaces — none of `packages/contracts/src` defines one, and each
// parallel workstream was told to define a minimal one if missing. They are
// structurally interchangeable (any concrete implementation satisfies all
// copies), so this barrel re-exports only `policy.ts`'s `Clock`/
// `IdGenerator` above to avoid a duplicate-export error; import
// `attributes.ts`'s copies directly from that file if ever needed by name.
export type { DomainResult, ComparisonOutcome, CreateAttributeRecordInput } from './attributes.js';
export {
  ok,
  fail,
  normalizeAttributeValue,
  compareAttributeValues,
  attributeValueStatusInvariantError,
  createAttributeRecord,
} from './attributes.js';

// Case extensions (extensions.ts): docs/specs/pack-authoring.md
// "Case-defined attributes" and "Case-specific questions to resolve".
export type {
  CaseAttributeDraft,
  CreateCaseAttributeDefinitionContext,
  DefineCaseExtensionContext,
  DefineCaseExtensionPorts,
} from './extensions.js';
export {
  createCaseAttributeDefinition,
  createCaseExtension,
  defineCaseExtension,
  isConfirmedExtension,
  reviewCaseExtension,
  toCaseExtensionSummary,
} from './extensions.js';

// Extensible criteria (criteria.ts): docs/specs/pack-authoring.md
// "Extensible criteria".
export type {
  CriterionAddInput,
  ReweightCriterionOptions,
  NormalizedCriterionWeight,
  ExistingEvidenceSignal,
} from './criteria.js';
export {
  addCriterion,
  removeCriterion,
  renameCriterion,
  reweightCriterion,
  normalizeCriterionWeights,
  criterionNeedsEvidenceQuestion,
} from './criteria.js';

// Live obligation derivation, deterministic next-obligation selection, and
// attempt-budget tracking (obligations.ts): docs/specs/architecture.md
// `deriveObligations`/`selectNextObligation`, docs/specs/packs-and-routing.md
// "Obligation template", docs/specs/strands-runtime.md "Engine loop".
//
// `obligations.ts` also re-exports `evidence.ts`'s `Clock`/`IdGenerator`
// (structurally identical to `policy.ts`'s copies already re-exported
// above), so — same reasoning as the attributes.ts note above — this barrel
// does not re-export them a second time from here to avoid a duplicate-export
// error; they are available by importing `./obligations.js` or
// `./evidence.js` directly if ever needed by name.
export type { CaseExtensionObligationTemplate, ObligationSelection } from './obligations.js';
export {
  deriveObligations,
  selectNextObligation,
  recordObligationAttempt,
  resolveObligationStatus,
  advanceObligation,
} from './obligations.js';

// Evidence-level calculation, staleness, and fail-closed verdict handling
// (evidence.ts): docs/specs/packs-and-routing.md "Obligation template"
// (E0-E3 evidence levels, the fail-closed error/degraded rule).
export type {
  EvidenceContext,
  StalenessTriggerKind,
  StalenessTrigger,
  StalenessImpact,
  StalenessCriterion,
  StalenessContext,
} from './evidence.js';
export {
  evidenceLevelRank,
  isAuthoritativeSource,
  sourcesAreIndependent,
  hasBlockingEvidenceIssue,
  achievedEvidenceLevel,
  meetsRequiredEvidenceLevel,
  markStale,
  findStalenessImpact,
} from './evidence.js';

// Readiness aggregation (readiness.ts): docs/specs/architecture.md
// `evaluateReadiness`, docs/specs/product.md "Readiness" region. The single
// most safety-critical export in this package — see the file-level comment
// in readiness.ts for the named CaseState/Criterion confirmation-visibility
// gap this function defends against as best it can from inside `CaseState`
// alone.
export type { ReadinessResult } from './readiness.js';
export { evaluateReadiness } from './readiness.js';

// Reducer integration layer (reducer.ts, create-case.ts), added while
// building `apps/agent`'s case store/command service. Commit 1a2d980
// ("feat: wire sift core into applyCaseEvent/instantiateCase") introduced
// both modules but never added their barrel re-exports here — every other
// `packages/core` module is re-exported from this file, and `apps/agent`
// (per docs/specs/architecture.md "Deterministic core") can only reach
// `applyCaseEvent`/`instantiateCase` through `@sift/core`'s public surface
// (`main`/`types` both point at this file), not by deep-importing
// `@sift/core/src/reducer.js` directly. Additive fix, following this file's
// own stated pattern ("each adds only its own module's re-exports here
// rather than overwriting others'").
export { applyCaseEvent } from './reducer.js';
export { instantiateCase } from './create-case.js';
export type { PackSelection } from './create-case.js';
