/**
 * Fixture tool: "safety/reliability source lookup"
 * (docs/specs/packs-and-routing.md "Choose Our Next Car Decision Pack" ->
 * "Skills, specialists, and tools").
 *
 * Given a candidate id, returns every safety/reliability claim recorded for
 * it in `safety-reliability-sources.json`, each with real source provenance
 * (publisher, report title, URL, retrieval date), plus the fixture's own
 * explicit `disagreements` for that candidate.
 *
 * Evidence-level assignment rule: each claim comes from exactly one
 * traceable published report, so it is individually tagged `E1` ("one
 * traceable source or deterministic extraction", packs-and-routing.md) --
 * the same per-fact rule used by `listing-reader.ts`. When two or more
 * independent, agreeing sources cover the same candidate,
 * `packages/core`'s `achievedEvidenceLevel` can synthesize `E2` for the
 * `car.safety_reliability` obligation (which requires `E2`) from that
 * corroboration, without this tool asserting `E2` itself.
 *
 * The one candidate with a genuine disagreement (`candidate-outback`,
 * `reliability`: `source-consumer-drive-index` says "Above Average",
 * `source-autotrust-reliability-survey` says "Below Average") is never
 * resolved by silently preferring one source: both claims are returned
 * verbatim, the disagreement itself is surfaced in `disagreements`, and
 * both conflicting evidence items are tagged `verdict: 'degraded'` (not
 * `pass`) -- packs-and-routing.md: "A non-stale `error` or `degraded`
 * evidence result blocks completion for that obligation", which is exactly
 * the right outcome for an unresolved conflict the fixture itself marks
 * `requiresSourceChallengeReview: true` (strands-runtime.md: "`source-
 * challenger` evaluates provenance, recency, contradictions, and claim
 * support before submitted research can satisfy an obligation").
 */
import { loadFixture } from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const SAFETY_RELIABILITY_LOOKUP_TOOL_ID = 'safety-reliability-lookup';

export interface SafetyReliabilityClaim {
  category: string;
  rating: string;
  notes: string;
  sourceId: string;
  publisher: string;
  reportTitle: string;
  url: string;
  retrievedAt: string;
  publishedAt: string;
}

export interface SafetyReliabilityDisagreement {
  category: string;
  sourceIdA: string;
  ratingA: string;
  sourceIdB: string;
  ratingB: string;
  natureOfConflict: string;
  requiresSourceChallengeReview: boolean;
}

export interface SafetyReliabilityResult {
  candidateId: string;
  claims: SafetyReliabilityClaim[];
  disagreements: SafetyReliabilityDisagreement[];
  evidence: ToolEvidenceItem[];
}

export interface SafetyReliabilityLookupInput {
  candidateId: string;
  signal?: AbortSignal;
}

export function lookupSafetyReliability(
  input: SafetyReliabilityLookupInput,
): ToolResult<SafetyReliabilityResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(SAFETY_RELIABILITY_LOOKUP_TOOL_ID);
  }

  const fixture = loadFixture('safety-reliability-sources');

  if (isAborted(input.signal)) {
    return cancelledResult(SAFETY_RELIABILITY_LOOKUP_TOOL_ID);
  }

  const findings = fixture.findings.filter((finding) => finding.candidateId === input.candidateId);
  if (findings.length === 0) {
    return notFoundResult(
      SAFETY_RELIABILITY_LOOKUP_TOOL_ID,
      input.candidateId,
      `no safety/reliability findings for candidate "${input.candidateId}"`,
    );
  }

  const sourceById = new Map(fixture.sources.map((source) => [source.sourceId, source] as const));
  const disagreements = fixture.disagreements.filter(
    (disagreement) => disagreement.candidateId === input.candidateId,
  );
  const disputedSourceIds = new Set<string>();
  for (const disagreement of disagreements) {
    disputedSourceIds.add(disagreement.sourceIdA);
    disputedSourceIds.add(disagreement.sourceIdB);
  }

  const claims: SafetyReliabilityClaim[] = [];
  const evidence: ToolEvidenceItem[] = [];

  for (const finding of findings) {
    // Non-null: `SafetyReliabilitySourcesSchema`'s `superRefine` (in
    // fixture-loader.ts) already rejects any fixture where a finding's
    // `sourceId` does not resolve to a declared source, so `loadFixture`
    // above would have thrown before this loop could ever see a dangling
    // reference -- there is no second "what if it's missing" branch to
    // handle here.
    const source = sourceById.get(finding.sourceId)!;

    claims.push({
      category: finding.category,
      rating: finding.rating,
      notes: finding.notes,
      sourceId: finding.sourceId,
      publisher: source.publisherName,
      reportTitle: source.reportTitle,
      url: source.url,
      retrievedAt: source.retrievedAt,
      publishedAt: source.publishedAt,
    });

    evidence.push({
      sourceId: finding.sourceId,
      level: 'E1',
      verdict: disputedSourceIds.has(finding.sourceId) ? 'degraded' : 'pass',
      summary: `${source.publisherName}: ${finding.category} rated "${finding.rating}" (${finding.notes}).`,
    });
  }

  return okResult(SAFETY_RELIABILITY_LOOKUP_TOOL_ID, {
    candidateId: input.candidateId,
    claims,
    disagreements: disagreements.map((disagreement) => ({
      category: disagreement.category,
      sourceIdA: disagreement.sourceIdA,
      ratingA: disagreement.ratingA,
      sourceIdB: disagreement.sourceIdB,
      ratingB: disagreement.ratingB,
      natureOfConflict: disagreement.natureOfConflict,
      requiresSourceChallengeReview: disagreement.requiresSourceChallengeReview,
    })),
    evidence,
  });
}
