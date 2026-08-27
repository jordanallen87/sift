/**
 * `routePack(input, registry, semanticCandidates?): RoutingDecision`
 * (docs/specs/architecture.md "Deterministic core"), implementing the exact
 * algorithm in docs/specs/packs-and-routing.md "Routing algorithm".
 *
 * Judgment calls (see docs/build-log.md for the dated entry with full
 * reasoning):
 *
 * 1. Step order: the spec numbers "explicit selection" (step 1) before
 *    "pinned case" (step 2), but also says a pin "cannot be changed" --
 *    unconditionally. To make that literally true regardless of what
 *    `explicitPackId` a caller also supplies (and to satisfy the required
 *    property "a pinned case never changes pack through routing" for *any*
 *    input), this implementation checks the pin FIRST. A UI-level pack
 *    override window (before first evidence -- see packs-and-routing.md's
 *    closing paragraph) is a policy for whichever layer clears
 *    `activeCasePack` before calling the router again; it is not this
 *    function's concern.
 * 2. A pin is honored unconditionally, without registry validation -- it is
 *    returned exactly as given even if the passed-in registry snapshot
 *    happens not to contain it. In the real system a pin can only ever have
 *    been produced from a real compiled registry entry, and compiled
 *    versions are never deleted, so this is not expected to occur in
 *    practice; step 8's "reject unregistered candidates" duty is scoped to
 *    the deterministic/semantic *scoring* path (steps 3-8), not to a pin
 *    that structurally bypasses scoring under step 2.
 * 3. The deterministic signal score is a weighted average of four category
 *    match fractions (intents 0.4, keywords 0.3, artifactKinds 0.15,
 *    entitySignals 0.15 -- chosen so intents+keywords, the free-text
 *    signals, dominate over the smaller structured-array signals, while all
 *    four sum to 1.0) computed by case-insensitive substring containment
 *    (intents/keywords/exclusions against `userGoal`+`route`) or exact set
 *    membership (artifactKinds/entitySignals against the input's typed
 *    arrays). Any exclusion-phrase match multiplies the raw score by 0.1,
 *    modeling "this pack declares that concern explicitly out of scope"
 *    without fully zeroing a pack that also has other strong signals. This
 *    is deliberately a simple, fully deterministic, unit-testable heuristic
 *    -- matching the spec's own "honesty amendment" that the merge weights
 *    and thresholds are tuned constants for a two-pack catalog, not a
 *    general-purpose routing algorithm.
 * 4. A direct mathematical consequence of the given constants: since any
 *    deterministic score is bounded to [0, 1] and the deterministic weight
 *    is 0.6, a merged score computed with no semantic input at all can
 *    never exceed 0.6 -- below the 0.75 auto-select floor. Deterministic-
 *    only routing therefore always resolves to at most
 *    `needs_confirmation`/`no_match`, never `selected`, unless a semantic
 *    candidate contributes. This matches "When the model is unavailable,
 *    deterministic routing remains functional" (it still returns a usable,
 *    ranked result), without claiming it can auto-select alone.
 */
import type {
  CompiledDecisionPack,
  PackActivation,
  RoutingCandidate,
  RoutingDecision,
  RoutingInput,
} from '@pax/contracts';
import { RoutingRejectionError } from './errors.js';

/**
 * The structured shape a Strands router agent is expected to return (see
 * packs-and-routing.md step 4: "Ask a Strands router agent for structured
 * candidate IDs and semantic confidence."). Deliberately narrower than
 * `RoutingCandidate` -- the semantic step contributes only an ID/version/
 * hash triple and a confidence; `reasons`/`matchedSignals` are this
 * module's own derived presentation, not the model's to author. `routePack`
 * never calls a model itself; a caller (the Strands adapter, later) obtains
 * this list and passes it in.
 */
export interface SemanticRoutingCandidate {
  packId: string;
  version: string;
  compiledHash: string;
  confidence: number;
}

const DETERMINISTIC_WEIGHT = 0.6;
const SEMANTIC_WEIGHT = 0.4;
const AUTO_SELECT_MIN_SCORE = 0.75;
const AUTO_SELECT_MIN_MARGIN = 0.2;
const MAX_CONFIRMATION_CANDIDATES = 2;
/** Tolerance for double-precision floating point noise in threshold comparisons. */
const SCORE_EPSILON = 1e-9;

const INTENT_WEIGHT = 0.4;
const KEYWORD_WEIGHT = 0.3;
const ARTIFACT_KIND_WEIGHT = 0.15;
const ENTITY_SIGNAL_WEIGHT = 0.15;
const EXCLUSION_PENALTY_MULTIPLIER = 0.1;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Rounds to 6 decimal places, well beyond the constants' meaningful precision, to absorb binary floating-point noise before threshold comparisons. */
function roundScore(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function fraction(matchedCount: number, totalCount: number): number {
  return totalCount === 0 ? 0 : matchedCount / totalCount;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

interface DeterministicMatch {
  score: number;
  matchedSignals: string[];
  reasons: string[];
}

function computeDeterministicMatch(
  input: RoutingInput,
  activation: PackActivation,
): DeterministicMatch {
  const text = `${normalize(input.userGoal)} ${normalize(input.route)}`;
  const inputArtifactKinds = new Set(input.artifactKinds.map(normalize));
  const inputEntitySignals = new Set(input.entitySignals.map(normalize));

  const matchedIntents = activation.intents.filter((intent) => text.includes(normalize(intent)));
  const matchedKeywords = activation.keywords.filter((keyword) =>
    text.includes(normalize(keyword)),
  );
  const matchedArtifactKinds = activation.artifactKinds.filter((kind) =>
    inputArtifactKinds.has(normalize(kind)),
  );
  const matchedEntitySignals = activation.entitySignals.filter((signal) =>
    inputEntitySignals.has(normalize(signal)),
  );
  const matchedExclusions = activation.exclusions.filter((exclusion) =>
    text.includes(normalize(exclusion)),
  );

  const rawScore =
    INTENT_WEIGHT * fraction(matchedIntents.length, activation.intents.length) +
    KEYWORD_WEIGHT * fraction(matchedKeywords.length, activation.keywords.length) +
    ARTIFACT_KIND_WEIGHT * fraction(matchedArtifactKinds.length, activation.artifactKinds.length) +
    ENTITY_SIGNAL_WEIGHT * fraction(matchedEntitySignals.length, activation.entitySignals.length);

  const penalizedScore =
    matchedExclusions.length > 0 ? rawScore * EXCLUSION_PENALTY_MULTIPLIER : rawScore;

  const matchedSignals = dedupe([
    ...matchedIntents,
    ...matchedKeywords,
    ...matchedArtifactKinds,
    ...matchedEntitySignals,
  ]);

  const reasons: string[] = [
    ...matchedIntents.map((intent) => `Matched intent "${intent}"`),
    ...matchedKeywords.map((keyword) => `Matched keyword "${keyword}"`),
    ...matchedArtifactKinds.map((kind) => `Matched artifact kind "${kind}"`),
    ...matchedEntitySignals.map((signal) => `Matched entity signal "${signal}"`),
    ...matchedExclusions.map(
      (exclusion) => `Matched exclusion "${exclusion}" (confidence reduced)`,
    ),
  ];

  return { score: roundScore(clamp01(penalizedScore)), matchedSignals, reasons };
}

function findSemanticConfidence(
  pack: CompiledDecisionPack,
  semanticCandidates: readonly SemanticRoutingCandidate[],
): number {
  let best = 0;
  for (const candidate of semanticCandidates) {
    if (
      candidate.packId === pack.identity.id &&
      candidate.version === pack.identity.version &&
      candidate.compiledHash === pack.compiledHash
    ) {
      best = Math.max(best, clamp01(candidate.confidence));
    }
  }
  return best;
}

function rankCandidates(
  input: RoutingInput,
  registry: readonly CompiledDecisionPack[],
  semanticCandidates: readonly SemanticRoutingCandidate[],
): RoutingCandidate[] {
  const scored: RoutingCandidate[] = [];

  for (const pack of registry) {
    const deterministic = computeDeterministicMatch(input, pack.activation);
    const semanticConfidence = findSemanticConfidence(pack, semanticCandidates);
    const merged = roundScore(
      clamp01(DETERMINISTIC_WEIGHT * deterministic.score + SEMANTIC_WEIGHT * semanticConfidence),
    );

    // Zero-signal packs are not meaningful routing candidates; excluding
    // them keeps `needs_confirmation` from ever suggesting a completely
    // unrelated pack merely because the registry contained it.
    if (merged <= 0) {
      continue;
    }

    const reasons = [...deterministic.reasons];
    if (semanticConfidence > 0) {
      reasons.push(`Semantic router estimated confidence ${semanticConfidence.toFixed(2)}`);
    }

    scored.push({
      packId: pack.identity.id,
      version: pack.identity.version,
      compiledHash: pack.compiledHash,
      confidence: merged,
      reasons,
      matchedSignals: deterministic.matchedSignals,
    });
  }

  return scored.sort((a, b) => b.confidence - a.confidence);
}

function compareSemver(a: string, b: string): number {
  // Both inputs are always a `CompiledDecisionPack.identity.version`, which
  // the compiler guarantees matches `semverString`
  // (`^\d+\.\d+\.\d+$`, packs.ts) before it ever reaches the registry. A
  // regex-validated three-part semver always yields exactly three elements
  // from `split('.')`, so the non-null assertions below cannot fail; they
  // avoid an unreachable `?? 0` fallback branch that no valid input (or
  // realistic test) could ever exercise.
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const diff = partsA[index]! - partsB[index]!;
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function resolveInstalledPack(
  packId: string,
  registry: readonly CompiledDecisionPack[],
): CompiledDecisionPack | undefined {
  return registry
    .filter((pack) => pack.identity.id === packId)
    .reduce<CompiledDecisionPack | undefined>((latest, candidate) => {
      if (latest === undefined) {
        return candidate;
      }
      return compareSemver(candidate.identity.version, latest.identity.version) > 0
        ? candidate
        : latest;
    }, undefined);
}

function explicitSelectionDecision(pack: CompiledDecisionPack): RoutingDecision {
  const selected: RoutingCandidate = {
    packId: pack.identity.id,
    version: pack.identity.version,
    compiledHash: pack.compiledHash,
    confidence: 1,
    reasons: ['User selected this Decision Pack'],
    matchedSignals: [],
  };
  return { kind: 'selected', selected, candidates: [] };
}

function pinnedDecision(pin: NonNullable<RoutingInput['activeCasePack']>): RoutingDecision {
  const selected: RoutingCandidate = {
    packId: pin.id,
    version: pin.version,
    compiledHash: pin.compiledHash,
    confidence: 1,
    reasons: ['Case is pinned to this Decision Pack; routing cannot change it'],
    matchedSignals: [],
  };
  return { kind: 'selected', selected, candidates: [] };
}

export function routePack(
  input: RoutingInput,
  registry: readonly CompiledDecisionPack[],
  semanticCandidates: readonly SemanticRoutingCandidate[] = [],
): RoutingDecision {
  // Step 2 (checked before step 1 -- see the module-level judgment-call
  // comment #1): a pinned case is returned unconditionally.
  if (input.activeCasePack !== undefined) {
    return pinnedDecision(input.activeCasePack);
  }

  // Step 1: an explicit selection of an installed pack wins immediately.
  if (input.explicitPackId !== undefined) {
    const explicit = resolveInstalledPack(input.explicitPackId, registry);
    if (explicit !== undefined) {
      return explicitSelectionDecision(explicit);
    }
  }

  // Steps 3-8: deterministic + semantic scoring merge, auto-select
  // thresholds, bounded confirmation candidates, registry-only output.
  const ranked = rankCandidates(input, registry, semanticCandidates);
  const [top, ...rest] = ranked;

  if (top === undefined) {
    return { kind: 'no_match', selected: null, candidates: [] };
  }

  const secondScore = rest[0]?.confidence ?? 0;
  const meetsMinimumScore = top.confidence >= AUTO_SELECT_MIN_SCORE - SCORE_EPSILON;
  const meetsMinimumMargin = top.confidence - secondScore >= AUTO_SELECT_MIN_MARGIN - SCORE_EPSILON;

  if (meetsMinimumScore && meetsMinimumMargin) {
    return { kind: 'selected', selected: top, candidates: [] };
  }

  return {
    kind: 'needs_confirmation',
    selected: null,
    candidates: ranked.slice(0, MAX_CONFIRMATION_CANDIDATES),
  };
}

/**
 * Resolves a `RoutingDecision` to its single selected candidate, throwing a
 * `RoutingRejectionError` when routing did not conclusively resolve to one
 * pack (`needs_confirmation` or `no_match`). A convenience for later
 * callers (a command handler, the reducer integration layer) that require
 * a definite pack before proceeding and want the shared error taxonomy
 * rather than re-deriving this check themselves.
 */
export function resolveSelectedPack(decision: RoutingDecision): RoutingCandidate {
  if (decision.kind !== 'selected' || decision.selected === null) {
    throw new RoutingRejectionError(
      `Routing did not resolve to a single Decision Pack (kind: "${decision.kind}").`,
      { details: { kind: decision.kind, candidateCount: decision.candidates.length } },
    );
  }
  return decision.selected;
}
