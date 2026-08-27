/**
 * Fixture tool: "fixture bill reader"
 * (docs/specs/packs-and-routing.md "Home Energy Guardian Decision Pack" ->
 * "Skills, specialists, and tools").
 *
 * Returns the household's current utility bill facts from
 * `current-bill.json`: billing period, tariff, usage, itemized charges, the
 * normalized baseline (methodology.md explicitly explains how it was
 * computed and by what), and the fixture's own already-flagged anomaly
 * figures (`percentAboveBaseline`, `usageGapAboveBaselineKwh`).
 *
 * This tool intentionally passes the bill's `anomaly` block through as-is
 * (unlike `energy-calculator.ts`, which independently recomputes the
 * anomaly determination from `currentAmount`/`baseline.amount` for its own
 * E3 "verified by a domain-specific deterministic check" evidence). Reading
 * the bill and *verifying* the bill are different obligations: `energy.
 * anomaly` (packs-and-routing.md) requires E3, which a single-document read
 * cannot itself produce -- see the evidence-level table's "E1: one
 * traceable source or deterministic extraction" versus "E3: verified by a
 * domain-specific deterministic check". This tool supplies the raw,
 * traceable E1 fact; `energy-calculator.ts` supplies the deterministic
 * check that corroborates it.
 *
 * There is only one household/bill in this fixture (unlike the car-purchase
 * pack's multi-candidate tools), so this tool takes no lookup key and has
 * no reachable `not_found` branch -- there is nothing to look up by id.
 */
import { loadFixture, type CurrentBill } from './fixture-loader.js';
import {
  cancelledResult,
  isAborted,
  okResult,
  type ToolEvidenceItem,
  type ToolResult,
} from './tool-result.js';

export const BILL_READER_TOOL_ID = 'bill-reader';

export interface MoneyAmount {
  amount: number;
  currency: string;
}

export interface CostWithArithmeticNote extends MoneyAmount {
  // `| undefined`, not just optional, so a direct spread of the fixture's
  // own Zod-inferred `arithmeticNote?: string | undefined` field type-checks
  // cleanly under this package's `exactOptionalPropertyTypes: true`.
  arithmeticNote?: string | undefined;
}

export interface UsageAmount {
  value: number;
  unit: string;
}

export interface CurrentBillCharges {
  fixedMonthlyCustomerCharge: MoneyAmount;
  volumetricCharge: CostWithArithmeticNote;
  totalAmount: CostWithArithmeticNote;
}

export interface CurrentBillBaseline {
  amount: MoneyAmount;
  usage: UsageAmount;
  methodology: string;
  computedBy: string;
}

export interface CurrentBillAnomaly {
  percentAboveBaseline: number;
  arithmeticNote: string;
  usageGapAboveBaselineKwh: number;
  usageGapArithmeticNote: string;
  flaggedAt: string;
  flaggedBy: string;
}

export interface CurrentBillResult {
  householdId: string;
  displayName: string;
  billingPeriod: { start: string; end: string; days: number };
  tariffId: string;
  usage: UsageAmount;
  charges: CurrentBillCharges;
  currentAmount: MoneyAmount;
  baseline: CurrentBillBaseline;
  anomaly: CurrentBillAnomaly;
  evidence: ToolEvidenceItem[];
}

export interface BillReaderInput {
  signal?: AbortSignal;
}

function billSourceId(householdId: string): string {
  return `source-current-bill-${householdId}`;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildEvidence(bill: CurrentBill): ToolEvidenceItem[] {
  return [
    {
      sourceId: billSourceId(bill.householdId),
      level: 'E1',
      verdict: 'pass',
      summary: `Current bill for ${bill.billingPeriod.start} to ${bill.billingPeriod.end}: $${formatCurrency(bill.currentAmount.amount)} for ${bill.usage.value} ${bill.usage.unit} under ${bill.tariffId}, ${bill.anomaly.percentAboveBaseline}% above the normalized baseline of $${formatCurrency(bill.baseline.amount.amount)}.`,
    },
  ];
}

function toResult(bill: CurrentBill): CurrentBillResult {
  return {
    householdId: bill.householdId,
    displayName: bill.displayName,
    billingPeriod: { ...bill.billingPeriod },
    tariffId: bill.tariffId,
    usage: { ...bill.usage },
    charges: {
      fixedMonthlyCustomerCharge: { ...bill.charges.fixedMonthlyCustomerCharge },
      volumetricCharge: { ...bill.charges.volumetricCharge },
      totalAmount: { ...bill.charges.totalAmount },
    },
    currentAmount: { ...bill.currentAmount },
    baseline: {
      amount: { ...bill.baseline.amount },
      usage: { ...bill.baseline.usage },
      methodology: bill.baseline.methodology,
      computedBy: bill.baseline.computedBy,
    },
    anomaly: { ...bill.anomaly },
    evidence: buildEvidence(bill),
  };
}

export function readCurrentBill(input: BillReaderInput = {}): ToolResult<CurrentBillResult> {
  if (isAborted(input.signal)) {
    return cancelledResult(BILL_READER_TOOL_ID);
  }

  const bill = loadFixture('current-bill');

  if (isAborted(input.signal)) {
    return cancelledResult(BILL_READER_TOOL_ID);
  }

  return okResult(BILL_READER_TOOL_ID, toResult(bill));
}
