/**
 * Fixture tool: "ownership calculator"
 * (docs/specs/packs-and-routing.md "Choose Our Next Car Decision Pack" ->
 * "Skills, specialists, and tools").
 *
 * Given a candidate id, computes a comparable 5-year ownership estimate,
 * itemized into fuel, maintenance, insurance, depreciation, and financing
 * components (showing its work, not just a total) rather than copying the
 * fixture's own precomputed `estimatedFiveYearFuelCost`/
 * `estimatedFiveYearMaintenanceCost` figures verbatim.
 *
 * Judgment call: `ownership-assumptions.json`'s own top-level note says its
 * rate/percentage assumptions "are held constant across all four candidates
 * so the resulting 5-year ownership estimates are comparable apples-to-
 * apples ... separate from the actual per-candidate dealer financing offers
 * recorded in dealer-offers.json" -- and the obligation this feeds,
 * `car.ownership_cost`, literally asks "What is the comparable five-year
 * ownership estimate under the *same assumptions*?" (packs-and-routing.md,
 * emphasis added). This calculator therefore always finances with the
 * shared `financingBaseline` (apr/termMonths), never a candidate's own
 * negotiated dealer APR/term -- using each candidate's real, differing
 * dealer terms here would silently reintroduce the exact apples-to-oranges
 * comparison problem the fixture's own assumptions note exists to prevent.
 * The one figure this tool does pull from `dealer-offers.json` is the
 * candidate's `trueOutTheDoorPrice` (never the misleading advertised price),
 * because the depreciation methodology is explicitly "straight-line against
 * true out-the-door price" and financing necessarily needs a principal to
 * amortize -- neither figure exists in `ownership-assumptions.json` alone.
 */
import { loadFixture, type PerCandidateOwnership } from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  notFoundResult,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const OWNERSHIP_CALCULATOR_TOOL_ID = 'ownership-calculator';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Standard fixed-rate amortization: monthly payment for `principal`
 * financed at annual rate `apr` over `termMonths`, and the resulting total
 * interest paid across the full term. Handles `apr === 0` separately to
 * avoid dividing by zero in the standard formula's denominator.
 *
 * Pure and exported so every branch (zero-rate and standard-rate) is
 * directly unit-testable without needing a fixture candidate whose
 * `financingBaseline.apr` happens to be zero.
 */
export function computeAmortizedFinancing(
  principal: number,
  apr: number,
  termMonths: number,
): { monthlyPayment: number; totalPaid: number; totalInterest: number } {
  const monthlyRate = apr / 12;
  const monthlyPayment =
    monthlyRate === 0
      ? principal / termMonths
      : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
  const totalPaid = monthlyPayment * termMonths;
  const totalInterest = totalPaid - principal;
  return {
    monthlyPayment: round2(monthlyPayment),
    totalPaid: round2(totalPaid),
    totalInterest: round2(totalInterest),
  };
}

export interface FuelComponent {
  amount: number;
  combinedMpg: number;
  totalMiles: number;
  pricePerGallon: number;
  gallonsUsed: number;
}

export interface MaintenanceComponent {
  amount: number;
  costPerMile: number;
  totalMiles: number;
  powertrainClass: PerCandidateOwnership['powertrainClassForMaintenance'];
}

export interface InsuranceComponent {
  amount: number;
  annualPremium: number;
  years: number;
}

export interface DepreciationComponent {
  amount: number;
  basisPrice: number;
  retainedValuePercent: number;
}

export interface FinancingComponent {
  amount: number;
  principal: number;
  apr: number;
  termMonths: number;
  monthlyPayment: number;
  totalPaid: number;
}

export interface OwnershipCostComponents {
  fuel: FuelComponent;
  maintenance: MaintenanceComponent;
  insurance: InsuranceComponent;
  depreciation: DepreciationComponent;
  financing: FinancingComponent;
}

export interface OwnershipCostResult {
  candidateId: string;
  ownershipHorizonYears: number;
  currency: string;
  components: OwnershipCostComponents;
  totalFiveYearCost: number;
  evidence: ToolEvidenceItem[];
}

export interface OwnershipCalculatorInput {
  candidateId: string;
  signal?: AbortSignal;
}

function ownershipCalculatorSourceId(candidateId: string): string {
  return `source-ownership-calculator-${candidateId}`;
}

export function calculateOwnershipCost(
  input: OwnershipCalculatorInput,
): ToolResult<OwnershipCostResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(OWNERSHIP_CALCULATOR_TOOL_ID);
  }

  const assumptions = loadFixture('ownership-assumptions');
  const perCandidate = assumptions.perCandidate[input.candidateId];

  if (isAborted(input.signal)) {
    return cancelledResult(OWNERSHIP_CALCULATOR_TOOL_ID);
  }

  const offers = loadFixture('dealer-offers');
  const offer = offers.offers.find((entry) => entry.candidateId === input.candidateId);

  if (!perCandidate || !offer) {
    return notFoundResult(
      OWNERSHIP_CALCULATOR_TOOL_ID,
      input.candidateId,
      `no ownership assumptions or dealer offer found for candidate "${input.candidateId}"`,
    );
  }

  const { ownershipHorizonYears, annualMileageMi, fuel, maintenance, financingBaseline } =
    assumptions.sharedAssumptions;
  const currency = perCandidate.annualInsurancePremium.currency;
  const totalMiles = annualMileageMi * ownershipHorizonYears;

  const gallonsUsed = totalMiles / perCandidate.fuelEconomyMpg.combined;
  const fuelAmount = round2(gallonsUsed * fuel.regularUnleadedPricePerGallon.amount);
  const fuelComponent: FuelComponent = {
    amount: fuelAmount,
    combinedMpg: perCandidate.fuelEconomyMpg.combined,
    totalMiles,
    pricePerGallon: fuel.regularUnleadedPricePerGallon.amount,
    gallonsUsed: round2(gallonsUsed),
  };

  const costPerMile =
    perCandidate.powertrainClassForMaintenance === 'hybrid'
      ? maintenance.hybridPowertrainCostPerMi.amount
      : maintenance.gasolinePowertrainCostPerMi.amount;
  const maintenanceComponent: MaintenanceComponent = {
    amount: round2(costPerMile * totalMiles),
    costPerMile,
    totalMiles,
    powertrainClass: perCandidate.powertrainClassForMaintenance,
  };

  const insuranceComponent: InsuranceComponent = {
    amount: round2(perCandidate.annualInsurancePremium.amount * ownershipHorizonYears),
    annualPremium: perCandidate.annualInsurancePremium.amount,
    years: ownershipHorizonYears,
  };

  const basisPrice = offer.priceBreakdown.trueOutTheDoorPrice;
  const depreciationComponent: DepreciationComponent = {
    amount: round2(basisPrice * (1 - perCandidate.fiveYearRetainedValuePercent / 100)),
    basisPrice,
    retainedValuePercent: perCandidate.fiveYearRetainedValuePercent,
  };

  const financingPrincipal = basisPrice - offer.downPaymentAssumed.amount;
  const amortized = computeAmortizedFinancing(
    financingPrincipal,
    financingBaseline.apr,
    financingBaseline.termMonths,
  );
  const financingComponent: FinancingComponent = {
    amount: amortized.totalInterest,
    principal: round2(financingPrincipal),
    apr: financingBaseline.apr,
    termMonths: financingBaseline.termMonths,
    monthlyPayment: amortized.monthlyPayment,
    totalPaid: amortized.totalPaid,
  };

  const totalFiveYearCost = round2(
    fuelComponent.amount +
      maintenanceComponent.amount +
      insuranceComponent.amount +
      depreciationComponent.amount +
      financingComponent.amount,
  );

  const evidence: ToolEvidenceItem[] = [
    {
      sourceId: ownershipCalculatorSourceId(input.candidateId),
      // "verified by a domain-specific deterministic check" -- E3
      // (packs-and-routing.md's evidence-level table) -- because this value
      // is not extracted from a single document but computed by this tool's
      // own reproducible arithmetic over fixture inputs.
      level: 'E3',
      verdict: 'pass',
      summary: `5-year ownership estimate for ${input.candidateId}: $${totalFiveYearCost.toFixed(2)} (fuel $${fuelComponent.amount.toFixed(2)} + maintenance $${maintenanceComponent.amount.toFixed(2)} + insurance $${insuranceComponent.amount.toFixed(2)} + depreciation $${depreciationComponent.amount.toFixed(2)} + financing $${financingComponent.amount.toFixed(2)}).`,
    },
  ];

  return okResult(OWNERSHIP_CALCULATOR_TOOL_ID, {
    candidateId: input.candidateId,
    ownershipHorizonYears,
    currency,
    components: {
      fuel: fuelComponent,
      maintenance: maintenanceComponent,
      insurance: insuranceComponent,
      depreciation: depreciationComponent,
      financing: financingComponent,
    },
    totalFiveYearCost,
    evidence,
  });
}
