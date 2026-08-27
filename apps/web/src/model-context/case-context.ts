/**
 * Read-side projections for the two global WebMCP read tools
 * (`pax_get_case_context`, `pax_list_packs`; docs/specs/webmcp.md "Tool
 * catalog"). Kept out of `register-pax-tools.ts` so the projection logic --
 * which fields a case context summary carries, which it must omit -- is
 * separately readable from the registration/dispatch plumbing.
 *
 * `pax_get_case_context`'s effect text (webmcp.md) lists exactly what it
 * returns: "the active case summary, selected pack ID/version/hash,
 * pack-defined and case-defined criteria/attributes, options, readiness
 * counts, current focus, selected option/evidence, recommendation, active
 * run correlation, and pending human action. It omits private model
 * messages and oversized source bodies." `buildCaseContextSummary` below
 * projects `CaseState` to exactly that field list -- deliberately omitting
 * `sources`, `claims`, `evidenceLinks`, and `caseExtensions` (none of which
 * appear in that list; `sources` in particular can carry up-to-5000-
 * character excerpts, matching the "oversized source bodies" exclusion).
 * `CaseState` has no field literally named "private model messages" --
 * those live in the runtime/telemetry event log the Runtime Inspector
 * covers (docs/specs/debugging-and-observability.md), never in `CaseState`,
 * so omitting anything outside this projection's explicit allowlist already
 * satisfies that half of the sentence structurally.
 */
import {
  OBLIGATION_STATUSES,
  type ActiveFocus,
  type AttributeDefinition,
  type CaseState,
  type CompiledDecisionPack,
  type Criterion,
  type EntityRecord,
  type ObligationStatus,
  type PackActivation,
  type Recommendation,
} from '@pax/contracts';

export type ReadinessCounts = Record<ObligationStatus, number> & { total: number };

export interface PendingHumanAction {
  kind: 'review_proposal';
  proposalId: string;
}

export interface CaseContextSummary {
  caseId: string;
  title: string;
  status: CaseState['status'];
  pack: { id: string; version: string; compiledHash: string };
  criteria: Criterion[];
  attributeDefinitions: AttributeDefinition[];
  options: EntityRecord[];
  readiness: ReadinessCounts;
  activeFocus: ActiveFocus | null;
  selectedOptionId: string | null;
  selectedEvidenceId: string | null;
  recommendation: Recommendation | null;
  activeRun: { runId: string } | null;
  pendingHumanAction: PendingHumanAction | null;
  eventSequence: number;
}

function countObligationsByStatus(obligations: CaseState['obligations']): ReadinessCounts {
  const counts = Object.fromEntries(OBLIGATION_STATUSES.map((status) => [status, 0])) as Record<
    ObligationStatus,
    number
  >;
  for (const obligation of obligations) {
    counts[obligation.status] += 1;
  }
  return { ...counts, total: obligations.length };
}

/** Projects full canonical `CaseState` down to exactly the fields `pax_get_case_context` is specified to return. */
export function buildCaseContextSummary(caseState: CaseState): CaseContextSummary {
  return {
    caseId: caseState.id,
    title: caseState.title,
    status: caseState.status,
    pack: {
      id: caseState.pack.id,
      version: caseState.pack.version,
      compiledHash: caseState.pack.compiledHash,
    },
    criteria: caseState.criteria,
    attributeDefinitions: caseState.attributeDefinitions,
    options: caseState.entities,
    readiness: countObligationsByStatus(caseState.obligations),
    activeFocus: caseState.activeFocus,
    selectedOptionId: caseState.selectedOptionId,
    selectedEvidenceId: caseState.selectedEvidenceId,
    recommendation: caseState.recommendation,
    activeRun: caseState.activeFocus?.runId ? { runId: caseState.activeFocus.runId } : null,
    pendingHumanAction:
      caseState.proposal !== null && caseState.proposal.status === 'pending'
        ? { kind: 'review_proposal', proposalId: caseState.proposal.id }
        : null,
    eventSequence: caseState.eventSequence,
  };
}

export interface PackSummary {
  packId: string;
  version: string;
  name: string;
  description: string;
  compiledHash: string;
  activation: PackActivation;
}

/** Projects a full `CompiledDecisionPack` manifest down to `pax_list_packs`'s specified return shape: "descriptions, versions, hashes, and activation signals." */
export function buildPackSummary(pack: CompiledDecisionPack): PackSummary {
  return {
    packId: pack.identity.id,
    version: pack.identity.version,
    name: pack.identity.name,
    description: pack.identity.description,
    compiledHash: pack.compiledHash,
    activation: pack.activation,
  };
}
