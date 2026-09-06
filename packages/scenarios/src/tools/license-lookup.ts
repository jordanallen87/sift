/**
 * Fixture tool: "license lookup"
 * (docs/bid-comparison/plan.md "Specialists and skills": `credential-checker`
 * tool `license-lookup`, obligation `bid.credential_verification` --
 * "licence covers this work, insurance active, named insured matches").
 *
 * Given a licence number, returns whether the licence is active, whether
 * its class covers this trade's scope, whether the certificate of
 * insurance is active, and -- kept as its own distinct, checkable finding
 * rather than folded silently into one summary sentence -- whether the
 * certificate's named insured actually matches the licence holder.
 *
 * Two Rivers Mechanical's bid is the deliberate case this last check exists
 * to catch: licence active, class covers scope, insurance active, but the
 * certificate names "TRM Holdings LLC", not the licence holder "Two Rivers
 * Mechanical Inc". A tool that only reported an overall "credentials OK/not
 * OK" boolean could bury that one discrepancy inside an otherwise-clean
 * result; `namedInsuredMatch`-adjacent facts are surfaced as their own
 * evidence item so a human sees exactly which check failed and why.
 *
 * Evidence-level assignment rule: every fact here comes from one traceable
 * document -- `license-registry.json`, this fictional state's licensing
 * registry -- so each finding is tagged `E1` ("one traceable source",
 * packs-and-routing.md's evidence-level table), the same per-source rule as
 * `tariff-lookup.ts`.
 *
 * The real fixture's three entries are all `status: 'active'` with active
 * insurance, so the "licence not active" / "insurance not active" branches
 * below have no reachable case against the checked-in registry; they are
 * exercised via `fixtureBaseDir` (see `CalculateEnergyAnalysisInput` in
 * `energy-calculator.ts` for the established rationale for this test seam)
 * rather than left as untested dead code.
 */
import {
  loadFixture,
  type LicenseRegistryEntry,
  type LoadFixtureOptions,
} from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const LICENSE_LOOKUP_TOOL_ID = 'license-lookup';

const ACTIVE_STATUS = 'active';

export interface LicenseInsuranceFacts {
  status: string;
  isActive: boolean;
  namedInsured: string;
  matchesLicenseHolder: boolean;
}

export interface LicenseLookupFacts {
  licenseNumber: string;
  licenseHolderName: string;
  status: string;
  isActive: boolean;
  classCoversScope: boolean;
  class: string;
  insurance: LicenseInsuranceFacts;
}

export interface LicenseLookupResult {
  license: LicenseLookupFacts;
  evidence: ToolEvidenceItem[];
}

export interface LicenseLookupInput extends LoadFixtureOptions {
  licenseNumber: string;
  signal?: AbortSignal;
}

function licenseSourceId(licenseNumber: string): string {
  return `source-license-registry-${licenseNumber}`;
}

function toFacts(entry: LicenseRegistryEntry): LicenseLookupFacts {
  return {
    licenseNumber: entry.licenseNumber,
    licenseHolderName: entry.licenseHolderName,
    status: entry.status,
    isActive: entry.status === ACTIVE_STATUS,
    classCoversScope: entry.classCoversScope,
    class: entry.class,
    insurance: {
      status: entry.insurance.status,
      isActive: entry.insurance.status === ACTIVE_STATUS,
      namedInsured: entry.insurance.namedInsured,
      matchesLicenseHolder: entry.insurance.matchesLicenseHolder,
    },
  };
}

function buildEvidence(facts: LicenseLookupFacts): ToolEvidenceItem[] {
  const sourceId = licenseSourceId(facts.licenseNumber);
  const standingGood = facts.isActive && facts.classCoversScope && facts.insurance.isActive;

  const standingEvidence: ToolEvidenceItem = {
    sourceId,
    level: 'E1',
    verdict: standingGood ? 'pass' : 'degraded',
    summary: `${facts.licenseHolderName} (${facts.licenseNumber}): licence ${facts.status}, ${facts.class} ${facts.classCoversScope ? 'covers' : 'does not cover'} this scope, insurance ${facts.insurance.status}.`,
  };

  const namedInsuredEvidence: ToolEvidenceItem = {
    sourceId: `${sourceId}-named-insured`,
    level: 'E1',
    verdict: facts.insurance.matchesLicenseHolder ? 'pass' : 'degraded',
    summary: facts.insurance.matchesLicenseHolder
      ? `Certificate of insurance names "${facts.insurance.namedInsured}", matching the licence holder "${facts.licenseHolderName}".`
      : `Certificate of insurance names "${facts.insurance.namedInsured}", which does not match the licence holder "${facts.licenseHolderName}" -- needs a human answer before this bid's credentials can be marked verified.`,
  };

  return [standingEvidence, namedInsuredEvidence];
}

export function lookupLicense(input: LicenseLookupInput): ToolResult<LicenseLookupResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(LICENSE_LOOKUP_TOOL_ID);
  }

  const { licenseNumber, signal: _signal, ...loadOptions } = input;
  const registry = loadFixture('license-registry', loadOptions);
  const entry = registry.entries.find((candidate) => candidate.licenseNumber === licenseNumber);

  if (isAborted(input.signal)) {
    return cancelledResult(LICENSE_LOOKUP_TOOL_ID);
  }

  if (!entry) {
    return notFoundResult(
      LICENSE_LOOKUP_TOOL_ID,
      licenseNumber,
      `no license-registry entry found for licenseNumber "${licenseNumber}"`,
    );
  }

  const facts = toFacts(entry);
  return okResult(LICENSE_LOOKUP_TOOL_ID, { license: facts, evidence: buildEvidence(facts) });
}
