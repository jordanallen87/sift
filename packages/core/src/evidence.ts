/**
 * Evidence-level calculation, staleness, and fail-closed verdict handling.
 *
 * Grounded in docs/specs/packs-and-routing.md's "Obligation template"
 * section (the E0-E3 evidence-level definitions and "A non-stale `error` or
 * `degraded` evidence result blocks completion for that obligation. Failed
 * and skipped results remain visible but do not raise evidence level.") and
 * docs/specs/testing.md's evidence bullets ("evidence levels, source
 * independence, staleness, fail-closed verdicts, and convergence").
 *
 * This module is pure: every function is a plain data transform over
 * `@sift/contracts` types plus the injected `Clock` port declared below. It
 * imports nothing from `attributes.ts`/`extensions.ts`/`criteria.ts` or
 * `routing.ts`/`policy.ts`/`errors.ts` (sibling files owned by two other
 * concurrent build tasks).
 */
import type { Claim, EvidenceLevel, EvidenceLink, ObligationState, Source } from '@sift/contracts';

/**
 * Minimal injected time port. `packages/core` may never call `Date.now()`
 * directly (docs/engineering-principles.md "Hard constraint"); every timestamp in this file comes
 * from an implementation of this port supplied by the caller.
 *
 * Note for the later integration pass: a sibling agent building
 * `attributes.ts` in this same package independently declared a
 * structurally-identical `Clock` interface (`now(): string`) there. This
 * file cannot import from that file (explicit task boundary for this build
 * task), so it declares its own copy rather than leaving `markStale`
 * without a time source. The two declarations are structurally
 * interchangeable -- any concrete `Clock` satisfies both -- but the barrel
 * `index.ts` can only re-export one binding named `Clock` via `export *`;
 * this is flagged in docs/build-log.md for whoever wires the final
 * `reducer.ts` to consolidate into one shared ports module if desired.
 */
export interface Clock {
  now(): string;
}

/**
 * Minimal injected ID-generation port, declared for the same reason as
 * `Clock` above and for the same docs/engineering-principles.md hard constraint (no
 * `crypto.randomUUID()`). Nothing in this file currently needs to mint a new
 * ID -- `markStale` transforms an existing `EvidenceLink`, it does not create
 * one -- but the port is declared here so any future function in this module
 * has one available without reaching for a forbidden primitive.
 */
export interface IdGenerator {
  next(prefix?: string): string;
}

const EVIDENCE_LEVEL_RANK: Record<EvidenceLevel, 0 | 1 | 2 | 3> = {
  E0: 0,
  E1: 1,
  E2: 2,
  E3: 3,
};

/** Ordinal rank for an evidence level, `E0` (0) through `E3` (3). */
export function evidenceLevelRank(level: EvidenceLevel): 0 | 1 | 2 | 3 {
  return EVIDENCE_LEVEL_RANK[level];
}

const RANK_TO_EVIDENCE_LEVEL: Record<0 | 1 | 2 | 3, EvidenceLevel> = {
  0: 'E0',
  1: 'E1',
  2: 'E2',
  3: 'E3',
};

/**
 * "Authoritative source" (packs-and-routing.md E2: "corroborated by two
 * independent sources or one authoritative source").
 *
 * Judgment call: the shared `Source` schema (packages/contracts/src/case.ts)
 * has no dedicated `authoritative` flag. This treats
 * `Source.verification === 'verified'` as the authoritative signal: a source
 * that has already passed the product's own challenge/verification workflow
 * (webmcp.md `sift_set_evidence_disposition`; the `source-challenger`
 * specialist in packs-and-routing.md) is exactly the kind of source strong
 * enough to satisfy E2 on its own. `Source.origin` (`fixture` /
 * `user_submitted` / `agent_discovered`) describes provenance, not
 * reliability, so it is deliberately not used for this signal.
 */
export function isAuthoritativeSource(source: Source): boolean {
  return source.verification === 'verified';
}

/**
 * "Two independent sources" (packs-and-routing.md E2).
 *
 * Judgment call: independence requires distinct `Source.id`s and, when both
 * sources declare a `publisher`, distinct publishers too -- two URLs
 * republished by the same publisher should not count as independent
 * corroboration. A source missing `publisher` cannot be excluded from
 * independence on that basis alone (there is nothing to compare).
 */
export function sourcesAreIndependent(a: Source, b: Source): boolean {
  if (a.id === b.id) {
    return false;
  }
  if (a.publisher !== undefined && b.publisher !== undefined) {
    return a.publisher !== b.publisher;
  }
  return true;
}

function relevantClaims(claims: readonly Claim[], obligationId: string): Claim[] {
  return claims.filter((claim) => claim.obligationId === obligationId && !claim.stale);
}

/**
 * Only `included`, non-stale, `pass`-verdict links count toward an achieved
 * evidence level. `disposition !== 'included'` means a human has already
 * excluded or questioned the item (testing.md property: "removing included
 * evidence cannot increase readiness"); `stale` means it has been
 * superseded; any verdict other than `pass` never raises evidence level per
 * packs-and-routing.md.
 */
function passingIncludedLinks(
  links: readonly EvidenceLink[],
  obligationId: string,
): EvidenceLink[] {
  return links.filter(
    (link) =>
      link.obligationId === obligationId &&
      link.disposition === 'included' &&
      !link.stale &&
      link.verdict === 'pass',
  );
}

/**
 * "A non-stale `error` or `degraded` evidence result blocks completion for
 * that obligation" (packs-and-routing.md). Only `included`, non-stale links
 * can block: an excluded/questioned error result has already been
 * dispositioned away by a human and no longer blocks anything; a stale one
 * has already been superseded by later evidence.
 */
export function hasBlockingEvidenceIssue(
  obligationId: string,
  evidenceLinks: readonly EvidenceLink[],
): boolean {
  return evidenceLinks.some(
    (link) =>
      link.obligationId === obligationId &&
      link.disposition === 'included' &&
      !link.stale &&
      (link.verdict === 'error' || link.verdict === 'degraded'),
  );
}

export interface EvidenceContext {
  claims: readonly Claim[];
  evidenceLinks: readonly EvidenceLink[];
  sources: readonly Source[];
}

function hasSourceId(link: EvidenceLink): link is EvidenceLink & { sourceId: string } {
  return link.sourceId !== undefined;
}

function hasIndependentSourcePair(
  links: readonly (EvidenceLink & { sourceId: string })[],
  sourceById: ReadonlyMap<string, Source>,
): boolean {
  return links.some((linkA, index) => {
    const sourceA = sourceById.get(linkA.sourceId);
    if (!sourceA) {
      return false;
    }
    return links.slice(index + 1).some((linkB) => {
      const sourceB = sourceById.get(linkB.sourceId);
      return sourceB !== undefined && sourcesAreIndependent(sourceA, sourceB);
    });
  });
}

/**
 * The highest evidence level an obligation's currently-included, non-stale,
 * passing evidence achieves, or `null` when there is none at all.
 *
 * - A `Claim` alone (no corroborating `EvidenceLink`) can only ever establish
 *   `E0` -- "unverified statement or user-provided assertion".
 * - Each qualifying `EvidenceLink` contributes its own tagged `level`
 *   directly: `E1`/`E3` producers (fixture tools, deterministic checks,
 *   human attestation) are trusted to tag their own output correctly. This
 *   function does not re-derive `E1` or `E3` from first principles.
 * - `E2` is additionally *synthesized* even when every individual link is
 *   only tagged `E1`, whenever either (a) two of them cite independent
 *   sources (`sourcesAreIndependent`), or (b) one of them cites an
 *   authoritative source (`isAuthoritativeSource`) -- the literal "two
 *   independent sources or one authoritative source" rule.
 */
export function achievedEvidenceLevel(
  context: EvidenceContext,
  obligationId: string,
): EvidenceLevel | null {
  let bestRank: 0 | 1 | 2 | 3 | null = null;
  const consider = (rank: 0 | 1 | 2 | 3): void => {
    if (bestRank === null || rank > bestRank) {
      bestRank = rank;
    }
  };

  if (relevantClaims(context.claims, obligationId).length > 0) {
    consider(0);
  }

  const links = passingIncludedLinks(context.evidenceLinks, obligationId);
  for (const link of links) {
    consider(evidenceLevelRank(link.level));
  }

  const sourceById = new Map(context.sources.map((source) => [source.id, source] as const));
  const sourcedE1PlusLinks = links
    .filter(hasSourceId)
    .filter((link) => evidenceLevelRank(link.level) >= 1);

  const hasAuthoritative = sourcedE1PlusLinks.some((link) => {
    const source = sourceById.get(link.sourceId);
    return source !== undefined && isAuthoritativeSource(source);
  });
  if (hasAuthoritative) {
    consider(2);
  }

  if (hasIndependentSourcePair(sourcedE1PlusLinks, sourceById)) {
    consider(2);
  }

  return bestRank === null ? null : RANK_TO_EVIDENCE_LEVEL[bestRank];
}

/**
 * Whether an obligation's accumulated, currently-included evidence meets its
 * `requiredEvidenceLevel`. Fail-closed: a blocking `error`/`degraded` result
 * always overrides an otherwise-sufficient level.
 */
export function meetsRequiredEvidenceLevel(
  obligation: ObligationState,
  context: EvidenceContext,
): boolean {
  if (hasBlockingEvidenceIssue(obligation.id, context.evidenceLinks)) {
    return false;
  }
  const achieved = achievedEvidenceLevel(context, obligation.id);
  if (achieved === null) {
    return false;
  }
  return evidenceLevelRank(achieved) >= evidenceLevelRank(obligation.requiredEvidenceLevel);
}

/**
 * Pure transform marking one `EvidenceLink` stale. Does not mutate its
 * input; returns a new record.
 *
 * Judgment call: `EvidenceLinkSchema` (packages/contracts/src/case.ts) has no
 * field to persist a staleness reason on the record itself (`.strict()`
 * rejects unknown keys, and `dispositionReason` is documented as the reason
 * for a human `disposition` change, not for staleness). `reason` is
 * therefore accepted and validated here -- so a caller cannot silently mark
 * something stale for no reason -- but is not embedded in the returned
 * `EvidenceLink`; the caller is expected to use it to build the
 * corresponding `evidence.conflicted` / `obligation.updated`
 * `PublicActivityEvent.summary` (architecture.md) separately.
 */
export function markStale(evidenceLink: EvidenceLink, reason: string, clock: Clock): EvidenceLink {
  if (reason.trim().length === 0) {
    throw new Error('markStale: reason must not be empty');
  }
  return {
    ...evidenceLink,
    stale: true,
    updatedAt: clock.now(),
  };
}

export type StalenessTriggerKind = 'attribute' | 'criterion' | 'source';

/** A changed fact (`attribute`), `criterion`, or `source` that may have invalidated downstream evidence. */
export interface StalenessTrigger {
  kind: StalenessTriggerKind;
  id: string;
}

export interface StalenessImpact {
  /** IDs of `EvidenceLink`s that should be marked stale (via `markStale`) as a result of this trigger. */
  staleEvidenceLinkIds: string[];
  /** IDs of obligations whose evidence is affected, directly or transitively through `dependsOn`. */
  invalidatedObligationIds: string[];
}

/** The minimal criterion projection this module needs: `id` and `appliesToAttribute`. */
export interface StalenessCriterion {
  id: string;
  appliesToAttribute?: string;
}

export interface StalenessContext {
  criteria: readonly StalenessCriterion[];
  obligations: readonly ObligationState[];
  evidenceLinks: readonly EvidenceLink[];
  claims: readonly Claim[];
}

/**
 * Data-driven staleness/dependency-invalidation propagation
 * (docs/specs/testing.md: "custom-criterion obligation derivation and
 * dependency invalidation"). Walks only the explicit schema-level references
 * available on `@sift/contracts` types -- never a hardcoded per-obligation
 * table:
 *
 * - `source` trigger: every `EvidenceLink.sourceId` match, and every `Claim`
 *   citing that source ID in `sourceIds`, is affected.
 * - `criterion` trigger: every `ObligationState.criterionId` match is
 *   affected (only `case_extension`-origin obligations carry this field).
 * - `attribute` trigger: resolved to the criteria whose
 *   `appliesToAttribute` names it, then handled as those criteria's
 *   `criterion` triggers.
 * - Every `EvidenceLink` owned by an affected obligation is marked stale.
 * - Transitive closure over `ObligationState.dependsOn`: an obligation that
 *   depends on an already-invalidated obligation is invalidated too (its own
 *   conclusion may have relied on a dependency that is no longer certain),
 *   and its evidence links go stale as well. This is intentionally
 *   conservative -- docs/engineering-principles.md requires the deterministic core to fail closed
 *   -- rather than trying to guess which of a dependent obligation's own
 *   evidence links are still safe to keep.
 */
export function findStalenessImpact(
  trigger: StalenessTrigger,
  context: StalenessContext,
): StalenessImpact {
  const staleLinkIds = new Set<string>();
  const invalidatedObligationIds = new Set<string>();

  const triggeredCriterionIds = new Set<string>();
  if (trigger.kind === 'criterion') {
    triggeredCriterionIds.add(trigger.id);
  } else if (trigger.kind === 'attribute') {
    for (const criterion of context.criteria) {
      if (criterion.appliesToAttribute === trigger.id) {
        triggeredCriterionIds.add(criterion.id);
      }
    }
  }

  for (const obligation of context.obligations) {
    if (obligation.criterionId !== undefined && triggeredCriterionIds.has(obligation.criterionId)) {
      invalidatedObligationIds.add(obligation.id);
    }
  }

  if (trigger.kind === 'source') {
    for (const link of context.evidenceLinks) {
      if (link.sourceId === trigger.id) {
        staleLinkIds.add(link.id);
        invalidatedObligationIds.add(link.obligationId);
      }
    }
    for (const claim of context.claims) {
      if (claim.sourceIds.includes(trigger.id)) {
        invalidatedObligationIds.add(claim.obligationId);
        for (const link of context.evidenceLinks) {
          if (link.claimId === claim.id) {
            staleLinkIds.add(link.id);
          }
        }
      }
    }
  }

  let grew = true;
  while (grew) {
    grew = false;

    for (const link of context.evidenceLinks) {
      if (invalidatedObligationIds.has(link.obligationId) && !staleLinkIds.has(link.id)) {
        staleLinkIds.add(link.id);
      }
    }

    for (const obligation of context.obligations) {
      if (invalidatedObligationIds.has(obligation.id)) {
        continue;
      }
      if (obligation.dependsOn.some((depId) => invalidatedObligationIds.has(depId))) {
        invalidatedObligationIds.add(obligation.id);
        grew = true;
      }
    }
  }

  return {
    staleEvidenceLinkIds: [...staleLinkIds].sort(),
    invalidatedObligationIds: [...invalidatedObligationIds].sort(),
  };
}
